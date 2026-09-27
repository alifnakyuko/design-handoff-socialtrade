import type { Tier } from './tiers';
import { type Plan, basePriceFor, durationDaysFor } from './pricing';

export type MembershipState = {
  tier: Tier;
  expiresAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function requireDuration(plan: Plan): number {
  const duration = durationDaysFor(plan);
  if (duration == null) {
    throw new Error(`Unexpected null or undefined duration for non-lifetime plan: ${plan}`);
  }
  return duration;
}

function requirePrice(plan: Plan): number {
  const price = basePriceFor(plan);
  if (price == null) {
    throw new Error(`Unexpected null or undefined price for plan: ${plan}`);
  }
  return price;
}

// Converts `remainingDays` of value in `oldPlan` into an equivalent number of days in
// `newPlan`, at each plan's list price. Uses one integer-friendly expression rather than
// computing each plan's daily rate as a float and dividing, because that approach silently
// lost a day for some plan/remaining-day combinations even when the exact mathematical
// result is a whole number (e.g. platinum->gold with 78 days remaining should convert to
// exactly 63 days, but float division landed at 62.999999999998 and Math.floor dropped one).
function convertedDays(remainingDays: number, oldPlan: Plan, newPlan: Plan): number {
  const oldPrice = requirePrice(oldPlan);
  const oldDuration = requireDuration(oldPlan);
  const newPrice = requirePrice(newPlan);
  const newDuration = requireDuration(newPlan);
  return Math.floor((remainingDays * oldPrice * newDuration) / (oldDuration * newPrice));
}

export function calculateNewExpiry(now: Date, current: MembershipState, purchasedPlan: Plan): MembershipState {
  if (current.tier === 'lifetime') {
    // Lifetime has no expiresAt to prorate against and is never demoted by a further purchase.
    return { tier: 'lifetime', expiresAt: null };
  }

  if (purchasedPlan === 'lifetime') {
    return { tier: 'lifetime', expiresAt: null };
  }

  const purchasedDurationDays = requireDuration(purchasedPlan);

  // A 'free' tier is never treated as an active membership, even if `expiresAt` happens to
  // be a future date (e.g. a stray value left over from a manual tier revocation that only
  // reset `tier` and not `expires_at`) -- `tier` is the source of truth for "is a plan
  // active", not `expiresAt` alone. Without this check, a free-tier user with such a stray
  // future `expiresAt` would fall into the proration branch below and `requirePrice('free')`
  // would throw, since 'free' has no list price.
  const hasActiveMembership =
    current.tier !== 'free' && current.expiresAt !== null && current.expiresAt.getTime() > now.getTime();

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
  const converted = convertedDays(remainingDays, current.tier as Plan, purchasedPlan);

  return {
    tier: purchasedPlan,
    expiresAt: new Date(now.getTime() + (purchasedDurationDays + converted) * DAY_MS),
  };
}
