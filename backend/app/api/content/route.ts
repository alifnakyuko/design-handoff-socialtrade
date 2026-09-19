import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { listContent, type ContentType } from '@/lib/content-access';

export async function GET(request: Request) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);
  const viewerTier = currentUser?.tier ?? 'free';

  const url = new URL(request.url);
  const type = url.searchParams.get('type') as ContentType | null;

  const adminSupabase = createAdminClient();
  const items = await listContent(adminSupabase, viewerTier, type ?? undefined);
  return NextResponse.json({ items });
}
