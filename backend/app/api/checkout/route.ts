import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { createMidtransSnapClient } from '@/lib/midtrans-snap';
import { createCheckout } from '@/lib/checkout';
import type { Plan } from '@/lib/pricing';

const VALID_PLANS: Plan[] = ['silver', 'gold', 'platinum', 'lifetime'];

export async function POST(request: Request) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: authData } = await sessionSupabase.auth.getUser();
  const userEmail = authData.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'No email on account' }, { status: 400 });
  }

  const body = await request.json();
  const { plan, promoCode } = body ?? {};

  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'plan must be one of silver, gold, platinum, lifetime' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const snap = createMidtransSnapClient();

  const result = await createCheckout(adminSupabase, snap, {
    userId: currentUser.id,
    userEmail,
    plan,
    promoCode: typeof promoCode === 'string' && promoCode.trim() ? promoCode.trim() : undefined,
  });

  if (result.status === 'invalid_promo') {
    return NextResponse.json({ error: 'Invalid or expired promo code' }, { status: 400 });
  }

  return NextResponse.json(result, { status: 201 });
}
