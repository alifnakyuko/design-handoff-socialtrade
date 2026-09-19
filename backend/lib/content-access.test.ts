import { describe, it, expect } from 'vitest';
import { redactForTier, listContent, getContentById, type ContentRow } from './content-access';

const watchlistItem: ContentRow = {
  id: 'c1',
  type: 'watchlist',
  title: 'ANTM Watchlist',
  required_tier: 'gold',
  payload: { ticker: 'ANTM', price: '1.605' },
  published_at: '2026-09-01T00:00:00Z',
};

function fakeQuery(result: { data: any; error: any }) {
  const builder: any = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  return builder;
}

describe('redactForTier', () => {
  it('returns the full item with locked:false when the viewer has access', () => {
    expect(redactForTier(watchlistItem, 'gold')).toEqual({ ...watchlistItem, locked: false });
  });

  it('returns only id/type/title/required_tier with locked:true when the viewer lacks access', () => {
    expect(redactForTier(watchlistItem, 'silver')).toEqual({
      id: 'c1',
      type: 'watchlist',
      title: 'ANTM Watchlist',
      required_tier: 'gold',
      locked: true,
    });
  });
});

describe('listContent', () => {
  it('maps every row through redactForTier for the viewer tier', async () => {
    const supabase = { from: () => fakeQuery({ data: [watchlistItem], error: null }) } as any;
    const result = await listContent(supabase, 'free');
    expect(result).toEqual([
      { id: 'c1', type: 'watchlist', title: 'ANTM Watchlist', required_tier: 'gold', locked: true },
    ]);
  });

  it('returns an empty array on a query error', async () => {
    const supabase = { from: () => fakeQuery({ data: null, error: { message: 'boom' } }) } as any;
    expect(await listContent(supabase, 'free')).toEqual([]);
  });
});

describe('getContentById', () => {
  it('returns status 404 when the row does not exist', async () => {
    const supabase = { from: () => fakeQuery({ data: null, error: { message: 'not found' } }) } as any;
    expect(await getContentById(supabase, 'lifetime', 'missing')).toEqual({ status: 404 });
  });

  it('returns status 403 when the viewer lacks the required tier', async () => {
    const supabase = { from: () => fakeQuery({ data: watchlistItem, error: null }) } as any;
    expect(await getContentById(supabase, 'free', 'c1')).toEqual({ status: 403 });
  });

  it('returns status 200 and the full item when the viewer has access', async () => {
    const supabase = { from: () => fakeQuery({ data: watchlistItem, error: null }) } as any;
    expect(await getContentById(supabase, 'gold', 'c1')).toEqual({ status: 200, item: watchlistItem });
  });
});
