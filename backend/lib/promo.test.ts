import { describe, it, expect } from 'vitest';
import { validatePromo } from './promo';

function fakeSupabase(promoRow: any) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: promoRow ?? null, error: promoRow ? null : { message: 'not found' } }),
        }),
      }),
    }),
  } as any;
}

describe('validatePromo', () => {
  it('returns the discount and final price for a valid active promo code', async () => {
    const supabase = fakeSupabase({ code: 'HEMAT10', percent: 10, active: true, expires_at: '2099-01-01' });
    const result = await validatePromo(supabase, 'HEMAT10', 'silver');
    expect(result).toEqual({ valid: true, code: 'HEMAT10', discountPct: 10, finalPrice: 1_350_000 });
  });

  it('returns invalid for an expired promo code', async () => {
    const supabase = fakeSupabase({ code: 'OLD', percent: 10, active: true, expires_at: '2020-01-01' });
    expect(await validatePromo(supabase, 'OLD', 'silver')).toEqual({ valid: false });
  });

  it('returns invalid for an inactive promo code', async () => {
    const supabase = fakeSupabase({ code: 'OFF', percent: 10, active: false, expires_at: '2099-01-01' });
    expect(await validatePromo(supabase, 'OFF', 'silver')).toEqual({ valid: false });
  });

  it('returns invalid for a promo code that does not exist', async () => {
    const supabase = fakeSupabase(null);
    expect(await validatePromo(supabase, 'DOESNOTEXIST', 'silver')).toEqual({ valid: false });
  });

  it('returns valid when used_count is still below max_uses', async () => {
    const supabase = fakeSupabase({
      code: 'LIMITED', percent: 10, active: true, expires_at: '2099-01-01', max_uses: 5, used_count: 4,
    });
    expect(await validatePromo(supabase, 'LIMITED', 'silver')).toEqual({
      valid: true, code: 'LIMITED', discountPct: 10, finalPrice: 1_350_000,
    });
  });

  it('returns invalid once used_count reaches max_uses', async () => {
    const supabase = fakeSupabase({
      code: 'LIMITED', percent: 10, active: true, expires_at: '2099-01-01', max_uses: 5, used_count: 5,
    });
    expect(await validatePromo(supabase, 'LIMITED', 'silver')).toEqual({ valid: false });
  });

  it('returns valid for a plan included in applies_to_plan_ids', async () => {
    const supabase = fakeSupabase({
      code: 'GOLDONLY', percent: 10, active: true, expires_at: '2099-01-01', applies_to_plan_ids: ['gold', 'platinum'],
    });
    expect(await validatePromo(supabase, 'GOLDONLY', 'gold')).toEqual({
      valid: true, code: 'GOLDONLY', discountPct: 10, finalPrice: 2_340_000,
    });
  });

  it('returns invalid for a plan not included in applies_to_plan_ids', async () => {
    const supabase = fakeSupabase({
      code: 'GOLDONLY', percent: 10, active: true, expires_at: '2099-01-01', applies_to_plan_ids: ['gold', 'platinum'],
    });
    expect(await validatePromo(supabase, 'GOLDONLY', 'silver')).toEqual({ valid: false });
  });
});
