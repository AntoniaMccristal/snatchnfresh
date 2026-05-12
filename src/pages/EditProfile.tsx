import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Loader2, MapPin, Save, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { uploadAvatar } from "@/lib/avatarUpload";
import AvatarCropper from "@/components/AvatarCropper";

export default function EditProfile() {
  const navigate = useNavigate();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [suburb, setSuburb] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [cropSrc, setCropSrc] = useState("");
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user;
      if (!currentUser) {
        navigate("/auth", { replace: true });
        return;
      }

      setUser(currentUser);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("first_name,last_name,username,suburb,phone,avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) {
        console.error("Edit profile load error", profileError);
      }

      const metadata = currentUser.user_metadata || {};
      const authFirst = String(metadata.first_name || "").trim();
      const authLast = String(metadata.last_name || "").trim();
      const authFull = String(metadata.full_name || "").trim();

      if (profile?.first_name || authFirst) setFirstName(String(profile?.first_name || authFirst).trim());
      if (profile?.last_name || authLast) setLastName(String(profile?.last_name || authLast).trim());
      if (!(profile?.first_name || authFirst || profile?.last_name || authLast) && authFull) {
        const [first = "", ...rest] = authFull.split(" ");
        setFirstName(first);
        setLastName(rest.join(" "));
      }

      setUsername(String(profile?.username || metadata.username || "").trim().toLowerCase());
      setSuburb(String(profile?.suburb || metadata.suburb || metadata.city || "").trim());
      setPhone(String(profile?.phone || metadata.phone || "").trim());
      setAvatarUrl(String(profile?.avatar_url || metadata.avatar_url || metadata.picture || "").trim());
      setLoading(false);
    };

    void load();
  }, [navigate]);

  async function handleAvatarSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setCropSrc(String(e.target?.result || ""));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function handleCropSave(blob: Blob) {
    if (!user) return;
    setSaving(true);
    setError("");
    setMessage("");
    setPendingAvatarBlob(blob);

    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      const nextAvatarUrl = await uploadAvatar(user.id, file);
      setAvatarUrl(nextAvatarUrl);
      setCropSrc("");
    } catch (uploadError: any) {
      setError(uploadError?.message || "Unable to upload profile image.");
    } finally {
      setPendingAvatarBlob(null);
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const normalizedUsername = username.trim().toLowerCase();
      const trimmedFirstName = firstName.trim();
      const trimmedLastName = lastName.trim();
      const trimmedSuburb = suburb.trim();
      const trimmedPhone = phone.trim();
      const fullName = `${trimmedFirstName} ${trimmedLastName}`.trim();

      if (!trimmedFirstName) throw new Error("Enter your first name.");
      if (!trimmedLastName) throw new Error("Enter your last name.");
      if (!normalizedUsername) throw new Error("Choose a username.");
      if (!/^[a-z0-9._]{3,20}$/.test(normalizedUsername)) {
        throw new Error("Username must be 3-20 characters using letters, numbers, . or _");
      }

      const { data: existing, error: existingError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .neq("id", user.id)
        .limit(1);
      if (existingError) throw new Error(existingError.message || "Unable to validate username.");
      if ((existing || []).length > 0) throw new Error("That username is already taken.");

      let payload: Record<string, any> = {
        id: user.id,
        username: normalizedUsername,
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        full_name: fullName || null,
        suburb: trimmedSuburb || null,
        phone: trimmedPhone || null,
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      };

      for (let i = 0; i < 8; i += 1) {
        const result = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
        if (!result.error) break;
        const messageText = String(result.error.message || "");
        const missingColumn = result.error.code === "42703" || result.error.code === "PGRST204" || messageText.toLowerCase().includes("column");
        if (!missingColumn) throw new Error(result.error.message || "Could not save profile.");
        const match = messageText.match(/['"]([a-zA-Z0-9_]+)['"]/);
        const column = match?.[1];
        if (!column || !(column in payload)) throw new Error(result.error.message || "Could not save profile.");
        delete payload[column];
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          username: normalizedUsername,
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
          full_name: fullName || null,
          suburb: trimmedSuburb || null,
          phone: trimmedPhone || null,
          avatar_url: avatarUrl || null,
        },
      });
      if (authError) throw new Error(authError.message || "Could not update account metadata.");

      setMessage("Profile updated successfully.");
    } catch (saveError: any) {
      setError(saveError?.message || "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const displayInitial = String(firstName || username || user?.email || "U").charAt(0).toUpperCase();

  if (loading) {
    return (
      <div className="app-shell bg-warm-gradient flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell bg-warm-gradient pb-24">
      <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] space-y-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="w-10 h-10 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft"
          >
            <ArrowLeft size={18} className="text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground">Edit profile</h1>
            <p className="text-xs text-muted-foreground">Update your public details</p>
          </div>
        </div>

        <section className="bg-card rounded-3xl border border-border/50 shadow-card p-5 space-y-5">
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-card shadow-card bg-background"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-2xl font-bold text-foreground">
                  {displayInitial || <UserRound size={28} />}
                </span>
              )}
              <span className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Camera size={14} />
              </span>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
            <p className="text-xs text-muted-foreground">Tap photo to update avatar</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">First name</span>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full h-11 rounded-2xl border border-border/60 px-4 bg-background text-sm"
                placeholder="First name"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Last name</span>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full h-11 rounded-2xl border border-border/60 px-4 bg-background text-sm"
                placeholder="Last name"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              className="w-full h-11 rounded-2xl border border-border/60 px-4 bg-background text-sm"
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <p className="text-[11px] text-muted-foreground">3-20 characters using letters, numbers, . or _</p>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">Suburb / location</span>
            <div className="relative">
              <MapPin size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={suburb}
                onChange={(event) => setSuburb(event.target.value)}
                className="w-full h-11 rounded-2xl border border-border/60 pl-11 pr-4 bg-background text-sm"
                placeholder="Suburb or city"
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">Phone number</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full h-11 rounded-2xl border border-border/60 px-4 bg-background text-sm"
              placeholder="04XX XXX XXX"
              inputMode="tel"
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </div>
          )}

          {(saving || pendingAvatarBlob) && (
            <div className="text-xs text-primary flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Saving changes...
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 shadow-card disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save changes
          </button>
        </section>
      </div>

      {cropSrc && (
        <AvatarCropper
          imageSrc={cropSrc}
          onSave={handleCropSave}
          onCancel={() => setCropSrc("")}
        />
      )}
    </div>
  );
}
