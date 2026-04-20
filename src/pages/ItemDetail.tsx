import { useParams, useNavigate } from "react-router-dom";
import { Suspense, lazy, useState, useEffect, useCallback } from "react";
import { ArrowLeft, MessageCircle, ShoppingBag } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getItemImageUrl } from "@/lib/images";
import "react-datepicker/dist/react-datepicker.css";
import { addToBag, getBagItemIds } from "@/lib/bag";
import { usePageRefresh } from "@/hooks/usePageRefresh";
import ItemCard from "@/components/ItemCard";

const DatePicker = lazy(() => import("react-datepicker"));

function formatDateForInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getDatesBetween(startValue: string, endValue: string) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return [] as Date[];

  const dates: Date[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}

function DatePickerFallback({ placeholder }: { placeholder: string }) {
  return (
    <div className="w-full border rounded-lg p-2 text-sm bg-background text-muted-foreground">
      {placeholder}
    </div>
  );
}

const ItemDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isContinuing, setIsContinuing] = useState(false);
  const [bookedRanges, setBookedRanges] = useState<Array<{ start_date: string; end_date: string }>>([]);
  const [inBag, setInBag] = useState(false);
  const [similarItems, setSimilarItems] = useState<any[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [similarSearched, setSimilarSearched] = useState(false);

  // Fetch item
  const loadCurrentUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setCurrentUserId(data?.user?.id ?? null);
  }, []);

  const fetchItem = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from("items").select("*").eq("id", id).single();

    if (error) {
      console.error(error);
    } else {
      setItem(data);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    if (id) {
      void fetchItem();
    }
  }, [fetchItem, id]);

  useEffect(() => {
    if (!id) return;
    setInBag(getBagItemIds().includes(id));
  }, [id]);

  const loadBookedRanges = useCallback(async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from("bookings")
      .select("start_date,end_date,status")
      .eq("item_id", id)
      .in("status", ["pending", "approved", "paid", "completed"]);

    if (error) {
      console.error("Failed to fetch booked ranges", error);
      return;
    }

    setBookedRanges(
      (data || [])
        .filter((row) => row.start_date && row.end_date)
        .map((row) => ({ start_date: row.start_date, end_date: row.end_date })),
    );
  }, [id]);

  useEffect(() => {
    void loadBookedRanges();
  }, [loadBookedRanges]);

  const refreshItemDetail = useCallback(async () => {
    await Promise.all([loadCurrentUser(), fetchItem(), loadBookedRanges()]);
  }, [fetchItem, loadBookedRanges, loadCurrentUser]);

  usePageRefresh(refreshItemDetail, [refreshItemDetail]);

  const blockedDates = bookedRanges.flatMap((range) =>
    getDatesBetween(range.start_date, range.end_date),
  );

  const handleFindSimilar = async () => {
    if (!item?.id) return;

    try {
      setLoadingSimilar(true);
      setSimilarSearched(true);

      const brandValue = String(item.brand || "").trim();
      const titleWords = String(item.title || "")
        .split(/\s+/)
        .map((word) => word.replace(/[^a-z0-9]/gi, "").trim())
        .filter((word) => word.length >= 4);

      const resultMap = new Map<string, any>();

      if (brandValue) {
        const { data } = await supabase
          .from("items")
          .select("*")
          .neq("id", item.id)
          .eq("brand", brandValue)
          .limit(8);

        (data || []).forEach((row) => resultMap.set(row.id, row));
      }

      for (const word of titleWords.slice(0, 3)) {
        if (resultMap.size >= 8) break;
        const { data } = await supabase
          .from("items")
          .select("*")
          .neq("id", item.id)
          .ilike("title", `%${word}%`)
          .limit(8);

        (data || []).forEach((row) => resultMap.set(row.id, row));
      }

      setSimilarItems(Array.from(resultMap.values()).slice(0, 8));
    } catch (error) {
      console.error("Failed to load similar items", error);
      alert("Could not load similar items right now.");
    } finally {
      setLoadingSimilar(false);
    }
  };

  const handleContinueToBooking = async () => {
    if (!startDate || !endDate) {
      alert("Please select dates");
      return;
    }

    setIsContinuing(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      alert("Please log in first");
      setIsContinuing(false);
      return;
    }

    const ownerId = item.owner_id || item.user_id;
    if (ownerId && user.id === ownerId) {
      alert("You cannot book your own item");
      setIsContinuing(false);
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const days =
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

    if (days <= 0) {
      alert("End date must be after start date");
      setIsContinuing(false);
      return;
    }

    const hasOverlap = bookedRanges.some((range) =>
      rangesOverlap(startDate, endDate, range.start_date, range.end_date),
    );
    if (hasOverlap) {
      alert("Those dates are already booked. Please choose another range.");
      setIsContinuing(false);
      return;
    }

    navigate(`/booking/${item.id}?start=${startDate}&end=${endDate}`, {
      state: {
        itemSnapshot: {
          id: item.id,
          title: item.title,
          image_url: item.image_url,
          price_per_day: item.price_per_day,
          owner_id: item.owner_id,
          user_id: item.user_id,
          allows_pickup: item.allows_pickup,
          allows_dropoff: item.allows_dropoff,
          standard_shipping_price: item.standard_shipping_price,
          express_shipping_price: item.express_shipping_price,
        },
      },
    });
    setIsContinuing(false);
  };

  if (loading) {
    return (
      <div className="app-shell p-5 space-y-5 animate-pulse">
        <div className="w-9 h-9 rounded-full bg-muted" />
        <div className="w-full aspect-[3/4] rounded-2xl bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-1/2 rounded bg-muted" />
          <div className="h-4 w-1/4 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-4/5 rounded bg-muted" />
        </div>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="app-shell p-5 space-y-4">
        <div className="rounded-2xl border border-dashed border-border bg-card p-6">
          <p className="text-base font-semibold text-foreground">Item not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This listing is no longer visible or cannot be booked right now.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/discover")}
          className="h-10 px-4 rounded-xl border border-border/60 bg-card text-sm font-semibold"
        >
          Back to discover
        </button>
      </div>
    );
  }
  const ownerId = item.owner_id || item.user_id;
  const isOwner = Boolean(ownerId && currentUserId === ownerId);

  return (
    <div className="app-shell p-5 space-y-5">
      {/* Back Button */}
      <button onClick={() => navigate(-1)}>
        <ArrowLeft size={20} />
      </button>

      {/* Image */}
      <img
        src={getItemImageUrl(item.image_url, item.id, item.updated_at || item.created_at)}
        alt={item.title}
        className="w-full aspect-[3/4] object-cover rounded-2xl"
      />

      {/* Title */}
      <div>
        <h1 className="text-xl font-bold">{item.title}</h1>
        <p className="text-sm text-muted-foreground">
          ${item.price_per_day}/day
        </p>
        {item.brand && <p className="text-xs text-muted-foreground mt-1">{item.brand}</p>}
        {ownerId && (
          <button
            onClick={() => navigate(`/closet/${ownerId}`)}
            className="text-xs font-semibold text-primary mt-1 hover:underline"
          >
            View poster profile
          </button>
        )}
      </div>

      {/* Description */}
      <p className="text-sm">{item.description}</p>
      <button
        type="button"
        onClick={handleFindSimilar}
        disabled={loadingSimilar}
        className="h-10 px-4 rounded-xl border border-border/60 bg-card text-sm font-semibold disabled:opacity-50"
      >
        {loadingSimilar ? "Finding similar..." : "Find similar items"}
      </button>
      <div className="rounded-xl border border-border/60 bg-card p-3 text-xs text-muted-foreground">
        Local handoff:
        {" "}
        {item.allows_pickup !== false ? "Pickup available" : "Pickup not offered"}
        {" · "}
        {item.allows_dropoff !== false ? "Seller drop-off available" : "Seller drop-off not offered"}
      </div>

      {isOwner ? (
        <button
          onClick={() => navigate(`/list/${item.id}`)}
          className="w-full bg-primary text-white py-3 rounded-xl font-semibold"
        >
          Edit Listing
        </button>
      ) : (
        <div className="bg-card rounded-2xl p-4 space-y-3 border">
          <div className="rounded-xl border border-border/60 bg-background p-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">How it works</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose your dates, send a booking request, and wait for the lender to approve before the rental is confirmed.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (!id) return;
                addToBag(id);
                setInBag(true);
              }}
              className="h-10 rounded-xl border border-border/60 bg-background text-sm font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <ShoppingBag size={14} />
              {inBag ? "In Bag" : "Add to Bag"}
            </button>
            {ownerId && (
              <button
                type="button"
                onClick={() => navigate(`/messages?user=${ownerId}&item=${item.id}`)}
                className="h-10 rounded-xl border border-border/60 bg-background text-sm font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <MessageCircle size={14} />
                Message
              </button>
            )}
          </div>

          <h3 className="font-semibold text-sm">Select Dates</h3>

          <Suspense fallback={<DatePickerFallback placeholder="Loading pickup calendar..." />}>
            <DatePicker
              selected={parseDate(startDate)}
              onChange={(date) => setStartDate(date ? formatDateForInput(date) : "")}
              minDate={new Date()}
              excludeDates={blockedDates}
              placeholderText="Pickup date"
              className="w-full border rounded-lg p-2 text-sm bg-background"
              dateFormat="yyyy-MM-dd"
            />
          </Suspense>

          <Suspense fallback={<DatePickerFallback placeholder="Loading return calendar..." />}>
            <DatePicker
              selected={parseDate(endDate)}
              onChange={(date) => setEndDate(date ? formatDateForInput(date) : "")}
              minDate={parseDate(startDate) || new Date()}
              excludeDates={blockedDates}
              placeholderText="Return date"
              className="w-full border rounded-lg p-2 text-sm bg-background"
              dateFormat="yyyy-MM-dd"
            />
          </Suspense>

          {bookedRanges.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Booked dates are disabled.
            </p>
          )}

          <button
            onClick={handleContinueToBooking}
            disabled={!startDate || !endDate || isContinuing}
            className="w-full bg-primary text-white py-3 rounded-xl font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {isContinuing ? "Preparing booking..." : "Request Booking"}
          </button>
        </div>
      )}

      {similarSearched && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Similar items</h2>
            <p className="text-sm text-muted-foreground">
              Based on brand and title matches from current listings.
            </p>
          </div>

          {similarItems.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
              No similar items found yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {similarItems.map((similarItem) => (
                <ItemCard key={similarItem.id} item={similarItem} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default ItemDetail;
