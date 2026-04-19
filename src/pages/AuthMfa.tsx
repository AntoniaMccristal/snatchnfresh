import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { hasCompletedPostalProfile } from "../lib/profileCompletion";
import { getMfaRequirement } from "../lib/mfa";

export default function AuthMfa() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");
  const [showRecoveryInput, setShowRecoveryInput] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  useEffect(() => {
    const loadState = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        navigate("/auth", { replace: true });
        return;
      }

      const mfa = await getMfaRequirement();

      if (!mfa.factorId) {
        const done = await hasCompletedPostalProfile(session.user.id);
        navigate(done ? "/" : "/onboarding", { replace: true });
        return;
      }

      if (!mfa.needsChallenge) {
        const done = await hasCompletedPostalProfile(session.user.id);
        navigate(done ? "/" : "/onboarding", { replace: true });
        return;
      }

      setFactorId(mfa.factorId);
      setChecking(false);
    };

    loadState();
  }, [navigate]);

  async function handleVerify() {
    if (!factorId) return;
    if (!code.trim()) {
      setMessage("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });

    if (error) {
      setMessage(error.message || "Invalid code.");
      setLoading(false);
      return;
    }

    window.dispatchEvent(new Event("snatchn:flash-logo"));
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const done = session?.user ? await hasCompletedPostalProfile(session.user.id) : false;
    navigate(done ? "/" : "/onboarding", { replace: true });
    setLoading(false);
  }

  async function handleRecoveryCode() {
    if (!recoveryCode.trim()) {
      setMessage("Enter one of your recovery codes.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setMessage("Session expired. Please log in again.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/mfa-recovery-redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: recoveryCode.trim().toUpperCase() }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Recovery code failed.");
      }

      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
    } catch (error: any) {
      setMessage(error?.message || "Could not use recovery code.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <div className="app-shell p-6">Checking two-step verification...</div>;
  }

  return (
    <div className="min-h-screen bg-warm-gradient flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card shadow-card p-6 space-y-4">
        <h1 className="text-2xl font-display font-bold text-foreground">Two-step verification</h1>
        <p className="text-sm text-muted-foreground">
          Enter the code from your authenticator app to continue.
        </p>

        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="6-digit code"
          className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />

        <button
          type="button"
          onClick={handleVerify}
          disabled={loading}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
        >
          {loading ? "Verifying..." : "Verify and continue"}
        </button>

        <button
          type="button"
          onClick={() => setShowRecoveryInput((prev) => !prev)}
          className="w-full h-10 rounded-xl border border-border/60 bg-background text-foreground text-sm font-semibold"
        >
          {showRecoveryInput ? "Hide recovery code option" : "Use recovery code instead"}
        </button>

        {showRecoveryInput && (
          <div className="space-y-2">
            <input
              placeholder="XXXXX-XXXXX"
              className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background uppercase"
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
            />
            <button
              type="button"
              onClick={handleRecoveryCode}
              disabled={loading}
              className="w-full h-10 rounded-xl border border-border/60 bg-background text-foreground text-sm font-semibold disabled:opacity-60"
            >
              {loading ? "Checking..." : "Recover account"}
            </button>
          </div>
        )}

        {message && (
          <div className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs text-foreground">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
