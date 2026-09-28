import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdminClient = { from: vi.fn() };
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}));

const kickFromGroupMock = vi.fn();
vi.mock('@/lib/telegram', () => ({
  createTelegramClient: () => ({ kickFromGroup: kickFromGroupMock }),
}));

import { GET, POST } from './route';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return new Request('http://localhost/api/cron/expire-memberships', { method: 'GET', headers });
}

// The route calls `.from('users').update(...)` twice with two different shapes: once as the
// bulk expiry (`update({tier, expires_at}).lt().not().neq().select()`), and once per kicked
// user to clear their telegram_user_id (`update({telegram_user_id: null}).eq()`). This mock
// branches on the patch shape to serve both from the same `from()` return value.
function mockUsersTable(opts: {
  expireResult: { data: any[] | null; error: any };
  clearError?: any;
  spies?: { updateSpy?: any; ltSpy?: any; notSpy?: any; neqSpy?: any; clearEqSpy?: any };
}) {
  return {
    update: (patch: any) => {
      if ('tier' in patch) {
        opts.spies?.updateSpy?.(patch);
        return {
          lt: (col: string, val: string) => {
            opts.spies?.ltSpy?.(col, val);
            return {
              not: (col2: string, op: string, val2: any) => {
                opts.spies?.notSpy?.(col2, op, val2);
                return {
                  neq: (col3: string, val3: string) => {
                    opts.spies?.neqSpy?.(col3, val3);
                    return { select: () => Promise.resolve(opts.expireResult) };
                  },
                };
              },
            };
          },
        };
      }
      // Clearing telegram_user_id after a successful kick.
      return {
        eq: (col: string, id: string) => {
          opts.spies?.clearEqSpy?.(col, id);
          return Promise.resolve({ error: opts.clearError ?? null });
        },
      };
    },
  };
}

describe('GET /api/cron/expire-memberships', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    mockAdminClient.from.mockReset();
    kickFromGroupMock.mockReset();
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

  it('resets expired users to free tier, kicks the linked one from Telegram, and returns the count', async () => {
    const updateSpy = vi.fn();
    const ltSpy = vi.fn();
    const notSpy = vi.fn();
    const neqSpy = vi.fn();
    const clearEqSpy = vi.fn();
    mockAdminClient.from.mockReturnValue(
      mockUsersTable({
        expireResult: {
          data: [
            { id: 'u1', telegram_user_id: 111 },
            { id: 'u2', telegram_user_id: null },
          ],
          error: null,
        },
        spies: { updateSpy, ltSpy, notSpy, neqSpy, clearEqSpy },
      })
    );

    const response = await GET(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ expired_count: 2 });
    expect(updateSpy).toHaveBeenCalledWith({ tier: 'free', expires_at: null });
    expect(ltSpy).toHaveBeenCalledWith('expires_at', expect.any(String));
    expect(notSpy).toHaveBeenCalledWith('expires_at', 'is', null);
    expect(neqSpy).toHaveBeenCalledWith('tier', 'free');
    // Only the user with a linked Telegram account gets kicked, and then cleared.
    expect(kickFromGroupMock).toHaveBeenCalledTimes(1);
    expect(kickFromGroupMock).toHaveBeenCalledWith(111);
    expect(clearEqSpy).toHaveBeenCalledWith('id', 'u1');
  });

  it('does not fail the cron, and does not clear telegram_user_id, when kicking an expired user from Telegram fails', async () => {
    kickFromGroupMock.mockRejectedValueOnce(new Error('Telegram API down'));
    const clearEqSpy = vi.fn();
    mockAdminClient.from.mockReturnValue(
      mockUsersTable({
        expireResult: { data: [{ id: 'u1', telegram_user_id: 111 }], error: null },
        spies: { clearEqSpy },
      })
    );

    const response = await GET(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ expired_count: 1 });
    expect(clearEqSpy).not.toHaveBeenCalled();
  });

  it('does not fail the cron when clearing telegram_user_id fails after a successful kick', async () => {
    mockAdminClient.from.mockReturnValue(
      mockUsersTable({
        expireResult: { data: [{ id: 'u1', telegram_user_id: 111 }], error: null },
        clearError: { message: 'db error' },
      })
    );

    const response = await GET(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ expired_count: 1 });
    expect(kickFromGroupMock).toHaveBeenCalledWith(111);
  });

  it('returns 500 when the database update fails', async () => {
    mockAdminClient.from.mockReturnValue(
      mockUsersTable({ expireResult: { data: null, error: { message: 'db error' } } })
    );

    const response = await GET(makeRequest('Bearer test-secret'));
    expect(response.status).toBe(500);
  });

  it('POST also works (kept as an alias for manual/admin triggering)', async () => {
    mockAdminClient.from.mockReturnValue(mockUsersTable({ expireResult: { data: [{ id: 'u1' }], error: null } }));
    const response = await POST(makeRequest('Bearer test-secret'));
    expect(response.status).toBe(200);
  });
});
