import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContentRow } from './content-access';
import type { EmailClient } from './email';
import { sendContentNotification } from './notifications';
import type { Tier } from './tiers';

export type PublishContentInput = {
  type: 'watchlist' | 'article' | 'video';
  title: string;
  required_tier: Tier;
  payload: Record<string, unknown>;
  createdBy: string;
};

export async function publishContent(
  supabase: SupabaseClient,
  emailClient: EmailClient,
  input: PublishContentInput
): Promise<{ id: string; notifiedCount: number }> {
  const { data: inserted, error } = await supabase
    .from('content_items')
    .insert({
      type: input.type,
      title: input.title,
      required_tier: input.required_tier,
      payload: input.payload,
      created_by: input.createdBy,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error('Failed to create content item');
  }

  const notifiedCount = await sendContentNotification(supabase, emailClient, {
    title: input.title,
    type: input.type,
    required_tier: input.required_tier,
  });

  // Best-effort: the content item is already created and subscribers already notified by
  // this point, so a failure here must not surface as a publish failure -- otherwise the
  // admin sees an error for a publish that actually succeeded and may resubmit, duplicating
  // the content item and re-notifying every subscriber.
  const { error: pushHistoryError } = await supabase.from('push_history').insert({
    content_item_id: inserted.id,
    type: input.type,
    title: input.title,
    pushed_by: input.createdBy,
    notified_count: notifiedCount,
  });

  if (pushHistoryError) {
    console.error('Failed to log push history for content item', inserted.id, pushHistoryError);
  }

  return { id: inserted.id, notifiedCount };
}

export async function listAllContent(supabase: SupabaseClient): Promise<ContentRow[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, type, title, required_tier, payload, published_at')
    .order('published_at', { ascending: false });
  if (error || !data) return [];
  return data as ContentRow[];
}

export type UpdateContentInput = Partial<{
  title: string;
  required_tier: Tier;
  payload: Record<string, unknown>;
}>;

export async function updateContent(
  supabase: SupabaseClient,
  id: string,
  input: UpdateContentInput
): Promise<{ status: 'ok' } | { status: 'not_found' } | { status: 'invalid_payload' }> {
  const { data: existing, error: fetchError } = await supabase
    .from('content_items')
    .select('id, type')
    .eq('id', id)
    .single();
  if (fetchError || !existing) return { status: 'not_found' };

  if (
    input.payload !== undefined &&
    existing.type === 'video' &&
    (typeof input.payload.provider_asset_id !== 'string' || !input.payload.provider_asset_id.trim())
  ) {
    return { status: 'invalid_payload' };
  }

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.required_tier !== undefined) patch.required_tier = input.required_tier;
  if (input.payload !== undefined) patch.payload = input.payload;

  const { error } = await supabase.from('content_items').update(patch).eq('id', id);
  if (error) throw new Error('Failed to update content item');
  return { status: 'ok' };
}

export async function deleteContent(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('content_items').delete().eq('id', id);
  if (error) throw new Error('Failed to delete content item');
}
