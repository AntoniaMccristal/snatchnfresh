import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Star } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

type ReviewTab = "renter" | "snatchr";

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString();
}

export default function Reviews() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const [loading, setLoading] = useState(true);
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [targetName, setTargetName] = useState<string>("Reviews");
  const [activeTab, setActiveTab] = useState<ReviewTab>("renter");
  const [reviewsEnabled, setReviewsEnabled] = useState(true);
  const [renterReviews, setRenterReviews] = useState<any[]>([]);
  const [snatchrReviews, setSnatchrReviews] = useState<any[]>([]);
  const [itemsById, setItemsById] = useState<Record<string, any>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        let target = userId || "";
        if (!target) {
          const { data: authData } = await supabase.auth.getUser();
          const me = authData?.user?.id || "";
          if (!me) {
            navigate("/auth");
            return;
          }
          target = me;
        }

        setTargetUserId(target);

        const { data: authData } = await supabase.auth.getUser();
        const authUser = authData?.user || null;

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name,username")
          .eq("id", target)
          .maybeSingle();

        const metadataName =
          [authUser?.user_metadata?.first_name, authUser?.user_metadata?.last_name]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          authUser?.user_metadata?.full_name ||
          authUser?.user_metadata?.username ||
          (authUser?.email ? String(authUser.email).split("@")[0] : "");

        const name = profile?.full_name || profile?.username || metadataName || "Profile";
        setTargetName(`${name}'s Reviews`);

        const { data: ratingsRows, error: ratingsError } = await supabase
          .from("ratings")
          .select("id,booking_id,item_id,rating,comment,created_at,rated_user_id")
          .eq("rated_user_id", target)
          .order("created_at", { ascending: false });

        if (ratingsError) {
          const missingRatings =
            ratingsError.code === "42P01" ||
            String(ratingsError.message || "").toLowerCase().includes("relation");
          if (missingRatings) {
            setReviewsEnabled(false);
            setRenterReviews([]);
            setSnatchrReviews([]);
            return;
          }
          throw ratingsError;
        }

        const ratings = ratingsRows || [];
        if (ratings.length === 0) {
          setRenterReviews([]);
          setSnatchrReviews([]);
          return;
        }

        const itemIds = Array.from(new Set(ratings.map((row: any) => row.item_id).filter(Boolean)));
        if (itemIds.length > 0) {
          const { data: itemRows } = await supabase
            .from("items")
            .select("id,title")
            .in("id", itemIds);
          const byId: Record<string, any> = {};
          (itemRows || []).forEach((item: any) => {
            byId[item.id] = item;
          });
          setItemsById(byId);
        } else {
          setItemsById({});
        }

        const bookingIds = Array.from(new Set(ratings.map((row: any) => row.booking_id).filter(Boolean)));
        let bookingById = new Map<string, any>();
        if (bookingIds.length > 0) {
          const { data: bookingRows } = await supabase
            .from("bookings")
            .select("id,renter_id,owner_id,item_id")
            .in("id", bookingIds);
          bookingById = new Map((bookingRows || []).map((row: any) => [row.id, row]));
        }

        const renter: any[] = [];
        const snatchr: any[] = [];
        ratings.forEach((review: any) => {
          const booking = review.booking_id ? bookingById.get(review.booking_id) : null;
          if (booking?.renter_id === target) {
            renter.push(review);
            return;
          }
          if (booking?.owner_id === target) {
            snatchr.push(review);
            return;
          }
          snatchr.push(review);
        });

        setReviewsEnabled(true);
        setRenterReviews(renter);
        setSnatchrReviews(snatchr);
      } catch (error) {
        console.error("Reviews load error", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, userId]);

  const activeReviews = activeTab === "renter" ? renterReviews : snatchrReviews;
  const tabAverage = useMemo(() => {
    if (activeReviews.length === 0) return 0;
    const total = activeReviews.reduce((sum, row) => sum + Number(row.rating || 0), 0);
    return Number((total / activeReviews.length).toFixed(1));
  }, [activeReviews]);

  if (loading) {
    return <div className="app-shell p-6">Loading reviews...</div>;
  }

  return (
    <div className="app-shell bg-warm-gradient pb-24 page-transition">
      <header className="px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <div>
          <h1 className="text-base font-display font-semibold text-foreground">{targetName}</h1>
          <p className="text-xs text-muted-foreground">
            {activeReviews.length} review{activeReviews.length === 1 ? "" : "s"} · {tabAverage || 0} avg
          </p>
        </div>
      </header>

      <div className="px-5">
        {!reviewsEnabled && (
          <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
            Reviews are not configured in your database yet.
          </div>
        )}

        {reviewsEnabled && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setActiveTab("renter")}
                className={`h-9 rounded-xl border text-xs font-semibold ${
                  activeTab === "renter"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground"
                }`}
              >
                As Renter ({renterReviews.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("snatchr")}
                className={`h-9 rounded-xl border text-xs font-semibold ${
                  activeTab === "snatchr"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground"
                }`}
              >
                As Snatch&apos;r ({snatchrReviews.length})
              </button>
            </div>

            {activeReviews.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
                No reviews in this section yet.
              </div>
            )}

            <div className="space-y-2">
              {activeReviews.map((review) => (
                <div key={review.id} className="rounded-2xl border border-border/60 bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, index) => {
                        const value = index + 1;
                        const active = value <= Number(review.rating || 0);
                        return (
                          <Star
                            key={`${review.id}-${value}`}
                            size={14}
                            className={active ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}
                          />
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{formatDate(review.created_at)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {itemsById[review.item_id]?.title || "Rental item"}
                  </p>
                  <p className="text-sm text-foreground mt-1">{review.comment || "No written comment."}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
