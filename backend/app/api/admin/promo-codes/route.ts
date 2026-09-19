import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { createPromoCode } from '@/lib/admin-promo';

export async function POST(request: Request) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { code, percent, expiresAt } = body ?? {};

  if (typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  if (typeof percent !== 'number' || percent < 1 || percent > 100) {
    return NextResponse.json({ error: 'percent must be between 1 and 100' }, { status: 400 });
  }
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) {
    return NextResponse.json({ error: 'expiresAt is required' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const result = await createPromoCode(adminSupabase, { code, percent, expiresAt });
  return NextResponse.json(result, { status: 201 });
}
