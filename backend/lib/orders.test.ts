import { describe, it, expect } from 'vitest';
import { getOrderStatus } from './orders';

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
