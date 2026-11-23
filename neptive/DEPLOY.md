# Deploying the Neptive portal (portal.neptive.com)

Script: `neptive/scripts/deploy-prod.sh`. Everything below was rehearsed locally on the production image
(`neptive/dev/rehearse-prod-image.sh`, `neptive/dev/prod-check.mjs`) against a restored production dump; the server
itself has only been read, never written. **Nothing here has been run on the server.**

## What the server looks like (read-only checks, 19 Nov 2026)

- `neptive-hostinger-01`, x86_64 (same as the workstation, the image is amd64), 1 vCPU, 3.8 GB RAM (about 1.5 GB
  available) + 2 GB swap, Ubuntu 26.04, Docker 29.1.3 with the containerd image store, Compose 2.40.3.
- `/opt/postiz-neptive/compose.yml`: service `postiz`, `image: local/postiz-neptive:neptive`, a `build:` section
  (context `/home/lorenzo/postiz-neptive`, `Dockerfile.dev`, arg `NEXT_PUBLIC_VERSION: neptive`), port
  `127.0.0.1:4007:5000`, `restart: unless-stopped`, env file `/etc/neptive/postiz.env` (never read here).
- Container CMD: `nginx && pnpm run pm2`; `pm2` runs `prisma db push` (no flags) then backend, frontend, orchestrator.
- The checkout `/home/lorenzo/postiz-neptive` is on branch `neptive` at `a76c75ef` with 10 uncommitted files
  (preserved as commit `4cb078c3`). **Temporal bind-mounts `/home/lorenzo/postiz-neptive/dynamicconfig`**, so that
  directory must stay where it is.
- Disk: `/` 48 GB, 33 GB used, **15 GB free**. `docker system df`: build cache 10.2 GB.

## The image

| | |
|---|---|
| tag | `local/postiz-neptive:neptive-next-d54aa4c8` (commit `d54aa4c8` of `neptive-next`) |
| id | `sha256:e50c031735e4432b13cc06afa95152289af2a056829ac0985f2f3e6d558b6f93` |
| build | `Dockerfile.dev`, `--build-arg NEXT_PUBLIC_VERSION=neptive`, nothing else (production passes nothing else). Built from `git archive`, so no `.env` and no `neptive/dev/.data` can get in (`.dockerignore` also excludes them now: before this change a plain `docker build .` on the workstation would have baked the local `.env` and the customer dumps into the image) |
| size | **2.37 GB** as exported by `docker save` (layers are already gzip-compressed, so zstd/ssh compression saves ~0.2 %); ~9.2 GB unpacked; `docker images` shows 11.4 GB. The image now on the server shows 6.66 GB the same way |
| build time | 8 min here; the Next/Nest builds alone 1m49 cold |
| transfer | measured upload to the server: 2.0 MB/s (100 MB in 49 s). **2.37 GB is about 20 minutes** (25 at 1.6 MB/s). The site stays up meanwhile; `docker load` runs under `nice`/`ionice`, expect slower pages while it unpacks |

`NEXT_PUBLIC_*` values: production passes only `NEXT_PUBLIC_VERSION=neptive` at build time. `NEXT_PUBLIC_BACKEND_URL`
and friends come from the container environment at run time (compose), so the image is not tied to a URL.

### Free disk space (needed before the load)

The new image needs about 11 GB on the server and 15 GB are free: it would fit with 4 GB to spare, too little next to
Postgres and Elasticsearch. The server no longer builds, so its build cache is dead weight:

```
ssh neptive-hostinger-01 'docker system df; docker builder prune -af; df -h /'
```

This frees about 10 GB and does not touch images, containers or volumes. It is a write on the server: do it
deliberately, before the deploy. The preflight step stops below 14 GB free.

## Recommended order: `--stop-before-schema`

The old code must never run against the new schema, so the recommended run is
`deploy-prod.sh --i-have-approval --stop-before-schema --sha <sha>`:

preflight -> backups -> rollback tag -> transfer + load (site still up) -> **`docker compose stop postiz` (downtime
starts)** -> baseline row counts (container stopped) -> one-time schema step + row-count comparison -> retag +
`up -d --no-build --no-deps postiz` -> health checks (downtime ends). Downtime is about one to two minutes longer than
without the flag because the schema step (diff, `prisma db push`, both via `pnpm dlx` downloads) sits inside it. Without
the flag the schema step runs while the old container still serves (step 6 and 7 below, as originally rehearsed).

If anything fails after the stop, the script says so; follow "Rollback" (the old image does not need the old schema).

## Order of the runbook (the script does exactly this)

Deploy the rehearsed image: `neptive/scripts/deploy-prod.sh --dry-run --sha d54aa4c8` first and read it, then the same with `--i-have-approval` instead of `--dry-run`, **always with `--stop-before-schema`** (the recommended and default-intended order, below) (without `--sha` the script builds the current HEAD, which is a different image: later commits only touched docs/dev tooling, but then it is not the one rehearsed; `--sha` reuses the local image if it exists). It stops at the first
failing command; resume with `--from <step> --date <same date>` (the date names the backups and the rollback tag).

1. **build** (workstation): tree clean, commit pushed to `origin/neptive-next`, `git archive` into a temp dir,
   `docker build`; checks the image has no `.env` / dev data and is amd64.
2. **preflight** (read-only): ssh works, `uname -m` = x86_64, >= 14 GB free, >= 700 MB available RAM, postiz /
   postiz-postgres / postiz-redis / temporal / temporal-postgresql / temporal-elasticsearch running (and healthy where
   they have a healthcheck), **`mastra_experiment_results` has 0 rows** (else stop: the schema step would lose data),
   compose service uses `local/postiz-neptive:neptive`, zstd present, records the **image id to roll back to** and the
   row counts of every table, prints how many QUEUE posts fall in the next 3 hours (pick a quiet moment).
3. **backup**: `pg_dump -Fc` of `postiz-db` into `/root/backups/postiz-db-pre-neptive-next-<date>.dump` (mode 600,
   `.sha256` next to it, verified with `pg_restore --list`), same for the Temporal database, plus a copy of
   `compose.yml`.
4. **tag-rollback**: `docker tag local/postiz-neptive:neptive local/postiz-neptive:rollback-<date>`.
5. **transfer**: `docker save | zstd | ssh | zstd -d | docker load`, then compares the image id on the server with
   the local one.
6. **schema** (the one-time step): from a one-off container of the *new* image on the compose network
   (`DATABASE_URL` only, no env file): `prisma migrate diff --script` is saved to `/root/backups/schema-diff-<date>.sql`
   and the script refuses if it contains `DROP TABLE/COLUMN/TYPE`, `TRUNCATE` or `DELETE`; then
   `prisma db push --accept-data-loss`; then the row count of every table is compared with the preflight snapshot
   (any difference stops the run) and `neptive_plan_item_variants` must exist.
7. **switch**: `docker tag <new> local/postiz-neptive:neptive` and
   `cd /opt/postiz-neptive && docker compose up -d --no-build --no-deps postiz`. Downtime starts here.
8. **health**: "Backend is running" in the log (waits up to 180 s), container running with 0 restarts and running the
   new image id, pm2 shows backend + frontend + orchestrator `online`, `neptive_plan_item_variants` exists, HTTPS 200
   on `/auth/login` and `/portal/login`, no "postiz" in either HTML, `/api/neptive/portal/me` without a session
   answers 401 (not 502).

### Why a retag and not an edited compose file

The compose file keeps `image: local/postiz-neptive:neptive`; only what that tag points to changes. Nothing on the
server is edited, `compose.yml` is byte-identical afterwards, rollback is one `docker tag`. With an explicit new tag in
the compose file you get a modified compose file to remember (and to revert), and the `build:` section would still
point at the old `neptive` checkout either way. `--no-build` is what keeps Compose from ever building on the server;
`--no-deps` leaves Postgres/Redis/Temporal alone.

### Why the schema step is separate

`pm2-run` does `pnpm run prisma-db-push && ...`; without `--accept-data-loss` it exits 1 on the new unique constraint on
`mastra_experiment_results` (rehearsed: exit 1, `restart: unless-stopped` would then crash-loop the container; the only
warning was that one). Never put the flag into the container start: it would also be applied on every future
restart. The one-off container applies it once, after the diff was checked, and then the normal start finds the
database "already in sync".

What the diff does (11 `DROP INDEX`/constraint statements, all re-created or replaced; everything else is `ADD COLUMN`
with NULL or a default, new tables, new enum values, indexes): row counts of all 82 existing tables were identical
before and after in the rehearsal (20 new tables, all empty).

The schema step runs while the old container still serves. That is safe only if the old code tolerates the new
schema, which is the same assumption the rollback makes (see below; not run against the old image, only reasoned from
the DDL: new columns are nullable or have defaults, one `NOT NULL` was loosened). It takes under a minute and the
tables are tiny. If you prefer, stop the container first (`docker stop postiz`) and accept the extra minute of downtime.

## Expected downtime

From `docker compose up -d` recreating the container to HTTPS 200: **plan for 1 to 2 minutes, at most 3**. Basis: the
same image on this workstation takes 10 s from `docker run` to "Backend is running" (that includes the
`pnpm dlx prisma@6.5.0` download that every start does, so the server needs npm registry access, as today); the old
container's stop takes up to 10 s; the server has 1 vCPU, assume 3 to 5 times slower than here. The transfer (20 min)
and the schema step are not downtime.

## Rollback

The database is **not** restored by default; the old image comes back with a one-line override.

What the old image does against the new schema (tested: old `schema.prisma` from `4cb078c3`, i.e. exactly what is on
the server, plain `prisma db push` as the old container CMD runs it, against the migrated rehearsal database):

```
⚠️  There might be data loss when applying the changes:
  • The values [SLOT_REOPENED] on the enum `NeptiveActivityType` will be removed. ...
  • The values [REOPENED] on the enum `NeptiveApprovalActionType` will be removed. ...
  • You are about to drop the column `status` on the `Media` table, which still contains 43 non-null values.
Error: Use the --accept-data-loss flag ...        (exit 1)
```

So the old image cannot start with its own CMD once the new schema is applied: it would exit and crash-loop. It does
not drop anything (it refuses), but it also does not start. (It would only be silent about the new empty tables; with
variants data it would warn about those too.) Never "fix" this by adding `--accept-data-loss` to the old start: that
would drop `Media.status`, the variants table and more.

The old *code* does not need the old schema: the new schema only adds nullable/defaulted columns and tables, loosens
`Comments.userId` to nullable, and replaces 11 indexes. So rollback = old image + a command that skips the schema step.
The command shape was run with the new image against the migrated database (3 apps online, `/auth/login` 200, no prisma
call in the log). Running the old image itself against the migrated schema was **not** done (it is not on this
machine); it follows from the DDL. If you want it proven before the deploy, copy the old image here (`ssh ... docker save | docker load`, 1.5 GB) and start it with the override against the rehearsal database.

```
ssh neptive-hostinger-01
cd /opt/postiz-neptive
cat > compose.rollback.yml <<'EOF'
services:
  postiz:
    command: ["sh", "-c", "nginx && pm2 delete all || true; pnpm run --parallel pm2 && pm2 logs"]
EOF
docker tag local/postiz-neptive:rollback-<date> local/postiz-neptive:neptive
docker compose -f compose.yml -f compose.rollback.yml up -d --no-build --no-deps postiz
```

or `neptive/scripts/deploy-prod.sh --i-have-approval --rollback rollback-<date>` (same commands + health checks).
Keep using `-f compose.yml -f compose.rollback.yml` for every `up` of the old image, otherwise it crash-loops. Data
written by the new code (variants, confirmations, comments) stays in the tables the old code ignores; rows the old
code creates meanwhile are normal rows.

Restore the database only if data was damaged (not for "the old image won't start"; that is the override above):

```
docker stop postiz
docker exec -i postiz-postgres pg_restore -U postiz-app -d postiz-db --clean --if-exists --no-owner < /root/backups/postiz-db-pre-neptive-next-<date>.dump
```

This loses everything written after the backup (client decisions, new magic links, sessions). Verify the sha256 first.
The Temporal database dump is only needed if workflow state is damaged (it is not touched by the schema step).

## After the deploy

- Log in as admin, open `/agency/<customer>/ped`, open a client portal with a fresh magic link.
- `docker logs -f postiz` for a few minutes (do not paste logs anywhere: they can contain URLs/ids).
- `docker exec postiz-postgres psql -U postiz-app -d postiz-db -Atc "select count(*) from \"Post\" where state='QUEUE'"`
  should equal the number from the preflight.
- When satisfied (days later), `docker rmi local/postiz-neptive:rollback-<date>` to reclaim the old image (~6.7 GB).

### The server checkout `/home/lorenzo/postiz-neptive` (suggestion, not done)

It is misleading afterwards: branch `neptive` at the old commit with 10 dirty files, while the container runs
`neptive-next`. Do not delete or move it (Temporal mounts `dynamicconfig/` from it, and a recreate of `temporal` would
break). Suggested: keep the directory, add a one-line `DO-NOT-BUILD-HERE.txt` pointing to this file, and stop
`docker compose build` from being possible by habit: the `build:` section of `compose.yml` could be removed later
(separate, deliberate change). Moving Temporal's mount to `/opt/postiz-neptive/dynamicconfig` (copy the two yaml files,
identical to the repo's `dynamicconfig/`) is what finally lets the checkout go.

## Things this rehearsal found that are in the image

- `/copilot/chat` hung without `OPENAI_API_KEY` (2-line fix in `copilot.controller.ts`, `NEPTIVE_CORE_TOUCHPOINTS.md`).
  Without it, every admin page load held a request for 60 s and then made nginx answer 502 to *other* requests for ~10 s
  (4 portal calls failed locally). The new frontend sends that request on every admin page; the old one never did (0 in
  the server's nginx access log). With the fix it answers 503 at once; the browser console logs a CopilotKit
  "runtime_info_fetch_failed" line, nothing is visible.
- `.dockerignore` did not exclude `.env`, `.env.*` or `neptive/dev/.data`, so any `docker build` run from a developer checkout copied the local `.env` (NOT_SECURED, local DB URLs) and the customer dumps into `/app`; fixed, and the script builds from `git archive` anyway. Production's image was not affected (the server checkout has no `.env`).
- Production has `RESEND_API_KEY` but, by variable names, no `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME`: `sendEmailSync`
  returns early without them, so no email leaves today. Unchanged by this deploy.

## Next deploy, prepared 2026-11-23 (not run)

- Image `local/postiz-neptive:neptive-next-51dd7853` (commit `51dd7853`: approval scheduling, `posts.service.ts`
  terminate guard + `deletePost` every root + `changeDate` restart of a waiting QUEUE post, slot lock, customer scope),
  id `sha256:7cd4bcd1c9fe1865f7a48ff8adc28a7ecd8c058e83aa1bf63229c7c5535d92a4`, 2.37 GB, amd64, no `.env` / dev data.
  Built locally with exactly step 1's command (`git archive` + `docker build -f Dockerfile.dev --build-arg
  NEXT_PUBLIC_VERSION=neptive`): 6 min 13 s, `pnpm install` 78 s and `pnpm run build` 76 s both run (no cache:
  `COPY .` precedes them). Supersedes the `c073f6f9` image prepared earlier the same day (do not deploy that one).
- Smoke test of that image (`rehearse-prod-image.sh restore` + `schema` + `up`, prod dump of 19 Nov): "already in sync",
  Backend is running, backend / frontend / orchestrator online with 0 restarts, `/auth/login` 200, `/portal/login` 200,
  `/api/neptive/portal/me` 401. The approval path itself was exercised on the dev backend (`schedule-check.mjs`, 41/41),
  not inside this container.
- Schema: `schema.prisma` unchanged since `d54aa4c8`; the diff against a migrated database is "-- This is an empty
  migration.". That made the schema step fail (the last `grep` for DROP lines exits 1 when there are none, and with
  `--stop-before-schema` the container is already stopped at that point); fixed in `deploy-prod.sh` (`53e3fadc`).
- New at run time: the backend opens a second small Prisma pool (3 connections) for the slot lock, on first use.
- Disk: the 19 Nov deploy left 13 GB free and the preflight wants >= 14 GB. Expect it to stop; free space deliberately
  first (e.g. `docker rmi local/postiz-neptive:rollback-20261119-1930`, the pre-`neptive-next` image, ~6.7 GB, once you
  no longer want to roll back that far; this deploy tags the current image as the new rollback).
- Behaviour change for the agency: from this image the client's approval of a PED slot schedules its DRAFT posts
  (`neptive/docs/approval-scheduling.md`, including "Known limits"). Look at pending approvals with DRAFT posts whose
  date has passed before deploying: on approval they go out at the same hour on the next possible day.

## Deploy log

### 2026-11-19 (Europe/Rome), first deploy of `neptive-next`

- Command: `deploy-prod.sh --i-have-approval --stop-before-schema --sha d54aa4c8 --date 20261119-1930`, exit 0. Approved by Lorenzo.
- Image: `local/postiz-neptive:neptive-next-d54aa4c8`, id `sha256:e50c031735e4432b13cc06afa95152289af2a056829ac0985f2f3e6d558b6f93`
  (2.37 GB transferred; now also tagged `local/postiz-neptive:neptive`).
- Rollback tag: `local/postiz-neptive:rollback-20261119-1930` -> `sha256:d860f4a47d91211bfd6364c7eb46d7f50b16a775d76e0f550372c6ea716d862d`
  (the image that ran until 19:38). Left in place.
- Backups in `/root/backups/` (sha256 verified, `pg_restore --list` ok): `postiz-db-pre-neptive-next-20261119-1930.dump`
  (233,890 B, `2bd3069f…ebb`), `temporal-db-pre-neptive-next-20261119-1930.dump` (83,034 B, `094873a0…5d2`),
  `compose-pre-neptive-next-20261119-1930.yml`, `schema-diff-20261119-1930.sql`.
- Disk before the load: `docker builder prune -af` freed 10.19 GB (`/` 15 GB -> 23 GB free); after the load 13 GB free.
- Transfer + load: about 25 minutes (19:13 start, site up). Downtime: **19:38:39 -> 19:40:16 CET = 1 min 37 s**
  (stop, baseline counts, schema diff + `db push`, recreate, "Backend is running").
- Schema: 110 statements, 11 DROP INDEX/CONSTRAINT only, 0 table/column drops; row counts of all 82 tables unchanged
  after the schema step; 20 new tables, `neptive_plan_item_variants` present and empty.
- Deviations from the runbook: the `--stop-before-schema` flag was added just before the run (and the preflight gained a
  portal-session and QUEUE snapshot); a fresh row-count baseline is taken after the stop. The transfer took longer than
  the 20 minutes estimated. Nothing else.
- Post-deploy checks: 3 apps online with 0 restarts, no 5xx in the container's nginx log, 72 requests over 2 minutes to
  `/auth/login`, `/portal/login`, `/api/neptive/portal/me` returned 200/200/401 (0 x 502), QUEUE posts 30 unchanged,
  unexpired portal sessions 5 before and after, public screenshots in `neptive/dev/.data/shots/live/`.

## Static privacy page (host nginx, outside the image)

`https://portal.neptive.com/privacy` is served by the HOST nginx, not by the app: `location = /privacy` in
`/etc/nginx/sites-available/portal.neptive.com.conf` aliases `/var/www/portal-neptive-static/privacy.html`.
Source of truth: `neptive/static/privacy.html`. To update: edit it, then
`scp neptive/static/privacy.html neptive-hostinger-01:/var/www/portal-neptive-static/privacy.html` (no reload needed).
Image deploys do not touch it. Data-deletion instructions for Meta: `https://portal.neptive.com/privacy#eliminazione-dati`.
Added 2026-11-19; nginx config backup in `/root/backups/nginx-portal.neptive.com.conf-before-privacy-20261119T193939Z`.
