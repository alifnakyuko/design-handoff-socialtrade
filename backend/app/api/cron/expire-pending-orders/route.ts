import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCronAuth } from '@/lib/cron-auth';

const PENDING_ORDER_TIMEOUT_MS = 24 * 60 * 60 * 1000;

async function handleCronRequest(request: Request) {
  const authError = checkCronAuth(request);
  if (authError) {
    return NextResponse.json(authError.body, { status: authError.status });
  }

  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - PENDING_ORDER_TIMEOUT_MS).toISOString();

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('created_at', cutoffIso)
    .select('id');

  if (error) {
    console.error('Failed to expire pending orders:', error);
    return NextResponse.json({ error: 'Failed to expire pending orders' }, { status: 500 });
  }

  return NextResponse.json({ expired_count: data?.length ?? 0 });
}

export { handleCronRequest as GET, handleCronRequest as POST };
