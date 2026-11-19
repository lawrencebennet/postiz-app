#!/usr/bin/env bash
# Take upstream Postiz changes into a FRESH branch, check them, report. See neptive/UPSTREAM-SYNC.md.
#
#   neptive/scripts/sync-upstream.sh [--no-build]
#
# env: BASE=neptive-next          branch to start from (default: current branch)
#      UPSTREAM_REF=upstream/main what to merge
#      DUMP=<file>                prod dump used for the schema dry-run (default: newest neptive/dev/.data/prod-*.dump)
#
# It never pushes, never deploys, never touches production, never force-anything.
# The only writes: a new local branch sync/upstream-<date>, a merge commit on it, build output, and a THROWAWAY
# database (pzn_sync_<ts>) inside the local pzn-postgres container, dropped at the end.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
BUILD=1; [[ "${1:-}" == "--no-build" ]] && BUILD=0
UPSTREAM_REF="${UPSTREAM_REF:-upstream/main}"
BASE="${BASE:-$(git rev-parse --abbrev-ref HEAD)}"
STAMP="$(date +%Y%m%d-%H%M)"; BRANCH="sync/upstream-$STAMP"
OUT="$ROOT/neptive/dev/.data/sync-$STAMP"; mkdir -p "$OUT"
say() { printf '\n=== %s\n' "$*"; }
die() { echo "STOP: $*" >&2; exit 1; }

say "0. preconditions"
git remote get-url upstream >/dev/null 2>&1 || die "no 'upstream' remote (git remote add upstream https://github.com/gitroomhq/postiz-app.git)"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "working tree has uncommitted changes; commit or stash first"
git rev-parse --verify -q "$BASE" >/dev/null || die "BASE $BASE not found"
[[ "$BASE" != "neptive" ]] || die "BASE=neptive is the production branch; sync from neptive-next (or a branch derived from it)"

say "1. fetch upstream (fetch only)"
git fetch upstream --tags || die "fetch failed"
echo "upstream: $(git rev-parse --short "$UPSTREAM_REF")  $(git describe --tags --abbrev=0 "$UPSTREAM_REF" 2>/dev/null)"
echo "new upstream commits since last merge: $(git rev-list --count "$BASE..$UPSTREAM_REF")"

say "2. fresh branch $BRANCH from $BASE + merge $UPSTREAM_REF (merge commit, no rebase/squash)"
git checkout -b "$BRANCH" "$BASE" || die "cannot create branch"
MLOG="$OUT/merge.log"
if git merge --no-ff -m "Merge $UPSTREAM_REF into $BRANCH" "$UPSTREAM_REF" > "$MLOG" 2>&1; then
  tail -3 "$MLOG"; echo "merge clean"
else
  cat "$MLOG" | grep -vE '^ |create mode|delete mode' | tail -20
  if [[ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]]; then
    # includes conflicts that git rerere already re-resolved and staged (they no longer show as 'unmerged')
    CONF="$(grep -E '^CONFLICT' "$MLOG" | sed -E 's/.*Merge conflict in //; s/^CONFLICT \([^)]*\): //' | sort -u)"
    echo; echo "CONFLICTS ($(echo "$CONF" | grep -c .)); lines marked 'Staged ... using previous resolution' were re-applied by rerere: REVIEW them:"
    echo "$CONF" | sed 's/^/  /'; echo "$CONF" > "$OUT/conflicts.txt"
    echo
    echo "Merge left IN PROGRESS on $BRANCH (throwaway branch). Resolve + 'git add' + 'git commit', then re-run the checks"
    echo "(BASE=$BRANCH $0). To give up: git merge --abort && git checkout $BASE && git branch -D $BRANCH"
    exit 2
  fi
  die "merge failed without a merge in progress (see $MLOG)"
fi

say "3. merge surface: files BOTH upstream and Neptive changed since the merge base"
MB="$(git merge-base "$BASE" "$UPSTREAM_REF")"
comm -12 <(git diff --name-only "$MB" "$UPSTREAM_REF" | sort) <(git diff --name-only "$MB" "$BASE" | sort) | tee "$OUT/surface.txt"
echo "(review these: auto-merged does not mean the Neptive hook still fits)"

say "4. other upstream changes that matter to Neptive code"
git diff --stat "$BASE" HEAD -- libraries/nestjs-libraries/src/database/prisma/schema.prisma 'apps/backend/src/services/auth' apps/frontend/src/proxy.ts 'apps/frontend/src/components/layout' | tail -15

if [[ $BUILD == 1 ]]; then
  source neptive/dev/env.sh
  say "5. install (frozen lockfile) + prisma generate"
  pnpm install --frozen-lockfile 2>&1 | tail -5 || echo "!! install failed: lockfile probably needs 'pnpm install' by a human (review pnpm-lock.yaml diff)"
  say "6. type check + production build (backend, frontend, orchestrator)"
  # Next 16.x may print a one-off 'security upgrade recommendation' and exit 1; run again once if so.
  for i in 1 2; do
    NODE_OPTIONS="--max-old-space-size=8192" pnpm run build > "$OUT/build.log" 2>&1; rc=$?
    [[ $rc == 0 ]] && break
    grep -q SecurityFatalError "$OUT/build.log" && { echo "next advisory stop, retrying once"; continue; }
    break
  done
  echo "BUILD exit=$rc (log: $OUT/build.log)"; [[ $rc == 0 ]] || grep -nE 'error TS|Error:|Failed' "$OUT/build.log" | head -20
  say "7. neptive tests"
  pnpm exec jest --config neptive/jest.config.ts --runInBand 2>&1 | tail -8
fi

say "8. schema diff against a COPY of the newest production dump (throwaway DB in local pzn-postgres)"
DUMP="${DUMP:-$(ls -t neptive/dev/.data/prod-*.dump 2>/dev/null | head -1)}"
if [[ -z "$DUMP" ]] || ! docker ps --format '{{.Names}}' | grep -qx pzn-postgres; then
  echo "skipped: need a dump in neptive/dev/.data/ and the local stack up (neptive/dev/stack.sh up)"
else
  DB="pzn_sync_$(date +%s)"; PG="docker exec -i pzn-postgres"
  $PG psql -U postiz-app -d postgres -q -c "create database \"$DB\"" && \
  $PG pg_restore -U postiz-app -d "$DB" --no-owner --no-privileges < "$DUMP" 2>/dev/null
  $PG pg_dump -U postiz-app -d "$DB" --schema-only --no-owner > "$OUT/schema-before.sql"
  export DATABASE_URL="postgresql://postiz-app:pzn-local-only@127.0.0.1:55432/$DB"   # hard-wired local; never read from .env
  source neptive/dev/env.sh
  echo "-- prisma db push exactly as production runs it (no --accept-data-loss):"
  pnpm dlx prisma@6.5.0 db push --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma > "$OUT/db-push.txt" 2>&1; prc=$?
  tail -12 "$OUT/db-push.txt"
  if [[ $prc != 0 ]]; then
    echo "!! plain 'db push' REFUSED (data-loss warning or error). Production would stop at the same point."
    echo "!! Re-applying with --accept-data-loss on the THROWAWAY copy only, to show what would change:"
    pnpm dlx prisma@6.5.0 db push --accept-data-loss --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma > "$OUT/db-push-accept.txt" 2>&1 || echo "!! even that failed, see $OUT/db-push-accept.txt"
  fi
  $PG pg_dump -U postiz-app -d "$DB" --schema-only --no-owner > "$OUT/schema-after.sql"
  python3 neptive/scripts/schema-diff.py "$OUT/schema-before.sql" "$OUT/schema-after.sql" | tee "$OUT/schema-changes.md"
  $PG psql -U postiz-app -d postgres -q -c "drop database \"$DB\" with (force)"
fi

say "done. Branch $BRANCH (local only, NOT pushed). Reports in $OUT"
echo "Next: read the surface list + schema flags above, run the browser smoke (neptive/dev/qa.mjs), then merge $BRANCH into neptive-next yourself."
