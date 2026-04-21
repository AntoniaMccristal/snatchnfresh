import { useEffect, useMemo, useState } from "react";

const DISMISS_KEY = "snatchn-pwa-prompt-dismissed";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || (window.navigator as any).standalone === true;
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasDismissedRecently() {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DISMISS_MS;
}

function rememberDismissal() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

export default function PWAInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  const ios = useMemo(() => isIosDevice(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || wasDismissedRecently()) return;

    let timerId: number | null = null;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (timerId) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        setVisible(true);
      }, 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    if (ios) {
      timerId = window.setTimeout(() => {
        setVisible(true);
      }, 3000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [ios]);

  if (!visible || isStandalone()) {
    return null;
  }

  const dismiss = () => {
    rememberDismissal();
    setVisible(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
      } else {
        dismiss();
      }
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-x-4 bottom-[max(5.5rem,env(safe-area-inset-bottom)+1rem)] z-[120] md:right-6 md:left-auto md:max-w-sm">
      <div className="rounded-3xl border border-border/60 bg-card/95 backdrop-blur shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <img
            src="/pwa-192x192.png"
            alt="Snatch'n app icon"
            className="h-12 w-12 rounded-2xl border border-border/60 shadow-soft"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Install Snatch&apos;n</p>
            {!ios ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Get a faster, app-like experience with one-tap access from your home screen.
              </p>
            ) : (
              <div className="mt-1 space-y-1 text-xs leading-relaxed text-muted-foreground">
                <p>Add Snatch&apos;n to your home screen:</p>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>Tap the Share button in Safari</li>
                  <li>Tap <span className="font-medium text-foreground">Add to Home Screen</span></li>
                  <li>Tap <span className="font-medium text-foreground">Add</span></li>
                </ol>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="h-10 rounded-2xl border border-border/60 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 active:scale-[0.98]"
          >
            Not now
          </button>
          {!ios && deferredPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="h-10 rounded-2xl px-4 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: "#3d1f6e" }}
            >
              {installing ? "Installing..." : "Install app"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
