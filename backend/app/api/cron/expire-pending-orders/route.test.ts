import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdminClient = { from: vi.fn() };
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}));

import { GET, POST } from './route';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return new Request('http://localhost/api/cron/expire-pending-orders', { method: 'GET', headers });
}

describe('GET /api/cron/expire-pending-orders', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    mockAdminClient.from.mockReset();
  });

  it('returns 401 when the authorization header is missing', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it('returns 500 when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(makeRequest('Bearer test-secret'));
    expect(response.status).toBe(500);
  });

  it('expires pending orders older than 24h and returns the count', async () => {
    const updateSpy = vi.fn();
    const eqSpy = vi.fn();
    const ltSpy = vi.fn();
    mockAdminClient.from.mockReturnValue({
      update: (patch: any) => {
        updateSpy(patch);
        return {
          eq: (col: string, val: string) => {
            eqSpy(col, val);
            return {
              lt: (col2: string, val2: string) => {
                ltSpy(col2, val2);
                return {
                  select: () => Promise.resolve({ data: [{ id: 'order-1' }], error: null }),
                };
              },
            };
          },
        };
      },
    });

    const response = await GET(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ expired_count: 1 });
    expect(updateSpy).toHaveBeenCalledWith({ status: 'expired' });
    expect(eqSpy).toHaveBeenCalledWith('status', 'pending');
    expect(ltSpy).toHaveBeenCalledWith('created_at', expect.any(String));

    // The cutoff must be roughly 24h in the past, not "now".
    const cutoff = new Date(ltSpy.mock.calls[0][1]).getTime();
    const expected = Date.now() - 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(5000);
  });

  it('returns 500 when the database update fails', async () => {
    mockAdminClient.from.mockReturnValue({
      update: () => ({
        eq: () => ({
          lt: () => ({
            select: () => Promise.resolve({ data: null, error: { message: 'db error' } }),
          }),
        }),
      }),
    });

    const response = await GET(makeRequest('Bearer test-secret'));
    expect(response.status).toBe(500);
  });

  it('POST also works (kept as an alias for manual/admin triggering)', async () => {
    mockAdminClient.from.mockReturnValue({
      update: () => ({
        eq: () => ({
          lt: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    });
    const response = await POST(makeRequest('Bearer test-secret'));
    expect(response.status).toBe(200);
  });
});
