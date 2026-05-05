// v2 - fixed schema
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
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !stripeSecretKey) {
      return res.status(500).json({ error: "Missing Supabase/Stripe configuration." });
    }

    if (!isValidStripeSecretKey(stripeSecretKey)) {
      return res.status(500).json({
        error: "Invalid STRIPE_SECRET_KEY. Use a secret key starting with sk_test_ or sk_live_.",
      });
    }

    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!accessToken) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    // Verify the user
    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuthClient.auth.getUser(accessToken);

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid session." });
    }

    // Use service role for DB writes to bypass RLS
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey || supabaseAnonKey,
    );

    // User-scoped client for reads
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const stripe = new Stripe(stripeSecretKey);

    // Load profile to check for existing Stripe account + prefill data
    const { data: profile } = await supabaseUser
      .from("profiles")
      .select("stripe_account_id,stripe_connect_account_id,country,first_name,last_name,full_name,phone,suburb,state,postcode")
      .eq("id", user.id)
      .maybeSingle();

    let accountId = profile?.stripe_account_id || profile?.stripe_connect_account_id || null;

    if (!accountId) {
      const country = String(profile?.country || "AU").slice(0, 2).toUpperCase();

      // Build prefilled individual data from profile
      const firstName = profile?.first_name ||
        user.user_metadata?.first_name ||
        user.user_metadata?.full_name?.split(" ")?.[0] ||
        "";
      const lastName = profile?.last_name ||
        user.user_metadata?.last_name ||
        user.user_metadata?.full_name?.split(" ")?.slice(1)?.join(" ") ||
        "";
      const phone = profile?.phone || user.user_metadata?.phone || undefined;

      // Create Express account prefilled as individual
      const account = await stripe.accounts.create({
        type: "express",
        country: country || "AU",
        email: user.email || undefined,

        // ── KEY FIX: set as individual, not business ──
        business_type: "individual",

        // Prefill personal details so user doesn't have to type them
        individual: {
          email: user.email || undefined,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          phone: phone || undefined,
        },

        // Prefill business profile with our platform details
        // so they don't have to enter industry/website
        business_profile: {
          name: [firstName, lastName].filter(Boolean).join(" ") || undefined,
          url: "https://snatchn.com.au",
          product_description: "Peer-to-peer fashion rental via Snatch'n",
          mcc: "5691", // Family clothing stores — closest match for fashion rental
        },

        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },

        settings: {
          payouts: {
            schedule: { interval: "manual" },
          },
        },
      });

      accountId = account.id;

      // Save account ID using admin client to bypass RLS
      let saveError: any = null;
      for (const col of ["stripe_account_id", "stripe_connect_account_id"]) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .upsert(
            { id: user.id, [col]: accountId, updated_at: new Date().toISOString() },
            { onConflict: "id" },
          );
        if (!error) { saveError = null; break; }
        saveError = error;
      }

      if (saveError) {
        console.error("Failed to save Stripe account ID:", saveError.message);
      } else {
        console.log("Stripe account ID saved successfully:", accountId);
      }
    } else {
      console.log("Reusing existing Stripe account:", accountId);
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
