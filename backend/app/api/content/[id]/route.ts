import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { getContentById } from '@/lib/content-access';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const currentUser = await getCurrentUser(supabase);
  const viewerTier = currentUser?.tier ?? 'free';

  const result = await getContentById(supabase, viewerTier, params.id);

  if (result.status === 404) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (result.status === 403) {
    return NextResponse.json({ error: 'Upgrade your plan to view this content' }, { status: 403 });
  }
  return NextResponse.json({ item: result.item });
}
