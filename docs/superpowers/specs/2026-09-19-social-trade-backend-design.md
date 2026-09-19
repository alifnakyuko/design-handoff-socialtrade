# Social Trade Backend — Design Spec

Date: 2026-09-19
Source: `README.md` (design handoff), `Admin.dc.html`, `Prototype Login Video Artikel Bayar.dc.html`, `Landing Page v2.dc.html` in this bundle.

## Purpose

The design handoff bundle contains hifi HTML mockups for the Social Trade member platform (landing site, member web app, admin panel), with all "backend" behavior simulated via local component state. This spec defines the real backend to implement: auth, membership tiers, content catalog, checkout/payments, promo codes, and content-push notifications.

This is a **standalone system**, independent from the existing `bot-admin` (Telegram registration bot) and `bot-saham` (stock screener bot) in sibling project folders. No data or code sharing with those bots in this phase.

## Stack

- **Runtime/API**: Next.js (App Router) Route Handlers, TypeScript. No separate API service — this repo is the backend now and can host the rebuilt frontend later.
- **Database + Auth**: Supabase (Postgres, built-in email/password auth, Row Level Security, Storage for future images).
- **Payments**: Midtrans Snap (Indonesian market — bank transfer/VA, e-wallets, cards, QRIS).
- **Email**: Resend (password reset via Supabase Auth's native flow; content-push notifications via a custom send on admin publish actions).
- **Hosting**: Vercel (pairs with Next.js + Supabase).

## Data Model

All tables live in Supabase Postgres. `auth.users` is Supabase's built-in auth table; `public.users` extends it 1:1.

```sql
-- Extends Supabase auth.users
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  tier text not null default 'free'
    check (tier in ('free','silver','gold','platinum','lifetime')),
  is_admin boolean not null default false,
  referred_by text,              -- promo code used at signup/first checkout, if any
  created_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('watchlist','video','article')),
  title text not null,
  required_tier text not null
    check (required_tier in ('free','silver','gold','platinum','lifetime')),
  payload jsonb not null,        -- type-specific fields, see "Payload shapes" below
  published_at timestamptz not null default now(),
  created_by uuid not null references public.users(id)
);

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent int not null check (percent between 1 and 100),
  active boolean not null default true,
  expires_at date not null,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  plan text not null check (plan in ('silver','gold','platinum','lifetime')),
  base_amount int not null,       -- in IDR, before discount
  promo_code text references public.promo_codes(code),
  final_amount int not null,
  status text not null default 'pending'
    check (status in ('pending','paid','failed','expired')),
  midtrans_order_id text not null unique,
  midtrans_transaction_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table public.push_history (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid references public.content_items(id),
  type text not null check (type in ('watchlist','article','promo')),
  title text not null,
  pushed_by uuid not null references public.users(id),
  pushed_at timestamptz not null default now(),
  notified_count int not null default 0   -- how many members were emailed
);
```

**Payload shapes** (stored in `content_items.payload`, matching the mockup fields):
- `watchlist`: `{ ticker, company_name, price, analysis_note }`
- `video`: `{ video_url, duration, description }`
- `article`: `{ excerpt, body }`

**Tier rank** (used for gating, mirrors the mockup's numeric rank): `free=0, silver=1, gold=2, platinum=3, lifetime=4`. Content is visible in full when `user.tier rank >= content.required_tier rank`.

## Auth & Membership

- Signup/login via Supabase Auth (email/password), matching the mockup's Login/Signup screens. On signup, insert a matching `public.users` row with `tier='free'`.
- "Lupa password?" uses Supabase Auth's native password-reset email flow (real email via Resend/Supabase SMTP), replacing the mockup's fake "reset link sent" message.
- Membership tier is **never set by the client**. It only changes via the payment webhook (see Checkout below) or an admin override endpoint (for manual/comp upgrades, e.g. mirroring `bot-admin`'s manual-approval pattern if ever needed).
- Row Level Security: members can read their own `public.users` row and any `content_items` row; the API layer (not raw client queries) enforces payload redaction for locked content (see below) since RLS alone can't easily do field-level redaction.

## Content Catalog & Locking

- `GET /api/content?type=video|article|watchlist` returns all items, but for any item where the requesting user's tier rank is below `required_tier`, the response omits `payload` and returns only `{ id, type, title, required_tier, locked: true }`. This replaces the mockup's client-side "route to Pricing on click" — the client still does that, but now it's enforced server-side too, not just a UI convenience.
- `GET /api/content/:id` returns 403 if locked, full payload if unlocked.
- Feed for the landing page (public, logged-out) uses the same locked-shape response, always treating the viewer as tier `free`.

## Admin Panel

- All admin routes require `public.users.is_admin = true`, checked server-side (never trust a client flag).
- **Watchlist / Artikel tabs**: `POST /api/admin/content` creates a `content_items` row, then inserts a `push_history` row and triggers `sendContentNotification()` (see Notifications).
- **Kode Promo tab**: `POST /api/admin/promo-codes` (create), `PATCH /api/admin/promo-codes/:id` (toggle active, edit), matching the mockup's add-row/remove-row/save-all UI. No push_history/email entry for promo changes — only watchlist/article pushes generate history+notification per the mockup's "Riwayat konten terkirim" being about content, and promo codes being a separate concern. *(Deviation note: README lists `push_history` as covering all "push" actions broadly, but the mockup's Riwayat list only shows watchlist/article publishes — this spec follows the mockup's actual behavior.)*
- `GET /api/admin/push-history` returns the log, newest first, for the "Riwayat konten terkirim" list.

## Checkout & Payments (Midtrans)

1. Client calls `POST /api/checkout` with `{ plan, promo_code? }`.
2. Server looks up the plan's base price (fixed server-side price table, not client-supplied), validates `promo_code` if given (`active=true`, `expires_at >= today`), computes `final_amount`.
3. Server creates an `orders` row (`status='pending'`) and a Midtrans Snap transaction, returns the Snap redirect/token to the client — this replaces the mockup's instant fake "Success" screen.
4. Midtrans calls `POST /api/webhooks/midtrans` on payment completion. Server verifies the signature (per Midtrans docs), looks up the order by `midtrans_order_id`, and on success: sets `orders.status='paid'`, `paid_at=now()`, and updates `public.users.tier` to the purchased plan (only upgrading, never downgrading, in case of an unlikely lower-tier order after a higher one).
5. Client polls `GET /api/orders/:id` or is redirected back and the page checks order status, to show the mockup's "Success" screen once `status='paid'`.

Promo/referral code validation happens **only** at this step — no more "any non-empty input counts as applied," per the README's explicit correction of the mockup's mock behavior.

## Notifications

- **Password reset**: handled entirely by Supabase Auth's built-in email flow.
- **Content push**: on `POST /api/admin/content` success, `sendContentNotification(item)` queries `public.users` where `tier rank >= item.required_tier rank`, sends a batch email via Resend (title + link to the content), and updates `push_history.notified_count` with the recipient count. This runs synchronously in v1 (acceptable at current scale); can move to a queue later if volume grows.

## Out of Scope (v1)

- Any integration with `bot-admin` / `bot-saham`.
- SMS or push (mobile) notifications — email only.
- Refunds/subscription cancellation flows (not present in the mockups).
- Analytics/reporting beyond the raw `push_history` and `orders` tables.
- Real photography/video assets — placeholders remain, per README's "Assets" section.

## Plan Pricing

Found in `Landing Page v2.dc.html:356-359` (not carried into the README summary). These are the server-side fixed prices `POST /api/checkout` uses — the client never supplies a price.

| Plan | Duration | Strike price (normal) | Active price (checkout uses this) |
|---|---|---|---|
| Silver | 3+1 Bulan | Rp1.888.000 | **Rp1.500.000** |
| Gold | 6+3 Bulan | Rp3.888.000 | **Rp2.600.000** |
| Platinum | 12+6 Bulan | Rp5.888.000 | **Rp4.200.000** |
| Lifetime | Selamanya | Rp8.888.000 | **Rp6.500.000** |

The "strike price" is shown crossed out in the UI as the standing/normal price; the lower number is the currently-active promo price and is what `orders.base_amount` is set to before any promo-code discount is applied. Since the mockup already treats the discounted number as the default/active price (not gated behind entering a promo code), `base_amount` uses this table directly, and a `promo_code` at checkout applies an *additional* percentage discount on top, per the "Terapkan" flow in the Prototype checkout screen.

These numbers are hardcoded confirmations of an existing promotional cycle in the mockup, not a business decision I'm making — flag to the user if the promo period referenced by the countdown timer has since ended and a new price should replace the "strike price" as the new normal price.

## Open Risk / Follow-up

None outstanding — plan pricing (previously open) is now resolved above.
