import { describe, it, expect, vi } from 'vitest';
import { sendContentNotification } from './notifications';
import type { EmailClient } from './email';

function fakeSupabase(users: { email: string; tier: string; expires_at?: string | null }[]) {
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
      { email: 'free@x.com', tier: 'free', expires_at: null },
      { email: 'gold@x.com', tier: 'gold', expires_at: null },
      { email: 'lifetime@x.com', tier: 'lifetime', expires_at: null },
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
    const supabase = fakeSupabase([{ email: 'free@x.com', tier: 'free', expires_at: null }]);
    const emailClient = fakeEmailClient();

    const count = await sendContentNotification(supabase, emailClient, {
      title: 'Platinum-only report',
      type: 'article',
      required_tier: 'platinum',
    });

    expect(count).toBe(0);
    expect(emailClient.calls).toHaveLength(0);
  });

  it('excludes a member whose expires_at has already lapsed even though their tier column has not been reset yet', async () => {
    const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const supabase = fakeSupabase([
      { email: 'lapsed-gold@x.com', tier: 'gold', expires_at: pastExpiry },
      { email: 'active-gold@x.com', tier: 'gold', expires_at: null },
    ]);
    const emailClient = fakeEmailClient();

    const count = await sendContentNotification(supabase, emailClient, {
      title: 'Gold report',
      type: 'article',
      required_tier: 'gold',
    });

    expect(count).toBe(1);
    expect(emailClient.calls.map((c) => c.to[0])).toEqual(['active-gold@x.com']);
  });

  it('HTML-escapes the content title before interpolating it into the notification email', async () => {
    const supabase = fakeSupabase([{ email: 'gold@x.com', tier: 'gold', expires_at: null }]);
    const emailClient = fakeEmailClient();

    await sendContentNotification(supabase, emailClient, {
      title: '<img src=x onerror=alert(1)>',
      type: 'article',
      required_tier: 'gold',
    });

    expect(emailClient.calls[0].html).not.toContain('<img');
    expect(emailClient.calls[0].html).toContain('&lt;img');
  });
});
