export interface TelegramClient {
  createOneTimeInviteLink(name: string): Promise<string>;
  kickFromGroup(telegramUserId: number): Promise<void>;
}

async function callTelegramApi(botToken: string, method: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!json.ok) {
    throw new Error(`Telegram API ${method} failed: ${json.description ?? 'unknown error'}`);
  }
  return json.result;
}

export function createTelegramClient(): TelegramClient {
  return {
    async createOneTimeInviteLink(name: string): Promise<string> {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const groupChatId = process.env.TELEGRAM_GROUP_ID;
      if (!botToken || !groupChatId) {
        throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_GROUP_ID must be set');
      }
      const result = await callTelegramApi(botToken, 'createChatInviteLink', {
        chat_id: groupChatId,
        member_limit: 1,
        name,
      });
      return result.invite_link as string;
    },

    async kickFromGroup(telegramUserId: number): Promise<void> {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const groupChatId = process.env.TELEGRAM_GROUP_ID;
      if (!botToken || !groupChatId) {
        throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_GROUP_ID must be set');
      }
      // Ban then immediately unban: this removes the member from the group without
      // permanently banning them, so they can rejoin via a fresh invite link if they renew.
      await callTelegramApi(botToken, 'banChatMember', { chat_id: groupChatId, user_id: telegramUserId });
      await callTelegramApi(botToken, 'unbanChatMember', {
        chat_id: groupChatId,
        user_id: telegramUserId,
        only_if_banned: true,
      });
    },
  };
}
