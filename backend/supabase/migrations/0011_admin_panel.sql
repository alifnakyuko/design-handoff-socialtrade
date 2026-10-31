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
