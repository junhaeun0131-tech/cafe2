create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null default '',
  beverage_name text not null,
  size text not null check (size in ('S', 'M', 'L')),
  selected_options text[] not null default '{}',
  quantity integer not null check (quantity between 1 and 10),
  requests text not null default '',
  total_price integer not null check (total_price >= 0),
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

revoke all on public.orders from anon, authenticated;
grant insert on public.orders to anon, authenticated;

drop policy if exists "Anyone can submit an order" on public.orders;
create policy "Anyone can submit an order"
  on public.orders
  for insert
  to anon, authenticated
  with check (true);