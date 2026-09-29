import { describe, it, expect, vi } from 'vitest';
import { publishContent } from './admin-content';
import type { EmailClient } from './email';

function fakeSupabase() {
  const inserted: any[] = [];
  const pushHistoryRows: any[] = [];
  return {
    inserted,
    pushHistoryRows,
    from: (table: string) => {
      if (table === 'content_items') {
        return {
          insert: (row: any) => ({
            select: () => ({
              single: async () => {
                inserted.push(row);
                return { data: { id: 'content-1' }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'users') {
        return { select: async () => ({ data: [{ email: 'gold@x.com', tier: 'gold' }], error: null }) };
      }
      if (table === 'push_history') {
        return {
          insert: async (row: any) => {
            pushHistoryRows.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

function fakeEmailClient(): EmailClient {
  return { send: async () => {} };
}

describe('publishContent', () => {
  it('inserts the content item, notifies eligible members, and logs push history', async () => {
    const supabase = fakeSupabase();
    const emailClient = fakeEmailClient();

    const result = await publishContent(supabase, emailClient, {
      type: 'watchlist',
      title: 'ANTM Watchlist',
      required_tier: 'gold',
      payload: { ticker: 'ANTM', price: '1.605' },
      createdBy: 'admin-1',
    });

    expect(result).toEqual({ id: 'content-1', notifiedCount: 1 });
    expect(supabase.inserted[0]).toMatchObject({
      type: 'watchlist',
      title: 'ANTM Watchlist',
      required_tier: 'gold',
      created_by: 'admin-1',
    });
    expect(supabase.pushHistoryRows[0]).toMatchObject({
      content_item_id: 'content-1',
      type: 'watchlist',
      title: 'ANTM Watchlist',
      pushed_by: 'admin-1',
      notified_count: 1,
    });
  });

  it('allows publishing a video content item', async () => {
    const supabase = fakeSupabase();
    const emailClient = fakeEmailClient();

    const result = await publishContent(supabase, emailClient, {
      type: 'video',
      title: 'Cara Baca Laporan Keuangan',
      required_tier: 'silver',
      payload: { provider_asset_id: 'youtube-asset-1', duration_sec: 620 },
      createdBy: 'admin-1',
    });

    expect(result).toEqual({ id: 'content-1', notifiedCount: 1 });
    expect(supabase.inserted[0]).toMatchObject({ type: 'video', required_tier: 'silver' });
    expect(supabase.pushHistoryRows[0]).toMatchObject({ type: 'video' });
  });

  it('still returns success when logging push history fails, since the content item and notifications already went out', async () => {
    const supabase = fakeSupabase();
    supabase.from = ((table: string) => {
      if (table === 'push_history') {
        return { insert: async () => ({ error: { message: 'db error' } }) };
      }
      return fakeSupabase().from(table);
    }) as any;
    const emailClient = fakeEmailClient();

    const result = await publishContent(supabase, emailClient, {
      type: 'article',
      title: 'Analisa Mingguan',
      required_tier: 'gold',
      payload: {},
      createdBy: 'admin-1',
    });

    expect(result).toEqual({ id: 'content-1', notifiedCount: 1 });
  });
});
