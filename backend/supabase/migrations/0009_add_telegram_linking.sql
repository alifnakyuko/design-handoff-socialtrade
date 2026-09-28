-- Links a user's account to their Telegram identity (set once they join the premium group
-- via their personal one-time invite link, see the /api/webhooks/telegram handler), and
-- records the invite link generated per paid order so the webhook can match a joining
-- Telegram user back to the order/user that earned them access.
alter table public.users
  add column telegram_user_id bigint;

alter table public.orders
  add column telegram_invite_link text;
