import { describe, it, expect } from 'vitest';
import { getCurrentUser } from './current-user';

function fakeSupabase(opts: {
  authUser: { id: string } | null;
  profileRow: { tier: string; is_admin: boolean; expires_at?: string | null } | null;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.authUser } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: opts.profileRow,
            error: opts.profileRow ? null : { message: 'not found' },
          }),
        }),
      }),
    }),
  } as any;
}

describe('getCurrentUser', () => {
  it('returns null when there is no authenticated session', async () => {
    const supabase = fakeSupabase({ authUser: null, profileRow: null });
    expect(await getCurrentUser(supabase)).toBeNull();
  });

  it('returns null when the auth user has no matching profile row', async () => {
    const supabase = fakeSupabase({ authUser: { id: 'u1' }, profileRow: null });
    expect(await getCurrentUser(supabase)).toBeNull();
  });

  it('returns id, tier, and isAdmin for a valid session', async () => {
    const supabase = fakeSupabase({
      authUser: { id: 'u1' },
      profileRow: { tier: 'gold', is_admin: true, expires_at: null },
    });
    expect(await getCurrentUser(supabase)).toEqual({ id: 'u1', tier: 'gold', isAdmin: true });
  });

  it('returns the stored tier when expires_at is still in the future', async () => {
    const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const supabase = fakeSupabase({
      authUser: { id: 'u1' },
      profileRow: { tier: 'gold', is_admin: false, expires_at: futureExpiry },
    });
    expect(await getCurrentUser(supabase)).toEqual({ id: 'u1', tier: 'gold', isAdmin: false });
  });

  it('treats the user as free when expires_at is in the past, even though the stored tier column has not been reset yet', async () => {
    // Backstop for the daily cron not having run yet (or having failed) since the
    // membership actually lapsed -- see lib/current-user.ts.
    const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const supabase = fakeSupabase({
      authUser: { id: 'u1' },
      profileRow: { tier: 'platinum', is_admin: false, expires_at: pastExpiry },
    });
    expect(await getCurrentUser(supabase)).toEqual({ id: 'u1', tier: 'free', isAdmin: false });
  });
});
