import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { updateMemberTier } from '@/lib/admin-members';

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
  const { tier, expiresAt } = body ?? {};

  if (!VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: `tier must be one of ${VALID_TIERS.join(', ')}` }, { status: 400 });
  }
  if (expiresAt !== null && typeof expiresAt !== 'string') {
    return NextResponse.json({ error: 'expiresAt must be an ISO date string or null' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const result = await updateMemberTier(adminSupabase, { userId: params.id, adminId: currentUser.id, tier, expiresAt });

  if (result.status === 'not_found') {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
