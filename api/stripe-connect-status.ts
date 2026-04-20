import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function isValidStripeSecretKey(key: string) {
  const value = String(key || "");
  return value.startsWith("sk_test_") || value.startsWith("sk_live_");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !stripeSecretKey) {
      return res.status(500).json({ error: "Missing Supabase/Stripe configuration." });
    }

    if (!isValidStripeSecretKey(stripeSecretKey)) {
      return res.status(500).json({ error: "Invalid STRIPE_SECRET_KEY." });
    }

    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!accessToken) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return res.status(401).json({ error: "Invalid session." });
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("stripe_account_id,stripe_connect_account_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return res.status(400).json({ error: profileError.message || "Could not load profile." });
    }

    const accountId = profile?.stripe_account_id || profile?.stripe_connect_account_id || null;
    if (!accountId) {
      return res.status(200).json({
        connected: false,
        hasAccount: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        chargesEnabled: false,
        accountId: null,
        requirementMessage: null,
      });
    }

    const stripe = new Stripe(stripeSecretKey);
    const account = await stripe.accounts.retrieve(accountId);

    const requirementMessage =
      account.requirements?.currently_due?.length
        ? `Finish Stripe setup to receive payouts. Still needed: ${account.requirements.currently_due.slice(0, 3).join(", ")}.`
        : null;

    const connected = Boolean(account.details_submitted && account.payouts_enabled);

    return res.status(200).json({
      connected,
      hasAccount: true,
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      chargesEnabled: Boolean(account.charges_enabled),
      accountId,
      requirementMessage,
    });
  } catch (error: any) {
    console.error("stripe-connect-status error", error);
    return res.status(500).json({ error: error?.message || "Could not load Stripe account status." });
  }
}
