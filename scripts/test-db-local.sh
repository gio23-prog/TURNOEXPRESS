#!/usr/bin/env bash
# Prueba el esquema en un PostgreSQL 16 local sin Supabase (requiere pgTAP y btree_gist).
# Uso: PGHOST=localhost PGUSER=postgres PGPASSWORD=... ./scripts/test-db-local.sh
set -euo pipefail
DB="${TEST_DB:-turnoexpress_test}"
psql -q -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
P="psql -q -X -v ON_ERROR_STOP=1 -d $DB"
$P -f supabase/local/00_supabase_auth_stub.sql
for f in supabase/migrations/*.sql; do echo ">> $f"; $P -f "$f"; done
for t in supabase/tests/database/*.test.sql; do
  echo ">> $t"
  out=$($P -f "$t" 2>&1)
  echo "$out" | grep -E "^ *(ok|not ok)" | sed 's/ *+$//'
  if echo "$out" | grep -q "not ok"; then echo "FALLARON PRUEBAS"; exit 1; fi
done
echo "Todas las pruebas pasaron."
