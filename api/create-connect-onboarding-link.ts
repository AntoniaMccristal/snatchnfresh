import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function getAppOrigin(req: VercelRequest) {
  const explicitOrigin = req.headers.origin;
  if (explicitOrigin) return explicitOrigin;

  const host = (req.headers["x-forwarded-host"] || req.headers.host || "") as string;
  const proto = (req.headers["x-forwarded-proto"] || "https") as string;
  if (!host) return "http://localhost:8080";
  return `${proto}://${host}`;
}

function getSafeReturnPath(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return "/profile";
  if (raw.startsWith("//")) return "/profile";
  return raw;
}

function isValidStripeSecretKey(key: string) {
  const value = String(key || "");
  return value.startsWith("sk_test_") || value.startsWith("sk_live_");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const returnPath = getSafeReturnPath(req.body?.return_path || "/profile");
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !stripeSecretKey) {
      return res.status(500).json({ error: "Missing Supabase/Stripe configuration." });
    }

    if (!isValidStripeSecretKey(stripeSecretKey)) {
      return res.status(500).json({
        error:
          "Invalid STRIPE_SECRET_KEY. Use a secret key starting with sk_test_ or sk_live_ (not pk_).",
      });
    }

    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!accessToken) {
      return res.status(401).json({ error: "Missing auth token." });
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

    const stripe = new Stripe(stripeSecretKey);
    const { data: profile } = await supabaseUserScopedClient
      .from("profiles")
      .select("stripe_account_id,stripe_connect_account_id,country")
      .eq("id", user.id)
      .maybeSingle();

    let accountId =
      profile?.stripe_account_id || profile?.stripe_connect_account_id || null;

    if (!accountId) {
      const country = String(profile?.country || "AU").slice(0, 2).toUpperCase();
      const account = await stripe.accounts.create({
        type: "express",
        country: country || "AU",
        email: user.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      accountId = account.id;

      await supabaseUserScopedClient
        .from("profiles")
        .upsert(
          {
            id: user.id,
            stripe_account_id: accountId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
    }

    const origin = getAppOrigin(req);
    const refreshUrl = new URL(returnPath, origin);
    refreshUrl.searchParams.set("stripe", "refresh");
    const returnUrl = new URL(returnPath, origin);
    returnUrl.searchParams.set("stripe", "connected");

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl.toString(),
      return_url: returnUrl.toString(),
      type: "account_onboarding",
    });

    return res.status(200).json({ url: accountLink.url, accountId });
  } catch (error: any) {
    console.error("create-connect-onboarding-link error", error);
    return res.status(500).json({ error: error?.message || "Could not start Stripe onboarding." });
  }
}
