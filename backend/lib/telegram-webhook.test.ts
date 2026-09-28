import { describe, it, expect } from 'vitest';
import { handleTelegramUpdate } from './telegram-webhook';

function fakeSupabase(opts: { orderRow?: { user_id: string } | null; updateError?: any }) {
  const userUpdates: any[] = [];
  return {
    userUpdates,
    from: (table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: opts.orderRow ?? null,
                error: opts.orderRow ? null : { message: 'not found' },
              }),
            }),
          }),
        };
      }
      if (table === 'users') {
        return {
          update: (patch: any) => ({
            eq: async (_col: string, id: string) => {
              userUpdates.push({ id, patch });
              return { error: opts.updateError ?? null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('handleTelegramUpdate', () => {
  it('links the telegram user id to the order owner when they join via their invite link', async () => {
    const supabase = fakeSupabase({ orderRow: { user_id: 'u1' } });
    const result = await handleTelegramUpdate(supabase, {
      chat_member: {
        new_chat_member: { user: { id: 999 }, status: 'member' },
        invite_link: { invite_link: 'https://t.me/+abc123' },
      },
    });

    expect(result).toEqual({ status: 'linked' });
    expect(supabase.userUpdates).toEqual([{ id: 'u1', patch: { telegram_user_id: 999 } }]);
  });

  it('ignores updates with no chat_member field', async () => {
    const supabase = fakeSupabase({});
    expect(await handleTelegramUpdate(supabase, {})).toEqual({ status: 'ignored' });
  });

  it('ignores a chat_member update whose status is not "member" (e.g. left/kicked)', async () => {
    const supabase = fakeSupabase({});
    const result = await handleTelegramUpdate(supabase, {
      chat_member: {
        new_chat_member: { user: { id: 999 }, status: 'left' },
        invite_link: { invite_link: 'https://t.me/+abc123' },
      },
    });
    expect(result).toEqual({ status: 'ignored' });
  });

  it('ignores a chat_member update with no invite_link (e.g. someone joining by request)', async () => {
    const supabase = fakeSupabase({});
    const result = await handleTelegramUpdate(supabase, {
      chat_member: { new_chat_member: { user: { id: 999 }, status: 'member' }, invite_link: null },
    });
    expect(result).toEqual({ status: 'ignored' });
  });

  it('returns invite_link_not_found when no order matches the invite link', async () => {
    const supabase = fakeSupabase({ orderRow: null });
    const result = await handleTelegramUpdate(supabase, {
      chat_member: {
        new_chat_member: { user: { id: 999 }, status: 'member' },
        invite_link: { invite_link: 'https://t.me/+unknown' },
      },
    });
    expect(result).toEqual({ status: 'invite_link_not_found' });
  });

  it('returns write_failed when updating the user fails', async () => {
    const supabase = fakeSupabase({ orderRow: { user_id: 'u1' }, updateError: { message: 'db error' } });
    const result = await handleTelegramUpdate(supabase, {
      chat_member: {
        new_chat_member: { user: { id: 999 }, status: 'member' },
        invite_link: { invite_link: 'https://t.me/+abc123' },
      },
    });
    expect(result).toEqual({ status: 'write_failed' });
  });
});
