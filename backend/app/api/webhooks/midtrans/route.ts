import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleMidtransNotification, type MidtransNotification } from '@/lib/midtrans-webhook';

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw new Error('MIDTRANS_SERVER_KEY must be set');
  }

  const notification = (await request.json()) as MidtransNotification;
  const adminSupabase = createAdminClient();

  const result = await handleMidtransNotification(adminSupabase, notification, serverKey);

  if (result.status === 'invalid_signature') {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (result.status === 'order_not_found') {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
