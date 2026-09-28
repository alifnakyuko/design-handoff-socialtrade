import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { signup } from '@/lib/signup';
import { createResendEmailClient } from '@/lib/email';

export async function POST(request: Request) {
  const body = await request.json();
  const { email, password, name } = body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
    return NextResponse.json({ error: 'email, password, and name are required' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const result = await signup(adminSupabase, { email, password, name }, createResendEmailClient());

  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ userId: result.userId }, { status: 201 });
}
