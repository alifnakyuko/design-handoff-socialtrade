import { describe, it, expect, vi } from 'vitest';
import { checkPromoValidateRateLimit } from './promo-rate-limit';

function fakeSupabase({ count, deleteFn, insertFn }: { count: number; deleteFn?: any; insertFn?: any }) {
  return {
    from: (table: string) => {
      if (table !== 'promo_validate_attempts') throw new Error(`unexpected table ${table}`);
      return {
        delete: () => ({
          lt: deleteFn ?? (async () => ({ error: null })),
        }),
        select: () => ({
          eq: () => ({
            gte: async () => ({ count, error: null }),
          }),
        }),
        insert: insertFn ?? (async () => ({ error: null })),
      };
    },
  } as any;
}

describe('checkPromoValidateRateLimit', () => {
  it('allows the request and records an attempt when under the limit', async () => {
    const insertFn = vi.fn(async () => ({ error: null }));
    const supabase = fakeSupabase({ count: 3, insertFn });

    const allowed = await checkPromoValidateRateLimit(supabase, '1.2.3.4');

    expect(allowed).toBe(true);
    expect(insertFn).toHaveBeenCalledWith({ ip: '1.2.3.4' });
  });

  it('denies the request and does not record an attempt when at the limit', async () => {
    const insertFn = vi.fn(async () => ({ error: null }));
    const supabase = fakeSupabase({ count: 10, insertFn });

    const allowed = await checkPromoValidateRateLimit(supabase, '1.2.3.4');

    expect(allowed).toBe(false);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('cleans up attempts older than the window before counting', async () => {
    const deleteFn = vi.fn(async () => ({ error: null }));
    const supabase = fakeSupabase({ count: 0, deleteFn });

    await checkPromoValidateRateLimit(supabase, '1.2.3.4');

    expect(deleteFn).toHaveBeenCalled();
  });
});
