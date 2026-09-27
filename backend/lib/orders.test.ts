import { describe, it, expect } from 'vitest';
import { getOrderStatus, listOrders } from './orders';

function fakeSupabase(row: { status: string; plan: string; user_id: string } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: row, error: row ? null : { message: 'not found' } }),
        }),
      }),
    }),
  } as any;
}

describe('getOrderStatus', () => {
  it('returns the status and plan when the order belongs to the requesting user', async () => {
    const supabase = fakeSupabase({ status: 'paid', plan: 'gold', user_id: 'u1' });
    expect(await getOrderStatus(supabase, 'order-1', 'u1')).toEqual({ status: 'paid', plan: 'gold' });
  });

  it('returns null when the order does not exist', async () => {
    const supabase = fakeSupabase(null);
    expect(await getOrderStatus(supabase, 'missing', 'u1')).toBeNull();
  });

  it('returns null when the order belongs to a different user', async () => {
    const supabase = fakeSupabase({ status: 'paid', plan: 'gold', user_id: 'someone-else' });
    expect(await getOrderStatus(supabase, 'order-1', 'u1')).toBeNull();
  });
});

describe('listOrders', () => {
  function fakeListSupabase(rows: any[] | null) {
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

  it('returns the user orders mapped to camelCase, newest first as given by the query', async () => {
    const supabase = fakeListSupabase([
      {
        id: 'order-2',
        plan: 'gold',
        base_amount: 2600000,
        promo_code: 'HEMAT10',
        final_amount: 2340000,
        status: 'paid',
        created_at: '2026-02-01T00:00:00.000Z',
        paid_at: '2026-02-01T00:05:00.000Z',
      },
      {
        id: 'order-1',
        plan: 'silver',
        base_amount: 1500000,
        promo_code: null,
        final_amount: 1500000,
        status: 'failed',
        created_at: '2026-01-01T00:00:00.000Z',
        paid_at: null,
      },
    ]);

    const result = await listOrders(supabase, 'u1');

    expect(result).toEqual([
      {
        id: 'order-2',
        plan: 'gold',
        baseAmount: 2600000,
        promoCode: 'HEMAT10',
        finalAmount: 2340000,
        status: 'paid',
        createdAt: '2026-02-01T00:00:00.000Z',
        paidAt: '2026-02-01T00:05:00.000Z',
      },
      {
        id: 'order-1',
        plan: 'silver',
        baseAmount: 1500000,
        promoCode: null,
        finalAmount: 1500000,
        status: 'failed',
        createdAt: '2026-01-01T00:00:00.000Z',
        paidAt: null,
      },
    ]);
  });

  it('returns an empty array on a query error', async () => {
    const supabase = fakeListSupabase(null);
    expect(await listOrders(supabase, 'u1')).toEqual([]);
  });
});
