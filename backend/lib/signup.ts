import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailClient } from './email';

export type SignupInput = { email: string; password: string; name: string };
export type SignupResult = { status: 'ok'; userId: string } | { status: 'error'; message: string };

export async function signup(
  adminSupabase: SupabaseClient,
  input: SignupInput,
  emailClient?: EmailClient
): Promise<SignupResult> {
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
    await adminSupabase.auth.admin.deleteUser(data.user.id);
    return { status: 'error', message: 'Failed to create user profile' };
  }

  if (emailClient) {
    // Best-effort: a failed welcome email must not fail the signup itself, since the
    // account and profile are already created at this point.
    try {
      await emailClient.send({
        to: [input.email],
        subject: 'Selamat bergabung di Social Trade',
        html: `<p>Halo ${input.name},</p><p>Akun kamu berhasil dibuat. Selamat datang di Social Trade!</p>`,
      });
    } catch (emailError) {
      console.error('Failed to send welcome email to', input.email, emailError);
    }
  }

  return { status: 'ok', userId: data.user.id };
}
