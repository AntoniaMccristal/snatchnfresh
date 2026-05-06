import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Check, MapPin, Phone, User } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { hasCompletedPostalProfile } from "@/lib/profileCompletion";
import { ensureProfileIdentity } from "@/lib/profileIdentity";
import { uploadAvatar } from "@/lib/avatarUpload";

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1, label: "Profile" },
  { id: 2, label: "Location" },
  { id: 3, label: "Contact" },
  { id: 4, label: "Done" },
];

export default function OnboardingProfile() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // Step 1 — Profile
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");

  // Step 2 — Location
  const [suburb, setSuburb] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postcode, setPostcode] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [country] = useState("Australia");

  // Step 3 — Contact
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth", { replace: true }); return; }

      setUserId(user.id);
      await ensureProfileIdentity(user);

      const authFirst = String(user.user_metadata?.first_name || "").trim();
      const authLast = String(user.user_metadata?.last_name || "").trim();
      const authFull = String(user.user_metadata?.full_name || "").trim();
      const authUsername = String(user.user_metadata?.username || "").trim().toLowerCase();
      const authAvatar = String(user.user_metadata?.avatar_url || "").trim();

      if (authFirst) setFirstName(authFirst);
      if (authLast) setLastName(authLast);
      if (authUsername) setUsername(authUsername);
      if (authAvatar) setAvatarPreview(authAvatar);
      if ((!authFirst || !authLast) && authFull) {
        const [first = "", ...rest] = authFull.split(" ");
        if (!authFirst) setFirstName(first);
        if (!authLast) setLastName(rest.join(" "));
      }

      const { data } = await supabase
        .from("profiles")
        .select("username,first_name,last_name,full_name,phone,address_line1,address_line2,suburb,state,postcode,avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (data) {
        if (data.username) setUsername(String(data.username).trim().toLowerCase());
        if (data.first_name) setFirstName(String(data.first_name).trim());
        if (data.last_name) setLastName(String(data.last_name).trim());
        if (data.phone) setPhone(data.phone);
        if (data.address_line1) setAddressLine1(data.address_line1);
        if (data.address_line2) setAddressLine2(data.address_line2);
        if (data.suburb) setSuburb(data.suburb);
        if (data.state) setStateRegion(data.state);
        if (data.postcode) setPostcode(data.postcode);
        if (data.avatar_url && !authAvatar) setAvatarPreview(data.avatar_url);
      }

      const done = await hasCompletedPostalProfile(user.id);
      if (done) { navigate("/", { replace: true }); return; }

      setLoading(false);
    };
    load();
  }, [navigate]);

  function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleStep1() {
    setError("");
    if (!firstName.trim()) { setError("Enter your first name."); return; }
    if (!lastName.trim()) { setError("Enter your last name."); return; }
    if (!username.trim()) { setError("Choose a username."); return; }
    const norm = username.trim().toLowerCase();
    if (!/^[a-z0-9._]{3,20}$/.test(norm)) {
      setError("Username must be 3–20 characters using letters, numbers, . or _");
      return;
    }
    const { data: existing } = await supabase
      .from("profiles").select("id").eq("username", norm).neq("id", userId).limit(1);
    if ((existing || []).length > 0) { setError("That username is already taken."); return; }
    setStep(2);
  }

  async function handleStep2() {
    setError("");
    if (!suburb.trim()) { setError("Enter your suburb or city."); return; }
    if (!stateRegion.trim()) { setError("Enter your state."); return; }
    if (!postcode.trim()) { setError("Enter your postcode."); return; }
    setStep(3);
  }

  async function handleStep3() {
    setError("");
    if (!phone.trim()) { setError("Enter your phone number."); return; }
    await handleSave();
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setError("");

    try {
      // Upload avatar if a new file was selected
      let avatarUrl = avatarPreview;
      if (avatarFile) {
        avatarUrl = await uploadAvatar(userId, avatarFile);
      }

      const normalizedUsername = username.trim().toLowerCase();
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      let payload: any = {
        id: userId,
        username: normalizedUsername,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName || null,
        phone: phone.trim(),
        address_line1: addressLine1.trim() || null,
        address_line2: addressLine2.trim() || null,
        suburb: suburb.trim(),
        state: stateRegion.trim(),
        postcode: postcode.trim(),
        country,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        updated_at: new Date().toISOString(),
      };

      // Retry upsert stripping unknown columns
      let upsertError: any = null;
      for (let i = 0; i < 8; i += 1) {
        const result = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
        upsertError = result.error;
        if (!upsertError) break;
        const message = String(upsertError.message || "").toLowerCase();
        const missingColumn = upsertError.code === "42703" || upsertError.code === "PGRST204" || message.includes("column");
        if (!missingColumn) break;
        const match = String(upsertError.message || "").match(/['"]([a-zA-Z0-9_]+)['"]/);
        const col = match?.[1];
        if (!col || !(col in payload)) break;
        delete payload[col];
      }

      if (upsertError) throw new Error(upsertError.message || "Could not save your details.");

      await supabase.auth.updateUser({
        data: {
          username: normalizedUsername,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: fullName || null,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        },
      });

      setStep(4);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="app-shell bg-warm-gradient flex items-center justify-center">
        <div className="space-y-3 w-full max-w-xs px-5">
          <div className="h-4 rounded-full bg-muted animate-pulse w-3/4 mx-auto" />
          <div className="h-4 rounded-full bg-muted animate-pulse w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  // ── Step 4: Done ────────────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div className="app-shell bg-warm-gradient flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center mb-6 shadow-card">
          <Check size={36} className="text-primary-foreground" strokeWidth={3} />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground mb-2">You're all set!</h1>
        <p className="text-sm text-muted-foreground mb-2">
          Welcome to Snatch'n, <span className="font-semibold text-foreground">{firstName}</span>.
        </p>
        <p className="text-xs text-muted-foreground mb-10">
          Browse wardrobes near you or list your first item.
        </p>
        <button
          onClick={() => navigate("/")}
          className="w-full max-w-xs h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-card active:scale-[0.98] transition-all mb-3"
        >
          Start browsing
        </button>
        <button
          onClick={() => navigate("/list")}
          className="w-full max-w-xs h-12 rounded-2xl border border-border/60 bg-card text-sm font-semibold active:scale-[0.98] transition-all"
        >
          List your first item
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell bg-warm-gradient flex flex-col">

      {/* Progress bar */}
      <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        {/* Back button */}
        <div className="flex items-center mb-5">
          {step > 1 ? (
            <button
              onClick={() => { setError(""); setStep((s) => (s - 1) as Step); }}
              className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft"
            >
              <ArrowLeft size={16} className="text-foreground" />
            </button>
          ) : (
            <div className="w-9 h-9" />
          )}
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 mb-6">
          {STEPS.slice(0, 3).map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5 flex-1">
              <div
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  step > s.id ? "bg-primary" : step === s.id ? "bg-primary" : "bg-border"
                }`}
              />
            </div>
          ))}
        </div>

        {/* Step icon + title */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            {step === 1 && <User size={16} className="text-primary" />}
            {step === 2 && <MapPin size={16} className="text-primary" />}
            {step === 3 && <Phone size={16} className="text-primary" />}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Step {step} of 3
            </p>
            <h1 className="text-xl font-display font-bold text-foreground leading-tight">
              {step === 1 && "Set up your profile"}
              {step === 2 && "Where are you based?"}
              {step === 3 && "Add your contact"}
            </h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1 ml-12">
          {step === 1 && "Your name and username are shown on your listings."}
          {step === 2 && "Used to show items near you. Your full address is never public."}
          {step === 3 && "For delivery coordination. Only shared with your lender or renter."}
        </p>
      </div>

      {/* Form body */}
      <div className="flex-1 px-5 pb-10">

        {/* ── STEP 1: Profile ── */}
        {step === 1 && (
          <div className="space-y-3">
            {/* Avatar */}
            <label className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border/50 shadow-soft cursor-pointer">
              <div className="relative w-16 h-16 rounded-full border-2 border-border/60 bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Camera size={20} className="text-muted-foreground" />
                )}
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-full">
                  <Camera size={16} className="text-white" />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Profile photo</p>
                <p className="text-xs text-muted-foreground mt-0.5">Tap to upload · optional</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className="h-12 rounded-2xl border border-border/60 px-4 bg-card text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className="h-12 rounded-2xl border border-border/60 px-4 bg-card text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium select-none">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))}
                placeholder="username"
                maxLength={20}
                className="w-full h-12 rounded-2xl border border-border/60 pl-8 pr-4 bg-card text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>

            {username.length > 0 && username.length < 3 && (
              <p className="text-xs text-muted-foreground px-1">Username must be at least 3 characters</p>
            )}
          </div>
        )}

        {/* ── STEP 2: Location ── */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                placeholder="Suburb / City"
                className="h-12 rounded-2xl border border-border/60 px-4 bg-card text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
              <input
                value={stateRegion}
                onChange={(e) => setStateRegion(e.target.value)}
                placeholder="State"
                className="h-12 rounded-2xl border border-border/60 px-4 bg-card text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="Postcode"
              inputMode="numeric"
              maxLength={4}
              className="w-full h-12 rounded-2xl border border-border/60 px-4 bg-card text-sm focus:outline-none focus:border-primary/60 transition-colors"
            />

            {/* Optional full address */}
            <div className="rounded-2xl border border-border/40 bg-card/60 p-4 space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground">Delivery address · optional</p>
              <p className="text-[11px] text-muted-foreground">Only used for shipping — never shown publicly.</p>
              <input
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Street address"
                className="w-full h-11 rounded-xl border border-border/50 px-3 bg-background text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
              <input
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Apt, unit, floor (optional)"
                className="w-full h-11 rounded-xl border border-border/50 px-3 bg-background text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>

            <div className="flex items-start gap-2 px-1">
              <MapPin size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground">
                Your suburb is shown on listings so buyers know how far you are. Your street address stays private.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 3: Contact ── */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">🇦🇺 +61</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="04XX XXX XXX"
                inputMode="tel"
                className="w-full h-12 rounded-2xl border border-border/60 pl-20 pr-4 bg-card text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <p className="px-1 text-[11px] text-muted-foreground">Australian mobile number</p>

            <div className="rounded-2xl border border-border/40 bg-card/60 p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your number is only shared with the person you're transacting with to coordinate pickup and returns. It's never used for marketing.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* CTA button */}
        <button
          onClick={step === 1 ? handleStep1 : step === 2 ? handleStep2 : handleStep3}
          disabled={saving}
          className="w-full h-13 mt-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-card disabled:opacity-60 active:scale-[0.98] transition-all"
          style={{ height: 52 }}
        >
          {saving ? "Saving..." : step === 3 ? "Finish setup" : "Continue"}
        </button>

        {step === 2 && (
          <button
            onClick={() => { setError(""); setStep(3); }}
            className="w-full mt-2 py-3 text-sm text-muted-foreground font-medium"
          >
            Skip for now
          </button>
        )}

        {step === 3 && (
          <button
            onClick={() => handleSave()}
            className="w-full mt-2 py-3 text-sm text-muted-foreground font-medium"
          >
            Skip for now
          </button>
        )}

      </div>
    </div>
  );
}
