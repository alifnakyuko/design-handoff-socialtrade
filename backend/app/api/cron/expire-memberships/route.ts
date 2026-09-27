import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('users')
    .update({ tier: 'free', expires_at: null })
    .lt('expires_at', nowIso)
    .not('expires_at', 'is', null)
    .neq('tier', 'free')
    .select('id');

  if (error) {
    return NextResponse.json({ error: 'Failed to expire memberships' }, { status: 500 });
  }

  return NextResponse.json({ expired_count: data?.length ?? 0 });
}
