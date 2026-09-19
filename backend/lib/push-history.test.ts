import { describe, it, expect } from 'vitest';
import { listPushHistory } from './push-history';

describe('listPushHistory', () => {
  it('returns rows ordered newest-first as provided by the query', async () => {
    const rows = [
      { id: 'p2', type: 'article', title: 'Second', pushed_at: '2026-09-02T00:00:00Z', notified_count: 5 },
      { id: 'p1', type: 'watchlist', title: 'First', pushed_at: '2026-09-01T00:00:00Z', notified_count: 3 },
    ];
    const supabase = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
    } as any;

    expect(await listPushHistory(supabase)).toEqual(rows);
  });

  it('returns an empty array on a query error', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: null, error: { message: 'boom' } }),
        }),
      }),
    } as any;

    expect(await listPushHistory(supabase)).toEqual([]);
  });
});
