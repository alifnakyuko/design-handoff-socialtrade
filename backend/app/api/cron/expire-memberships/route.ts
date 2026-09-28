import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCronAuth } from '@/lib/cron-auth';
import { createTelegramClient } from '@/lib/telegram';

async function handleCronRequest(request: Request) {
  const authError = checkCronAuth(request);
  if (authError) {
    return NextResponse.json(authError.body, { status: authError.status });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('users')
    .update({ tier: 'free', expires_at: null })
    .lt('expires_at', nowIso)
    .not('expires_at', 'is', null)
    .neq('tier', 'free')
    .select('id, telegram_user_id');

  if (error) {
    console.error('Failed to expire memberships:', error);
    return NextResponse.json({ error: 'Failed to expire memberships' }, { status: 500 });
  }

  const expiredUsers = data ?? [];

  // Best-effort: kick each expired member from the Telegram group, then clear their
  // telegram_user_id so a future renewal generates a fresh invite link (otherwise
  // handleMidtransNotification's `!userRow?.telegram_user_id` check would see the stale id
  // and never re-invite them). A failure here (e.g. Telegram not configured, or the API call
  // failing) is logged but must not fail the cron -- the membership itself has already
  // correctly expired in the database. KNOWN LIMITATION: a failed kick is not automatically
  // retried (this user's row no longer matches the query above once tier/expires_at are
  // reset), so a Telegram outage during this run needs manual reconciliation via the logs.
  const telegram = createTelegramClient();
  await Promise.all(
    expiredUsers
      .filter((user) => user.telegram_user_id != null)
      .map(async (user) => {
        try {
          await telegram.kickFromGroup(user.telegram_user_id as number);
        } catch (telegramError) {
          console.error('Failed to remove expired user', user.id, 'from Telegram group', telegramError);
          return;
        }

        const { error: clearError } = await supabase
          .from('users')
          .update({ telegram_user_id: null })
          .eq('id', user.id);
        if (clearError) {
          console.error('Kicked user', user.id, 'but failed to clear telegram_user_id', clearError);
        }
      })
  );

  return NextResponse.json({ expired_count: expiredUsers.length });
}

export { handleCronRequest as GET, handleCronRequest as POST };
