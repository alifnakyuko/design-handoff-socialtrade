import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

const handleTelegramUpdateMock = vi.fn();
vi.mock('@/lib/telegram-webhook', () => ({
  handleTelegramUpdate: (...args: any[]) => handleTelegramUpdateMock(...args),
}));

import { POST } from './route';

function makeRequest(body: any, secretHeader?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (secretHeader !== undefined) headers.set('x-telegram-bot-api-secret-token', secretHeader);
  return new Request('http://localhost/api/webhooks/telegram', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/webhooks/telegram', () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    handleTelegramUpdateMock.mockReset();
  });

  it('returns 401 when the secret token header is missing', async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(401);
    expect(handleTelegramUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the secret token does not match', async () => {
    const response = await POST(makeRequest({}, 'wrong-secret'));
    expect(response.status).toBe(401);
  });

  it('returns 401 when TELEGRAM_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const response = await POST(makeRequest({}, 'anything'));
    expect(response.status).toBe(401);
  });

  it('acks 200 and processes the update when the secret token matches', async () => {
    handleTelegramUpdateMock.mockResolvedValueOnce({ status: 'linked' });
    const update = { chat_member: { new_chat_member: { user: { id: 1 }, status: 'member' } } };

    const response = await POST(makeRequest(update, 'test-secret'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(handleTelegramUpdateMock).toHaveBeenCalledWith(expect.anything(), update);
  });

  it('still acks 200 even when the handler could not link the account', async () => {
    handleTelegramUpdateMock.mockResolvedValueOnce({ status: 'invite_link_not_found' });
    const response = await POST(makeRequest({}, 'test-secret'));
    expect(response.status).toBe(200);
  });
});
