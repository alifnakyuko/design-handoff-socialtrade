import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleTelegramUpdate, type TelegramChatMemberUpdate } from '@/lib/telegram-webhook';

// Telegram doesn't sign webhook bodies the way Midtrans does. Instead, `setWebhook` is called
// once (out of band, during setup) with a `secret_token`, and Telegram echoes it back on every
// call in this header -- verify it so an outsider can't POST fake chat_member events to link
// an arbitrary Telegram account to someone else's order.
// https://core.telegram.org/bots/api#setwebhook
function isValidSecretToken(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;

  const actual = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(actual);
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export async function POST(request: Request) {
  if (!isValidSecretToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = (await request.json()) as TelegramChatMemberUpdate;
  const supabase = createAdminClient();

  // Always ack 200 to Telegram even on a lookup/write failure -- there is no useful retry
  // Telegram can perform here (the invite link either exists or it doesn't), and returning a
  // non-2xx repeatedly can cause Telegram to disable the webhook. Failures are logged instead.
  const result = await handleTelegramUpdate(supabase, update);
  if (result.status === 'write_failed' || result.status === 'invite_link_not_found') {
    console.error('Telegram webhook could not link account:', result.status, JSON.stringify(update));
  }

  return NextResponse.json({ ok: true });
}
