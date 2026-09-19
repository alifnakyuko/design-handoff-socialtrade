import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailClient } from './email';
import { tierRank, type Tier } from './tiers';

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
  const { data: users, error } = await supabase.from('users').select('email, tier');
  if (error || !users) return 0;

  const eligible = (users as { email: string; tier: Tier }[]).filter(
    (u) => tierRank(u.tier) >= tierRank(item.required_tier)
  );
  if (eligible.length === 0) return 0;

  await Promise.all(
    eligible.map((u) =>
      emailClient.send({
        to: [u.email],
        subject: `Konten baru: ${item.title}`,
        html: `<p>Ada ${item.type} baru untuk Anda: <strong>${item.title}</strong>. Login untuk melihat.</p>`,
      })
    )
  );

  return eligible.length;
}
