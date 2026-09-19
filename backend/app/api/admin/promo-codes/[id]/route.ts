import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { updatePromoCode, deletePromoCode } from '@/lib/admin-promo';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { percent, expiresAt, active } = body ?? {};

  if (percent !== undefined && (typeof percent !== 'number' || percent < 1 || percent > 100)) {
    return NextResponse.json({ error: 'percent must be between 1 and 100' }, { status: 400 });
  }
  if (expiresAt !== undefined && (typeof expiresAt !== 'string' || !expiresAt.trim())) {
    return NextResponse.json({ error: 'expiresAt must be a non-empty string' }, { status: 400 });
  }
  if (active !== undefined && typeof active !== 'boolean') {
    return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  await updatePromoCode(adminSupabase, params.id, { percent, expiresAt, active });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  const result = await deletePromoCode(adminSupabase, params.id);
  if (result.status === 'in_use') {
    return NextResponse.json(
      { error: 'This promo code has been used on an order and cannot be deleted — deactivate it instead' },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
