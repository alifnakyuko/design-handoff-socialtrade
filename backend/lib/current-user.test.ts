import { describe, it, expect } from 'vitest';
import { getCurrentUser } from './current-user';

function fakeSupabase(opts: {
  authUser: { id: string } | null;
  profileRow: { tier: string; is_admin: boolean } | null;
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
      profileRow: { tier: 'gold', is_admin: true },
    });
    expect(await getCurrentUser(supabase)).toEqual({ id: 'u1', tier: 'gold', isAdmin: true });
  });
});
