import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const COMMISSION_RATE = 0.05;

function getAppOrigin(req: VercelRequest) {
  const explicitOrigin = String(req.headers.origin || "").trim();
  if (explicitOrigin) return explicitOrigin;

  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  const proto = String(req.headers["x-forwarded-proto"] || "https").trim();
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

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
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
    return res.status(500).json({ error: "Missing checkout configuration." });
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

    const ownerId = String(item.owner_id || item.user_id || item_snapshot?.owner_id || item_snapshot?.user_id || "").trim();
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

    const pricePerDay = Number(item.price_per_day || item_snapshot?.price_per_day || 0);
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

    const rentalSubtotal = rentalDays * pricePerDay;
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
      supabaseUserScopedClient,
      bookingPayload,
    );

    if (bookingInsertError || !bookingId) {
      return res.status(400).json({
        error: bookingInsertError?.message || "Could not create booking request.",
      });
    }

    const appFeeTotal = platformCommissionAmount + insuranceAmount;
    const origin = getAppOrigin(req);
    const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
      metadata: {
        bookingId,
        itemId: String(item.id),
        ownerId,
        renterId: user.id,
      },
    };

    if (stripeDestination) {
      paymentIntentData.application_fee_amount = Math.round(appFeeTotal * 100);
      paymentIntentData.transfer_data = {
        destination: stripeDestination,
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `${item.title || "Rental"} rental`,
            },
            unit_amount: Math.round(rentalSubtotal * 100),
          },
          quantity: 1,
        },
        ...(shippingAmount > 0
          ? [
              {
                price_data: {
                  currency,
                  product_data: {
                    name:
                      delivery_method === "express_shipping"
                        ? "Express shipping"
                        : "Standard shipping",
                  },
                  unit_amount: Math.round(shippingAmount * 100),
                },
                quantity: 1,
              },
            ]
          : []),
        ...(insuranceAmount > 0
          ? [
              {
                price_data: {
                  currency,
                  product_data: {
                    name: "Damage protection",
                  },
                  unit_amount: Math.round(insuranceAmount * 100),
                },
                quantity: 1,
              },
            ]
          : []),
      ],
      payment_intent_data: paymentIntentData,
      success_url: `${origin}/payment-success?bookingId=${bookingId}`,
      cancel_url: `${origin}/booking/${item.id}?start=${encodeURIComponent(normalizedStart)}&end=${encodeURIComponent(normalizedEnd)}`,
      metadata: {
        bookingId,
        itemId: String(item.id),
        ownerId,
        renterId: user.id,
      },
    });

    const { error: bookingUpdateError } = await updateBookingWithFallback(supabaseAdmin, bookingId, {
      stripe_checkout_session_id: session.id,
    });

    if (bookingUpdateError) {
      console.error("Failed to store checkout session on booking", bookingUpdateError);
    }

    return res.status(200).json({ url: session.url, bookingId });
  } catch (error: any) {
    console.error("create-checkout-session error", error);
    return res.status(500).json({ error: error?.message || "Unable to start checkout." });
  }
}
