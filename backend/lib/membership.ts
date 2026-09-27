import type { Tier } from './tiers';
import { type Plan, basePriceFor, durationDaysFor } from './pricing';

export type MembershipState = {
  tier: Tier;
  expiresAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dailyRate(plan: Plan): number {
  const duration = durationDaysFor(plan);
  if (duration === null) {
    throw new Error(`dailyRate is undefined for plan without a duration: ${plan}`);
  }
  return basePriceFor(plan) / duration;
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
  if (purchasedDurationDays === null) {
    throw new Error(`Unexpected null duration for non-lifetime plan: ${purchasedPlan}`);
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
  const remainingValue = remainingDays * dailyRate(current.tier as Plan);
  const convertedDays = Math.floor(remainingValue / dailyRate(purchasedPlan));

  return {
    tier: purchasedPlan,
    expiresAt: new Date(now.getTime() + (purchasedDurationDays + convertedDays) * DAY_MS),
  };
}
