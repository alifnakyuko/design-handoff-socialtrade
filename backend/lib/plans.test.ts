import { describe, it, expect } from 'vitest';
import { listActivePlans } from './plans';

function fakeSupabase(rows: any[] | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: rows, error: rows ? null : { message: 'db error' } }),
        }),
      }),
    }),
  } as any;
}

describe('listActivePlans', () => {
  it('maps rows to camelCase, in the order the query returns them', async () => {
    const supabase = fakeSupabase([
      { code: 'silver', name: 'Silver', tier_level: 1, price: 1500000, strike_price: null, duration_days: 120 },
      { code: 'lifetime', name: 'Lifetime', tier_level: 4, price: 6500000, strike_price: null, duration_days: null },
    ]);

    const result = await listActivePlans(supabase);

    expect(result).toEqual([
      { code: 'silver', name: 'Silver', tierLevel: 1, price: 1500000, strikePrice: null, durationDays: 120 },
      { code: 'lifetime', name: 'Lifetime', tierLevel: 4, price: 6500000, strikePrice: null, durationDays: null },
    ]);
  });

  it('returns an empty array on a query error', async () => {
    const supabase = fakeSupabase(null);
    expect(await listActivePlans(supabase)).toEqual([]);
  });
});
