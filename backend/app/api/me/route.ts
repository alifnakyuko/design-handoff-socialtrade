import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';

export async function GET() {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json(currentUser);
}
