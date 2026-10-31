import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

const getCurrentUserMock = vi.fn();
vi.mock('@/lib/current-user', () => ({ getCurrentUser: (...args: any[]) => getCurrentUserMock(...args) }));

const getMemberAuditHistoryMock = vi.fn();
vi.mock('@/lib/admin-members', () => ({ getMemberAuditHistory: (...args: any[]) => getMemberAuditHistoryMock(...args) }));

import { GET } from './route';

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getMemberAuditHistoryMock.mockReset();
});

describe('GET /api/admin/members/[id]/audit', () => {
  it('returns 403 when authenticated but not admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: false });
    const response = await GET(new Request('http://localhost'), { params: { id: 'u1' } });
    expect(response.status).toBe(403);
  });

  it('returns the edit history for an admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    getMemberAuditHistoryMock.mockResolvedValueOnce([{ id: 'e1', old_tier: 'free', new_tier: 'gold' }]);

    const response = await GET(new Request('http://localhost'), { params: { id: 'u1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ edits: [{ id: 'e1', old_tier: 'free', new_tier: 'gold' }] });
  });
});
