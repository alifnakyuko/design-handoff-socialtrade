-- Public-facing plan catalogue for GET /api/plans. This is presentational data only
-- (price/strike-price/name/sort order for the pricing page) and is kept in sync by hand
-- with the hardcoded PLAN_PRICES/PLAN_DURATIONS in lib/pricing.ts, which remain the source
-- of truth the checkout/webhook/membership-expiry calculations actually read from -- this
-- table does not replace them. If a price or duration ever changes, update both.
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('silver', 'gold', 'platinum', 'lifetime')),
  name text not null,
  tier_level int not null,
  price int not null,
  strike_price int,
  duration_days int, -- null = lifetime (no expiry)
  is_active boolean not null default true,
  sort int not null default 0
);

alter table public.plans enable row level security;

create policy "plans are publicly readable" on public.plans
  for select using (true);

insert into public.plans (code, name, tier_level, price, strike_price, duration_days, is_active, sort) values
  ('silver', 'Silver', 1, 1500000, null, 120, true, 1),
  ('gold', 'Gold', 2, 2600000, null, 270, true, 2),
  ('platinum', 'Platinum', 3, 4200000, null, 540, true, 3),
  ('lifetime', 'Lifetime', 4, 6500000, null, null, true, 4);
