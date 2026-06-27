import type { Dispatch, SetStateAction } from "react";
import { MessageCircle, Shirt } from "lucide-react";

type WardrobeTabProps = {
  incomingRequests: any[];
  myWardrobe: any[];
  ownerBookings: any[];
  trackingDrafts: Record<string, string>;
  deletingItemId: string | null;
  updatingOwnerBookingId: string | null;
  navigate: (to: string) => void;
  withImageBust: (url?: string, itemId?: string) => string;
  formatDate: (value?: string) => string;
  getBookingStatusLabel: (value?: string) => string;
  getStatusColor: (value?: string) => string;
  updateIncomingRequest: (bookingId: string, status: "approved" | "rejected") => void;
  deleteWardrobeItem: (itemId: string) => void;
  setTrackingDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  saveTracking: (bookingId: string) => void;
  markDelivered: (bookingId: string) => void;
  openReturnModal: (bookingId: string) => void;
  openDisputeModal: (bookingId: string) => void;
  handleLenderCancel: (bookingId: string) => void;
  markItemAvailable: (itemId: string) => void;
};

export default function WardrobeTab({
  incomingRequests,
  myWardrobe,
  ownerBookings,
  trackingDrafts,
  deletingItemId,
  updatingOwnerBookingId,
  navigate,
  withImageBust,
  formatDate,
  getBookingStatusLabel,
  getStatusColor,
  updateIncomingRequest,
  deleteWardrobeItem,
  setTrackingDrafts,
  saveTracking,
  markDelivered,
  openReturnModal,
  openDisputeModal,
  handleLenderCancel,
  markItemAvailable,
}: WardrobeTabProps) {
  const overdueBookings = ownerBookings.filter((booking) =>
    booking.end_date && new Date(booking.end_date) < new Date() && !booking.item_returned_at,
  );

  return (
    <>
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
                    <p className="text-xs text-muted-foreground">{formatDate(booking.start_date)} - {formatDate(booking.end_date)}</p>
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
                    onClick={() => navigate(`/messages?user=${booking.renter_id}&item=${booking.item_id}`)}
                    className="flex-1 h-9 rounded-xl border border-border/60 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle size={13} /> Message renter
                  </button>
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
                    {item.availability_status && item.availability_status !== "available" && (
                      <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
                        <span className="bg-white text-foreground text-[10px] font-bold px-3 py-1.5 rounded-full">
                          {item.availability_status === "needs_cleaning" ? "Needs cleaning" : "Needs repair"}
                        </span>
                      </div>
                    )}
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
                {item.availability_status && item.availability_status !== "available" && (
                  <button
                    onClick={() => markItemAvailable(item.id)}
                    className="w-full mt-1 h-7 rounded-xl border border-primary text-primary text-[10px] font-bold"
                  >
                    Mark as available
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {overdueBookings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4">
          <p className="text-sm font-bold text-amber-900">
            You have rentals past their return date
          </p>
          <p className="text-xs text-amber-800 mt-1">
            Please confirm items have been returned to release your payout.
          </p>
        </div>
      )}

      {ownerBookings.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3">Active rentals</h2>
          <div className="space-y-3">
            {ownerBookings.map((booking) => {
              const bookingStatus = String(booking.status || "").toLowerCase();
              const rentalEndPassed = booking.end_date && new Date(booking.end_date) < new Date();
              const showReturnButton = !booking.item_returned_at
                && (rentalEndPassed || ["approved", "paid"].includes(bookingStatus));
              const showCancelButton = ["approved", "paid"].includes(bookingStatus);

              return (
                <div key={booking.id} className="bg-card rounded-2xl border border-border/50 shadow-soft p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-foreground">{formatDate(booking.start_date)} - {formatDate(booking.end_date)}</p>
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
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => navigate(`/messages?user=${booking.renter_id}&item=${booking.item_id}`)}
                      className="flex-1 h-9 rounded-xl border border-border/60 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <MessageCircle size={13} /> Message renter
                    </button>
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
                  </div>
                  {showReturnButton && (
                    <div className="space-y-2 mt-2">
                      <button
                        onClick={() => openReturnModal(booking.id)}
                        disabled={updatingOwnerBookingId === booking.id}
                        className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60"
                      >
                        {updatingOwnerBookingId === booking.id ? "Working..." : "Item returned in good condition - release payout"}
                      </button>
                      <button
                        onClick={() => openDisputeModal(booking.id)}
                        disabled={updatingOwnerBookingId === booking.id}
                        className="w-full h-10 rounded-xl border border-red-300 text-red-600 text-xs font-semibold disabled:opacity-60"
                      >
                        Item returned damaged - raise a dispute
                      </button>
                    </div>
                  )}
                  {showCancelButton && (
                    <button
                      onClick={() => handleLenderCancel(booking.id)}
                      disabled={updatingOwnerBookingId === booking.id}
                      className="w-full h-9 rounded-xl border border-red-200 text-red-600 text-xs font-semibold mt-2 disabled:opacity-60"
                    >
                      Cancel rental (renter didn&apos;t show)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
