import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdminClient = { from: vi.fn() };
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}));

import { GET, POST } from './route';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return new Request('http://localhost/api/cron/expire-memberships', { method: 'GET', headers });
}

describe('GET /api/cron/expire-memberships', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    mockAdminClient.from.mockReset();
  });

  it('returns 401 when the authorization header is missing', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it('returns 401 when the bearer token does not match CRON_SECRET', async () => {
    const response = await GET(makeRequest('Bearer wrong-secret'));
    expect(response.status).toBe(401);
  });

  it('returns 500 when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'CRON_SECRET is not set' });
  });

  it('resets expired users to free tier and returns the count', async () => {
    const updateSpy = vi.fn();
    const ltSpy = vi.fn();
    const notSpy = vi.fn();
    const neqSpy = vi.fn();
    mockAdminClient.from.mockReturnValue({
      update: (patch: any) => {
        updateSpy(patch);
        return {
          lt: (col: string, val: string) => {
            ltSpy(col, val);
            return {
              not: (col2: string, op: string, val2: any) => {
                notSpy(col2, op, val2);
                return {
                  neq: (col3: string, val3: string) => {
                    neqSpy(col3, val3);
                    return {
                      select: () => Promise.resolve({ data: [{ id: 'u1' }, { id: 'u2' }], error: null }),
                    };
                  },
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
    expect(body).toEqual({ expired_count: 2 });
    expect(updateSpy).toHaveBeenCalledWith({ tier: 'free', expires_at: null });
    expect(ltSpy).toHaveBeenCalledWith('expires_at', expect.any(String));
    expect(notSpy).toHaveBeenCalledWith('expires_at', 'is', null);
    expect(neqSpy).toHaveBeenCalledWith('tier', 'free');
  });

  it('returns 500 when the database update fails', async () => {
    mockAdminClient.from.mockReturnValue({
      update: () => ({
        lt: () => ({
          not: () => ({
            neq: () => ({
              select: () => Promise.resolve({ data: null, error: { message: 'db error' } }),
            }),
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
        lt: () => ({
          not: () => ({
            neq: () => ({
              select: () => Promise.resolve({ data: [{ id: 'u1' }], error: null }),
            }),
          }),
        }),
      }),
    });
    const response = await POST(makeRequest('Bearer test-secret'));
    expect(response.status).toBe(200);
  });
});
