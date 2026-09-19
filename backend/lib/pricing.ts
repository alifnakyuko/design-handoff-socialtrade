export type Plan = 'silver' | 'gold' | 'platinum' | 'lifetime';

export const PLAN_PRICES: Record<Plan, number> = {
  silver: 1_500_000,
  gold: 2_600_000,
  platinum: 4_200_000,
  lifetime: 6_500_000,
};

export function basePriceFor(plan: Plan): number {
  return PLAN_PRICES[plan];
}

export function applyDiscount(baseAmount: number, percent: number): number {
  return Math.round(baseAmount * (1 - percent / 100));
}
