#!/usr/bin/env bash
# Schema dry-run for a schema change: throwaway copy of the LOCAL database (never production), brought to
# the schema of commit $BASE (default 51dd7853 = what production runs), then plain `prisma db push` of the
# working-tree schema exactly as the production container runs it (no --accept-data-loss).
# Prints the push output and the structured diff; drops the copy at the end. Local only.
set -uo pipefail
cd "$(dirname "$0")/../.."
BASE="${BASE:-51dd7853}"
DB="pzn_schema_$(date +%s)"
OUT="neptive/dev/.data/schema-check-$DB"
PG="docker exec -i pzn-postgres"
mkdir -p "$OUT"
trap '$PG dropdb -U postiz-app --if-exists "$DB" >/dev/null 2>&1' EXIT

$PG createdb -U postiz-app "$DB"
$PG pg_dump -U postiz-app -d postiz-db -Fc --no-owner | $PG pg_restore -U postiz-app -d "$DB" --no-owner >/dev/null 2>"$OUT/restore.err" || true
export DATABASE_URL="postgresql://postiz-app:pzn-local-only@127.0.0.1:55432/$DB"  # hard-wired local copy
git show "$BASE:libraries/nestjs-libraries/src/database/prisma/schema.prisma" > "$OUT/schema-$BASE.prisma"

echo "== 1. bring the copy to the production schema ($BASE), plain db push"
pnpm dlx prisma@6.5.0 db push --skip-generate --schema "$OUT/schema-$BASE.prisma" > "$OUT/db-push-base.txt" 2>&1
grep -E "sync|Error|warning|loss" "$OUT/db-push-base.txt"
$PG pg_dump -U postiz-app -d "$DB" --schema-only --no-owner > "$OUT/schema-before.sql"
counts() {  # exact row count of every table that existed before the push
  for t in $(cut -d'|' -f1 "$OUT/tables-before.txt"); do
    echo "$t $($PG psql -U postiz-app -d "$DB" -Atc "select count(*) from \"$t\"")"
  done
}
$PG psql -U postiz-app -d "$DB" -Atc "select tablename from pg_tables where schemaname='public' order by 1" > "$OUT/tables-before.txt"
counts > "$OUT/rows-before.txt"

echo "== 2. plain db push of the working-tree schema (what the production container start runs)"
pnpm dlx prisma@6.5.0 db push --skip-generate --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma > "$OUT/db-push.txt" 2>&1
rc=$?
grep -E "sync|Error|warning|loss|Datasource" "$OUT/db-push.txt"
echo "exit code: $rc"
grep -i "data loss\|accept-data-loss\|warning" "$OUT/db-push.txt" && echo "!! DATA-LOSS WARNING" || echo "no data-loss warning"
$PG pg_dump -U postiz-app -d "$DB" --schema-only --no-owner > "$OUT/schema-after.sql"
echo "== 3. structured diff"
python3 neptive/scripts/schema-diff.py "$OUT/schema-before.sql" "$OUT/schema-after.sql" | tee "$OUT/schema-changes.md"
echo "== 4. exact row counts of all $(wc -l < "$OUT/tables-before.txt") pre-existing tables, before vs after"
counts > "$OUT/rows-after.txt"
diff "$OUT/rows-before.txt" "$OUT/rows-after.txt" && echo "identical" || echo "!! ROW COUNTS CHANGED"
grep -E "^neptive_(client_users|portal_sessions|magic_links|activities) " "$OUT/rows-after.txt"
echo "== 5. second plain db push (container restart): must be a no-op"
pnpm dlx prisma@6.5.0 db push --skip-generate --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma 2>&1 | grep -E "sync|Error|warning|loss"
echo "output kept in $OUT"
