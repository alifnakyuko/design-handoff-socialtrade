import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { getOrderStatus } from '@/lib/orders';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();
  const order = await getOrderStatus(adminSupabase, params.id, currentUser.id);

  if (!order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(order);
}
