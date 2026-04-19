import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type HoldCheck = { ok: boolean; reason?: string };

function getMissingColumnFromError(error: any): string | null {
  const message = String(error?.message || "");
  const schemaCacheMatch = message.match(/find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
  const quotedColumnMatch = message.match(/column ['"]([a-zA-Z0-9_]+)['"]/i);
  if (quotedColumnMatch?.[1]) return quotedColumnMatch[1];
  return null;
}

function isMissingColumnError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
}

async function updateBookingWithFallback(supabaseAdmin: any, bookingId: string, payload: any) {
  let safePayload = { ...payload };
  let error: any = null;
  for (let i = 0; i < 8; i += 1) {
    const result = await supabaseAdmin.from("bookings").update(safePayload).eq("id", bookingId);
    error = result.error;
    if (!error) return { error: null };
    if (!isMissingColumnError(error)) return { error };
    const missing = getMissingColumnFromError(error);
    if (!missing || !(missing in safePayload)) return { error };
    delete safePayload[missing];
  }
  return { error };
}

function computeDisputeWindowEnds(booking: any): Date | null {
  const end = booking?.end_date ? new Date(`${booking.end_date}T00:00:00.000Z`) : null;
  const returned = booking?.item_returned_at ? new Date(booking.item_returned_at) : null;
  const base = new Date(Math.max(end?.getTime() || 0, returned?.getTime() || 0));
  if (!Number.isFinite(base.getTime()) || base.getTime() <= 0) return null;
  return new Date(base.getTime() + 24 * 60 * 60 * 1000);
}

function canReleasePayout(booking: any): HoldCheck {
  const now = Date.now();
  const status = String(booking?.status || "").toLowerCase();
  if (!["paid", "completed"].includes(status)) {
    return { ok: false, reason: "Booking is not paid yet." };
  }

  const endAt = booking?.end_date ? new Date(`${booking.end_date}T00:00:00.000Z`) : null;
  if (!endAt || !Number.isFinite(endAt.getTime()) || now < endAt.getTime()) {
    return { ok: false, reason: "Rental end date has not passed yet." };
  }

  if (!booking?.item_returned_at) {
    return { ok: false, reason: "Item is not marked returned yet." };
  }

  const disputeEnds =
    booking?.dispute_window_ends_at && Number.isFinite(new Date(booking.dispute_window_ends_at).getTime())
      ? new Date(booking.dispute_window_ends_at)
      : computeDisputeWindowEnds(booking);

  if (!disputeEnds || now < disputeEnds.getTime()) {
    return { ok: false, reason: "24h dispute window is still open." };
  }

  if (booking?.tracking_required) {
    const trackingNumber = String(booking?.tracking_number || "").trim();
    const trackingStatus = String(booking?.tracking_status || "").toLowerCase();
    if (!trackingNumber) {
      return { ok: false, reason: "Tracking number is required before payout." };
    }
    if (trackingStatus !== "delivered") {
      return { ok: false, reason: "Tracking must be delivered before payout." };
    }
  }

  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const currency = (process.env.STRIPE_CURRENCY || "aud").toLowerCase();

  if (!stripeSecretKey || !supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return res.status(500).json({ error: "Missing payout configuration." });
  }

  try {
    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    if (!accessToken) return res.status(401).json({ error: "Missing auth token." });

    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await supabaseAuthClient.auth.getUser(accessToken);

    if (authError || !user) return res.status(401).json({ error: "Invalid session." });

    const bookingId = String(req.body?.booking_id || "").trim();
    if (!bookingId) return res.status(400).json({ error: "Missing booking_id." });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    if (booking.owner_id !== user.id && booking.renter_id !== user.id) {
      return res.status(403).json({ error: "Only booking participants can trigger payout checks." });
    }

    if (String(booking.payout_status || "").toLowerCase() === "released") {
      return res.status(200).json({ released: true, alreadyReleased: true });
    }

    const holdCheck = canReleasePayout(booking);
    if (!holdCheck.ok) {
      await updateBookingWithFallback(supabaseAdmin, bookingId, {
        payout_status: "held",
        payout_hold_reason: holdCheck.reason || "payout_hold_conditions_not_met",
      });

      return res.status(409).json({
        released: false,
        hold: true,
        reason: holdCheck.reason || "Payout release conditions not met.",
      });
    }

    const destination = String(booking.stripe_transfer_destination || "").trim();
    if (!destination) {
      return res.status(400).json({ error: "Missing connected destination account." });
    }

    const payoutAmount = Number(booking.lender_payout_amount || 0);
    if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      return res.status(400).json({ error: "Invalid payout amount." });
    }
    const payoutCents = Math.round(payoutAmount * 100);

    const stripe = new Stripe(stripeSecretKey);

    await updateBookingWithFallback(supabaseAdmin, bookingId, {
      payout_status: "releasing",
      payout_hold_reason: null,
    });

    const transfer = await stripe.transfers.create({
      amount: payoutCents,
      currency,
      destination,
      metadata: {
        bookingId: String(booking.id),
        ownerId: String(booking.owner_id || ""),
        renterId: String(booking.renter_id || ""),
      },
    });

    const { error: updateError } = await updateBookingWithFallback(supabaseAdmin, bookingId, {
      payout_status: "released",
      payout_released_at: new Date().toISOString(),
      payout_hold_reason: null,
      stripe_transfer_id: transfer.id,
    });

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({ released: true, transferId: transfer.id });
  } catch (error: any) {
    console.error("release-payout error", error);
    return res.status(500).json({ error: error?.message || "Failed to release payout." });
  }
}
