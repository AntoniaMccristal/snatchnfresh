import { useState, useMemo, useEffect, useCallback } from "react";
import { Bell, BellRing, MapPin, ShoppingBag, Sparkles, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ItemCard from "@/components/ItemCard";
import BrandMark from "@/components/BrandMark";
import CategoryFilter from "@/components/CategoryFilter";
import { categories as defaultCategories } from "@/data/mockData";
import { getItemImageUrl } from "@/lib/images";
import { supabase } from "@/lib/supabaseClient";
import { getBagItemIds } from "@/lib/bag";
import { usePageRefresh } from "@/hooks/usePageRefresh";

function normalizeCategory(value?: string) {
  if (!value) return "Other";
  const normalized = value.trim().toLowerCase();

  if (normalized.includes("dress")) return "Dresses";
  if (normalized.includes("top") || normalized.includes("shirt") || normalized.includes("blouse")) return "Tops";
  if (normalized.includes("bottom") || normalized.includes("pant") || normalized.includes("trouser") || normalized.includes("skirt")) return "Bottoms";
  if (normalized.includes("outer") || normalized.includes("jacket") || normalized.includes("coat") || normalized.includes("blazer")) return "Outerwear";
  if (normalized.includes("accessor") || normalized.includes("bag") || normalized.includes("jewel")) return "Accessories";

  return value;
}

function getItemDistance(item: any) {
  if (item.distance) return String(item.distance);
  if (item.distance_km) return `${item.distance_km} km`;
  const idSeed = String(item.id || "0")
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const km = (idSeed % 17) + 2;
  return `${km} km`;
}

function getItemLocation(item: any) {
  return item.location || item.suburb || "Sydney";
}

type NotificationEntry = {
  id: string;
  text: string;
  time: string;
  read: boolean;
  kind?: "info" | "pending-request";
  bookingId?: string;
  itemTitle?: string;
  itemId?: string;
  itemImageUrl?: string;
  totalPrice?: number;
  startDate?: string;
  endDate?: string;
  paidAlready?: boolean;
  renterName?: string;
  renterAvatarUrl?: string;
  sortTs?: number;
};

const Home = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>();
  const [items, setItems] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [bookingActionId, setBookingActionId] = useState<string | null>(null);
  const [bagCount, setBagCount] = useState(0);
  const [likedItems, setLikedItems] = useState<any[]>([]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const loadHomeFeed = useCallback(async () => {
    const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching items:", error);
    } else {
      setItems(data || []);
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    setCurrentUserId(user?.id || null);
    if (!user) {
      setLikedItems([]);
      return;
    }

    const { data: likeRows, error: likesError } = await supabase
      .from("likes")
      .select("item_id")
      .eq("user_id", user.id);

    if (likesError) {
      setLikedItems([]);
      return;
    }

    const likedIds = (likeRows || []).map((row) => row.item_id).filter(Boolean);
    if (likedIds.length === 0) {
      setLikedItems([]);
      return;
    }

    const { data: liked } = await supabase.from("items").select("*").in("id", likedIds);
    setLikedItems(liked || []);
  }, []);

  useEffect(() => {
    void loadHomeFeed();
  }, [loadHomeFeed]);

  usePageRefresh(loadHomeFeed, [loadHomeFeed]);

  const loadOwnerItemsForUser = useCallback(async (userId: string) => {
    const byOwner = await supabase
      .from("items")
      .select("id,title,image_url,updated_at,created_at")
      .eq("owner_id", userId);

    const ownerMissing =
      byOwner.error?.code === "42703" ||
      String(byOwner.error?.message || "").toLowerCase().includes("owner_id");

    if (byOwner.error && !ownerMissing) {
      throw byOwner.error;
    }

    const byUser = await supabase
      .from("items")
      .select("id,title,image_url,updated_at,created_at")
      .eq("user_id", userId);

    const userMissing =
      byUser.error?.code === "42703" ||
      String(byUser.error?.message || "").toLowerCase().includes("user_id");

    if (byUser.error && !userMissing) {
      throw byUser.error;
    }

    const merged = [...(byOwner.data || []), ...(byUser.data || [])];
    return Array.from(new Map(merged.map((item: any) => [item.id, item])).values());
  }, []);

  const loadRealNotifications = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        setNotifications([]);
        return;
      }

      const persistedReadsRaw = localStorage.getItem(`snatchn-notification-reads:${user.id}`);
      const persistedReads = new Set<string>(persistedReadsRaw ? JSON.parse(persistedReadsRaw) : []);
      const entries: NotificationEntry[] = [];
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (token) {
        const ownerRequestResponse = await fetch("/api/owner-booking-requests", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const ownerRequestPayload = await ownerRequestResponse.json().catch(() => ({}));

        const pendingRows = Array.isArray(ownerRequestPayload?.requests) ? ownerRequestPayload.requests : [];

        pendingRows.forEach((booking: any) => {
          const title = booking.item_title || "your listing";
          entries.push({
            id: `pending-${booking.id}`,
            kind: "pending-request",
            bookingId: booking.id,
            itemId: booking.item_id,
            itemTitle: title,
            itemImageUrl: booking.item_image_url || "",
            totalPrice: Number(booking.total_price || 0),
            startDate: booking.start_date || "",
            endDate: booking.end_date || "",
            paidAlready: Boolean(
              booking.paid_at || booking.stripe_payment_intent_id || booking.stripe_checkout_session_id,
            ),
            renterName: booking.renter_name || "Renter",
            renterAvatarUrl: String(booking.renter_avatar_url || "").trim(),
            text: `New booking request for ${title}`,
            time: booking.created_at
              ? new Date(booking.created_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "recently",
            read: persistedReads.has(`pending-${booking.id}`),
            sortTs: booking.created_at ? new Date(booking.created_at).getTime() : Date.now(),
          });
        });
      }

      const { data: bookingRows } = await supabase
        .from("bookings")
        .select("id,status,item_id,updated_at,paid_at")
        .eq("renter_id", user.id)
        .in("status", ["approved", "rejected", "paid", "cancelled"])
        .order("updated_at", { ascending: false })
        .limit(15);

      if (bookingRows && bookingRows.length > 0) {
        const itemIds = Array.from(new Set(bookingRows.map((b) => b.item_id).filter(Boolean)));
        const { data: itemRows } = itemIds.length
          ? await supabase.from("items").select("id,title").in("id", itemIds)
          : { data: [] as any[] };

        const itemMap = new Map((itemRows || []).map((i: any) => [i.id, i]));

        bookingRows.forEach((booking: any) => {
          const itemTitle = itemMap.get(booking.item_id)?.title || "your booking";
          const status = String(booking.status || "").toLowerCase();
          let text = `Update on ${itemTitle}`;
          if (status === "approved") text = `Booking approved by lender for ${itemTitle}`;
          if (status === "rejected") text = `Booking request declined for ${itemTitle}`;
          if (status === "paid") {
            text = booking.paid_at
              ? `Booking approved by lender for ${itemTitle} · payment confirmed`
              : `Payment confirmed for ${itemTitle}`;
          }
          if (status === "cancelled") text = `Booking cancelled for ${itemTitle}`;

          entries.push({
            id: `booking-${booking.id}`,
            kind: "info",
            bookingId: booking.id,
            text,
            time: booking.updated_at ? new Date(booking.updated_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "recently",
            read: persistedReads.has(`booking-${booking.id}`),
            sortTs: booking.updated_at ? new Date(booking.updated_at).getTime() : Date.now(),
          });
        });
      }

      const { data: unreadMessages, error: unreadError } = await supabase
        .from("messages")
        .select("id,created_at")
        .eq("receiver_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!unreadError && unreadMessages && unreadMessages.length > 0) {
        unreadMessages.forEach((message: any) => {
          entries.push({
            id: `message-${message.id}`,
            kind: "info",
            text: "You have a new message",
            time: message.created_at ? new Date(message.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "recently",
            read: persistedReads.has(`message-${message.id}`),
            sortTs: message.created_at ? new Date(message.created_at).getTime() : Date.now(),
          });
        });
      }

      const sorted = entries
        .slice(0, 30)
        .sort((a, b) => Number(b.sortTs || 0) - Number(a.sortTs || 0));
      setNotifications(sorted.slice(0, 20));
    } catch (error) {
      console.error("loadRealNotifications error", error);
      setNotifications([]);
    }
  }, [loadOwnerItemsForUser]);

  useEffect(() => {
    if (searchParams.get("notifications") === "1") {
      setShowNotifications(true);
      const next = new URLSearchParams(searchParams);
      next.delete("notifications");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  async function updateBookingFromNotification(notification: NotificationEntry, action: "approve" | "reject") {
    if (!notification.bookingId) return;
    setBookingActionId(notification.bookingId);

    try {
      const nextStatus =
        action === "approve"
          ? "approved"
          : "rejected";

      const { error } = await supabase
        .from("bookings")
        .update({ status: nextStatus })
        .eq("id", notification.bookingId);

      if (error) {
        throw error;
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        const persistedReadsRaw = localStorage.getItem(`snatchn-notification-reads:${userId}`);
        const persistedReads = new Set<string>(persistedReadsRaw ? JSON.parse(persistedReadsRaw) : []);
        persistedReads.add(notification.id);
        localStorage.setItem(`snatchn-notification-reads:${userId}`, JSON.stringify(Array.from(persistedReads)));
      }

      await loadRealNotifications();
    } catch (error: any) {
      alert(error?.message || "Could not update booking request.");
    } finally {
      setBookingActionId(null);
    }
  }

  useEffect(() => {
    const loadBagCount = () => {
      setBagCount(getBagItemIds().length);
    };

    loadRealNotifications();
    loadBagCount();
    window.addEventListener("snatchn:bag-updated", loadBagCount);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadRealNotifications();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const bookingChannel = supabase
      .channel("snatchn-owner-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          loadRealNotifications();
        },
      )
      .subscribe();

    return () => {
      window.removeEventListener("snatchn:bag-updated", loadBagCount);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(bookingChannel);
    };
  }, [loadRealNotifications]);

  const availableItems = useMemo(
    () =>
      items.filter((item) => {
        if (item.is_available === false) return false;
        if (!currentUserId) return true;
        return (item.owner_id || item.user_id) !== currentUserId;
      }),
    [items, currentUserId],
  );

  const categoryOptions = useMemo(() => {
    const discovered = new Set<string>();
    availableItems.forEach((item) => {
      discovered.add(normalizeCategory(item.category));
    });

    const merged = ["All", ...defaultCategories.filter((c) => c !== "All")];
    Array.from(discovered).forEach((category) => {
      if (!merged.includes(category)) merged.push(category);
    });

    return merged;
  }, [availableItems]);

  const filteredItems = useMemo(() => {
    return availableItems.filter((item) => {
      const itemCategory = normalizeCategory(item.category);

      if (selectedCategory !== "All" && itemCategory !== selectedCategory) return false;
      if (selectedCollection && item.collection !== selectedCollection) return false;
      return true;
    });
  }, [availableItems, selectedCategory, selectedCollection]);

  const activeOffers = useMemo(() => {
    return availableItems.slice(0, 3).map((item) => ({
      id: item.id,
      seller: item.owner_name || item.brand || "Local lender",
      item: item.title,
      price: item.price_per_day,
      distance: getItemDistance(item),
      location: getItemLocation(item),
      avatar: (item.title || "S").slice(0, 2).toUpperCase(),
    }));
  }, [availableItems]);

  const aiPicks = useMemo(() => {
    if (likedItems.length === 0) return availableItems.slice(0, 4);

    const likedCategories = new Set(likedItems.map((item) => normalizeCategory(item.category)));
    const likedBrands = new Set(likedItems.map((item) => item.brand).filter(Boolean));
    const likedIds = new Set(likedItems.map((item) => item.id));

    const scored = availableItems
      .filter((item) => !likedIds.has(item.id))
      .map((item) => {
        let score = 0;

        if (likedCategories.has(normalizeCategory(item.category))) score += 3;
        if (item.brand && likedBrands.has(item.brand)) score += 2;

        const likedPriceAvg = likedItems.reduce((sum, liked) => sum + Number(liked.price_per_day || 0), 0) / likedItems.length;
        const delta = Math.abs(Number(item.price_per_day || 0) - likedPriceAvg);
        if (delta <= 5) score += 2;
        else if (delta <= 10) score += 1;

        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.item);

    return scored.length > 0 ? scored : availableItems.slice(0, 4);
  }, [availableItems, likedItems]);

  const markAllRead = () => {
    setNotifications((prev) => {
      const next = prev.map((notification) => ({ ...notification, read: true }));
      supabase.auth.getUser().then(({ data }) => {
        const user = data?.user;
        if (!user) return;
        localStorage.setItem(
          `snatchn-notification-reads:${user.id}`,
          JSON.stringify(next.map((n) => n.id)),
        );
      });
      return next;
    });
  };

  return (
    <div className="app-shell bg-warm-gradient pb-24 page-transition">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-card shadow-soft">
                <BrandMark size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Snatch'n</h1>
                <div className="flex items-center gap-1 text-[12px] text-muted-foreground mt-0.5">
                  <MapPin size={11} className="text-primary" />
                  <span>Sydney, AU · Near you</span>
                </div>
              </div>
            </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/bag")}
              className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center relative shadow-soft transition-all hover:shadow-card cursor-pointer"
              aria-label="Open bag"
            >
              <ShoppingBag size={17} className="text-foreground" />
              {bagCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 font-semibold text-center">
                  {bagCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowNotifications((prev) => !prev)}
              className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center relative shadow-soft transition-all hover:shadow-card cursor-pointer pointer-events-auto z-50"
              aria-label="Open notifications"
              aria-expanded={showNotifications}
            >
              <Bell size={17} className="text-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 font-semibold text-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

          <div className="-mx-1 border-t border-border/30 pt-1">
            <CategoryFilter selected={selectedCategory} onSelect={(c) => {
              setSelectedCategory(c);
              setSelectedCollection(undefined);
            }} categories={categoryOptions} />
          </div>
        </div>

        {showNotifications && (
          <>
            <button
              type="button"
              onClick={() => setShowNotifications(false)}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
              aria-label="Close notifications"
            />
            <section className="fixed top-4 right-4 left-4 sm:left-auto sm:w-[390px] z-50 rounded-3xl border border-border/60 bg-card shadow-[0_20px_60px_-24px_rgba(0,0,0,0.35)] overflow-hidden">
              <div className="bg-primary-gradient px-4 py-3.5 text-primary-foreground">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BellRing size={16} />
                    <p className="text-sm font-semibold">Notifications</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center"
                    aria-label="Close"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-xs opacity-90 mt-1">
                  {unreadCount > 0 ? `${unreadCount} unread updates` : "You're all caught up"}
                </p>
              </div>

              <div className="p-3 max-h-[55vh] overflow-y-auto space-y-2">
                {notifications.length === 0 && (
                  <div className="rounded-2xl border border-border/40 bg-background/40 px-3 py-3">
                    <p className="text-[12px] text-muted-foreground">No notifications yet.</p>
                  </div>
                )}
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`rounded-2xl border px-3 py-2.5 ${
                      notification.read
                        ? "border-border/40 bg-background/40"
                        : "border-primary/20 bg-primary/5"
                    }`}
                  >
                    <p className="text-[12px] text-foreground">{notification.text}</p>
                    {notification.kind === "pending-request" && (
                      <>
                        <div className="mt-2 flex items-center gap-2">
                          {notification.itemImageUrl ? (
                            <img
                              src={getItemImageUrl(notification.itemImageUrl, notification.itemId)}
                              alt={notification.itemTitle || "Listing"}
                              className="w-11 h-11 rounded-lg object-cover border border-border/40"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-lg border border-border/40 bg-background/70 flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                              {String(notification.itemTitle || "I").slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            {notification.renterAvatarUrl ? (
                              <img
                                src={notification.renterAvatarUrl}
                                alt={notification.renterName || "Renter"}
                                className="w-8 h-8 rounded-full object-cover border border-border/40"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center">
                                {String(notification.renterName || "R").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-foreground truncate">
                                {notification.renterName || "Renter"}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                Requesting {notification.itemTitle || "your listing"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-1">
                          {notification.startDate} to {notification.endDate}
                          {Number.isFinite(notification.totalPrice)
                            ? ` · $${notification.totalPrice}`
                            : ""}
                        </p>
                        {notification.paidAlready && (
                          <p className="text-[11px] text-foreground mt-1">
                            Payment received. Approve request to confirm this rental.
                          </p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateBookingFromNotification(notification, "approve")}
                            disabled={bookingActionId === notification.bookingId}
                            className="h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-60"
                          >
                            {bookingActionId === notification.bookingId ? "..." : "Approve request"}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBookingFromNotification(notification, "reject")}
                            disabled={bookingActionId === notification.bookingId}
                            className="h-7 px-2.5 rounded-lg border border-border text-[11px] font-semibold disabled:opacity-60"
                          >
                            Decline request
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate("/profile")}
                            className="h-7 px-2.5 rounded-lg border border-border text-[11px] font-semibold"
                          >
                            Profile
                          </button>
                        </div>
                      </>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">{notification.time}</p>
                  </div>
                ))}
              </div>

              <div className="px-3 pb-3">
                <button
                  type="button"
                  onClick={markAllRead}
                  className="w-full h-9 rounded-xl bg-card border border-border text-[12px] font-semibold hover:bg-muted/40 transition-colors"
                >
                  Mark all as read
                </button>
              </div>
            </section>
          </>
        )}
      </header>
      <div className="mx-auto w-full max-w-7xl px-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredItems.length}</span> items near you
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {filteredItems.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-5 mb-8">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <h3 className="font-display text-base font-semibold text-foreground mb-2 inline-flex items-center gap-1.5">
            <Sparkles size={15} className="text-primary" />
            AI Picks For You
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Based on your likes, these listings match your style and typical price range.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {aiPicks.map((item) => (
              <ItemCard key={`ai-${item.id}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
