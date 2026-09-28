import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailClient } from './email';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAY_THRESHOLDS = [7, 1];

// Sends a renewal reminder to members whose membership expires in exactly 7 or 1 days.
// Relies on this cron running once daily: each user crosses each threshold on exactly one
// day (ceil(daysRemaining) === 7, then later === 1), so no "already reminded" flag is
// needed as long as the cron isn't run more than once on the same calendar day.
export async function sendExpiryReminders(supabase: SupabaseClient, emailClient: EmailClient): Promise<number> {
  const now = Date.now();

  const { data: users, error } = await supabase
    .from('users')
    .select('email, name, tier, expires_at')
    .not('expires_at', 'is', null)
    .neq('tier', 'free');

  if (error || !users) return 0;

  let sentCount = 0;

  for (const user of users as { email: string; name: string; tier: string; expires_at: string }[]) {
    const expiresAtMs = new Date(user.expires_at).getTime();
    if (expiresAtMs <= now) continue;

    const daysRemaining = Math.ceil((expiresAtMs - now) / DAY_MS);
    if (!REMINDER_DAY_THRESHOLDS.includes(daysRemaining)) continue;

    try {
      await emailClient.send({
        to: [user.email],
        subject:
          daysRemaining === 1
            ? 'Membership kamu berakhir besok'
            : `Membership kamu berakhir dalam ${daysRemaining} hari`,
        html: `<p>Halo ${user.name},</p><p>Paket ${user.tier} kamu akan berakhir dalam ${daysRemaining} hari. Perpanjang sekarang supaya akses tidak terputus.</p>`,
      });
      sentCount += 1;
    } catch (sendError) {
      console.error('Failed to send expiry reminder to', user.email, sendError);
    }
  }

  return sentCount;
}
