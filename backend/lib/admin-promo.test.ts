import { describe, it, expect } from 'vitest';
import { createPromoCode, setPromoCodeActive } from './admin-promo';

function fakeSupabase() {
  const inserted: any[] = [];
  const updated: { id: string; patch: any }[] = [];
  return {
    inserted,
    updated,
    from: () => ({
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            inserted.push(row);
            return { data: { id: 'promo-1' }, error: null };
          },
        }),
      }),
      update: (patch: any) => ({
        eq: async (_col: string, id: string) => {
          updated.push({ id, patch });
          return { error: null };
        },
      }),
    }),
  } as any;
}

describe('createPromoCode', () => {
  it('inserts an active promo code and returns its id', async () => {
    const supabase = fakeSupabase();
    const result = await createPromoCode(supabase, { code: 'HEMAT10', percent: 10, expiresAt: '2026-12-31' });
    expect(result).toEqual({ id: 'promo-1' });
    expect(supabase.inserted[0]).toEqual({
      code: 'HEMAT10',
      percent: 10,
      expires_at: '2026-12-31',
      active: true,
    });
  });
});

describe('setPromoCodeActive', () => {
  it('updates the active flag for the given promo code id', async () => {
    const supabase = fakeSupabase();
    await setPromoCodeActive(supabase, 'promo-1', false);
    expect(supabase.updated[0]).toEqual({ id: 'promo-1', patch: { active: false } });
  });
});
