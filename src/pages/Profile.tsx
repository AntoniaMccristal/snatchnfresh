import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Camera,
  ChevronDown,
  ChevronUp,
  Heart,
  LogOut,
  MapPin,
  Settings,
  Shirt,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getItemImageUrl } from "@/lib/images";
import { uploadAvatar } from "@/lib/avatarUpload";
import { usePageRefresh } from "@/hooks/usePageRefresh";

type ProfileSection = "wardrobe" | "snatches" | "likes";

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function getBookingStatusLabel(value?: string) {
  const status = String(value || "").toLowerCase();
  if (status === "pending") return "Pending approval";
  if (status === "approved") return "Approved";
  if (status === "paid") return "Payment received";
  if (status === "rejected") return "Declined";
  if (status === "cancelled") return "Cancelled";
  if (status === "completed") return "Completed";
  if (!status) return "Pending approval";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusColor(value?: string) {
  const status = String(value || "").toLowerCase();
  if (status === "approved" || status === "completed" || status === "paid") {
    return "bg-green-100 text-green-800";
  }
  if (status === "rejected" || status === "cancelled") {
    return "bg-red-100 text-red-800";
  }
  return "bg-amber-100 text-amber-800";
}

const RATEABLE_STATUSES = new Set(["approved", "paid", "completed", "returned"]);

export default function Profile() {
  const navigate = useNavigate();
  const hasLoadedOnceRef = useRef(false);
  const loadRequestIdRef = useRef(0);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<ProfileSection>("wardrobe");
  const [showSettings, setShowSettings] = useState(false);

  const [myWardrobe, setMyWardrobe] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [ownerBookings, setOwnerBookings] = useState<any[]>([]);
  const [mySnatches, setMySnatches] = useState<any[]>([]);
  const [likedItems, setLikedItems] = useState<any[]>([]);
  const [likesEnabled, setLikesEnabled] = useState(true);
  const [ratingsEnabled, setRatingsEnabled] = useState(true);
  const [receivedRatings, setReceivedRatings] = useState<any[]>([]);
  const [myRatingsByBooking, setMyRatingsByBooking] = useState<Record<string, number>>({});
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, number>>({});
  const [submittingBookingId, setSubmittingBookingId] = useState<string | null>(null);
  const [confirmingReturnBookingId, setConfirmingReturnBookingId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [updatingOwnerBookingId, setUpdatingOwnerBookingId] = useState<string | null>(null);
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaSetupFactorId, setMfaSetupFactorId] = useState<string | null>(null);
  const [mfaQrCode, setMfaQrCode] = useState<string>("");
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaStatusMessage, setMfaStatusMessage] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [stripeConnected, setStripeConnected] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [followsEnabled, setFollowsEnabled] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfile = useCallback(async () => {
    const requestId = Date.now();
    loadRequestIdRef.current = requestId;
    const isInitialLoad = !hasLoadedOnceRef.current;
    if (isInitialLoad) setLoading(true);
    else setRefreshing(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { navigate("/auth"); return; }

      const currentUser = userData.user;
      const userId = currentUser.id;
      if (loadRequestIdRef.current !== requestId) return;
      setUser(currentUser);

      const [
        profileResult, wardrobeByOwnerResult, wardrobeByUserResult,
        renterBookingsResult, likesResult, ratingsReceivedResult,
        myRatingsResult, followersResult, followingResult, mfaResult,
      ] = await Promise.all([
        supabase.from("profiles").select("avatar_url,stripe_account_id,stripe_connect_account_id").eq("id", userId).maybeSingle(),
        supabase.from("items").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("items").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("bookings").select("*").eq("renter_id", userId).order("created_at", { ascending: false }),
        supabase.from("likes").select("item_id").eq("user_id", userId),
        supabase.from("ratings").select("id,booking_id,rater_id,rated_user_id,rating,comment,created_at").eq("rated_user_id", userId).order("created_at", { ascending: false }),
        supabase.from("ratings").select("booking_id,rating").eq("rater_id", userId),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
        supabase.auth.mfa.listFactors(),
      ]);

      if (loadRequestIdRef.current !== requestId) return;

      const myProfileRow = profileResult.data;
      setProfileAvatarUrl(String(myProfileRow?.avatar_url || currentUser.user_metadata?.avatar_url || ""));
      setStripeConnected(Boolean(myProfileRow?.stripe_account_id || myProfileRow?.stripe_connect_account_id));

      const wardrobeByOwner = wardrobeByOwnerResult.data;
      const ownerQueryError = wardrobeByOwnerResult.error;
      const wardrobeByUser = wardrobeByUserResult.data;
      const userQueryError = wardrobeByUserResult.error;
      const ownerColumnMissing = ownerQueryError?.code === "42703" || ownerQueryError?.message?.toLowerCase().includes("owner_id");
      const userColumnMissing = userQueryError?.code === "42703" || userQueryError?.message?.toLowerCase().includes("user_id");
      if (ownerQueryError && !ownerColumnMissing) throw ownerQueryError;
      if (userQueryError && !userColumnMissing) throw userQueryError;

      const combined = [...(wardrobeByOwner || []), ...(wardrobeByUser || [])];
      const wardrobeItems = Array.from(new Map(combined.map((item) => [item.id, item])).values()).sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      if (loadRequestIdRef.current !== requestId) return;
      setMyWardrobe(wardrobeItems);

      const wardrobeItemIds = wardrobeItems.map((item) => item.id);
      if (wardrobeItemIds.length > 0) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const [ownerRequestsResponse, ownerRowsResult] = await Promise.all([
          token
            ? fetch("/api/owner-booking-requests", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({ requests: [] })))
            : Promise.resolve({ requests: [] as any[] }),
          supabase.from("bookings").select("*").in("item_id", wardrobeItemIds).in("status", ["approved", "paid", "completed"]).order("created_at", { ascending: false }),
        ]);
        if (loadRequestIdRef.current !== requestId) return;
        setIncomingRequests(Array.isArray(ownerRequestsResponse?.requests) ? ownerRequestsResponse.requests : []);
        const activeOwnerRows = ownerRowsResult.data || [];
        setOwnerBookings(activeOwnerRows);
        const trackingState: Record<string, string> = {};
        activeOwnerRows.forEach((row) => { trackingState[row.id] = row.tracking_number || ""; });
        setTrackingDrafts(trackingState);
      } else {
        setIncomingRequests([]);
        setOwnerBookings([]);
        setTrackingDrafts({});
      }

      const snatches = renterBookingsResult.data || [];
      if (snatches.length > 0) {
        const snatchItemIds = Array.from(new Set(snatches.map((b) => b.item_id)));
        const { data: snatchItems } = await supabase.from("items").select("*").in("id", snatchItemIds);
        const itemById = new Map((snatchItems || []).map((item) => [item.id, item]));
        setMySnatches(snatches.map((b) => ({ ...b, item: itemById.get(b.item_id) })));
      } else {
        setMySnatches([]);
      }

      const likeRows = likesResult.data;
      const likesError = likesResult.error;
      if (likesError) {
        const missingLikesTable = likesError.code === "42P01" || String(likesError.message || "").toLowerCase().includes("relation") || String(likesError.message || "").toLowerCase().includes("schema cache");
        if (missingLikesTable) { setLikesEnabled(false); setLikedItems([]); } else throw likesError;
      } else {
        setLikesEnabled(true);
        const likedIds = (likeRows || []).map((row) => row.item_id).filter(Boolean);
        if (likedIds.length > 0) {
          const { data: liked } = await supabase.from("items").select("*").in("id", likedIds).order("created_at", { ascending: false });
          setLikedItems(liked || []);
        } else { setLikedItems([]); }
      }

      const ratingsReceived = ratingsReceivedResult.data;
      const ratingsError = ratingsReceivedResult.error;
      if (ratingsError) {
        const missingRatingsTable = ratingsError.code === "42P01" || ratingsError.message?.toLowerCase().includes("relation");
        if (missingRatingsTable) { setRatingsEnabled(false); setReceivedRatings([]); setMyRatingsByBooking({}); setRatingDrafts({}); } else throw ratingsError;
      } else {
        setRatingsEnabled(true);
        setReceivedRatings(ratingsReceived || []);
        const byBooking: Record<string, number> = {};
        (myRatingsResult.data || []).forEach((row) => { if (row.booking_id && typeof row.rating === "number") byBooking[row.booking_id] = row.rating; });
        setMyRatingsByBooking(byBooking);
        setRatingDrafts(byBooking);
      }

      if (mfaResult.error) setMfaEnabled(false);
      else setMfaEnabled((mfaResult.data?.totp || []).length > 0);

      const followsMissing = followersResult.error?.code === "42P01" || followingResult.error?.code === "42P01" || String(followersResult.error?.message || "").toLowerCase().includes("relation") || String(followingResult.error?.message || "").toLowerCase().includes("relation");
      if (followsMissing) { setFollowsEnabled(false); setFollowersCount(0); setFollowingCount(0); }
      else { setFollowsEnabled(true); setFollowersCount(Number(followersResult.count || 0)); setFollowingCount(Number(followingResult.count || 0)); }

      hasLoadedOnceRef.current = true;
    } catch (error) {
      console.error("Profile load error", error);
    } finally {
      if (loadRequestIdRef.current === requestId) { setLoading(false); setRefreshing(false); }
    }
  }, [navigate]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);
  usePageRefresh(loadProfile, [loadProfile]);

  async function startMfaSetup() {
    setMfaBusy(true); setMfaStatusMessage("");
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Snatchn Authenticator" });
    if (error || !data?.id) { setMfaStatusMessage(error?.message || "Could not start two-step setup."); setMfaBusy(false); return; }
    setMfaSetupFactorId(data.id); setMfaQrCode((data as any)?.totp?.qr_code || ""); setMfaBusy(false);
  }

  async function verifyMfaSetup() {
    if (!mfaSetupFactorId) return;
    if (!mfaVerifyCode.trim()) { setMfaStatusMessage("Enter the code from your authenticator app."); return; }
    setMfaBusy(true); setMfaStatusMessage("");
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaSetupFactorId });
    if (challengeError || !challengeData?.id) { setMfaStatusMessage(challengeError?.message || "Could not create verification challenge."); setMfaBusy(false); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: mfaSetupFactorId, challengeId: challengeData.id, code: mfaVerifyCode.trim() });
    if (error) { setMfaStatusMessage(error.message || "Invalid verification code."); setMfaBusy(false); return; }
    setMfaEnabled(true); setMfaSetupFactorId(null); setMfaQrCode(""); setMfaVerifyCode(""); setMfaStatusMessage("Two-step verification enabled."); setMfaBusy(false);
  }

  async function disableMfa() {
    setMfaBusy(true); setMfaStatusMessage("");
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { setMfaStatusMessage(error.message || "Could not load MFA factors."); setMfaBusy(false); return; }
    const factor = (data?.totp || [])[0];
    if (!factor?.id) { setMfaEnabled(false); setMfaBusy(false); return; }
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (unenrollError) { setMfaStatusMessage(unenrollError.message || "Could not disable two-step verification."); setMfaBusy(false); return; }
    setMfaEnabled(false); setMfaSetupFactorId(null); setMfaQrCode(""); setMfaVerifyCode(""); setRecoveryCodes([]); setMfaStatusMessage("Two-step verification disabled."); setMfaBusy(false);
  }

  async function generateRecoveryCodes() {
    setMfaBusy(true); setMfaStatusMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { setMfaStatusMessage("Session expired. Please log in again."); setMfaBusy(false); return; }
      const response = await fetch("/api/mfa-recovery-codes", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not generate recovery codes.");
      setRecoveryCodes(payload?.codes || []); setMfaStatusMessage("New recovery codes generated. Save them now.");
    } catch (error: any) { setMfaStatusMessage(error?.message || "Could not generate recovery codes."); }
    finally { setMfaBusy(false); }
  }

  async function saveTracking(bookingId: string) {
    const trackingNumber = (trackingDrafts[bookingId] || "").trim();
    if (!trackingNumber) { alert("Please add a tracking number."); return; }
    setUpdatingOwnerBookingId(bookingId);
    const { error } = await supabase.from("bookings").update({ tracking_number: trackingNumber, tracking_status: "in_transit" }).eq("id", bookingId);
    setUpdatingOwnerBookingId(null);
    if (error) { alert(error.message || "Could not save tracking."); return; }
    loadProfile();
  }

  async function markDelivered(bookingId: string) {
    setUpdatingOwnerBookingId(bookingId);
    const { error } = await supabase.from("bookings").update({ tracking_status: "delivered", delivered_at: new Date().toISOString() }).eq("id", bookingId);
    setUpdatingOwnerBookingId(null);
    if (error) { alert(error.message || "Could not mark delivered."); return; }
    loadProfile();
  }

  async function markReturned(bookingId: string) {
    setUpdatingOwnerBookingId(bookingId);
    const { error } = await supabase.from("bookings").update({ item_returned_at: new Date().toISOString() }).eq("id", bookingId);
    setUpdatingOwnerBookingId(null);
    if (error) { alert(error.message || "Could not mark returned."); return; }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) await fetch("/api/release-payout", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ booking_id: bookingId }) });
    } catch (payoutError) { console.error("Auto payout release check failed", payoutError); }
    alert("Return marked. Payout release is handled automatically by Snatch'n.");
    loadProfile();
  }

  async function deleteWardrobeItem(itemId: string) {
    const confirmed = window.confirm("Delete this listing? This cannot be undone.");
    if (!confirmed) return;
    setDeletingItemId(itemId);
    const { error } = await supabase.from("items").delete().eq("id", itemId);
    if (error) { const message = String(error.message || ""); const maybeMfaRequired = message.toLowerCase().includes("row-level security") || message.toLowerCase().includes("permission denied"); if (maybeMfaRequired && mfaEnabled) { alert("Please complete two-step verification again before deleting listings."); navigate("/auth/mfa"); setDeletingItemId(null); return; } alert(error.message || "Unable to delete listing."); setDeletingItemId(null); return; }
    setMyWardrobe((prev) => prev.filter((item) => item.id !== itemId));
    setIncomingRequests((prev) => prev.filter((b) => b.item_id !== itemId));
    setDeletingItemId(null);
  }

  async function updateAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image file."); event.target.value = ""; return; }
    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) { alert("Image is too large. Please use a file under 12MB."); event.target.value = ""; return; }
    function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
      return Promise.race([promise, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms))]);
    }
    setUploadingAvatar(true);
    try {
      const avatarUrl = await withTimeout(uploadAvatar(user.id, file), 30000, "Avatar upload");
      const { error: authError } = await withTimeout(supabase.auth.updateUser({ data: { avatar_url: avatarUrl } }), 15000, "Profile metadata update");
      if (authError) throw new Error(authError.message || "Unable to update profile image.");
      let profilePayload: any = { id: user.id, avatar_url: avatarUrl, updated_at: new Date().toISOString() };
      for (let i = 0; i < 5; i += 1) {
        const result = await withTimeout(supabase.from("profiles").upsert(profilePayload, { onConflict: "id" }), 15000, "Profile row update");
        if (!result.error) break;
        const message = String(result.error.message || "");
        const missingColumn = result.error.code === "42703" || result.error.code === "PGRST204" || message.toLowerCase().includes("column");
        if (!missingColumn) throw new Error(result.error.message || "Unable to update profile image.");
        const match = message.match(/['"]([a-zA-Z0-9_]+)['"]/);
        const col = match?.[1];
        if (!col || !(col in profilePayload)) break;
        delete profilePayload[col];
      }
      setProfileAvatarUrl(avatarUrl);
      loadProfile();
    } catch (error: any) { alert(error?.message || "Unable to upload profile image."); }
    finally { setUploadingAvatar(false); event.target.value = ""; }
  }

  async function submitRating(booking: any) {
    if (!ratingsEnabled || !user) return;
    const selectedRating = ratingDrafts[booking.id];
    if (!selectedRating || selectedRating < 1 || selectedRating > 5) { alert("Please choose a rating between 1 and 5 stars."); return; }
    const ratedUserId = booking.owner_id;
    if (!ratedUserId) { alert("This booking is missing owner information."); return; }
    setSubmittingBookingId(booking.id);
    try {
      const existing = myRatingsByBooking[booking.id];
      if (existing) { const { error } = await supabase.from("ratings").update({ rating: selectedRating }).eq("booking_id", booking.id).eq("rater_id", user.id); if (error) throw error; }
      else { const { error } = await supabase.from("ratings").insert({ booking_id: booking.id, item_id: booking.item_id, rater_id: user.id, rated_user_id: ratedUserId, rating: selectedRating }); if (error) throw error; }
      setMyRatingsByBooking((prev) => ({ ...prev, [booking.id]: selectedRating }));
      loadProfile();
    } catch (error: any) {
      const missingRatingsTable = error?.code === "42P01" || error?.message?.toLowerCase?.().includes("relation");
      if (missingRatingsTable) { setRatingsEnabled(false); alert("Ratings are not configured yet in the database."); }
      else alert(error?.message || "Unable to submit rating.");
    } finally { setSubmittingBookingId(null); }
  }

  async function confirmReturnReceivedInGoodCondition(bookingId: string) {
    if (!user?.id) return;
    setConfirmingReturnBookingId(bookingId);
    try {
      const { error: updateError } = await supabase.from("bookings").update({ item_returned_at: new Date().toISOString() }).eq("id", bookingId).eq("renter_id", user.id);
      if (updateError) throw updateError;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { alert("Return confirmed. Please log in again for payout checks."); loadProfile(); return; }
      const response = await fetch("/api/release-payout", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ booking_id: bookingId }) });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) alert("Return confirmed. Payout checks passed and release started.");
      else if (response.status === 409) alert(`Return confirmed. Payout is still on hold: ${payload?.reason || "conditions not met yet."}`);
      else alert(payload?.error || "Return confirmed. Payout check will run automatically.");
      loadProfile();
    } catch (error: any) { alert(error?.message || "Could not confirm return."); }
    finally { setConfirmingReturnBookingId(null); }
  }

  async function logout() { await supabase.auth.signOut(); navigate("/auth", { replace: true }); }

  async function connectStripePayouts() {
    try {
      setConnectingStripe(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { navigate("/auth"); return; }
      const response = await fetch("/api/create-connect-onboarding-link", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok || !payload?.url) throw new Error(payload?.error || "Could not open Stripe onboarding.");
      window.location.assign(payload.url);
    } catch (error: any) { alert(error?.message || "Could not start Stripe onboarding."); setConnectingStripe(false); }
  }

  async function updateIncomingRequest(bookingId: string, status: "approved" | "rejected") {
    setUpdatingOwnerBookingId(bookingId);
    const { error } = await supabase.from("bookings").update({ status }).eq("id", bookingId);
    setUpdatingOwnerBookingId(null);
    if (error) { alert(error.message || "Could not update booking request."); return; }
    loadProfile();
  }

  const approvedTripsCount = useMemo(() => mySnatches.filter((b) => String(b.status || "").toLowerCase() === "approved").length, [mySnatches]);

  const ratingSummary = useMemo(() => {
    if (receivedRatings.length === 0) return { average: 0, count: 0 };
    const sum = receivedRatings.reduce((acc, row) => acc + Number(row.rating || 0), 0);
    return { average: Number((sum / receivedRatings.length).toFixed(1)), count: receivedRatings.length };
  }, [receivedRatings]);

  const renderBust = useMemo(() => Date.now(), []);
  function withImageBust(url?: string, itemId?: string) { return getItemImageUrl(url, itemId, renderBust); }

  const username = user?.user_metadata?.username || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "You";
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.first_name || username;
  const avatarUrl = profileAvatarUrl || user?.user_metadata?.avatar_url;
  const initials = String(displayName).charAt(0).toUpperCase();
  const location = user?.user_metadata?.suburb || user?.user_metadata?.city || "Sydney, AU";

  const sectionTabs = [
    { id: "wardrobe" as const, label: "Wardrobe", icon: Shirt, badge: incomingRequests.length },
    { id: "snatches" as const, label: "Snatches", icon: Sparkles, badge: approvedTripsCount },
    { id: "likes" as const, label: "Liked", icon: Heart, badge: 0 },
  ];

  if (loading) {
    return (
      <div className="app-shell bg-warm-gradient p-5 space-y-4 animate-pulse">
        <div className="h-24 rounded-none bg-muted" />
        <div className="h-16 rounded-full bg-muted w-16 -mt-8 ml-4" />
        <div className="h-4 rounded-xl bg-muted w-32 mx-5" />
        <div className="h-3 rounded-xl bg-muted w-24 mx-5" />
        <div className="grid grid-cols-4 gap-2 mx-5">
          {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-xl bg-muted" />)}
        </div>
        <div className="h-48 rounded-2xl bg-muted mx-5" />
      </div>
    );
  }

  return (
    <div className="app-shell bg-warm-gradient pb-28 page-transition">

      {/* ── Cover strip ── */}
      <div className="h-20 bg-gradient-to-r from-blush to-card relative">
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/?notifications=1")}
            className="relative w-9 h-9 rounded-full bg-card/80 border border-border/60 flex items-center justify-center shadow-soft"
          >
            <Bell size={15} className="text-foreground" />
            {incomingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 font-semibold text-center">
                {incomingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={logout}
            className="w-9 h-9 rounded-full bg-card/80 border border-border/60 flex items-center justify-center shadow-soft"
          >
            <LogOut size={15} className="text-foreground" />
          </button>
        </div>
      </div>

      {/* ── Hero section ── */}
      <div className="px-5 pb-4 bg-warm-gradient">
        <div className="flex items-end justify-between -mt-8 mb-3">
          {/* Avatar */}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="relative w-16 h-16 rounded-full border-3 border-card bg-card overflow-hidden shadow-card"
            style={{ border: "3px solid hsl(var(--card))" }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-lg font-bold text-foreground">
                {initials || <UserRound size={20} />}
              </span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              <Camera size={10} />
            </span>
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={updateAvatar} />

          {/* Action buttons */}
          <div className="flex gap-2 pb-1">
            <button
              onClick={() => navigate("/list")}
              className="h-8 px-4 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-soft"
            >
              + List item
            </button>
          </div>
        </div>

        {/* Name + handle */}
        <h1 className="text-lg font-display font-bold text-foreground leading-tight">{displayName}</h1>
        <div className="flex items-center gap-1 mt-0.5">
          <p className="text-xs text-muted-foreground">@{username}</p>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <MapPin size={10} className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{location}</p>
        </div>

        {/* Rating */}
        {ratingsEnabled && (
          <button
            onClick={() => navigate("/reviews")}
            className="flex items-center gap-1 mt-2"
          >
            <Star size={12} className="text-amber-500 fill-amber-500" />
            <span className="text-xs text-muted-foreground">
              {ratingSummary.count > 0 ? `${ratingSummary.average} · ${ratingSummary.count} reviews` : "No reviews yet"}
            </span>
          </button>
        )}

        {uploadingAvatar && <p className="text-xs text-primary mt-1">Uploading photo...</p>}
        {refreshing && <p className="text-xs text-muted-foreground mt-1">Refreshing...</p>}

        {/* Stats row */}
        <div className="flex mt-4 pt-4 border-t border-border/40">
          <button
            onClick={() => navigate("/connections?tab=followers")}
            className="flex-1 text-center"
          >
            <p className="text-base font-bold text-foreground">{followersCount}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Followers</p>
          </button>
          <div className="w-px bg-border/40" />
          <button
            onClick={() => navigate("/connections?tab=following")}
            className="flex-1 text-center"
          >
            <p className="text-base font-bold text-foreground">{followingCount}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Following</p>
          </button>
          <div className="w-px bg-border/40" />
          <div className="flex-1 text-center">
            <p className="text-base font-bold text-foreground">{myWardrobe.length}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Listed</p>
          </div>
          <div className="w-px bg-border/40" />
          <div className="flex-1 text-center">
            <p className="text-base font-bold text-foreground">{mySnatches.length}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Snatched</p>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-border/40 bg-warm-gradient sticky top-0 z-30">
        {sectionTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-all border-b-2 ${
                active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon size={13} />
              {tab.label}
              {tab.badge > 0 && (
                <span className={`min-w-4 h-4 px-1 rounded-full text-[9px] leading-4 font-bold text-center ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div className="px-5 pt-4 space-y-5">

        {/* WARDROBE TAB */}
        {activeSection === "wardrobe" && (
          <>
            {/* Incoming booking requests */}
            {incomingRequests.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                    Booking requests
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] leading-5 font-bold text-center">
                      {incomingRequests.length}
                    </span>
                  </h2>
                </div>
                <div className="space-y-3">
                  {incomingRequests.map((booking) => (
                    <div key={booking.id} className="bg-card rounded-2xl border border-border/50 shadow-soft p-3">
                      <div className="flex gap-3">
                        {booking.item_image_url ? (
                          <img
                            src={withImageBust(booking.item_image_url, booking.item_id)}
                            alt={booking.item_title || "Item"}
                            className="w-14 rounded-xl object-cover border border-border/30"
                            style={{ height: 72 }}
                          />
                        ) : (
                          <div className="w-14 rounded-xl bg-muted border border-border/30 flex items-center justify-center text-sm font-bold text-muted-foreground" style={{ height: 72 }}>
                            {String(booking.item_title || "I").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{booking.item_title || "Your listing"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{booking.renter_name || "Renter"}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(booking.start_date)} – {formatDate(booking.end_date)}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {Number.isFinite(Number(booking.total_price)) && (
                              <span className="text-xs font-semibold text-foreground">${Number(booking.total_price)}</span>
                            )}
                            {(booking.paid_at || booking.stripe_payment_intent_id) && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">Paid</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => updateIncomingRequest(booking.id, "approved")}
                          disabled={updatingOwnerBookingId === booking.id}
                          className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60"
                        >
                          {updatingOwnerBookingId === booking.id ? "Working..." : "Approve"}
                        </button>
                        <button
                          onClick={() => updateIncomingRequest(booking.id, "rejected")}
                          disabled={updatingOwnerBookingId === booking.id}
                          className="h-9 px-4 rounded-xl border border-border/60 text-xs font-semibold text-muted-foreground disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Wardrobe grid */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-foreground">My listings</h2>
                <button onClick={() => navigate("/list")} className="text-xs font-bold text-primary">
                  + Add new
                </button>
              </div>

              {myWardrobe.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-card">
                  <Shirt size={24} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-semibold text-foreground mb-1">No listings yet</p>
                  <p className="text-xs text-muted-foreground mb-3">List your first item and start earning</p>
                  <button onClick={() => navigate("/list")} className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold">
                    List an item
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {myWardrobe.map((item) => (
                    <div key={item.id} className="group">
                      <button onClick={() => navigate(`/item/${item.id}`)} className="w-full text-left">
                        <div className="relative overflow-hidden rounded-2xl bg-muted border border-border/30" style={{ aspectRatio: "3/4" }}>
                          <img
                            src={withImageBust(item.image_url, item.id)}
                            alt={item.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                          <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/list/${item.id}`); }}
                              className="h-6 px-2 rounded-lg bg-white/90 text-[10px] font-bold text-foreground shadow-soft"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteWardrobeItem(item.id); }}
                              disabled={deletingItemId === item.id}
                              className="h-6 px-2 rounded-lg bg-white/90 text-[10px] font-bold text-red-600 shadow-soft disabled:opacity-60"
                            >
                              {deletingItemId === item.id ? "..." : "Del"}
                            </button>
                          </div>
                        </div>
                        <p className="mt-1.5 text-xs font-bold text-foreground truncate">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">${item.price_per_day}/day</p>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Active rentals */}
            {ownerBookings.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-foreground mb-3">Active rentals</h2>
                <div className="space-y-3">
                  {ownerBookings.map((booking) => (
                    <div key={booking.id} className="bg-card rounded-2xl border border-border/50 shadow-soft p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-foreground">{formatDate(booking.start_date)} – {formatDate(booking.end_date)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusColor(booking.status)}`}>
                          {getBookingStatusLabel(booking.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] text-muted-foreground">Payout:</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${booking.payout_status === "released" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                          {booking.payout_status || "held"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={trackingDrafts[booking.id] || ""}
                          onChange={(e) => setTrackingDrafts((prev) => ({ ...prev, [booking.id]: e.target.value }))}
                          placeholder="Tracking number"
                          className="flex-1 h-8 rounded-xl border border-border px-3 text-xs bg-background"
                        />
                        <button onClick={() => saveTracking(booking.id)} disabled={updatingOwnerBookingId === booking.id} className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60">Save</button>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => markDelivered(booking.id)} disabled={updatingOwnerBookingId === booking.id} className="flex-1 h-8 rounded-xl border border-border text-xs font-semibold disabled:opacity-60">Mark delivered</button>
                        <button onClick={() => markReturned(booking.id)} disabled={updatingOwnerBookingId === booking.id} className="flex-1 h-8 rounded-xl border border-border text-xs font-semibold disabled:opacity-60">Mark returned</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* SNATCHES TAB */}
        {activeSection === "snatches" && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-foreground">My rentals</h2>
            {mySnatches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-card">
                <Sparkles size={24} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground mb-1">No rentals yet</p>
                <p className="text-xs text-muted-foreground mb-3">Browse and snatch something amazing</p>
                <button onClick={() => navigate("/")} className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold">Browse listings</button>
              </div>
            ) : (
              mySnatches.map((booking) => {
                const hasExistingRating = Boolean(myRatingsByBooking[booking.id]);
                const selectedRating = ratingDrafts[booking.id] || 0;
                const canRate = RATEABLE_STATUSES.has(String(booking.status || "").toLowerCase());
                const bookingStatus = String(booking.status || "").toLowerCase();
                const canConfirmReturn = ["approved", "paid", "completed"].includes(bookingStatus) && !booking.item_returned_at;

                return (
                  <div key={booking.id} className="bg-card rounded-2xl border border-border/50 shadow-soft p-3">
                    <button onClick={() => booking.item?.id && navigate(`/item/${booking.item.id}`)} className="w-full text-left">
                      <div className="flex gap-3">
                        <img
                          src={withImageBust(booking.item?.image_url, booking.item?.id)}
                          alt={booking.item?.title || "Booked item"}
                          className="w-16 rounded-xl object-cover border border-border/30"
                          style={{ height: 80 }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{booking.item?.title || "Booked item"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(booking.start_date)} – {formatDate(booking.end_date)}</p>
                          <p className="text-xs text-muted-foreground">${booking.total_price}</p>
                          <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusColor(booking.status)}`}>
                            {getBookingStatusLabel(booking.status)}
                          </span>
                        </div>
                      </div>
                    </button>

                    {canConfirmReturn && (
                      <div className="mt-3 pt-3 border-t border-border/40">
                        <button
                          onClick={() => confirmReturnReceivedInGoodCondition(booking.id)}
                          disabled={confirmingReturnBookingId === booking.id}
                          className="w-full h-9 rounded-xl border border-border text-xs font-semibold disabled:opacity-60"
                        >
                          {confirmingReturnBookingId === booking.id ? "Confirming..." : "Confirm item returned in good condition"}
                        </button>
                      </div>
                    )}

                    {ratingsEnabled && canRate && (
                      <div className="mt-3 pt-3 border-t border-border/40">
                        <p className="text-xs font-semibold text-foreground mb-2">{hasExistingRating ? "Update rating" : "Rate this rental"}</p>
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button key={value} onClick={() => setRatingDrafts((prev) => ({ ...prev, [booking.id]: value }))} className="p-0.5">
                              <Star size={20} className={value <= selectedRating ? "text-amber-500 fill-amber-500" : "text-muted-foreground"} />
                            </button>
                          ))}
                          <button
                            onClick={() => submitRating(booking)}
                            disabled={submittingBookingId === booking.id}
                            className="ml-2 h-8 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
                          >
                            {submittingBookingId === booking.id ? "Saving..." : hasExistingRating ? "Update" : "Submit"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* LIKES TAB */}
        {activeSection === "likes" && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-foreground">Saved items</h2>
            {!likesEnabled && (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
                Likes are not configured in your database yet.
              </div>
            )}
            {likesEnabled && likedItems.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-card">
                <Heart size={24} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground mb-1">No saved items</p>
                <p className="text-xs text-muted-foreground mb-3">Tap the heart on any listing to save it here</p>
                <button onClick={() => navigate("/")} className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold">Browse listings</button>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {likedItems.map((item) => (
                <button key={item.id} onClick={() => navigate(`/item/${item.id}`)} className="text-left group">
                  <div className="overflow-hidden rounded-2xl border border-border/30 bg-muted" style={{ aspectRatio: "3/4" }}>
                    <img
                      src={withImageBust(item.image_url, item.id)}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="mt-1.5 text-xs font-bold text-foreground truncate">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground">${item.price_per_day}/day</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Account settings (collapsed) ── */}
        <section className="mt-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between py-3 border-t border-border/40"
          >
            <div className="flex items-center gap-2">
              <Settings size={14} className="text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Account settings</span>
            </div>
            {showSettings ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </button>

          {showSettings && (
            <div className="space-y-3 pb-4">
              {/* Stripe */}
              <div className="bg-card rounded-2xl border border-border/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Stripe payouts</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stripeConnected ? "Connected — you can receive payouts" : "Not connected yet"}</p>
                  </div>
                  <button
                    onClick={connectStripePayouts}
                    disabled={connectingStripe}
                    className={`h-8 px-4 rounded-xl text-xs font-bold disabled:opacity-60 ${stripeConnected ? "border border-border text-foreground" : "bg-primary text-primary-foreground"}`}
                  >
                    {connectingStripe ? "Opening..." : stripeConnected ? "Update" : "Connect"}
                  </button>
                </div>
              </div>

              {/* MFA */}
              <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Two-step verification</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{mfaEnabled ? "Enabled" : "Disabled"}</p>
                  </div>
                  {!mfaEnabled ? (
                    <button onClick={startMfaSetup} disabled={mfaBusy} className="h-8 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60">
                      {mfaBusy ? "Starting..." : "Enable"}
                    </button>
                  ) : (
                    <button onClick={disableMfa} disabled={mfaBusy} className="h-8 px-4 rounded-xl border border-border text-xs font-semibold disabled:opacity-60">
                      {mfaBusy ? "Working..." : "Disable"}
                    </button>
                  )}
                </div>

                {mfaSetupFactorId && mfaQrCode && (
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <p className="text-xs text-muted-foreground">Scan this QR code in Google Authenticator, 1Password, or Authy, then enter the 6-digit code.</p>
                    <img src={mfaQrCode} alt="MFA QR" className="w-40 h-40 rounded-xl border border-border/60 bg-white p-2" />
                    <div className="flex gap-2">
                      <input inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="6-digit code" className="h-9 flex-1 rounded-xl border border-border px-3 text-xs bg-background" value={mfaVerifyCode} onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                      <button onClick={verifyMfaSetup} disabled={mfaBusy} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60">
                        {mfaBusy ? "Verifying..." : "Verify"}
                      </button>
                    </div>
                  </div>
                )}

                {mfaEnabled && !mfaSetupFactorId && (
                  <div className="pt-2 border-t border-border/40 space-y-2">
                    <button onClick={generateRecoveryCodes} disabled={mfaBusy} className="h-8 px-3 rounded-xl border border-border text-xs font-semibold disabled:opacity-60">
                      {mfaBusy ? "Generating..." : "Generate backup codes"}
                    </button>
                    {recoveryCodes.length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-background p-3">
                        <p className="text-xs font-semibold text-foreground mb-2">Backup codes (shown once):</p>
                        <div className="grid grid-cols-2 gap-1">
                          {recoveryCodes.map((value) => (
                            <code key={value} className="text-[11px] text-foreground font-mono">{value}</code>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {mfaStatusMessage && <p className="text-xs text-muted-foreground">{mfaStatusMessage}</p>}
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
