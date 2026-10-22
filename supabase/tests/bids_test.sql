-- Перевірка логіки торгів на локальному PostgreSQL (див. run_tests.sh).
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------- помічники ----------
create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;

create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'Очікувалась помилка % для: %', p_pattern, p_sql;
exception when others then
  if sqlerrm not like p_pattern || '%' then
    raise exception 'Очікувалась помилка %, отримано: %', p_pattern, sqlerrm;
  end if;
end $$;

-- ---------- дані ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@demo.test', '{"company":"Demo Seller"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@demo.test', '{"company":"Buyer B","contact_name":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@demo.test', '{"company":"Buyer C"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

insert into public.auctions (id, title, starts_at, ends_at, step, timezone) values
  ('10000000-0000-0000-0000-000000000001', 'Live', now() - interval '1 hour', now() + interval '1 hour', 10, 'Asia/Kolkata'),
  ('10000000-0000-0000-0000-000000000002', 'Ended', now() - interval '2 hour', now() - interval '1 hour', 10, 'Europe/Kyiv'),
  ('10000000-0000-0000-0000-000000000003', 'Future', now() + interval '1 hour', now() + interval '2 hour', 10, 'Europe/Kyiv');
insert into public.auctions (id, title, starts_at, ends_at, step, is_private, invite_token) values
  ('10000000-0000-0000-0000-000000000004', 'Private', now() - interval '1 hour', now() + interval '1 hour', 5, true, 'secret-token'),
  ('10000000-0000-0000-0000-000000000005', 'Ending soon', now() - interval '1 hour', now() + interval '30 seconds', 1, false, 'tok5');
insert into public.lots (id, auction_id, position, name, start_price) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'Pipe 159', 100),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, 'Pipe 219', 200),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 1, 'Old', 100),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 1, 'Soon', 100),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000004', 1, 'Secret', 50),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000005', 1, 'Snipe', 10);

set role authenticated;

-- ---------- 1. звичайні ставки ----------
do $$
declare l public.lots;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
  l := public.place_bid('20000000-0000-0000-0000-000000000001', 100);
  assert l.current_price = 100 and l.leader_id = '00000000-0000-0000-0000-00000000000b' and l.bid_count = 1,
    'перша ставка = стартова ціна';
  perform pg_temp.expect_error($q$select public.place_bid('20000000-0000-0000-0000-000000000001', 120)$q$, 'ALREADY_LEADER');

  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
  perform pg_temp.expect_error($q$select public.place_bid('20000000-0000-0000-0000-000000000001', 105)$q$, 'BID_TOO_LOW:110');
  l := public.place_bid('20000000-0000-0000-0000-000000000001', 110);
  assert l.current_price = 110 and l.leader_id = '00000000-0000-0000-0000-00000000000c', 'перебив ставку';
  raise notice 'OK 1: звичайні ставки, крок, лідер';
end $$;

-- ---------- 2. ставка на всі лоти ----------
do $$
declare n int;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
  n := public.place_bulk_bid('10000000-0000-0000-0000-000000000001');
  assert n = 2, 'обидва лоти';
  assert (select current_price from public.lots where id = '20000000-0000-0000-0000-000000000001') = 120, 'лот 1: 110 + крок';
  assert (select current_price from public.lots where id = '20000000-0000-0000-0000-000000000002') = 200, 'лот 2: стартова ціна';
  assert (select count(distinct bulk_id) from public.bids where bulk_id is not null) = 1, 'одна пачка';
  perform pg_temp.expect_error($q$select public.place_bulk_bid('10000000-0000-0000-0000-000000000001')$q$, 'ALREADY_LEADER_ALL');

  -- C перебиває тільки лот 1 → масова ставка B піде лише на лот 1
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
  perform public.place_bid('20000000-0000-0000-0000-000000000001', 130);
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
  n := public.place_bulk_bid('10000000-0000-0000-0000-000000000001');
  assert n = 1, 'тільки там, де не лідер';
  assert (select current_price from public.lots where id = '20000000-0000-0000-0000-000000000002') = 200, 'лот 2 не чіпали';
  raise notice 'OK 2: ставка на всі лоти, пропуск лотів, де вже лідер';
end $$;

-- ---------- 3. час торгів і доступ ----------
do $$
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
  perform pg_temp.expect_error($q$select public.place_bid('20000000-0000-0000-0000-000000000003', 500)$q$, 'ENDED');
  perform pg_temp.expect_error($q$select public.place_bulk_bid('10000000-0000-0000-0000-000000000002')$q$, 'ENDED');
  assert (select count(*) from public.bids where auction_id = '10000000-0000-0000-0000-000000000002') = 0, 'на завершених нічого не записано';
  perform pg_temp.expect_error($q$select public.place_bid('20000000-0000-0000-0000-000000000004', 500)$q$, 'NOT_STARTED');

  perform pg_temp.expect_error($q$select public.place_bid('20000000-0000-0000-0000-000000000005', 50)$q$, 'NO_ACCESS');
  perform pg_temp.expect_error($q$select public.join_auction('wrong')$q$, 'BAD_INVITE');
  assert public.join_auction('secret-token') = '10000000-0000-0000-0000-000000000004', 'запрошення';
  assert (public.place_bid('20000000-0000-0000-0000-000000000005', 50)).current_price = 50, 'ставка після запрошення';

  perform pg_temp.as_user(null);
  perform pg_temp.expect_error($q$select public.place_bid('20000000-0000-0000-0000-000000000001', 1000)$q$, 'NOT_AUTHENTICATED');
  raise notice 'OK 3: завершені/майбутні торги, закриті торги за запрошенням, анонім';
end $$;

-- ---------- 4. продовження торгів при пізній ставці ----------
do $$
declare v_end timestamptz;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
  perform public.place_bid('20000000-0000-0000-0000-000000000006', 10);
  select ends_at into v_end from public.auctions where id = '10000000-0000-0000-0000-000000000005';
  assert v_end >= now() + interval '119 seconds', 'торги продовжено на 2 хвилини';
  v_end := (select ends_at from public.auctions where id = '10000000-0000-0000-0000-000000000001');
  assert v_end < now() + interval '61 minutes' and v_end > now() + interval '59 minutes', 'ранні ставки не продовжують';
  raise notice 'OK 4: антиснайпінг';
end $$;

-- ---------- 5. RLS: хто що бачить ----------
do $$
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
  assert (select count(*) from public.bids) = (select count(*) from public.bids where user_id = auth.uid()), 'покупець бачить лише свої ставки';
  assert not exists (select 1 from public.auctions where id = '10000000-0000-0000-0000-000000000004'), 'C не бачить закритих торгів без запрошення';
  assert (select count(*) from public.profiles) = 1, 'бачить лише свій профіль';
  perform pg_temp.expect_error($q$update public.profiles set role = 'admin' where id = auth.uid()$q$, 'new row violates row-level security');
  update public.profiles set company = 'Buyer C Ltd' where id = auth.uid();
  assert (select role || '/' || company from public.profiles where id = auth.uid()) = 'buyer/Buyer C Ltd', 'свої дані міняти можна, роль — ні';
  perform pg_temp.expect_error($q$insert into public.auctions (title, starts_at, ends_at, step) values ('x', now(), now() + interval '1 hour', 1)$q$, 'new row violates row-level security');
  perform pg_temp.expect_error($q$insert into public.bids (auction_id, lot_id, user_id, amount) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', auth.uid(), 99999)$q$, 'new row violates row-level security');
  perform pg_temp.expect_error($q$select public.copy_auction('10000000-0000-0000-0000-000000000001')$q$, 'ADMIN_ONLY');
  perform pg_temp.expect_error($q$select * from public.auction_results('10000000-0000-0000-0000-000000000001')$q$, 'ADMIN_ONLY');

  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
  assert (select count(*) from public.bids) = (select count(*) from public.bids where true), 'адмін бачить усі ставки';
  assert (select count(distinct user_id) from public.bids) = 2, 'ставки обох покупців';
  raise notice 'OK 5: RLS';
end $$;

reset role;
set role anon;
do $$
begin
  perform pg_temp.as_user(null);
  assert (select count(*) from public.auctions) = 4, 'гість бачить відкриті торги';
  assert (select count(*) from public.bids) = 0, 'гість не бачить ставок';
  raise notice 'OK 6: гість';
end $$;
reset role;
set role authenticated;

-- ---------- 7. копіювання і підсумки ----------
do $$
declare v_new uuid; r record;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
  v_new := public.copy_auction('10000000-0000-0000-0000-000000000001');
  assert (select count(*) from public.lots where auction_id = v_new) = 2, 'лоти скопійовано';
  assert (select count(*) from public.lots where auction_id = v_new and current_price is null) = 2, 'без ставок';
  assert (select starts_at > now() from public.auctions where id = v_new), 'старт у майбутньому';
  assert (select ends_at - starts_at from public.auctions where id = v_new) = interval '2 hours', 'та сама тривалість';
  select * into r from public.auction_results('10000000-0000-0000-0000-000000000001') where lot_position = 1;
  assert r.final_price = 140 and r.winner_company = 'Buyer B' and r.bid_count = 5, format('підсумки: %s', r);
  raise notice 'OK 7: копіювання торгів, підсумки';
end $$;
reset role;
