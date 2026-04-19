import { supabase } from "./supabaseClient";

export type MfaRequirement = {
  needsChallenge: boolean;
  factorId: string | null;
  verifiedTotpCount: number;
};

export async function getMfaRequirement(): Promise<MfaRequirement> {
  const [aalResult, factorsResult] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  if (aalResult.error || factorsResult.error) {
    return {
      needsChallenge: false,
      factorId: null,
      verifiedTotpCount: 0,
    };
  }

  const verifiedTotpFactors = factorsResult.data?.totp || [];
  const factorId = verifiedTotpFactors[0]?.id || null;

  const currentLevel = aalResult.data?.currentLevel;
  const nextLevel = aalResult.data?.nextLevel;

  return {
    needsChallenge:
      verifiedTotpFactors.length > 0 &&
      currentLevel !== "aal2" &&
      nextLevel === "aal2",
    factorId,
    verifiedTotpCount: verifiedTotpFactors.length,
  };
}

