import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Camera, Heart, LogOut, Shirt, Sparkles, Star, UserRound } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getItemImageUrl } from "@/lib/images";
import { uploadAvatar } from "@/lib/avatarUpload";
import { usePageRefresh } from "@/hooks/usePageRefresh";
import StripeConnectBanner from "@/components/StripeConnectBanner";

type ProfileSection = "wardrobe" | "snatches" | "likes";

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function getBookingStatusLabel(value?: string) {
  const status = String(value || "").toLowerCase();
  if (status === "pending") return "Pending lender approval";
  if (status === "approved") return "Approved by lender";
  if (status === "paid") return "Payment received";
  if (status === "rejected") return "Declined by lender";
  if (status === "cancelled") return "Cancelled";
  if (status === "completed") return "Completed";
  if (!status) return "Pending lender approval";
  return status.charAt(0).toUpperCase() + status.slice(1);
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
  const [showApprovedBanner, setShowApprovedBanner] = useState(true);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [stripeConnected, setStripeConnected] = useState(false);
  const [followsEnabled, setFollowsEnabled] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const loadMfaStatus = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMfaEnabled(false);
      return;
    }
    setMfaEnabled((data?.totp || []).length > 0);
  }, []);

  const loadProfile = useCallback(async () => {
    const requestId = Date.now();
    loadRequestIdRef.current = requestId;
    const isInitialLoad = !hasLoadedOnceRef.current;

    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        navigate("/auth");
        return;
      }

      const currentUser = userData.user;
      const userId = currentUser.id;

      if (loadRequestIdRef.current !== requestId) return;
      setUser(currentUser);

      const [
        profileResult,
        wardrobeByOwnerResult,
        wardrobeByUserResult,
        renterBookingsResult,
        likesResult,
        ratingsReceivedResult,
        myRatingsResult,
        followersResult,
        followingResult,
        mfaResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("avatar_url,stripe_account_id,stripe_connect_account_id")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("items").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("items").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("bookings").select("*").eq("renter_id", userId).order("created_at", { ascending: false }),
        supabase.from("likes").select("item_id").eq("user_id", userId),
        supabase
          .from("ratings")
          .select("id,booking_id,rater_id,rated_user_id,rating,comment,created_at")
          .eq("rated_user_id", userId)
          .order("created_at", { ascending: false }),
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

      const ownerColumnMissing =
        ownerQueryError?.code === "42703" ||
        ownerQueryError?.message?.toLowerCase().includes("owner_id");
      const userColumnMissing =
        userQueryError?.code === "42703" ||
        userQueryError?.message?.toLowerCase().includes("user_id");

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
            ? fetch("/api/owner-booking-requests", {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }).then((response) => response.json().catch(() => ({ requests: [] })))
            : Promise.resolve({ requests: [] as any[] }),
          supabase
            .from("bookings")
            .select("*")
            .in("item_id", wardrobeItemIds)
            .in("status", ["approved", "paid", "completed"])
            .order("created_at", { ascending: false }),
        ]);

        if (loadRequestIdRef.current !== requestId) return;
        setIncomingRequests(Array.isArray(ownerRequestsResponse?.requests) ? ownerRequestsResponse.requests : []);

        const activeOwnerRows = ownerRowsResult.data || [];
        setOwnerBookings(activeOwnerRows);

        const trackingState: Record<string, string> = {};
        activeOwnerRows.forEach((row) => {
          trackingState[row.id] = row.tracking_number || "";
        });
        setTrackingDrafts(trackingState);
      } else {
        setIncomingRequests([]);
        setOwnerBookings([]);
        setTrackingDrafts({});
      }

      const snatches = renterBookingsResult.data || [];
      if (snatches.length > 0) {
        const snatchItemIds = Array.from(new Set(snatches.map((booking) => booking.item_id)));
        const { data: snatchItems } = await supabase.from("items").select("*").in("id", snatchItemIds);

        const itemById = new Map((snatchItems || []).map((item) => [item.id, item]));
        setMySnatches(snatches.map((booking) => ({ ...booking, item: itemById.get(booking.item_id) })));
      } else {
        setMySnatches([]);
      }

      const likeRows = likesResult.data;
      const likesError = likesResult.error;

      if (likesError) {
        const likesMessage = String(likesError.message || "").toLowerCase();
        const missingLikesTable =
          likesError.code === "42P01" ||
          likesMessage.includes("relation") ||
          likesMessage.includes("could not find the table") ||
          likesMessage.includes("schema cache");

        if (missingLikesTable) {
          setLikesEnabled(false);
          setLikedItems([]);
        } else {
          throw likesError;
        }
      } else {
        setLikesEnabled(true);
        const likedIds = (likeRows || []).map((row) => row.item_id).filter(Boolean);

        if (likedIds.length > 0) {
          const { data: liked } = await supabase
            .from("items")
            .select("*")
            .in("id", likedIds)
            .order("created_at", { ascending: false });

          setLikedItems(liked || []);
        } else {
          setLikedItems([]);
        }
      }

      const ratingsReceived = ratingsReceivedResult.data;
      const ratingsError = ratingsReceivedResult.error;

      if (ratingsError) {
        const missingRatingsTable =
          ratingsError.code === "42P01" || ratingsError.message?.toLowerCase().includes("relation");

        if (missingRatingsTable) {
          setRatingsEnabled(false);
          setReceivedRatings([]);
          setMyRatingsByBooking({});
          setRatingDrafts({});
        } else {
          throw ratingsError;
        }
      } else {
        setRatingsEnabled(true);
        setReceivedRatings(ratingsReceived || []);

        const myRatings = myRatingsResult.data;

        const byBooking: Record<string, number> = {};
        (myRatings || []).forEach((row) => {
          if (row.booking_id && typeof row.rating === "number") {
            byBooking[row.booking_id] = row.rating;
          }
        });

        setMyRatingsByBooking(byBooking);
        setRatingDrafts(byBooking);
      }

      if (mfaResult.error) {
        setMfaEnabled(false);
      } else {
        setMfaEnabled((mfaResult.data?.totp || []).length > 0);
      }

      const followsMissing =
        followersResult.error?.code === "42P01" ||
        followingResult.error?.code === "42P01" ||
        String(followersResult.error?.message || "").toLowerCase().includes("relation") ||
        String(followingResult.error?.message || "").toLowerCase().includes("relation");

      if (followsMissing) {
        setFollowsEnabled(false);
        setFollowersCount(0);
        setFollowingCount(0);
      } else {
        setFollowsEnabled(true);
        setFollowersCount(Number(followersResult.count || 0));
        setFollowingCount(Number(followingResult.count || 0));
      }

      hasLoadedOnceRef.current = true;
    } catch (error) {
      console.error("Profile load error", error);
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [navigate]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  usePageRefresh(loadProfile, [loadProfile]);

  async function startMfaSetup() {
    setMfaBusy(true);
    setMfaStatusMessage("");

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Snatchn Authenticator",
    });

    if (error || !data?.id) {
      setMfaStatusMessage(error?.message || "Could not start two-step setup.");
      setMfaBusy(false);
      return;
    }

    setMfaSetupFactorId(data.id);
    setMfaQrCode((data as any)?.totp?.qr_code || "");
    setMfaBusy(false);
  }

  async function verifyMfaSetup() {
    if (!mfaSetupFactorId) return;
    if (!mfaVerifyCode.trim()) {
      setMfaStatusMessage("Enter the code from your authenticator app.");
      return;
    }

    setMfaBusy(true);
    setMfaStatusMessage("");

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: mfaSetupFactorId,
    });

    if (challengeError || !challengeData?.id) {
      setMfaStatusMessage(challengeError?.message || "Could not create verification challenge.");
      setMfaBusy(false);
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaSetupFactorId,
      challengeId: challengeData.id,
      code: mfaVerifyCode.trim(),
    });

    if (error) {
      setMfaStatusMessage(error.message || "Invalid verification code.");
      setMfaBusy(false);
      return;
    }

    setMfaEnabled(true);
    setMfaSetupFactorId(null);
    setMfaQrCode("");
    setMfaVerifyCode("");
    setMfaStatusMessage("Two-step verification enabled.");
    setMfaBusy(false);
  }

  async function disableMfa() {
    setMfaBusy(true);
    setMfaStatusMessage("");

    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMfaStatusMessage(error.message || "Could not load MFA factors.");
      setMfaBusy(false);
      return;
    }

    const factor = (data?.totp || [])[0];
    if (!factor?.id) {
      setMfaEnabled(false);
      setMfaBusy(false);
      return;
    }

    const { error: unenrollError } = await supabase.auth.mfa.unenroll({
      factorId: factor.id,
    });

    if (unenrollError) {
      setMfaStatusMessage(unenrollError.message || "Could not disable two-step verification.");
      setMfaBusy(false);
      return;
    }

    setMfaEnabled(false);
    setMfaSetupFactorId(null);
    setMfaQrCode("");
    setMfaVerifyCode("");
    setRecoveryCodes([]);
    setMfaStatusMessage("Two-step verification disabled.");
    setMfaBusy(false);
  }

  async function generateRecoveryCodes() {
    setMfaBusy(true);
    setMfaStatusMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setMfaStatusMessage("Session expired. Please log in again.");
        setMfaBusy(false);
        return;
      }

      const response = await fetch("/api/mfa-recovery-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Could not generate recovery codes.");
      }

      setRecoveryCodes(payload?.codes || []);
      setMfaStatusMessage("New recovery codes generated. Save them now.");
    } catch (error: any) {
      setMfaStatusMessage(error?.message || "Could not generate recovery codes.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function saveTracking(bookingId: string) {
    const trackingNumber = (trackingDrafts[bookingId] || "").trim();
    if (!trackingNumber) {
      alert("Please add a tracking number.");
      return;
    }

    setUpdatingOwnerBookingId(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({
        tracking_number: trackingNumber,
        tracking_status: "in_transit",
      })
      .eq("id", bookingId);

    setUpdatingOwnerBookingId(null);
    if (error) {
      alert(error.message || "Could not save tracking.");
      return;
    }
    loadProfile();
  }

  async function markDelivered(bookingId: string) {
    setUpdatingOwnerBookingId(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({
        tracking_status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    setUpdatingOwnerBookingId(null);
    if (error) {
      alert(error.message || "Could not mark delivered.");
      return;
    }
    loadProfile();
  }

  async function markReturned(bookingId: string) {
    setUpdatingOwnerBookingId(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({
        item_returned_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    setUpdatingOwnerBookingId(null);
    if (error) {
      alert(error.message || "Could not mark returned.");
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        await fetch("/api/release-payout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ booking_id: bookingId }),
        });
      }
    } catch (payoutError) {
      console.error("Auto payout release check failed", payoutError);
    }
    alert("Return marked. Payout release is handled automatically by Snatch'n.");
    loadProfile();
  }

  async function deleteWardrobeItem(itemId: string) {
    const confirmed = window.confirm("Delete this listing? This cannot be undone.");
    if (!confirmed) return;

    setDeletingItemId(itemId);

    const { error } = await supabase.from("items").delete().eq("id", itemId);

    if (error) {
      const message = String(error.message || "");
      const maybeMfaRequired =
        message.toLowerCase().includes("row-level security") ||
        message.toLowerCase().includes("permission denied");
      if (maybeMfaRequired && mfaEnabled) {
        alert("Please complete two-step verification again before deleting listings.");
        navigate("/auth/mfa");
        setDeletingItemId(null);
        return;
      }
      alert(error.message || "Unable to delete listing.");
      setDeletingItemId(null);
      return;
    }

    setMyWardrobe((prev) => prev.filter((item) => item.id !== itemId));
    setIncomingRequests((prev) => prev.filter((booking) => booking.item_id !== itemId));
    setDeletingItemId(null);
  }

  async function updateAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      event.target.value = "";
      return;
    }

    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert("Image is too large. Please use a file under 12MB.");
      event.target.value = "";
      return;
    }

    function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          window.setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms),
        ),
      ]);
    }

    setUploadingAvatar(true);

    try {
      const avatarUrl = await withTimeout(uploadAvatar(user.id, file), 30000, "Avatar upload");

      const { error: authError } = await withTimeout(
        supabase.auth.updateUser({
          data: {
            avatar_url: avatarUrl,
          },
        }),
        15000,
        "Profile metadata update",
      );

      if (authError) {
        throw new Error(authError.message || "Unable to update profile image.");
      }

      // Keep public profile avatar in sync for Discover/Messages cards.
      let profilePayload: any = { id: user.id, avatar_url: avatarUrl, updated_at: new Date().toISOString() };
      for (let i = 0; i < 5; i += 1) {
        const result = await withTimeout(
          supabase.from("profiles").upsert(profilePayload, { onConflict: "id" }),
          15000,
          "Profile row update",
        );
        if (!result.error) break;

        const message = String(result.error.message || "");
        const missingColumn =
          result.error.code === "42703" ||
          result.error.code === "PGRST204" ||
          message.toLowerCase().includes("column");

        if (!missingColumn) {
          throw new Error(result.error.message || "Unable to update profile image.");
        }

        const match = message.match(/['"]([a-zA-Z0-9_]+)['"]/);
        const col = match?.[1];
        if (!col || !(col in profilePayload)) break;
        delete profilePayload[col];
      }

      setProfileAvatarUrl(avatarUrl);
      loadProfile();
    } catch (error: any) {
      alert(error?.message || "Unable to upload profile image.");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  }

  async function submitRating(booking: any) {
    if (!ratingsEnabled || !user) return;

    const selectedRating = ratingDrafts[booking.id];
    if (!selectedRating || selectedRating < 1 || selectedRating > 5) {
      alert("Please choose a rating between 1 and 5 stars.");
      return;
    }

    const ratedUserId = booking.owner_id;
    if (!ratedUserId) {
      alert("This booking is missing owner information.");
      return;
    }

    setSubmittingBookingId(booking.id);

    try {
      const existing = myRatingsByBooking[booking.id];

      if (existing) {
        const { error } = await supabase
          .from("ratings")
          .update({ rating: selectedRating })
          .eq("booking_id", booking.id)
          .eq("rater_id", user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("ratings").insert({
          booking_id: booking.id,
          item_id: booking.item_id,
          rater_id: user.id,
          rated_user_id: ratedUserId,
          rating: selectedRating,
        });

        if (error) throw error;
      }

      setMyRatingsByBooking((prev) => ({ ...prev, [booking.id]: selectedRating }));
      loadProfile();
    } catch (error: any) {
      const missingRatingsTable =
        error?.code === "42P01" || error?.message?.toLowerCase?.().includes("relation");

      if (missingRatingsTable) {
        setRatingsEnabled(false);
        alert("Ratings are not configured yet in the database.");
      } else {
        alert(error?.message || "Unable to submit rating.");
      }
    } finally {
      setSubmittingBookingId(null);
    }
  }

  async function confirmReturnReceivedInGoodCondition(bookingId: string) {
    if (!user?.id) return;
    setConfirmingReturnBookingId(bookingId);

    try {
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          item_returned_at: new Date().toISOString(),
        })
        .eq("id", bookingId)
        .eq("renter_id", user.id);

      if (updateError) {
        throw updateError;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        alert("Return confirmed. Please log in again for payout checks.");
        loadProfile();
        return;
      }

      const response = await fetch("/api/release-payout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ booking_id: bookingId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        alert("Return confirmed. Payout checks passed and release started.");
      } else if (response.status === 409) {
        alert(
          `Return confirmed. Payout is still on hold: ${payload?.reason || "conditions not met yet."}`,
        );
      } else {
        alert(payload?.error || "Return confirmed. Payout check will run automatically.");
      }

      loadProfile();
    } catch (error: any) {
      alert(error?.message || "Could not confirm return.");
    } finally {
      setConfirmingReturnBookingId(null);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  }

  const approvedTripsCount = useMemo(
    () => mySnatches.filter((booking) => String(booking.status || "").toLowerCase() === "approved").length,
    [mySnatches],
  );

  const sectionButtons = useMemo(
    () => [
      { id: "wardrobe" as const, label: "Your Wardrobe", icon: Shirt, badge: incomingRequests.length },
      { id: "snatches" as const, label: "Your Snatches", icon: Sparkles, badge: approvedTripsCount },
      { id: "likes" as const, label: "Your Likes", icon: Heart, badge: 0 },
    ],
    [approvedTripsCount, incomingRequests.length],
  );

  const ratingSummary = useMemo(() => {
    if (receivedRatings.length === 0) {
      return { average: 0, count: 0 };
    }

    const sum = receivedRatings.reduce((acc, row) => acc + Number(row.rating || 0), 0);
    const average = sum / receivedRatings.length;

    return {
      average: Number(average.toFixed(1)),
      count: receivedRatings.length,
    };
  }, [receivedRatings]);
  const renderBust = useMemo(() => Date.now(), []);

  async function updateIncomingRequest(bookingId: string, status: "approved" | "rejected") {
    setUpdatingOwnerBookingId(bookingId);
    const { error } = await supabase.from("bookings").update({ status }).eq("id", bookingId);
    setUpdatingOwnerBookingId(null);
    if (error) {
      alert(error.message || "Could not update booking request.");
      return;
    }
    loadProfile();
  }

  function withImageBust(url?: string, itemId?: string) {
    return getItemImageUrl(url, itemId, renderBust);
  }

  if (loading) {
    return (
      <div className="app-shell bg-warm-gradient p-5 space-y-4 animate-pulse">
        <div className="h-16 rounded-2xl bg-muted" />
        <div className="h-20 rounded-2xl bg-muted" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-14 rounded-2xl bg-muted" />
          <div className="h-14 rounded-2xl bg-muted" />
          <div className="h-14 rounded-2xl bg-muted" />
        </div>
        <div className="h-48 rounded-2xl bg-muted" />
      </div>
    );
  }

  const avatarUrl = profileAvatarUrl || user?.user_metadata?.avatar_url;
  const initials = (user?.email || "U").slice(0, 1).toUpperCase();

  return (
    <div className="app-shell bg-warm-gradient pb-28 page-transition">
      <header className="sticky top-0 z-40 glass px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="relative w-12 h-12 rounded-full border border-border/60 bg-card overflow-hidden shadow-soft"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-foreground">
                  {initials || <UserRound size={16} />}
                </span>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Camera size={11} />
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={updateAvatar}
            />

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-display font-bold text-foreground">Profile</h1>
                {refreshing && <span className="text-[11px] text-muted-foreground">Refreshing...</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              {uploadingAvatar && (
                <p className="text-xs text-primary mt-0.5">Uploading profile image...</p>
              )}
              {ratingsEnabled ? (
                <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                  <Star size={12} className="text-amber-500 fill-amber-500" />
                  {ratingSummary.count > 0
                    ? `${ratingSummary.average} (${ratingSummary.count} ratings)`
                    : "No ratings yet"}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Ratings not configured</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/?notifications=1")}
              className="relative w-9 h-9 rounded-full border border-border/60 bg-card flex items-center justify-center shadow-soft"
              aria-label="Open notifications"
            >
              <Bell size={16} className="text-foreground" />
              {incomingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 font-semibold text-center">
                  {incomingRequests.length}
                </span>
              )}
            </button>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border/60 bg-card text-sm"
            >
              <LogOut size={14} />
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="px-5 pt-4">
        <div className="mb-4 rounded-2xl border border-border/60 bg-card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate("/connections?tab=followers")}
                className="text-left"
              >
                <p className="text-sm font-semibold text-foreground">{followersCount}</p>
                <p className="text-xs text-muted-foreground">Followers</p>
              </button>
              <button
                type="button"
                onClick={() => navigate("/connections?tab=following")}
                className="text-left"
              >
                <p className="text-sm font-semibold text-foreground">{followingCount}</p>
                <p className="text-xs text-muted-foreground">Following</p>
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate("/reviews")}
              className="h-8 px-3 rounded-lg border border-border text-xs font-semibold"
            >
              Reviews
            </button>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => navigate("/discover")}
              className="h-8 px-3 rounded-lg border border-border text-xs font-semibold"
            >
              Find people to follow
            </button>
          </div>
          {!followsEnabled && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Follows are not configured in your database yet.
            </p>
          )}
        </div>

        {showApprovedBanner && approvedTripsCount > 0 && (
          <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/10 px-3 py-2.5 flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {approvedTripsCount} booking request{approvedTripsCount > 1 ? "s were" : " was"} approved by lender{approvedTripsCount > 1 ? "s" : ""}.
            </p>
            <button
              type="button"
              onClick={() => setShowApprovedBanner(false)}
              className="text-xs font-semibold text-primary"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-5">
          {sectionButtons.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.id;

            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`rounded-2xl border px-2 py-3 text-xs font-medium transition-all ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border/60 text-foreground"
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Icon size={13} />
                  {section.label}
                  {section.badge > 0 && (
                    <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 text-center">
                      {section.badge}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <section className="mb-5 space-y-3">
          <StripeConnectBanner
            returnPath="/profile"
            variant="card"
            onConnected={() => setStripeConnected(true)}
            onStatusChange={(nextStatus) => setStripeConnected(nextStatus.connected)}
          />

          <div className="rounded-2xl border border-border/60 bg-card p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Two-step verification</p>
              <p className="text-xs text-muted-foreground">
                Status: {mfaEnabled ? "Enabled" : "Disabled"}
              </p>
            </div>
            {!mfaEnabled ? (
              <button
                type="button"
                onClick={startMfaSetup}
                disabled={mfaBusy}
                className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
              >
                {mfaBusy ? "Starting..." : "Enable"}
              </button>
            ) : (
              <button
                type="button"
                onClick={disableMfa}
                disabled={mfaBusy}
                className="h-8 px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-60"
              >
                {mfaBusy ? "Working..." : "Disable"}
              </button>
            )}
          </div>

          {mfaSetupFactorId && mfaQrCode && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Scan this QR code in Google Authenticator, 1Password, or Authy, then enter the 6-digit code.
              </p>
              <img src={mfaQrCode} alt="MFA QR" className="w-44 h-44 rounded-lg border border-border/60 bg-white p-2" />
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="6-digit code"
                  className="h-8 flex-1 rounded-lg border border-border px-2 text-xs"
                  value={mfaVerifyCode}
                  onChange={(event) => setMfaVerifyCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <button
                  type="button"
                  onClick={verifyMfaSetup}
                  disabled={mfaBusy}
                  className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
                >
                  {mfaBusy ? "Verifying..." : "Verify"}
                </button>
              </div>
            </div>
          )}

          {mfaEnabled && !mfaSetupFactorId && (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={generateRecoveryCodes}
                disabled={mfaBusy}
                className="h-8 px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-60"
              >
                {mfaBusy ? "Generating..." : "Generate backup recovery codes"}
              </button>

              {recoveryCodes.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-background p-2.5">
                  <p className="text-xs font-medium text-foreground mb-1.5">
                    Backup codes (shown once):
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {recoveryCodes.map((value) => (
                      <code key={value} className="text-[11px] text-foreground">
                        {value}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {mfaStatusMessage && (
            <p className="mt-2 text-xs text-muted-foreground">{mfaStatusMessage}</p>
          )}
        </section>

        {activeSection === "wardrobe" && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">My Listings</h2>
                <p className="text-xs text-muted-foreground">Manage your live wardrobe, incoming requests, and current rentals.</p>
              </div>
              <button onClick={() => navigate("/list")} className="text-sm text-primary font-semibold">
                + List Item
              </button>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Pending booking requests</h3>
                  <p className="text-xs text-muted-foreground">
                    Review new requests here or from the notification bell.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/?notifications=1")}
                  className="h-8 px-3 rounded-lg border border-border text-xs font-semibold"
                >
                  Open notifications
                </button>
              </div>

              {incomingRequests.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No pending booking requests right now.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {incomingRequests.map((booking) => (
                    <div key={booking.id} className="rounded-xl border border-border/60 bg-background px-3 py-3">
                      <div className="flex items-center gap-3">
                        {booking.item_image_url ? (
                          <img
                            src={withImageBust(booking.item_image_url, booking.item_id)}
                            alt={booking.item_title || "Listing"}
                            className="w-12 h-12 rounded-lg object-cover border border-border/40"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg border border-border/40 bg-card flex items-center justify-center text-xs font-semibold text-muted-foreground">
                            {String(booking.item_title || "I").slice(0, 1).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {booking.item_title || "Your listing"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {booking.renter_name || "Renter"} · {formatDate(booking.start_date)} to {formatDate(booking.end_date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {Number.isFinite(Number(booking.total_price)) ? `$${Number(booking.total_price)}` : ""}
                            {booking.paid_at || booking.stripe_payment_intent_id ? " · paid and awaiting approval" : " · awaiting approval"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateIncomingRequest(booking.id, "approved")}
                          disabled={updatingOwnerBookingId === booking.id}
                          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
                        >
                          {updatingOwnerBookingId === booking.id ? "Working..." : "Approve request"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateIncomingRequest(booking.id, "rejected")}
                          disabled={updatingOwnerBookingId === booking.id}
                          className="h-8 px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-60"
                        >
                          Decline request
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {myWardrobe.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
                You have no listings yet.
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {myWardrobe.map((item) => (
                <div key={item.id} className="group">
                  <button onClick={() => navigate(`/item/${item.id}`)} className="w-full text-left">
                    <div className="relative aspect-square overflow-hidden rounded-xl border border-border/30 bg-background">
                      <img
                        src={withImageBust(item.image_url, item.id)}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                    <p className="mt-1 text-[12px] font-semibold text-foreground truncate">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground">${item.price_per_day}/day</p>
                    {(item.location || item.suburb || item.area) && (
                      <p className="text-[11px] text-muted-foreground truncate">{item.location || item.suburb || item.area}</p>
                    )}
                  </button>
                  <div className="mt-1.5 flex gap-1">
                    <button
                      onClick={() => navigate(`/list/${item.id}`)}
                      className="h-6 px-2 rounded-md border border-border text-[10px] font-semibold bg-background hover:bg-muted/40"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => navigate(`/closet/${item.owner_id || item.user_id}`)}
                      className="h-6 px-2 rounded-md border border-border text-[10px] font-semibold bg-background hover:bg-muted/40"
                    >
                      Profile
                    </button>
                    <button
                      onClick={() => deleteWardrobeItem(item.id)}
                      disabled={deletingItemId === item.id}
                      className="h-6 px-2 rounded-md border border-destructive/50 text-destructive text-[10px] font-semibold disabled:opacity-60 bg-background"
                    >
                      {deletingItemId === item.id ? "..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <div className="mb-2">
                <h3 className="text-sm font-semibold">Active Rentals</h3>
                <p className="text-xs text-muted-foreground">Tracking, delivery, and return actions for approved bookings.</p>
              </div>
              {ownerBookings.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
                  No active rentals yet.
                </div>
              )}
              <div className="space-y-2">
                {ownerBookings.map((booking) => (
                  <div key={booking.id} className="rounded-2xl border border-border/60 bg-card p-3">
                    <p className="text-sm font-medium">
                      {formatDate(booking.start_date)} to {formatDate(booking.end_date)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Status: <span className="font-semibold text-foreground">{getBookingStatusLabel(booking.status)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tracking: <span className="font-semibold text-foreground">{booking.tracking_status || "not set"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Payout: <span className="font-semibold text-foreground">{booking.payout_status || "held"}</span>
                    </p>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={trackingDrafts[booking.id] || ""}
                        onChange={(event) =>
                          setTrackingDrafts((prev) => ({
                            ...prev,
                            [booking.id]: event.target.value,
                          }))
                        }
                        placeholder="Tracking number"
                        className="flex-1 h-8 rounded-lg border border-border px-2 text-xs"
                      />
                      <button
                        onClick={() => saveTracking(booking.id)}
                        disabled={updatingOwnerBookingId === booking.id}
                        className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
                      >
                        Save
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => markDelivered(booking.id)}
                        disabled={updatingOwnerBookingId === booking.id}
                        className="h-8 px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-60"
                      >
                        Mark delivered
                      </button>
                      <button
                        onClick={() => markReturned(booking.id)}
                        disabled={updatingOwnerBookingId === booking.id}
                        className="h-8 px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-60"
                      >
                        Mark returned
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Payout release is automatic after return/dispute checks are satisfied.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeSection === "snatches" && (
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">My Trips</h2>
              <p className="text-xs text-muted-foreground">Bookings you’ve requested, paid for, or completed.</p>
            </div>

            {mySnatches.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
                You have no bookings yet.
              </div>
            )}

            {mySnatches.map((booking) => {
              const hasExistingRating = Boolean(myRatingsByBooking[booking.id]);
              const selectedRating = ratingDrafts[booking.id] || 0;
              const canRate = RATEABLE_STATUSES.has(String(booking.status || "").toLowerCase());
              const bookingStatus = String(booking.status || "").toLowerCase();
              const canConfirmReturn =
                ["approved", "paid", "completed"].includes(bookingStatus) &&
                !booking.item_returned_at;

              return (
                <div key={booking.id} className="w-full rounded-2xl border border-border/60 bg-card p-3 shadow-soft">
                  <button
                    onClick={() => booking.item?.id && navigate(`/item/${booking.item.id}`)}
                    className="w-full text-left"
                  >
                    <div className="flex gap-3">
                      <img
                        src={withImageBust(booking.item?.image_url, booking.item?.id)}
                        alt={booking.item?.title || "Booked item"}
                        className="w-16 h-20 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{booking.item?.title || "Booked item"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(booking.start_date)} to {formatDate(booking.end_date)}
                        </p>
                        <p className="text-xs mt-1">
                          Status: <span className="font-semibold">{getBookingStatusLabel(booking.status)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Payment:{" "}
                          <span className="font-semibold text-foreground">
                            {String(booking.status || "").toLowerCase() === "paid"
                              ? "Paid"
                              : booking.paid_at || booking.stripe_payment_intent_id || booking.stripe_checkout_session_id
                                ? "Paid, awaiting lender approval"
                                : "Not yet paid"}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Total: ${booking.total_price}</p>
                      </div>
                    </div>
                  </button>

                  {canConfirmReturn && (
                    <div className="mt-3 border-t border-border/60 pt-3">
                      <button
                        type="button"
                        onClick={() => confirmReturnReceivedInGoodCondition(booking.id)}
                        disabled={confirmingReturnBookingId === booking.id}
                        className="h-8 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-muted/40 transition-colors disabled:opacity-60"
                      >
                        {confirmingReturnBookingId === booking.id
                          ? "Confirming..."
                          : "Confirm item returned in good condition"}
                      </button>
                    </div>
                  )}

                  {ratingsEnabled && canRate && (
                    <div className="mt-3 border-t border-border/60 pt-3">
                      <p className="text-xs font-medium mb-1.5">
                        {hasExistingRating ? "Update your rating" : "Rate this rental"}
                      </p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            onClick={() =>
                              setRatingDrafts((prev) => ({
                                ...prev,
                                [booking.id]: value,
                              }))
                            }
                            className="p-0.5"
                          >
                            <Star
                              size={18}
                              className={
                                value <= selectedRating
                                  ? "text-amber-500 fill-amber-500"
                                  : "text-muted-foreground"
                              }
                            />
                          </button>
                        ))}

                        <button
                          onClick={() => submitRating(booking)}
                          disabled={submittingBookingId === booking.id}
                          className="ml-2 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
                        >
                          {submittingBookingId === booking.id
                            ? "Saving..."
                            : hasExistingRating
                            ? "Update"
                            : "Submit"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {activeSection === "likes" && (
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">Your Likes</h2>
              <p className="text-xs text-muted-foreground">Saved listings to revisit later.</p>
            </div>

            {!likesEnabled && (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
                Likes are not configured in your database yet. Add a <code>likes</code> table to enable this section.
              </div>
            )}

            {likesEnabled && likedItems.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
                You have no liked items yet.
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {likedItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/item/${item.id}`)}
                  className="text-left group"
                >
                  <div className="aspect-square overflow-hidden rounded-xl border border-border/30 bg-background">
                    <img
                      src={withImageBust(item.image_url, item.id)}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="mt-1 text-[12px] font-semibold text-foreground truncate">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground">${item.price_per_day}/day</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
