import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { hasCompletedPostalProfile } from "./lib/profileCompletion";
import { getMfaRequirement } from "./lib/mfa";
import { uploadAvatar } from "./lib/avatarUpload";
import { ensureProfileIdentity } from "./lib/profileIdentity";

type Mode = "login" | "signup" | "reset";

function resolveAppUrl() {
  const envUrl = String(import.meta.env.VITE_APP_URL || "").trim().replace(/\/$/, "");
  const browserUrl =
    typeof window !== "undefined" ? String(window.location.origin || "").trim().replace(/\/$/, "") : "";

  // Never let a stale localhost env override a real deployed origin.
  if (browserUrl && !browserUrl.includes("localhost")) {
    return browserUrl;
  }

  if (envUrl) {
    return envUrl;
  }

  return browserUrl;
}

export default function Auth() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const googleEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED !== "false";
  const appUrl = resolveAppUrl();
  const recoveryInUrl = useMemo(() => {
    if (typeof window === "undefined") return false;
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    return hash.includes("type=recovery") || search.includes("type=recovery");
  }, []);

  const resolvePostAuthRoute = async (userId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id === userId) {
      await ensureProfileIdentity(userData.user);
    }
    const mfa = await getMfaRequirement();
    if (mfa.needsChallenge) {
      return "/auth/mfa";
    }
    const completed = await hasCompletedPostalProfile(userId);
    return completed ? "/" : "/onboarding";
  };

  useEffect(() => {
    const checkSession = async () => {
      if (recoveryInUrl) {
        setMode("reset");
        setMessage("Set your new password below.");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const destination = await resolvePostAuthRoute(data.session.user.id);
        navigate(destination, { replace: true });
      }
    };

    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
        setMessage("Set your new password below.");
        return;
      }
      if (session) {
        window.dispatchEvent(new Event("snatchn:flash-logo"));
        const destination = await resolvePostAuthRoute(session.user.id);
        navigate(destination, { replace: true });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [navigate, recoveryInUrl]);

  function onAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSignUp() {
    if (!email || !password) {
      setMessage("Enter email and password.");
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setMessage("Enter your first and last name.");
      return;
    }

    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
      setMessage("Choose a username.");
      return;
    }
    if (!/^[a-z0-9._]{3,20}$/.test(normalizedUsername)) {
      setMessage("Username must be 3-20 chars and use letters, numbers, . or _");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { data: existingUsernames, error: usernameCheckError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", normalizedUsername)
      .limit(1);

    if (!usernameCheckError && (existingUsernames || []).length > 0) {
      setMessage("That username is already taken. Try another.");
      setLoading(false);
      return;
    }

    const combinedName = `${firstName.trim()} ${lastName.trim()}`.trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl}/auth`,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          username: normalizedUsername,
          full_name: combinedName || null,
        },
      },
    });

    if (error) {
      const text = String(error.message || "");
      if (text.toLowerCase().includes("already registered") || text.toLowerCase().includes("already exists")) {
        setMode("login");
        setMessage("This email already has an account. Please log in or reset your password.");
      } else if (text.toLowerCase().includes("unsupported provider")) {
        setMessage("Google sign-in is not configured yet. Please use email login for now.");
      } else {
        setMessage(error.message);
      }
      setLoading(false);
      return;
    }

    // If project returns a session on sign-up, we can also upload avatar immediately.
    if (data?.session && data.user && avatarFile) {
      try {
        const avatarUrl = await uploadAvatar(data.user.id, avatarFile);

        await supabase.auth.updateUser({
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            username: normalizedUsername,
            full_name: combinedName || null,
            avatar_url: avatarUrl,
          },
        });
      } catch (avatarError: any) {
        console.error(avatarError);
        setMessage(
          "Account created. Verification email sent. Avatar upload failed for now, you can upload it later from Profile.",
        );
        setLoading(false);
        return;
      }
    }

    if (data?.user) {
      try {
        await ensureProfileIdentity({
          ...data.user,
          user_metadata: {
            ...(data.user.user_metadata || {}),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            username: normalizedUsername,
            full_name: combinedName || null,
          },
        });
      } catch (profileError) {
        console.error("Profile bootstrap failed", profileError);
      }
    }

    setMessage(
      "Account created. Check your email to verify before logging in. You can upload/edit your profile photo from Profile anytime.",
    );
    setLoading(false);
  }

  async function handleLogin() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const text = String(error.message || "").toLowerCase();
      if (text.includes("invalid login credentials")) {
        setMessage("Invalid email or password. You can use Forgot password below.");
      } else {
        setMessage(error.message);
      }
      setLoading(false);
      return;
    }

    window.dispatchEvent(new Event("snatchn:flash-logo"));
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appUrl}/auth`,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setMessage("Enter your email first, then tap Forgot password.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${appUrl}/auth`,
    });

    if (error) {
      setMessage(error.message || "Could not send reset email.");
      setLoading(false);
      return;
    }

    setMessage("Password reset email sent. Open the link, then set your new password here.");
    setLoading(false);
  }

  async function handleResetPassword() {
    if (!newPassword || !confirmNewPassword) {
      setMessage("Enter and confirm your new password.");
      return;
    }

    if (newPassword.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setMessage("New passwords do not match.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage(error.message || "Could not update password.");
      setLoading(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      const destination = await resolvePostAuthRoute(userData.user.id);
      setMessage("Password updated.");
      setLoading(false);
      navigate(destination, { replace: true });
      return;
    }

    setMode("login");
    setMessage("Password updated. Please log in.");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-warm-gradient flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card shadow-card p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Welcome to Snatch'n</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login"
              ? "Log in to continue"
              : mode === "signup"
                ? "Set up your profile and verify your email"
                : "Set your new password"}
          </p>
        </div>

        {googleEnabled && mode !== "reset" && (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-11 rounded-xl border border-border/60 bg-background text-foreground font-semibold disabled:opacity-60"
          >
            Continue with Google
          </button>
        )}

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">Or continue with email</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/50 border border-border/50">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`h-9 rounded-lg text-sm font-semibold ${
              mode === "login" ? "bg-card shadow-soft" : "text-muted-foreground"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`h-9 rounded-lg text-sm font-semibold ${
              mode === "signup" ? "bg-card shadow-soft" : "text-muted-foreground"
            }`}
          >
            Set Up Profile
          </button>
        </div>

        {mode === "signup" && (
          <>
            <div className="flex items-center gap-3">
              <label className="relative w-14 h-14 rounded-full border border-border/60 bg-muted/60 overflow-hidden flex items-center justify-center cursor-pointer">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera size={18} className="text-muted-foreground" />
                )}
                <input type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
              </label>
              <div>
                <p className="text-sm font-medium text-foreground">Profile picture</p>
                <p className="text-xs text-muted-foreground">Tap to upload from your device</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="First name"
                className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <input
                placeholder="Last name"
                className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <input
              placeholder="Username (e.g. antonia)"
              className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </>
        )}

        {mode !== "reset" && (
          <>
            <input
              type="email"
              placeholder="Email"
              className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {mode === "signup" && (
              <input
                type="password"
                placeholder="Confirm password"
                className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            )}
          </>
        )}

        {mode === "reset" && (
          <>
            <input
              type="password"
              placeholder="New password"
              className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
            />
          </>
        )}

        <button
          type="button"
          onClick={
            mode === "login"
              ? handleLogin
              : mode === "signup"
                ? handleSignUp
                : handleResetPassword
          }
          disabled={loading}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
        >
          {loading
            ? "Please wait..."
            : mode === "login"
              ? "Login"
              : mode === "signup"
                ? "Create Account"
                : "Update Password"}
        </button>

        {mode === "login" && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowForgotPassword((prev) => !prev)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {showForgotPassword ? "Hide forgot password" : "Forgot password?"}
            </button>
            {showForgotPassword && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full h-10 rounded-xl border border-border/60 bg-background text-foreground text-sm font-semibold disabled:opacity-60"
              >
                Send reset link
              </button>
            )}
          </div>
        )}

        {mode === "signup" && (
          <p className="text-xs text-muted-foreground">
            We’ll send an email verification link after sign-up. After confirmation, you’ll be asked for phone and postal address.
          </p>
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
