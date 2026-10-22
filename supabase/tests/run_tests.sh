#!/bin/bash
# Проганяє міграції та тести торгів на тимчасовому локальному PostgreSQL (без Docker і без Supabase).
# Використання: supabase/tests/run_tests.sh
set -euo pipefail

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
DATA="$(mktemp -d)"
PORT="${PORT:-55432}"
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres

cleanup() { "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

LC_ALL=C "$PG_BIN/initdb" -D "$DATA" -U postgres -A trust --locale=C -E UTF8 >/dev/null
LC_ALL=C "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c wal_level=logical" -l "$DATA/log" start -w >/dev/null

psql() { "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 "$@"; }
psql -c "create database t"
psql -d t -f "$DIR/stub_supabase.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do psql -d t -f "$f"; done
psql -d t -f "$DIR/grants.sql"
psql -d t -f "$DIR/bids_test.sql" 2>&1 | sed 's/^psql:.*NOTICE:  /  /'

# ---------- одночасні ставки: з N однакових ставок має пройти рівно одна ----------
LOT=20000000-0000-0000-0000-000000000002   # лот 2 торгів "Live", поточна ціна 200, крок 10
N=8
for i in $(seq 1 $N); do
  uid=$(printf '00000000-0000-0000-0000-0000000001%02d' "$i")
  psql -d t -c "insert into auth.users (id, email) values ('$uid', 'p$i@demo.test')"
done
for i in $(seq 1 $N); do
  uid=$(printf '00000000-0000-0000-0000-0000000001%02d' "$i")
  ( "$PG_BIN/psql" -X -q -d t -c "set role authenticated; select set_config('request.jwt.claim.sub', '$uid', false); select public.place_bid('$LOT', 210);" >/dev/null 2>&1 && echo ok || echo fail ) > "$DATA/race_$i" &
done
wait
OK=$(cat "$DATA"/race_* | grep -c '^ok$' || true)
PRICE=$(psql -d t -At -c "select current_price || ' ' || bid_count from public.lots where id = '$LOT'")
if [ "$OK" = "1" ] && [ "$PRICE" = "210.00 2" ]; then
  echo "  OK 8: $N одночасних ставок 210 → пройшла рівно одна (ціна і лічильник: $PRICE)"
else
  echo "  FAIL 8: пройшло $OK з $N, лот: $PRICE"; exit 1
fi
echo "Усі тести пройдено."
