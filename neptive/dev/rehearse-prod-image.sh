#!/usr/bin/env bash
# LOCAL ONLY. Rehearses the production image against a restored production dump, on the local pzn- stack.
# Usage: neptive/dev/rehearse-prod-image.sh <command>   (IMAGE=local/postiz-neptive:<tag> overrides the image)
#   restore   new database "rehearsal" in pzn-postgres <- newest .data/prod-*.dump, then sanitise
#             (dummy integration tokens, local admin password, QUEUE posts pushed 100 years out) + row counts
#   env       write .data/rehearsal/env with FRESH local secrets (no email provider, no social keys)
#   plain     start the image exactly as production does (CMD, no flags) in the foreground-until-exit, show the log tail
#   diff      one-off: `prisma migrate diff` = the SQL the schema step would run (read-only)
#   schema    one-off: prisma db push --accept-data-loss (the one-time schema step)
#   up        start the image detached as pzr-postiz on 127.0.0.1:4017 (normal CMD)
#   counts F  write per-table row counts to F
#   down      remove pzr-* containers/volume (keeps the database)
set -euo pipefail
DEV="$(cd "$(dirname "$0")" && pwd)"; DATA="$DEV/.data"; R="$DATA/rehearsal"; mkdir -p "$R"
IMAGE="${IMAGE:-$(docker images --format '{{.Repository}}:{{.Tag}}' 'local/postiz-neptive' | grep neptive-next | head -1 || true)}"
NET=pzn_default; DB=rehearsal
P() { docker exec -i pzn-postgres psql -U postiz-app -v ON_ERROR_STOP=1 -At "$@"; }
SCHEMA=./libraries/nestjs-libraries/src/database/prisma/schema.prisma
# same names/values as production's compose environment; DB/Redis/Temporal point at the local stack
run_args() { echo --network $NET --env-file "$R/env" -v pzr-uploads:/uploads -v pzr-config:/config; }

case "${1:-}" in
  restore)
    DUMP="$(ls -t "$DATA"/prod-*.dump | head -1)"; echo "restoring $DUMP into database $DB"
    P -d postgres -c "drop database if exists \"$DB\" with (force)" -c "create database \"$DB\"" >/dev/null
    docker exec -i pzn-postgres pg_restore -U postiz-app -d $DB --no-owner --no-privileges < "$DUMP"
    echo "integrations total / non-dummy tokens before sanitising:"
    P -d $DB -c "select count(*), count(*) filter (where coalesce(token,'')<>'' and token not like 'LOCAL-DUMMY%') from \"Integration\""
    P -d $DB -c "update \"Integration\" set token='LOCAL-DUMMY-NOT-A-REAL-TOKEN', \"refreshToken\"=case when \"refreshToken\" is null then null else 'LOCAL-DUMMY-NOT-A-REAL-TOKEN' end, \"customInstanceDetails\"=null"
    HASH=$(cd "$DEV/../.." && ADMIN_PASSWORD="${ADMIN_PASSWORD:-neptive-local-admin}" node -e "console.log(require('bcrypt').hashSync(process.env.ADMIN_PASSWORD,10))")
    P -d $DB -c "update \"User\" set password='$HASH', activated=true where email='admin@neptive.com'"
    echo "QUEUE posts moved 100 years out (the orchestrator's hourly sweep only looks +-3h around now):"
    P -d $DB -c "update \"Post\" set \"publishDate\" = \"publishDate\" + interval '100 years' where state='QUEUE'" -c "select count(*) from \"Post\" where state='QUEUE' and \"publishDate\" < now() + interval '30 days'"
    "$0" counts "$R/counts-before.txt";;
  env)
    umask 077
    { echo "JWT_SECRET=$(openssl rand -hex 32)"
      cat <<ENV
MAIN_URL=https://portal.neptive.com
FRONTEND_URL=https://portal.neptive.com
NEXT_PUBLIC_BACKEND_URL=https://portal.neptive.com/api
BACKEND_INTERNAL_URL=http://localhost:3000
TEMPORAL_ADDRESS=pzn-temporal:7233
DATABASE_URL=postgresql://postiz-app:pzn-local-only@pzn-postgres:5432/$DB
REDIS_URL=redis://pzn-redis:6379
STORAGE_PROVIDER=local
UPLOAD_DIRECTORY=/uploads
NEXT_PUBLIC_UPLOAD_DIRECTORY=/uploads
IS_GENERAL=true
DISABLE_REGISTRATION=true
NX_ADD_PLUGINS=false
NODE_ENV=production
ENV
    } > "$R/env"; echo "wrote $R/env (variable names only: $(cut -d= -f1 "$R/env" | tr '\n' ' '))";;
  plain)
    docker rm -f pzr-plain >/dev/null 2>&1 || true
    docker run -d --name pzr-plain $(run_args) "$IMAGE" >/dev/null
    for _ in $(seq 1 90); do [ "$(docker inspect -f '{{.State.Status}}' pzr-plain)" = running ] || break; sleep 2; done
    echo "state: $(docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' pzr-plain)"; docker logs pzr-plain 2>&1 | tail -40
    docker rm -f pzr-plain >/dev/null;;
  diff)
    docker run --rm $(run_args) "$IMAGE" sh -c "cd /app && pnpm dlx prisma@6.5.0 migrate diff --from-url \"\$DATABASE_URL\" --to-schema-datamodel $SCHEMA --script";;
  schema)
    docker run --rm $(run_args) "$IMAGE" sh -c "cd /app && pnpm dlx prisma@6.5.0 db push --accept-data-loss --schema $SCHEMA";;
  up)
    docker rm -f pzr-postiz >/dev/null 2>&1 || true
    docker run -d --name pzr-postiz -p 127.0.0.1:4017:5000 $(run_args) "$IMAGE" >/dev/null; echo "started pzr-postiz from $IMAGE";;
  counts)
    P -d $DB -c "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" > "$2"; echo "counts -> $2 ($(wc -l < "$2") tables)";;
  down)
    docker rm -f pzr-postiz pzr-plain >/dev/null 2>&1 || true; docker volume rm pzr-uploads pzr-config >/dev/null 2>&1 || true; echo "removed";;
  *) sed -n 2,14p "$0"; exit 1;;
esac
