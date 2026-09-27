import { describe, it, expect } from 'vitest';
import { listMembers } from './admin-members';

function fakeSupabase(users: any[] | null, orders: any[] | null) {
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
            eq: async () => ({ data: orders, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('listMembers', () => {
  it('returns members with total revenue summed from their paid orders', async () => {
    const supabase = fakeSupabase(
      [
        { id: 'u1', email: 'a@x.com', name: 'A', tier: 'gold', expires_at: '2027-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'u2', email: 'b@x.com', name: 'B', tier: 'free', expires_at: null, created_at: '2026-02-01T00:00:00.000Z' },
      ],
      [
        { user_id: 'u1', final_amount: 1_500_000 },
        { user_id: 'u1', final_amount: 2_600_000 },
      ]
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
    const supabase = fakeSupabase(null, []);
    expect(await listMembers(supabase)).toEqual([]);
  });
});
