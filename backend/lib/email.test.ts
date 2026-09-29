import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createResendEmailClient } from './email';

describe('createResendEmailClient', () => {
  const originalKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  it('does not throw when RESEND_API_KEY is unset -- only send() should throw, so best-effort callers can catch it', async () => {
    delete process.env.RESEND_API_KEY;

    const client = createResendEmailClient();
    await expect(client.send({ to: ['x@example.com'], subject: 'hi', html: '<p>hi</p>' })).rejects.toThrow(
      'RESEND_API_KEY must be set'
    );
  });
});
