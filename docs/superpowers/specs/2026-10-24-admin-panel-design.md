# Admin panel — design spec

## Intent and why

The backend has admin API routes for content and members, but no UI — the only way to publish a video/article or check who's paid is raw SQL via the Supabase MCP tool, done by Claude on the user's behalf. The user (solo operator, `socialtradevip@gmail.com`, sole admin) wants to do this themselves: publish content, and check/adjust member status, without going through an assistant each time.

## Goals

- Publish, edit, and delete content items (video, article, watchlist) from a UI.
- See all members with their tier, expiry, and total revenue.
- Manually adjust a member's tier/expiry (e.g. comp a friend, extend after a payment dispute), with every such edit recorded — who did it, what changed, when.

## Non-goals (explicitly deferred, confirmed with the user)

- Promo code management UI (backend API already exists; no UI this round).
- Push-history log UI (same).
- Self-service admin signup — promoting a new admin stays a manual SQL step (`backend/README.md` already documents this; this spec does not change it).
- Bulk actions (bulk-delete content, bulk tier changes).
- Rich text editing for article/watchlist bodies — stays plain text/textarea, matching the convention the member frontend's `ArticleReadPage` already established (`payload.body` as a string).

## Anti-goals (would make this a failure even if "done")

- An admin who is logged in but not `isAdmin` getting any content/member data back, even read-only. Every new route re-checks `isAdmin` server-side; the UI hiding a link is not the security boundary.
- A member tier/expiry edit that isn't recorded. The audit trail is the whole point the user asked for — an edit path that skips it defeats the feature.
- Content list/edit silently only showing content the viewing admin's own tier would unlock (the bug class the public `/api/content` route has, by design, for normal members) — admins must see and manage every item regardless of its `required_tier`.

## Constraints

- No new frontend framework/library choices — same stack as the member frontend: Next.js App Router, Tailwind CSS, the existing `backend/lib/api-client.ts` pattern (extended, not replaced).
- No self-service admin creation (see non-goals).
- Reuse `getCurrentUser`/`createServerSupabase` for the auth check, same as the member `(member)` layout already does — just with an added `isAdmin` check.

## What's decided (and who decided it)

**Routes (user confirmed the screens; route shape is the builder's call, listed here for the plan to use verbatim):**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/content` | List **every** content item, unfiltered by tier (new — the existing public `GET /api/content` hides locked items, which is wrong for an admin management view) |
| `PATCH` | `/api/admin/content/:id` | Edit title/required_tier/payload (new) |
| `DELETE` | `/api/admin/content/:id` | Delete a content item (new) |
| `GET` | `/api/admin/members/:id/audit` | Fetch one member's tier/expiry edit history, fetched lazily when a row is expanded rather than bundled into the list response (Claude's call — keeps the member list payload from growing unbounded as edits accumulate) |
| `GET` | `/api/admin/members` | List members with tier/expiry/revenue (**already exists**, unchanged) |
| `PATCH` | `/api/admin/members/:id` | Manually set tier and/or expires_at, writing an audit row in the same transaction/request (new) |

**Audit log (user confirmed it's needed; shape is the builder's call):** a new table, one row per edit, holding at minimum: which admin made the edit, which member was edited, the tier/expiry values before and after, and when. Displayed as a small expandable history under each member row — not a separate page (this was Claude's guess during brainstorming; the user confirmed it).

**Screens (user confirmed exactly these two, nothing more this round):**
1. **Content management** (`/admin/content`) — list (type, title, tier, published date), a create/edit form (shared between create and edit, toggled by whether an id is present — Claude's call, cheaper than two near-identical forms), and a delete action with a confirmation step (destructive, so no one-click delete).
2. **Member management** (`/admin/members`) — list (name, email, tier, expires_at, total revenue), an inline or modal edit control for tier/expires_at per row, and the audit history described above, fetched on demand via `GET /api/admin/members/:id/audit` when a row is expanded.

**Delete behavior (user confirmed, after the builder-check surfaced that most content items have a dependent `push_history` row via a restrictive foreign key, so a naive `DELETE` would fail on nearly every real item):** deleting a content item must always succeed. A migration changes `push_history.content_item_id`'s foreign key to `ON DELETE SET NULL` — the push-history record of "a notification for X was sent" survives, just decoupled from the now-deleted content item, rather than the delete being blocked or the history vanishing with it.

**Member edit + audit atomicity (Claude's call, not asked — the codebase already has the pattern):** the tier/expiry update and its audit-log insert happen together via a Postgres RPC function, mirroring `apply_membership_grant` (`backend/supabase/migrations/0003_apply_membership_grant.sql`, called via `supabase.rpc()` in `lib/midtrans-webhook.ts`) — the same "two writes must not get out of sync" shape, and the anti-goal that an edit must never go unrecorded rules out a best-effort, non-blocking write like `push_history` gets on publish.

**Admin route group and auth gate (mirrors the existing member layout's pattern — Claude's call):** a new `app/(admin)/` route group with its own layout. The gate checks both "is there a session" (→ redirect to `/login` if not) and "is this user an admin" (→ redirect to `/home` if logged in but not admin, since they're a valid member just not an admin, not someone to bounce to a login screen). Every new API route independently re-checks `isAdmin` too, per the anti-goals above — the frontend gate is convenience, not the security boundary.

**Visual style:** reuse the Tailwind `brand-*` tokens and component patterns (`bg-white rounded-2xl shadow-sm` cards, pill buttons, `brand-gold`/`brand-dark`) already established by the member frontend, for visual consistency across the whole app. `Admin.dc.html` (the static design mockup in the repo) exists as a loose visual reference but is not treated as a pixel-accurate spec, same approach as the member frontend took with its own mockups.

## What's left to the builder

- Exact table/column names for the audit log table and the migration to create it.
- Exact request/response JSON shapes for the three new routes (follow the existing admin routes' conventions in `backend/app/api/admin/`).
- Exact component breakdown and file layout within `app/(admin)/`.
- Form validation details (mirrors the existing `POST /api/admin/content` route's validation: type/title/required_tier/payload shape checks).
- Whether the member edit control is a modal or inline row expansion — either is fine, pick whichever is less code given the existing component patterns.
