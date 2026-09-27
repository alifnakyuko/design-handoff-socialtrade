# Membership Expiry & Renewal — Design Spec

Date: 2026-09-27
Depends on: `2026-09-19-social-trade-backend-design.md` (base schema/routes)
Followed by: a separate Telegram unification spec (invite link + auto-kick), which depends on the `expires_at` field introduced here.

## Purpose

The current implementation upgrades `users.tier` on payment but never tracks *when* a membership ends and never reverts it. Once a user pays once, they keep paid-tier access forever, regardless of plan duration. This spec adds membership expiry tracking, renewal/upgrade proration, and a daily cron job that reverts expired memberships to the free tier.

Out of scope (tracked separately, not blocking this spec): hourly expiry of stale `pending` orders, auto-deactivating expired promo codes, a `plans` DB table (pricing stays hardcoded in `lib/pricing.ts` for now), Telegram group sync.

## Data Model Changes

One new nullable column on the existing `public.users` table (no new tables):

```sql
alter table public.users
  add column expires_at timestamptz;
```

- `expires_at` — when the current `tier` ends. `null` for `lifetime` and for `free`.
- `users.tier` (existing column: `'free'|'silver'|'gold'|'platinum'|'lifetime'`) already doubles as the plan code — no separate `plan` column is needed. All access-control code keeps reading `tier` unchanged; this spec only adds the "until when" half.

`lib/pricing.ts` gains a `duration_days` alongside the existing `price` per plan code, so the proration math below has a daily rate to work with. `lifetime` has `duration_days: null`.

## Renewal / Upgrade Calculation

A new pure function, `calculateNewExpiry(now, current, purchasedPlan)`, replaces the tier-upgrade logic currently in `lib/midtrans-webhook.ts` (lines ~70-88). Inputs:
- `current: { tier: string; expiresAt: Date | null }` — the user's state before this payment (`tier` is `'free'` if never paid).
- `purchasedPlan: string` — the plan code just paid for (`'silver'|'gold'|'platinum'|'lifetime'`).

Returns `{ tier: string; expiresAt: Date | null }` to write back to the user row. Rules, in order:

0. **Current tier is already `lifetime`** → unchanged, `{ tier: 'lifetime', expiresAt: null }`. Lifetime has no `expiresAt` to prorate against and is never demoted by a further purchase (buying a lower plan while already Lifetime is a no-op, not a downgrade).
1. **Purchased plan is `lifetime`** → `{ tier: 'lifetime', expiresAt: null }`. Always wins; proration is irrelevant since lifetime has no end date.
2. **No active plan** (`current.tier === 'free'`, or `current.expiresAt` is in the past) → `expiresAt = now + duration_days(purchasedPlan)` days. No proration: there is no remaining value to carry over.
3. **Same plan as current (renewal)** → `expiresAt = max(now, current.expiresAt) + duration_days(purchasedPlan)` days. This stacks remaining time (renewing early keeps the unused days).
4. **Different plan, current one still active (upgrade or downgrade)** — prorate the remaining value of the old plan into days of the new plan, symmetrically regardless of direction:
   - `remaining_days = ceil((current.expiresAt - now) / 1 day)`
   - `remaining_value = remaining_days * price(current.tier) / duration_days(current.tier)`
   - `converted_days = floor(remaining_value / (price(purchasedPlan) / duration_days(purchasedPlan)))`
   - `expiresAt = now + (duration_days(purchasedPlan) + converted_days)` days

`tier` is set to `purchasedPlan` in every branch.

This function is pure (takes `now` as a parameter, no I/O) so it can be unit-tested exhaustively without mocking dates.

## Webhook Integration

`lib/midtrans-webhook.ts`'s payment-success handler calls `calculateNewExpiry` instead of the current "upgrade only if higher rank" check, then writes `tier` and `expires_at` to the user row in the same update that currently sets tier.

## Cron Job

- **Route**: `POST /api/cron/expire-memberships` (new file `backend/app/api/cron/expire-memberships/route.ts`).
- **Schedule**: `vercel.json` — `{ "crons": [{ "path": "/api/cron/expire-memberships", "schedule": "5 17 * * *" }] }` (17:05 UTC = 00:05 WIB).
- **Auth**: the route requires header `Authorization: Bearer ${CRON_SECRET}` matching the `CRON_SECRET` env var; any mismatch returns 401. `CRON_SECRET` is a new required env var (documented in `.env.local.example` and `README.md`).
- **Logic**: single batch update —
  ```sql
  update public.users
  set tier = 'free', expires_at = null
  where expires_at is not null and expires_at < now() and tier != 'free';
  ```
- **Response**: `{ expired_count: <rows affected> }` for observability in Vercel's cron logs.

## Error Handling

- Cron route: wrap the update in a try/catch; on DB error, return 500 and log — Vercel Cron does not auto-retry, so a failure is caught next day's run (acceptable for this use case; no user-facing impact from a one-day-late expiry).
- `calculateNewExpiry`: plan codes not present in `lib/pricing.ts` throw — this indicates a data bug (bad webhook payload) and should surface as a 500 in the webhook handler rather than silently defaulting, consistent with existing webhook error handling.

## Testing

- Unit tests for `calculateNewExpiry` covering: renew before expiry (stacking), renew after expiry (from now), upgrade mid-cycle (proration), downgrade mid-cycle (proration), buy lifetime from any state, first purchase from free.
- Route test for `/api/cron/expire-memberships`: seeded user with past `expires_at` gets reset; seeded user with future `expires_at` is untouched; request without valid `CRON_SECRET` gets 401.
- Existing webhook tests updated to assert `expires_at` is set correctly alongside `tier`.
