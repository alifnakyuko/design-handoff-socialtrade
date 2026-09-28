import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailClient } from './email';
import { tierRank, type Tier } from './tiers';
import { escapeHtml } from './html-escape';

export type NotifiableContent = {
  title: string;
  type: 'watchlist' | 'video' | 'article';
  required_tier: Tier;
};

export async function sendContentNotification(
  supabase: SupabaseClient,
  emailClient: EmailClient,
  item: NotifiableContent
): Promise<number> {
  const { data: users, error } = await supabase.from('users').select('email, tier, expires_at');
  if (error || !users) return 0;

  const now = Date.now();
  const eligible = (users as { email: string; tier: Tier; expires_at: string | null }[]).filter((u) => {
    // Same backstop as lib/current-user.ts: the daily expiry cron may not have reset
    // `tier` yet even though the membership has lapsed, so re-check expires_at here too
    // rather than notifying someone whose access has already expired.
    const isExpired = u.expires_at != null && new Date(u.expires_at).getTime() <= now;
    const effectiveTier: Tier = isExpired ? 'free' : u.tier;
    return tierRank(effectiveTier) >= tierRank(item.required_tier);
  });
  if (eligible.length === 0) return 0;

  await Promise.all(
    eligible.map((u) =>
      emailClient.send({
        to: [u.email],
        subject: `Konten baru: ${item.title}`,
        html: `<p>Ada ${item.type} baru untuk Anda: <strong>${escapeHtml(item.title)}</strong>. Login untuk melihat.</p>`,
      })
    )
  );

  return eligible.length;
}
