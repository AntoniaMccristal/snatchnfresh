export const PROTECTION_FEE_PERCENT = 0.07;
export const PROTECTION_FEE_FLAT = 1.00;

export function calculateFees(basePriceAUD: number) {
  const base = Math.round(basePriceAUD * 100) / 100;
  const protectionFee = Math.round((base * PROTECTION_FEE_PERCENT + PROTECTION_FEE_FLAT) * 100) / 100;
  const totalCharged = Math.round((base + protectionFee) * 100) / 100;
  return { base, protectionFee, totalCharged, lenderPayout: base, platformFee: protectionFee };
}
