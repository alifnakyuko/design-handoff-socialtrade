import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { listContent, type ContentType } from '@/lib/content-access';

export async function GET(request: Request) {
  const supabase = createServerSupabase();
  const currentUser = await getCurrentUser(supabase);
  const viewerTier = currentUser?.tier ?? 'free';

  const url = new URL(request.url);
  const type = url.searchParams.get('type') as ContentType | null;

  const items = await listContent(supabase, viewerTier, type ?? undefined);
  return NextResponse.json({ items });
}
