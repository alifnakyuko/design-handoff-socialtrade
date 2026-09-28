# Social Trade Backend

Backend for the Social Trade membership platform. See `../docs/superpowers/specs/2026-09-19-social-trade-backend-design.md` for the full design.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in real values.
2. Apply the database schema to your Supabase project:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   **Deploy order matters for migrations `0003_apply_membership_grant.sql` and `0005_grant_accepts_expired_orders.sql`:** run `supabase db push` before deploying code that calls the function they define (`lib/midtrans-webhook.ts`). If the code ships first, PostgREST won't have the function in its schema cache yet and every payment settlement will fail closed (logged, no membership granted, Midtrans retries) until the migration lands.
3. In the Supabase dashboard, configure Auth → SMTP to send real password-reset emails (or use Supabase's default email sending for testing).
4. In your Midtrans dashboard, register this deployment's webhook URL (`https://<your-domain>/api/webhooks/midtrans`) as the payment notification URL.
5. Generate a random value for `CRON_SECRET` (e.g. `openssl rand -hex 32`) and set it in both `.env.local` and your Vercel project's environment variables. Vercel Cron calls `GET /api/cron/expire-memberships` daily at 00:05 WIB and `GET /api/cron/expire-pending-orders` hourly with this value as a bearer token (both routes are registered in `vercel.json`); if `CRON_SECRET` is unset a route returns 500, and a request with a missing or wrong bearer token gets 401. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations when that env var is set on the project — you don't need to configure headers manually in the Vercel dashboard. Vercel Cron only runs on production deployments, and (for Hobby-plan accounts) only guarantees firing sometime within the scheduled hour, not at the exact minute. The Vercel project's Root Directory setting must be `backend/` for `backend/vercel.json` to be picked up (since this repo's Next.js app lives under `backend/`, not the repo root). Existing users who paid before this migration have `expires_at = null` and will not be expired automatically — see the design spec's "Deployment Note: Existing Paid Users" section for the required manual backfill before relying on this for enforcement.
6. In Resend, verify the sending domain used in `lib/email.ts` (`notifikasi@socialtrade.id`) before content-push emails (and the new signup welcome email) will deliver.
7. Set `BUNNY_STREAM_API_KEY` and `BUNNY_LIBRARY_ID` for `GET /api/videos/:id/play` (signed playback URLs, `lib/video-provider.ts`). **This was built without live Bunny Stream credentials to test against** — the token-authentication URL construction follows Bunny's publicly documented scheme but has not been verified end-to-end. Confirm it against a real Bunny Stream library and https://docs.bunny.net/docs/stream-embed-view-token-authentication before relying on it in production.

8. **Telegram group auto-invite/auto-kick (optional feature — requires you to create the bot):**
   - Create a bot via [@BotFather](https://t.me/BotFather), add it to your premium Telegram group as an admin with "Ban users" and "Invite users via link" permissions.
   - Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_GROUP_ID` (the group's chat id, e.g. `-100xxxxxxxxxx`).
   - Generate a random `TELEGRAM_WEBHOOK_SECRET` and register the webhook once by calling (replace placeholders):
     ```bash
     curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-domain>/api/webhooks/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=%5B%22chat_member%22%5D"
     ```
     `allowed_updates=["chat_member"]` is required — without it Telegram won't send the join events this feature listens for.
   - This whole feature degrades gracefully if left unconfigured: a successful payment still grants membership even if no Telegram invite link could be generated (logged, not fatal), and the expiry cron still expires memberships even if it can't reach Telegram to kick anyone.
   - **Not verified against a live bot/group** — built from Telegram's public Bot API docs (https://core.telegram.org/bots/api) without a real bot token to test against. Confirm `createChatInviteLink`, `banChatMember`/`unbanChatMember`, and the `chat_member` webhook payload shape against a real bot before relying on this.

## Creating the first admin user

There is no self-service way to become an admin — this is intentional (no client-supplied field can ever grant admin access). After a user signs up normally via `POST /api/auth/signup`, promote them to admin manually in the Supabase SQL editor:

```sql
update public.users set is_admin = true where email = 'your-admin-email@example.com';
```

## Testing

```bash
npm install
npm test
```
