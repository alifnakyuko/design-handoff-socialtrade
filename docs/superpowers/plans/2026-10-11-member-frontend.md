# Member-Facing Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 10 member-facing pages (landing through checkout success) as real Next.js pages in `backend/app/`, wired to the existing backend API, styled with Tailwind CSS using the `.dc.html` mockups as a close visual reference.

**Architecture:** Pages live in the same Next.js project as the API (`backend/`). An authenticated route group `(member)` has one layout that checks the Supabase session server-side and redirects to `/login` if absent. Client Components call the existing API routes with `fetch()` (same-origin, so the session cookie rides along automatically) through a small typed `lib/api-client.ts` wrapper. Login/signup use the Supabase browser client directly so the session cookie format matches what the backend's `createServerSupabase()` already reads.

**Tech Stack:** Next.js 14 App Router (already in use), React, Tailwind CSS (new), `@supabase/ssr` browser client (new file, library already a dependency), existing backend API — no new backend routes, no schema changes except one small addition to `createCheckout`'s Midtrans call (a finish-redirect URL) needed for the Success page to be reachable.

**Spec:** `docs/superpowers/specs/2026-10-11-member-frontend-design.md`

## Global Constraints

- No new backend API routes or database schema changes. Pages consume what already exists (`GET /api/plans`, `GET /api/me`, `GET /api/content`, `GET /api/content/:id`, `GET /api/videos/:id/play`, `POST /api/promo/validate`, `POST /api/checkout`, `POST /api/auth/signup`).
- Visual reference only — colors `#14140F` (near-black text), `#FFC627` (gold accent), `#FBFAF5`/`#ECE7D6` (cream backgrounds), `#5E5A4C` (muted text), `#8A6400` (gold hover/dark variant); font **Sora** (Google Fonts, weights 400–800). Not a pixel-perfect port of the `.dc.html` inline styles.
- No new automated test infrastructure for pages. Each task is verified by running the dev server and exercising the page in a browser (per the spec's testing approach), the same way the backend API was verified earlier this session.
- Out of scope: admin panel, `Buka Rekening`, `Event` pages, custom domain.
- Route `/home` (not `/`) hosts the member Home screen, since `/` is the public landing page — this resolves the ambiguity the spec flagged.

## Review Focus

- **Submitting the checkout form with no plan selected or an unknown plan code** (e.g. a stale/bookmarked `/checkout?plan=bronze`): the page must show a clear "plan not found" state instead of calling the API with garbage or crashing on `undefined`. Covered in Task 8.
- **Viewing `/videos/[id]` or `/articles/[id]` for an id that exists but is above the viewer's tier**: must render the "upgrade your plan" state (reusing the 403 from `getContentById`), not a blank page or thrown error. Covered in Tasks 6 and 7.
- **Signing up with an email that already has an account** (`POST /api/auth/signup` returns `{error: ...}` with 400 per `lib/signup.ts`): the signup form must show that error inline, not silently fail or redirect anyway. Covered in Task 2.
- **Landing on `/checkout/success` directly without ever paying** (no `order_id` query param, e.g. someone bookmarks or guesses the URL): must show a generic confirmation without claiming a specific order succeeded. Covered in Task 9.
- **The member layout's auth check running for a user whose session cookie exists but is stale/invalid** (e.g. deleted user, expired refresh token): `getCurrentUser` already returns `null` in this case (see `lib/current-user.ts:15`), so the redirect-to-`/login` path must be exercised, not assumed. Covered in Task 3.

---

## Task 0: Tailwind setup and shared app shell

**Files:**
- Create: `backend/tailwind.config.ts`
- Create: `backend/postcss.config.js`
- Create: `backend/app/globals.css`
- Create: `backend/app/layout.tsx`
- Modify: `backend/package.json` (add `tailwindcss`, `postcss`, `autoprefixer` to devDependencies)

**Interfaces:**
- Produces: the `brand-gold`, `brand-dark`, `brand-cream`, `brand-cream-dark`, `brand-muted`, `brand-gold-dark` Tailwind color tokens every later page uses; the `font-sans` override to Sora; the root `<html>`/`<body>` wrapper every page renders inside.

- [ ] **Step 1: Install Tailwind**

```bash
cd backend && npm install -D tailwindcss postcss autoprefixer
```

- [ ] **Step 2: Create the Tailwind config**

```typescript
// backend/tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-dark': '#14140F',
        'brand-gold': '#FFC627',
        'brand-gold-dark': '#8A6400',
        'brand-cream': '#FBFAF5',
        'brand-cream-dark': '#ECE7D6',
        'brand-muted': '#5E5A4C',
      },
      fontFamily: {
        sans: ['Sora', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Create the PostCSS config**

```javascript
// backend/postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create the global stylesheet**

```css
/* backend/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #fbfaf5;
  color: #14140f;
}
```

- [ ] **Step 5: Create the root layout**

```tsx
// backend/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Social Trade',
  description: 'Membership investor saham Indonesia',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Verify the dev server starts with Tailwind active**

Run: `cd backend && npm run dev`, then in another terminal: `curl -s http://localhost:3000/ | head -c 200`
Expected: a 404 page renders (no page at `/` yet, added in Task 1) but with no build errors in the dev server log — confirms Tailwind/PostCSS compiled successfully. Stop the dev server after checking (`pkill -f "next dev"`).

- [ ] **Step 7: Commit**

```bash
git add backend/tailwind.config.ts backend/postcss.config.js backend/app/globals.css backend/app/layout.tsx backend/package.json backend/package-lock.json
git commit -m "feat: add Tailwind CSS and root layout for member frontend"
```

---

## Task 1: Supabase browser client and typed API client

**Files:**
- Create: `backend/lib/supabase/browser.ts`
- Create: `backend/lib/api-client.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already set in `.env.local` and Vercel).
- Produces: `createBrowserSupabase(): SupabaseClient` for login/signup/logout. `apiClient` object with methods `getPlans()`, `getMe()`, `listContent(type?)`, `getContentById(id)`, `getVideoPlayUrl(id)`, `validatePromo(code, plan)`, `checkout(plan, promoCode?)`, `signup(email, password, name)` — every later page task imports from this file, using exactly these names and return shapes.

- [ ] **Step 1: Create the browser Supabase client**

```typescript
// backend/lib/supabase/browser.ts
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createBrowserSupabase(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as unknown as SupabaseClient;
}
```

- [ ] **Step 2: Create the typed API client**

```typescript
// backend/lib/api-client.ts
export type Plan = {
  code: 'silver' | 'gold' | 'platinum' | 'lifetime';
  name: string;
  tierLevel: number;
  price: number;
  strikePrice: number | null;
  durationDays: number | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  tier: 'free' | 'silver' | 'gold' | 'platinum' | 'lifetime';
  expiresAt: string | null;
  isAdmin: boolean;
};

export type ContentListItem =
  | {
      id: string;
      type: 'watchlist' | 'video' | 'article';
      title: string;
      required_tier: string;
      locked: false;
      payload: Record<string, unknown>;
      published_at: string;
    }
  | { id: string; type: 'watchlist' | 'video' | 'article'; title: string; required_tier: string; locked: true };

export type ContentDetail = {
  id: string;
  type: 'watchlist' | 'video' | 'article';
  title: string;
  required_tier: string;
  payload: Record<string, unknown>;
  published_at: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`);
  }
  return body as T;
}

export const apiClient = {
  async getPlans(): Promise<Plan[]> {
    const res = await fetch('/api/plans');
    const body = await parseJson<{ plans: Plan[] }>(res);
    return body.plans;
  },

  async getMe(): Promise<CurrentUser | null> {
    const res = await fetch('/api/me');
    if (res.status === 401) return null;
    return parseJson<CurrentUser>(res);
  },

  async listContent(type?: 'watchlist' | 'video' | 'article'): Promise<ContentListItem[]> {
    const qs = type ? `?type=${type}` : '';
    const res = await fetch(`/api/content${qs}`);
    const body = await parseJson<{ items: ContentListItem[] }>(res);
    return body.items;
  },

  async getContentById(id: string): Promise<{ status: 'ok'; item: ContentDetail } | { status: 'locked' } | { status: 'not_found' }> {
    const res = await fetch(`/api/content/${id}`);
    if (res.status === 404) return { status: 'not_found' };
    if (res.status === 403) return { status: 'locked' };
    const body = await parseJson<{ item: ContentDetail }>(res);
    return { status: 'ok', item: body.item };
  },

  async getVideoPlayUrl(id: string): Promise<{ status: 'ok'; url: string } | { status: 'locked' } | { status: 'not_found' }> {
    const res = await fetch(`/api/videos/${id}/play`);
    if (res.status === 404) return { status: 'not_found' };
    if (res.status === 403) return { status: 'locked' };
    const body = await parseJson<{ url: string }>(res);
    return { status: 'ok', url: body.url };
  },

  async validatePromo(
    code: string,
    plan: Plan['code']
  ): Promise<{ valid: true; discountPct: number; finalPrice: number } | { valid: false }> {
    const res = await fetch('/api/promo/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, plan }),
    });
    return parseJson(res);
  },

  async checkout(
    plan: Plan['code'],
    promoCode?: string
  ): Promise<{ status: 'ok'; orderId: string; token: string; redirectUrl: string } | { status: 'invalid_promo' }> {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, promoCode }),
    });
    if (res.status === 400) {
      const body = await res.json();
      if (body?.error?.includes('promo')) return { status: 'invalid_promo' };
      throw new Error(body?.error ?? 'Checkout failed');
    }
    return parseJson(res);
  },

  async signup(email: string, password: string, name: string): Promise<{ userId: string }> {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    return parseJson(res);
  },
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors referencing `lib/api-client.ts` or `lib/supabase/browser.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/lib/supabase/browser.ts backend/lib/api-client.ts
git commit -m "feat: add browser Supabase client and typed API client for frontend pages"
```

---

## Task 2: Landing, Signup, and Login pages

**Files:**
- Create: `backend/app/page.tsx` (Landing)
- Create: `backend/app/signup/page.tsx`
- Create: `backend/app/login/page.tsx`

**Interfaces:**
- Consumes: `apiClient.signup` (Task 1), `createBrowserSupabase` (Task 1).
- Produces: nothing later tasks import directly — these are leaf pages — but Task 3's member layout assumes an unauthenticated visitor lands on `/login`, which these pages must redirect to after signup.

- [ ] **Step 1: Create the landing page**

```tsx
// backend/app/page.tsx
import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-brand-cream">
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-6 py-5">
        <span className="font-extrabold text-lg text-brand-dark">Social Trade</span>
        <div className="flex gap-3">
          <Link href="/login" className="px-4 py-2 text-sm font-semibold text-brand-dark hover:text-brand-gold-dark">
            Masuk
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 text-sm font-semibold bg-brand-gold text-brand-dark rounded-full hover:bg-brand-gold-dark hover:text-white"
          >
            Daftar
          </Link>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-brand-dark leading-tight">
          Rekomendasi saham, artikel, dan kelas video dari Social Trade
        </h1>
        <p className="mt-4 text-brand-muted text-lg max-w-2xl mx-auto">
          Akses watchlist harian, analisis mendalam, dan kelas rekaman sesuai paket membership Anda.
        </p>
        <Link
          href="/signup"
          className="inline-block mt-8 px-8 py-3 bg-brand-gold text-brand-dark font-bold rounded-full hover:bg-brand-gold-dark hover:text-white"
        >
          Mulai Sekarang
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Create the signup page**

```tsx
// backend/app/signup/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiClient.signup(email, password, name);
      const supabase = createBrowserSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.push('/pilih-paket');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftar');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-brand-cream flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-brand-dark mb-6">Daftar Akun</h1>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <label className="block text-sm font-semibold text-brand-dark mb-1">Nama</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />
        <label className="block text-sm font-semibold text-brand-dark mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />
        <label className="block text-sm font-semibold text-brand-dark mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full mb-6 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-brand-gold text-brand-dark font-bold rounded-full disabled:opacity-50"
        >
          {loading ? 'Memproses...' : 'Daftar'}
        </button>
        <p className="mt-4 text-sm text-brand-muted text-center">
          Sudah punya akun?{' '}
          <Link href="/login" className="text-brand-gold-dark font-semibold">
            Masuk
          </Link>
        </p>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create the login page**

```tsx
// backend/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createBrowserSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError('Email atau password salah');
      setLoading(false);
      return;
    }
    router.push('/home');
  }

  return (
    <main className="min-h-screen bg-brand-cream flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-brand-dark mb-6">Masuk</h1>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <label className="block text-sm font-semibold text-brand-dark mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />
        <label className="block text-sm font-semibold text-brand-dark mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full mb-6 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-brand-gold text-brand-dark font-bold rounded-full disabled:opacity-50"
        >
          {loading ? 'Memproses...' : 'Masuk'}
        </button>
        <p className="mt-4 text-sm text-brand-muted text-center">
          Belum punya akun?{' '}
          <Link href="/signup" className="text-brand-gold-dark font-semibold">
            Daftar
          </Link>
        </p>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `cd backend && npm run dev`. In a browser, open `http://localhost:3000/` (landing renders with "Mulai Sekarang" button), click through to `/signup`, submit the form with a fresh test email (e.g. `plan-test@socialtrade.test`, password `TestPassword123!`, name `Plan Test`) — expect a redirect to `/pilih-paket` (404 is fine for now, created in Task 4). Then open `/login` in a new private window and log in with the same credentials — expect a redirect to `/home` (404 is fine for now, created in Task 3). Try `/signup` again with the same email — expect the inline error message, not a silent failure. Stop the dev server (`pkill -f "next dev"`).

Clean up the test user afterward via the Supabase MCP `execute_sql` tool: `delete from public.users where email = 'plan-test@socialtrade.test';` (and the matching `auth.users` row is cleaned up automatically by the `on delete cascade`/FK relationship already relied on elsewhere in this codebase — if it is not, delete it explicitly from `auth.users` too).

- [ ] **Step 5: Commit**

```bash
git add backend/app/page.tsx backend/app/signup/page.tsx backend/app/login/page.tsx
git commit -m "feat: add landing, signup, and login pages"
```

---

## Task 3: Member layout (auth gate + nav) and Home page

**Files:**
- Create: `backend/app/(member)/layout.tsx`
- Create: `backend/components/MemberNav.tsx`
- Create: `backend/app/(member)/home/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` + `createServerSupabase` (existing, `backend/lib/current-user.ts` and `backend/lib/supabase/server.ts`), `createBrowserSupabase` (Task 1), `apiClient.getMe` (Task 1).
- Produces: every later member-area task (4–9) lives under `app/(member)/` and is automatically wrapped by this layout — no later task re-implements the auth check.

- [ ] **Step 1: Create the member nav component**

```tsx
// backend/components/MemberNav.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';

const LINKS = [
  { href: '/home', label: 'Home' },
  { href: '/videos', label: 'Video' },
  { href: '/articles', label: 'Artikel & Watchlist' },
  { href: '/pricing', label: 'Pricing' },
];

export function MemberNav() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <nav className="bg-brand-dark text-brand-cream px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-extrabold">Social Trade</span>
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm font-semibold hover:text-brand-gold">
            {link.label}
          </Link>
        ))}
      </div>
      <button onClick={handleLogout} className="text-sm font-semibold hover:text-brand-gold">
        Keluar
      </button>
    </nav>
  );
}
```

- [ ] **Step 2: Create the member layout**

```tsx
// backend/app/(member)/layout.tsx
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { MemberNav } from '@/components/MemberNav';

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-brand-cream">
      <MemberNav />
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Create the Home page**

```tsx
// backend/app/(member)/home/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient, type CurrentUser } from '@/lib/api-client';

const TIER_LABEL: Record<CurrentUser['tier'], string> = {
  free: 'Gratis',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  lifetime: 'Lifetime',
};

export default function HomePage() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    apiClient.getMe().then(setUser);
  }, []);

  if (!user) return <p className="text-brand-muted">Memuat...</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Halo, {user.name}</h1>
      <p className="mt-2 text-brand-muted">
        Paket Anda: <span className="font-semibold text-brand-dark">{TIER_LABEL[user.tier]}</span>
        {user.expiresAt && <> — berlaku sampai {new Date(user.expiresAt).toLocaleDateString('id-ID')}</>}
      </p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/videos" className="block p-6 bg-white rounded-2xl shadow-sm hover:shadow-md">
          <h2 className="font-bold text-brand-dark">Video Kelas</h2>
          <p className="text-sm text-brand-muted mt-1">Tonton rekaman kelas sesuai paket Anda.</p>
        </Link>
        <Link href="/articles" className="block p-6 bg-white rounded-2xl shadow-sm hover:shadow-md">
          <h2 className="font-bold text-brand-dark">Artikel & Watchlist</h2>
          <p className="text-sm text-brand-muted mt-1">Analisis dan rekomendasi saham terbaru.</p>
        </Link>
        <Link href="/pricing" className="block p-6 bg-white rounded-2xl shadow-sm hover:shadow-md">
          <h2 className="font-bold text-brand-dark">Upgrade Paket</h2>
          <p className="text-sm text-brand-muted mt-1">Lihat paket yang tersedia.</p>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification — the auth gate itself**

Run: `cd backend && npm run dev`. In a private/incognito browser window (no session), open `http://localhost:3000/home` directly — expect an immediate redirect to `/login`. Then log in (using the test user created in Task 2's verification, or a fresh one) and open `/home` again — expect the page to render with the user's name and tier. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add "backend/app/(member)/layout.tsx" backend/components/MemberNav.tsx "backend/app/(member)/home/page.tsx"
git commit -m "feat: add member layout with auth gate, nav, and Home page"
```

---

## Task 4: Shared PlanList component and Pilih Paket page

**Files:**
- Create: `backend/components/PlanList.tsx`
- Create: `backend/app/(member)/pilih-paket/page.tsx`

**Interfaces:**
- Consumes: `apiClient.getPlans` (Task 1).
- Produces: `PlanList` component, reused as-is by Task 5's Pricing page — `<PlanList onSelect={(planCode) => void}>`.

- [ ] **Step 1: Create the shared PlanList component**

```tsx
// backend/components/PlanList.tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient, type Plan } from '@/lib/api-client';

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    amount
  );
}

export function PlanList({ onSelect }: { onSelect: (planCode: Plan['code']) => void }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    apiClient.getPlans().then(setPlans);
  }, []);

  if (!plans) return <p className="text-brand-muted">Memuat paket...</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {plans.map((plan) => (
        <div key={plan.code} className="p-6 bg-white rounded-2xl shadow-sm flex flex-col">
          <h3 className="font-bold text-brand-dark text-lg">{plan.name}</h3>
          <p className="mt-2 text-2xl font-extrabold text-brand-dark">{formatRupiah(plan.price)}</p>
          <p className="text-sm text-brand-muted mt-1">
            {plan.durationDays ? `${plan.durationDays} hari` : 'Tanpa batas waktu'}
          </p>
          <button
            onClick={() => onSelect(plan.code)}
            className="mt-6 py-2 bg-brand-gold text-brand-dark font-bold rounded-full hover:bg-brand-gold-dark hover:text-white"
          >
            Pilih {plan.name}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the Pilih Paket page**

```tsx
// backend/app/(member)/pilih-paket/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { PlanList } from '@/components/PlanList';
import type { Plan } from '@/lib/api-client';

export default function PilihPaketPage() {
  const router = useRouter();

  function handleSelect(planCode: Plan['code']) {
    router.push(`/checkout?plan=${planCode}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Pilih Paket Anda</h1>
      <p className="mt-2 text-brand-muted">Pilih paket membership yang sesuai untuk mulai akses konten.</p>
      <div className="mt-8">
        <PlanList onSelect={handleSelect} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `cd backend && npm run dev`. Log in as a test user, open `/pilih-paket` — expect 4 plan cards (Silver/Gold/Platinum/Lifetime) with correct prices from `GET /api/plans`. Click "Pilih Silver" — expect navigation to `/checkout?plan=silver` (404 is fine for now, created in Task 8). Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add backend/components/PlanList.tsx "backend/app/(member)/pilih-paket/page.tsx"
git commit -m "feat: add PlanList component and Pilih Paket page"
```

---

## Task 5: Pricing page

**Files:**
- Create: `backend/app/(member)/pricing/page.tsx`

**Interfaces:**
- Consumes: `PlanList` (Task 4).
- Produces: a `?checkout=cancelled` query param contract that Task 9's Midtrans error/unfinish redirect relies on to show the "payment failed/cancelled" message required by the spec's Error Handling section.

- [ ] **Step 1: Create the Pricing page**

```tsx
// backend/app/(member)/pricing/page.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PlanList } from '@/components/PlanList';
import type { Plan } from '@/lib/api-client';

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('checkout') === 'cancelled';

  function handleSelect(planCode: Plan['code']) {
    router.push(`/checkout?plan=${planCode}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Paket Membership</h1>
      <p className="mt-2 text-brand-muted">Upgrade kapan saja untuk akses lebih banyak konten.</p>
      {cancelled && (
        <p className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
          Pembayaran gagal atau dibatalkan. Silakan coba lagi.
        </p>
      )}
      <div className="mt-8">
        <PlanList onSelect={handleSelect} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `cd backend && npm run dev`. Log in, open `/pricing` from the nav bar — expect the same 4 plan cards as `/pilih-paket`, no banner. Open `/pricing?checkout=cancelled` — expect the red "Pembayaran gagal atau dibatalkan" banner above the plan cards. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add "backend/app/(member)/pricing/page.tsx"
git commit -m "feat: add Pricing page"
```

---

## Task 6: Video List and Video Player pages

**Files:**
- Create: `backend/components/ContentCard.tsx`
- Create: `backend/components/UpgradeGate.tsx`
- Create: `backend/app/(member)/videos/page.tsx`
- Create: `backend/app/(member)/videos/[id]/page.tsx`

**Interfaces:**
- Consumes: `apiClient.listContent`, `apiClient.getVideoPlayUrl`, `apiClient.getContentById` (Task 1).
- Produces: `ContentCard` and `UpgradeGate`, both reused as-is by Task 7's Article/Watchlist pages.

- [ ] **Step 1: Create the shared ContentCard component**

```tsx
// backend/components/ContentCard.tsx
import Link from 'next/link';
import type { ContentListItem } from '@/lib/api-client';

const TIER_LABEL: Record<string, string> = {
  free: 'Gratis',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  lifetime: 'Lifetime',
};

export function ContentCard({ item, hrefBase }: { item: ContentListItem; hrefBase: string }) {
  if (item.locked) {
    return (
      <div className="p-5 bg-white rounded-2xl shadow-sm opacity-60">
        <h3 className="font-bold text-brand-dark">{item.title}</h3>
        <p className="text-sm text-brand-muted mt-1">
          Perlu paket {TIER_LABEL[item.required_tier] ?? item.required_tier}+
        </p>
      </div>
    );
  }

  return (
    <Link href={`${hrefBase}/${item.id}`} className="block p-5 bg-white rounded-2xl shadow-sm hover:shadow-md">
      <h3 className="font-bold text-brand-dark">{item.title}</h3>
      <p className="text-sm text-brand-muted mt-1">
        {new Date(item.published_at).toLocaleDateString('id-ID')}
      </p>
    </Link>
  );
}
```

- [ ] **Step 2: Create the shared UpgradeGate component**

```tsx
// backend/components/UpgradeGate.tsx
import Link from 'next/link';

export function UpgradeGate() {
  return (
    <div className="p-8 bg-white rounded-2xl shadow-sm text-center">
      <h2 className="text-xl font-bold text-brand-dark">Konten ini terkunci</h2>
      <p className="mt-2 text-brand-muted">Upgrade paket Anda untuk mengakses konten ini.</p>
      <Link
        href="/pricing"
        className="inline-block mt-6 px-6 py-2 bg-brand-gold text-brand-dark font-bold rounded-full hover:bg-brand-gold-dark hover:text-white"
      >
        Lihat Paket
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Create the Video List page**

```tsx
// backend/app/(member)/videos/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient, type ContentListItem } from '@/lib/api-client';
import { ContentCard } from '@/components/ContentCard';

export default function VideoListPage() {
  const [items, setItems] = useState<ContentListItem[] | null>(null);

  useEffect(() => {
    apiClient.listContent('video').then(setItems);
  }, []);

  if (!items) return <p className="text-brand-muted">Memuat...</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Video Kelas</h1>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <ContentCard key={item.id} item={item} hrefBase="/videos" />
        ))}
        {items.length === 0 && <p className="text-brand-muted">Belum ada video.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the Video Player page**

```tsx
// backend/app/(member)/videos/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { UpgradeGate } from '@/components/UpgradeGate';

type PlayState =
  | { status: 'loading' }
  | { status: 'ok'; url: string; title: string }
  | { status: 'locked' }
  | { status: 'not_found' };

export default function VideoPlayerPage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<PlayState>({ status: 'loading' });

  useEffect(() => {
    Promise.all([apiClient.getVideoPlayUrl(params.id), apiClient.getContentById(params.id)]).then(
      ([playResult, contentResult]) => {
        if (playResult.status === 'ok') {
          const title = contentResult.status === 'ok' ? contentResult.item.title : 'Video';
          setState({ status: 'ok', url: playResult.url, title });
        } else {
          setState({ status: playResult.status });
        }
      }
    );
  }, [params.id]);

  if (state.status === 'loading') return <p className="text-brand-muted">Memuat...</p>;
  if (state.status === 'not_found') return <p className="text-brand-muted">Video tidak ditemukan.</p>;
  if (state.status === 'locked') return <UpgradeGate />;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark mb-4">{state.title}</h1>
      <div className="aspect-video bg-black rounded-2xl overflow-hidden">
        <iframe src={state.url} className="w-full h-full" allowFullScreen title={state.title} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Manual verification, including the Review Focus case**

Using the Supabase MCP `execute_sql` tool, insert two test content rows directly (mirroring the pattern used earlier this session):
```sql
insert into public.content_items (id, type, title, required_tier, payload, created_by, published_at)
values
  (gen_random_uuid(), 'video', 'Test Free Video', 'free', '{"provider_asset_id":"dQw4w9WgXcQ"}'::jsonb, (select id from public.users where is_admin=true limit 1), now()),
  (gen_random_uuid(), 'video', 'Test Platinum Video', 'platinum', '{"provider_asset_id":"abc123"}'::jsonb, (select id from public.users where is_admin=true limit 1), now())
returning id, title;
```
Run `cd backend && npm run dev`, log in as a free-tier test user, open `/videos` — expect both cards to show, the Platinum one visually locked (dimmed, no link). Click the free video — expect the YouTube iframe to render. Manually navigate to `/videos/<platinum-video-id>` — expect the `UpgradeGate` component to render (this is the Review Focus case: tier-locked content accessed directly by id). Navigate to `/videos/00000000-0000-0000-0000-000000000000` — expect "Video tidak ditemukan." Stop the dev server, then delete the two test rows: `delete from public.content_items where title in ('Test Free Video', 'Test Platinum Video');`

- [ ] **Step 6: Commit**

```bash
git add backend/components/ContentCard.tsx backend/components/UpgradeGate.tsx "backend/app/(member)/videos"
git commit -m "feat: add Video List and Video Player pages"
```

---

## Task 7: Article/Watchlist List and Read pages

**Files:**
- Create: `backend/app/(member)/articles/page.tsx`
- Create: `backend/app/(member)/articles/[id]/page.tsx`

**Interfaces:**
- Consumes: `apiClient.listContent`, `apiClient.getContentById` (Task 1), `ContentCard`, `UpgradeGate` (Task 6).

- [ ] **Step 1: Create the Article/Watchlist List page**

```tsx
// backend/app/(member)/articles/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient, type ContentListItem } from '@/lib/api-client';
import { ContentCard } from '@/components/ContentCard';

export default function ArticleListPage() {
  const [items, setItems] = useState<ContentListItem[] | null>(null);

  useEffect(() => {
    Promise.all([apiClient.listContent('article'), apiClient.listContent('watchlist')]).then(
      ([articles, watchlists]) => {
        const merged = [...articles, ...watchlists].sort((a, b) => {
          const aDate = 'published_at' in a ? a.published_at : '';
          const bDate = 'published_at' in b ? b.published_at : '';
          return bDate.localeCompare(aDate);
        });
        setItems(merged);
      }
    );
  }, []);

  if (!items) return <p className="text-brand-muted">Memuat...</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Artikel & Watchlist</h1>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <ContentCard key={item.id} item={item} hrefBase="/articles" />
        ))}
        {items.length === 0 && <p className="text-brand-muted">Belum ada artikel atau watchlist.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the Article/Watchlist Read page**

```tsx
// backend/app/(member)/articles/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient, type ContentDetail } from '@/lib/api-client';
import { UpgradeGate } from '@/components/UpgradeGate';

type ReadState = { status: 'loading' } | { status: 'ok'; item: ContentDetail } | { status: 'locked' } | { status: 'not_found' };

export default function ArticleReadPage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<ReadState>({ status: 'loading' });

  useEffect(() => {
    apiClient.getContentById(params.id).then((result) => {
      if (result.status === 'ok') setState({ status: 'ok', item: result.item });
      else setState({ status: result.status });
    });
  }, [params.id]);

  if (state.status === 'loading') return <p className="text-brand-muted">Memuat...</p>;
  if (state.status === 'not_found') return <p className="text-brand-muted">Konten tidak ditemukan.</p>;
  if (state.status === 'locked') return <UpgradeGate />;

  const { item } = state;
  const body = typeof item.payload?.body === 'string' ? item.payload.body : JSON.stringify(item.payload, null, 2);

  return (
    <article>
      <p className="text-sm font-semibold text-brand-gold-dark uppercase">{item.type}</p>
      <h1 className="text-2xl font-extrabold text-brand-dark mt-1">{item.title}</h1>
      <p className="text-sm text-brand-muted mt-1">{new Date(item.published_at).toLocaleDateString('id-ID')}</p>
      <div className="mt-6 prose text-brand-dark whitespace-pre-wrap">{body}</div>
    </article>
  );
}
```

- [ ] **Step 3: Manual verification**

Using the Supabase MCP `execute_sql` tool:
```sql
insert into public.content_items (id, type, title, required_tier, payload, created_by, published_at)
values
  (gen_random_uuid(), 'article', 'Test Free Article', 'free', '{"body":"Isi artikel test."}'::jsonb, (select id from public.users where is_admin=true limit 1), now()),
  (gen_random_uuid(), 'watchlist', 'Test Watchlist BBCA', 'gold', '{"body":"BBCA entry 9000, TP 9500, SL 8800."}'::jsonb, (select id from public.users where is_admin=true limit 1), now())
returning id, title;
```
Run `cd backend && npm run dev`, log in as a free-tier test user, open `/articles` — expect the free article unlocked and the watchlist item dimmed/locked. Open the free article's read page — expect the body text to render. Navigate directly to the watchlist item's `/articles/<id>` — expect `UpgradeGate`. Stop the dev server, then: `delete from public.content_items where title in ('Test Free Article', 'Test Watchlist BBCA');`

- [ ] **Step 4: Commit**

```bash
git add "backend/app/(member)/articles"
git commit -m "feat: add Article and Watchlist list/read pages"
```

---

## Task 8: Checkout page with promo validation

**Files:**
- Create: `backend/app/(member)/checkout/page.tsx`

**Interfaces:**
- Consumes: `apiClient.getPlans`, `apiClient.validatePromo`, `apiClient.checkout` (Task 1).

- [ ] **Step 1: Create the Checkout page**

```tsx
// backend/app/(member)/checkout/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient, type Plan } from '@/lib/api-client';

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    amount
  );
}

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const planCode = searchParams.get('plan') as Plan['code'] | null;

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<{ discountPct: number; finalPrice: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.getPlans().then(setPlans);
  }, []);

  if (!plans) return <p className="text-brand-muted">Memuat...</p>;

  const plan = plans.find((p) => p.code === planCode);
  if (!plan) {
    return (
      <div className="p-8 bg-white rounded-2xl shadow-sm text-center">
        <h1 className="text-xl font-bold text-brand-dark">Paket tidak ditemukan</h1>
        <p className="mt-2 text-brand-muted">Silakan pilih paket kembali dari halaman Pricing.</p>
      </div>
    );
  }

  const finalPrice = promoResult?.finalPrice ?? plan.price;

  async function handleApplyPromo() {
    setPromoError(null);
    setPromoResult(null);
    if (!promoCode.trim()) return;
    const result = await apiClient.validatePromo(promoCode.trim(), plan.code);
    if (result.valid) {
      setPromoResult({ discountPct: result.discountPct, finalPrice: result.finalPrice });
    } else {
      setPromoError('Kode promo tidak valid untuk paket ini');
    }
  }

  async function handlePay() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await apiClient.checkout(plan.code, promoCode.trim() || undefined);
      if (result.status === 'invalid_promo') {
        setSubmitError('Kode promo tidak valid');
        setSubmitting(false);
        return;
      }
      window.location.href = result.redirectUrl;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Checkout gagal, silakan coba lagi');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-extrabold text-brand-dark">Checkout — {plan.name}</h1>

      <div className="mt-6 p-6 bg-white rounded-2xl shadow-sm">
        <div className="flex justify-between">
          <span className="text-brand-muted">Harga paket</span>
          <span className="font-semibold text-brand-dark">{formatRupiah(plan.price)}</span>
        </div>
        {promoResult && (
          <div className="flex justify-between mt-2 text-brand-gold-dark">
            <span>Diskon ({promoResult.discountPct}%)</span>
            <span>-{formatRupiah(plan.price - promoResult.finalPrice)}</span>
          </div>
        )}
        <div className="flex justify-between mt-4 pt-4 border-t border-brand-cream-dark">
          <span className="font-bold text-brand-dark">Total</span>
          <span className="font-extrabold text-brand-dark text-lg">{formatRupiah(finalPrice)}</span>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-semibold text-brand-dark mb-1">Kode Promo (opsional)</label>
        <div className="flex gap-2">
          <input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            className="flex-1 px-4 py-2 border border-brand-cream-dark rounded-lg"
          />
          <button
            type="button"
            onClick={handleApplyPromo}
            className="px-4 py-2 bg-brand-cream-dark text-brand-dark font-semibold rounded-lg"
          >
            Terapkan
          </button>
        </div>
        {promoError && <p className="mt-2 text-sm text-red-600">{promoError}</p>}
      </div>

      {submitError && <p className="mt-4 text-sm text-red-600">{submitError}</p>}

      <button
        onClick={handlePay}
        disabled={submitting}
        className="mt-6 w-full py-3 bg-brand-gold text-brand-dark font-bold rounded-full disabled:opacity-50"
      >
        {submitting ? 'Memproses...' : 'Bayar Sekarang'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification, including the Review Focus case**

Run `cd backend && npm run dev`, log in, open `/checkout?plan=silver` — expect the Silver price to render. Open `/checkout?plan=not-a-real-plan` — expect the "Paket tidak ditemukan" state (the Review Focus case), not a crash. Back on `/checkout?plan=silver`, type a nonexistent promo code and click "Terapkan" — expect the inline error, total price unchanged. Click "Bayar Sekarang" with no promo — expect a redirect to a real `app.sandbox.midtrans.com` Snap page (confirming the sandbox credentials from earlier this session still work end-to-end through the new UI). Stop the dev server before completing payment (or let it go through sandbox — either is fine to confirm the flow; no real money moves).

- [ ] **Step 3: Commit**

```bash
git add "backend/app/(member)/checkout/page.tsx"
git commit -m "feat: add Checkout page with promo code validation"
```

---

## Task 9: Midtrans finish-redirect wiring and Success page

**Files:**
- Modify: `backend/lib/midtrans-snap.ts`
- Modify: `backend/lib/checkout.ts`
- Modify: `backend/.env.local.example`
- Create: `backend/app/(member)/checkout/success/page.tsx`

**Interfaces:**
- Modifies: `SnapClient.createTransaction` to accept an optional `finishUrl` and pass it through to Midtrans; `createCheckout` to read `process.env.APP_URL` and pass `${APP_URL}/checkout/success` as that `finishUrl`.
- Note: Midtrans's per-transaction API only reliably supports a `finish` redirect callback. The "payment failed/cancelled → back to Pricing with a message" requirement (Task 5's `?checkout=cancelled` banner) is wired through the **account-level** Snap Preferences setting in the Midtrans dashboard, not through this code — see Step 1a.

- [ ] **Step 1: Add the finish-redirect callback to the Snap client**

```typescript
// backend/lib/midtrans-snap.ts
import midtransClient from 'midtrans-client';

export interface SnapClient {
  createTransaction(params: {
    orderId: string;
    grossAmount: number;
    customerEmail: string;
    finishUrl?: string;
  }): Promise<{ token: string; redirectUrl: string }>;
}

export function createMidtransSnapClient(): SnapClient {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!serverKey || !clientKey) {
    throw new Error('MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY must be set');
  }

  const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey,
    clientKey,
  });

  return {
    async createTransaction({ orderId, grossAmount, customerEmail, finishUrl }) {
      const transaction = await snap.createTransaction({
        transaction_details: { order_id: orderId, gross_amount: grossAmount },
        customer_details: { email: customerEmail },
        ...(finishUrl ? { callbacks: { finish: finishUrl } } : {}),
      });
      return { token: transaction.token, redirectUrl: transaction.redirect_url };
    },
  };
}
```

- [ ] **Step 1a: Configure the failed/cancelled redirect in the Midtrans dashboard (manual, not code)**

In the Midtrans Sandbox dashboard (`dashboard.sandbox.midtrans.com`, the same account whose credentials were fixed earlier this session) → **Settings → Snap Preferences**, set **Unfinish Redirect URL** and **Error Redirect URL** to `http://localhost:3000/pricing?checkout=cancelled` for local testing. For production/preview, use `https://design-handoff-socialtrade.vercel.app/pricing?checkout=cancelled` instead — update this setting again when switching the sandbox credentials to production ones later. This is an account-wide setting (applies to every transaction), which is why it is not part of `createTransaction`'s per-call params above.

- [ ] **Step 2: Pass the finish URL through from createCheckout**

```typescript
// backend/lib/checkout.ts — modify the snap.createTransaction call
// (full file for context; only the createTransaction call and the new
// const below it changed from the existing version)
import type { SupabaseClient } from '@supabase/supabase-js';
import { basePriceFor, type Plan } from './pricing';
import type { SnapClient } from './midtrans-snap';
import { validatePromo } from './promo';

export type CreateCheckoutInput = {
  userId: string;
  userEmail: string;
  plan: Plan;
  promoCode?: string;
};

export type CreateCheckoutResult =
  | { status: 'ok'; orderId: string; token: string; redirectUrl: string }
  | { status: 'invalid_promo' };

export async function createCheckout(
  supabase: SupabaseClient,
  snap: SnapClient,
  input: CreateCheckoutInput
): Promise<CreateCheckoutResult> {
  const baseAmount = basePriceFor(input.plan);
  let finalAmount = baseAmount;
  let appliedPromo: string | null = null;

  if (input.promoCode) {
    const promoResult = await validatePromo(supabase, input.promoCode, input.plan);
    if (!promoResult.valid) {
      return { status: 'invalid_promo' };
    }

    finalAmount = promoResult.finalPrice;
    appliedPromo = promoResult.code;
  }

  const midtransOrderId = `ST-${input.userId.slice(0, 8)}-${Date.now()}`;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: input.userId,
      plan: input.plan,
      base_amount: baseAmount,
      promo_code: appliedPromo,
      final_amount: finalAmount,
      status: 'pending',
      midtrans_order_id: midtransOrderId,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    throw new Error('Failed to create order');
  }

  const appUrl = process.env.APP_URL;
  const transaction = await snap.createTransaction({
    orderId: midtransOrderId,
    grossAmount: finalAmount,
    customerEmail: input.userEmail,
    finishUrl: appUrl ? `${appUrl}/checkout/success` : undefined,
  });

  return {
    status: 'ok',
    orderId: order.id,
    token: transaction.token,
    redirectUrl: transaction.redirectUrl,
  };
}
```

- [ ] **Step 3: Document the new env var**

```
# backend/.env.local.example — add this line
APP_URL=http://localhost:3000
```

Set the real value in `.env.local` to `http://localhost:3000` for local testing, and in Vercel's project env vars to `https://design-handoff-socialtrade.vercel.app` (the production alias set up earlier this session) for production/preview.

- [ ] **Step 4: Update the existing checkout test for the new optional parameter**

Open `backend/lib/checkout.test.ts` and confirm the existing fake `SnapClient` mocks still satisfy the `SnapClient` interface (the new `finishUrl` field is optional, so no change should be required — but run the suite to be sure):

Run: `cd backend && npm test -- --run lib/checkout.test.ts`
Expected: all existing tests still pass unmodified. If any fail due to a stricter mock type, add `finishUrl: undefined` is never required since the field is optional — fix only if TypeScript actually complains, which it should not for an optional field.

- [ ] **Step 5: Create the Success page**

```tsx
// backend/app/(member)/checkout/success/page.tsx
import Link from 'next/link';

export default function CheckoutSuccessPage() {
  return (
    <div className="max-w-md p-8 bg-white rounded-2xl shadow-sm text-center">
      <h1 className="text-2xl font-extrabold text-brand-dark">Pembayaran Diterima</h1>
      <p className="mt-2 text-brand-muted">
        Terima kasih! Akses paket Anda akan aktif dalam beberapa saat setelah pembayaran terverifikasi.
      </p>
      <Link
        href="/home"
        className="inline-block mt-6 px-6 py-2 bg-brand-gold text-brand-dark font-bold rounded-full hover:bg-brand-gold-dark hover:text-white"
      >
        Ke Halaman Utama
      </Link>
    </div>
  );
}
```

Note: this page is intentionally generic and does not read the `order_id`/`transaction_status` query params Midtrans appends on redirect — it is a UX confirmation only. The webhook (`POST /api/webhooks/midtrans`, already built and tested earlier this session) is the actual source of truth for granting membership, and runs independently of whether the user's browser ever reaches this page. This satisfies the Review Focus case (visiting the URL directly with no `order_id` shows the same generic, non-false-claiming message).

- [ ] **Step 6: Manual verification — the full real payment loop**

Set `APP_URL=http://localhost:3000` in `backend/.env.local` if not already present. Run `cd backend && npm run dev`. Log in, go to `/pricing`, pick Silver, on `/checkout?plan=silver` click "Bayar Sekarang", and on the resulting `app.sandbox.midtrans.com` page complete a test payment using Midtrans's sandbox test payment method (e.g. their test VA/credit card flow — sandbox docs cover the exact test numbers). Confirm the browser lands back on `http://localhost:3000/checkout/success`. Separately, using the Supabase MCP `execute_sql` tool, confirm the corresponding order's `status` became `paid` and the test user's `tier`/`expires_at` updated (same verification pattern used for the backend webhook test earlier this session) — this may take a few seconds for Midtrans's webhook to fire. Stop the dev server. Clean up the test order and reset the test user's tier back to `free` afterward.

- [ ] **Step 7: Commit**

```bash
git add backend/lib/midtrans-snap.ts backend/lib/checkout.ts backend/.env.local.example "backend/app/(member)/checkout/success"
git commit -m "feat: wire Midtrans finish-redirect to the Success page"
```

---

## Task 10: Full end-to-end walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Walk the entire flow once, start to finish, in one session**

Run `cd backend && npm run dev`. In a fresh private browser window: open `/`, click through to `/signup`, create a brand-new test account, land on `/pilih-paket`, pick a plan, complete checkout through sandbox Midtrans, land on `/checkout/success`, click through to `/home`, confirm the tier shown matches what was purchased (allow a few seconds for the webhook), visit `/videos` and `/articles` and open one unlocked item each, then click "Keluar" and confirm it returns to `/login` and that re-opening `/home` directly redirects to `/login` again (session actually cleared).

- [ ] **Step 2: Clean up all test data**

Using the Supabase MCP `execute_sql` tool, delete the test user's row from `public.users` (and the corresponding `public.orders` row(s) created during this walkthrough) created in Step 1.

- [ ] **Step 3: Run the full existing backend test suite to confirm nothing regressed**

Run: `cd backend && npm test -- --run`
Expected: all tests pass (same count as before this plan's changes, plus or minus nothing — no backend logic other than the Task 9 Midtrans wiring changed, and that change is additive/optional).
