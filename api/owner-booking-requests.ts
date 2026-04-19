import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function isMissingColumnError(error: any) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return res.status(500).json({ error: "Missing Supabase configuration." });
  }

  try {
    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

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

    const byOwner = await admin
      .from("items")
      .select("id,title,image_url,updated_at,created_at")
      .eq("owner_id", user.id);

    const ownerMissing =
      byOwner.error?.code === "42703" ||
      String(byOwner.error?.message || "").toLowerCase().includes("owner_id");
    if (byOwner.error && !ownerMissing) throw byOwner.error;

    const byUser = await admin
      .from("items")
      .select("id,title,image_url,updated_at,created_at")
      .eq("user_id", user.id);

    const userMissing =
      byUser.error?.code === "42703" ||
      String(byUser.error?.message || "").toLowerCase().includes("user_id");
    if (byUser.error && !userMissing) throw byUser.error;

    const ownerItems = Array.from(
      new Map([...(byOwner.data || []), ...(byUser.data || [])].map((item: any) => [item.id, item])).values(),
    );

    const itemIds = ownerItems.map((item: any) => item.id).filter(Boolean);
    if (itemIds.length === 0) {
      return res.status(200).json({ requests: [] });
    }

    const bookingsResult = await admin
      .from("bookings")
      .select("id,item_id,renter_id,start_date,end_date,total_price,created_at,paid_at,stripe_payment_intent_id,stripe_checkout_session_id,status")
      .in("item_id", itemIds)
      .in("status", ["pending", "paid"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (bookingsResult.error) {
      return res.status(400).json({ error: bookingsResult.error.message || "Could not load owner booking requests." });
    }

    const renterIds = Array.from(new Set((bookingsResult.data || []).map((row: any) => row.renter_id).filter(Boolean)));
    const renterProfiles = renterIds.length
      ? await admin.from("profiles").select("id,username,full_name,avatar_url").in("id", renterIds)
      : { data: [] as any[], error: null };

    if (renterProfiles.error && !isMissingColumnError(renterProfiles.error)) {
      throw renterProfiles.error;
    }

    const renterById = new Map((renterProfiles.data || []).map((row: any) => [row.id, row]));
    const itemById = new Map(ownerItems.map((row: any) => [row.id, row]));

    const requests = (bookingsResult.data || []).map((booking: any) => {
      const item = itemById.get(booking.item_id);
      const renter = renterById.get(booking.renter_id);

      return {
        ...booking,
        item_title: item?.title || "your listing",
        item_image_url: item?.image_url || "",
        renter_name:
          String(renter?.full_name || "").trim() ||
          String(renter?.username || "").trim() ||
          "Renter",
        renter_avatar_url: String(renter?.avatar_url || "").trim(),
      };
    });

    return res.status(200).json({ requests });
  } catch (error: any) {
    console.error("owner-booking-requests error", error);
    return res.status(500).json({ error: error?.message || "Could not load owner booking requests." });
  }
}
