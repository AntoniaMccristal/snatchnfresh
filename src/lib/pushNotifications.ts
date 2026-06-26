const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export async function registerPushSubscription(userId: string, supabase: any) {
  if (!VAPID_PUBLIC_KEY) return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { endpoint, keys } = sub.toJSON() as any;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return null;

    await supabase.from("push_subscriptions").upsert({
      user_id: userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    }, { onConflict: "user_id,endpoint" });

    return sub;
  } catch (err) {
    console.error("Push registration failed:", err);
    return null;
  }
}

export async function sendPushNotification(payload: {
  user_id: string;
  title: string;
  body?: string;
  url?: string;
}) {
  try {
    const response = await fetch("/api/send-push-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload?.error || "Push notification request failed.");
    }
  } catch (error) {
    console.error("Push notification trigger failed:", error);
  }
}

type BadgingNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export async function setAppBadgeCount(unreadCount: number) {
  if (typeof navigator === "undefined") return;

  const badgingNavigator = navigator as BadgingNavigator;
  if (!("setAppBadge" in badgingNavigator) || typeof badgingNavigator.setAppBadge !== "function") return;

  try {
    if (unreadCount > 0) {
      await badgingNavigator.setAppBadge(unreadCount);
      return;
    }

    await clearAppBadgeCount();
  } catch (error) {
    console.error("Could not set app badge:", error);
  }
}

export async function clearAppBadgeCount() {
  if (typeof navigator === "undefined") return;

  const badgingNavigator = navigator as BadgingNavigator;
  if (!("clearAppBadge" in badgingNavigator) || typeof badgingNavigator.clearAppBadge !== "function") return;

  try {
    await badgingNavigator.clearAppBadge();
  } catch (error) {
    console.error("Could not clear app badge:", error);
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
