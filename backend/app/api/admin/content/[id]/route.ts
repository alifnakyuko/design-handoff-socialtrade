import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { updateContent, deleteContent } from '@/lib/admin-content';

const VALID_TIERS = ['free', 'silver', 'gold', 'platinum', 'lifetime'];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { title, required_tier, payload } = body ?? {};

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 });
  }
  if (required_tier !== undefined && !VALID_TIERS.includes(required_tier)) {
    return NextResponse.json({ error: `required_tier must be one of ${VALID_TIERS.join(', ')}` }, { status: 400 });
  }
  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return NextResponse.json({ error: 'payload must be an object' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const result = await updateContent(adminSupabase, params.id, { title, required_tier, payload });

  if (result.status === 'not_found') {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }
  if (result.status === 'invalid_payload') {
    return NextResponse.json({ error: 'payload.provider_asset_id is required for video content' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  await deleteContent(adminSupabase, params.id);
  return NextResponse.json({ ok: true });
}
