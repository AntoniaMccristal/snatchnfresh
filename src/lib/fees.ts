export const PROTECTION_FEE_PERCENT = 0.07;
export const PROTECTION_FEE_FLAT = 1.00;

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateFees(basePriceAUD: number) {
  const base = roundCurrency(basePriceAUD);
  const percentFee = roundCurrency(base * PROTECTION_FEE_PERCENT);
  const flatFee = PROTECTION_FEE_FLAT;
  const protectionFee = roundCurrency(percentFee + flatFee);
  const totalCharged = roundCurrency(base + protectionFee);
  const lenderPayout = base;
  const platformFee = protectionFee;

  return { base, protectionFee, totalCharged, lenderPayout, platformFee };
}
