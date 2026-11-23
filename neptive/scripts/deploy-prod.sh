#!/usr/bin/env bash
# Deploy the Neptive Postiz image to production (https://portal.neptive.com). Read neptive/DEPLOY.md first.
#
#   neptive/scripts/deploy-prod.sh --dry-run                      print every command, run nothing
#   neptive/scripts/deploy-prod.sh --i-have-approval --stop-before-schema   run all steps (touches the server); RECOMMENDED order:
#                                                                 the old container is stopped before the schema step
#   neptive/scripts/deploy-prod.sh --i-have-approval --from schema --date 20261120-0830   resume (same --date!)
#   neptive/scripts/deploy-prod.sh --i-have-approval --only preflight                      one step
#   neptive/scripts/deploy-prod.sh --i-have-approval --rollback rollback-20261120-0830     back to the previous image
#
# Steps, in order: build preflight backup tag-rollback transfer schema switch health
# (build and the local half of health run on this workstation; everything else is ssh to the server).
# Stops at the first failing command. Never reads or prints /etc/neptive/postiz.env or any secret: the remote
# commands only touch images, containers, Postgres (trust auth, no password) and /root/backups.
# Without --dry-run it refuses to do anything unless --i-have-approval is given.
set -Eeuo pipefail

HOST="${DEPLOY_HOST:-neptive-hostinger-01}"
COMPOSE_DIR=/opt/postiz-neptive
COMPOSE="$COMPOSE_DIR/compose.yml"
REPO=local/postiz-neptive
LIVE_TAG="$REPO:neptive"
PUBLIC_URL=https://portal.neptive.com
DB_URL='postgresql://postiz-app@postiz-postgres:5432/postiz-db'   # from compose.yml: no password (trust auth)
SCHEMA=./libraries/nestjs-libraries/src/database/prisma/schema.prisma
STEPS=(build preflight backup tag-rollback transfer schema switch health)

STOP_FIRST=0; DRY=0; APPROVED=0; FROM=""; ONLY=""; ROLLBACK_TO=""; REBUILD=0
DATE="$(date +%Y%m%d-%H%M)"; SHA=""
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE_DIR="$ROOT/neptive/dev/.data"

usage() { sed -n 2,13p "$0" | sed 's/^# \{0,1\}//'; exit "${1:-2}"; }
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1;;
    --i-have-approval) APPROVED=1;;
    --from) FROM="$2"; shift;;
    --only) ONLY="$2"; shift;;
    --date) DATE="$2"; shift;;
    --sha) SHA="$2"; shift;;
    --rollback) ROLLBACK_TO="$2"; shift;;
    --rebuild) REBUILD=1;;
    --stop-before-schema) STOP_FIRST=1;;
    -h|--help) usage 0;;
    *) echo "unknown argument: $1" >&2; usage;;
  esac; shift
done
if [ "$DRY" = 0 ] && [ "$APPROVED" = 0 ]; then
  echo "refusing: this script changes production. Use --dry-run to look, or --i-have-approval to run." >&2; exit 2
fi
[ "$DRY" = 1 ] && APPROVED=0   # dry-run never touches anything, whatever else was passed

SHA="${SHA:-$(git -C "$ROOT" rev-parse --short HEAD)}"
IMG="$REPO:neptive-next-$SHA"
ROLLBACK_TAG="$REPO:rollback-$DATE"
STATE="$STATE_DIR/deploy-state-$DATE.env"
mkdir -p "$STATE_DIR"

CURRENT="start"
say()  { printf '\n== %s\n' "$*"; }
die()  { printf 'STOP: %s\n' "$*" >&2; exit 1; }
STOPPED=0
trap 'printf "\nFAILED during step \"%s\" (line %s). Nothing after it was run. See neptive/DEPLOY.md, section Rollback, before retrying.\n" "$CURRENT" "$LINENO" >&2; [ "$STOPPED" = 1 ] && printf "DOWNTIME HAS STARTED (postiz container stopped). Follow the Rollback section now: --rollback rollback-%s\n" "$DATE" >&2' ERR

# local <cmd>: run on this workstation.   R <cmd>: run on the server over ssh.   Rq: same, but capture stdout.
L()  { printf '+ local: %s\n' "$1"; [ "$DRY" = 1 ] || bash -c "set -Eeuo pipefail; $1"; }
R()  { printf '+ ssh %s: %s\n' "$HOST" "$1"; [ "$DRY" = 1 ] || ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" "bash -c $(printf '%q' "set -Eeuo pipefail; $1")"; }
Rq() { printf '+ ssh %s: %s\n' "$HOST" "$1" >&2; if [ "$DRY" = 1 ]; then echo "<dry-run>"; else ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" "bash -c $(printf '%q' "set -Eeuo pipefail; $1")"; fi; }
save() { [ "$DRY" = 1 ] || { touch "$STATE"; grep -v "^$1=" "$STATE" > "$STATE.tmp" || true; printf '%s=%q\n' "$1" "$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; }; }
load() { [ -f "$STATE" ] && source "$STATE" || true; }
load

PSQL="docker exec -i postiz-postgres psql -U postiz-app -d postiz-db -At"
COUNTS_SQL="select table_name||'|'||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"
NETWORK_CMD="docker inspect postiz-postgres --format '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}}{{\"\\n\"}}{{end}}' | grep -m1 postiz-network"
# one-off containers: same image, same network as the compose service, DATABASE_URL only (no env file, no secrets)
one_off() { echo "docker run --rm --network \"\$($NETWORK_CMD)\" -e DATABASE_URL='$DB_URL' $IMG sh -c \"cd /app && $1\""; }

step_build() {
  say "1/8 build on this workstation (the server never builds)"
  L "git -C '$ROOT' diff --quiet && git -C '$ROOT' diff --cached --quiet || { echo 'working tree is dirty: commit or stash first'; exit 1; }"
  L "git -C '$ROOT' fetch -q origin neptive-next && git -C '$ROOT' merge-base --is-ancestor $SHA origin/neptive-next || { echo '$SHA is not pushed to origin/neptive-next'; exit 1; }"
  if [ "$DRY" = 0 ] && [ "$REBUILD" = 0 ] && docker image inspect "$IMG" >/dev/null 2>&1; then
    echo "image $IMG already exists locally: reusing it (use --rebuild to build again)"
  else
    # git archive = exactly the committed files (no .env, no neptive/dev/.data), same build args as production's compose.yml
    L "CTX=\$(mktemp -d) && trap 'rm -rf \"\$CTX\"' EXIT && git -C '$ROOT' archive $SHA | tar -x -C \"\$CTX\" && docker build -f \"\$CTX/Dockerfile.dev\" --build-arg NEXT_PUBLIC_VERSION=neptive -t $IMG \"\$CTX\""
  fi
  L "docker run --rm --entrypoint sh $IMG -c 'test ! -e /app/.env && test ! -e /app/neptive/dev/.data && echo image has no .env and no dev data'"
  L "test \"\$(docker image inspect $IMG --format '{{.Architecture}}')\" = amd64"
  if [ "$DRY" = 0 ]; then
    save IMG "$IMG"; save IMG_ID "$(docker image inspect "$IMG" --format '{{.Id}}')"; save SHA "$SHA"
    echo "image $IMG  id $(docker image inspect "$IMG" --format '{{.Id}}')  size $(docker image inspect "$IMG" --format '{{.Size}}') bytes"
  fi
}

step_preflight() {
  say "2/8 preflight (read-only on the server)"
  R "true && echo ssh ok && uname -m"
  [ "$DRY" = 1 ] || [ "$(Rq 'uname -m')" = x86_64 ] || die "server is not x86_64 (the image is amd64)"
  R "df -h / | tail -1; test \"\$(df --output=avail -BG / | tail -1 | tr -dc 0-9)\" -ge 14 || { echo 'less than 14 GB free: the new image needs ~11 GB on the server. Free space first (DEPLOY.md, \"Free disk space\"), then rerun.'; exit 1; }"
  R "free -m | head -2; test \"\$(free -m | awk '/Mem:/{print \$7}')\" -ge 700 || { echo 'less than 700 MB available memory'; exit 1; }"
  R "for c in postiz postiz-postgres postiz-redis temporal temporal-postgresql temporal-elasticsearch; do s=\$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' \$c); echo \"\$c: \$s\"; case \"\$s\" in 'running healthy'|'running ') ;; *) echo \"\$c is not healthy\"; exit 1;; esac; done"
  R "n=\$($PSQL -c 'select count(*) from mastra_experiment_results'); echo \"mastra_experiment_results rows: \$n\"; test \"\$n\" = 0 || { echo 'not empty: the one-time schema step would lose data. Stop.'; exit 1; }"
  R "$PSQL -c \"select 'QUEUE posts in the next 3 hours: '||count(*) from \\\"Post\\\" where state='QUEUE' and \\\"deletedAt\\\" is null and \\\"publishDate\\\" between now() and now() + interval '3 hours'\" -c \"select 'next QUEUE post: '||coalesce(min(\\\"publishDate\\\")::text,'none') from \\\"Post\\\" where state='QUEUE' and \\\"deletedAt\\\" is null and \\\"publishDate\\\" > now()\""
  R "test \"\$(docker inspect postiz --format '{{.Config.Image}}')\" = '$LIVE_TAG' && docker compose -f $COMPOSE config --images | grep -qx '$LIVE_TAG' && echo compose service uses $LIVE_TAG"
  R "command -v zstd >/dev/null && echo 'zstd present'"
  R "! docker image inspect '$ROLLBACK_TAG' >/dev/null 2>&1 || { echo '$ROLLBACK_TAG already exists: pick another --date'; exit 1; }"
  local id; id="$(Rq "docker inspect postiz --format '{{.Image}}'")"
  echo "image to roll back to: $id (currently tagged $LIVE_TAG)"
  save ROLLBACK_ID "$id"
  if [ "$DRY" = 0 ]; then
    Rq "$PSQL -c \"select 'sessions_unexpired|'||count(*) from neptive_portal_sessions where \\\"expiresAt\\\" > now()\" -c \"select 'queue|'||state||'|'||count(*)||'|'||coalesce(min(\\\"publishDate\\\")::text,'') from \\\"Post\\\" where state='QUEUE' group by state\" -c \"select 'poststates|'||state||'|'||count(*) from \\\"Post\\\" group by state order by 1\"" > "$STATE_DIR/deploy-extra-before-$DATE.txt"; cat "$STATE_DIR/deploy-extra-before-$DATE.txt"
  fi
  if [ "$DRY" = 0 ]; then Rq "$PSQL -c \"$COUNTS_SQL\"" > "$STATE_DIR/deploy-counts-before-$DATE.txt"; echo "row counts of $(wc -l < "$STATE_DIR/deploy-counts-before-$DATE.txt") tables saved for the post-schema comparison"; else Rq "$PSQL -c \"$COUNTS_SQL\"" >/dev/null; fi
}

step_backup() {
  say "3/8 database backups in /root/backups (pg_dump -Fc, sha256, verified with pg_restore --list)"
  local B=/root/backups/postiz-db-pre-neptive-next-$DATE.dump T=/root/backups/temporal-db-pre-neptive-next-$DATE.dump
  R "umask 077; test ! -e $B && docker exec postiz-postgres pg_dump -U postiz-app -d postiz-db -Fc > $B && sha256sum $B > $B.sha256 && cat $B.sha256 && ls -l $B"
  R "test \"\$(docker exec -i postiz-postgres pg_restore --list < $B | grep -c .)\" -gt 100 && echo 'pg_restore --list: ok'"
  R "umask 077; test ! -e $T && docker exec temporal-postgresql pg_dump -U temporal -d temporal -Fc > $T && sha256sum $T > $T.sha256 && cat $T.sha256 && test \"\$(docker exec -i temporal-postgresql pg_restore --list < $T | grep -c .)\" -gt 10 && echo 'temporal dump: ok'"
  R "cp -p $COMPOSE /root/backups/compose-pre-neptive-next-$DATE.yml"
}

step_tag_rollback() {
  say "4/8 tag the running image as $ROLLBACK_TAG"
  R "docker tag $LIVE_TAG $ROLLBACK_TAG && test \"\$(docker image inspect $ROLLBACK_TAG --format '{{.Id}}')\" = \"\$(docker inspect postiz --format '{{.Image}}')\" && echo '$ROLLBACK_TAG -> the image the live container runs'"
}

step_transfer() {
  say "5/8 transfer $IMG (docker save | zstd | ssh | docker load); no build on the server"
  L "docker save $IMG | zstd -T0 -3 -c | ssh -o BatchMode=yes $HOST 'zstd -dc | ionice -c3 nice -n19 docker load'"
  local lid; lid="$( [ "$DRY" = 1 ] && echo '<local-id>' || docker image inspect "$IMG" --format '{{.Id}}')"
  R "test \"\$(docker image inspect $IMG --format '{{.Id}}')\" = '$lid' && echo 'image id on the server matches the local one'"
}

step_schema() {
  say "6/8 one-time schema step (prisma db push --accept-data-loss) from a one-off container of the NEW image"
  local D=/root/backups/schema-diff-$DATE.sql
  if [ "$STOP_FIRST" = 1 ]; then
    echo "DOWNTIME STARTS NOW: stopping the old container so the old code never runs against the new schema"
    save DOWNTIME_START "$(date '+%F %T %Z')"; STOPPED=1
    R "cd $COMPOSE_DIR && docker compose stop postiz && docker inspect -f 'postiz: {{.State.Status}}' postiz"
    if [ "$DRY" = 0 ]; then
      # data may have changed between preflight and the stop (clients are using the portal): the comparison that
      # matters is stopped-before vs after the schema step, so take the baseline now (preflight copy is kept)
      cp "$STATE_DIR/deploy-counts-before-$DATE.txt" "$STATE_DIR/deploy-counts-preflight-$DATE.txt"
      Rq "$PSQL -c \"$COUNTS_SQL\"" > "$STATE_DIR/deploy-counts-before-$DATE.txt"
      diff <(cat "$STATE_DIR/deploy-counts-preflight-$DATE.txt") "$STATE_DIR/deploy-counts-before-$DATE.txt" > "$STATE_DIR/deploy-counts-drift-$DATE.txt" || echo "tables whose count changed between preflight and the stop (live use, informational): $(grep -c '^>' "$STATE_DIR/deploy-counts-drift-$DATE.txt")"
    else
      echo "(dry-run) would re-snapshot every table's row count now (container stopped) as the baseline for the post-schema comparison"
    fi
  fi
  R "$(one_off "pnpm dlx prisma@6.5.0 migrate diff --from-url \\\"\\\$DATABASE_URL\\\" --to-schema-datamodel $SCHEMA --script") > $D; wc -l $D"
  R "if grep -Eqi 'DROP TABLE|DROP COLUMN|DROP TYPE|DROP SCHEMA|TRUNCATE|DELETE FROM' $D; then echo 'the diff drops data:'; grep -Ei 'DROP TABLE|DROP COLUMN|DROP TYPE|DROP SCHEMA|TRUNCATE|DELETE FROM' $D; exit 1; fi; echo \"statements: \$(grep -c ';' $D); DROP INDEX/CONSTRAINT only:\"; grep -E '^(DROP|ALTER TABLE .* DROP)' $D || echo '  (none: no DROP at all)'"
  R "$(one_off "pnpm dlx prisma@6.5.0 db push --accept-data-loss --schema $SCHEMA") | tail -4"
  R "$PSQL -c \"select 'neptive_plan_item_variants: '||coalesce(to_regclass('public.neptive_plan_item_variants')::text,'MISSING')\" | tee /dev/stderr | grep -q 'neptive_plan_item_variants: neptive_plan_item_variants'"
  if [ "$DRY" = 0 ]; then
    Rq "$PSQL -c \"$COUNTS_SQL\"" > "$STATE_DIR/deploy-counts-after-$DATE.txt"
    python3 - "$STATE_DIR/deploy-counts-before-$DATE.txt" "$STATE_DIR/deploy-counts-after-$DATE.txt" <<'PY'
import sys
b = dict(l.strip().split('|') for l in open(sys.argv[1]) if l.strip())
a = dict(l.strip().split('|') for l in open(sys.argv[2]) if l.strip())
bad = [(t, b[t], a.get(t)) for t in b if a.get(t) != b[t]]
print(f"row counts: {len(b)} tables before, {len(a)} after, {len(bad)} changed")
if bad:
    print("CHANGED:", bad)
    sys.exit(1)
PY
  else
    echo "(dry-run) would compare the row counts of every table before/after and stop on any difference"
  fi
}

step_switch() {
  say "7/8 switch the compose service to the new image (retag + up --no-build; compose.yml is not edited)"
  if [ "$STOP_FIRST" = 1 ]; then echo "(the container is already stopped; downtime started before the schema step)"; else echo "DOWNTIME STARTS: the postiz container is recreated (nginx + backend + frontend + orchestrator restart)"; save DOWNTIME_START "$(date '+%F %T %Z')"; STOPPED=1; fi
  R "docker tag $IMG $LIVE_TAG"
  R "cd $COMPOSE_DIR && docker compose up -d --no-build --no-deps postiz"
}

health_checks() {
  local want_image="$1" mode="${2:-deploy}"
  R "for i in \$(seq 1 60); do docker logs postiz 2>&1 | grep -q 'Backend is running' && { echo 'log: Backend is running'; exit 0; }; sleep 3; done; echo 'Backend never reported running within 180 s'; exit 1"
  R "docker inspect -f 'container: {{.State.Status}}, restarts {{.RestartCount}}' postiz; test \"\$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' postiz)\" = 'running 0'"
  R "test \"\$(docker inspect postiz --format '{{.Image}}')\" = \"\$(docker image inspect $want_image --format '{{.Id}}')\" && echo 'container runs $want_image'"
  R "docker exec -i postiz node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const l=JSON.parse(s).map(p=>p.name+' '+p.pm2_env.status);console.log('pm2: '+l.join(', '));process.exit(['backend','frontend','orchestrator'].every(n=>l.includes(n+' online'))?0:1)})\" < <(docker exec postiz pm2 jlist)"
  R "$PSQL -c \"select 'neptive_plan_item_variants: '||coalesce(to_regclass('public.neptive_plan_item_variants')::text,'MISSING')\""
  local p code html
  for p in /auth/login /portal/login; do
    L "code=\$(curl -s -o /dev/null -w '%{http_code}' $PUBLIC_URL$p); echo \"$PUBLIC_URL$p -> \$code\"; test \"\$code\" = 200"
    [ "$mode" = rollback ] || L "n=\$(curl -s $PUBLIC_URL$p | grep -ci postiz || true); echo \"'Postiz' in $p HTML: \$n\"; test \"\$n\" = 0"
  done
  L "code=\$(curl -s -o /dev/null -w '%{http_code}' $PUBLIC_URL/api/neptive/portal/me); echo \"$PUBLIC_URL/api/neptive/portal/me (no session) -> \$code\"; test \"\$code\" = 401"
}
step_health() { say "8/8 health checks"; health_checks "$IMG"; STOPPED=0; save DOWNTIME_END "$(date '+%F %T %Z')"; load; echo "downtime: ${DOWNTIME_START:-?} -> ${DOWNTIME_END:-?}"; echo; [ "$DRY" = 1 ] || echo "Deploy finished. Next: neptive/DEPLOY.md, 'After the deploy' (log in as admin, open the Aurora variants slot, watch docker logs postiz for a few minutes)."; }

rollback() {
  local tag="$1"
  case "$tag" in "$REPO":*) ;; *) tag="$REPO:$tag";; esac
  say "ROLLBACK to $tag (previous image; the database is NOT restored, see neptive/DEPLOY.md)"
  CURRENT=rollback
  R "docker image inspect $tag >/dev/null && echo 'rollback image present'"
  # The old image's start script runs a plain 'prisma db push', which refuses against the new schema (tested). Skip it.
  R "cat > $COMPOSE_DIR/compose.rollback.yml <<'EOF'
services:
  postiz:
    command: [\"sh\", \"-c\", \"nginx && pm2 delete all || true; pnpm run --parallel pm2 && pm2 logs\"]
EOF"
  R "docker tag $tag $LIVE_TAG"
  R "cd $COMPOSE_DIR && docker compose -f compose.yml -f compose.rollback.yml up -d --no-build --no-deps postiz"
  health_checks "$tag" rollback
  echo; echo "Rolled back. compose.rollback.yml stays in $COMPOSE_DIR on purpose: ALWAYS start the old image with it (-f compose.yml -f compose.rollback.yml)."
}

if [ -n "$ROLLBACK_TO" ]; then rollback "$ROLLBACK_TO"; exit 0; fi

started=0; [ -z "$FROM" ] && started=1
for s in "${STEPS[@]}"; do
  [ -n "$ONLY" ] && [ "$s" != "$ONLY" ] && continue
  [ "$s" = "$FROM" ] && started=1
  [ "$started" = 1 ] || continue
  CURRENT="$s"
  "step_${s//-/_}"
done
CURRENT=done
[ "$DRY" = 1 ] && echo && echo "dry-run finished: nothing was executed."
exit 0
