# Membership Expiry & Renewal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add membership expiry tracking to `public.users`, prorate renewals/upgrades correctly on payment, and add a daily Vercel Cron job that reverts expired memberships to the free tier.

**Architecture:** One new nullable column (`users.expires_at`). A new pure function `calculateNewExpiry` in `lib/membership.ts` computes the next `{ tier, expiresAt }` state from the user's current state and the plan just paid for; `lib/midtrans-webhook.ts` calls it instead of its current tier-rank comparison. A new authenticated route `POST /api/cron/expire-memberships`, scheduled via `vercel.json`, batch-resets expired users.

**Tech Stack:** Next.js 14 App Router Route Handlers, TypeScript, Supabase (Postgres via `@supabase/supabase-js`), Vitest, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-09-27-membership-expiry-cron-design.md`

## Global Constraints

- Plan durations (days), fixed by the user: Silver = 120, Gold = 270, Platinum = 540, Lifetime = no expiry (`null`).
- No new tables — only `public.users.expires_at` is added, per spec.
- `calculateNewExpiry` must be a pure function (no I/O, `now` passed as a parameter) so it is exhaustively unit-testable per spec's Testing section.
- Cron route must reject requests without a matching `CRON_SECRET` bearer token with HTTP 401.
- Cron schedule: `5 17 * * *` (17:05 UTC = 00:05 WIB), per spec.

---

### Task 1: Add `duration_days` to the plan pricing table

**Files:**
- Modify: `lib/pricing.ts`
- Test: `lib/pricing.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PLAN_DURATIONS: Record<Plan, number | null>` and `durationDaysFor(plan: Plan): number | null`, used by Task 2 (`lib/membership.ts`).

- [ ] **Step 1: Read the existing test file to match its style**

Run: `cat lib/pricing.test.ts`

- [ ] **Step 2: Write the failing tests**

Add to `lib/pricing.test.ts`:

```typescript
import { durationDaysFor } from './pricing';

describe('durationDaysFor', () => {
  it('returns 120 for silver', () => {
    expect(durationDaysFor('silver')).toBe(120);
  });

  it('returns 270 for gold', () => {
    expect(durationDaysFor('gold')).toBe(270);
  });

  it('returns 540 for platinum', () => {
    expect(durationDaysFor('platinum')).toBe(540);
  });

  it('returns null for lifetime', () => {
    expect(durationDaysFor('lifetime')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- pricing.test.ts`
Expected: FAIL with "durationDaysFor is not a function" or similar import error.

- [ ] **Step 4: Implement**

In `lib/pricing.ts`, add after `PLAN_PRICES`:

```typescript
export const PLAN_DURATIONS: Record<Plan, number | null> = {
  silver: 120,
  gold: 270,
  platinum: 540,
  lifetime: null,
};

export function durationDaysFor(plan: Plan): number | null {
  return PLAN_DURATIONS[plan];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- pricing.test.ts`
Expected: PASS, all tests including pre-existing ones green.

- [ ] **Step 6: Commit**

```bash
git add lib/pricing.ts lib/pricing.test.ts
git commit -m "feat: add plan durations to pricing table"
```

---

### Task 2: `calculateNewExpiry` pure function

**Files:**
- Create: `lib/membership.ts`
- Test: `lib/membership.test.ts`

**Interfaces:**
- Consumes: `Plan` type and `durationDaysFor`, `basePriceFor` from `lib/pricing.ts` (Task 1); `Tier` type from `lib/tiers.ts`.
- Produces: `MembershipState = { tier: Tier; expiresAt: Date | null }` and `calculateNewExpiry(now: Date, current: MembershipState, purchasedPlan: Plan): MembershipState`, used by Task 3 (`lib/midtrans-webhook.ts`).

- [ ] **Step 1: Write the failing tests**

Create `lib/membership.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateNewExpiry } from './membership';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('calculateNewExpiry', () => {
  it('buying lifetime always wins and clears expiresAt, regardless of current state', () => {
    const result = calculateNewExpiry(NOW, { tier: 'gold', expiresAt: new Date(NOW.getTime() + 30 * DAY_MS) }, 'lifetime');
    expect(result).toEqual({ tier: 'lifetime', expiresAt: null });
  });

  it('buying lifetime from free also wins', () => {
    const result = calculateNewExpiry(NOW, { tier: 'free', expiresAt: null }, 'lifetime');
    expect(result).toEqual({ tier: 'lifetime', expiresAt: null });
  });

  it('already being lifetime stays lifetime no matter what plan is purchased next', () => {
    const result = calculateNewExpiry(NOW, { tier: 'lifetime', expiresAt: null }, 'silver');
    expect(result).toEqual({ tier: 'lifetime', expiresAt: null });
  });

  it('first purchase from free starts counting from now', () => {
    const result = calculateNewExpiry(NOW, { tier: 'free', expiresAt: null }, 'silver');
    expect(result.tier).toBe('silver');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + 120 * DAY_MS));
  });

  it('purchase after a past expiry starts counting from now, not from the old expiry', () => {
    const pastExpiry = new Date(NOW.getTime() - 10 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'silver', expiresAt: pastExpiry }, 'gold');
    expect(result.tier).toBe('gold');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + 270 * DAY_MS));
  });

  it('renewing the same plan before expiry stacks remaining days', () => {
    const futureExpiry = new Date(NOW.getTime() + 30 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'silver', expiresAt: futureExpiry }, 'silver');
    expect(result.tier).toBe('silver');
    // max(now, futureExpiry) + 120 days = futureExpiry + 120 days
    expect(result.expiresAt).toEqual(new Date(futureExpiry.getTime() + 120 * DAY_MS));
  });

  it('upgrading mid-cycle prorates remaining value of the old plan into days of the new plan', () => {
    // silver: 1,500,000 / 120 days = 12,500/day. 60 days remaining => remaining_value = 750,000.
    // gold: 2,600,000 / 270 days = 9,629.6296.../day. converted_days = floor(750000 / 9629.6296...) = 77
    const futureExpiry = new Date(NOW.getTime() + 60 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'silver', expiresAt: futureExpiry }, 'gold');
    expect(result.tier).toBe('gold');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + (270 + 77) * DAY_MS));
  });

  it('downgrading mid-cycle prorates remaining value of the old plan into days of the new (cheaper) plan', () => {
    // gold: 2,600,000 / 270 days = 9,629.6296.../day. 90 days remaining => remaining_value = 866,666.67 (before rounding in remaining_days ceil)
    // silver: 1,500,000 / 120 days = 12,500/day. converted_days = floor(866666.67 / 12500) = 69
    const futureExpiry = new Date(NOW.getTime() + 90 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'gold', expiresAt: futureExpiry }, 'silver');
    expect(result.tier).toBe('silver');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + (120 + 69) * DAY_MS));
  });

  it('remaining_days uses ceil on partial days', () => {
    // 1.5 days remaining -> ceil = 2 days. silver daily rate 12,500 => remaining_value = 25,000.
    // buying platinum: 4,200,000 / 540 days = 7,777.77.../day. converted_days = floor(25000 / 7777.77...) = 3
    const futureExpiry = new Date(NOW.getTime() + 1.5 * DAY_MS);
    const result = calculateNewExpiry(NOW, { tier: 'silver', expiresAt: futureExpiry }, 'platinum');
    expect(result.tier).toBe('platinum');
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + (540 + 3) * DAY_MS));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- membership.test.ts`
Expected: FAIL — `lib/membership.ts` does not exist yet.

- [ ] **Step 3: Implement**

Create `lib/membership.ts`:

```typescript
import type { Tier } from './tiers';
import { type Plan, basePriceFor, durationDaysFor } from './pricing';

export type MembershipState = {
  tier: Tier;
  expiresAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dailyRate(plan: Plan): number {
  const duration = durationDaysFor(plan);
  if (duration === null) {
    throw new Error(`dailyRate is undefined for plan without a duration: ${plan}`);
  }
  return basePriceFor(plan) / duration;
}

export function calculateNewExpiry(now: Date, current: MembershipState, purchasedPlan: Plan): MembershipState {
  if (current.tier === 'lifetime') {
    // Lifetime has no expiresAt to prorate against and is never demoted by a further purchase.
    return { tier: 'lifetime', expiresAt: null };
  }

  if (purchasedPlan === 'lifetime') {
    return { tier: 'lifetime', expiresAt: null };
  }

  const purchasedDurationDays = durationDaysFor(purchasedPlan);
  if (purchasedDurationDays === null) {
    throw new Error(`Unexpected null duration for non-lifetime plan: ${purchasedPlan}`);
  }

  const hasActiveMembership = current.expiresAt !== null && current.expiresAt.getTime() > now.getTime();

  if (!hasActiveMembership) {
    return {
      tier: purchasedPlan,
      expiresAt: new Date(now.getTime() + purchasedDurationDays * DAY_MS),
    };
  }

  if (current.tier === purchasedPlan) {
    const base = Math.max(now.getTime(), current.expiresAt!.getTime());
    return {
      tier: purchasedPlan,
      expiresAt: new Date(base + purchasedDurationDays * DAY_MS),
    };
  }

  const remainingMs = current.expiresAt!.getTime() - now.getTime();
  const remainingDays = Math.ceil(remainingMs / DAY_MS);
  const remainingValue = remainingDays * dailyRate(current.tier as Plan);
  const convertedDays = Math.floor(remainingValue / dailyRate(purchasedPlan));

  return {
    tier: purchasedPlan,
    expiresAt: new Date(now.getTime() + (purchasedDurationDays + convertedDays) * DAY_MS),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- membership.test.ts`
Expected: PASS, all 9 tests green. If the proration arithmetic tests (`upgrading mid-cycle`, `downgrading mid-cycle`, `remaining_days uses ceil`) fail due to a rounding mismatch, print the actual `expiresAt` value and recompute the expected day count by hand using the same `dailyRate`/`Math.floor` order of operations shown in Step 3 — do not loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add lib/membership.ts lib/membership.test.ts
git commit -m "feat: add membership expiry calculation with renewal/upgrade proration"
```

---

### Task 3: Wire `calculateNewExpiry` into the Midtrans webhook

**Files:**
- Modify: `lib/midtrans-webhook.ts:70-88` (the tier-upgrade block inside `handleMidtransNotification`)
- Modify: `lib/midtrans-webhook.test.ts` (update existing tier-assertion tests, add `expires_at` assertions)

**Interfaces:**
- Consumes: `calculateNewExpiry`, `MembershipState` from `lib/membership.ts` (Task 2).
- Produces: no new exports — `handleMidtransNotification`'s signature and `{status}` return shape are unchanged; only what it writes to `users` changes.

- [ ] **Step 1: Update the existing test fixtures to include `expires_at` in the mocked user row**

In `lib/midtrans-webhook.test.ts`, `fakeSupabase` currently returns `{ tier: 'free' }` as the default user row (see `single: async () => ({ data: opts.userRow ?? { tier: 'free' }, error: null })`). Change the default and every `userRow` passed in tests to include `expires_at: null`, e.g. `{ tier: 'free', expires_at: null }`, and update the `users.select()` call inside `handleMidtransNotification` (Step 3 below) to select `expires_at` too.

- [ ] **Step 2: Update the two existing behavioral assertions that will change**

Replace:

```typescript
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
```

with:

```typescript
  it('marks the order paid and sets tier + expires_at on settlement from free', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'gold', status: 'pending' },
      userRow: { tier: 'free', expires_at: null },
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.orderUpdates[0]).toMatchObject({ status: 'paid', midtrans_transaction_id: 'tx-1' });
    expect(supabase.userUpdates[0].tier).toBe('gold');
    expect(supabase.userUpdates[0].expires_at).not.toBeNull();
  });

  it('does not downgrade a lifetime user who buys a lower plan', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'silver', status: 'pending' },
      userRow: { tier: 'lifetime', expires_at: null },
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.userUpdates[0]).toEqual({ tier: 'lifetime', expires_at: null });
  });
```

- [ ] **Step 3: Run tests to verify the updated/new tests fail**

Run: `npm test -- midtrans-webhook.test.ts`
Expected: FAIL — `userUpdates[0]` still only contains `{ tier: ... }`, no `expires_at`; the `tierRank` comparison still blocks the lifetime-then-silver case (current behavior: `userUpdates` stays empty because `tierRank('silver') < tierRank('lifetime')`).

- [ ] **Step 4: Implement the webhook change**

In `lib/midtrans-webhook.ts`, replace the imports and the tier-upgrade block:

```typescript
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tier } from './tiers';
import type { Plan } from './pricing';
import { calculateNewExpiry } from './membership';
```

(removes the now-unused `tierRank` import)

Replace:

```typescript
  const { data: userRow, error: userReadError } = await supabase
    .from('users')
    .select('tier')
    .eq('id', order.user_id)
    .single();

  if (userReadError) {
    return { status: 'write_failed' };
  }

  const currentTier: Tier = (userRow?.tier as Tier) ?? 'free';
  const purchasedTier = order.plan as Plan as Tier;

  if (tierRank(purchasedTier) > tierRank(currentTier)) {
    const { error: tierUpdateError } = await supabase.from('users').update({ tier: purchasedTier }).eq('id', order.user_id);
    if (tierUpdateError) {
      return { status: 'write_failed' };
    }
  }

  return { status: 'updated' };
```

with:

```typescript
  const { data: userRow, error: userReadError } = await supabase
    .from('users')
    .select('tier, expires_at')
    .eq('id', order.user_id)
    .single();

  if (userReadError) {
    return { status: 'write_failed' };
  }

  const currentTier: Tier = (userRow?.tier as Tier) ?? 'free';
  const currentExpiresAt = userRow?.expires_at ? new Date(userRow.expires_at) : null;
  const purchasedPlan = order.plan as Plan;

  const newState = calculateNewExpiry(new Date(), { tier: currentTier, expiresAt: currentExpiresAt }, purchasedPlan);

  const { error: tierUpdateError } = await supabase
    .from('users')
    .update({ tier: newState.tier, expires_at: newState.expiresAt ? newState.expiresAt.toISOString() : null })
    .eq('id', order.user_id);
  if (tierUpdateError) {
    return { status: 'write_failed' };
  }

  return { status: 'updated' };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- midtrans-webhook.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS. If any other test imports `tierRank` from a shared fixture expecting the old webhook behavior, fix that test's expectations to match the new proration-based behavior — do not reintroduce the old comparison logic.

- [ ] **Step 7: Commit**

```bash
git add lib/midtrans-webhook.ts lib/midtrans-webhook.test.ts
git commit -m "feat: apply membership expiry calculation on payment webhook"
```

---

### Task 4: Migration — add `expires_at` to `users`

**Files:**
- Create: `supabase/migrations/0002_add_membership_expiry.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.users.expires_at timestamptz` column, read/written by Task 3 (already done) and Task 5 (cron route).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_add_membership_expiry.sql`:

```sql
alter table public.users
  add column expires_at timestamptz;
```

- [ ] **Step 2: Verify the migration is syntactically valid**

Run: `cat supabase/migrations/0002_add_membership_expiry.sql`
Manually confirm it matches the single-statement form above — this migration has no rollback step because it only adds a nullable column with no default-data backfill needed (existing rows get `expires_at = null`, which correctly represents "no known expiry yet" for their current denormalized tier).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_add_membership_expiry.sql
git commit -m "feat: add expires_at column to users table"
```

Note: this migration is applied to the real Supabase project via `supabase db push` per `README.md`'s existing deployment steps — it is not run by the test suite (Vitest tests in this repo mock the Supabase client, per `lib/midtrans-webhook.test.ts`'s `fakeSupabase`).

---

### Task 5: Cron route `POST /api/cron/expire-memberships`

**Files:**
- Modify: `vitest.config.ts` (add `@/` alias resolution — no existing test imports a route handler or uses the `@/...` alias, so this is currently unconfigured for the test runner even though `tsconfig.json` defines it for the Next.js build)
- Create: `app/api/cron/expire-memberships/route.ts`
- Test: `app/api/cron/expire-memberships/route.test.ts`
- Modify: `.env.local.example` (add `CRON_SECRET`)

**Interfaces:**
- Consumes: `createAdminClient` from `lib/supabase/admin.ts` (existing).
- Produces: `POST` handler at this route path, invoked by Vercel Cron (Task 6) with header `Authorization: Bearer <CRON_SECRET>`.

- [ ] **Step 1: Add `@/` alias resolution to the Vitest config**

Replace the full contents of `vitest.config.ts`:

```typescript
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
  },
});
```

Run: `npm test`
Expected: PASS — this change is additive (only adds alias resolution), so every existing test must still pass unchanged. If anything fails here, stop and fix the alias path before continuing; nothing below this point will work otherwise.

- [ ] **Step 2: Write the failing tests**

Create `app/api/cron/expire-memberships/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdminClient = { from: vi.fn() };
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}));

import { POST } from './route';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return new Request('http://localhost/api/cron/expire-memberships', { method: 'POST', headers });
}

describe('POST /api/cron/expire-memberships', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    mockAdminClient.from.mockReset();
  });

  it('returns 401 when the authorization header is missing', async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
  });

  it('returns 401 when the bearer token does not match CRON_SECRET', async () => {
    const response = await POST(makeRequest('Bearer wrong-secret'));
    expect(response.status).toBe(401);
  });

  it('resets expired users to free tier and returns the count', async () => {
    mockAdminClient.from.mockReturnValue({
      update: () => ({
        lt: () => ({
          not: () => ({
            neq: () => ({
              select: () => Promise.resolve({ data: [{ id: 'u1' }, { id: 'u2' }], error: null }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ expired_count: 2 });
  });

  it('returns 500 when the database update fails', async () => {
    mockAdminClient.from.mockReturnValue({
      update: () => ({
        lt: () => ({
          not: () => ({
            neq: () => ({
              select: () => Promise.resolve({ data: null, error: { message: 'db error' } }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(makeRequest('Bearer test-secret'));
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- app/api/cron/expire-memberships/route.test.ts`
Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 4: Implement the route**

Create `app/api/cron/expire-memberships/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    throw new Error('CRON_SECRET must be set');
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('users')
    .update({ tier: 'free', expires_at: null })
    .lt('expires_at', nowIso)
    .not('expires_at', 'is', null)
    .neq('tier', 'free')
    .select('id');

  if (error) {
    return NextResponse.json({ error: 'Failed to expire memberships' }, { status: 500 });
  }

  return NextResponse.json({ expired_count: data?.length ?? 0 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- app/api/cron/expire-memberships/route.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 6: Add `CRON_SECRET` to the env example**

In `.env.local.example`, append:

```
CRON_SECRET=your-random-cron-secret
```

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts app/api/cron/expire-memberships/route.ts app/api/cron/expire-memberships/route.test.ts .env.local.example
git commit -m "feat: add expire-memberships cron route"
```

---

### Task 6: Schedule the cron job and document deployment steps

**Files:**
- Create: `vercel.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the route from Task 5 (`/api/cron/expire-memberships`).
- Produces: nothing consumed by later tasks — this is the final wiring step.

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/expire-memberships",
      "schedule": "5 17 * * *"
    }
  ]
}
```

- [ ] **Step 2: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8'))"`
Expected: no output (no parse error).

- [ ] **Step 3: Document the new env var and cron behavior in `README.md`**

In `README.md`, after the existing numbered setup step about registering the Midtrans webhook URL, add a new step:

```markdown
5. Generate a random value for `CRON_SECRET` (e.g. `openssl rand -hex 32`) and set it in both `.env.local` and your Vercel project's environment variables. Vercel Cron calls `POST /api/cron/expire-memberships` daily at 00:05 WIB with this value as a bearer token; without it the route rejects every request with 401.
```

Renumber the subsequent existing steps accordingly.

- [ ] **Step 4: Commit**

```bash
git add vercel.json README.md
git commit -m "docs: schedule expire-memberships cron and document CRON_SECRET"
```

---

## Post-Plan Verification

- [ ] Run the full suite once more end to end: `npm test` — expect all tests passing, no `.only`/`.skip` left behind.
- [ ] Confirm `git log --oneline -6` shows the six commits from Tasks 1–6 in order.

## Out of Scope (do not implement here)

- Telegram invite-link/auto-kick integration — separate spec, depends on `users.expires_at` added in Task 4.
- Hourly expiry of stale `pending` orders.
- Auto-deactivating expired promo codes.
- A `plans` database table (durations/prices stay hardcoded in `lib/pricing.ts`).
