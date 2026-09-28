import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { getContentById } from '@/lib/content-access';
import { createBunnyStreamProvider } from '@/lib/video-provider';

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

  if (result.item.type !== 'video') {
    return NextResponse.json({ error: 'This content is not a video' }, { status: 400 });
  }

  const assetId = result.item.payload?.provider_asset_id;
  if (typeof assetId !== 'string' || !assetId) {
    console.error('Video content item', result.item.id, 'has no provider_asset_id in its payload');
    return NextResponse.json({ error: 'Video is not playable' }, { status: 500 });
  }

  const provider = createBunnyStreamProvider();
  const url = provider.getSignedPlaybackUrl(assetId);

  return NextResponse.json({ url });
}
