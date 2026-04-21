import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BanknoteIcon,
  Calendar,
  CheckCircle2,
  Loader2,
  Lock,
  MessageCircle,
  Shield,
  Truck,
} from "lucide-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { supabase } from "../lib/supabaseClient";
import { usePageRefresh } from "@/hooks/usePageRefresh";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// ── Payment form ──────────────────────────────────────────────────────────────

function PaymentForm({
  bookingId,
  total,
  onSuccess,
}: {
  bookingId: string;
  total: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  async function handlePay() {
    if (!stripe || !elements) return;
    setPaying(true);
    setError("");

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || "Card details incomplete.");
      setPaying(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment-success?bookingId=${bookingId}`,
      },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message || "Payment failed. Please try again.");
      setPaying(false);
      return;
    }

    onSuccess();
    setPaying(false);
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border/50 p-4 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={14} className="text-primary" />
          <p className="text-sm font-semibold text-foreground">Card details</p>
          <div className="ml-auto flex items-center gap-1.5">
            {["visa", "mc", "amex"].map((brand) => (
              <div key={brand} className="h-5 px-2 rounded bg-muted border border-border/50 flex items-center">
                <span className="text-[9px] font-bold text-muted-foreground uppercase">{brand}</span>
              </div>
            ))}
          </div>
        </div>
        <PaymentElement options={{ layout: "tabs", fields: { billingDetails: { address: "never" } } }} />
      </div>

      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
          <AlertCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={paying || !stripe || !elements}
        style={{ height: 52 }}
        className="w-full bg-primary-gradient text-primary-foreground rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-glow disabled:opacity-50 active:scale-[0.98] transition-all"
      >
        {paying ? (
          <><Loader2 size={16} className="animate-spin" /> Processing...</>
        ) : (
          <><Lock size={15} /> Pay securely · ${total}</>
        )}
      </button>

      <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Lock size={10} /> 256-bit SSL</span>
        <span className="flex items-center gap-1"><Shield size={10} /> Stripe secured</span>
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen({ itemTitle, onDone }: { itemTitle: string; onDone: () => void }) {
  return (
    <div className="app-shell bg-warm-gradient flex flex-col items-center justify-center p-8 text-center min-h-screen">
      <div className="w-20 h-20 rounded-full bg-sage-light flex items-center justify-center mb-5 shadow-soft">
        <CheckCircle2 size={40} className="text-success" />
      </div>
      <h1 className="text-2xl font-display font-bold text-foreground mb-2">Payment confirmed!</h1>
      <p className="text-sm text-muted-foreground mb-2 max-w-xs">
        Your request for <strong>{itemTitle}</strong> has been sent to the lender.
      </p>
      <p className="text-xs text-muted-foreground mb-8">You'll get an update once the lender approves your booking.</p>
      <button
        onClick={onDone}
        className="w-full max-w-xs h-12 bg-primary-gradient text-primary-foreground rounded-2xl font-semibold text-sm shadow-glow active:scale-[0.98] transition-all"
      >
        Back to home
      </button>
    </div>
  );
}

// ── Error states ──────────────────────────────────────────────────────────────

function LenderNotConnectedError({ onBack, onMessage, ownerId }: {
  onBack: () => void;
  onMessage: () => void;
  ownerId?: string;
}) {
  return (
    <div className="app-shell bg-warm-gradient p-5 space-y-4">
      <button onClick={onBack} className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft">
        <ArrowLeft size={18} className="text-foreground" />
      </button>

      <div className="rounded-3xl border border-amber-300/60 bg-amber-50 p-6 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
          <BanknoteIcon size={26} className="text-amber-700" />
        </div>
        <h2 className="text-base font-display font-bold text-amber-900">Lender payout not set up yet</h2>
        <p className="text-sm text-amber-800 leading-relaxed">
          This lender hasn't connected their bank account yet so payments can't be processed for this item.
        </p>
        <p className="text-xs text-amber-700">
          Message the lender to let them know — once they connect their Stripe account you'll be able to book!
        </p>
      </div>

      <button
        onClick={onMessage}
        className="w-full h-12 bg-primary-gradient text-primary-foreground rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-glow active:scale-[0.98] transition-all"
      >
        <MessageCircle size={15} /> Message the lender
      </button>

      <button
        onClick={onBack}
        className="w-full h-11 rounded-2xl border border-border/60 bg-card text-sm font-semibold"
      >
        Go back
      </button>
    </div>
  );
}

function GenericError({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="app-shell bg-warm-gradient p-5 space-y-4">
      <button onClick={onBack} className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft">
        <ArrowLeft size={18} className="text-foreground" />
      </button>
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
          <AlertCircle size={26} className="text-red-600" />
        </div>
        <h2 className="text-base font-display font-bold text-red-900">Something went wrong</h2>
        <p className="text-sm text-red-700 leading-relaxed">{message}</p>
      </div>
      <button
        onClick={onBack}
        className="w-full h-11 rounded-2xl border border-border/60 bg-card text-sm font-semibold"
      >
        Go back
      </button>
    </div>
  );
}

// ── Main Booking page ─────────────────────────────────────────────────────────

const Booking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemId } = useParams();
  const [params] = useSearchParams();

  const [item, setItem] = useState<any>((location.state as any)?.itemSnapshot || null);
  const [loading, setLoading] = useState(true);
  const [insurance, setInsurance] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "standard_shipping" | "express_shipping">("pickup");
  const [localHandoffType, setLocalHandoffType] = useState<"pickup" | "dropoff">("pickup");

  const [clientSecret, setClientSecret] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Typed errors — null = no error, "lender_not_connected" = special case, string = generic
  const [errorType, setErrorType] = useState<null | "lender_not_connected" | "dates_taken" | string>(null);

  const startDate = params.get("start") || "";
  const endDate = params.get("end") || "";

  const fetchItem = useCallback(async () => {
    if (!itemId) { setLoading(false); return; }
    const { data } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();
    if (data) setItem(data);
    setLoading(false);
  }, [itemId]);

  useEffect(() => { void fetchItem(); }, [fetchItem]);
  usePageRefresh(fetchItem, [fetchItem]);

  useEffect(() => {
    if (!item) return;
    if (item.allows_pickup === false && item.allows_dropoff !== false) {
      setLocalHandoffType("dropoff");
    }
  }, [item]);

  const rentalDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  }, [startDate, endDate]);

  const rentalFee = useMemo(() => rentalDays * Number(item?.price_per_day || 0), [item, rentalDays]);
  const COMMISSION_RATE = 0.05;
  const platformCommission = Math.round(rentalFee * COMMISSION_RATE);
  const standardShipping = Number(item?.standard_shipping_price || 0);
  const expressShipping = Number(item?.express_shipping_price || 0);
  const shippingFee = deliveryMethod === "standard_shipping" ? standardShipping
    : deliveryMethod === "express_shipping" ? expressShipping : 0;
  const insuranceFee = insurance ? 5 : 0;
  const total = rentalFee + shippingFee + insuranceFee;
  const lenderPayout = rentalFee - platformCommission + shippingFee;

  async function handlePreparePayment() {
    if (!item || !itemId || !startDate || !endDate || rentalDays <= 0) return;
    setPreparingPayment(true);
    setErrorType(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { navigate("/auth"); return; }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 25000);

      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        signal: controller.signal,
        body: JSON.stringify({
          item_id: itemId,
          start_date: startDate,
          end_date: endDate,
          delivery_method: deliveryMethod,
          local_handoff_type: deliveryMethod === "pickup" ? localHandoffType : null,
          insurance,
          item_snapshot: {
            id: item.id,
            title: item.title,
            price_per_day: item.price_per_day,
            standard_shipping_price: item.standard_shipping_price,
            express_shipping_price: item.express_shipping_price,
            owner_id: item.owner_id,
            user_id: item.user_id,
          },
        }),
      });

      window.clearTimeout(timeout);

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.clientSecret) {
        const errMsg = String(data?.error || "Could not initialise payment.").toLowerCase();

        // Detect specific error types for better UX
        if (errMsg.includes("payout account") || errMsg.includes("not connected") || errMsg.includes("stripe")) {
          setErrorType("lender_not_connected");
        } else if (errMsg.includes("already booked") || errMsg.includes("dates")) {
          setErrorType("dates_taken");
        } else {
          setErrorType(data?.error || "Could not start payment. Please try again.");
        }
        return;
      }

      setClientSecret(data.clientSecret);
      setBookingId(data.bookingId);
      setPaymentReady(true);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setErrorType("Request timed out. Please check your connection and try again.");
      } else {
        setErrorType(err?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setPreparingPayment(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="app-shell p-6 space-y-4 animate-pulse">
        <div className="w-9 h-9 rounded-full bg-muted" />
        <div className="h-28 rounded-2xl bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  }

  // ── Item not found ─────────────────────────────────────────────────────────
  if (!item) {
    return (
      <div className="app-shell p-6 space-y-4">
        <div className="rounded-2xl border border-dashed border-border bg-card p-6">
          <p className="text-base font-semibold text-foreground">Item not available</p>
          <p className="mt-1 text-sm text-muted-foreground">This listing is no longer visible for booking.</p>
        </div>
        <button onClick={() => navigate("/discover")} className="h-10 px-4 rounded-xl border border-border/60 bg-card text-sm font-semibold">
          Back to discover
        </button>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (paymentSuccess) {
    return <SuccessScreen itemTitle={item.title} onDone={() => navigate("/profile")} />;
  }

  // ── Lender not connected error ─────────────────────────────────────────────
  if (errorType === "lender_not_connected") {
    return (
      <LenderNotConnectedError
        onBack={() => { setErrorType(null); navigate(-1); }}
        onMessage={() => navigate(`/messages?user=${item.owner_id || item.user_id}&item=${item.id}`)}
        ownerId={item.owner_id || item.user_id}
      />
    );
  }

  // ── Generic error ──────────────────────────────────────────────────────────
  if (errorType && errorType !== "lender_not_connected") {
    return (
      <GenericError
        message={
          errorType === "dates_taken"
            ? "Those dates are already booked. Please go back and choose different dates."
            : String(errorType)
        }
        onBack={() => { setErrorType(null); navigate(-1); }}
      />
    );
  }

  // ── Main booking UI ────────────────────────────────────────────────────────
  return (
    <div className="app-shell bg-warm-gradient pb-10 page-transition">
      <div className="relative px-5 pt-[max(0.75rem,env(safe-area-inset-top))] space-y-5">

        {/* Back button */}
        <button
          onClick={() => paymentReady ? setPaymentReady(false) : navigate(-1)}
          className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>

        {/* Item summary — always visible */}
        <div className="flex gap-3.5 p-4 bg-card rounded-2xl border border-border/50 shadow-card">
          {item.image_url && (
            <img src={item.image_url} alt={item.title} className="w-[72px] h-[88px] object-cover rounded-xl shadow-soft" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">${item.price_per_day}/day</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{startDate}</span>
              <span className="text-[10px] text-muted-foreground">→</span>
              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{endDate}</span>
            </div>
          </div>
        </div>

        {/* ── Step 1: Booking details ── */}
        {!paymentReady && (
          <>
            {/* Dates */}
            <div>
              <h3 className="text-sm font-display font-semibold text-foreground mb-2.5 flex items-center gap-1.5">
                <Calendar size={14} className="text-primary" /> Dates
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[{ label: "Pickup", date: startDate }, { label: "Return", date: endDate }].map(({ label, date }) => (
                  <div key={label} className="p-3.5 rounded-2xl border border-border/50 bg-card shadow-soft">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{date || "Not set"}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {rentalDays > 0 ? `${rentalDays} day rental` : "Invalid date range"}
              </p>
            </div>

            {/* Delivery */}
            <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-soft space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Truck size={14} className="text-primary" /> Delivery method
              </p>
              {[
                { value: "pickup", label: "Local handoff (Free)" },
                { value: "standard_shipping", label: `Standard shipping ($${standardShipping})` },
                { value: "express_shipping", label: `Express shipping ($${expressShipping})` },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    deliveryMethod === opt.value ? "border-primary bg-primary/5" : "border-border/60"
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery"
                    checked={deliveryMethod === opt.value}
                    onChange={() => setDeliveryMethod(opt.value as any)}
                  />
                  <span className="text-sm text-foreground">{opt.label}</span>
                </label>
              ))}

              {deliveryMethod === "pickup" && (
                <div className="rounded-xl border border-border/60 bg-background p-2.5 space-y-2">
                  <p className="text-xs font-semibold text-foreground">Handoff preference</p>
                  {item?.allows_pickup !== false && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="handoff" checked={localHandoffType === "pickup"} onChange={() => setLocalHandoffType("pickup")} />
                      I'll pick it up
                    </label>
                  )}
                  {item?.allows_dropoff !== false && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="handoff" checked={localHandoffType === "dropoff"} onChange={() => setLocalHandoffType("dropoff")} />
                      Seller drops off
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/messages?user=${item.owner_id || item.user_id}&item=${item.id}`)}
                    className="h-8 px-3 rounded-lg border border-border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-muted/40 transition-colors"
                  >
                    <MessageCircle size={13} /> Arrange via chat
                  </button>
                </div>
              )}
            </div>

            {/* Insurance */}
            <div className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border/50 shadow-soft">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sage-light flex items-center justify-center">
                  <Shield size={18} className="text-success" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Damage protection</p>
                  <p className="text-[11px] text-muted-foreground">Add $5 coverage</p>
                </div>
              </div>
              <button
                onClick={() => setInsurance(!insurance)}
                className={`w-12 h-7 rounded-full transition-all duration-300 flex items-center px-0.5 ${insurance ? "bg-primary shadow-glow" : "bg-muted"}`}
              >
                <span className={`w-6 h-6 rounded-full bg-card shadow-soft transition-transform duration-300 ${insurance ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>

            {/* Price breakdown */}
            <div className="bg-card rounded-3xl p-5 space-y-2.5 border border-border/50 shadow-card">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rental ({rentalDays} days)</span>
                <span className="text-foreground font-medium">${rentalFee}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Platform fee (5%)</span>
                <span className="text-foreground font-medium">${platformCommission}</span>
              </div>
              {shippingFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="text-foreground font-medium">${shippingFee}</span>
                </div>
              )}
              {insurance && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Damage protection</span>
                  <span className="text-foreground font-medium">${insuranceFee}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lender receives</span>
                <span className="text-foreground font-medium">${lenderPayout}</span>
              </div>
              <div className="border-t border-border/50 pt-2.5 flex justify-between text-base font-bold">
                <span className="text-foreground">Total</span>
                <span className="text-primary">${total}</span>
              </div>
            </div>

            {/* Note */}
            <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-3">
              <p className="text-xs text-amber-900">
                Payment doesn't confirm this rental — it stays pending until the lender approves your request.
              </p>
            </div>

            {/* Continue button */}
            <button
              onClick={handlePreparePayment}
              disabled={preparingPayment || rentalDays <= 0}
              className="w-full h-12 bg-primary-gradient text-primary-foreground rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-glow disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {preparingPayment ? (
                <><Loader2 size={16} className="animate-spin" /> Preparing payment...</>
              ) : (
                <><Lock size={15} /> Continue to payment · ${total}</>
              )}
            </button>
          </>
        )}

        {/* ── Step 2: Stripe Elements card form ── */}
        {paymentReady && clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#3d1f6e",
                  borderRadius: "12px",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                },
              },
            }}
          >
            <div className="space-y-4">
              <div className="bg-card rounded-2xl border border-border/50 p-4 shadow-soft">
                <p className="text-sm font-semibold text-foreground mb-1">Order summary</p>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{rentalDays} day rental · {item.title}</span>
                  <span className="font-bold text-primary">${total}</span>
                </div>
              </div>
              <PaymentForm
                bookingId={bookingId}
                total={total}
                onSuccess={() => setPaymentSuccess(true)}
              />
            </div>
          </Elements>
        )}

      </div>
    </div>
  );
};

export default Booking;
