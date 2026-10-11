# Member-facing frontend — design spec

## Context

The backend (Next.js API routes under `backend/app/api/`) is fully built and deployed: signup, Midtrans checkout + webhook, membership tiers, content gating, cron jobs, YouTube-based video playback. No frontend pages exist yet — `backend/app/` only contains `app/api/`.

Static design references exist as `.dc.html` files (exported from Claude Design, a design-prototyping tool — not functional code) in the repo root and in a fresher export (`SocialTrade UI mockups.zip`) that also contains `BACKEND_BRIEF.md`, the original spec the backend was built against, plus two new pages (`Buka Rekening.dc.html`, `Event.dc.html`) not yet in the repo.

`Prototype Login Video Artikel Bayar.dc.html` contains 12 marked screens covering the entire member journey: LOGIN, SIGNUP, PILIH PAKET, APP SHELL, HOME, VIDEO LIST, VIDEO PLAYER, ARTICLE LIST, ARTICLE READ, PRICING, CHECKOUT, SUCCESS.

## Scope

**In scope (this spec):** the member-facing flow — the 12 screens above, using `Landing Page v3.dc.html` as the landing page reference. Watchlist content (stock picks with ticker/entry/TP/SL — see `BACKEND_BRIEF.md`) reuses the Article List/Read UI with a different label, rather than getting its own screen design.

**Out of scope (future phases, explicitly deferred):**
- Admin panel (content publish, member management, promo codes) — the admin API routes already exist; no UI yet.
- `Buka Rekening.dc.html` (open brokerage account) and `Event.dc.html` — separate features, not part of the member flow.
- Custom domain (still using the `.vercel.app` URL per an earlier decision this session).

## Pages and routes

All pages live in `backend/app/` (same Next.js project as the API — no separate repo/deploy).

| Route | Screen | Auth required |
|---|---|---|
| `/` | Landing page (from `Landing Page v3.dc.html`) | No |
| `/login` | Login | No |
| `/signup` | Signup | No |
| `/pilih-paket` | Plan selection (shown once right after signup) | Yes |
| `/` (inside member layout) | Home | Yes |
| `/videos` | Video list | Yes |
| `/videos/[id]` | Video player | Yes |
| `/articles` | Article list (also renders watchlist items) | Yes |
| `/articles/[id]` | Article read (also renders watchlist detail) | Yes |
| `/pricing` | Pricing / plan comparison | Yes |
| `/checkout` | Checkout | Yes |
| `/checkout/success` | Payment success | Yes |

A Next.js layout wraps every authenticated route: it checks the Supabase session server-side and redirects to `/login` if there is none, before the page itself renders. This is the single place "must be logged in" is enforced for pages (API routes already enforce it independently via `getCurrentUser`).

## Visual approach

Pages are rebuilt as ordinary React components styled with Tailwind CSS, using the `.dc.html` mockups (`Landing Page v3.dc.html` for landing, the 12-screen prototype for everything else) as a close visual reference for layout, colors, typography, and component shapes — not a literal line-by-line port of their inline styles or `{{ }}` / `sc-if` templating syntax, which is specific to the design tool and not meant to run as-is.

Brand assets (`assets/st-icon-*.png`, `assets/st-logo-*.png`) and the two custom fonts/colors visible in the mockups carry over directly.

## Data flow

Every page talks to the existing backend API — no new routes, no schema changes. Examples:
- Signup form → `POST /api/auth/signup`
- Login form → Supabase client-side `signInWithPassword` (sets the session cookie the API routes already read via `createServerSupabase()`)
- Plan selection / Pricing → `GET /api/plans`
- Video/Article list & detail → `GET /api/content` family of routes (exact routes to be confirmed against current implementation during planning — some route shapes differ slightly from `BACKEND_BRIEF.md`'s original sketch)
- Video player → `GET /api/videos/:id/play` (returns the YouTube embed URL)
- Checkout → `POST /api/promo/validate` (optional) then `POST /api/checkout`, redirecting to the Midtrans Snap payment page
- Success page → confirms via `GET /api/orders` or a query param from the Midtrans redirect

## Error handling

- Wrong email/password on login: inline error message, no redirect.
- Invalid/expired/inapplicable promo code: inline message on checkout, price stays at full amount.
- Payment failed or cancelled: return to `/pricing` with a message; user can retry.
- Viewing content above the user's tier: a dedicated "upgrade your plan" state with a CTA to `/pricing`, not a generic error.
- Visiting any authenticated route while logged out: redirect to `/login`.

## Testing approach

Manual, browser-driven testing against the real Supabase project (sandbox Midtrans credentials), mirroring how the backend API was verified earlier this session: create a disposable test user, exercise the flow (signup → pick a plan → checkout → simulate/complete payment → confirm access), then delete the test data. No new automated test infrastructure is being introduced for pages in this phase; the backend's existing Vitest suite is untouched.

## Open questions for the implementation plan

- The exact current shape of the content-listing API routes (`GET /api/content`, etc.) should be re-confirmed against `backend/app/api/content/` during planning, since `BACKEND_BRIEF.md` predates some implementation decisions (e.g. the unified `content_items` table).
- Whether `/pilih-paket` is a distinct route or a modal/step shown inline right after signup is an implementation detail to settle during planning — functionally it must appear exactly once, right after a successful signup, before the user reaches Home.
