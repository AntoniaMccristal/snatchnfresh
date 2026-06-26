import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !stripeSecretKey) {
    return res.status(500).json({ error: "Missing configuration." });
  }

  // Verify the user is authenticated
  const authHeader = String(req.headers.authorization || "");
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return res.status(401).json({ error: "Missing auth token." });
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(accessToken);

  if (authError || !user) {
    return res.status(401).json({ error: "Invalid session." });
  }

  const { booking_id, reason } = req.body;

  if (!booking_id) {
    return res.status(400).json({ error: "booking_id is required." });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
  const stripe = new Stripe(stripeSecretKey);

  try {
    // Fetch the booking
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, status, paid_at, stripe_payment_intent_id, stripe_checkout_session_id, owner_id, renter_id, total_price")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    // Only the lender (owner) can cancel and trigger a refund
    if (booking.owner_id !== user.id) {
      return res.status(403).json({ error: "Only the lender can cancel this booking." });
    }

    // Can only refund paid bookings
    if (!booking.paid_at) {
      // No payment was made — just cancel the booking
      await supabaseAdmin
        .from("bookings")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking_id);

      return res.status(200).json({ 
        ok: true, 
        refunded: false, 
        message: "Booking cancelled. No payment was made so no refund is needed." 
      });
    }

    // Check booking isn't already cancelled or completed
    if (["cancelled", "completed"].includes(booking.status)) {
      return res.status(409).json({ 
        error: `Cannot cancel a booking with status: ${booking.status}` 
      });
    }

    let refundId = null;
    let refundAmount = null;

    // Issue Stripe refund
    const paymentIntentId = booking.stripe_payment_intent_id;

    if (paymentIntentId) {
      try {
        // Create full refund on the payment intent
        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
          reason: "requested_by_customer",
          metadata: {
            booking_id: booking_id,
            cancelled_by: user.id,
            cancellation_reason: reason || "lender_cancelled",
          },
        });

        refundId = refund.id;
        refundAmount = refund.amount;

        console.log(`Refund created: ${refundId} for booking ${booking_id}, amount: ${refundAmount}`);
      } catch (stripeError: any) {
        // If already refunded, that's fine
        if (stripeError?.code === "charge_already_refunded") {
          console.log(`Booking ${booking_id} was already refunded`);
        } else {
          console.error("Stripe refund error:", stripeError);
          return res.status(500).json({ 
            error: `Refund failed: ${stripeError?.message || "Unknown Stripe error"}` 
          });
        }
      }
    }

    // Update booking status to cancelled
    await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        payout_status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking_id);

    // Send push notification to renter
    try {
      const { data: renterSubs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", booking.renter_id);

      if (renterSubs && renterSubs.length > 0) {
        await fetch(`${process.env.VITE_APP_URL || "https://snatchn.com.au"}/api/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: booking.renter_id,
            title: "Booking cancelled",
            body: "The lender has cancelled your booking. A full refund is on its way.",
            url: "/profile",
          }),
        });
      }
    } catch (notifError) {
      console.error("Failed to send cancellation notification:", notifError);
    }

    return res.status(200).json({
      ok: true,
      refunded: !!refundId,
      refund_id: refundId,
      refund_amount: refundAmount,
      message: refundId
        ? "Booking cancelled and full refund issued. The renter will receive their money within 5-10 business days."
        : "Booking cancelled. No payment was found to refund.",
    });
  } catch (error: any) {
    console.error("refund-booking error:", error);
    return res.status(500).json({ error: error?.message || "Could not process refund." });
  }
}
