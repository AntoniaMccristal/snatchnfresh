import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function isMissingColumnError(error: any) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return res.status(500).json({ error: "Missing Supabase config." });
  }

  try {
    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!accessToken) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    const body = (req.body || {}) as { confirm?: string };
    if (String(body.confirm || "").trim().toUpperCase() !== "DELETE") {
      return res.status(400).json({ error: 'Confirmation text must be "DELETE".' });
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

    // 1) Unlist all of the user's items so they are immediately unavailable.
    let unlistError: any = null;
    const unlistPayload = { is_available: false, updated_at: new Date().toISOString() };

    const byOwner = await admin.from("items").update(unlistPayload).eq("owner_id", user.id);
    if (byOwner.error && !isMissingColumnError(byOwner.error)) {
      unlistError = byOwner.error;
    }

    const byUser = await admin.from("items").update(unlistPayload).eq("user_id", user.id);
    if (byUser.error && !isMissingColumnError(byUser.error)) {
      unlistError = byUser.error;
    }

    if (unlistError) {
      return res.status(400).json({ error: `Could not unlist items: ${unlistError.message}` });
    }

    // 2) Cancel any pending/approved bookings on those items.
    const cancelStatuses = ["pending", "approved"];
    const now = new Date().toISOString();

    const cancelByOwner = await admin
      .from("bookings")
      .update({ status: "cancelled", updated_at: now })
      .eq("owner_id", user.id)
      .in("status", cancelStatuses);

    if (cancelByOwner.error && !isMissingColumnError(cancelByOwner.error)) {
      return res.status(400).json({ error: `Could not cancel owner bookings: ${cancelByOwner.error.message}` });
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      return res.status(400).json({ error: deleteUserError.message || "Could not delete account." });
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("delete-account error", error);
    return res.status(500).json({ error: error?.message || "Could not delete account." });
  }
}

