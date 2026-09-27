import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePromo } from '@/lib/promo';
import type { Plan } from '@/lib/pricing';

const VALID_PLANS: Plan[] = ['silver', 'gold', 'platinum', 'lifetime'];

export async function POST(request: Request) {
  const body = await request.json();
  const { code, plan } = body ?? {};

  if (typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'plan must be one of silver, gold, platinum, lifetime' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const result = await validatePromo(supabase, code.trim(), plan);

  if (!result.valid) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({ valid: true, discountPct: result.discountPct, finalPrice: result.finalPrice });
}
