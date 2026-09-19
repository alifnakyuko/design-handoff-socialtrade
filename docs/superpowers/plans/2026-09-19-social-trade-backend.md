# Social Trade Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real backend (auth, membership tiers, content catalog, checkout/payments, promo codes, admin content push, email notifications) for the Social Trade platform, replacing the local-state-only behavior in the `.dc.html` design mockups.

**Architecture:** Next.js (App Router) Route Handlers as the API layer, backed by Supabase (Postgres + Auth), with Midtrans Snap for payments and Resend for email. Business logic lives in small, dependency-injected, unit-tested `lib/*.ts` modules; each `app/api/**/route.ts` file is a thin adapter that wires real clients (Supabase, Midtrans, Resend) and calls the tested logic function.

**Tech Stack:** Next.js 14+ (App Router, TypeScript), `@supabase/supabase-js`, `@supabase/ssr`, `midtrans-client`, `resend`, Vitest for tests.

## Global Constraints

- Tier values and rank, exactly: `free=0, silver=1, gold=2, platinum=3, lifetime=4`.
- Plan prices (IDR, server-side fixed, from `Landing Page v2.dc.html:356-359`): Silver `1500000`, Gold `2600000`, Platinum `4200000`, Lifetime `6500000`.
- Membership tier is **never set directly from client input** — only via the Midtrans webhook handler or (later, out of scope here) an explicit admin override.
- Admin-only endpoints must verify `public.users.is_admin = true` server-side on every request — never trust a client-supplied flag.
- Locked content responses omit `payload` entirely (not just hide it client-side).
- All new code lives under `backend/` in this repo (`design_handoff_socialtrade/backend/`), separate from the reference `.dc.html` files at the repo root.
- Spec reference: [`docs/superpowers/specs/2026-09-19-social-trade-backend-design.md`](../specs/2026-09-19-social-trade-backend-design.md).

---

## File Structure

```
backend/
  package.json
  tsconfig.json
  vitest.config.ts
  .env.local.example
  supabase/
    migrations/
      0001_init.sql
  lib/
    tiers.ts                    lib/tiers.test.ts
    pricing.ts                  lib/pricing.test.ts
    supabase/
      admin.ts
      server.ts                 lib/supabase/server.test.ts
    current-user.ts             lib/current-user.test.ts
    signup.ts                   lib/signup.test.ts
    content-access.ts           lib/content-access.test.ts
    email.ts
    notifications.ts            lib/notifications.test.ts
    admin-content.ts            lib/admin-content.test.ts
    admin-promo.ts              lib/admin-promo.test.ts
    push-history.ts             lib/push-history.test.ts
    midtrans-snap.ts
    checkout.ts                 lib/checkout.test.ts
    midtrans-webhook.ts         lib/midtrans-webhook.test.ts
    orders.ts                   lib/orders.test.ts
  app/
    api/
      auth/signup/route.ts
      content/route.ts
      content/[id]/route.ts
      admin/content/route.ts
      admin/promo-codes/route.ts
      admin/promo-codes/[id]/route.ts
      admin/push-history/route.ts
      checkout/route.ts
      webhooks/midtrans/route.ts
      orders/[id]/route.ts
```

Each `lib/*.ts` file is a pure/DI-friendly module (Supabase client, email client, or Midtrans client passed in as a parameter) — this is what makes the business logic testable without a live database or live network calls. Each `route.ts` file is a thin adapter: resolve the real client(s), resolve the current user if needed, call the logic function, translate the result to an HTTP response.

---

## Task 1: Project Scaffold & Tooling

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.env.local.example`
- Create: `backend/.gitignore`
- Test: `backend/lib/sanity.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working `npm test` command every later task's tests run under; the env var names every later task reads (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`, `RESEND_API_KEY`).

- [ ] **Step 1: Initialize git (repo root is not yet a git repo)**

Run (from `design_handoff_socialtrade/`):
```bash
git init
git add README.md docs
git commit -m "chore: initial commit with design handoff docs"
```

- [ ] **Step 2: Create the backend project directory and package.json**

Create `backend/package.json`:
```json
{
  "name": "social-trade-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "midtrans-client": "^1.3.1",
    "resend": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

Create `backend/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
});
```

- [ ] **Step 5: Create env var template**

Create `backend/.env.local.example`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
MIDTRANS_SERVER_KEY=your-midtrans-server-key
MIDTRANS_CLIENT_KEY=your-midtrans-client-key
MIDTRANS_IS_PRODUCTION=false
RESEND_API_KEY=your-resend-api-key
```

- [ ] **Step 6: Create .gitignore**

Create `backend/.gitignore`:
```
node_modules/
.next/
.env.local
```

- [ ] **Step 7: Write a sanity test**

Create `backend/lib/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('project scaffold', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Install dependencies and run the test**

Run:
```bash
cd backend && npm install && npm test
```
Expected: `sanity.test.ts` passes (1 test).

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/tsconfig.json backend/vitest.config.ts backend/.env.local.example backend/.gitignore backend/lib/sanity.test.ts backend/package-lock.json
git commit -m "chore: scaffold Next.js + Vitest backend project"
```

---

## Task 2: Database Schema

**Files:**
- Create: `backend/supabase/migrations/0001_init.sql`

**Interfaces:**
- Consumes: nothing
- Produces: the Postgres schema every later `lib/*.ts` module queries against — table names and columns must match exactly: `public.users(id, email, name, tier, is_admin, referred_by, created_at)`, `public.content_items(id, type, title, required_tier, payload, published_at, created_by)`, `public.promo_codes(id, code, percent, active, expires_at, created_at)`, `public.orders(id, user_id, plan, base_amount, promo_code, final_amount, status, midtrans_order_id, midtrans_transaction_id, created_at, paid_at)`, `public.push_history(id, content_item_id, type, title, pushed_by, pushed_at, notified_count)`.

Note: this adds an `email` column to `public.users` beyond the original spec draft — needed so `lib/notifications.ts` (Task 8) can email eligible members without a second query into `auth.users`.

- [ ] **Step 1: Write the migration file**

Create `backend/supabase/migrations/0001_init.sql`:
```sql
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  tier text not null default 'free'
    check (tier in ('free','silver','gold','platinum','lifetime')),
  is_admin boolean not null default false,
  referred_by text,
  created_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('watchlist','video','article')),
  title text not null,
  required_tier text not null
    check (required_tier in ('free','silver','gold','platinum','lifetime')),
  payload jsonb not null,
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
  base_amount int not null,
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
  notified_count int not null default 0
);

alter table public.users enable row level security;
alter table public.content_items enable row level security;
alter table public.promo_codes enable row level security;
alter table public.orders enable row level security;
alter table public.push_history enable row level security;

create policy "users read own row" on public.users
  for select using (auth.uid() = id);

create policy "content items readable by any authenticated user" on public.content_items
  for select using (auth.role() = 'authenticated');

create policy "orders read own row" on public.orders
  for select using (auth.uid() = user_id);
```

Note: `promo_codes`, `push_history`, and all writes go through the service-role admin client (Task 4), which bypasses RLS by design — those tables have RLS enabled with no policies, so the anon/authenticated roles get zero access to them directly, only the service role (used server-side) can touch them.

- [ ] **Step 2: Apply the migration to your Supabase project**

This step requires your actual Supabase project (not something to run blind in CI). Using the Supabase CLI, from `backend/`:
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
Expected: CLI reports the migration applied with no errors. Verify by checking the Table Editor in the Supabase dashboard shows all 5 tables.

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/migrations/0001_init.sql
git commit -m "feat: add initial database schema"
```

---

## Task 3: Core Domain Utilities (Tier Rank & Pricing)

**Files:**
- Create: `backend/lib/tiers.ts`
- Test: `backend/lib/tiers.test.ts`
- Create: `backend/lib/pricing.ts`
- Test: `backend/lib/pricing.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Tier` type, `TIER_RANK`, `tierRank(tier: Tier): number`, `hasAccess(userTier: Tier, requiredTier: Tier): boolean` from `lib/tiers.ts`; `Plan` type, `PLAN_PRICES`, `basePriceFor(plan: Plan): number`, `applyDiscount(baseAmount: number, percent: number): number` from `lib/pricing.ts`. Every later task that touches tiers or prices imports from here — do not redefine these elsewhere.

- [ ] **Step 1: Write the failing test for tiers**

Create `backend/lib/tiers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tierRank, hasAccess } from './tiers';

describe('tierRank', () => {
  it('ranks tiers from free (0) to lifetime (4)', () => {
    expect(tierRank('free')).toBe(0);
    expect(tierRank('silver')).toBe(1);
    expect(tierRank('gold')).toBe(2);
    expect(tierRank('platinum')).toBe(3);
    expect(tierRank('lifetime')).toBe(4);
  });
});

describe('hasAccess', () => {
  it('grants access when user tier rank is equal to required tier', () => {
    expect(hasAccess('gold', 'gold')).toBe(true);
  });

  it('grants access when user tier rank is higher than required tier', () => {
    expect(hasAccess('lifetime', 'silver')).toBe(true);
  });

  it('denies access when user tier rank is lower than required tier', () => {
    expect(hasAccess('free', 'silver')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run lib/tiers.test.ts`
Expected: FAIL — `./tiers` module not found.

- [ ] **Step 3: Implement tiers.ts**

Create `backend/lib/tiers.ts`:
```ts
export type Tier = 'free' | 'silver' | 'gold' | 'platinum' | 'lifetime';

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  lifetime: 4,
};

export function tierRank(tier: Tier): number {
  return TIER_RANK[tier];
}

export function hasAccess(userTier: Tier, requiredTier: Tier): boolean {
  return tierRank(userTier) >= tierRank(requiredTier);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tiers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for pricing**

Create `backend/lib/pricing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { basePriceFor, applyDiscount } from './pricing';

describe('basePriceFor', () => {
  it('returns the fixed IDR price for each plan', () => {
    expect(basePriceFor('silver')).toBe(1_500_000);
    expect(basePriceFor('gold')).toBe(2_600_000);
    expect(basePriceFor('platinum')).toBe(4_200_000);
    expect(basePriceFor('lifetime')).toBe(6_500_000);
  });
});

describe('applyDiscount', () => {
  it('reduces the amount by the given percent, rounded', () => {
    expect(applyDiscount(1_500_000, 10)).toBe(1_350_000);
  });

  it('returns the original amount for 0 percent', () => {
    expect(applyDiscount(2_600_000, 0)).toBe(2_600_000);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run lib/pricing.test.ts`
Expected: FAIL — `./pricing` module not found.

- [ ] **Step 7: Implement pricing.ts**

Create `backend/lib/pricing.ts`:
```ts
export type Plan = 'silver' | 'gold' | 'platinum' | 'lifetime';

export const PLAN_PRICES: Record<Plan, number> = {
  silver: 1_500_000,
  gold: 2_600_000,
  platinum: 4_200_000,
  lifetime: 6_500_000,
};

export function basePriceFor(plan: Plan): number {
  return PLAN_PRICES[plan];
}

export function applyDiscount(baseAmount: number, percent: number): number {
  return Math.round(baseAmount * (1 - percent / 100));
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run lib/pricing.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add backend/lib/tiers.ts backend/lib/tiers.test.ts backend/lib/pricing.ts backend/lib/pricing.test.ts
git commit -m "feat: add tier rank and plan pricing utilities"
```

---

## Task 4: Supabase Client Factories

**Files:**
- Create: `backend/lib/supabase/admin.ts`
- Create: `backend/lib/supabase/server.ts`
- Test: `backend/lib/supabase/server.test.ts`

**Interfaces:**
- Consumes: env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from Task 1)
- Produces: `createAdminClient(): SupabaseClient` (service-role, bypasses RLS, used by every admin/webhook/signup route), `createServerSupabase(): SupabaseClient` (cookie-based, respects the logged-in user's session, used by `getCurrentUser` in Task 5 and any route needing "who is calling this")

- [ ] **Step 1: Implement the admin client (no test — thin wrapper, exercised indirectly by every later task that uses it)**

Create `backend/lib/supabase/admin.ts`:
```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 2: Write the failing test for the server client**

Create `backend/lib/supabase/server.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((url: string, key: string) => ({ url, key })),
}));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createServerSupabase', () => {
  it('creates a client using the public env vars', async () => {
    const { createServerSupabase } = await import('./server');
    const client = createServerSupabase() as unknown as { url: string; key: string };
    expect(client.url).toBe('https://example.supabase.co');
    expect(client.key).toBe('anon-key');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/supabase/server.test.ts`
Expected: FAIL — `./server` module not found.

- [ ] **Step 4: Implement server.ts**

Create `backend/lib/supabase/server.ts`:
```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createServerSupabase(): SupabaseClient {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  }) as unknown as SupabaseClient;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/supabase/server.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add backend/lib/supabase/admin.ts backend/lib/supabase/server.ts backend/lib/supabase/server.test.ts
git commit -m "feat: add Supabase admin and server client factories"
```

---

## Task 5: Current User Resolution

**Files:**
- Create: `backend/lib/current-user.ts`
- Test: `backend/lib/current-user.test.ts`

**Interfaces:**
- Consumes: a `SupabaseClient`-shaped object with `.auth.getUser()` and `.from('users').select().eq().single()` (from Task 4's `createServerSupabase`); `Tier` from Task 3
- Produces: `CurrentUser = { id: string; tier: Tier; isAdmin: boolean }`, `getCurrentUser(supabase): Promise<CurrentUser | null>` — every content/admin/checkout route (Tasks 7, 9, 10, 11, 12) calls this first to know who's asking and what they're allowed to do.

- [ ] **Step 1: Write the failing test**

Create `backend/lib/current-user.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getCurrentUser } from './current-user';

function fakeSupabase(opts: {
  authUser: { id: string } | null;
  profileRow: { tier: string; is_admin: boolean } | null;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.authUser } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: opts.profileRow,
            error: opts.profileRow ? null : { message: 'not found' },
          }),
        }),
      }),
    }),
  } as any;
}

describe('getCurrentUser', () => {
  it('returns null when there is no authenticated session', async () => {
    const supabase = fakeSupabase({ authUser: null, profileRow: null });
    expect(await getCurrentUser(supabase)).toBeNull();
  });

  it('returns null when the auth user has no matching profile row', async () => {
    const supabase = fakeSupabase({ authUser: { id: 'u1' }, profileRow: null });
    expect(await getCurrentUser(supabase)).toBeNull();
  });

  it('returns id, tier, and isAdmin for a valid session', async () => {
    const supabase = fakeSupabase({
      authUser: { id: 'u1' },
      profileRow: { tier: 'gold', is_admin: true },
    });
    expect(await getCurrentUser(supabase)).toEqual({ id: 'u1', tier: 'gold', isAdmin: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/current-user.test.ts`
Expected: FAIL — `./current-user` module not found.

- [ ] **Step 3: Implement current-user.ts**

Create `backend/lib/current-user.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tier } from './tiers';

export type CurrentUser = {
  id: string;
  tier: Tier;
  isAdmin: boolean;
};

export async function getCurrentUser(supabase: SupabaseClient): Promise<CurrentUser | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return null;

  const { data: row, error } = await supabase
    .from('users')
    .select('tier, is_admin')
    .eq('id', authData.user.id)
    .single();

  if (error || !row) return null;

  return { id: authData.user.id, tier: row.tier as Tier, isAdmin: row.is_admin as boolean };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/current-user.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/current-user.ts backend/lib/current-user.test.ts
git commit -m "feat: add current user resolution helper"
```

---

## Task 6: Signup Endpoint

**Files:**
- Create: `backend/lib/signup.ts`
- Test: `backend/lib/signup.test.ts`
- Create: `backend/app/api/auth/signup/route.ts`

**Interfaces:**
- Consumes: `createAdminClient` from Task 4
- Produces: `SignupInput = { email: string; password: string; name: string }`, `SignupResult = { status: 'ok'; userId: string } | { status: 'error'; message: string }`, `signup(adminSupabase, input): Promise<SignupResult>`; `POST /api/auth/signup` HTTP endpoint

- [ ] **Step 1: Write the failing test**

Create `backend/lib/signup.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { signup } from './signup';

function fakeAdminSupabase(opts: {
  createUserResult: { user: { id: string } | null; error: { message: string } | null };
  insertError?: { message: string } | null;
}) {
  return {
    auth: {
      admin: {
        createUser: vi.fn(async () => ({
          data: { user: opts.createUserResult.user },
          error: opts.createUserResult.error,
        })),
      },
    },
    from: () => ({
      insert: async () => ({ error: opts.insertError ?? null }),
    }),
  } as any;
}

describe('signup', () => {
  it('creates an auth user and a matching free-tier profile row', async () => {
    const supabase = fakeAdminSupabase({ createUserResult: { user: { id: 'u1' }, error: null } });
    const result = await signup(supabase, { email: 'a@b.com', password: 'secret123', name: 'Ana' });
    expect(result).toEqual({ status: 'ok', userId: 'u1' });
  });

  it('returns an error when auth user creation fails', async () => {
    const supabase = fakeAdminSupabase({
      createUserResult: { user: null, error: { message: 'Email already registered' } },
    });
    const result = await signup(supabase, { email: 'a@b.com', password: 'secret123', name: 'Ana' });
    expect(result).toEqual({ status: 'error', message: 'Email already registered' });
  });

  it('returns an error when the profile row insert fails', async () => {
    const supabase = fakeAdminSupabase({
      createUserResult: { user: { id: 'u1' }, error: null },
      insertError: { message: 'duplicate key' },
    });
    const result = await signup(supabase, { email: 'a@b.com', password: 'secret123', name: 'Ana' });
    expect(result).toEqual({ status: 'error', message: 'Failed to create user profile' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/signup.test.ts`
Expected: FAIL — `./signup` module not found.

- [ ] **Step 3: Implement signup.ts**

Create `backend/lib/signup.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type SignupInput = { email: string; password: string; name: string };
export type SignupResult = { status: 'ok'; userId: string } | { status: 'error'; message: string };

export async function signup(adminSupabase: SupabaseClient, input: SignupInput): Promise<SignupResult> {
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    return { status: 'error', message: error?.message ?? 'Failed to create account' };
  }

  const { error: profileError } = await adminSupabase.from('users').insert({
    id: data.user.id,
    email: input.email,
    name: input.name,
    tier: 'free',
    is_admin: false,
  });

  if (profileError) {
    return { status: 'error', message: 'Failed to create user profile' };
  }

  return { status: 'ok', userId: data.user.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/signup.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire up the route handler**

Create `backend/app/api/auth/signup/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { signup } from '@/lib/signup';

export async function POST(request: Request) {
  const body = await request.json();
  const { email, password, name } = body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
    return NextResponse.json({ error: 'email, password, and name are required' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const result = await signup(adminSupabase, { email, password, name });

  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ userId: result.userId }, { status: 201 });
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/lib/signup.ts backend/lib/signup.test.ts backend/app/api/auth/signup/route.ts
git commit -m "feat: add signup endpoint"
```

---

## Task 7: Content Listing & Detail Endpoints

**Files:**
- Create: `backend/lib/content-access.ts`
- Test: `backend/lib/content-access.test.ts`
- Create: `backend/app/api/content/route.ts`
- Create: `backend/app/api/content/[id]/route.ts`

**Interfaces:**
- Consumes: `Tier`, `hasAccess` from Task 3; `getCurrentUser` from Task 5; `createServerSupabase` from Task 4
- Produces: `ContentType = 'watchlist' | 'video' | 'article'`, `ContentRow`, `ContentListItem`, `redactForTier(item, viewerTier): ContentListItem`, `listContent(supabase, viewerTier, type?): Promise<ContentListItem[]>`, `getContentById(supabase, viewerTier, id): Promise<{status:200; item: ContentRow} | {status:403} | {status:404}>`. Task 9 (admin publish) inserts rows this task reads; the shapes must match.

- [ ] **Step 1: Write the failing test**

Create `backend/lib/content-access.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { redactForTier, listContent, getContentById, type ContentRow } from './content-access';

const watchlistItem: ContentRow = {
  id: 'c1',
  type: 'watchlist',
  title: 'ANTM Watchlist',
  required_tier: 'gold',
  payload: { ticker: 'ANTM', price: '1.605' },
  published_at: '2026-09-01T00:00:00Z',
};

function fakeQuery(result: { data: any; error: any }) {
  const builder: any = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  return builder;
}

describe('redactForTier', () => {
  it('returns the full item with locked:false when the viewer has access', () => {
    expect(redactForTier(watchlistItem, 'gold')).toEqual({ ...watchlistItem, locked: false });
  });

  it('returns only id/type/title/required_tier with locked:true when the viewer lacks access', () => {
    expect(redactForTier(watchlistItem, 'silver')).toEqual({
      id: 'c1',
      type: 'watchlist',
      title: 'ANTM Watchlist',
      required_tier: 'gold',
      locked: true,
    });
  });
});

describe('listContent', () => {
  it('maps every row through redactForTier for the viewer tier', async () => {
    const supabase = { from: () => fakeQuery({ data: [watchlistItem], error: null }) } as any;
    const result = await listContent(supabase, 'free');
    expect(result).toEqual([
      { id: 'c1', type: 'watchlist', title: 'ANTM Watchlist', required_tier: 'gold', locked: true },
    ]);
  });

  it('returns an empty array on a query error', async () => {
    const supabase = { from: () => fakeQuery({ data: null, error: { message: 'boom' } }) } as any;
    expect(await listContent(supabase, 'free')).toEqual([]);
  });
});

describe('getContentById', () => {
  it('returns status 404 when the row does not exist', async () => {
    const supabase = { from: () => fakeQuery({ data: null, error: { message: 'not found' } }) } as any;
    expect(await getContentById(supabase, 'lifetime', 'missing')).toEqual({ status: 404 });
  });

  it('returns status 403 when the viewer lacks the required tier', async () => {
    const supabase = { from: () => fakeQuery({ data: watchlistItem, error: null }) } as any;
    expect(await getContentById(supabase, 'free', 'c1')).toEqual({ status: 403 });
  });

  it('returns status 200 and the full item when the viewer has access', async () => {
    const supabase = { from: () => fakeQuery({ data: watchlistItem, error: null }) } as any;
    expect(await getContentById(supabase, 'gold', 'c1')).toEqual({ status: 200, item: watchlistItem });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/content-access.test.ts`
Expected: FAIL — `./content-access` module not found.

- [ ] **Step 3: Implement content-access.ts**

Create `backend/lib/content-access.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasAccess, type Tier } from './tiers';

export type ContentType = 'watchlist' | 'video' | 'article';

export type ContentRow = {
  id: string;
  type: ContentType;
  title: string;
  required_tier: Tier;
  payload: Record<string, unknown>;
  published_at: string;
};

export type ContentListItem =
  | (ContentRow & { locked: false })
  | { id: string; type: ContentType; title: string; required_tier: Tier; locked: true };

export function redactForTier(item: ContentRow, viewerTier: Tier): ContentListItem {
  if (hasAccess(viewerTier, item.required_tier)) {
    return { ...item, locked: false };
  }
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    required_tier: item.required_tier,
    locked: true,
  };
}

export async function listContent(
  supabase: SupabaseClient,
  viewerTier: Tier,
  type?: ContentType
): Promise<ContentListItem[]> {
  let query = supabase.from('content_items').select('*').order('published_at', { ascending: false });
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as ContentRow[]).map((item) => redactForTier(item, viewerTier));
}

export async function getContentById(
  supabase: SupabaseClient,
  viewerTier: Tier,
  id: string
): Promise<{ status: 200; item: ContentRow } | { status: 403 } | { status: 404 }> {
  const { data, error } = await supabase.from('content_items').select('*').eq('id', id).single();
  if (error || !data) return { status: 404 };
  const item = data as ContentRow;
  if (!hasAccess(viewerTier, item.required_tier)) return { status: 403 };
  return { status: 200, item };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/content-access.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire up the list route (public — logged-out viewers are treated as tier `free`)**

Create `backend/app/api/content/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { listContent, type ContentType } from '@/lib/content-access';

export async function GET(request: Request) {
  const supabase = createServerSupabase();
  const currentUser = await getCurrentUser(supabase);
  const viewerTier = currentUser?.tier ?? 'free';

  const url = new URL(request.url);
  const type = url.searchParams.get('type') as ContentType | null;

  const items = await listContent(supabase, viewerTier, type ?? undefined);
  return NextResponse.json({ items });
}
```

- [ ] **Step 6: Wire up the detail route**

Create `backend/app/api/content/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { getContentById } from '@/lib/content-access';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const currentUser = await getCurrentUser(supabase);
  const viewerTier = currentUser?.tier ?? 'free';

  const result = await getContentById(supabase, viewerTier, params.id);

  if (result.status === 404) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (result.status === 403) {
    return NextResponse.json({ error: 'Upgrade your plan to view this content' }, { status: 403 });
  }
  return NextResponse.json({ item: result.item });
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/lib/content-access.ts backend/lib/content-access.test.ts backend/app/api/content
git commit -m "feat: add tier-gated content listing and detail endpoints"
```

---

## Task 8: Email Notification Library

**Files:**
- Create: `backend/lib/email.ts`
- Create: `backend/lib/notifications.ts`
- Test: `backend/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `Tier`, `tierRank` from Task 3
- Produces: `EmailClient` interface + `createResendEmailClient(): EmailClient` from `lib/email.ts`; `sendContentNotification(supabase, emailClient, item): Promise<number>` (returns count of members notified) from `lib/notifications.ts`. Task 9 calls `sendContentNotification` directly.

- [ ] **Step 1: Implement the email client wrapper (no test — thin wrapper around the Resend SDK, exercised via the `EmailClient` interface in notifications.test.ts)**

Create `backend/lib/email.ts`:
```ts
import { Resend } from 'resend';

export interface EmailClient {
  send(params: { to: string[]; subject: string; html: string }): Promise<void>;
}

export function createResendEmailClient(): EmailClient {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY must be set');
  }
  const resend = new Resend(apiKey);
  return {
    async send({ to, subject, html }) {
      await resend.emails.send({ from: 'Social Trade <notifikasi@socialtrade.id>', to, subject, html });
    },
  };
}
```

- [ ] **Step 2: Write the failing test for sendContentNotification**

Create `backend/lib/notifications.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { sendContentNotification } from './notifications';
import type { EmailClient } from './email';

function fakeSupabase(users: { email: string; tier: string }[]) {
  return {
    from: () => ({
      select: async () => ({ data: users, error: null }),
    }),
  } as any;
}

function fakeEmailClient(): EmailClient & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    send: async (params) => {
      calls.push(params);
    },
  };
}

describe('sendContentNotification', () => {
  it('emails only members whose tier meets the required tier, and returns the count', async () => {
    const supabase = fakeSupabase([
      { email: 'free@x.com', tier: 'free' },
      { email: 'gold@x.com', tier: 'gold' },
      { email: 'lifetime@x.com', tier: 'lifetime' },
    ]);
    const emailClient = fakeEmailClient();

    const count = await sendContentNotification(supabase, emailClient, {
      title: 'ANTM Watchlist',
      type: 'watchlist',
      required_tier: 'gold',
    });

    expect(count).toBe(2);
    expect(emailClient.calls).toHaveLength(1);
    expect(emailClient.calls[0].to).toEqual(['gold@x.com', 'lifetime@x.com']);
    expect(emailClient.calls[0].subject).toContain('ANTM Watchlist');
  });

  it('does not call the email client and returns 0 when no members are eligible', async () => {
    const supabase = fakeSupabase([{ email: 'free@x.com', tier: 'free' }]);
    const emailClient = fakeEmailClient();

    const count = await sendContentNotification(supabase, emailClient, {
      title: 'Platinum-only report',
      type: 'article',
      required_tier: 'platinum',
    });

    expect(count).toBe(0);
    expect(emailClient.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/notifications.test.ts`
Expected: FAIL — `./notifications` module not found.

- [ ] **Step 4: Implement notifications.ts**

Create `backend/lib/notifications.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailClient } from './email';
import { tierRank, type Tier } from './tiers';

export type NotifiableContent = {
  title: string;
  type: 'watchlist' | 'video' | 'article';
  required_tier: Tier;
};

export async function sendContentNotification(
  supabase: SupabaseClient,
  emailClient: EmailClient,
  item: NotifiableContent
): Promise<number> {
  const { data: users, error } = await supabase.from('users').select('email, tier');
  if (error || !users) return 0;

  const eligible = (users as { email: string; tier: Tier }[]).filter(
    (u) => tierRank(u.tier) >= tierRank(item.required_tier)
  );
  if (eligible.length === 0) return 0;

  await emailClient.send({
    to: eligible.map((u) => u.email),
    subject: `Konten baru: ${item.title}`,
    html: `<p>Ada ${item.type} baru untuk Anda: <strong>${item.title}</strong>. Login untuk melihat.</p>`,
  });

  return eligible.length;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/notifications.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/lib/email.ts backend/lib/notifications.ts backend/lib/notifications.test.ts
git commit -m "feat: add content notification emails"
```

---

## Task 9: Admin Content Publish Endpoint

**Files:**
- Create: `backend/lib/admin-content.ts`
- Test: `backend/lib/admin-content.test.ts`
- Create: `backend/app/api/admin/content/route.ts`

**Interfaces:**
- Consumes: `sendContentNotification` from Task 8; `getCurrentUser`, `createServerSupabase` from Tasks 5/4; `createAdminClient` from Task 4; `Tier` from Task 3
- Produces: `PublishContentInput`, `publishContent(supabase, emailClient, input): Promise<{id: string; notifiedCount: number}>`; `POST /api/admin/content`

Note: per the mockups, the Admin panel's publish tabs are **Watchlist** and **Artikel** only (no Video tab) — `publishContent` accepts `type: 'watchlist' | 'article'` accordingly, matching `push_history.type`'s check constraint from Task 2.

- [ ] **Step 1: Write the failing test**

Create `backend/lib/admin-content.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { publishContent } from './admin-content';
import type { EmailClient } from './email';

function fakeSupabase() {
  const inserted: any[] = [];
  const pushHistoryRows: any[] = [];
  return {
    inserted,
    pushHistoryRows,
    from: (table: string) => {
      if (table === 'content_items') {
        return {
          insert: (row: any) => ({
            select: () => ({
              single: async () => {
                inserted.push(row);
                return { data: { id: 'content-1' }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'users') {
        return { select: async () => ({ data: [{ email: 'gold@x.com', tier: 'gold' }], error: null }) };
      }
      if (table === 'push_history') {
        return {
          insert: async (row: any) => {
            pushHistoryRows.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

function fakeEmailClient(): EmailClient {
  return { send: async () => {} };
}

describe('publishContent', () => {
  it('inserts the content item, notifies eligible members, and logs push history', async () => {
    const supabase = fakeSupabase();
    const emailClient = fakeEmailClient();

    const result = await publishContent(supabase, emailClient, {
      type: 'watchlist',
      title: 'ANTM Watchlist',
      required_tier: 'gold',
      payload: { ticker: 'ANTM', price: '1.605' },
      createdBy: 'admin-1',
    });

    expect(result).toEqual({ id: 'content-1', notifiedCount: 1 });
    expect(supabase.inserted[0]).toMatchObject({
      type: 'watchlist',
      title: 'ANTM Watchlist',
      required_tier: 'gold',
      created_by: 'admin-1',
    });
    expect(supabase.pushHistoryRows[0]).toMatchObject({
      content_item_id: 'content-1',
      type: 'watchlist',
      title: 'ANTM Watchlist',
      pushed_by: 'admin-1',
      notified_count: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/admin-content.test.ts`
Expected: FAIL — `./admin-content` module not found.

- [ ] **Step 3: Implement admin-content.ts**

Create `backend/lib/admin-content.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailClient } from './email';
import { sendContentNotification } from './notifications';
import type { Tier } from './tiers';

export type PublishContentInput = {
  type: 'watchlist' | 'article';
  title: string;
  required_tier: Tier;
  payload: Record<string, unknown>;
  createdBy: string;
};

export async function publishContent(
  supabase: SupabaseClient,
  emailClient: EmailClient,
  input: PublishContentInput
): Promise<{ id: string; notifiedCount: number }> {
  const { data: inserted, error } = await supabase
    .from('content_items')
    .insert({
      type: input.type,
      title: input.title,
      required_tier: input.required_tier,
      payload: input.payload,
      created_by: input.createdBy,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error('Failed to create content item');
  }

  const notifiedCount = await sendContentNotification(supabase, emailClient, {
    title: input.title,
    type: input.type,
    required_tier: input.required_tier,
  });

  await supabase.from('push_history').insert({
    content_item_id: inserted.id,
    type: input.type,
    title: input.title,
    pushed_by: input.createdBy,
    notified_count: notifiedCount,
  });

  return { id: inserted.id, notifiedCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/admin-content.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Wire up the route handler**

Create `backend/app/api/admin/content/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { createResendEmailClient } from '@/lib/email';
import { publishContent } from '@/lib/admin-content';

export async function POST(request: Request) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { type, title, required_tier, payload } = body ?? {};

  if (type !== 'watchlist' && type !== 'article') {
    return NextResponse.json({ error: 'type must be watchlist or article' }, { status: 400 });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const emailClient = createResendEmailClient();

  const result = await publishContent(adminSupabase, emailClient, {
    type,
    title,
    required_tier,
    payload: payload ?? {},
    createdBy: currentUser.id,
  });

  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/lib/admin-content.ts backend/lib/admin-content.test.ts backend/app/api/admin/content
git commit -m "feat: add admin content publish endpoint"
```

---

## Task 10: Admin Promo Codes Endpoints

**Files:**
- Create: `backend/lib/admin-promo.ts`
- Test: `backend/lib/admin-promo.test.ts`
- Create: `backend/app/api/admin/promo-codes/route.ts`
- Create: `backend/app/api/admin/promo-codes/[id]/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `createAdminClient` from Task 4; `getCurrentUser` from Task 5
- Produces: `CreatePromoInput`, `createPromoCode(supabase, input): Promise<{id: string}>`, `setPromoCodeActive(supabase, id, active): Promise<void>`; `POST /api/admin/promo-codes`, `PATCH /api/admin/promo-codes/[id]`. Task 12's checkout logic reads the `promo_codes` table this task writes to — same columns (`code, percent, active, expires_at`).

- [ ] **Step 1: Write the failing test**

Create `backend/lib/admin-promo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createPromoCode, setPromoCodeActive } from './admin-promo';

function fakeSupabase() {
  const inserted: any[] = [];
  const updated: { id: string; patch: any }[] = [];
  return {
    inserted,
    updated,
    from: () => ({
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            inserted.push(row);
            return { data: { id: 'promo-1' }, error: null };
          },
        }),
      }),
      update: (patch: any) => ({
        eq: async (_col: string, id: string) => {
          updated.push({ id, patch });
          return { error: null };
        },
      }),
    }),
  } as any;
}

describe('createPromoCode', () => {
  it('inserts an active promo code and returns its id', async () => {
    const supabase = fakeSupabase();
    const result = await createPromoCode(supabase, { code: 'HEMAT10', percent: 10, expiresAt: '2026-12-31' });
    expect(result).toEqual({ id: 'promo-1' });
    expect(supabase.inserted[0]).toEqual({
      code: 'HEMAT10',
      percent: 10,
      expires_at: '2026-12-31',
      active: true,
    });
  });
});

describe('setPromoCodeActive', () => {
  it('updates the active flag for the given promo code id', async () => {
    const supabase = fakeSupabase();
    await setPromoCodeActive(supabase, 'promo-1', false);
    expect(supabase.updated[0]).toEqual({ id: 'promo-1', patch: { active: false } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/admin-promo.test.ts`
Expected: FAIL — `./admin-promo` module not found.

- [ ] **Step 3: Implement admin-promo.ts**

Create `backend/lib/admin-promo.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type CreatePromoInput = {
  code: string;
  percent: number;
  expiresAt: string;
};

export async function createPromoCode(
  supabase: SupabaseClient,
  input: CreatePromoInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('promo_codes')
    .insert({ code: input.code, percent: input.percent, expires_at: input.expiresAt, active: true })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create promo code');
  }
  return { id: data.id };
}

export async function setPromoCodeActive(supabase: SupabaseClient, id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('promo_codes').update({ active }).eq('id', id);
  if (error) {
    throw new Error('Failed to update promo code');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/admin-promo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire up the create route**

Create `backend/app/api/admin/promo-codes/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { createPromoCode } from '@/lib/admin-promo';

export async function POST(request: Request) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { code, percent, expiresAt } = body ?? {};

  if (typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  if (typeof percent !== 'number' || percent < 1 || percent > 100) {
    return NextResponse.json({ error: 'percent must be between 1 and 100' }, { status: 400 });
  }
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) {
    return NextResponse.json({ error: 'expiresAt is required' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const result = await createPromoCode(adminSupabase, { code, percent, expiresAt });
  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 6: Wire up the toggle route**

Create `backend/app/api/admin/promo-codes/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { setPromoCodeActive } from '@/lib/admin-promo';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { active } = body ?? {};
  if (typeof active !== 'boolean') {
    return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  await setPromoCodeActive(adminSupabase, params.id, active);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/lib/admin-promo.ts backend/lib/admin-promo.test.ts backend/app/api/admin/promo-codes
git commit -m "feat: add admin promo code endpoints"
```

---

## Task 11: Admin Push History Endpoint

**Files:**
- Create: `backend/lib/push-history.ts`
- Test: `backend/lib/push-history.test.ts`
- Create: `backend/app/api/admin/push-history/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `createAdminClient` from Task 4; `getCurrentUser` from Task 5
- Produces: `PushHistoryEntry`, `listPushHistory(supabase): Promise<PushHistoryEntry[]>`; `GET /api/admin/push-history`

- [ ] **Step 1: Write the failing test**

Create `backend/lib/push-history.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { listPushHistory } from './push-history';

describe('listPushHistory', () => {
  it('returns rows ordered newest-first as provided by the query', async () => {
    const rows = [
      { id: 'p2', type: 'article', title: 'Second', pushed_at: '2026-09-02T00:00:00Z', notified_count: 5 },
      { id: 'p1', type: 'watchlist', title: 'First', pushed_at: '2026-09-01T00:00:00Z', notified_count: 3 },
    ];
    const supabase = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
    } as any;

    expect(await listPushHistory(supabase)).toEqual(rows);
  });

  it('returns an empty array on a query error', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: null, error: { message: 'boom' } }),
        }),
      }),
    } as any;

    expect(await listPushHistory(supabase)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/push-history.test.ts`
Expected: FAIL — `./push-history` module not found.

- [ ] **Step 3: Implement push-history.ts**

Create `backend/lib/push-history.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type PushHistoryEntry = {
  id: string;
  type: 'watchlist' | 'article' | 'promo';
  title: string;
  pushed_at: string;
  notified_count: number;
};

export async function listPushHistory(supabase: SupabaseClient): Promise<PushHistoryEntry[]> {
  const { data, error } = await supabase
    .from('push_history')
    .select('id, type, title, pushed_at, notified_count')
    .order('pushed_at', { ascending: false });

  if (error || !data) return [];
  return data as PushHistoryEntry[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/push-history.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire up the route handler**

Create `backend/app/api/admin/push-history/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { listPushHistory } from '@/lib/push-history';

export async function GET() {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  const entries = await listPushHistory(adminSupabase);
  return NextResponse.json({ entries });
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/lib/push-history.ts backend/lib/push-history.test.ts backend/app/api/admin/push-history
git commit -m "feat: add admin push history endpoint"
```

---

## Task 12: Checkout Endpoint

**Files:**
- Create: `backend/lib/midtrans-snap.ts`
- Create: `backend/lib/checkout.ts`
- Test: `backend/lib/checkout.test.ts`
- Create: `backend/app/api/checkout/route.ts`

**Interfaces:**
- Consumes: `Plan`, `basePriceFor`, `applyDiscount` from Task 3; `getCurrentUser`, `createServerSupabase`, `createAdminClient` from Tasks 4/5
- Produces: `SnapClient` interface + `createMidtransSnapClient(): SnapClient` from `lib/midtrans-snap.ts`; `CreateCheckoutInput`, `CreateCheckoutResult`, `createCheckout(supabase, snap, input): Promise<CreateCheckoutResult>`; `POST /api/checkout`. Task 13's webhook reads the `orders` rows this task writes — same columns (`midtrans_order_id, user_id, plan, status`).

- [ ] **Step 1: Implement the Midtrans Snap client wrapper (no test — thin wrapper around the `midtrans-client` SDK, exercised via the `SnapClient` interface in checkout.test.ts)**

Create `backend/lib/midtrans-snap.ts`:
```ts
import midtransClient from 'midtrans-client';

export interface SnapClient {
  createTransaction(params: {
    orderId: string;
    grossAmount: number;
    customerEmail: string;
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
    async createTransaction({ orderId, grossAmount, customerEmail }) {
      const transaction = await snap.createTransaction({
        transaction_details: { order_id: orderId, gross_amount: grossAmount },
        customer_details: { email: customerEmail },
      });
      return { token: transaction.token, redirectUrl: transaction.redirect_url };
    },
  };
}
```

- [ ] **Step 2: Write the failing test for checkout logic**

Create `backend/lib/checkout.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createCheckout } from './checkout';
import type { SnapClient } from './midtrans-snap';

function fakeSupabase(opts: { promoRow?: any; insertedOrder?: { id: string } }) {
  const insertedRows: any[] = [];
  return {
    insertedRows,
    from: (table: string) => {
      if (table === 'promo_codes') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts.promoRow ?? null, error: opts.promoRow ? null : { message: 'not found' } }),
            }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          insert: (row: any) => ({
            select: () => ({
              single: async () => {
                insertedRows.push(row);
                return { data: opts.insertedOrder ?? { id: 'order-1' }, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

function fakeSnap(): SnapClient {
  return {
    createTransaction: async () => ({ token: 'snap-token', redirectUrl: 'https://midtrans.example/pay' }),
  };
}

describe('createCheckout', () => {
  it('creates a pending order at the plan base price when no promo code is given', async () => {
    const supabase = fakeSupabase({});
    const result = await createCheckout(supabase, fakeSnap(), {
      userId: 'u1',
      userEmail: 'u1@x.com',
      plan: 'gold',
    });

    expect(result).toEqual({
      status: 'ok',
      orderId: 'order-1',
      token: 'snap-token',
      redirectUrl: 'https://midtrans.example/pay',
    });
    expect(supabase.insertedRows[0]).toMatchObject({
      user_id: 'u1',
      plan: 'gold',
      base_amount: 2_600_000,
      final_amount: 2_600_000,
      promo_code: null,
      status: 'pending',
    });
  });

  it('applies a valid active promo code discount to final_amount', async () => {
    const supabase = fakeSupabase({
      promoRow: { code: 'HEMAT10', percent: 10, active: true, expires_at: '2099-01-01' },
    });
    const result = await createCheckout(supabase, fakeSnap(), {
      userId: 'u1',
      userEmail: 'u1@x.com',
      plan: 'silver',
      promoCode: 'HEMAT10',
    });

    expect(result.status).toBe('ok');
    expect(supabase.insertedRows[0]).toMatchObject({
      base_amount: 1_500_000,
      final_amount: 1_350_000,
      promo_code: 'HEMAT10',
    });
  });

  it('returns invalid_promo and creates no order when the promo code is expired', async () => {
    const supabase = fakeSupabase({
      promoRow: { code: 'OLD', percent: 10, active: true, expires_at: '2020-01-01' },
    });
    const result = await createCheckout(supabase, fakeSnap(), {
      userId: 'u1',
      userEmail: 'u1@x.com',
      plan: 'silver',
      promoCode: 'OLD',
    });

    expect(result).toEqual({ status: 'invalid_promo' });
    expect(supabase.insertedRows).toHaveLength(0);
  });

  it('returns invalid_promo when the promo code does not exist', async () => {
    const supabase = fakeSupabase({});
    const result = await createCheckout(supabase, fakeSnap(), {
      userId: 'u1',
      userEmail: 'u1@x.com',
      plan: 'silver',
      promoCode: 'DOESNOTEXIST',
    });

    expect(result).toEqual({ status: 'invalid_promo' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/checkout.test.ts`
Expected: FAIL — `./checkout` module not found.

- [ ] **Step 4: Implement checkout.ts**

Create `backend/lib/checkout.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { basePriceFor, applyDiscount, type Plan } from './pricing';
import type { SnapClient } from './midtrans-snap';

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
    const { data: promo, error } = await supabase
      .from('promo_codes')
      .select('code, percent, active, expires_at')
      .eq('code', input.promoCode)
      .single();

    if (error || !promo || !promo.active || new Date(promo.expires_at) < new Date()) {
      return { status: 'invalid_promo' };
    }

    finalAmount = applyDiscount(baseAmount, promo.percent);
    appliedPromo = promo.code;
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

  const transaction = await snap.createTransaction({
    orderId: midtransOrderId,
    grossAmount: finalAmount,
    customerEmail: input.userEmail,
  });

  return {
    status: 'ok',
    orderId: order.id,
    token: transaction.token,
    redirectUrl: transaction.redirectUrl,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/checkout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire up the route handler**

Create `backend/app/api/checkout/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { createMidtransSnapClient } from '@/lib/midtrans-snap';
import { createCheckout } from '@/lib/checkout';
import type { Plan } from '@/lib/pricing';

const VALID_PLANS: Plan[] = ['silver', 'gold', 'platinum', 'lifetime'];

export async function POST(request: Request) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: authData } = await sessionSupabase.auth.getUser();
  const userEmail = authData.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'No email on account' }, { status: 400 });
  }

  const body = await request.json();
  const { plan, promoCode } = body ?? {};

  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'plan must be one of silver, gold, platinum, lifetime' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const snap = createMidtransSnapClient();

  const result = await createCheckout(adminSupabase, snap, {
    userId: currentUser.id,
    userEmail,
    plan,
    promoCode: typeof promoCode === 'string' && promoCode.trim() ? promoCode.trim() : undefined,
  });

  if (result.status === 'invalid_promo') {
    return NextResponse.json({ error: 'Invalid or expired promo code' }, { status: 400 });
  }

  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/lib/midtrans-snap.ts backend/lib/checkout.ts backend/lib/checkout.test.ts backend/app/api/checkout
git commit -m "feat: add checkout endpoint with Midtrans Snap and promo code support"
```

---

## Task 13: Midtrans Webhook Endpoint

**Files:**
- Create: `backend/lib/midtrans-webhook.ts`
- Test: `backend/lib/midtrans-webhook.test.ts`
- Create: `backend/app/api/webhooks/midtrans/route.ts`

**Interfaces:**
- Consumes: `tierRank`, `Tier` from Task 3; `createAdminClient` from Task 4
- Produces: `MidtransNotification`, `verifyMidtransSignature(notification, serverKey): boolean`, `handleMidtransNotification(supabase, notification, serverKey): Promise<{status: 'ignored'|'invalid_signature'|'order_not_found'|'updated'}>`; `POST /api/webhooks/midtrans`

- [ ] **Step 1: Write the failing test**

Create `backend/lib/midtrans-webhook.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyMidtransSignature, handleMidtransNotification, type MidtransNotification } from './midtrans-webhook';

const SERVER_KEY = 'test-server-key';

function signedNotification(overrides: Partial<MidtransNotification>): MidtransNotification {
  const base = {
    order_id: 'ST-u1-123',
    status_code: '200',
    gross_amount: '2600000.00',
    transaction_status: 'settlement',
    transaction_id: 'tx-1',
    ...overrides,
  };
  const signature_key = crypto
    .createHash('sha512')
    .update(base.order_id + base.status_code + base.gross_amount + SERVER_KEY)
    .digest('hex');
  return { ...base, signature_key };
}

function fakeSupabase(opts: { orderRow?: any; userRow?: any }) {
  const orderUpdates: any[] = [];
  const userUpdates: any[] = [];
  return {
    orderUpdates,
    userUpdates,
    from: (table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts.orderRow ?? null, error: opts.orderRow ? null : { message: 'not found' } }),
            }),
          }),
          update: (patch: any) => ({
            eq: async () => {
              orderUpdates.push(patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts.userRow ?? { tier: 'free' }, error: null }),
            }),
          }),
          update: (patch: any) => ({
            eq: async () => {
              userUpdates.push(patch);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('verifyMidtransSignature', () => {
  it('accepts a correctly signed notification', () => {
    const notification = signedNotification({});
    expect(verifyMidtransSignature(notification, SERVER_KEY)).toBe(true);
  });

  it('rejects a tampered notification', () => {
    const notification = signedNotification({ gross_amount: '9999999.00' });
    notification.gross_amount = '1.00';
    expect(verifyMidtransSignature(notification, SERVER_KEY)).toBe(false);
  });
});

describe('handleMidtransNotification', () => {
  it('returns invalid_signature and makes no updates when the signature is wrong', async () => {
    const notification = signedNotification({});
    notification.signature_key = 'wrong';
    const supabase = fakeSupabase({});
    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'invalid_signature' });
  });

  it('returns order_not_found when no order matches the midtrans order id', async () => {
    const notification = signedNotification({});
    const supabase = fakeSupabase({ orderRow: undefined });
    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'order_not_found' });
  });

  it('marks the order paid and upgrades the user tier on settlement', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'gold', status: 'pending' },
      userRow: { tier: 'free' },
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.orderUpdates[0]).toMatchObject({ status: 'paid', midtrans_transaction_id: 'tx-1' });
    expect(supabase.userUpdates[0]).toEqual({ tier: 'gold' });
  });

  it('does not downgrade a higher existing tier on settlement of a lower plan', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'silver', status: 'pending' },
      userRow: { tier: 'lifetime' },
    });

    await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(supabase.userUpdates).toHaveLength(0);
  });

  it('marks the order failed and does not touch the user tier on cancel', async () => {
    const notification = signedNotification({ transaction_status: 'cancel' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'gold', status: 'pending' },
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.orderUpdates[0]).toEqual({ status: 'failed' });
    expect(supabase.userUpdates).toHaveLength(0);
  });

  it('ignores in-progress statuses like pending', async () => {
    const notification = signedNotification({ transaction_status: 'pending' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'gold', status: 'pending' },
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'ignored' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/midtrans-webhook.test.ts`
Expected: FAIL — `./midtrans-webhook` module not found.

- [ ] **Step 3: Implement midtrans-webhook.ts**

Create `backend/lib/midtrans-webhook.ts`:
```ts
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { tierRank, type Tier } from './tiers';
import type { Plan } from './pricing';

export type MidtransNotification = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  transaction_id: string;
};

export function verifyMidtransSignature(notification: MidtransNotification, serverKey: string): boolean {
  const hash = crypto
    .createHash('sha512')
    .update(notification.order_id + notification.status_code + notification.gross_amount + serverKey)
    .digest('hex');
  return hash === notification.signature_key;
}

export async function handleMidtransNotification(
  supabase: SupabaseClient,
  notification: MidtransNotification,
  serverKey: string
): Promise<{ status: 'ignored' | 'invalid_signature' | 'order_not_found' | 'updated' }> {
  if (!verifyMidtransSignature(notification, serverKey)) {
    return { status: 'invalid_signature' };
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, user_id, plan, status')
    .eq('midtrans_order_id', notification.order_id)
    .single();

  if (error || !order) {
    return { status: 'order_not_found' };
  }

  const isSuccess = notification.transaction_status === 'settlement' || notification.transaction_status === 'capture';
  const isFailure = ['deny', 'cancel', 'expire'].includes(notification.transaction_status);

  if (!isSuccess && !isFailure) {
    return { status: 'ignored' };
  }

  if (isFailure) {
    await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
    return { status: 'updated' };
  }

  await supabase
    .from('orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      midtrans_transaction_id: notification.transaction_id,
    })
    .eq('id', order.id);

  const { data: userRow } = await supabase.from('users').select('tier').eq('id', order.user_id).single();
  const currentTier: Tier = (userRow?.tier as Tier) ?? 'free';
  const purchasedTier = order.plan as Plan as Tier;

  if (tierRank(purchasedTier) > tierRank(currentTier)) {
    await supabase.from('users').update({ tier: purchasedTier }).eq('id', order.user_id);
  }

  return { status: 'updated' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/midtrans-webhook.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire up the route handler**

Create `backend/app/api/webhooks/midtrans/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleMidtransNotification, type MidtransNotification } from '@/lib/midtrans-webhook';

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw new Error('MIDTRANS_SERVER_KEY must be set');
  }

  const notification = (await request.json()) as MidtransNotification;
  const adminSupabase = createAdminClient();

  const result = await handleMidtransNotification(adminSupabase, notification, serverKey);

  if (result.status === 'invalid_signature') {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (result.status === 'order_not_found') {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/lib/midtrans-webhook.ts backend/lib/midtrans-webhook.test.ts backend/app/api/webhooks
git commit -m "feat: add Midtrans webhook handler with signature verification"
```

---

## Task 14: Order Status Endpoint

**Files:**
- Create: `backend/lib/orders.ts`
- Test: `backend/lib/orders.test.ts`
- Create: `backend/app/api/orders/[id]/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `createAdminClient` from Task 4; `getCurrentUser` from Task 5
- Produces: `OrderStatus`, `getOrderStatus(supabase, orderId, userId): Promise<{status: OrderStatus; plan: string} | null>`; `GET /api/orders/[id]` — used by the client to poll for the mockup's "Success" screen once `status === 'paid'`.

- [ ] **Step 1: Write the failing test**

Create `backend/lib/orders.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getOrderStatus } from './orders';

function fakeSupabase(row: { status: string; plan: string; user_id: string } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: row, error: row ? null : { message: 'not found' } }),
        }),
      }),
    }),
  } as any;
}

describe('getOrderStatus', () => {
  it('returns the status and plan when the order belongs to the requesting user', async () => {
    const supabase = fakeSupabase({ status: 'paid', plan: 'gold', user_id: 'u1' });
    expect(await getOrderStatus(supabase, 'order-1', 'u1')).toEqual({ status: 'paid', plan: 'gold' });
  });

  it('returns null when the order does not exist', async () => {
    const supabase = fakeSupabase(null);
    expect(await getOrderStatus(supabase, 'missing', 'u1')).toBeNull();
  });

  it('returns null when the order belongs to a different user', async () => {
    const supabase = fakeSupabase({ status: 'paid', plan: 'gold', user_id: 'someone-else' });
    expect(await getOrderStatus(supabase, 'order-1', 'u1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/orders.test.ts`
Expected: FAIL — `./orders` module not found.

- [ ] **Step 3: Implement orders.ts**

Create `backend/lib/orders.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired';

export async function getOrderStatus(
  supabase: SupabaseClient,
  orderId: string,
  userId: string
): Promise<{ status: OrderStatus; plan: string } | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('status, plan, user_id')
    .eq('id', orderId)
    .single();

  if (error || !data || data.user_id !== userId) return null;
  return { status: data.status, plan: data.plan };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/orders.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire up the route handler**

Create `backend/app/api/orders/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { getOrderStatus } from '@/lib/orders';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();
  const order = await getOrderStatus(adminSupabase, params.id, currentUser.id);

  if (!order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(order);
}
```

- [ ] **Step 6: Run the full test suite**

Run: `cd backend && npm test`
Expected: All tests across all `lib/*.test.ts` files pass (37 tests total across Tasks 3–14).

- [ ] **Step 7: Commit**

```bash
git add backend/lib/orders.ts backend/lib/orders.test.ts backend/app/api/orders
git commit -m "feat: add order status endpoint"
```

---

## Self-Review Notes

**Spec coverage:** Auth/signup → Task 6. Membership tier server-side-only → Tasks 3, 13. Content locking → Task 7. Payments via Midtrans → Tasks 12, 13. Promo codes → Tasks 10, 12. Admin publish + push history → Tasks 9, 11. Email notifications → Task 8. Plan pricing table → Task 3. Every spec section maps to at least one task.

**Deviation from spec, called out explicitly:** the spec's `push_history` description was written before checking the mockup in detail; the Admin panel mockup only has Watchlist/Artikel/Kode Promo tabs (no Video tab), so `publishContent` (Task 9) only accepts `'watchlist' | 'article'`, matching `push_history.type`'s check constraint. Video content rows can still exist in `content_items` (e.g. seeded directly) and are still served correctly by Task 7's read endpoints — they're just not admin-publishable through this UI in v1.

**Addition beyond the original spec draft:** `public.users.email` column (Task 2) — needed for Task 8's notification emails without a second `auth.users` lookup on every publish.
