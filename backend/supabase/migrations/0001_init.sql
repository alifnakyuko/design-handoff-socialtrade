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

create policy "orders read own row" on public.orders
  for select using (auth.uid() = user_id);
