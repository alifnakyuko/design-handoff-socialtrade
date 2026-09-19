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
