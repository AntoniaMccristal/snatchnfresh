import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, Loader2, MessageCircle, Shield, Truck } from "lucide-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { usePageRefresh } from "@/hooks/usePageRefresh";

const COMMISSION_RATE = 0.05;

const Booking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemId } = useParams();
  const [params] = useSearchParams();

  const [item, setItem] = useState<any>((location.state as any)?.itemSnapshot || null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [insurance, setInsurance] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<
    "pickup" | "standard_shipping" | "express_shipping"
  >("pickup");
  const [localHandoffType, setLocalHandoffType] = useState<"pickup" | "dropoff">("pickup");

  const startDate = params.get("start") || "";
  const endDate = params.get("end") || "";

  const fetchItem = useCallback(async () => {
    if (!itemId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();

    if (error) {
      console.error(error);
    }

    if (data) {
      setItem(data);
    } else if (!item) {
      const retry = await supabase
        .from("items")
        .select("id,title,image_url,price_per_day,owner_id,user_id,allows_pickup,allows_dropoff,standard_shipping_price,express_shipping_price")
        .eq("id", itemId)
        .maybeSingle();

      if (!retry.error && retry.data) {
        setItem(retry.data);
      }
    }

    setLoading(false);
  }, [item, itemId]);

  useEffect(() => {
    void fetchItem();
  }, [fetchItem]);

  usePageRefresh(fetchItem, [fetchItem]);

  useEffect(() => {
    if (!item) return;
    if (item.allows_pickup === false && item.allows_dropoff !== false) {
      setLocalHandoffType("dropoff");
    } else {
      setLocalHandoffType("pickup");
    }
  }, [item]);

  const rentalDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }, [startDate, endDate]);

  const rentalFee = useMemo(() => {
    if (!item || rentalDays <= 0) return 0;
    return rentalDays * Number(item.price_per_day || 0);
  }, [item, rentalDays]);

  const platformCommission = Math.round(rentalFee * COMMISSION_RATE);
  const standardShippingAmount = Number(item?.standard_shipping_price || 0);
  const expressShippingAmount = Number(item?.express_shipping_price || 0);
  const shippingFee = useMemo(() => {
    if (!item) return 0;
    if (deliveryMethod === "standard_shipping") return standardShippingAmount;
    if (deliveryMethod === "express_shipping") return expressShippingAmount;
    return 0;
  }, [deliveryMethod, item, standardShippingAmount, expressShippingAmount]);
  const lenderPayout = rentalFee - platformCommission + shippingFee;
  const insuranceFee = insurance ? 5 : 0;
  const total = rentalFee + shippingFee + insuranceFee;

  const requestLabel =
    "Pay and send booking request";
  const flowSteps = [
    "Select dates",
    "Send request",
    "Await lender approval",
    "Booking confirmed",
  ];

  async function handleCheckout() {
    if (!item || !itemId) return;
    if (!startDate || !endDate || rentalDays <= 0) {
      alert("Please go back and select valid dates.");
      return;
    }

    setProcessing(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        navigate("/auth");
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 25000);

      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
        item_id: itemId,
        start_date: startDate,
        end_date: endDate,
        delivery_method: deliveryMethod,
        local_handoff_type: deliveryMethod === "pickup" ? localHandoffType : null,
        item_snapshot: item
          ? {
              id: item.id,
              title: item.title,
              price_per_day: item.price_per_day,
              standard_shipping_price: item.standard_shipping_price,
              express_shipping_price: item.express_shipping_price,
              owner_id: item.owner_id,
              user_id: item.user_id,
              is_available: item.is_available,
            }
          : null,
          insurance,
        }),
      });

      window.clearTimeout(timeout);

      const raw = await response.text();
      let checkoutPayload: any = null;
      try {
        checkoutPayload = raw ? JSON.parse(raw) : {};
      } catch {
        checkoutPayload = { error: raw || "Unable to start checkout." };
      }

      if (!response.ok || !checkoutPayload?.url) {
        throw new Error(checkoutPayload?.error || "Unable to start checkout");
      }

      window.location.assign(checkoutPayload.url);
    } catch (error: any) {
      const isAbort = error?.name === "AbortError";
      alert(isAbort ? "Checkout took too long to start. Please try again." : error?.message || "Failed to start payment");
      console.error(error);
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="app-shell p-6 space-y-4 animate-pulse">
        <div className="w-9 h-9 rounded-full bg-muted" />
        <div className="h-28 rounded-2xl bg-muted" />
        <div className="h-16 rounded-2xl bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="app-shell p-6 space-y-4">
        <div className="rounded-2xl border border-dashed border-border bg-card p-6">
          <p className="text-base font-semibold text-foreground">Item not available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This listing is no longer visible for booking.
          </p>
        </div>
        <button
          onClick={() => navigate("/discover")}
          className="h-10 px-4 rounded-xl border border-border/60 bg-card text-sm font-semibold"
        >
          Back to discover
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell bg-warm-gradient pb-32 page-transition">
      <div className="absolute inset-x-0 top-0 h-40 bg-background pointer-events-none" />

      <div className="relative px-5 pt-[max(0.75rem,env(safe-area-inset-top))] space-y-5">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft"
          aria-label="Go back"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>

        <div className="flex gap-3.5 p-4 bg-card rounded-2xl border border-border/50 shadow-card">
          <img src={item.image_url} alt={item.title} className="w-18 h-22 object-cover rounded-xl shadow-soft" style={{ width: 72, height: 88 }} />
          <div>
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">${item.price_per_day}/day</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-soft">
          <p className="text-sm font-semibold text-foreground">Booking flow</p>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            {flowSteps.map((step, index) => (
              <div
                key={step}
                className={`rounded-xl border px-3 py-2 ${
                  index === 1 ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Step {index + 1}</p>
                <p className="mt-1 text-xs font-semibold text-foreground">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-display font-semibold text-foreground mb-2.5 flex items-center gap-1.5">
            <Calendar size={14} className="text-primary" /> Dates
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl border border-border/50 bg-card shadow-soft">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pickup</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{startDate || "Not set"}</p>
            </div>
            <div className="p-3.5 rounded-2xl border border-border/50 bg-card shadow-soft">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Return</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{endDate || "Not set"}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">{rentalDays > 0 ? `${rentalDays} day rental` : "Invalid rental range"}</p>
        </div>

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
            className={`w-12 h-7 rounded-full transition-all duration-300 flex items-center px-0.5 ${
              insurance ? "bg-primary shadow-glow" : "bg-muted"
            }`}
          >
            <span className={`w-6 h-6 rounded-full bg-card shadow-soft transition-transform duration-300 ${
              insurance ? "translate-x-5" : "translate-x-0"
            }`} />
          </button>
        </div>

        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-soft space-y-2">
          <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
            <Truck size={14} className="text-primary" />
            Delivery Method
          </p>
          <div className="space-y-2">
            {[
              {
                value: "pickup",
                label:
                  item?.allows_pickup === false && item?.allows_dropoff === false
                    ? "Local handoff unavailable"
                    : "Local handoff (Free - arrange via in-app chat)",
                disabled: item?.allows_pickup === false && item?.allows_dropoff === false,
              },
              {
                value: "standard_shipping",
                label: `Standard shipping ($${standardShippingAmount})`,
              },
              {
                value: "express_shipping",
                label: `Express shipping (Seller arranged) ($${expressShippingAmount})`,
              },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer ${
                  deliveryMethod === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border/60"
                } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name="delivery_method"
                  checked={deliveryMethod === option.value}
                  disabled={Boolean(option.disabled)}
                  onChange={() =>
                    setDeliveryMethod(
                      option.value as "pickup" | "standard_shipping" | "express_shipping",
                    )
                  }
                />
                <span className="text-sm text-foreground">{option.label}</span>
              </label>
            ))}
          </div>
          {deliveryMethod === "pickup" && (
            <div className="rounded-xl border border-border/60 bg-background p-2.5 space-y-2">
              <p className="text-xs font-semibold text-foreground">Local handoff preference</p>
              {item?.allows_pickup !== false && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="local_handoff_type"
                    checked={localHandoffType === "pickup"}
                    onChange={() => setLocalHandoffType("pickup")}
                  />
                  I’ll pick it up
                </label>
              )}
              {item?.allows_dropoff !== false && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="local_handoff_type"
                    checked={localHandoffType === "dropoff"}
                    onChange={() => setLocalHandoffType("dropoff")}
                  />
                  Seller drops it off
                </label>
              )}
              <button
                type="button"
                onClick={() => navigate(`/messages?user=${item.owner_id || item.user_id}&item=${item.id}`)}
                className="h-8 px-3 rounded-lg border border-border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-muted/40 transition-colors"
              >
                <MessageCircle size={13} /> Enquire about handoff time
              </button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            If local handoff is selected, confirm pickup/drop-off time in chat. If shipping is selected, seller arranges postage and must upload tracking before payout release.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">
            Important: payment does not confirm this rental. Your request stays pending until the lender approves these dates.
          </p>
        </div>

        <div className="bg-card rounded-3xl p-5 space-y-2.5 border border-border/50 shadow-card">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Rental ({rentalDays} days)</span>
            <span className="text-foreground font-medium">${rentalFee}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Platform commission (5%)</span>
            <span className="text-foreground font-medium">${platformCommission}</span>
          </div>
          {deliveryMethod !== "pickup" && (
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
            <span className="text-muted-foreground">Lender receives (95%)</span>
            <span className="text-foreground font-medium">${lenderPayout}</span>
          </div>
          <div className="border-t border-border/50 pt-2.5 flex justify-between text-base font-bold">
            <span className="text-foreground">Total</span>
            <span className="text-primary">${total}</span>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-soft space-y-2">
          <p className="text-sm font-semibold text-foreground">Delivery / Tracking</p>
          <p className="text-xs text-muted-foreground">
            Pickup is free. Shipping is seller-arranged and requires tracking in-app before payout can release.
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 w-full glass border-t border-border/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] z-[120]">
        <button
          onClick={handleCheckout}
          disabled={processing || rentalDays <= 0}
          className="w-full h-12 bg-primary-gradient text-primary-foreground rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all shadow-glow disabled:opacity-50"
        >
          {processing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Starting request...
            </span>
          ) : (
            `${requestLabel} · $${total}`
          )}
        </button>
      </div>
    </div>
  );
};

export default Booking;
