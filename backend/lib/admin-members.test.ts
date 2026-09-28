import { describe, it, expect } from 'vitest';
import { listMembers } from './admin-members';

// Evaluates the orders query's .eq() against real row data instead of ignoring its
// column/value (a class of mock bug this project has been bitten by before), so a wrong
// filter (e.g. checking 'pending' instead of 'paid') would make this test fail.
function fakeSupabase(users: any[] | null, opts: { orders?: any[] | null; ordersError?: any } = {}) {
  return {
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            order: async () => ({ data: users, error: users ? null : { message: 'db error' } }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          select: () => ({
            eq: async (col: string, val: string) => {
              if (opts.ordersError) return { data: null, error: opts.ordersError };
              const matched = (opts.orders ?? []).filter((row) => row.status === val && col === 'status');
              return { data: matched, error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('listMembers', () => {
  it('returns members with total revenue summed only from their paid orders', async () => {
    const supabase = fakeSupabase(
      [
        { id: 'u1', email: 'a@x.com', name: 'A', tier: 'gold', expires_at: '2027-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'u2', email: 'b@x.com', name: 'B', tier: 'free', expires_at: null, created_at: '2026-02-01T00:00:00.000Z' },
      ],
      {
        orders: [
          { user_id: 'u1', final_amount: 1_500_000, status: 'paid' },
          { user_id: 'u1', final_amount: 2_600_000, status: 'paid' },
          { user_id: 'u1', final_amount: 4_200_000, status: 'pending' }, // must be excluded
        ],
      }
    );

    const result = await listMembers(supabase);

    expect(result).toEqual([
      {
        id: 'u1',
        email: 'a@x.com',
        name: 'A',
        tier: 'gold',
        expiresAt: '2027-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        totalRevenue: 4_100_000,
      },
      {
        id: 'u2',
        email: 'b@x.com',
        name: 'B',
        tier: 'free',
        expiresAt: null,
        createdAt: '2026-02-01T00:00:00.000Z',
        totalRevenue: 0,
      },
    ]);
  });

  it('returns an empty array when the users query fails', async () => {
    const supabase = fakeSupabase(null);
    expect(await listMembers(supabase)).toEqual([]);
  });

  it('throws (rather than silently reporting 0 revenue for everyone) when the orders query fails', async () => {
    const supabase = fakeSupabase(
      [{ id: 'u1', email: 'a@x.com', name: 'A', tier: 'gold', expires_at: null, created_at: '2026-01-01T00:00:00.000Z' }],
      { ordersError: { message: 'db error' } }
    );

    await expect(listMembers(supabase)).rejects.toThrow('Failed to load orders for revenue calculation');
  });
});
