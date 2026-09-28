import { describe, it, expect } from 'vitest';
import { sendExpiryReminders } from './expiry-reminders';

const DAY_MS = 24 * 60 * 60 * 1000;

// Evaluates filters against real row data (rather than a pre-scripted call-chain shape),
// same pattern used in lib/midtrans-webhook.test.ts -- so this test actually verifies the
// query filters out what they claim to, not just that some chain of methods was called.
function fakeSupabase(users: any[] | null) {
  return {
    from: () => {
      const filters: Array<(row: any) => boolean> = [];
      const builder: any = {
        select: () => builder,
        not: (col: string, _op: string, val: any) => {
          filters.push((row) => (val === null ? row[col] !== null && row[col] !== undefined : row[col] !== val));
          return builder;
        },
        neq: (col: string, val: any) => {
          filters.push((row) => row[col] !== val);
          return builder;
        },
        gt: (col: string, val: string) => {
          filters.push((row) => row[col] != null && row[col] > val);
          return builder;
        },
        lte: (col: string, val: string) => {
          filters.push((row) => row[col] != null && row[col] <= val);
          return builder;
        },
        then: (resolve: any) => {
          if (users === null) return resolve({ data: null, error: { message: 'db error' } });
          const matched = users.filter((row) => filters.every((f) => f(row)));
          return resolve({ data: matched, error: null });
        },
      };
      return builder;
    },
  } as any;
}

function fakeEmailClient() {
  const calls: any[] = [];
  return { calls, send: async (params: any) => { calls.push(params); } };
}

describe('sendExpiryReminders', () => {
  it('sends a reminder to a member expiring in exactly 7 days', async () => {
    const expiresAt = new Date(Date.now() + 7 * DAY_MS).toISOString();
    const supabase = fakeSupabase([{ email: 'a@x.com', name: 'A', tier: 'gold', expires_at: expiresAt }]);
    const emailClient = fakeEmailClient();

    const count = await sendExpiryReminders(supabase, emailClient);

    expect(count).toBe(1);
    expect(emailClient.calls).toHaveLength(1);
    expect(emailClient.calls[0].to).toEqual(['a@x.com']);
    expect(emailClient.calls[0].subject).toContain('7 hari');
  });

  it('sends a reminder to a member expiring in exactly 1 day, with a different subject', async () => {
    const expiresAt = new Date(Date.now() + 1 * DAY_MS).toISOString();
    const supabase = fakeSupabase([{ email: 'b@x.com', name: 'B', tier: 'silver', expires_at: expiresAt }]);
    const emailClient = fakeEmailClient();

    const count = await sendExpiryReminders(supabase, emailClient);

    expect(count).toBe(1);
    expect(emailClient.calls[0].subject).toContain('besok');
  });

  it('does not send a reminder to a member expiring in 15 days (excluded by the query window)', async () => {
    const expiresAt = new Date(Date.now() + 15 * DAY_MS).toISOString();
    const supabase = fakeSupabase([{ email: 'c@x.com', name: 'C', tier: 'gold', expires_at: expiresAt }]);
    const emailClient = fakeEmailClient();

    expect(await sendExpiryReminders(supabase, emailClient)).toBe(0);
    expect(emailClient.calls).toHaveLength(0);
  });

  it('does not send a reminder for an already-expired membership (excluded by the query window)', async () => {
    const expiresAt = new Date(Date.now() - 1 * DAY_MS).toISOString();
    const supabase = fakeSupabase([{ email: 'd@x.com', name: 'D', tier: 'gold', expires_at: expiresAt }]);
    const emailClient = fakeEmailClient();

    expect(await sendExpiryReminders(supabase, emailClient)).toBe(0);
  });

  it('excludes a free-tier member even if expires_at happens to be set', async () => {
    const expiresAt = new Date(Date.now() + 7 * DAY_MS).toISOString();
    const supabase = fakeSupabase([{ email: 'e@x.com', name: 'E', tier: 'free', expires_at: expiresAt }]);
    const emailClient = fakeEmailClient();

    expect(await sendExpiryReminders(supabase, emailClient)).toBe(0);
  });

  it('returns 0 on a query error', async () => {
    const supabase = fakeSupabase(null);
    expect(await sendExpiryReminders(supabase, fakeEmailClient())).toBe(0);
  });

  it('continues sending to other members if one email send fails', async () => {
    const expiresAt = new Date(Date.now() + 7 * DAY_MS).toISOString();
    const supabase = fakeSupabase([
      { email: 'fail@x.com', name: 'Fail', tier: 'gold', expires_at: expiresAt },
      { email: 'ok@x.com', name: 'Ok', tier: 'gold', expires_at: expiresAt },
    ]);
    const emailClient = {
      calls: [] as any[],
      send: async (params: any) => {
        if (params.to[0] === 'fail@x.com') throw new Error('resend down');
        emailClient.calls.push(params);
      },
    };

    const count = await sendExpiryReminders(supabase, emailClient);

    expect(count).toBe(1);
    expect(emailClient.calls).toHaveLength(1);
    expect(emailClient.calls[0].to).toEqual(['ok@x.com']);
  });

  it('HTML-escapes name and tier before interpolating them into the reminder email', async () => {
    const expiresAt = new Date(Date.now() + 7 * DAY_MS).toISOString();
    const supabase = fakeSupabase([
      { email: 'x@x.com', name: '<img src=x onerror=alert(1)>', tier: 'gold', expires_at: expiresAt },
    ]);
    const emailClient = fakeEmailClient();

    await sendExpiryReminders(supabase, emailClient);

    expect(emailClient.calls[0].html).not.toContain('<img');
    expect(emailClient.calls[0].html).toContain('&lt;img');
  });
});
