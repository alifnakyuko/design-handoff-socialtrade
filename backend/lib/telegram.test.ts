import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTelegramClient } from './telegram';

function mockFetchOnce(response: any, ok = true) {
  return vi.fn().mockResolvedValueOnce({
    json: async () => (ok ? { ok: true, result: response } : { ok: false, description: response }),
  });
}

describe('createTelegramClient', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_GROUP_ID = '-100123456';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createOneTimeInviteLink', () => {
    it('calls createChatInviteLink with member_limit 1 and returns the invite link', async () => {
      const fetchMock = mockFetchOnce({ invite_link: 'https://t.me/+abc123' });
      vi.stubGlobal('fetch', fetchMock);

      const client = createTelegramClient();
      const link = await client.createOneTimeInviteLink('order-1');

      expect(link).toBe('https://t.me/+abc123');
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.telegram.org/bottest-bot-token/createChatInviteLink');
      const body = JSON.parse(options.body);
      expect(body).toEqual({ chat_id: '-100123456', member_limit: 1, name: 'order-1' });
    });

    it('throws when the Telegram API returns ok:false', async () => {
      const fetchMock = mockFetchOnce('chat not found', false);
      vi.stubGlobal('fetch', fetchMock);

      const client = createTelegramClient();
      await expect(client.createOneTimeInviteLink('order-1')).rejects.toThrow(
        'Telegram API createChatInviteLink failed: chat not found'
      );
    });

    it('throws when TELEGRAM_BOT_TOKEN is not set', async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      const client = createTelegramClient();
      await expect(client.createOneTimeInviteLink('order-1')).rejects.toThrow(
        'TELEGRAM_BOT_TOKEN and TELEGRAM_GROUP_ID must be set'
      );
    });
  });

  describe('kickFromGroup', () => {
    it('bans then unbans the member, in that order', async () => {
      const calls: string[] = [];
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        calls.push(url);
        return { json: async () => ({ ok: true, result: true }) };
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = createTelegramClient();
      await client.kickFromGroup(999);

      expect(calls).toEqual([
        'https://api.telegram.org/bottest-bot-token/banChatMember',
        'https://api.telegram.org/bottest-bot-token/unbanChatMember',
      ]);

      const unbanBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(unbanBody).toEqual({ chat_id: '-100123456', user_id: 999, only_if_banned: true });
    });

    it('throws when the ban call fails, without calling unban', async () => {
      const fetchMock = mockFetchOnce('user not found', false);
      vi.stubGlobal('fetch', fetchMock);

      const client = createTelegramClient();
      await expect(client.kickFromGroup(999)).rejects.toThrow('Telegram API banChatMember failed: user not found');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
