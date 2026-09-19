import { describe, it, expect, vi } from 'vitest';
import { createCheckout } from './checkout';
import type { SnapClient } from './midtrans-snap';

function fakeSupabase(opts: { promoRow?: any; insertedOrder?: { id: string } }) {
  const insertedRows: any[] = [];
  return {
    insertedRows,
    from: (table: string) => {
      if (table === 'promo_codes') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts.promoRow ?? null, error: opts.promoRow ? null : { message: 'not found' } }),
            }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          insert: (row: any) => ({
            select: () => ({
              single: async () => {
                insertedRows.push(row);
                return { data: opts.insertedOrder ?? { id: 'order-1' }, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

function fakeSnap(): SnapClient {
  return {
    createTransaction: async () => ({ token: 'snap-token', redirectUrl: 'https://midtrans.example/pay' }),
  };
}

describe('createCheckout', () => {
  it('creates a pending order at the plan base price when no promo code is given', async () => {
    const supabase = fakeSupabase({});
    const result = await createCheckout(supabase, fakeSnap(), {
      userId: 'u1',
      userEmail: 'u1@x.com',
      plan: 'gold',
    });

    expect(result).toEqual({
      status: 'ok',
      orderId: 'order-1',
      token: 'snap-token',
      redirectUrl: 'https://midtrans.example/pay',
    });
    expect(supabase.insertedRows[0]).toMatchObject({
      user_id: 'u1',
      plan: 'gold',
      base_amount: 2_600_000,
      final_amount: 2_600_000,
      promo_code: null,
      status: 'pending',
    });
  });

  it('applies a valid active promo code discount to final_amount', async () => {
    const supabase = fakeSupabase({
      promoRow: { code: 'HEMAT10', percent: 10, active: true, expires_at: '2099-01-01' },
    });
    const result = await createCheckout(supabase, fakeSnap(), {
      userId: 'u1',
      userEmail: 'u1@x.com',
      plan: 'silver',
      promoCode: 'HEMAT10',
    });

    expect(result.status).toBe('ok');
    expect(supabase.insertedRows[0]).toMatchObject({
      base_amount: 1_500_000,
      final_amount: 1_350_000,
      promo_code: 'HEMAT10',
    });
  });

  it('returns invalid_promo and creates no order when the promo code is expired', async () => {
    const supabase = fakeSupabase({
      promoRow: { code: 'OLD', percent: 10, active: true, expires_at: '2020-01-01' },
    });
    const result = await createCheckout(supabase, fakeSnap(), {
      userId: 'u1',
      userEmail: 'u1@x.com',
      plan: 'silver',
      promoCode: 'OLD',
    });

    expect(result).toEqual({ status: 'invalid_promo' });
    expect(supabase.insertedRows).toHaveLength(0);
  });

  it('returns invalid_promo when the promo code does not exist', async () => {
    const supabase = fakeSupabase({});
    const result = await createCheckout(supabase, fakeSnap(), {
      userId: 'u1',
      userEmail: 'u1@x.com',
      plan: 'silver',
      promoCode: 'DOESNOTEXIST',
    });

    expect(result).toEqual({ status: 'invalid_promo' });
  });
});
