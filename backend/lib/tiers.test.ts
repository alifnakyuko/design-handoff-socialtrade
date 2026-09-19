import { describe, it, expect } from 'vitest';
import { tierRank, hasAccess } from './tiers';

describe('tierRank', () => {
  it('ranks tiers from free (0) to lifetime (4)', () => {
    expect(tierRank('free')).toBe(0);
    expect(tierRank('silver')).toBe(1);
    expect(tierRank('gold')).toBe(2);
    expect(tierRank('platinum')).toBe(3);
    expect(tierRank('lifetime')).toBe(4);
  });
});

describe('hasAccess', () => {
  it('grants access when user tier rank is equal to required tier', () => {
    expect(hasAccess('gold', 'gold')).toBe(true);
  });

  it('grants access when user tier rank is higher than required tier', () => {
    expect(hasAccess('lifetime', 'silver')).toBe(true);
  });

  it('denies access when user tier rank is lower than required tier', () => {
    expect(hasAccess('free', 'silver')).toBe(false);
  });
});
