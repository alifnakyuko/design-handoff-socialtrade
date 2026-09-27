import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({}),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

const getCurrentUserMock = vi.fn();
vi.mock('@/lib/current-user', () => ({
  getCurrentUser: (...args: any[]) => getCurrentUserMock(...args),
}));

const listOrdersMock = vi.fn();
vi.mock('@/lib/orders', () => ({
  listOrders: (...args: any[]) => listOrdersMock(...args),
}));

import { GET } from './route';

describe('GET /api/orders', () => {
  it('returns 401 when there is no authenticated session', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(listOrdersMock).not.toHaveBeenCalled();
  });

  it("returns the current user's orders when authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'u1', tier: 'gold' });
    const orders = [{ id: 'order-1', plan: 'gold', status: 'paid' }];
    listOrdersMock.mockResolvedValueOnce(orders);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ orders });
    expect(listOrdersMock).toHaveBeenCalledWith(expect.anything(), 'u1');
  });
});
