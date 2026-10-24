# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two admin-only screens — content management (create/edit/delete video, article, watchlist) and member management (view + manually adjust tier/expiry with an audit trail) — plus the five new/changed backend routes they need.

**Architecture:** New backend routes follow the exact pattern already established by `app/api/admin/promo-codes/[id]/route.ts` and `lib/admin-promo.ts` (session check → isAdmin check → validate body → call a `lib/` function that does the Supabase work). The member tier/expiry edit and its audit-log write happen atomically via a new Postgres RPC function, mirroring `apply_membership_grant`. Frontend pages reuse the member frontend's established patterns: a route-group layout with a server-side auth gate, Tailwind `brand-*` tokens, and the typed `lib/api-client.ts` wrapper (extended, not replaced).

**Tech Stack:** Same as the rest of `backend/`: Next.js App Router, Tailwind CSS, Supabase (Postgres + `@supabase/ssr`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-24-admin-panel-design.md`

## Global Constraints

- No new frontend framework/library choices — same stack as the member frontend.
- Every new API route independently re-checks `isAdmin` server-side (the frontend gate is convenience, never the security boundary).
- Deleting a content item must always succeed, even for items with existing `push_history` rows (`push_history.content_item_id` becomes `ON DELETE SET NULL`).
- A member tier/expiry edit and its audit-log row are written atomically via one Postgres RPC call — never two separate client-side writes.
- Visual style reuses the Tailwind `brand-*` tokens and card/button patterns already established by the member frontend (`bg-white rounded-2xl shadow-sm`, `brand-gold`/`brand-dark` pills).
- No self-service admin creation — out of scope, unchanged.

## Review Focus

- **A non-admin, logged-in member hitting any of the 5 new/changed admin routes directly** (not through the UI): every one must return 403, not data. Covered in Tasks 3 and 5's route tests.
- **Deleting a content item that has a `push_history` row** (true for nearly every real item once published): must succeed, not throw a foreign-key error. Covered in Task 1's migration verification and Task 3's delete test.
- **Editing a video content item's payload without `provider_asset_id`**: must be rejected the same way the create route already rejects it, not silently accepted with a broken video. Covered in Task 2.
- **A member tier/expiry edit for a user id that doesn't exist**: must fail cleanly (not silently succeed or write a garbage audit row for a nonexistent user). Covered in Task 4's RPC test.
- **Visiting `/admin/content` or `/admin/members` while logged in but not an admin**: must redirect to `/home`, not show a blank page or leak data before redirecting. Covered in Task 6.

---

## Task 1: Migration — delete-safe content, member audit table, atomic update RPC

**Files:**
- Create: `backend/supabase/migrations/0011_admin_panel.sql`

**Interfaces:**
- Produces: `public.member_edits` table (columns: `id uuid pk`, `user_id uuid`, `admin_id uuid`, `old_tier text`, `new_tier text`, `old_expires_at timestamptz`, `new_expires_at timestamptz`, `created_at timestamptz default now()`), and `public.admin_update_member(p_user_id uuid, p_admin_id uuid, p_new_tier text, p_new_expires_at timestamptz) returns void` — Task 4 calls this via `supabase.rpc('admin_update_member', {...})`.

- [ ] **Step 1: Write the migration**

```sql
-- backend/supabase/migrations/0011_admin_panel.sql

-- Deleting a content item currently fails for nearly every real item: publishContent()
-- (lib/admin-content.ts) inserts a push_history row on every publish, and the original FK
-- has no ON DELETE clause (defaults to NO ACTION/restrict). The admin panel's delete action
-- must always succeed, so the history record survives, decoupled from the deleted item.
alter table public.push_history drop constraint push_history_content_item_id_fkey;
alter table public.push_history alter column content_item_id drop not null;
alter table public.push_history add constraint push_history_content_item_id_fkey
  foreign key (content_item_id) references public.content_items(id) on delete set null;

-- Records every manual admin override of a member's tier/expiry, per the admin panel spec's
-- anti-goal that such an edit must never go unrecorded.
create table public.member_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  admin_id uuid not null references public.users(id),
  old_tier text,
  new_tier text not null,
  old_expires_at timestamptz,
  new_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index member_edits_user_id_created_at_idx on public.member_edits (user_id, created_at desc);

alter table public.member_edits enable row level security;

-- Atomically updates a member's tier/expiry and records the audit row in the same
-- transaction, mirroring apply_membership_grant's shape (0003_apply_membership_grant.sql) --
-- the same "two writes must not get out of sync" case, except here an unrecorded edit is
-- the anti-goal rather than a missed membership grant.
create or replace function public.admin_update_member(
  p_user_id uuid,
  p_admin_id uuid,
  p_new_tier text,
  p_new_expires_at timestamptz
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_old_tier text;
  v_old_expires_at timestamptz;
begin
  select tier, expires_at into v_old_tier, v_old_expires_at
  from public.users where id = p_user_id for update;

  if not found then
    raise exception 'user_not_found';
  end if;

  update public.users
  set tier = p_new_tier, expires_at = p_new_expires_at
  where id = p_user_id;

  insert into public.member_edits (user_id, admin_id, old_tier, new_tier, old_expires_at, new_expires_at)
  values (p_user_id, p_admin_id, v_old_tier, p_new_tier, v_old_expires_at, p_new_expires_at);
end;
$$;

revoke execute on function public.admin_update_member(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_update_member(uuid, uuid, text, timestamptz) to service_role;
```

- [ ] **Step 2: Apply the migration to the real Supabase project**

Use the Supabase MCP tool's `apply_migration` (project id `tufibjwjysyqxnbcfvxp`, name `admin_panel`, query = the SQL above verbatim). If `push_history_content_item_id_fkey` is not the constraint's actual name, first query `select conname from pg_constraint where conrelid = 'public.push_history'::regclass and contype = 'f';` via `execute_sql` and substitute the real name before applying.

- [ ] **Step 3: Verify the delete-safety fix with real data**

Via `execute_sql`: insert a throwaway `content_items` row, insert a `push_history` row referencing it, then `delete from public.content_items where id = '<that id>'` — confirm it succeeds (previously would have thrown `violates foreign key constraint`) and that the `push_history` row still exists with `content_item_id` now `null`. Clean up the `push_history` row afterward.

- [ ] **Step 4: Verify the RPC function directly**

Via `execute_sql`: pick a real user id and a real admin id (e.g. the existing admin `socialtradevip@gmail.com`), call `select public.admin_update_member('<user_id>', '<admin_id>', 'gold', null);`, then confirm `public.users` shows the new tier and `public.member_edits` has one row with the correct `old_tier`/`new_tier`. Revert the test user's tier back to what it was before, and delete the test `member_edits` row.

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/migrations/0011_admin_panel.sql
git commit -m "feat: add admin panel migration (delete-safe content, member audit log, atomic update RPC)"
```

---

## Task 2: Content admin functions

**Files:**
- Modify: `backend/lib/admin-content.ts`
- Modify: `backend/lib/admin-content.test.ts`

**Interfaces:**
- Consumes: `ContentRow`, `ContentType` from `./content-access` (already defined — `backend/lib/content-access.ts`), `Tier` from `./tiers`.
- Produces: `listAllContent(supabase): Promise<ContentRow[]>`, `updateContent(supabase, id: string, input: { title?: string; required_tier?: Tier; payload?: Record<string, unknown> }): Promise<{ status: 'ok' } | { status: 'not_found' } | { status: 'invalid_payload' }>`, `deleteContent(supabase, id: string): Promise<void>` — Task 3's routes call these by name.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/lib/admin-content.test.ts -- add to the existing file
import { listAllContent, updateContent, deleteContent } from './admin-content';

describe('listAllContent', () => {
  it('returns every content item unfiltered, including locked-tier items', async () => {
    const rows = [
      { id: '1', type: 'video', title: 'Free video', required_tier: 'free', payload: {}, published_at: '2026-01-01' },
      { id: '2', type: 'video', title: 'Platinum video', required_tier: 'platinum', payload: {}, published_at: '2026-01-02' },
    ];
    const supabase = {
      from: () => ({ select: () => ({ order: async () => ({ data: rows, error: null }) }) }),
    } as any;

    const result = await listAllContent(supabase);

    expect(result).toEqual(rows);
  });
});

describe('updateContent', () => {
  function fakeSupabase(existingRow: any) {
    const updates: any[] = [];
    return {
      updates,
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: existingRow, error: null }) }) }),
        update: (patch: any) => ({
          eq: async (_col: string, id: string) => {
            updates.push({ id, patch });
            return { error: null };
          },
        }),
      }),
    } as any;
  }

  it('updates title/required_tier/payload and returns ok', async () => {
    const supabase = fakeSupabase({ id: 'c1', type: 'article', title: 'Old', required_tier: 'free', payload: {} });

    const result = await updateContent(supabase, 'c1', { title: 'New title', required_tier: 'gold' });

    expect(result).toEqual({ status: 'ok' });
    expect(supabase.updates[0].patch).toMatchObject({ title: 'New title', required_tier: 'gold' });
  });

  it('returns not_found when the content item does not exist', async () => {
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'no rows' } }) }) }) }),
    } as any;

    const result = await updateContent(supabase, 'missing', { title: 'X' });

    expect(result).toEqual({ status: 'not_found' });
  });

  it('rejects a video payload update missing provider_asset_id', async () => {
    const supabase = fakeSupabase({ id: 'c1', type: 'video', title: 'Vid', required_tier: 'free', payload: { provider_asset_id: 'abc' } });

    const result = await updateContent(supabase, 'c1', { payload: { duration_sec: 120 } });

    expect(result).toEqual({ status: 'invalid_payload' });
  });
});

describe('deleteContent', () => {
  it('deletes the row', async () => {
    const deleted: string[] = [];
    const supabase = {
      from: () => ({ delete: () => ({ eq: async (_col: string, id: string) => { deleted.push(id); return { error: null }; } }) }),
    } as any;

    await deleteContent(supabase, 'c1');

    expect(deleted).toEqual(['c1']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run lib/admin-content.test.ts`
Expected: FAIL — `listAllContent`, `updateContent`, `deleteContent` are not exported yet.

- [ ] **Step 3: Implement the three functions in `backend/lib/admin-content.ts`**

Add these exports alongside the existing `publishContent`:

```typescript
import type { ContentRow, ContentType } from './content-access';
import type { Tier } from './tiers';

export async function listAllContent(supabase: SupabaseClient): Promise<ContentRow[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, type, title, required_tier, payload, published_at')
    .order('published_at', { ascending: false });
  if (error || !data) return [];
  return data as ContentRow[];
}

export type UpdateContentInput = Partial<{
  title: string;
  required_tier: Tier;
  payload: Record<string, unknown>;
}>;

export async function updateContent(
  supabase: SupabaseClient,
  id: string,
  input: UpdateContentInput
): Promise<{ status: 'ok' } | { status: 'not_found' } | { status: 'invalid_payload' }> {
  const { data: existing, error: fetchError } = await supabase
    .from('content_items')
    .select('id, type')
    .eq('id', id)
    .single();
  if (fetchError || !existing) return { status: 'not_found' };

  if (
    input.payload !== undefined &&
    existing.type === 'video' &&
    (typeof input.payload.provider_asset_id !== 'string' || !input.payload.provider_asset_id.trim())
  ) {
    return { status: 'invalid_payload' };
  }

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.required_tier !== undefined) patch.required_tier = input.required_tier;
  if (input.payload !== undefined) patch.payload = input.payload;

  const { error } = await supabase.from('content_items').update(patch).eq('id', id);
  if (error) throw new Error('Failed to update content item');
  return { status: 'ok' };
}

export async function deleteContent(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('content_items').delete().eq('id', id);
  if (error) throw new Error('Failed to delete content item');
}
```

(`ContentType` import above is unused by these three functions but kept for symmetry with the file's existing `PublishContentInput['type']` field — omit it if your editor flags it as unused.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run lib/admin-content.test.ts`
Expected: PASS, all tests including the pre-existing `publishContent` ones.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/admin-content.ts backend/lib/admin-content.test.ts
git commit -m "feat: add listAllContent, updateContent, deleteContent"
```

---

## Task 3: Content admin routes

**Files:**
- Modify: `backend/app/api/admin/content/route.ts` (add `GET`)
- Create: `backend/app/api/admin/content/[id]/route.ts` (`PATCH`, `DELETE`)
- Create: `backend/app/api/admin/content/[id]/route.test.ts`

**Interfaces:**
- Consumes: `listAllContent`, `updateContent`, `deleteContent` (Task 2).
- Produces: `GET /api/admin/content` → `{ items: ContentRow[] }`; `PATCH /api/admin/content/:id` → `{ ok: true }` or `{ error }`; `DELETE /api/admin/content/:id` → `{ ok: true }`.

- [ ] **Step 1: Add the GET handler to the existing content route**

First, change the existing `import { publishContent } from '@/lib/admin-content';` line to `import { publishContent, listAllContent } from '@/lib/admin-content';` (one import line, not two). Then add:

```typescript
// backend/app/api/admin/content/route.ts -- add alongside the existing POST export
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
  const items = await listAllContent(adminSupabase);
  return NextResponse.json({ items });
}
```

- [ ] **Step 2: Write the failing tests for the `[id]` route**

```typescript
// backend/app/api/admin/content/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

const getCurrentUserMock = vi.fn();
vi.mock('@/lib/current-user', () => ({ getCurrentUser: (...args: any[]) => getCurrentUserMock(...args) }));

const updateContentMock = vi.fn();
const deleteContentMock = vi.fn();
vi.mock('@/lib/admin-content', () => ({
  updateContent: (...args: any[]) => updateContentMock(...args),
  deleteContent: (...args: any[]) => deleteContentMock(...args),
}));

import { PATCH, DELETE } from './route';

function makeRequest(body?: any): Request {
  return new Request('http://localhost/api/admin/content/c1', {
    method: body ? 'PATCH' : 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  updateContentMock.mockReset();
  deleteContentMock.mockReset();
});

describe('PATCH /api/admin/content/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const response = await PATCH(makeRequest({ title: 'X' }), { params: { id: 'c1' } });
    expect(response.status).toBe(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: false });
    const response = await PATCH(makeRequest({ title: 'X' }), { params: { id: 'c1' } });
    expect(response.status).toBe(403);
  });

  it('returns 200 and calls updateContent for an admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    updateContentMock.mockResolvedValueOnce({ status: 'ok' });

    const response = await PATCH(makeRequest({ title: 'New title' }), { params: { id: 'c1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(updateContentMock).toHaveBeenCalledWith(expect.anything(), 'c1', { title: 'New title' });
  });

  it('returns 400 when updateContent reports invalid_payload', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    updateContentMock.mockResolvedValueOnce({ status: 'invalid_payload' });

    const response = await PATCH(makeRequest({ payload: {} }), { params: { id: 'c1' } });
    expect(response.status).toBe(400);
  });

  it('returns 404 when updateContent reports not_found', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    updateContentMock.mockResolvedValueOnce({ status: 'not_found' });

    const response = await PATCH(makeRequest({ title: 'X' }), { params: { id: 'missing' } });
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/admin/content/[id]', () => {
  it('returns 403 when authenticated but not admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: false });
    const response = await DELETE(makeRequest(), { params: { id: 'c1' } });
    expect(response.status).toBe(403);
  });

  it('returns 200 and calls deleteContent for an admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    deleteContentMock.mockResolvedValueOnce(undefined);

    const response = await DELETE(makeRequest(), { params: { id: 'c1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(deleteContentMock).toHaveBeenCalledWith(expect.anything(), 'c1');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npx vitest run "app/api/admin/content/[id]/route.test.ts"`
Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 4: Implement `backend/app/api/admin/content/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { updateContent, deleteContent } from '@/lib/admin-content';

const VALID_TIERS = ['free', 'silver', 'gold', 'platinum', 'lifetime'];

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
  const { title, required_tier, payload } = body ?? {};

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 });
  }
  if (required_tier !== undefined && !VALID_TIERS.includes(required_tier)) {
    return NextResponse.json({ error: `required_tier must be one of ${VALID_TIERS.join(', ')}` }, { status: 400 });
  }
  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return NextResponse.json({ error: 'payload must be an object' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const result = await updateContent(adminSupabase, params.id, { title, required_tier, payload });

  if (result.status === 'not_found') {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }
  if (result.status === 'invalid_payload') {
    return NextResponse.json({ error: 'payload.provider_asset_id is required for video content' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  await deleteContent(adminSupabase, params.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run "app/api/admin/content/[id]/route.test.ts"`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/admin/content/route.ts "backend/app/api/admin/content/[id]/route.ts" "backend/app/api/admin/content/[id]/route.test.ts"
git commit -m "feat: add admin content list/edit/delete routes"
```

---

## Task 4: Member admin functions

**Files:**
- Modify: `backend/lib/admin-members.ts`
- Modify: `backend/lib/admin-members.test.ts`

**Interfaces:**
- Produces: `updateMemberTier(supabase, input: { userId: string; adminId: string; tier: string; expiresAt: string | null }): Promise<{ status: 'ok' } | { status: 'not_found' }>`, `MemberEditRow` type, `getMemberAuditHistory(supabase, userId: string): Promise<MemberEditRow[]>` — Task 5's routes call these by name.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/lib/admin-members.test.ts -- add to the existing file
import { updateMemberTier, getMemberAuditHistory } from './admin-members';

describe('updateMemberTier', () => {
  it('calls the admin_update_member RPC with the given values and returns ok', async () => {
    const rpcCalls: any[] = [];
    const supabase = {
      rpc: async (fn: string, args: any) => {
        rpcCalls.push({ fn, args });
        return { error: null };
      },
    } as any;

    const result = await updateMemberTier(supabase, {
      userId: 'u1',
      adminId: 'admin1',
      tier: 'gold',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });

    expect(result).toEqual({ status: 'ok' });
    expect(rpcCalls[0]).toEqual({
      fn: 'admin_update_member',
      args: { p_user_id: 'u1', p_admin_id: 'admin1', p_new_tier: 'gold', p_new_expires_at: '2027-01-01T00:00:00.000Z' },
    });
  });

  it('returns not_found when the RPC reports the user does not exist', async () => {
    const supabase = {
      rpc: async () => ({ error: { message: 'user_not_found' } }),
    } as any;

    const result = await updateMemberTier(supabase, { userId: 'missing', adminId: 'admin1', tier: 'gold', expiresAt: null });

    expect(result).toEqual({ status: 'not_found' });
  });
});

describe('getMemberAuditHistory', () => {
  it('returns the edit rows for a user, newest first', async () => {
    const rows = [{ id: 'e1', old_tier: 'free', new_tier: 'gold', old_expires_at: null, new_expires_at: null, admin_id: 'a1', created_at: '2026-01-01' }];
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }) }),
    } as any;

    const result = await getMemberAuditHistory(supabase, 'u1');

    expect(result).toEqual(rows);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run lib/admin-members.test.ts`
Expected: FAIL — `updateMemberTier`, `getMemberAuditHistory` are not exported yet.

- [ ] **Step 3: Implement the two functions in `backend/lib/admin-members.ts`**

```typescript
export async function updateMemberTier(
  supabase: SupabaseClient,
  input: { userId: string; adminId: string; tier: string; expiresAt: string | null }
): Promise<{ status: 'ok' } | { status: 'not_found' }> {
  const { error } = await supabase.rpc('admin_update_member', {
    p_user_id: input.userId,
    p_admin_id: input.adminId,
    p_new_tier: input.tier,
    p_new_expires_at: input.expiresAt,
  });
  if (error?.message?.includes('user_not_found')) return { status: 'not_found' };
  if (error) throw new Error('Failed to update member');
  return { status: 'ok' };
}

export type MemberEditRow = {
  id: string;
  old_tier: string | null;
  new_tier: string;
  old_expires_at: string | null;
  new_expires_at: string | null;
  admin_id: string;
  created_at: string;
};

export async function getMemberAuditHistory(supabase: SupabaseClient, userId: string): Promise<MemberEditRow[]> {
  const { data, error } = await supabase
    .from('member_edits')
    .select('id, old_tier, new_tier, old_expires_at, new_expires_at, admin_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as MemberEditRow[];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run lib/admin-members.test.ts`
Expected: PASS, all tests including the pre-existing `listMembers` ones.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/admin-members.ts backend/lib/admin-members.test.ts
git commit -m "feat: add updateMemberTier and getMemberAuditHistory"
```

---

## Task 5: Member admin routes

**Files:**
- Create: `backend/app/api/admin/members/[id]/route.ts` (`PATCH`)
- Create: `backend/app/api/admin/members/[id]/route.test.ts`
- Create: `backend/app/api/admin/members/[id]/audit/route.ts` (`GET`)
- Create: `backend/app/api/admin/members/[id]/audit/route.test.ts`

**Interfaces:**
- Consumes: `updateMemberTier`, `getMemberAuditHistory` (Task 4).
- Produces: `PATCH /api/admin/members/:id` → `{ ok: true }`; `GET /api/admin/members/:id/audit` → `{ edits: MemberEditRow[] }`.

- [ ] **Step 1: Write the failing tests for the PATCH route**

```typescript
// backend/app/api/admin/members/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

const getCurrentUserMock = vi.fn();
vi.mock('@/lib/current-user', () => ({ getCurrentUser: (...args: any[]) => getCurrentUserMock(...args) }));

const updateMemberTierMock = vi.fn();
vi.mock('@/lib/admin-members', () => ({ updateMemberTier: (...args: any[]) => updateMemberTierMock(...args) }));

import { PATCH } from './route';

function makeRequest(body: any): Request {
  return new Request('http://localhost/api/admin/members/u1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  updateMemberTierMock.mockReset();
});

describe('PATCH /api/admin/members/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const response = await PATCH(makeRequest({ tier: 'gold', expiresAt: null }), { params: { id: 'u1' } });
    expect(response.status).toBe(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'u2', isAdmin: false });
    const response = await PATCH(makeRequest({ tier: 'gold', expiresAt: null }), { params: { id: 'u1' } });
    expect(response.status).toBe(403);
  });

  it('returns 400 when tier is missing', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'admin1', isAdmin: true });
    const response = await PATCH(makeRequest({ expiresAt: null }), { params: { id: 'u1' } });
    expect(response.status).toBe(400);
  });

  it('returns 200 and calls updateMemberTier with the admin id for an admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'admin1', isAdmin: true });
    updateMemberTierMock.mockResolvedValueOnce({ status: 'ok' });

    const response = await PATCH(makeRequest({ tier: 'gold', expiresAt: '2027-01-01T00:00:00.000Z' }), { params: { id: 'u1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(updateMemberTierMock).toHaveBeenCalledWith(expect.anything(), {
      userId: 'u1',
      adminId: 'admin1',
      tier: 'gold',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('returns 404 when updateMemberTier reports not_found', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'admin1', isAdmin: true });
    updateMemberTierMock.mockResolvedValueOnce({ status: 'not_found' });

    const response = await PATCH(makeRequest({ tier: 'gold', expiresAt: null }), { params: { id: 'missing' } });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement `backend/app/api/admin/members/[id]/route.ts`**

Run: `cd backend && npx vitest run "app/api/admin/members/[id]/route.test.ts"` — expect FAIL (no route yet).

```typescript
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { updateMemberTier } from '@/lib/admin-members';

const VALID_TIERS = ['free', 'silver', 'gold', 'platinum', 'lifetime'];

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
  const { tier, expiresAt } = body ?? {};

  if (!VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: `tier must be one of ${VALID_TIERS.join(', ')}` }, { status: 400 });
  }
  if (expiresAt !== null && typeof expiresAt !== 'string') {
    return NextResponse.json({ error: 'expiresAt must be an ISO date string or null' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const result = await updateMemberTier(adminSupabase, { userId: params.id, adminId: currentUser.id, tier, expiresAt });

  if (result.status === 'not_found') {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

Run again: expect PASS (5 tests).

- [ ] **Step 3: Write the failing tests for the audit route**

```typescript
// backend/app/api/admin/members/[id]/audit/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

const getCurrentUserMock = vi.fn();
vi.mock('@/lib/current-user', () => ({ getCurrentUser: (...args: any[]) => getCurrentUserMock(...args) }));

const getMemberAuditHistoryMock = vi.fn();
vi.mock('@/lib/admin-members', () => ({ getMemberAuditHistory: (...args: any[]) => getMemberAuditHistoryMock(...args) }));

import { GET } from './route';

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getMemberAuditHistoryMock.mockReset();
});

describe('GET /api/admin/members/[id]/audit', () => {
  it('returns 403 when authenticated but not admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: false });
    const response = await GET(new Request('http://localhost'), { params: { id: 'u1' } });
    expect(response.status).toBe(403);
  });

  it('returns the edit history for an admin', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ isAdmin: true });
    getMemberAuditHistoryMock.mockResolvedValueOnce([{ id: 'e1', old_tier: 'free', new_tier: 'gold' }]);

    const response = await GET(new Request('http://localhost'), { params: { id: 'u1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ edits: [{ id: 'e1', old_tier: 'free', new_tier: 'gold' }] });
  });
});
```

- [ ] **Step 4: Run to verify it fails, then implement `backend/app/api/admin/members/[id]/audit/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/current-user';
import { getMemberAuditHistory } from '@/lib/admin-members';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const sessionSupabase = createServerSupabase();
  const currentUser = await getCurrentUser(sessionSupabase);

  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  const edits = await getMemberAuditHistory(adminSupabase, params.id);
  return NextResponse.json({ edits });
}
```

Run again: expect PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "backend/app/api/admin/members/[id]/route.ts" "backend/app/api/admin/members/[id]/route.test.ts" "backend/app/api/admin/members/[id]/audit/route.ts" "backend/app/api/admin/members/[id]/audit/route.test.ts"
git commit -m "feat: add admin member tier-edit and audit-history routes"
```

---

## Task 6: Admin API client, nav, and route-group auth gate

**Files:**
- Modify: `backend/lib/api-client.ts`
- Create: `backend/components/AdminNav.tsx`
- Create: `backend/app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`, `createServerSupabase` (existing), `ContentListItem`-shaped admin content rows (reuses `ContentType`, `Tier` already exported from `lib/api-client.ts`).
- Produces: `adminApiClient` object with `listContent()`, `createContent(input)`, `updateContent(id, input)`, `deleteContent(id)`, `listMembers()`, `updateMember(id, input)`, `getMemberAudit(id)` — Tasks 7 and 8 import this.

- [ ] **Step 1: Add admin types and client methods to `backend/lib/api-client.ts`**

```typescript
// Add alongside the existing exports in backend/lib/api-client.ts

export type AdminContentItem = {
  id: string;
  type: 'watchlist' | 'video' | 'article';
  title: string;
  required_tier: string;
  payload: Record<string, unknown>;
  published_at: string;
};

export type AdminMember = {
  id: string;
  email: string;
  name: string;
  tier: string;
  expiresAt: string | null;
  createdAt: string;
  totalRevenue: number;
};

export type MemberEdit = {
  id: string;
  old_tier: string | null;
  new_tier: string;
  old_expires_at: string | null;
  new_expires_at: string | null;
  admin_id: string;
  created_at: string;
};

export const adminApiClient = {
  async listContent(): Promise<AdminContentItem[]> {
    const res = await fetch('/api/admin/content');
    const body = await parseJson<{ items: AdminContentItem[] }>(res);
    return body.items;
  },

  async createContent(input: {
    type: 'watchlist' | 'video' | 'article';
    title: string;
    required_tier: string;
    payload: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const res = await fetch('/api/admin/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },

  async updateContent(
    id: string,
    input: Partial<{ title: string; required_tier: string; payload: Record<string, unknown> }>
  ): Promise<void> {
    const res = await fetch(`/api/admin/content/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    await parseJson(res);
  },

  async deleteContent(id: string): Promise<void> {
    const res = await fetch(`/api/admin/content/${id}`, { method: 'DELETE' });
    await parseJson(res);
  },

  async listMembers(): Promise<AdminMember[]> {
    const res = await fetch('/api/admin/members');
    const body = await parseJson<{ members: AdminMember[] }>(res);
    return body.members;
  },

  async updateMember(id: string, input: { tier: string; expiresAt: string | null }): Promise<void> {
    const res = await fetch(`/api/admin/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    await parseJson(res);
  },

  async getMemberAudit(id: string): Promise<MemberEdit[]> {
    const res = await fetch(`/api/admin/members/${id}/audit`);
    const body = await parseJson<{ edits: MemberEdit[] }>(res);
    return body.edits;
  },
};
```

(`parseJson` is the private helper already defined earlier in this file — reuse it, do not redefine it.)

- [ ] **Step 2: Create the admin nav component**

```tsx
// backend/components/AdminNav.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export function AdminNav() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <nav className="bg-brand-dark text-brand-cream px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-extrabold">Social Trade Admin</span>
        <Link href="/admin/content" className="text-sm font-semibold hover:text-brand-gold">
          Konten
        </Link>
        <Link href="/admin/members" className="text-sm font-semibold hover:text-brand-gold">
          Member
        </Link>
      </div>
      <button onClick={handleLogout} className="text-sm font-semibold hover:text-brand-gold">
        Keluar
      </button>
    </nav>
  );
}
```

- [ ] **Step 3: Create the admin route-group layout**

```tsx
// backend/app/(admin)/layout.tsx
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { AdminNav } from '@/components/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    redirect('/login');
  }
  if (!currentUser.isAdmin) {
    redirect('/home');
  }

  return (
    <div className="min-h-screen bg-brand-cream">
      <AdminNav />
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors referencing the three new/modified files.

- [ ] **Step 5: Manual verification of the Review Focus case**

Run `cd backend && npm run dev`. Log in as a non-admin test user (any member account without `is_admin = true`) and open `/admin/content` — expect an immediate redirect to `/home`, not a blank page or any admin data. Log in as the real admin (`socialtradevip@gmail.com`) and open `/admin/content` — expect the admin shell (nav + empty page body, since Task 7 hasn't built the page content yet) to render without redirecting. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add backend/lib/api-client.ts backend/components/AdminNav.tsx "backend/app/(admin)/layout.tsx"
git commit -m "feat: add admin API client, nav, and route-group auth gate"
```

---

## Task 7: Content management page

**Files:**
- Create: `backend/app/(admin)/content/page.tsx`

**Interfaces:**
- Consumes: `adminApiClient` (Task 6).

- [ ] **Step 1: Create the page**

```tsx
// backend/app/(admin)/content/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { adminApiClient, type AdminContentItem } from '@/lib/api-client';

const TIERS = ['free', 'silver', 'gold', 'platinum', 'lifetime'];
const TYPES = ['video', 'article', 'watchlist'] as const;

type FormState = {
  id: string | null;
  type: (typeof TYPES)[number];
  title: string;
  required_tier: string;
  providerAssetId: string;
  body: string;
};

const EMPTY_FORM: FormState = { id: null, type: 'article', title: '', required_tier: 'free', providerAssetId: '', body: '' };

export default function AdminContentPage() {
  const [items, setItems] = useState<AdminContentItem[] | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function reload() {
    setItems(await adminApiClient.listContent());
  }

  useEffect(() => {
    reload();
  }, []);

  function startEdit(item: AdminContentItem) {
    setForm({
      id: item.id,
      type: item.type,
      title: item.title,
      required_tier: item.required_tier,
      providerAssetId: typeof item.payload.provider_asset_id === 'string' ? item.payload.provider_asset_id : '',
      body: typeof item.payload.body === 'string' ? item.payload.body : '',
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = form.type === 'video' ? { provider_asset_id: form.providerAssetId } : { body: form.body };
    try {
      if (form.id) {
        await adminApiClient.updateContent(form.id, { title: form.title, required_tier: form.required_tier, payload });
      } else {
        await adminApiClient.createContent({ type: form.type, title: form.title, required_tier: form.required_tier, payload });
      }
      setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan konten');
    }
  }

  async function handleDelete(id: string) {
    await adminApiClient.deleteContent(id);
    setConfirmDeleteId(null);
    await reload();
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Kelola Konten</h1>

      <form onSubmit={handleSubmit} className="mt-6 p-6 bg-white rounded-2xl shadow-sm max-w-lg">
        <h2 className="font-bold text-brand-dark mb-4">{form.id ? 'Edit Konten' : 'Konten Baru'}</h2>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <label className="block text-sm font-semibold text-brand-dark mb-1">Tipe</label>
        <select
          value={form.type}
          disabled={form.id !== null}
          onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })}
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg disabled:bg-brand-cream-dark"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="block text-sm font-semibold text-brand-dark mb-1">Judul</label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />

        <label className="block text-sm font-semibold text-brand-dark mb-1">Tier Minimal</label>
        <select
          value={form.required_tier}
          onChange={(e) => setForm({ ...form, required_tier: e.target.value })}
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {form.type === 'video' ? (
          <>
            <label className="block text-sm font-semibold text-brand-dark mb-1">YouTube Video ID</label>
            <input
              value={form.providerAssetId}
              onChange={(e) => setForm({ ...form, providerAssetId: e.target.value })}
              required
              className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
            />
          </>
        ) : (
          <>
            <label className="block text-sm font-semibold text-brand-dark mb-1">Isi</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={6}
              className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
            />
          </>
        )}

        <div className="flex gap-2">
          <button type="submit" className="px-6 py-2 bg-brand-gold text-brand-dark font-bold rounded-full">
            {form.id ? 'Simpan Perubahan' : 'Publish'}
          </button>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(EMPTY_FORM)}
              className="px-6 py-2 bg-brand-cream-dark text-brand-dark font-semibold rounded-full"
            >
              Batal
            </button>
          )}
        </div>
      </form>

      <div className="mt-8 space-y-2">
        {items === null && <p className="text-brand-muted">Memuat...</p>}
        {items?.map((item) => (
          <div key={item.id} className="p-4 bg-white rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <p className="font-bold text-brand-dark">{item.title}</p>
              <p className="text-sm text-brand-muted">
                {item.type} · {item.required_tier}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(item)} className="text-sm font-semibold text-brand-gold-dark">
                Edit
              </button>
              {confirmDeleteId === item.id ? (
                <button onClick={() => handleDelete(item.id)} className="text-sm font-semibold text-red-600">
                  Yakin hapus?
                </button>
              ) : (
                <button onClick={() => setConfirmDeleteId(item.id)} className="text-sm font-semibold text-red-600">
                  Hapus
                </button>
              )}
            </div>
          </div>
        ))}
        {items?.length === 0 && <p className="text-brand-muted">Belum ada konten.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `cd backend && npm run dev`, log in as the real admin, open `/admin/content`. Create a test article (`title: "Test Artikel Admin"`, `tier: free`, body text) — confirm it appears in the list below. Click "Edit" on it, change the title, submit — confirm the title updates in the list. Click "Hapus" once (shows "Yakin hapus?"), click again — confirm it disappears from the list and a `GET /api/admin/content` refresh doesn't show it. Create a test video item and confirm the YouTube Video ID field appears instead of the body textarea, and that submitting without filling it shows the inline error from the `invalid_payload` response. Stop the dev server. Clean up any leftover test content via the Supabase MCP `execute_sql` tool if the delete step wasn't reached.

- [ ] **Step 3: Commit**

```bash
git add "backend/app/(admin)/content/page.tsx"
git commit -m "feat: add admin content management page"
```

---

## Task 8: Member management page

**Files:**
- Create: `backend/app/(admin)/members/page.tsx`

**Interfaces:**
- Consumes: `adminApiClient` (Task 6).

- [ ] **Step 1: Create the page**

```tsx
// backend/app/(admin)/members/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { adminApiClient, type AdminMember, type MemberEdit } from '@/lib/api-client';

const TIERS = ['free', 'silver', 'gold', 'platinum', 'lifetime'];

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState('free');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [audits, setAudits] = useState<Record<string, MemberEdit[]>>({});

  async function reload() {
    setMembers(await adminApiClient.listMembers());
  }

  useEffect(() => {
    reload();
  }, []);

  function startEdit(member: AdminMember) {
    setEditingId(member.id);
    setEditTier(member.tier);
    setEditExpiresAt(member.expiresAt ? member.expiresAt.slice(0, 10) : '');
  }

  async function handleSave(id: string) {
    await adminApiClient.updateMember(id, {
      tier: editTier,
      expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
    });
    setEditingId(null);
    await reload();
  }

  async function toggleAudit(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!audits[id]) {
      const edits = await adminApiClient.getMemberAudit(id);
      setAudits((prev) => ({ ...prev, [id]: edits }));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Kelola Member</h1>

      <div className="mt-6 space-y-2">
        {members === null && <p className="text-brand-muted">Memuat...</p>}
        {members?.map((member) => (
          <div key={member.id} className="bg-white rounded-2xl shadow-sm">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-brand-dark">{member.name}</p>
                <p className="text-sm text-brand-muted">{member.email}</p>
                <p className="text-sm text-brand-muted">
                  {member.tier}
                  {member.expiresAt && <> — sampai {new Date(member.expiresAt).toLocaleDateString('id-ID')}</>}
                  {' · '}
                  {formatRupiah(member.totalRevenue)}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleAudit(member.id)} className="text-sm font-semibold text-brand-muted">
                  Riwayat
                </button>
                <button onClick={() => startEdit(member)} className="text-sm font-semibold text-brand-gold-dark">
                  Edit
                </button>
              </div>
            </div>

            {editingId === member.id && (
              <div className="px-4 pb-4 flex items-center gap-2">
                <select value={editTier} onChange={(e) => setEditTier(e.target.value)} className="px-3 py-2 border border-brand-cream-dark rounded-lg">
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                  className="px-3 py-2 border border-brand-cream-dark rounded-lg"
                />
                <button onClick={() => handleSave(member.id)} className="px-4 py-2 bg-brand-gold text-brand-dark font-bold rounded-full text-sm">
                  Simpan
                </button>
                <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-brand-cream-dark text-brand-dark font-semibold rounded-full text-sm">
                  Batal
                </button>
              </div>
            )}

            {expandedId === member.id && (
              <div className="px-4 pb-4 border-t border-brand-cream-dark pt-3">
                {!audits[member.id] && <p className="text-sm text-brand-muted">Memuat riwayat...</p>}
                {audits[member.id]?.length === 0 && <p className="text-sm text-brand-muted">Belum ada perubahan manual.</p>}
                {audits[member.id]?.map((edit) => (
                  <p key={edit.id} className="text-sm text-brand-muted">
                    {new Date(edit.created_at).toLocaleString('id-ID')}: {edit.old_tier ?? '-'} → {edit.new_tier}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification, including the Review Focus case**

Run `cd backend && npm run dev`, log in as the real admin, open `/admin/members` — confirm the member list renders with tier/expiry/revenue. Pick a test member (not the admin account itself), click "Edit", change the tier, save — confirm the row updates and a `GET /api/admin/members` refresh shows the new tier persisted in the real database (check via the Supabase MCP `execute_sql` tool: `select tier, expires_at from public.users where id = '<id>'`). Click "Riwayat" on that same member — confirm the edit you just made appears with the correct old→new tier values. Then, using `execute_sql`, call `select public.admin_update_member('<some-nonexistent-uuid>', '<admin-id>', 'gold', null);` directly and confirm it raises `user_not_found` rather than silently succeeding (the Review Focus case for this task). Revert any real test member's tier back to its original value afterward. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add "backend/app/(admin)/members/page.tsx"
git commit -m "feat: add admin member management page with audit history"
```

---

## Task 9: Full suite and end-to-end walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npm test -- --run`
Expected: all tests pass — the pre-existing count plus the new tests from Tasks 2 through 5.

- [ ] **Step 2: Run the production build**

Run: `cd backend && npm run build`
Expected: succeeds with no errors, and the new `/admin/content` and `/admin/members` routes appear in the build output.

- [ ] **Step 3: Walk the full admin flow once, start to finish**

Run `cd backend && npm run dev`. Log in as the real admin. Publish one real video, one real article (using real content you intend to keep, or clearly-marked test content you'll delete after), confirm both appear correctly on the member-facing `/videos` and `/articles` pages when logged in as a regular member in a separate private browser window. Back in the admin account, open `/admin/members`, adjust one test member's tier, confirm the change is reflected if you refresh that member's `/home` page in the other window. Stop the dev server.

- [ ] **Step 4: Clean up any test data**

Via the Supabase MCP `execute_sql` tool, delete any content items, member tier changes, or `member_edits` rows created purely for this walkthrough that shouldn't remain in the real database.
