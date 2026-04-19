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

function isAuthorizedCron(req: VercelRequest): boolean {
  const vercelCronHeader = req.headers["x-vercel-cron"];
  if (typeof vercelCronHeader === "string" && vercelCronHeader.length > 0) {
    return true;
  }

  const expected = String(process.env.CRON_SECRET || "").trim();
  if (!expected) return false;
  const auth = String(req.headers.authorization || "");
  return auth === `Bearer ${expected}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(String(req.method || "GET").toUpperCase())) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: "Unauthorized cron request." });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const currency = (process.env.STRIPE_CURRENCY || "aud").toLowerCase();

  if (!stripeSecretKey || !supabaseUrl || !supabaseServiceRoleKey) {
    return res.status(500).json({ error: "Missing cron payout configuration." });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const stripe = new Stripe(stripeSecretKey);

    const { data: bookings, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("payout_status", "held")
      .in("status", ["paid", "completed"])
      .limit(50);

    if (bookingError) {
      return res.status(500).json({ error: bookingError.message });
    }

    const rows = bookings || [];
    let scanned = 0;
    let released = 0;
    let stillHeld = 0;
    let failed = 0;
    const details: Array<{ id: string; result: string }> = [];

    for (const booking of rows) {
      scanned += 1;
      const bookingId = String(booking.id || "");
      if (!bookingId) continue;

      const holdCheck = canReleasePayout(booking);
      if (!holdCheck.ok) {
        stillHeld += 1;
        await updateBookingWithFallback(supabaseAdmin, bookingId, {
          payout_status: "held",
          payout_hold_reason: holdCheck.reason || "payout_hold_conditions_not_met",
        });
        details.push({ id: bookingId, result: `held: ${holdCheck.reason || "conditions not met"}` });
        continue;
      }

      const destination = String(booking.stripe_transfer_destination || "").trim();
      if (!destination) {
        stillHeld += 1;
        await updateBookingWithFallback(supabaseAdmin, bookingId, {
          payout_status: "held",
          payout_hold_reason: "seller_payout_account_not_connected",
        });
        details.push({ id: bookingId, result: "held: missing connected destination account" });
        continue;
      }

      const payoutAmount = Number(booking.lender_payout_amount || 0);
      if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
        stillHeld += 1;
        await updateBookingWithFallback(supabaseAdmin, bookingId, {
          payout_status: "held",
          payout_hold_reason: "invalid_payout_amount",
        });
        details.push({ id: bookingId, result: "held: invalid payout amount" });
        continue;
      }

      const lockAttempt = await supabaseAdmin
        .from("bookings")
        .update({
          payout_status: "releasing",
          payout_hold_reason: null,
        })
        .eq("id", bookingId)
        .eq("payout_status", "held")
        .select("id")
        .maybeSingle();

      if (lockAttempt.error || !lockAttempt.data) {
        stillHeld += 1;
        details.push({
          id: bookingId,
          result: lockAttempt.error?.message || "skip: booking lock failed or already processed",
        });
        continue;
      }

      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(payoutAmount * 100),
          currency,
          destination,
          metadata: {
            bookingId: bookingId,
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
          failed += 1;
          details.push({ id: bookingId, result: `failed: ${updateError.message}` });
          continue;
        }

        released += 1;
        details.push({ id: bookingId, result: "released" });
      } catch (transferError: any) {
        failed += 1;
        await updateBookingWithFallback(supabaseAdmin, bookingId, {
          payout_status: "held",
          payout_hold_reason: transferError?.message || "stripe_transfer_failed",
        });
        details.push({ id: bookingId, result: `failed: ${transferError?.message || "stripe transfer failed"}` });
      }
    }

    return res.status(200).json({
      ok: true,
      scanned,
      released,
      stillHeld,
      failed,
      details,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Cron payout retry failed." });
  }
}
