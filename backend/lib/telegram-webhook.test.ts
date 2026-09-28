import { describe, it, expect } from 'vitest';
import { handleTelegramUpdate } from './telegram-webhook';

// Checks the actual column name/value passed to .eq() on both tables (rather than ignoring
// them), so a bug like filtering on the wrong column would make these tests fail instead of
// passing regardless.
function fakeSupabase(opts: { ordersByInviteLink?: Record<string, { user_id: string }>; updateError?: any }) {
  const userUpdates: any[] = [];
  return {
    userUpdates,
    from: (table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              single: async () => {
                if (col !== 'telegram_invite_link') {
                  throw new Error(`expected filter on telegram_invite_link, got ${col}`);
                }
                const row = opts.ordersByInviteLink?.[val];
                return { data: row ?? null, error: row ? null : { message: 'not found' } };
              },
            }),
          }),
        };
      }
      if (table === 'users') {
        return {
          update: (patch: any) => ({
            eq: async (col: string, id: string) => {
              if (col !== 'id') {
                throw new Error(`expected filter on id, got ${col}`);
              }
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
    const supabase = fakeSupabase({ ordersByInviteLink: { 'https://t.me/+abc123': { user_id: 'u1' } } });
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
    const supabase = fakeSupabase({ ordersByInviteLink: {} });
    const result = await handleTelegramUpdate(supabase, {
      chat_member: {
        new_chat_member: { user: { id: 999 }, status: 'member' },
        invite_link: { invite_link: 'https://t.me/+unknown' },
      },
    });
    expect(result).toEqual({ status: 'invite_link_not_found' });
  });

  it('links to the correct order when multiple invite links are known, not just the first', async () => {
    const supabase = fakeSupabase({
      ordersByInviteLink: {
        'https://t.me/+aaa': { user_id: 'u-a' },
        'https://t.me/+bbb': { user_id: 'u-b' },
      },
    });
    const result = await handleTelegramUpdate(supabase, {
      chat_member: {
        new_chat_member: { user: { id: 999 }, status: 'member' },
        invite_link: { invite_link: 'https://t.me/+bbb' },
      },
    });

    expect(result).toEqual({ status: 'linked' });
    expect(supabase.userUpdates).toEqual([{ id: 'u-b', patch: { telegram_user_id: 999 } }]);
  });

  it('returns write_failed when updating the user fails', async () => {
    const supabase = fakeSupabase({
      ordersByInviteLink: { 'https://t.me/+abc123': { user_id: 'u1' } },
      updateError: { message: 'db error' },
    });
    const result = await handleTelegramUpdate(supabase, {
      chat_member: {
        new_chat_member: { user: { id: 999 }, status: 'member' },
        invite_link: { invite_link: 'https://t.me/+abc123' },
      },
    });
    expect(result).toEqual({ status: 'write_failed' });
  });
});
