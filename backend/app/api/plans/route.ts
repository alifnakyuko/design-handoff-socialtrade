import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listActivePlans } from '@/lib/plans';

export async function GET() {
  const supabase = createAdminClient();
  const plans = await listActivePlans(supabase);
  return NextResponse.json({ plans });
}
