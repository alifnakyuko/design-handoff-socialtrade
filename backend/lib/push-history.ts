import type { SupabaseClient } from '@supabase/supabase-js';

export type PushHistoryEntry = {
  id: string;
  type: 'watchlist' | 'article' | 'promo';
  title: string;
  pushed_at: string;
  notified_count: number;
};

export async function listPushHistory(supabase: SupabaseClient): Promise<PushHistoryEntry[]> {
  const { data, error } = await supabase
    .from('push_history')
    .select('id, type, title, pushed_at, notified_count')
    .order('pushed_at', { ascending: false });

  if (error || !data) return [];
  return data as PushHistoryEntry[];
}
