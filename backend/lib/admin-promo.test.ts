import { describe, it, expect } from 'vitest';
import { createPromoCode, setPromoCodeActive, listPromoCodes, updatePromoCode, deletePromoCode } from './admin-promo';

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
      max_uses: null,
      applies_to_plan_ids: null,
    });
  });

  it('inserts maxUses and appliesToPlanIds when provided', async () => {
    const supabase = fakeSupabase();
    await createPromoCode(supabase, {
      code: 'GOLDONLY',
      percent: 15,
      expiresAt: '2026-12-31',
      maxUses: 100,
      appliesToPlanIds: ['gold', 'platinum'],
    });
    expect(supabase.inserted[0]).toMatchObject({ max_uses: 100, applies_to_plan_ids: ['gold', 'platinum'] });
  });
});

describe('setPromoCodeActive', () => {
  it('updates the active flag for the given promo code id', async () => {
    const supabase = fakeSupabase();
    await setPromoCodeActive(supabase, 'promo-1', false);
    expect(supabase.updated[0]).toEqual({ id: 'promo-1', patch: { active: false } });
  });
});

describe('listPromoCodes', () => {
  it('returns rows ordered as given by the query', async () => {
    const rows = [
      { id: 'p2', code: 'HEMAT20', percent: 20, active: true, expires_at: '2026-12-31' },
      { id: 'p1', code: 'HEMAT10', percent: 10, active: false, expires_at: '2026-11-30' },
    ];
    const supabase = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
    } as any;

    expect(await listPromoCodes(supabase)).toEqual(rows);
  });

  it('returns an empty array on a query error', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: null, error: { message: 'boom' } }),
        }),
      }),
    } as any;

    expect(await listPromoCodes(supabase)).toEqual([]);
  });
});

describe('updatePromoCode', () => {
  it('patches only the provided fields', async () => {
    const updated: { id: string; patch: any }[] = [];
    const supabase = {
      from: () => ({
        update: (patch: any) => ({
          eq: async (_col: string, id: string) => {
            updated.push({ id, patch });
            return { error: null };
          },
        }),
      }),
    } as any;

    await updatePromoCode(supabase, 'promo-1', { percent: 25 });
    expect(updated[0]).toEqual({ id: 'promo-1', patch: { percent: 25 } });
  });

  it('patches maxUses and appliesToPlanIds when provided', async () => {
    const updated: { id: string; patch: any }[] = [];
    const supabase = {
      from: () => ({
        update: (patch: any) => ({
          eq: async (_col: string, id: string) => {
            updated.push({ id, patch });
            return { error: null };
          },
        }),
      }),
    } as any;

    await updatePromoCode(supabase, 'promo-1', { maxUses: 50, appliesToPlanIds: ['silver'] });
    expect(updated[0]).toEqual({ id: 'promo-1', patch: { max_uses: 50, applies_to_plan_ids: ['silver'] } });
  });

  it('can clear maxUses/appliesToPlanIds by explicitly passing null', async () => {
    const updated: { id: string; patch: any }[] = [];
    const supabase = {
      from: () => ({
        update: (patch: any) => ({
          eq: async (_col: string, id: string) => {
            updated.push({ id, patch });
            return { error: null };
          },
        }),
      }),
    } as any;

    await updatePromoCode(supabase, 'promo-1', { maxUses: null, appliesToPlanIds: null });
    expect(updated[0]).toEqual({ id: 'promo-1', patch: { max_uses: null, applies_to_plan_ids: null } });
  });

  it('throws when the update fails', async () => {
    const supabase = {
      from: () => ({
        update: () => ({
          eq: async () => ({ error: { message: 'boom' } }),
        }),
      }),
    } as any;

    await expect(updatePromoCode(supabase, 'promo-1', { active: true })).rejects.toThrow(
      'Failed to update promo code'
    );
  });
});

describe('deletePromoCode', () => {
  it('calls delete().eq() with the given id', async () => {
    const deleted: string[] = [];
    const supabase = {
      from: () => ({
        delete: () => ({
          eq: async (_col: string, id: string) => {
            deleted.push(id);
            return { error: null };
          },
        }),
      }),
    } as any;

    const result = await deletePromoCode(supabase, 'promo-1');
    expect(deleted).toEqual(['promo-1']);
    expect(result).toEqual({ status: 'ok' });
  });

  it('throws when the delete fails', async () => {
    const supabase = {
      from: () => ({
        delete: () => ({
          eq: async () => ({ error: { message: 'boom' } }),
        }),
      }),
    } as any;

    await expect(deletePromoCode(supabase, 'promo-1')).rejects.toThrow('Failed to delete promo code');
  });

  it('returns in_use when the delete fails due to a foreign key violation', async () => {
    const supabase = {
      from: () => ({
        delete: () => ({
          eq: async () => ({ error: { code: '23503', message: 'foreign key violation' } }),
        }),
      }),
    } as any;

    const result = await deletePromoCode(supabase, 'promo-1');
    expect(result).toEqual({ status: 'in_use' });
  });
});
