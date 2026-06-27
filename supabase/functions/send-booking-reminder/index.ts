// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

type BookingReminderPayload = {
  type?: string;
  table?: string;
  record?: Record<string, any>;
  old_record?: Record<string, any>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function getStartDate(value: string) {
  if (!value) return null;
  const hasTime = value.includes("T");
  const date = new Date(hasTime ? value : `${value}T09:00:00+11:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendResendEmail({
  to,
  subject,
  text,
  html,
  scheduledAt,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
  scheduledAt?: string;
}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) throw new Error("RESEND_API_KEY is missing");

  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Snatch'n <hello@snatchn.com.au>";
  const body: Record<string, any> = { from, to, subject, text, html };
  if (scheduledAt) body.scheduled_at = scheduledAt;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Resend email failed");
  }

  return payload;
}

async function sendPushNotification({
  userId,
  title,
  body,
  url,
}: {
  userId: string;
  title: string;
  body: string;
  url: string;
}) {
  const appUrl = Deno.env.get("APP_URL") || Deno.env.get("VITE_APP_URL") || "https://snatchn.com.au";
  const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/send-push-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, title, body, url }),
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await response.json().catch(() => ({})),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const payload = (await req.json().catch(() => ({}))) as BookingReminderPayload;
    const record = payload.record || (payload as any).new || payload;

    if (record?.status !== "approved") {
      return jsonResponse({ ok: true, skipped: "booking_not_approved" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase service configuration" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id,item_id,renter_id,owner_id,start_date,status")
      .eq("id", record.id)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) return jsonResponse({ error: "Booking not found" }, 404);
    if (booking.status !== "approved") return jsonResponse({ ok: true, skipped: "booking_status_changed" });

    const startDate = getStartDate(String(booking.start_date || ""));
    if (!startDate) return jsonResponse({ error: "Booking start_date is missing or invalid" }, 400);

    const reminderAt = addHours(startDate, -24);
    const now = new Date();
    const shouldSchedule = reminderAt.getTime() > now.getTime() + 60_000;
    const scheduledAt = shouldSchedule ? reminderAt.toISOString() : undefined;

    const [{ data: item }, { data: profiles }, renterAuth, ownerAuth] = await Promise.all([
      supabase
        .from("items")
        .select("id,title,image_url")
        .eq("id", booking.item_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id,full_name,username")
        .in("id", [booking.renter_id, booking.owner_id].filter(Boolean)),
      supabase.auth.admin.getUserById(booking.renter_id),
      supabase.auth.admin.getUserById(booking.owner_id),
    ]);

    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
    const renterProfile = profileMap.get(booking.renter_id) || {};
    const ownerProfile = profileMap.get(booking.owner_id) || {};
    const renterEmail = firstNonEmpty(renterAuth.data?.user?.email);
    const ownerEmail = firstNonEmpty(ownerAuth.data?.user?.email);
    const renterName = firstNonEmpty(renterProfile.full_name, renterProfile.username, renterAuth.data?.user?.email?.split("@")[0], "Your renter");
    const itemTitle = firstNonEmpty(item?.title, "your item");
    const appUrl = (Deno.env.get("APP_URL") || Deno.env.get("VITE_APP_URL") || "https://snatchn.com.au").replace(/\/$/, "");
    const renterMessagesUrl = `${appUrl}/messages?user=${booking.owner_id}&item=${booking.item_id}`;
    const lenderMessagesUrl = `${appUrl}/messages?user=${booking.renter_id}&item=${booking.item_id}`;

    if (!renterEmail || !ownerEmail) {
      return jsonResponse({ error: "Missing renter or lender email address" }, 400);
    }

    const renterSubject = `Your rental of ${itemTitle} starts tomorrow`;
    const renterText = `Your rental of ${itemTitle} starts tomorrow — confirm your pickup time with the lender: ${renterMessagesUrl}`;
    const renterHtml = `
      <p>Your rental of <strong>${escapeHtml(itemTitle)}</strong> starts tomorrow — confirm your pickup time with the lender.</p>
      <p><a href="${escapeHtml(renterMessagesUrl)}">Open messages</a></p>
    `;

    const lenderSubject = `${renterName} is picking up ${itemTitle} tomorrow`;
    const lenderText = `${renterName} is picking up ${itemTitle} tomorrow — make sure it's ready! Message them here: ${lenderMessagesUrl}`;
    const lenderHtml = `
      <p><strong>${escapeHtml(renterName)}</strong> is picking up <strong>${escapeHtml(itemTitle)}</strong> tomorrow — make sure it's ready!</p>
      <p><a href="${escapeHtml(lenderMessagesUrl)}">Message renter</a></p>
    `;

    const [renterEmailResult, lenderEmailResult] = await Promise.all([
      sendResendEmail({
        to: renterEmail,
        subject: renterSubject,
        text: renterText,
        html: renterHtml,
        scheduledAt,
      }),
      sendResendEmail({
        to: ownerEmail,
        subject: lenderSubject,
        text: lenderText,
        html: lenderHtml,
        scheduledAt,
      }),
    ]);

    const pushResults = shouldSchedule
      ? { skipped: "push_notifications_not_sent_early", reason: "existing push endpoint sends immediately" }
      : await Promise.allSettled([
        sendPushNotification({
          userId: booking.renter_id,
          title: "Rental starts tomorrow",
          body: `Your rental of ${itemTitle} starts tomorrow — confirm your pickup time with the lender`,
          url: `/messages?user=${booking.owner_id}&item=${booking.item_id}`,
        }),
        sendPushNotification({
          userId: booking.owner_id,
          title: "Rental starts tomorrow",
          body: `${renterName} is picking up ${itemTitle} tomorrow — make sure it's ready!`,
          url: `/messages?user=${booking.renter_id}&item=${booking.item_id}`,
        }),
      ]);

    return jsonResponse({
      ok: true,
      booking_id: booking.id,
      scheduled_at: scheduledAt || null,
      reminder_at: reminderAt.toISOString(),
      emails: {
        renter: renterEmailResult,
        lender: lenderEmailResult,
      },
      push: pushResults,
    });
  } catch (error: any) {
    console.error("send-booking-reminder error", error);
    return jsonResponse({ error: error?.message || "Could not schedule booking reminder" }, 500);
  }
});
