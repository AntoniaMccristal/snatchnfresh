import { supabase } from "@/lib/supabaseClient";

function getMissingColumnFromError(error: any): string | null {
  const message = String(error?.message || "");
  const schemaCacheMatch = message.match(/find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const quotedColumnMatch = message.match(/column ['"]([a-zA-Z0-9_]+)['"]/i);
  if (quotedColumnMatch?.[1]) return quotedColumnMatch[1];

  const directMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+/i);
  if (directMatch?.[1]) return directMatch[1];

  return null;
}

function isMissingColumnError(error: any) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}

function splitFullName(fullName?: string) {
  const normalized = String(fullName || "").trim();
  if (!normalized) return { firstName: "", lastName: "" };
  const [firstName = "", ...rest] = normalized.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" "),
  };
}

function sanitizeUsername(value?: string) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._]/g, "");

  if (!raw) return "";
  return raw.slice(0, 20);
}

function buildFallbackUsername(user: any) {
  const metadata = (user?.user_metadata || {}) as Record<string, any>;
  const emailPrefix = String(user?.email || "").split("@")[0] || "";
  const preferred =
    sanitizeUsername(metadata.username) ||
    sanitizeUsername(metadata.full_name) ||
    sanitizeUsername(`${metadata.first_name || ""}${metadata.last_name || ""}`) ||
    sanitizeUsername(emailPrefix);

  const base = preferred || `member${String(user?.id || "").replace(/-/g, "").slice(0, 6)}`;
  return base.length >= 3 ? base : `${base}${String(user?.id || "").replace(/-/g, "").slice(0, 3)}`;
}

async function reserveUniqueUsername(preferred: string, userId: string) {
  const base = sanitizeUsername(preferred) || buildFallbackUsername({ id: userId });

  for (let i = 0; i < 10; i += 1) {
    const suffix = i === 0 ? "" : `${i + 1}`;
    const candidate = `${base}${suffix}`.slice(0, 20);

    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .neq("id", userId)
      .limit(1);

    if (error) {
      const missingTable =
        error.code === "42P01" ||
        String(error.message || "").toLowerCase().includes("relation") ||
        String(error.message || "").toLowerCase().includes("could not find the table");

      if (missingTable) return candidate;
      return candidate;
    }

    if (!data || data.length === 0) {
      return candidate;
    }
  }

  return `${base.slice(0, 14)}${String(userId).replace(/-/g, "").slice(0, 6)}`.slice(0, 20);
}

export async function ensureProfileIdentity(user: any) {
  if (!user?.id) return null;

  const metadata = (user.user_metadata || {}) as Record<string, any>;
  const metadataFullName = String(metadata.full_name || "").trim();
  const metadataSplit = splitFullName(metadataFullName);
  const firstName = String(metadata.first_name || metadataSplit.firstName || "").trim();
  const lastName = String(metadata.last_name || metadataSplit.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim() || metadataFullName || null;
  const avatarUrl = String(metadata.avatar_url || metadata.picture || "").trim() || null;
  const desiredUsername = await reserveUniqueUsername(
    sanitizeUsername(metadata.username) || buildFallbackUsername(user),
    user.id,
  );

  let payload: Record<string, any> = {
    id: user.id,
    username: desiredUsername,
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: fullName,
    avatar_url: avatarUrl,
    updated_at: new Date().toISOString(),
  };

  let upsertError: any = null;
  for (let i = 0; i < 12; i += 1) {
    const result = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    upsertError = result.error;
    if (!upsertError) {
      break;
    }

    if (!isMissingColumnError(upsertError)) {
      throw upsertError;
    }

    const missingColumn = getMissingColumnFromError(upsertError);
    if (!missingColumn || !(missingColumn in payload)) {
      break;
    }
    delete payload[missingColumn];
  }

  if (upsertError && !isMissingColumnError(upsertError)) {
    throw upsertError;
  }

  return {
    username: desiredUsername,
    firstName,
    lastName,
    fullName,
    avatarUrl,
  };
}
