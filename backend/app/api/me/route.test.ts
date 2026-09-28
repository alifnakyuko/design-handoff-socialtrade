import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({}),
}));

const getCurrentUserMock = vi.fn();
vi.mock('@/lib/current-user', () => ({
  getCurrentUser: (...args: any[]) => getCurrentUserMock(...args),
}));

import { GET } from './route';

describe('GET /api/me', () => {
  it('returns 401 when there is no authenticated session', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns the current user profile when authenticated', async () => {
    const user = {
      id: 'u1',
      email: 'ana@x.com',
      name: 'Ana',
      tier: 'gold',
      expiresAt: '2027-01-01T00:00:00.000Z',
      isAdmin: false,
    };
    getCurrentUserMock.mockResolvedValueOnce(user);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(user);
  });
});
