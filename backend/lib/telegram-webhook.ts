import type { SupabaseClient } from '@supabase/supabase-js';

export type TelegramChatMemberUpdate = {
  chat_member?: {
    new_chat_member: { user: { id: number }; status: string };
    invite_link?: { invite_link: string } | null;
  };
};

// Handles a Telegram chat_member update: when someone joins the group via their personal
// one-time invite link (see lib/telegram.ts's createOneTimeInviteLink, called from the
// Midtrans webhook on a successful grant), link their Telegram user id to the order (and its
// user) that invite link was generated for. Ignores every other update shape.
export async function handleTelegramUpdate(
  supabase: SupabaseClient,
  update: TelegramChatMemberUpdate
): Promise<{ status: 'ignored' | 'linked' | 'invite_link_not_found' | 'write_failed' }> {
  const chatMember = update.chat_member;
  if (!chatMember || chatMember.new_chat_member.status !== 'member' || !chatMember.invite_link?.invite_link) {
    return { status: 'ignored' };
  }

  const telegramUserId = chatMember.new_chat_member.user.id;
  const inviteLink = chatMember.invite_link.invite_link;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('user_id')
    .eq('telegram_invite_link', inviteLink)
    .single();

  if (orderError || !order) {
    return { status: 'invite_link_not_found' };
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ telegram_user_id: telegramUserId })
    .eq('id', order.user_id);

  if (updateError) {
    return { status: 'write_failed' };
  }

  return { status: 'linked' };
}
