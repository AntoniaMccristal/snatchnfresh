import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

function hashRecoveryCode(code: string, pepper: string) {
  return createHash("sha256").update(`${code}:${pepper}`).digest("hex");
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

    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: "Missing recovery code." });
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

    const { data: rows, error: codeError } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .select("id,code_hash,used_at")
      .eq("user_id", user.id)
      .is("used_at", null);

    if (codeError) {
      return res.status(500).json({ error: codeError.message });
    }

    const hashed = hashRecoveryCode(code, pepper);
    const match = (rows || []).find((row: any) => row.code_hash === hashed);

    if (!match) {
      return res.status(400).json({ error: "Invalid recovery code." });
    }

    const { error: markError } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", match.id);

    if (markError) {
      return res.status(500).json({ error: markError.message });
    }

    const factorsResult = await (supabaseAdmin.auth.admin as any).mfa.listFactors({
      userId: user.id,
    });

    if (factorsResult?.error) {
      return res.status(500).json({ error: factorsResult.error.message || "Could not load MFA factors." });
    }

    const factors = factorsResult?.data?.factors || [];
    for (const factor of factors) {
      if (factor?.factor_type !== "totp") continue;
      const deleteResult = await (supabaseAdmin.auth.admin as any).mfa.deleteFactor({
        userId: user.id,
        id: factor.id,
      });
      if (deleteResult?.error) {
        return res.status(500).json({ error: deleteResult.error.message || "Failed to disable MFA factor." });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Recovery code accepted. MFA has been disabled for this account.",
    });
  } catch (error: any) {
    console.error("mfa-recovery-redeem error", error);
    return res.status(500).json({ error: error?.message || "Failed to redeem recovery code." });
  }
}

