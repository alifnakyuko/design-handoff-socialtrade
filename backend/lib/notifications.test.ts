import { describe, it, expect, vi } from 'vitest';
import { sendContentNotification } from './notifications';
import type { EmailClient } from './email';

function fakeSupabase(users: { email: string; tier: string }[]) {
  return {
    from: () => ({
      select: async () => ({ data: users, error: null }),
    }),
  } as any;
}

function fakeEmailClient(): EmailClient & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    send: async (params) => {
      calls.push(params);
    },
  };
}

describe('sendContentNotification', () => {
  it('emails only members whose tier meets the required tier, and returns the count', async () => {
    const supabase = fakeSupabase([
      { email: 'free@x.com', tier: 'free' },
      { email: 'gold@x.com', tier: 'gold' },
      { email: 'lifetime@x.com', tier: 'lifetime' },
    ]);
    const emailClient = fakeEmailClient();

    const count = await sendContentNotification(supabase, emailClient, {
      title: 'ANTM Watchlist',
      type: 'watchlist',
      required_tier: 'gold',
    });

    expect(count).toBe(2);
    expect(emailClient.calls).toHaveLength(2);
    expect(emailClient.calls.map((c) => c.to[0]).sort()).toEqual(['gold@x.com', 'lifetime@x.com']);
    expect(emailClient.calls[0].subject).toContain('ANTM Watchlist');
    expect(emailClient.calls[1].subject).toContain('ANTM Watchlist');
  });

  it('does not call the email client and returns 0 when no members are eligible', async () => {
    const supabase = fakeSupabase([{ email: 'free@x.com', tier: 'free' }]);
    const emailClient = fakeEmailClient();

    const count = await sendContentNotification(supabase, emailClient, {
      title: 'Platinum-only report',
      type: 'article',
      required_tier: 'platinum',
    });

    expect(count).toBe(0);
    expect(emailClient.calls).toHaveLength(0);
  });
});
