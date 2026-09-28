import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleMidtransNotification, type MidtransNotification } from '@/lib/midtrans-webhook';
import { createTelegramClient } from '@/lib/telegram';

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw new Error('MIDTRANS_SERVER_KEY must be set');
  }

  const notification = (await request.json()) as MidtransNotification;
  const adminSupabase = createAdminClient();

  // Telegram invite-link generation is best-effort inside handleMidtransNotification --
  // missing TELEGRAM_BOT_TOKEN/TELEGRAM_GROUP_ID degrades gracefully (logged, no invite
  // link) rather than failing the payment, so this is safe to always pass.
  const result = await handleMidtransNotification(adminSupabase, notification, serverKey, createTelegramClient());

  if (result.status === 'invalid_signature') {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (result.status === 'order_not_found') {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (result.status === 'write_failed') {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
