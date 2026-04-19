import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { hasCompletedPostalProfile } from "@/lib/profileCompletion";
import { ensureProfileIdentity } from "@/lib/profileIdentity";

export default function OnboardingProfile() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [suburb, setSuburb] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("Australia");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/auth", { replace: true });
        return;
      }

      setUserId(user.id);
      await ensureProfileIdentity(user);

      const authFirst = String((user.user_metadata as any)?.first_name || "").trim();
      const authLast = String((user.user_metadata as any)?.last_name || "").trim();
      const authFull = String((user.user_metadata as any)?.full_name || "").trim();
      const authUsername = String((user.user_metadata as any)?.username || "").trim().toLowerCase();

      if (authFirst) setFirstName(authFirst);
      if (authLast) setLastName(authLast);
      if (authUsername) setUsername(authUsername);
      if ((!authFirst || !authLast) && authFull) {
        const [first = "", ...rest] = authFull.split(" ");
        const last = rest.join(" ");
        if (!authFirst) setFirstName(first);
        if (!authLast) setLastName(last);
      }

      const { data } = await supabase
        .from("profiles")
        .select("username,first_name,last_name,full_name,phone,address_line1,address_line2,suburb,state,postcode,country")
        .eq("id", user.id)
        .maybeSingle();

      if (data) {
        const profileUsername = String(data.username || "").trim().toLowerCase();
        const profileFirst = String(data.first_name || "").trim();
        const profileLast = String(data.last_name || "").trim();
        if (profileUsername) setUsername(profileUsername);
        if (profileFirst) setFirstName(profileFirst);
        if (profileLast) setLastName(profileLast);
        if ((!profileFirst || !profileLast) && data.full_name) {
          const [first = "", ...rest] = String(data.full_name).split(" ");
          const last = rest.join(" ");
          if (!profileFirst) setFirstName(first);
          if (!profileLast) setLastName(last);
        }
        setPhone(data.phone || "");
        setAddressLine1(data.address_line1 || "");
        setAddressLine2(data.address_line2 || "");
        setSuburb(data.suburb || "");
        setStateRegion(data.state || "");
        setPostcode(data.postcode || "");
        setCountry(data.country || "Australia");
      }

      const done = await hasCompletedPostalProfile(user.id);
      if (done) {
        navigate("/", { replace: true });
        return;
      }

      setLoading(false);
    };

    load();
  }, [navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;

    if (!username || !firstName || !lastName || !phone || !addressLine1 || !suburb || !stateRegion || !postcode || !country) {
      setError("Please complete all required fields.");
      return;
    }

    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9._]{3,20}$/.test(normalizedUsername)) {
      setError("Username must be 3-20 chars and use letters, numbers, . or _");
      return;
    }

    const { data: usernameRows, error: usernameCheckError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", normalizedUsername)
      .neq("id", userId)
      .limit(1);

    if (!usernameCheckError && (usernameRows || []).length > 0) {
      setError("That username is already taken.");
      return;
    }

    setSaving(true);
    setError("");

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    let payload: any = {
      id: userId,
      username: normalizedUsername,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      full_name: fullName || null,
      phone: phone.trim(),
      address_line1: addressLine1.trim(),
      address_line2: addressLine2.trim() || null,
      suburb: suburb.trim(),
      state: stateRegion.trim(),
      postcode: postcode.trim(),
      country: country.trim(),
      updated_at: new Date().toISOString(),
    };

    let upsertError: any = null;
    for (let i = 0; i < 8; i += 1) {
      const result = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
      upsertError = result.error;
      if (!upsertError) break;

      const missingColumn =
        upsertError.code === "42703" ||
        upsertError.code === "PGRST204" ||
        String(upsertError.message || "").toLowerCase().includes("column");

      if (!missingColumn) break;

      const message = String(upsertError.message || "");
      const match = message.match(/['"]([a-zA-Z0-9_]+)['"]/);
      const col = match?.[1];
      if (!col || !(col in payload)) break;
      delete payload[col];
    }

    if (upsertError) {
      setError(upsertError.message || "Could not save your details.");
      setSaving(false);
      return;
    }

    // Keep auth metadata aligned for display if profile columns vary by environment.
    await supabase.auth.updateUser({
      data: {
        username: normalizedUsername,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName || null,
      },
    });

    setSaving(false);
    navigate("/", { replace: true });
  }

  if (loading) {
    return <div className="app-shell p-6">Loading account setup...</div>;
  }

  return (
    <div className="app-shell bg-warm-gradient px-4 py-8 pb-24">
      <form
        onSubmit={handleSubmit}
        className="max-w-xl mx-auto rounded-3xl border border-border/60 bg-card p-5 space-y-3 shadow-card"
      >
        <h1 className="text-xl font-display font-bold text-foreground">Finish your profile</h1>
        <p className="text-sm text-muted-foreground">
          Add your name, phone number, and postal address for deliveries and returns.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background col-span-2"
            required
          />
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
            required
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
            required
          />
        </div>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
          required
        />
        <input
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          placeholder="Address line 1"
          className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
          required
        />
        <input
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
          placeholder="Address line 2 (optional)"
          className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
            placeholder="Suburb / City"
            className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
            required
          />
          <input
            value={stateRegion}
            onChange={(e) => setStateRegion(e.target.value)}
            placeholder="State"
            className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            placeholder="Postcode"
            className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
            required
          />
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Country"
            className="w-full h-11 rounded-xl border border-border/60 px-3 bg-background"
            required
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
