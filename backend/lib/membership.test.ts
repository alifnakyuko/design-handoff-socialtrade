import { describe, it, expect } from 'vitest';
import type { Plan } from './pricing';
import type { Tier } from './tiers';
import { calculateNewExpiry } from './membership';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('calculateNewExpiry', () => {
  it('buying lifetime always wins and clears expiresAt, regardless of current state', () => {
    const result = calculateNewExpiry(NOW, { tier: 'gold', expiresAt: new Date(NOW.getTime() + 30 * DAY_MS) }, 'lifetime');
    expect(result).toEqual({ tier: 'lifetime', expiresAt: null });
  });

  it('buying lifetime from free also wins', () => {
    const result = calculateNewExpiry(NOW, { tier: 'free', expiresAt: null }, 'lifetime');
    expect(result).toEqual({ tier: 'lifetime', expiresAt: null });
  });

  it('already being lifetime stays lifetime no matter what plan is purchased next', () => {
    const result = calculateNewExpiry(NOW, { tier: 'lifetime', expiresAt: null }, 'silver');
    expect(result).toEqual({ tier: 'lifetime', expiresAt: null });
  });

  it('first purchase from free starts counting from now', () => {
    const result = calculateNewExpiry(NOW, { tier: 'free', expiresAt: null }, 'silver');
    expect(result.tier).toBe('silver');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + 120 * DAY_MS));
  });

  it('purchase after a past expiry starts counting from now, not from the old expiry', () => {
    const pastExpiry = new Date(NOW.getTime() - 10 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'silver', expiresAt: pastExpiry }, 'gold');
    expect(result.tier).toBe('gold');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + 270 * DAY_MS));
  });

  it('renewing the same plan before expiry stacks remaining days', () => {
    const futureExpiry = new Date(NOW.getTime() + 30 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'silver', expiresAt: futureExpiry }, 'silver');
    expect(result.tier).toBe('silver');
    // max(now, futureExpiry) + 120 days = futureExpiry + 120 days
    expect(result.expiresAt).toEqual(new Date(futureExpiry.getTime() + 120 * DAY_MS));
  });

  it('upgrading mid-cycle prorates remaining value of the old plan into days of the new plan', () => {
    // silver: 1,500,000 / 120 days = 12,500/day. 60 days remaining => remaining_value = 750,000.
    // gold: 2,600,000 / 270 days = 9,629.6296.../day. converted_days = floor(750000 / 9629.6296...) = 77
    const futureExpiry = new Date(NOW.getTime() + 60 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'silver', expiresAt: futureExpiry }, 'gold');
    expect(result.tier).toBe('gold');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + (270 + 77) * DAY_MS));
  });

  it('downgrading mid-cycle prorates remaining value of the old plan into days of the new (cheaper) plan', () => {
    // gold: 2,600,000 / 270 days = 9,629.6296.../day. 90 days remaining => remaining_value = 866,666.67 (before rounding in remaining_days ceil)
    // silver: 1,500,000 / 120 days = 12,500/day. converted_days = floor(866666.67 / 12500) = 69
    const futureExpiry = new Date(NOW.getTime() + 90 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'gold', expiresAt: futureExpiry }, 'silver');
    expect(result.tier).toBe('silver');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + (120 + 69) * DAY_MS));
  });

  it('remaining_days uses ceil on partial days', () => {
    // 1.5 days remaining -> ceil = 2 days. silver daily rate 12,500 => remaining_value = 25,000.
    // buying platinum: 4,200,000 / 540 days = 7,777.77.../day. converted_days = floor(25000 / 7777.77...) = 3
    const futureExpiry = new Date(NOW.getTime() + 1.5 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'silver', expiresAt: futureExpiry }, 'platinum');
    expect(result.tier).toBe('platinum');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + (540 + 3) * DAY_MS));
  });

  it('throws clear error if purchasedPlan is an unknown string (not a valid Plan)', () => {
    expect(() => {
      calculateNewExpiry(NOW, { tier: 'free', expiresAt: null }, 'invalid_plan' as Plan);
    }).toThrow('Unexpected null or undefined duration for non-lifetime plan: invalid_plan');
  });

  it('throws clear error if current.tier is an unknown string during proration', () => {
    const futureExpiry = new Date(NOW.getTime() + 60 * DAY_MS);
    expect(() => {
      calculateNewExpiry(NOW, { tier: 'invalid_tier' as Tier, expiresAt: futureExpiry }, 'gold');
    }).toThrow('dailyRate requires a known plan with valid duration and price: invalid_tier');
  });

  it('throws clear error if purchasedPlan is an unknown string during proration', () => {
    const futureExpiry = new Date(NOW.getTime() + 60 * DAY_MS);
    expect(() => {
      calculateNewExpiry(NOW, { tier: 'silver', expiresAt: futureExpiry }, 'unknown_plan' as Plan);
    }).toThrow('Unexpected null or undefined duration for non-lifetime plan: unknown_plan');
  });
});
