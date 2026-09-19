# Handoff: Social Trade — Member Platform (Landing, App, Admin)

## Overview
Social Trade is a broadcast-style platform: admins push curated stock watchlists, market analysis, and educational videos/articles to members. Members sign up, get a free tier by default, then pay for Silver/Gold/Platinum/Lifetime to unlock gated content. This bundle covers the marketing site, the member web app, and the internal admin panel.

## About the Design Files
The files in this bundle are **design references built in HTML** (Design Components — a proprietary prototyping format) — they show intended layout, copy, states, and interactions using inline styles and mock/local state. They are **not production code to copy directly**. The task is to **recreate these HTML designs in the target codebase's existing environment** (React, Next.js, Vue, native, etc.) using its established patterns, component library, and libraries — or, if no environment exists yet, choose the most appropriate framework and implement fresh.

## Fidelity
**High-fidelity (hifi)** for visual design (exact colors, type, spacing, copy). **Low-fidelity for backend/data**: all "backend" behavior (login, payment, content push, promo codes) is simulated with local component state and resets on reload — there is no real API, database, or auth. Treat every data flow described below as the spec for what to build, not as working logic to port.

## Screens / Views

### 1. Landing Page (`Landing Page v2.dc.html`)
Marketing site. Sections top to bottom: Nav (logo links home, Tentang/Konten/Paket/FAQ/Kontak anchors, light/dark theme toggle switch, Masuk + Mulai Gratis buttons) → Hero (headline, subhead, CTA buttons, YouTube background video in dark theme only, autoplay/muted/loop, dark overlay gradient `linear-gradient(180deg, rgba(20,20,15,.55), rgba(20,20,15,.75))`) → Content preview strip (2 sample watchlist cards, one shows a "PRO" locked badge) → Credibility badges row (dashed pill chips, each tagged "SOON") → Video teaser (16:9 placeholder + play button overlay) → Member articles grid (3 cards, blurred thumbnail + lock icon overlay + "MEMBER ONLY" badge) → Testimonials grid (3 cards, avatar + quote) → Pricing section (id="paket": countdown timer text, 4 plan cards in a responsive grid, Lifetime is the "PALING POPULER" featured dark card) → Plan comparison table (CSS grid, 5 columns: feature label + Silver/Gold/Platinum/Lifetime, checkmarks/dashes) → Promo/referral banner (code display + "Salin Kode" copy-to-clipboard button, countdown reminder) → Contact & socials (id="kontak": WhatsApp + email links, Stockbit/Telegram/Instagram links with small inline SVG icons) → Footer (logo, copyright, Privasi/Syarat/Kontak links).

Two color themes toggled by a switch in state (not persisted): **Yellow theme** — background `#FFC627` with a subtle dot pattern (`radial-gradient(circle at 1px 1px, rgba(20,20,15,.12) 1.5px, transparent 1.5px) 0 0/18px 18px, #FFC627`), black text/icon. **Dark theme** — background `#14140F`, gold `#FFC627` accents, white text, hero video visible. Default state on load is **yellow theme**.

### 2. Member App Prototype (`Prototype Login Video Artikel Bayar.dc.html`)
Single-file app shell with client-side screen state (no router). Screens: **Login** (email/password, inline validation, "Lupa password?" triggers a mock "reset link sent" message, "Daftar" link) → **Signup** (name/email/password) → **Choose Plan** (shown right after signup — list of 4 plans, clicking one goes to Checkout; links to Kontak first if the user wants to ask questions before buying) → **App shell** (top nav: logo→home, Beranda/Video/Artikel/Upgrade tabs, member tier badge, avatar, Admin link) with sub-screens: **Home** (greeting banner + upgrade CTA if free tier, 2 nav cards to Video/Artikel) → **Video List** (grid of videos, locked ones show required-tier badge and route to Pricing on click) → **Video Player** (large placeholder, play/pause toggle, fake progress bar) → **Article List** (rows with lock badges) → **Article Read** (full body text) → **Pricing** (4 plan cards, "POPULER" badge on Lifetime, selecting goes to Checkout) → **Checkout** (plan summary, promo countdown banner, referral code input + "Terapkan" button with success message, 3 payment method radio rows, "Bayar Sekarang") → **Success** (confirms tier upgrade, back to Home).

**Tier system**: `free < silver < gold < platinum < lifetime` (numeric rank 0–4). Every video/article has a `requiredTier`; content is locked if the user's tier rank is lower. Paying for a plan sets `state.tier` to that plan's tier and unlocks everything at or below that rank.

### 3. Admin Panel (`Admin.dc.html`)
Internal tool, dark header with logo (links to landing page) + "Kembali ke App" link. Three tabs: **Watchlist** (ticker, company name, price, tier-minimum select, analysis note textarea, "Push ke Feed & Kirim Notifikasi" button) → **Artikel** (title, body textarea, tier-minimum select, "Publikasikan & Kirim Notifikasi") → **Kode Promo** (repeatable list of promo codes, each with an active/inactive toggle, code text, discount %, expiry date picker, remove button; "+ Tambah Kode Promo" adds a row; "Simpan Semua" shows a saved confirmation). Below the tabs: a running "Riwayat konten terkirim" (push history) list, newest first.

### 4. Supporting pages
- `Tentang.dc.html` — About page: hero blurb + fade-up entrance animation, then a responsive grid of co-founder cards (photo placeholder, name, role, bio) with staggered fade-up.
- `FAQ.dc.html` — standalone FAQ page, accordion list (click question to expand/collapse; only one open at a time via `openIndex` state).
- `Privasi.dc.html` / `Syarat.dc.html` — static legal placeholder pages (marked in-file as needing legal review before publish).
- `NotFound.dc.html` — generic 404 fallback with a link back to the landing page.

## Interactions & Behavior
- **Theme toggle** (Landing Page): click track toggles `state.theme` between `'yellow'`/`'dark'`; swaps background, text colors, logo asset (black icon on yellow, gold icon on dark), and shows/hides the hero video.
- **Countdown timers** (Landing Page pricing section, Prototype checkout): `setInterval` every 1000ms recomputes `dd/hh/mm/ss` from a fixed end timestamp set in `componentDidMount`.
- **Referral/promo code**: text input + "Terapkan"/apply button sets a `referralApplied`/`referralApplied` boolean and shows a green confirmation line. No real discount math is applied — it's illustrative only. Framed as "enter this code at checkout to claim the crossed-out promo price," not a referral-for-both-parties discount.
- **Copy to clipboard**: "Salin Kode" button calls `navigator.clipboard.writeText`, flips button label to "Disalin!" for 2 seconds via `setTimeout`.
- **Video player mock**: click the big play button toggles `isPlaying`; progress bar width jumps to a fixed 38% when playing (not a real scrubber).
- **Locked content routing**: clicking a locked video/article card navigates straight to the Pricing screen instead of opening the content.
- **Admin push actions**: submitting the watchlist/article form prepends a new entry to `history` (typeLabel, title, "Baru saja") and clears the form fields. No real feed/notification is sent.
- **FAQ accordion**: clicking a question toggles `openIndex`; only one FAQ open at a time.
- **Forgot password**: clicking the link with a non-empty email sets `forgotSent = true` and shows a mock "reset link sent to {email}" message — no email is actually sent.

## State Management (per screen, to reimplement with real state/data)
- **Auth/session**: current user, email, tier — currently local-only, resets every reload. Needs real auth (email/password or OAuth) plus persisted session.
- **Membership tier**: needs to live server-side, driven by successful payment webhook/confirmation, not just a client `setState` after clicking "Bayar Sekarang".
- **Content catalog** (`videosRaw`, `articlesRaw` in the Prototype file): hardcoded arrays with `id, title, requiredTier, duration/excerpt, body/desc, imgId`. Should become a real content table the Admin panel writes to and the app reads from.
- **Promo codes** (`Admin.dc.html` `state.promos`): array of `{id, active, code, percent, until}`. Needs a real table + validation against the entered code at checkout (active flag, expiry date, discount %) instead of the current "any non-empty input counts as applied" mock.
- **Push history**: currently a client array prepended to on submit; should be a persisted content/audit log, and "Kirim Notifikasi" should trigger a real push/email notification job.

## Design Tokens
- **Font**: Sora (Google Fonts), weights 400/500/600/700/800. Loaded via `<link>` in `<helmet>`.
- **Colors**: 
  - Accent gold: `#FFC627`
  - Accent pale (chips/badges bg): `#FFF3D0`
  - Dark ink/background: `#14140F` (also `#1A1A1A` used in a couple of older sections — treat `#14140F` as canonical)
  - Dark surface (cards on dark bg): `#1D1D16`, border `#2C2C22`
  - Warm cream background (Prototype app / older screens): `#FDFBF3`
  - Body copy on light: `#4A473C`; muted/secondary: `#8A8474` / `#6B6B5F`
  - Borders on light: `#ECE7D6` / `#E5E0D0`
  - Success green: `#1A9E5C` / `#4ADE80` (price-up)
  - Error red: `#E0483E`
- **Border radius scale**: 5px (small badges) · 8–10px (buttons/inputs) · 12–16px (cards) · 18–20px (large panels/hero cards) · full (pills, avatars, toggle knobs).
- **Shadows**: cards use soft large shadows sparingly, e.g. `0 20px 50px rgba(26,20,0,0.06)` on login/signup cards, `0 30px 70px rgba(26,20,0,0.09)` on the old hero preview card.
- **Type scale** (approx, px): 56 hero headline → 34 section headline (clamps down to 24 on narrow viewports via `clamp(24px,4vw,34px)`) → 22–24 card/dialog headline → 15–16 body → 12.5–13.5 secondary/meta → 10–11 micro badges.
- **Spacing**: section vertical padding typically 60–90px desktop; card padding 18–28px; gaps mostly 8/10/12/14/16/20/24px.

## Assets
- `assets/st-icon-yellow.png` — gold Social Trade "ST" mark, used on dark backgrounds (nav/footer/admin header when theme is dark).
- `assets/st-icon-black.png` — black version of the same mark, used on light/yellow backgrounds.
- Everything else is a placeholder: `<image-slot>` elements (drag-and-drop image placeholders) for testimonial photos, co-founder photos, article/video thumbnails — these need real photography/screenshots before launch.
- Social icons (Stockbit/Telegram/Instagram) are hand-drawn generic inline SVGs, not the platforms' official logo marks — swap for real brand assets if required by their brand guidelines.
- Hero background video is a placeholder YouTube embed (id extracted from a pasted YouTube URL) — replace with final brand video, ideally self-hosted `<video>` for reliability instead of a YouTube iframe.

## Files
- `Landing Page v2.dc.html` — marketing/landing site (all sections above)
- `Prototype Login Video Artikel Bayar.dc.html` — member web app (login → app shell → all sub-screens)
- `Admin.dc.html` — internal admin panel (push content, manage promo codes, view push history)
- `Tentang.dc.html` — About/co-founders page
- `FAQ.dc.html` — FAQ page
- `Privasi.dc.html`, `Syarat.dc.html` — legal placeholder pages
- `NotFound.dc.html` — 404 fallback
- `assets/` — logo mark assets (yellow + black variants)

## Not Included / Explicitly Out of Scope Here
No backend, database, auth provider, payment gateway integration, email/notification service, or CMS exists anywhere in this bundle — every "save," "push," "pay," or "send" action is a local UI state change for demonstration only. All of that needs to be designed and implemented from scratch against this spec.
