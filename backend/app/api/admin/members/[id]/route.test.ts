import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

const getCurrentUserMock = vi.fn();
vi.mock('@/lib/current-user', () => ({ getCurrentUser: (...args: any[]) => getCurrentUserMock(...args) }));

const updateMemberTierMock = vi.fn();
vi.mock('@/lib/admin-members', () => ({ updateMemberTier: (...args: any[]) => updateMemberTierMock(...args) }));

import { PATCH } from './route';

function makeRequest(body: any): Request {
  return new Request('http://localhost/api/admin/members/u1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  updateMemberTierMock.mockReset();
});

describe('PATCH /api/admin/members/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const response = await PATCH(makeRequest({ tier: 'gold', expiresAt: null }), { params: { id: 'u1' } });
    expect(response.status).toBe(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'u2', isAdmin: false });
    const response = await PATCH(makeRequest({ tier: 'gold', expiresAt: null }), { params: { id: 'u1' } });
    expect(response.status).toBe(403);
  });

  it('returns 400 when tier is missing', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'admin1', isAdmin: true });
    const response = await PATCH(makeRequest({ expiresAt: null }), { params: { id: 'u1' } });
    expect(response.status).toBe(400);
  });

  it('returns 200 and calls updateMemberTier with the admin id for an admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'admin1', isAdmin: true });
    updateMemberTierMock.mockResolvedValueOnce({ status: 'ok' });

    const response = await PATCH(makeRequest({ tier: 'gold', expiresAt: '2027-01-01T00:00:00.000Z' }), { params: { id: 'u1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(updateMemberTierMock).toHaveBeenCalledWith(expect.anything(), {
      userId: 'u1',
      adminId: 'admin1',
      tier: 'gold',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('returns 404 when updateMemberTier reports not_found', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'admin1', isAdmin: true });
    updateMemberTierMock.mockResolvedValueOnce({ status: 'not_found' });

    const response = await PATCH(makeRequest({ tier: 'gold', expiresAt: null }), { params: { id: 'missing' } });
    expect(response.status).toBe(404);
  });
});
