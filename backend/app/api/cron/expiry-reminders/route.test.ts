import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));
vi.mock('@/lib/email', () => ({
  createResendEmailClient: () => ({}),
}));

const sendExpiryRemindersMock = vi.fn();
vi.mock('@/lib/expiry-reminders', () => ({
  sendExpiryReminders: (...args: any[]) => sendExpiryRemindersMock(...args),
}));

import { GET, POST } from './route';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return new Request('http://localhost/api/cron/expiry-reminders', { method: 'GET', headers });
}

describe('GET /api/cron/expiry-reminders', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    sendExpiryRemindersMock.mockReset();
  });

  it('returns 401 when the authorization header is missing', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(sendExpiryRemindersMock).not.toHaveBeenCalled();
  });

  it('returns the sent count when authorized', async () => {
    sendExpiryRemindersMock.mockResolvedValueOnce(3);
    const response = await GET(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ sent_count: 3 });
  });

  it('POST also works (kept as an alias for manual/admin triggering)', async () => {
    sendExpiryRemindersMock.mockResolvedValueOnce(0);
    const response = await POST(makeRequest('Bearer test-secret'));
    expect(response.status).toBe(200);
  });
});
