import type { SupabaseClient } from '@supabase/supabase-js';

export type CreatePromoInput = {
  code: string;
  percent: number;
  expiresAt: string;
};

export async function createPromoCode(
  supabase: SupabaseClient,
  input: CreatePromoInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('promo_codes')
    .insert({ code: input.code, percent: input.percent, expires_at: input.expiresAt, active: true })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create promo code');
  }
  return { id: data.id };
}

export async function setPromoCodeActive(supabase: SupabaseClient, id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('promo_codes').update({ active }).eq('id', id);
  if (error) {
    throw new Error('Failed to update promo code');
  }
}

export type PromoCodeRow = {
  id: string;
  code: string;
  percent: number;
  active: boolean;
  expires_at: string;
};

export async function listPromoCodes(supabase: SupabaseClient): Promise<PromoCodeRow[]> {
  const { data, error } = await supabase
    .from('promo_codes')
    .select('id, code, percent, active, expires_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as PromoCodeRow[];
}

export type UpdatePromoInput = Partial<{ percent: number; expiresAt: string; active: boolean }>;

export async function updatePromoCode(supabase: SupabaseClient, id: string, input: UpdatePromoInput): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.percent !== undefined) patch.percent = input.percent;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
  if (input.active !== undefined) patch.active = input.active;
  const { error } = await supabase.from('promo_codes').update(patch).eq('id', id);
  if (error) throw new Error('Failed to update promo code');
}

export async function deletePromoCode(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('promo_codes').delete().eq('id', id);
  if (error) throw new Error('Failed to delete promo code');
}
