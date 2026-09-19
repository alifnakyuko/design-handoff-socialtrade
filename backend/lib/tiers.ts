export type Tier = 'free' | 'silver' | 'gold' | 'platinum' | 'lifetime';

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  lifetime: 4,
};

export function tierRank(tier: Tier): number {
  return TIER_RANK[tier];
}

export function hasAccess(userTier: Tier, requiredTier: Tier): boolean {
  return tierRank(userTier) >= tierRank(requiredTier);
}
