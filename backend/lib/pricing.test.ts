import { describe, it, expect } from 'vitest';
import { basePriceFor, applyDiscount } from './pricing';

describe('basePriceFor', () => {
  it('returns the fixed IDR price for each plan', () => {
    expect(basePriceFor('silver')).toBe(1_500_000);
    expect(basePriceFor('gold')).toBe(2_600_000);
    expect(basePriceFor('platinum')).toBe(4_200_000);
    expect(basePriceFor('lifetime')).toBe(6_500_000);
  });
});

describe('applyDiscount', () => {
  it('reduces the amount by the given percent, rounded', () => {
    expect(applyDiscount(1_500_000, 10)).toBe(1_350_000);
  });

  it('returns the original amount for 0 percent', () => {
    expect(applyDiscount(2_600_000, 0)).toBe(2_600_000);
  });
});
