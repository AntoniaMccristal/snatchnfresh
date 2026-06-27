import type { Dispatch, SetStateAction } from "react";
import { MessageCircle, Sparkles, Star } from "lucide-react";

type SnatchesTabProps = {
  mySnatches: any[];
  myRatingsByBooking: Record<string, number>;
  ratingDrafts: Record<string, number>;
  ratingsEnabled: boolean;
  submittingBookingId: string | null;
  confirmingReturnBookingId: string | null;
  navigate: (to: string) => void;
  withImageBust: (url?: string, itemId?: string) => string;
  formatDate: (value?: string) => string;
  getBookingStatusLabel: (value?: string) => string;
  getStatusColor: (value?: string) => string;
  setRatingDrafts: Dispatch<SetStateAction<Record<string, number>>>;
  submitRating: (booking: any) => void;
  confirmReturnReceivedInGoodCondition: (bookingId: string) => void;
};

const RATEABLE_STATUSES = new Set(["approved", "paid", "completed", "returned"]);

export default function SnatchesTab({
  mySnatches,
  myRatingsByBooking,
  ratingDrafts,
  ratingsEnabled,
  submittingBookingId,
  confirmingReturnBookingId,
  navigate,
  withImageBust,
  formatDate,
  getBookingStatusLabel,
  getStatusColor,
  setRatingDrafts,
  submitRating,
  confirmReturnReceivedInGoodCondition,
}: SnatchesTabProps) {
  return (
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
          const canRate = RATEABLE_STATUSES.has(String(booking.status || "").toLowerCase())
            && Boolean(booking.item_returned_at);
          const bookingStatus = String(booking.status || "").toLowerCase();
          const canConfirmReturn = ["approved", "paid", "completed"].includes(bookingStatus)
            && !booking.item_returned_at
            && booking.delivery_method !== "pickup"
            && booking.tracking_status === "delivered";
          const lenderId = booking.owner_id || booking.item?.owner_id || booking.item?.user_id;
          const isCancelled = bookingStatus === "cancelled";

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
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(booking.start_date)} - {formatDate(booking.end_date)}</p>
                    <p className="text-xs text-muted-foreground">${booking.total_price}</p>
                    <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusColor(booking.status)}`}>
                      {getBookingStatusLabel(booking.status)}
                    </span>
                  </div>
                </div>
              </button>

              {lenderId && (
                <button
                  onClick={() => navigate(`/messages?user=${lenderId}&item=${booking.item_id}`)}
                  className="w-full h-9 rounded-xl border border-border/60 text-xs font-semibold flex items-center justify-center gap-1.5 mt-2"
                >
                  <MessageCircle size={13} /> Message lender
                </button>
              )}

              {isCancelled && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                  <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    Cancelled by lender
                  </span>
                  <p className="text-xs text-red-700 mt-2">
                    Your payment will be refunded within 5-10 business days.
                  </p>
                </div>
              )}

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
  );
}
