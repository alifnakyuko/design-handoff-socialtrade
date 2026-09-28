import { describe, it, expect, beforeEach } from 'vitest';
import { checkCronAuth } from './cron-auth';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return new Request('http://localhost/api/cron/whatever', { method: 'POST', headers });
}

describe('checkCronAuth', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
  });

  it('returns null (authorized) when the bearer token matches CRON_SECRET', () => {
    expect(checkCronAuth(makeRequest('Bearer test-secret'))).toBeNull();
  });

  it('returns 401 when the authorization header is missing', () => {
    expect(checkCronAuth(makeRequest())).toEqual({ status: 401, body: { error: 'Unauthorized' } });
  });

  it('returns 401 when the bearer token does not match', () => {
    expect(checkCronAuth(makeRequest('Bearer wrong-secret'))).toEqual({ status: 401, body: { error: 'Unauthorized' } });
  });

  it('returns 500 when CRON_SECRET is not set', () => {
    delete process.env.CRON_SECRET;
    expect(checkCronAuth(makeRequest('Bearer test-secret'))).toEqual({
      status: 500,
      body: { error: 'CRON_SECRET is not set' },
    });
  });
});
