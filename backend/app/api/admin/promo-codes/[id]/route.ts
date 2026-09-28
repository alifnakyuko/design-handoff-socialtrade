import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { updatePromoCode, deletePromoCode } from '@/lib/admin-promo';
import { PLAN_PRICES } from '@/lib/pricing';

const VALID_PLAN_CODES = Object.keys(PLAN_PRICES);

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
  const { percent, expiresAt, active, maxUses, appliesToPlanIds } = body ?? {};

  if (percent !== undefined && (typeof percent !== 'number' || percent < 1 || percent > 100)) {
    return NextResponse.json({ error: 'percent must be between 1 and 100' }, { status: 400 });
  }
  if (expiresAt !== undefined && (typeof expiresAt !== 'string' || !expiresAt.trim())) {
    return NextResponse.json({ error: 'expiresAt must be a non-empty string' }, { status: 400 });
  }
  if (active !== undefined && typeof active !== 'boolean') {
    return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 });
  }
  if (maxUses !== undefined && maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    return NextResponse.json({ error: 'maxUses must be a positive integer or null' }, { status: 400 });
  }
  if (
    appliesToPlanIds !== undefined &&
    appliesToPlanIds !== null &&
    (!Array.isArray(appliesToPlanIds) ||
      appliesToPlanIds.length === 0 ||
      !appliesToPlanIds.every((p) => VALID_PLAN_CODES.includes(p)))
  ) {
    return NextResponse.json(
      { error: `appliesToPlanIds must be a non-empty array of plan codes (${VALID_PLAN_CODES.join(', ')}) or null` },
      { status: 400 }
    );
  }
  if (
    percent === undefined &&
    expiresAt === undefined &&
    active === undefined &&
    maxUses === undefined &&
    appliesToPlanIds === undefined
  ) {
    return NextResponse.json(
      { error: 'At least one of percent, expiresAt, active, maxUses, or appliesToPlanIds must be provided' },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();
  await updatePromoCode(adminSupabase, params.id, { percent, expiresAt, active, maxUses, appliesToPlanIds });
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
