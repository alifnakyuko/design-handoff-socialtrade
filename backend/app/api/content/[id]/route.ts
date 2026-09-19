import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { getContentById } from '@/lib/content-access';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);
  const viewerTier = currentUser?.tier ?? 'free';

  const adminSupabase = createAdminClient();
  const result = await getContentById(adminSupabase, viewerTier, params.id);

  if (result.status === 404) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (result.status === 403) {
    return NextResponse.json({ error: 'Upgrade your plan to view this content' }, { status: 403 });
  }
  return NextResponse.json({ item: result.item });
}
