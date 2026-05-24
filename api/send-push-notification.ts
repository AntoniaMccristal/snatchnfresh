import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:hello@snatchn.com.au",
    vapidPublicKey,
    vapidPrivateKey,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { user_id, title, body, url } = req.body || {};
  if (!user_id || !title) return res.status(400).json({ error: "Missing fields" });
  if (!supabaseUrl || !supabaseServiceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return res.status(500).json({ error: "Push notification configuration missing" });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (error) {
      return res.status(400).json({ error: error.message || "Could not load push subscriptions" });
    }

    if (!subs?.length) return res.status(200).json({ sent: 0 });

    const payload = JSON.stringify({ title, body, url: url || "/" });
    const results = await Promise.allSettled(
      subs.map((sub: any) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ),
      ),
    );

    const sent = results.filter((result) => result.status === "fulfilled").length;
    return res.status(200).json({ sent });
  } catch (sendError: any) {
    console.error("send-push-notification error", sendError);
    return res.status(500).json({ error: sendError?.message || "Could not send push notification" });
  }
}
