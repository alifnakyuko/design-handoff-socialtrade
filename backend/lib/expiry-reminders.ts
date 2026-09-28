import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailClient } from './email';
import { escapeHtml } from './html-escape';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAY_THRESHOLDS = [7, 1];
const MAX_THRESHOLD_DAYS = Math.max(...REMINDER_DAY_THRESHOLDS);

// Sends a renewal reminder to members whose membership expires in exactly 7 or 1 days.
// Relies on this cron running once daily: each user crosses each threshold on exactly one
// day (ceil(daysRemaining) === 7, then later === 1), so no "already reminded" flag is
// needed as long as the cron isn't run more than once on the same calendar day.
export async function sendExpiryReminders(supabase: SupabaseClient, emailClient: EmailClient): Promise<number> {
  const now = Date.now();
  // Narrow the query to the window that could possibly match a threshold, rather than
  // fetching every non-free member and filtering in JS -- with enough members, an unfiltered
  // fetch would silently hit Supabase's default row cap and skip reminders past it.
  const windowEndIso = new Date(now + MAX_THRESHOLD_DAYS * DAY_MS).toISOString();

  const { data: users, error } = await supabase
    .from('users')
    .select('email, name, tier, expires_at')
    .not('expires_at', 'is', null)
    .neq('tier', 'free')
    .gt('expires_at', new Date(now).toISOString())
    .lte('expires_at', windowEndIso);

  if (error || !users) return 0;

  let sentCount = 0;

  for (const user of users as { email: string; name: string; tier: string; expires_at: string }[]) {
    const expiresAtMs = new Date(user.expires_at).getTime();

    const daysRemaining = Math.ceil((expiresAtMs - now) / DAY_MS);
    if (!REMINDER_DAY_THRESHOLDS.includes(daysRemaining)) continue;

    try {
      await emailClient.send({
        to: [user.email],
        subject:
          daysRemaining === 1
            ? 'Membership kamu berakhir besok'
            : `Membership kamu berakhir dalam ${daysRemaining} hari`,
        html: `<p>Halo ${escapeHtml(user.name)},</p><p>Paket ${escapeHtml(user.tier)} kamu akan berakhir dalam ${daysRemaining} hari. Perpanjang sekarang supaya akses tidak terputus.</p>`,
      });
      sentCount += 1;
    } catch (sendError) {
      console.error('Failed to send expiry reminder to', user.email, sendError);
    }
  }

  return sentCount;
}
