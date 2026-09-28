import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { createResendEmailClient } from '@/lib/email';
import { publishContent } from '@/lib/admin-content';

export async function POST(request: Request) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { type, title, required_tier, payload } = body ?? {};

  if (type !== 'watchlist' && type !== 'article' && type !== 'video') {
    return NextResponse.json({ error: 'type must be watchlist, article, or video' }, { status: 400 });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const VALID_TIERS = ['free', 'silver', 'gold', 'platinum', 'lifetime'];
  if (!VALID_TIERS.includes(required_tier)) {
    return NextResponse.json(
      { error: 'required_tier must be one of free, silver, gold, platinum, lifetime' },
      { status: 400 }
    );
  }
  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return NextResponse.json({ error: 'payload must be an object' }, { status: 400 });
  }
  if (type === 'video' && (typeof payload?.provider_asset_id !== 'string' || !payload.provider_asset_id.trim())) {
    return NextResponse.json({ error: 'payload.provider_asset_id is required for video content' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const emailClient = createResendEmailClient();

  const result = await publishContent(adminSupabase, emailClient, {
    type,
    title,
    required_tier,
    payload: payload ?? {},
    createdBy: currentUser.id,
  });

  return NextResponse.json(result, { status: 201 });
}
