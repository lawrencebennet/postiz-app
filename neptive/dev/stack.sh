#!/usr/bin/env bash
# Local stack control. Usage: neptive/dev/stack.sh {up|down|app|app-stop|reset|restore|status}
#   up        start Postgres/Redis/Temporal containers (127.0.0.1 only)
#   down      stop containers, keep data
#   restore   restore newest dump in .data/ into pzn-postgres, run prisma db push, sanitise (tokens/admin pw/magic link)
#   app       start backend (:3000) + frontend (:4200) in dev mode, logs in .data/dev.log
#   app-stop  stop them
#   reset     DESTROY local containers + volumes (never touches production)
set -euo pipefail
DEV="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$DEV/../.." && pwd)"; DATA="$DEV/.data"
source "$DEV/env.sh"
DC="docker compose -f $DEV/compose.local.yml"
PSQL="docker exec -i pzn-postgres psql -U postiz-app -v ON_ERROR_STOP=1 -q"
cmd="${1:-status}"
case "$cmd" in
  up) "$DEV/make-env.sh"; $DC up -d --wait pzn-postgres pzn-redis pzn-temporal-postgres pzn-temporal-elasticsearch; $DC up -d pzn-temporal; echo "up (Temporal needs ~30s more)";;
  down) $DC down;;
  reset) $DC down -v;;
  restore)
    DUMP="$(ls -t "$DATA"/prod-*.dump | head -1)"; echo "restoring $DUMP"
    $PSQL -d postgres -c 'drop database if exists "postiz-db" with (force)' -c 'create database "postiz-db"'
    docker exec -i pzn-postgres pg_restore -U postiz-app -d postiz-db --no-owner --no-privileges < "$DUMP"
    docker exec pzn-postgres pg_dump -U postiz-app -d postiz-db --schema-only --no-owner > "$DATA/schema-before.sql"
    cd "$ROOT"; set -a; source .env; set +a
    # same command production runs (root package.json: prisma-db-push). Production has no --accept-data-loss; see README.
    pnpm dlx prisma@6.5.0 db push ${ACCEPT_DATA_LOSS:+--accept-data-loss} --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma | tee "$DATA/db-push-output.txt"
    docker exec pzn-postgres pg_dump -U postiz-app -d postiz-db --schema-only --no-owner > "$DATA/schema-after.sql"
    python3 "$DEV/../scripts/schema-diff.py" "$DATA/schema-before.sql" "$DATA/schema-after.sql" > "$DATA/schema-changes.md"
    "$DEV/prepare-local-db.sh";;
  app)
    cd "$ROOT"; [ -f .env ] || "$DEV/make-env.sh"
    # Next 16.4.2 prints a one-off "security upgrade recommendation" and exits on some starts; the retry is its documented behaviour.
    for attempt in 1 2 3; do
      nohup setsid pnpm run dev-backend > "$DATA/dev.log" 2>&1 < /dev/null & echo $! > "$DATA/dev.pid"
      for _ in $(seq 1 90); do sleep 2
        grep -q SecurityFatalError "$DATA/dev.log" && break
        curl -fs -o /dev/null localhost:4200/auth/login && curl -s -o /dev/null localhost:3000/ && { echo "up: http://localhost:4200 (API :3000), log .data/dev.log"; exit 0; }
      done
      echo "attempt $attempt failed (see .data/dev.log), retrying"; "$0" app-stop
    done; exit 1;;
  app-stop)
    [ -f "$DATA/dev.pid" ] && kill -- -"$(cat "$DATA/dev.pid")" 2>/dev/null || true; rm -f "$DATA/dev.pid"
    for p in 3000 4200; do fuser -k $p/tcp 2>/dev/null || true; done;;
  status) docker ps --filter name=pzn- --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'; ss -ltn | grep -E ':(3000|4200)\b' || echo "app not listening";;
  *) sed -n 2,9p "$0"; exit 1;;
esac
