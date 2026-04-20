import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Landmark, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "@/hooks/use-toast";

type StripeConnectStatus = {
  connected: boolean;
  hasAccount: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  accountId: string | null;
  requirementMessage: string | null;
};

type StripeConnectBannerProps = {
  returnPath?: string;
  variant?: "card" | "inline";
  onConnected?: () => void;
  onStatusChange?: (status: StripeConnectStatus) => void;
  heading?: string;
  compactDescription?: string;
};

const DEFAULT_STATUS: StripeConnectStatus = {
  connected: false,
  hasAccount: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  chargesEnabled: false,
  accountId: null,
  requirementMessage: null,
};

export default function StripeConnectBanner({
  returnPath = "/profile",
  variant = "card",
  onConnected,
  onStatusChange,
  heading,
  compactDescription,
}: StripeConnectBannerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<StripeConnectStatus>(DEFAULT_STATUS);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setStatus(DEFAULT_STATUS);
        onStatusChange?.(DEFAULT_STATUS);
        return;
      }

      const response = await fetch("/api/stripe-connect-status", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not load payout status.");
      }

      const nextStatus: StripeConnectStatus = {
        connected: Boolean(payload?.connected),
        hasAccount: Boolean(payload?.hasAccount),
        payoutsEnabled: Boolean(payload?.payoutsEnabled),
        detailsSubmitted: Boolean(payload?.detailsSubmitted),
        chargesEnabled: Boolean(payload?.chargesEnabled),
        accountId: payload?.accountId || null,
        requirementMessage: payload?.requirementMessage || null,
      };

      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
      if (nextStatus.connected) {
        onConnected?.();
      }
    } catch (error: any) {
      toast({
        title: "Could not load payout status",
        description: error?.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoadingStatus(false);
    }
  }, [onConnected, onStatusChange]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const stripeState = searchParams.get("stripe");
    if (!stripeState) return;

    let message: { title: string; description: string; destructive?: boolean } | null = null;

    if (stripeState === "connected") {
      message = {
        title: "Bank account connected",
        description: "Stripe payouts are ready. You can now receive rental earnings.",
      };
    }

    if (stripeState === "refresh") {
      message = {
        title: "Finish payout setup",
        description: "Stripe onboarding was not completed. Add your bank details to receive payouts.",
        destructive: true,
      };
    }

    const next = new URLSearchParams(searchParams);
    next.delete("stripe");
    setSearchParams(next, { replace: true });
    setConnecting(false);
    void loadStatus();

    if (message) {
      toast({
        title: message.title,
        description: message.description,
        variant: message.destructive ? "destructive" : undefined,
      });
    }
  }, [loadStatus, searchParams, setSearchParams]);

  const connectBank = useCallback(async () => {
    try {
      setConnecting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast({ title: "Login required", description: "Please log in again to continue.", variant: "destructive" });
        return;
      }

      const response = await fetch("/api/create-connect-onboarding-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ return_path: returnPath }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Could not open Stripe onboarding.");
      }

      window.location.assign(payload.url);
    } catch (error: any) {
      toast({
        title: "Stripe setup failed",
        description: error?.message || "Could not start Stripe onboarding.",
        variant: "destructive",
      });
      setConnecting(false);
    }
  }, [returnPath]);

  const isConnected = status.connected;
  const statusLabel = useMemo(() => {
    if (loadingStatus) return "Checking status";
    if (isConnected) return "Payout account connected";
    if (status.hasAccount) return "Action needed";
    return "Not connected";
  }, [isConnected, loadingStatus, status.hasAccount]);

  const description = useMemo(() => {
    if (compactDescription) return compactDescription;
    if (isConnected) {
      return "Your bank account is connected through Stripe. When a renter pays, funds stay held until booking approval and payout release.";
    }
    if (status.requirementMessage) return status.requirementMessage;
    return "Add your bank to get paid. Stripe handles payout onboarding securely and sends you back to Snatch'n when setup is complete.";
  }, [compactDescription, isConnected, status.requirementMessage]);

  const actionLabel = connecting
    ? "Opening Stripe..."
    : isConnected
      ? "Update bank details"
      : status.hasAccount
        ? "Finish bank setup"
        : "Add bank account";

  const wrapperClass =
    variant === "inline"
      ? "rounded-2xl border border-border/60 bg-card p-4"
      : "rounded-2xl border border-border/60 bg-card p-4 md:p-5";

  return (
    <section className={wrapperClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isConnected ? "bg-emerald-50 text-emerald-600" : "bg-primary/10 text-primary"}`}>
            {loadingStatus ? <Loader2 size={18} className="animate-spin" /> : isConnected ? <CheckCircle2 size={18} /> : <Landmark size={18} />}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{heading || "Add your bank to get paid"}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isConnected ? "bg-emerald-100 text-emerald-700" : status.hasAccount ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                {statusLabel}
              </span>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:pl-4">
          <button
            type="button"
            onClick={() => {
              void connectBank();
            }}
            disabled={loadingStatus || connecting}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
