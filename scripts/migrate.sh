#!/bin/bash
# Застосовує SQL-міграції до бази Supabase. Рядок підключення — SUPABASE_DB_URL у .env.local
# (Supabase → Project Settings → Database → Connection string → Session pooler).
set -euo pipefail
cd "$(dirname "$0")/.."
SUPABASE_DB_URL=$(grep -E '^SUPABASE_DB_URL=' .env.local | cut -d= -f2-)
[ -n "$SUPABASE_DB_URL" ] || { echo "Заповніть SUPABASE_DB_URL у .env.local"; exit 1; }
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  "$PSQL" "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f"
done
echo "Міграції застосовано."
