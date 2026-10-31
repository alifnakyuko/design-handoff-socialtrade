import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

const getCurrentUserMock = vi.fn();
vi.mock('@/lib/current-user', () => ({ getCurrentUser: (...args: any[]) => getCurrentUserMock(...args) }));

const updateContentMock = vi.fn();
const deleteContentMock = vi.fn();
vi.mock('@/lib/admin-content', () => ({
  updateContent: (...args: any[]) => updateContentMock(...args),
  deleteContent: (...args: any[]) => deleteContentMock(...args),
}));

import { PATCH, DELETE } from './route';

function makeRequest(body?: any): Request {
  return new Request('http://localhost/api/admin/content/c1', {
    method: body ? 'PATCH' : 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  updateContentMock.mockReset();
  deleteContentMock.mockReset();
});

describe('PATCH /api/admin/content/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const response = await PATCH(makeRequest({ title: 'X' }), { params: { id: 'c1' } });
    expect(response.status).toBe(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: false });
    const response = await PATCH(makeRequest({ title: 'X' }), { params: { id: 'c1' } });
    expect(response.status).toBe(403);
  });

  it('returns 200 and calls updateContent for an admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    updateContentMock.mockResolvedValueOnce({ status: 'ok' });

    const response = await PATCH(makeRequest({ title: 'New title' }), { params: { id: 'c1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(updateContentMock).toHaveBeenCalledWith(expect.anything(), 'c1', { title: 'New title' });
  });

  it('returns 400 when updateContent reports invalid_payload', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    updateContentMock.mockResolvedValueOnce({ status: 'invalid_payload' });

    const response = await PATCH(makeRequest({ payload: {} }), { params: { id: 'c1' } });
    expect(response.status).toBe(400);
  });

  it('returns 404 when updateContent reports not_found', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    updateContentMock.mockResolvedValueOnce({ status: 'not_found' });

    const response = await PATCH(makeRequest({ title: 'X' }), { params: { id: 'missing' } });
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/admin/content/[id]', () => {
  it('returns 403 when authenticated but not admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: false });
    const response = await DELETE(makeRequest(), { params: { id: 'c1' } });
    expect(response.status).toBe(403);
  });

  it('returns 200 and calls deleteContent for an admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    deleteContentMock.mockResolvedValueOnce(undefined);

    const response = await DELETE(makeRequest(), { params: { id: 'c1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(deleteContentMock).toHaveBeenCalledWith(expect.anything(), 'c1');
  });
});
