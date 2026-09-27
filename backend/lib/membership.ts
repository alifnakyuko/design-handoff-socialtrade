import type { Tier } from './tiers';
import { type Plan, basePriceFor, durationDaysFor } from './pricing';

export type MembershipState = {
  tier: Tier;
  expiresAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dailyRate(plan: Plan): number {
  const duration = durationDaysFor(plan);
  const basePrice = basePriceFor(plan);
  if (duration == null || basePrice == null) {
    throw new Error(`dailyRate requires a known plan with valid duration and price: ${plan}`);
  }
  return basePrice / duration;
}

export function calculateNewExpiry(now: Date, current: MembershipState, purchasedPlan: Plan): MembershipState {
  if (current.tier === 'lifetime') {
    // Lifetime has no expiresAt to prorate against and is never demoted by a further purchase.
    return { tier: 'lifetime', expiresAt: null };
  }

  if (purchasedPlan === 'lifetime') {
    return { tier: 'lifetime', expiresAt: null };
  }

  const purchasedDurationDays = durationDaysFor(purchasedPlan);
  if (purchasedDurationDays == null) {
    throw new Error(`Unexpected null or undefined duration for non-lifetime plan: ${purchasedPlan}`);
  }

  const hasActiveMembership = current.expiresAt !== null && current.expiresAt.getTime() > now.getTime();

  if (!hasActiveMembership) {
    return {
      tier: purchasedPlan,
      expiresAt: new Date(now.getTime() + purchasedDurationDays * DAY_MS),
    };
  }

  if (current.tier === purchasedPlan) {
    const base = Math.max(now.getTime(), current.expiresAt!.getTime());
    return {
      tier: purchasedPlan,
      expiresAt: new Date(base + purchasedDurationDays * DAY_MS),
    };
  }

  const remainingMs = current.expiresAt!.getTime() - now.getTime();
  const remainingDays = Math.ceil(remainingMs / DAY_MS);
  // `current.tier` and `current.expiresAt` are independent fields, not type-enforced together —
  // a 'free' tier reaching this branch with a non-null future expiresAt would be a
  // data-consistency bug. The cast to Plan is safe today only because dailyRate throws on
  // 'free' (which has no price/duration) rather than silently producing NaN.
  const remainingValue = remainingDays * dailyRate(current.tier as Plan);
  const newPlanDailyRate = dailyRate(purchasedPlan);
  const convertedDays = Math.floor(remainingValue / newPlanDailyRate);

  return {
    tier: purchasedPlan,
    expiresAt: new Date(now.getTime() + (purchasedDurationDays + convertedDays) * DAY_MS),
  };
}
