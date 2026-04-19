import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

function decodeJwtPayload(token: string): any | null {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const normalized = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hashRecoveryCode(code: string, pepper: string) {
  return createHash("sha256").update(`${code}:${pepper}`).digest("hex");
}

function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < 10; i += 1) {
    const idx = randomBytes(1)[0] % alphabet.length;
    value += alphabet[idx];
  }
  return `${value.slice(0, 5)}-${value.slice(5)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pepper = process.env.MFA_RECOVERY_PEPPER || "";

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return res.status(500).json({ error: "Missing Supabase config." });
  }

  try {
    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!accessToken) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    const payload = decodeJwtPayload(accessToken);
    if (String(payload?.aal || "aal1") !== "aal2") {
      return res.status(403).json({ error: "MFA verification is required to generate recovery codes." });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(accessToken);

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid session." });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const codes = Array.from({ length: 8 }, () => generateCode());
    const rows = codes.map((code) => ({
      user_id: user.id,
      code_hash: hashRecoveryCode(code, pepper),
    }));

    const { error: deleteError } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    const { error: insertError } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .insert(rows);

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    return res.status(200).json({ codes });
  } catch (error: any) {
    console.error("mfa-recovery-codes error", error);
    return res.status(500).json({ error: error?.message || "Failed to generate recovery codes." });
  }
}

