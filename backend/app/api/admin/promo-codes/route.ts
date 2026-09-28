import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { createPromoCode, listPromoCodes } from '@/lib/admin-promo';
import { PLAN_PRICES } from '@/lib/pricing';

const VALID_PLAN_CODES = Object.keys(PLAN_PRICES);

export async function GET() {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  const codes = await listPromoCodes(adminSupabase);
  return NextResponse.json({ codes });
}

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
  const { code, percent, expiresAt, maxUses, appliesToPlanIds } = body ?? {};

  if (typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  if (typeof percent !== 'number' || percent < 1 || percent > 100) {
    return NextResponse.json({ error: 'percent must be between 1 and 100' }, { status: 400 });
  }
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) {
    return NextResponse.json({ error: 'expiresAt is required' }, { status: 400 });
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

  const adminSupabase = createAdminClient();
  const result = await createPromoCode(adminSupabase, { code, percent, expiresAt, maxUses, appliesToPlanIds });
  return NextResponse.json(result, { status: 201 });
}
