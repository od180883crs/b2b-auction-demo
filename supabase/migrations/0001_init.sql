-- Демо B2B-аукціонів: схема, права доступу (RLS) і серверна логіка ставок.
-- Усі ставки проходять тільки через функції place_bid / place_bulk_bid:
-- вони блокують торги й лоти, перевіряють час і крок, продовжують торги при пізній ставці.

create extension if not exists pgcrypto;

-- ---------- профілі ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  company text not null default '',
  contact_name text not null default '',
  phone text not null default '',
  role text not null default 'buyer' check (role in ('buyer', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, company, contact_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'company', ''),
    coalesce(new.raw_user_meta_data ->> 'contact_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- торги, лоти, ставки ----------

create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  number serial unique,
  title text not null,
  description text not null default '',
  currency text not null default 'USD' check (currency in ('USD', 'EUR', 'UAH')),
  delivery_type text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Europe/Kyiv',
  step numeric(14, 2) not null check (step > 0),
  anti_snipe_minutes int not null default 2 check (anti_snipe_minutes between 0 and 30),
  is_private boolean not null default false,
  invite_token text not null unique default encode(gen_random_bytes(9), 'hex'),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions (id) on delete cascade,
  position int not null default 1,
  name text not null,
  size text not null default '',
  steel_grade text not null default '',
  volume text not null default '',
  defects text not null default '',
  start_price numeric(14, 2) not null check (start_price > 0),
  -- денормалізовано, щоб realtime транслював ціну, не відкриваючи чужих ставок
  current_price numeric(14, 2),
  leader_id uuid references public.profiles (id),
  bid_count int not null default 0
);
create index on public.lots (auction_id, position);

create table public.bids (
  id bigint generated always as identity primary key,
  auction_id uuid not null references public.auctions (id) on delete cascade,
  lot_id uuid not null references public.lots (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  amount numeric(14, 2) not null,
  bulk_id uuid,
  created_at timestamptz not null default now()
);
create index on public.bids (lot_id, created_at desc);
create index on public.bids (user_id, created_at desc);

create table public.auction_access (
  auction_id uuid not null references public.auctions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (auction_id, user_id)
);

-- ---------- RLS ----------

alter table public.profiles enable row level security;
alter table public.auctions enable row level security;
alter table public.lots enable row level security;
alter table public.bids enable row level security;
alter table public.auction_access enable row level security;

create or replace function public.can_see_auction(a public.auctions)
returns boolean language sql stable security definer set search_path = public as $$
  select not a.is_private
      or public.is_admin()
      or exists (select 1 from public.auction_access x where x.auction_id = a.id and x.user_id = auth.uid());
$$;

create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

create policy "visible auctions" on public.auctions for select using (public.can_see_auction(auctions));
create policy "admin writes auctions" on public.auctions for all using (public.is_admin()) with check (public.is_admin());

create policy "visible lots" on public.lots for select
  using (exists (select 1 from public.auctions a where a.id = lots.auction_id and public.can_see_auction(a)));
create policy "admin writes lots" on public.lots for all using (public.is_admin()) with check (public.is_admin());

-- Покупець бачить лише свої ставки; адмін — усі. Вставка — тільки через функції нижче.
create policy "own bids" on public.bids for select using (user_id = auth.uid() or public.is_admin());

create policy "own access" on public.auction_access for select using (user_id = auth.uid() or public.is_admin());

-- ---------- серверний час ----------

create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now() $$;

-- ---------- ставки ----------

create or replace function public._check_can_bid(a public.auctions)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if not public.can_see_auction(a) then
    raise exception 'NO_ACCESS' using errcode = 'P0001';
  end if;
  if now() < a.starts_at then
    raise exception 'NOT_STARTED' using errcode = 'P0001';
  end if;
  if now() >= a.ends_at then
    raise exception 'ENDED' using errcode = 'P0001';
  end if;
end $$;

create or replace function public._min_next(l public.lots, a public.auctions)
returns numeric language sql immutable as $$
  select case when l.current_price is null then l.start_price else l.current_price + a.step end;
$$;

-- Продовження торгів, якщо ставка прийшла в останні anti_snipe_minutes хвилин.
create or replace function public._anti_snipe(a public.auctions)
returns void language plpgsql security definer set search_path = public as $$
begin
  if a.anti_snipe_minutes > 0 and a.ends_at - now() < make_interval(mins => a.anti_snipe_minutes) then
    update public.auctions set ends_at = now() + make_interval(mins => a.anti_snipe_minutes) where id = a.id;
  end if;
end $$;

create or replace function public.place_bid(p_lot_id uuid, p_amount numeric)
returns public.lots language plpgsql security definer set search_path = public as $$
declare
  l public.lots;
  a public.auctions;
begin
  select * into l from public.lots where id = p_lot_id;
  if not found then
    raise exception 'LOT_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- порядок блокувань: спершу торги, потім лот (так само, як у place_bulk_bid) — без взаємних блокувань
  select * into a from public.auctions where id = l.auction_id for update;
  select * into l from public.lots where id = p_lot_id for update;

  perform public._check_can_bid(a);
  if l.leader_id = auth.uid() then
    raise exception 'ALREADY_LEADER' using errcode = 'P0001';
  end if;
  if p_amount < public._min_next(l, a) then
    raise exception 'BID_TOO_LOW:%', public._min_next(l, a) using errcode = 'P0001';
  end if;

  insert into public.bids (auction_id, lot_id, user_id, amount) values (a.id, l.id, auth.uid(), p_amount);
  update public.lots set current_price = p_amount, leader_id = auth.uid(), bid_count = bid_count + 1
    where id = l.id returning * into l;
  perform public._anti_snipe(a);
  return l;
end $$;

-- «Ставка на всі лоти»: мінімальна наступна ставка на кожен лот, де користувач ще не лідер.
-- Одна транзакція: або всі ставки проходять, або жодна.
create or replace function public.place_bulk_bid(p_auction_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  a public.auctions;
  l public.lots;
  v_bulk uuid := gen_random_uuid();
  v_count int := 0;
  v_amount numeric;
begin
  select * into a from public.auctions where id = p_auction_id for update;
  if not found then
    raise exception 'AUCTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform public._check_can_bid(a);

  for l in select * from public.lots where auction_id = a.id order by position, id for update loop
    continue when l.leader_id = auth.uid();
    v_amount := public._min_next(l, a);
    insert into public.bids (auction_id, lot_id, user_id, amount, bulk_id) values (a.id, l.id, auth.uid(), v_amount, v_bulk);
    update public.lots set current_price = v_amount, leader_id = auth.uid(), bid_count = bid_count + 1 where id = l.id;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'ALREADY_LEADER_ALL' using errcode = 'P0001';
  end if;
  perform public._anti_snipe(a);
  return v_count;
end $$;

-- ---------- закриті торги, копіювання, підсумки ----------

create or replace function public.join_auction(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select id into v_id from public.auctions where invite_token = p_token;
  if v_id is null then
    raise exception 'BAD_INVITE' using errcode = 'P0001';
  end if;
  insert into public.auction_access (auction_id, user_id) values (v_id, auth.uid()) on conflict do nothing;
  return v_id;
end $$;

-- Копія торгів з тими ж лотами; старт через добу з тією ж тривалістю.
create or replace function public.copy_auction(p_auction_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a public.auctions;
  v_new uuid;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = 'P0001';
  end if;
  select * into a from public.auctions where id = p_auction_id;
  if not found then
    raise exception 'AUCTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.auctions (title, description, currency, delivery_type, starts_at, ends_at, timezone,
                               step, anti_snipe_minutes, is_private, created_by)
  values (a.title || ' (копія)', a.description, a.currency, a.delivery_type,
          date_trunc('hour', now()) + interval '1 day',
          date_trunc('hour', now()) + interval '1 day' + (a.ends_at - a.starts_at),
          a.timezone, a.step, a.anti_snipe_minutes, a.is_private, auth.uid())
  returning id into v_new;
  insert into public.lots (auction_id, position, name, size, steel_grade, volume, defects, start_price)
    select v_new, position, name, size, steel_grade, volume, defects, start_price
    from public.lots where auction_id = a.id;
  return v_new;
end $$;

-- Підсумки для адміна: переможець і ціна по кожному лоту.
create or replace function public.auction_results(p_auction_id uuid)
returns table (lot_id uuid, lot_position int, lot_name text, start_price numeric, final_price numeric,
               bid_count int, winner_company text, winner_contact text, winner_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = 'P0001';
  end if;
  return query
    select l.id, l.position, l.name, l.start_price, l.current_price, l.bid_count,
           p.company, p.contact_name, p.email
    from public.lots l left join public.profiles p on p.id = l.leader_id
    where l.auction_id = p_auction_id
    order by l.position;
end $$;

revoke execute on function public._check_can_bid(public.auctions) from public, anon, authenticated;
revoke execute on function public._anti_snipe(public.auctions) from public, anon, authenticated;
grant execute on function public.place_bid(uuid, numeric) to authenticated;
grant execute on function public.place_bulk_bid(uuid) to authenticated;
grant execute on function public.join_auction(text) to authenticated;
grant execute on function public.copy_auction(uuid) to authenticated;
grant execute on function public.auction_results(uuid) to authenticated;
grant execute on function public.server_time() to anon, authenticated;

-- ---------- realtime: ціни лотів і час завершення торгів ----------

alter publication supabase_realtime add table public.lots, public.auctions;
