# Social Trade Backend

Backend for the Social Trade membership platform. See `../docs/superpowers/specs/2026-09-19-social-trade-backend-design.md` for the full design.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in real values.
2. Apply the database schema to your Supabase project:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. In the Supabase dashboard, configure Auth → SMTP to send real password-reset emails (or use Supabase's default email sending for testing).
4. In your Midtrans dashboard, register this deployment's webhook URL (`https://<your-domain>/api/webhooks/midtrans`) as the payment notification URL.
5. Generate a random value for `CRON_SECRET` (e.g. `openssl rand -hex 32`) and set it in both `.env.local` and your Vercel project's environment variables. Vercel Cron calls `POST /api/cron/expire-memberships` daily at 00:05 WIB with this value as a bearer token; without it the route rejects every request with 401.
6. In Resend, verify the sending domain used in `lib/email.ts` (`notifikasi@socialtrade.id`) before content-push emails will deliver.

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
