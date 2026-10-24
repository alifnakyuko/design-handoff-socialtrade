import { describe, it, expect, vi } from 'vitest';
import { publishContent, listAllContent, updateContent, deleteContent } from './admin-content';
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

describe('listAllContent', () => {
  it('returns every content item unfiltered, including locked-tier items', async () => {
    const rows = [
      { id: '1', type: 'video', title: 'Free video', required_tier: 'free', payload: {}, published_at: '2026-01-01' },
      { id: '2', type: 'video', title: 'Platinum video', required_tier: 'platinum', payload: {}, published_at: '2026-01-02' },
    ];
    const supabase = {
      from: () => ({ select: () => ({ order: async () => ({ data: rows, error: null }) }) }),
    } as any;

    const result = await listAllContent(supabase);

    expect(result).toEqual(rows);
  });
});

describe('updateContent', () => {
  function fakeSupabase(existingRow: any) {
    const updates: any[] = [];
    return {
      updates,
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: existingRow, error: null }) }) }),
        update: (patch: any) => ({
          eq: async (_col: string, id: string) => {
            updates.push({ id, patch });
            return { error: null };
          },
        }),
      }),
    } as any;
  }

  it('updates title/required_tier/payload and returns ok', async () => {
    const supabase = fakeSupabase({ id: 'c1', type: 'article', title: 'Old', required_tier: 'free', payload: {} });

    const result = await updateContent(supabase, 'c1', { title: 'New title', required_tier: 'gold' });

    expect(result).toEqual({ status: 'ok' });
    expect(supabase.updates[0].patch).toMatchObject({ title: 'New title', required_tier: 'gold' });
  });

  it('returns not_found when the content item does not exist', async () => {
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'no rows' } }) }) }) }),
    } as any;

    const result = await updateContent(supabase, 'missing', { title: 'X' });

    expect(result).toEqual({ status: 'not_found' });
  });

  it('rejects a video payload update missing provider_asset_id', async () => {
    const supabase = fakeSupabase({ id: 'c1', type: 'video', title: 'Vid', required_tier: 'free', payload: { provider_asset_id: 'abc' } });

    const result = await updateContent(supabase, 'c1', { payload: { duration_sec: 120 } });

    expect(result).toEqual({ status: 'invalid_payload' });
  });
});

describe('deleteContent', () => {
  it('deletes the row', async () => {
    const deleted: string[] = [];
    const supabase = {
      from: () => ({ delete: () => ({ eq: async (_col: string, id: string) => { deleted.push(id); return { error: null }; } }) }),
    } as any;

    await deleteContent(supabase, 'c1');

    expect(deleted).toEqual(['c1']);
  });
});
