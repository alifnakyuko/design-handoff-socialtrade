import type { SupabaseClient } from '@supabase/supabase-js';

export type SignupInput = { email: string; password: string; name: string };
export type SignupResult = { status: 'ok'; userId: string } | { status: 'error'; message: string };

export async function signup(adminSupabase: SupabaseClient, input: SignupInput): Promise<SignupResult> {
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    return { status: 'error', message: error?.message ?? 'Failed to create account' };
  }

  const { error: profileError } = await adminSupabase.from('users').insert({
    id: data.user.id,
    email: input.email,
    name: input.name,
    tier: 'free',
    is_admin: false,
  });

  if (profileError) {
    return { status: 'error', message: 'Failed to create user profile' };
  }

  return { status: 'ok', userId: data.user.id };
}
