import type { SupabaseClient } from '@supabase/supabase-js';
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

  const { error: pushHistoryError } = await supabase.from('push_history').insert({
    content_item_id: inserted.id,
    type: input.type,
    title: input.title,
    pushed_by: input.createdBy,
    notified_count: notifiedCount,
  });

  if (pushHistoryError) {
    throw new Error('Failed to log push history');
  }

  return { id: inserted.id, notifiedCount };
}
