-- POST /api/promo/validate is public and unauthenticated by design (per the original brief),
-- but that also means it's a free oracle for brute-forcing promo codes: no login needed, and a
-- hit response leaks discountPct/finalPrice. This table backs a simple per-IP rate limit for
-- that endpoint. Like content_items/promo_codes/push_history, RLS is enabled with no policies
-- -- only the service-role client (used by that route) can read or write it.
create table public.promo_validate_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);

create index promo_validate_attempts_ip_created_at_idx
  on public.promo_validate_attempts (ip, created_at);

alter table public.promo_validate_attempts enable row level security;
