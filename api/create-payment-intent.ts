import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const COMMISSION_RATE = 0.05;

function getAppOrigin(req: VercelRequest) {
  const explicitOrigin = req.headers.origin;
  if (explicitOrigin) return explicitOrigin;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const proto = String(req.headers["x-forwarded-proto"] || "https");
  if (!host) return "http://localhost:8080";
  return `${proto}://${host}`;
}

function getMissingColumnFromError(error: any): string | null {
  const message = String(error?.message || "");
  const schemaCacheMatch = message.match(/find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const quotedColumnMatch = message.match(/column ['"]([a-zA-Z0-9_]+)['"]/i);
  if (quotedColumnMatch?.[1]) return quotedColumnMatch[1];

  const directMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+/i);
  if (directMatch?.[1]) return directMatch[1];

  return null;
}

function isMissingColumnError(error: any) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}

async function insertBookingWithFallback(client: any, payload: Record<string, any>) {
  const attempts = [
    { ...payload, owner_id: payload.owner_id, renter_id: payload.renter_id },
    { ...payload, renter_id: payload.renter_id },
    { ...payload, owner_id: payload.owner_id },
    { ...payload },
  ];

  let lastError: any = null;

  for (const baseAttempt of attempts) {
    let attempt = { ...baseAttempt };

    for (let i = 0; i < 16; i += 1) {
      const result = await client.from("bookings").insert([attempt]).select("id").maybeSingle();
      if (!result.error) {
        return { bookingId: result.data?.id as string, error: null };
      }

      lastError = result.error;
      if (!isMissingColumnError(result.error)) break;

      const missingColumn = getMissingColumnFromError(result.error);
      if (!missingColumn || !(missingColumn in attempt)) break;
      delete attempt[missingColumn];
    }
  }

  return { bookingId: null, error: lastError };
}

async function updateBookingWithFallback(client: any, bookingId: string, payload: Record<string, any>) {
  let safePayload = { ...payload };

  for (let i = 0; i < 16; i += 1) {
    const result = await client.from("bookings").update(safePayload).eq("id", bookingId);
    if (!result.error) {
      return { error: null };
    }

    if (!isMissingColumnError(result.error)) {
      return { error: result.error };
    }

    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !(missingColumn in safePayload)) {
      return { error: result.error };
    }

    delete safePayload[missingColumn];
  }

  return { error: new Error("Could not update booking with current schema.") };
}

function toIsoDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function addOneDay(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}

function normaliseBlockedDates(value: unknown): Array<{ start: string; end: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((range) => {
      if (!range || typeof range !== "object") return null;
      const start = String((range as any).start || "").slice(0, 10);
      const end = String((range as any).end || "").slice(0, 10);
      if (!start || !end) return null;
      return { start, end };
    })
    .filter(Boolean) as Array<{ start: string; end: string }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const currency = String(process.env.STRIPE_CURRENCY || "aud").toLowerCase();
  const isStripeTestMode = String(stripeSecretKey || "").startsWith("sk_test_");

  if (!stripeSecretKey || !supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return res.status(500).json({ error: "Missing payment configuration." });
  }

  try {
    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!accessToken) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    const {
      item_id,
      start_date,
      end_date,
      delivery_method,
      local_handoff_type,
      item_snapshot,
      insurance,
    } = req.body || {};

    if (!item_id || !start_date || !end_date || !delivery_method) {
      return res.status(400).json({ error: "Missing booking details." });
    }

    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await supabaseAuthClient.auth.getUser(accessToken);

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid session." });
    }

    const supabaseUserScopedClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: liveItem, error: itemError } = await supabaseAdmin
      .from("items")
      .select("*")
      .eq("id", item_id)
      .maybeSingle();

    const item = liveItem || item_snapshot || null;
    if (itemError && !item) {
      return res.status(404).json({ error: "Item not found or not visible for booking." });
    }
    if (!item?.id) {
      return res.status(404).json({ error: "Item not found or not visible for booking." });
    }

    const ownerId = String(
      item.owner_id || item.user_id || item_snapshot?.owner_id || item_snapshot?.user_id || "",
    ).trim();
    if (!ownerId) {
      return res.status(400).json({ error: "Item owner is missing." });
    }

    if (ownerId === user.id) {
      return res.status(400).json({ error: "You cannot book your own item." });
    }

    const normalizedStart = toIsoDate(String(start_date));
    const normalizedEnd = toIsoDate(String(end_date));
    const rentalDays = Math.ceil(
      (new Date(normalizedEnd).getTime() - new Date(normalizedStart).getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (!Number.isFinite(rentalDays) || rentalDays <= 0) {
      return res.status(400).json({ error: "Invalid booking dates." });
    }

    const activeStatuses = ["pending", "approved", "paid", "completed"];
    const { data: conflictingBookings, error: overlapError } = await supabaseAdmin
      .from("bookings")
      .select("id,start_date,end_date,status")
      .eq("item_id", item.id)
      .in("status", activeStatuses);

    if (overlapError) {
      return res.status(400).json({ error: overlapError.message || "Could not check booking availability." });
    }

    const hasOverlap = (conflictingBookings || []).some((booking: any) =>
      booking?.start_date &&
      booking?.end_date &&
      overlaps(normalizedStart, normalizedEnd, booking.start_date, booking.end_date),
    );

    if (hasOverlap) {
      return res.status(409).json({ error: "Those dates are already booked." });
    }

    const hasBlockedOverlap = normaliseBlockedDates(item.blocked_dates).some((range) =>
      overlaps(normalizedStart, normalizedEnd, range.start, addOneDay(range.end)),
    );

    if (hasBlockedOverlap) {
      return res.status(409).json({ error: "This item is unavailable for those dates." });
    }

    const pricePerDay = Number(item.price_per_day || item_snapshot?.price_per_day || 0);
    const weeklyPrice = Number(item.weekly_price || item_snapshot?.weekly_price || 0);
    if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
      return res.status(400).json({ error: "Item pricing is invalid." });
    }

    const standardShippingPrice = Number(item.standard_shipping_price || item_snapshot?.standard_shipping_price || 0);
    const expressShippingPrice = Number(item.express_shipping_price || item_snapshot?.express_shipping_price || 0);
    const insuranceSelected = Boolean(insurance);

    const shippingAmount =
      delivery_method === "standard_shipping"
        ? standardShippingPrice
        : delivery_method === "express_shipping"
          ? expressShippingPrice
          : 0;

    const weeklyRateApplied = rentalDays >= 7 && Number.isFinite(weeklyPrice) && weeklyPrice > 0;
    const rentalSubtotal = weeklyRateApplied
      ? (Math.floor(rentalDays / 7) * weeklyPrice) + ((rentalDays % 7) * pricePerDay)
      : rentalDays * pricePerDay;
    const platformCommissionAmount = Math.round(rentalSubtotal * COMMISSION_RATE);
    const insuranceAmount = insuranceSelected ? 5 : 0;
    const lenderPayoutAmount = rentalSubtotal - platformCommissionAmount + shippingAmount;
    const totalPrice = rentalSubtotal + shippingAmount + insuranceAmount;

    const { data: ownerProfile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id,stripe_connect_account_id")
      .eq("id", ownerId)
      .maybeSingle();

    const stripeDestination = String(
      ownerProfile?.stripe_account_id || ownerProfile?.stripe_connect_account_id || "",
    ).trim();

    if (!stripeDestination && !isStripeTestMode) {
      return res.status(400).json({
        error: "Lender payout account is not connected yet. Please ask lender to connect Stripe.",
      });
    }

    const trackingRequired =
      delivery_method === "standard_shipping" || delivery_method === "express_shipping";

    const bookingPayload = {
      item_id: item.id,
      owner_id: ownerId,
      renter_id: user.id,
      start_date: normalizedStart,
      end_date: normalizedEnd,
      status: "pending",
      total_price: totalPrice,
      delivery_method,
      local_handoff_type: delivery_method === "pickup" ? local_handoff_type || "pickup" : null,
      rental_subtotal: rentalSubtotal,
      shipping_amount: shippingAmount,
      insurance_amount: insuranceAmount,
      platform_commission_amount: platformCommissionAmount,
      lender_payout_amount: lenderPayoutAmount,
      commission_rate: COMMISSION_RATE,
      stripe_transfer_destination: stripeDestination || null,
      payout_status: "held",
      payout_hold_reason: stripeDestination
        ? null
        : isStripeTestMode
          ? "seller_payout_account_not_connected_test_mode"
          : "seller_payout_account_not_connected",
      tracking_required: trackingRequired,
      updated_at: new Date().toISOString(),
    };

    const { bookingId, error: bookingInsertError } = await insertBookingWithFallback(
      supabaseAdmin,
      bookingPayload,
    );

    if (bookingInsertError || !bookingId) {
      return res.status(400).json({
        error: bookingInsertError?.message || "Could not create booking request.",
      });
    }

    const appFeeTotal = platformCommissionAmount + insuranceAmount;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalPrice * 100),
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        bookingId,
        itemId: String(item.id),
        ownerId,
        renterId: user.id,
      },
      ...(stripeDestination
        ? {
            application_fee_amount: Math.round(appFeeTotal * 100),
            transfer_data: {
              destination: stripeDestination,
            },
          }
        : {}),
    });

    const { error: bookingUpdateError } = await updateBookingWithFallback(
      supabaseAdmin,
      bookingId,
      {
        stripe_payment_intent_id: paymentIntent.id,
        stripe_transfer_destination: stripeDestination || null,
        paid_at: new Date().toISOString(),
        status: "paid",
        updated_at: new Date().toISOString(),
      },
    );

    if (bookingUpdateError) {
      return res.status(400).json({
        error: bookingUpdateError?.message || "Could not update payment metadata for booking.",
      });
    }

    try {
      const renterName =
        String(
          user.user_metadata?.full_name ||
          user.user_metadata?.first_name ||
          user.email?.split("@")[0] ||
          "Someone",
        ).trim() || "Someone";
      const itemTitle = String(item.title || item_snapshot?.title || "your item").trim() || "your item";
      await fetch(new URL("/api/send-push-notification", getAppOrigin(req)).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: ownerId,
          title: "New booking request",
          body: `${renterName} wants to rent ${itemTitle}`,
          url: "/profile",
        }),
      });
    } catch (pushError) {
      console.error("Booking request push notification failed", pushError);
    }

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      bookingId,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Could not start payment." });
  }
}
