import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BanknoteIcon, Clock, Lock, ShieldCheck, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type WalletBooking = {
  id: string;
  item_title?: string;
  item_image_url?: string;
  lender_payout_amount: number;
  total_price: number;
  payout_status: string;
  payout_released_at?: string;
  item_returned_at?: string;
  paid_at?: string;
  start_date: string;
  end_date: string;
  status: string;
  stripe_transfer_destination?: string;
};

function getWalletState(booking: WalletBooking): "pending" | "available" | "released" | "on_hold" {
  const payout = String(booking.payout_status || "").toLowerCase();
  const status = String(booking.status || "").toLowerCase();
  if (payout === "released" || booking.payout_released_at) return "released";
  if (status === "rejected" || status === "cancelled") return "on_hold";
  if (booking.item_returned_at) return "available";
  if (booking.paid_at) return "pending";
  return "pending";
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatAUD(amount: number) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

export default function SnatchnWallet({ userId, stripeConnected, onConnectStripe }: {
  userId: string;
  stripeConnected: boolean;
  onConnectStripe: () => void;
}) {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<WalletBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    try {
      // Get bookings where this user is the lender/owner
      const { data: ownerBookings } = await supabase
        .from("bookings")
        .select("id,item_id,lender_payout_amount,total_price,payout_status,payout_released_at,item_returned_at,paid_at,start_date,end_date,status,stripe_transfer_destination,stripe_payment_intent_id")
        .eq("owner_id", userId)
        .not("paid_at", "is", null)
        .order("created_at", { ascending: false });

      if (!ownerBookings || ownerBookings.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      // Fetch item titles/images
      const itemIds = [...new Set(ownerBookings.map((b) => b.item_id).filter(Boolean))];
      const { data: items } = await supabase
        .from("items")
        .select("id,title,image_url")
        .in("id", itemIds);

      const itemMap = new Map((items || []).map((i) => [i.id, i]));

      setBookings(ownerBookings.map((b) => ({
        ...b,
        item_title: itemMap.get(b.item_id)?.title || "Listing",
        item_image_url: itemMap.get(b.item_id)?.image_url || "",
      })));
    } catch (err) {
      console.error("Wallet load error", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void loadWallet(); }, [loadWallet]);

  // Calculate totals
  const pending = bookings.filter((b) => getWalletState(b) === "pending");
  const available = bookings.filter((b) => getWalletState(b) === "available");
  const released = bookings.filter((b) => getWalletState(b) === "released");

  const pendingTotal = pending.reduce((sum, b) => sum + Number(b.lender_payout_amount || 0), 0);
  const availableTotal = available.reduce((sum, b) => sum + Number(b.lender_payout_amount || 0), 0);
  const releasedTotal = released.reduce((sum, b) => sum + Number(b.lender_payout_amount || 0), 0);

  const hasAnyActivity = bookings.length > 0;

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-4 animate-pulse">
        <div className="h-4 rounded-full bg-muted w-32 mb-3" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* Header card */}
      <div className="rounded-2xl border border-border/50 bg-card shadow-soft overflow-hidden">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/40">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BanknoteIcon size={17} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Snatch'n Wallet</p>
            <p className="text-[11px] text-muted-foreground">Your earnings from rentals</p>
          </div>
        </div>

        {/* Balance tiles */}
        <div className="grid grid-cols-3 divide-x divide-border/40">
          <div className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Clock size={11} className="text-amber-600" />
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Pending</p>
            </div>
            <p className="text-base font-bold text-foreground">{formatAUD(pendingTotal)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{pending.length} rental{pending.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ShieldCheck size={11} className="text-green-600" />
              <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">Available</p>
            </div>
            <p className="text-base font-bold text-foreground">{formatAUD(availableTotal)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{available.length} rental{available.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp size={11} className="text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Paid out</p>
            </div>
            <p className="text-base font-bold text-foreground">{formatAUD(releasedTotal)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{released.length} rental{released.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* Connect bank CTA — shown if no payout method */}
      {!stripeConnected && hasAnyActivity && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Lock size={16} className="text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900">Connect your bank to get paid</p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                You have {formatAUD(pendingTotal + availableTotal)} waiting. Connect your bank account so we can release your earnings once rentals are returned.
              </p>
            </div>
          </div>
          <button
            onClick={onConnectStripe}
            className="w-full mt-3 h-10 rounded-xl bg-amber-900 text-amber-50 text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            Connect bank account <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Connect bank CTA — no activity yet */}
      {!stripeConnected && !hasAnyActivity && (
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <div className="flex items-start gap-3">
            <BanknoteIcon size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Add your payout method</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Connect your bank account so you can receive payments when someone rents your items.
              </p>
            </div>
          </div>
          <button
            onClick={onConnectStripe}
            className="w-full mt-3 h-10 rounded-xl border border-border/60 text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            Connect bank account <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Connected + available to withdraw */}
      {stripeConnected && availableTotal > 0 && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-green-900">
                {formatAUD(availableTotal)} ready to withdraw
              </p>
              <p className="text-xs text-green-800 mt-0.5">
                {available.length} rental{available.length !== 1 ? "s" : ""} completed — payout releasing soon
              </p>
            </div>
            <ShieldCheck size={20} className="text-green-600 flex-shrink-0" />
          </div>
        </div>
      )}

      {/* Transaction list */}
      {hasAnyActivity && (
        <div className="rounded-2xl border border-border/50 bg-card shadow-soft overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recent transactions</p>
          </div>
          <div className="divide-y divide-border/30">
            {bookings.slice(0, 5).map((booking) => {
              const state = getWalletState(booking);
              return (
                <button
                  key={booking.id}
                  onClick={() => navigate(`/item/${booking.item_id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                >
                  {/* Item image */}
                  <div className="w-10 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 border border-border/30">
                    {booking.item_image_url ? (
                      <img src={booking.item_image_url} alt={booking.item_title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BanknoteIcon size={14} className="text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{booking.item_title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDate(booking.start_date)} – {formatDate(booking.end_date)}
                    </p>
                    {/* State pill */}
                    <span className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      state === "pending" ? "bg-amber-100 text-amber-800" :
                      state === "available" ? "bg-green-100 text-green-800" :
                      state === "released" ? "bg-muted text-muted-foreground" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {state === "pending" ? "In progress" :
                       state === "available" ? "Ready to release" :
                       state === "released" ? "Paid out" :
                       "On hold"}
                    </span>
                  </div>

                  {/* Amount */}
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${
                      state === "released" ? "text-muted-foreground" :
                      state === "available" ? "text-green-700" :
                      "text-foreground"
                    }`}>
                      {formatAUD(booking.lender_payout_amount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">your earnings</p>
                  </div>
                </button>
              );
            })}
          </div>
          {bookings.length > 5 && (
            <button
              onClick={() => navigate("/profile")}
              className="w-full py-3 text-xs font-semibold text-primary border-t border-border/30"
            >
              View all {bookings.length} transactions →
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasAnyActivity && stripeConnected && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center bg-card">
          <BanknoteIcon size={22} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-semibold text-foreground mb-1">No earnings yet</p>
          <p className="text-xs text-muted-foreground mb-3">List an item and start earning when someone rents it</p>
          <button
            onClick={() => navigate("/list")}
            className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
          >
            List an item
          </button>
        </div>
      )}

      {/* How it works note */}
      <div className="rounded-2xl border border-border/40 bg-card/60 p-4">
        <p className="text-xs font-semibold text-foreground mb-2">How your wallet works</p>
        <div className="space-y-2">
          {[
            { icon: "🟡", label: "Pending", desc: "Payment received and held securely while rental is in progress" },
            { icon: "🟢", label: "Available", desc: "Item returned — payout releases to your bank automatically" },
            { icon: "⚪", label: "Paid out", desc: "Successfully transferred to your connected bank account" },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-2.5">
              <span className="text-sm mt-0.5">{item.icon}</span>
              <div>
                <span className="text-[11px] font-semibold text-foreground">{item.label} — </span>
                <span className="text-[11px] text-muted-foreground">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
