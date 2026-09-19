import { describe, it, expect, vi } from 'vitest';
import { signup } from './signup';

function fakeAdminSupabase(opts: {
  createUserResult: { user: { id: string } | null; error: { message: string } | null };
  insertError?: { message: string } | null;
}) {
  return {
    auth: {
      admin: {
        createUser: vi.fn(async () => ({
          data: { user: opts.createUserResult.user },
          error: opts.createUserResult.error,
        })),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
    },
    from: () => ({
      insert: async () => ({ error: opts.insertError ?? null }),
    }),
  } as any;
}

describe('signup', () => {
  it('creates an auth user and a matching free-tier profile row', async () => {
    const supabase = fakeAdminSupabase({ createUserResult: { user: { id: 'u1' }, error: null } });
    const result = await signup(supabase, { email: 'a@b.com', password: 'secret123', name: 'Ana' });
    expect(result).toEqual({ status: 'ok', userId: 'u1' });
  });

  it('returns an error when auth user creation fails', async () => {
    const supabase = fakeAdminSupabase({
      createUserResult: { user: null, error: { message: 'Email already registered' } },
    });
    const result = await signup(supabase, { email: 'a@b.com', password: 'secret123', name: 'Ana' });
    expect(result).toEqual({ status: 'error', message: 'Email already registered' });
  });

  it('returns an error when the profile row insert fails', async () => {
    const supabase = fakeAdminSupabase({
      createUserResult: { user: { id: 'u1' }, error: null },
      insertError: { message: 'duplicate key' },
    });
    const result = await signup(supabase, { email: 'a@b.com', password: 'secret123', name: 'Ana' });
    expect(result).toEqual({ status: 'error', message: 'Failed to create user profile' });
    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith('u1');
  });
});
