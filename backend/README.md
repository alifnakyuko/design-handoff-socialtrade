# Social Trade Backend

Backend for the Social Trade membership platform. See `../docs/superpowers/specs/2026-09-19-social-trade-backend-design.md` for the full design.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in real values.
2. Apply the database schema to your Supabase project:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   **Deploy order matters — run `supabase db push` before deploying the code that depends on it, for every one of these migrations:**
   - `0003_apply_membership_grant.sql` — defines the function `lib/midtrans-webhook.ts` calls via RPC. Deploying the code first means PostgREST doesn't have the function yet, so every payment settlement fails closed (logged, no membership granted, Midtrans retries) until the migration lands.
   - `0005_grant_accepts_expired_orders.sql`, `0006_promo_quota_and_plan_restriction.sql`, `0007_persist_raw_webhook.sql` — each widens `apply_membership_grant`'s parameter list. Code that passes the newer parameter names before the matching migration has run gets the same PGRST202 failure as above.
   - `0009_add_telegram_linking.sql` — adds `users.telegram_user_id` and `orders.telegram_invite_link`, which `lib/midtrans-webhook.ts` and `app/api/cron/expire-memberships` both `select`/`update` unconditionally. Deploying the code first makes every settlement AND every expiry-cron run fail (missing column), not just the Telegram-specific part.
   - In short: **push all of 0001–0009 before deploying this codebase's `main`/production branch for the first time.** Migrations 0004 (`plans` table) and 0008 (`push_history` CHECK widening) have no such ordering constraint, but there's no harm applying everything together.
3. In the Supabase dashboard, configure Auth → SMTP to send real password-reset emails (or use Supabase's default email sending for testing).
4. In your Midtrans dashboard, register this deployment's webhook URL (`https://<your-domain>/api/webhooks/midtrans`) as the payment notification URL.
5. Generate a random value for `CRON_SECRET` (e.g. `openssl rand -hex 32`) and set it in both `.env.local` and your Vercel project's environment variables. Vercel Cron calls three routes with this value as a bearer token (all three registered in `vercel.json`): `GET /api/cron/expire-memberships` daily at 00:05 WIB, `GET /api/cron/expire-pending-orders` hourly, and `GET /api/cron/expiry-reminders` daily at 01:00 WIB. If `CRON_SECRET` is unset a route returns 500, and a request with a missing or wrong bearer token gets 401. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations when that env var is set on the project — you don't need to configure headers manually in the Vercel dashboard. Vercel Cron only runs on production deployments, and (for Hobby-plan accounts) only guarantees firing sometime within the scheduled hour, not at the exact minute. **`expire-pending-orders`'s hourly schedule may require a paid Vercel plan** — verify against your account's actual Cron limits (Hobby accounts have historically been limited to fewer/daily-only invocations; check Vercel's current plan documentation) before relying on this running hourly. The Vercel project's Root Directory setting must be `backend/` for `backend/vercel.json` to be picked up (since this repo's Next.js app lives under `backend/`, not the repo root). Existing users who paid before this migration have `expires_at = null` and will not be expired automatically — see the design spec's "Deployment Note: Existing Paid Users" section for the required manual backfill before relying on this for enforcement.

   **Known limitation — `expiry-reminders` timing assumes a strict once-daily cadence.** It computes "days remaining" by rounding up, so a user is only ever in the H-7 or H-1 window on the one day it's computed to fall on. If this cron's actual run time drifts by more than a few hours day-to-day (Hobby-plan jitter, a manual trigger, a missed run), a member could receive a reminder twice or not at all. There is no "already reminded" flag to prevent this — acceptable for a first version, but worth adding if drift becomes a real problem.

   **Known limitation — promo `max_uses` is a soft cap, not a hard one.** `used_count` only increments when an order settles (per the original design intent: a code that's merely validated but never paid for shouldn't count against the quota), but the quota is checked against `used_count` at *checkout* time. Any number of orders can be created while `used_count` is one below `max_uses`, and all of them will later settle successfully — a code capped at 100 uses could end up honored more than 100 times if many orders are created in a short window. Document this to admins setting quotas, or tighten it later by also counting live pending orders against the same code at checkout time.

   **`POST /api/promo/validate` and `GET /api/plans` are intentionally public/unauthenticated**, per the original brief. This does mean anyone can enumerate promo codes for free (no rate limiting is implemented anywhere in this codebase yet) — acceptable for now since codes are typically distributed via marketing rather than treated as secrets, but add rate limiting if code-guessing abuse becomes a problem.
6. In Resend, verify the sending domain used in `lib/email.ts` (`notifikasi@socialtrade.id`) before content-push emails (and the new signup welcome email) will deliver.
7. **Video playback (`GET /api/videos/:id/play`, `lib/video-provider.ts`) uses YouTube**, not a paid streaming provider. Upload each video as "Unlisted" on YouTube, restrict embedding to this app's domain (YouTube Studio → video → Visibility → Restrictions → "Allow embedding" scoped to your domain), and set the video's YouTube ID as `provider_asset_id` in that content item's `payload` when creating it via the admin content API. **Known limitation:** unlike a signed-URL provider, YouTube has no expiring link or per-viewer access control — once a member has the playback URL it keeps working for anyone, indefinitely, even after their membership expires or if they share it outside the app. The tier check in `route.ts` only gates whether the app *hands out* the link, not whether it keeps working afterward. Accept this trade-off only for content where a leak is tolerable; do not use it for content whose value depends on staying exclusive to paying members.

8. **Telegram group auto-invite/auto-kick (optional feature — requires you to create the bot):**
   - Create a bot via [@BotFather](https://t.me/BotFather), add it to your premium Telegram group as an admin with "Ban users" and "Invite users via link" permissions.
   - Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_GROUP_ID` (the group's chat id, e.g. `-100xxxxxxxxxx`).
   - Generate a random `TELEGRAM_WEBHOOK_SECRET` and register the webhook once by calling (replace placeholders):
     ```bash
     curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-domain>/api/webhooks/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=%5B%22chat_member%22%5D"
     ```
     `allowed_updates=["chat_member"]` is required — without it Telegram won't send the join events this feature listens for.
   - This whole feature degrades gracefully if left unconfigured: a successful payment still grants membership even if no Telegram invite link could be generated (logged, not fatal), and the expiry cron still expires memberships even if it can't reach Telegram to kick anyone.
   - The generated invite link is returned in `telegramInviteLink` from both `GET /api/orders` and `GET /api/orders/:id` — the frontend needs to actually display/link it somewhere for the member to use it (no email is sent with it currently).
   - **Known limitation:** the invite link is only generated once, on the notification that first completes the grant. If that attempt fails (Telegram API error/timeout), no retry happens on a redelivered/duplicate settlement notification (which the idempotency guard treats as already-processed and skips re-running this step). A failed invite-link generation needs manual reconciliation (check the logs for "Failed to create Telegram invite link").
   - **Known limitation:** a kicked (expired) member's `telegram_user_id` is cleared so a future renewal generates a fresh invite link — but if the kick itself fails (Telegram unreachable during that cron run), it is not automatically retried on a later run, since the user's row no longer matches the expiry query once their tier is reset. Needs manual reconciliation via the logs in that case too.
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
