import type { SupabaseClient } from '@supabase/supabase-js';
import { hasAccess, type Tier } from './tiers';

export type ContentType = 'watchlist' | 'video' | 'article';

export type ContentRow = {
  id: string;
  type: ContentType;
  title: string;
  required_tier: Tier;
  payload: Record<string, unknown>;
  published_at: string;
};

export type ContentListItem =
  | (ContentRow & { locked: false })
  | { id: string; type: ContentType; title: string; required_tier: Tier; locked: true };

export function redactForTier(item: ContentRow, viewerTier: Tier): ContentListItem {
  if (hasAccess(viewerTier, item.required_tier)) {
    return { ...item, locked: false };
  }
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    required_tier: item.required_tier,
    locked: true,
  };
}

export async function listContent(
  supabase: SupabaseClient,
  viewerTier: Tier,
  type?: ContentType
): Promise<ContentListItem[]> {
  let query = supabase.from('content_items').select('*').order('published_at', { ascending: false });
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as ContentRow[]).map((item) => redactForTier(item, viewerTier));
}

export async function getContentById(
  supabase: SupabaseClient,
  viewerTier: Tier,
  id: string
): Promise<{ status: 200; item: ContentRow } | { status: 403 } | { status: 404 }> {
  const { data, error } = await supabase.from('content_items').select('*').eq('id', id).single();
  if (error || !data) return { status: 404 };
  const item = data as ContentRow;
  if (!hasAccess(viewerTier, item.required_tier)) return { status: 403 };
  return { status: 200, item };
}
