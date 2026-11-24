# Deploying the Neptive portal (portal.neptive.com)

Script: `neptive/scripts/deploy-prod.sh`. Everything below was rehearsed locally on the production image
(`neptive/dev/rehearse-prod-image.sh`, `neptive/dev/prod-check.mjs`) against a restored production dump; the first run on the server was the deploy of 19 Nov (see "Deploy log"). Nothing is pending: the server runs
`neptive-next-5a594471` since 24 Nov.

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

## Deploy log

### 2026-11-24 (Europe/Rome), second deploy: `neptive-next-5a594471`

- Command: `deploy-prod.sh --i-have-approval --stop-before-schema --sha 5a594471 --date 20261124-1626`, exit 0. Approved by
  Lorenzo. Run started 16:26 (log: `neptive/dev/.data/deploy-20261124-1626.log`, not committed).
- Image: `local/postiz-neptive:neptive-next-5a594471`, id `sha256:f31f4a72daa17056b7b47622431c46932402b7ee3640edb2bd361ace876e8864`
  (now also `local/postiz-neptive:neptive`). Transfer + load about 22 minutes, site up.
- Rollback tag: `local/postiz-neptive:rollback-20261124-1626` -> `sha256:e50c031735e4432b13cc06afa95152289af2a056829ac0985f2f3e6d558b6f93`
  (= `neptive-next-d54aa4c8`, the image that ran until 16:48). The pre-19-Nov rollback image
  `rollback-20261119-1930` (`d860f4a4`) was deleted beforehand (approved by Lorenzo). `neptive-next-d54aa4c8` is still tagged too.
- Backups in `/root/backups/` (pg_restore --list ok): `postiz-db-pre-neptive-next-20261124-1626.dump` (306,537 B,
  sha256 `7e65dd573cc1ee6eab3c20709191815588951b1cbccc38c81d1a1c6e18c51cb4`), `temporal-db-pre-neptive-next-20261124-1626.dump`
  (90,403 B, sha256 `3ea303efa9c21eb24885123e32d6fbe0a2aec9a59acae65e32080783a571ad5d`),
  `compose-pre-neptive-next-20261124-1626.yml`, `schema-diff-20261124-1626.sql` (14 statements, no DROP).
- Disk: 12 GB free at start; `docker rmi rollback-20261119-1930` -> 18 GB free (no build cache to prune); after the load and
  switch **7.2 GB free** (`/` 85 % used): the next deploy needs space again (`docker rmi` of `neptive-next-d54aa4c8` tag
  does not free it while `rollback-20261124-1626` points to the same image).
- Downtime: **16:48:53 -> 16:50:35 CET = 1 min 42 s**.
- Schema: 14 statements, 0 DROP; row counts of 102 tables identical before/after (and between preflight and the stop);
  104 tables after; `neptive_client_credentials` and `neptive_login_attempts` empty; `passwordChangeRequired` boolean default false.
- Preflight snapshot: 12 unexpired portal sessions, Post 73 (DRAFT 41, PUBLISHED 1, QUEUE 31): identical after.
  3 QUEUE posts were due within 3 hours (Casa Pandora IG+FB and Aurora Gallorini IG at 17:30 Rome); no pending approval had
  a DRAFT post with a past date. Aurora Performer: 11 "Tale e Quale Show" groups (DRAFT, 18:00 Rome on 24 Nov, pending client
  approval) would be moved to the next day if approved after 18:00.
- Post-deploy checks: container on the new id, 0 restarts; pm2 backend/frontend/orchestrator online, 0 restarts; "Backend is
  running"; no prisma/Temporal errors in the log (only the normal "already in sync" push output); `/auth/login`,
  `/portal/login`, `/portal/account`, `/privacy` 200 without "Postiz"; `/api/neptive/portal/me` 401; POST to
  `/api/neptive/portal-auth/login` with `Origin: https://example.org` 403; 2 min soak (144 requests): 96 x 200, 48 x 401,
  0 x 502; screenshots `neptive/dev/.data/shots/live/20261124-portal-login-{1440x900,390x844}.png`.
- Deviations: none from the runbook. No client login, admin login or magic link was used for verification.

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

### 2026-11-24 image `5a594471`: what it carried (prepared before the deploy, deployed 16:48 CET)

Supersedes `6460782f` (prepared earlier on 24 Nov, before the security review) and `51dd7853` (23 Nov); do not
deploy either, nor `c073f6f9` (all three removed from the workstation). This image carries all of that pending work,
client passwords, and the fixes of the security review of 24 Nov.

- Image `local/postiz-neptive:neptive-next-5a594471` (commit `5a594471` of `neptive-next`), id
  `sha256:f31f4a72daa17056b7b47622431c46932402b7ee3640edb2bd361ace876e8864`, amd64, 2.37 GB as `docker save`
  (2,373,207,552 bytes), no `.env` / dev data (checked inside the image). Built with exactly step 1's command (`git archive`
  + `docker build -f Dockerfile.dev --build-arg NEXT_PUBLIC_VERSION=neptive`): 6 min 25 s (`pnpm install` 85 s,
  `pnpm run build` 79 s). Commits after `5a594471` touch only dev tooling and docs.
  Run: `neptive/scripts/deploy-prod.sh --dry-run --stop-before-schema --sha 5a594471`, then the same with
  `--i-have-approval` instead of `--dry-run`. The dry run of 24 Nov (16:21) printed all 8 steps and executed nothing.
- What it carries:
  - from `51dd7853` (23 Nov): approval scheduling, `posts.service.ts` terminate guard + `deletePost` every root +
    `changeDate` restart of a waiting QUEUE post, slot lock, customer scope;
  - security review fixes (24 Nov): **every mutating portal request** (approval / PED transitions, comments,
    magic-link consumption, logout, login, password) must be same-origin JSON (before: approvals could be posted by a
    form on another site with a client's cookie); **sessions of a removed customer** (or organization) stop resolving
    and deleting a customer revokes its sessions; client password change vs agency reset/removal is one transaction
    and conditional; login always does 3 bcrypt comparisons; client emails stored trimmed + lower-case. Anything
    that calls portal mutations outside the browser must send `Origin: https://portal.neptive.com` (nothing in
    production does; the dev scripts were updated);
  - **client passwords** (`neptive/docs/client-credentials.md`): `/portal/login` with email + password, temporary
    password from the agency ("Utenti cliente"), forced change, `/portal/account`, throttling, activity records. Magic
    links unchanged. Existing sessions and unused magic links keep working (no row is touched; every existing session
    gets `passwordChangeRequired = false`). One deliberate tightening: sessions of a user with `activated = false` stop
    resolving (only deletion did before); production has no such user today (local copy of 19 Nov: 3 users, all active).
- **Schema change (new in this image).** Additive only: tables `neptive_client_credentials` and `neptive_login_attempts`
  (empty), column `neptive_portal_sessions.passwordChangeRequired BOOLEAN NOT NULL DEFAULT false`, enum
  `NeptiveCredentialSource`, 5 values added to `NeptiveActivityType`, 4 indexes, 1 foreign key. Checked with
  `neptive/dev/schema-check.sh` (throwaway copy of the local database brought to production's schema = `51dd7853`, then
  plain `prisma db push` exactly as the container start runs it): "now in sync", **no data-loss warning**, exit 0; row
  counts of all 102 pre-existing tables identical; a second plain push: "already in sync". The SQL the schema step will
  see (`prisma migrate diff`, same command as step 6): 14 statements (`CREATE TYPE`, 5 `ALTER TYPE ... ADD VALUE`,
  1 `ADD COLUMN ... DEFAULT false`, 2 `CREATE TABLE`, 4 `CREATE INDEX`, 1 `ADD CONSTRAINT`), **no DROP of any kind**, so the
  script's DROP check passes. Step 6 and 8 now also require `neptive_client_credentials` to exist.
- Schema: `schema.prisma` is unchanged since `6460782f`, so the schema check below still applies to this image.
- Smoke test of the image (`IMAGE=... rehearse-prod-image.sh restore` + `schema` + `up`, prod dump of 19 Nov 14:28, i.e.
  the schema from **before** the 19 Nov deploy, so its one-time diff is the cumulative 124 statements, still with no
  table/column/type drop): row counts of the 82 existing tables identical after the schema step (104 tables after),
  container start "already in sync", "Backend is running" 10 s after `docker run`, backend / frontend / orchestrator
  online with 0 restarts, container 0 restarts, `/auth/login`, `/portal/login`, `/portal/password`, `/portal/account`
  200 with no "postiz" in the HTML, `/api/neptive/portal/me` 401. Client credentials on the image, behind
  `tls-proxy.mjs` (https, production cookie mode; `node neptive/dev/prod-credentials-check.mjs`, 20/20): session and
  device cookies `Domain=.neptive.com; Secure; HttpOnly; SameSite=None`, temporary-password session refused on
  `/peds` (403), forced change works, account lock (429, `Retry-After` 900) does not stop the client's own browser, a
  client-written `X-Forwarded-For` does not escape the IP bucket; cross-site magic consumption / PED transition /
  approval transition / logout 403, the same from `https://portal.neptive.com` 201. Real browser on the image
  (`prod-portal-browser.mjs`, 6/6): magic link page -> Continua -> portal -> Esci -> `/me` 401 -> password form,
  no page request refused. Approval scheduling was exercised on the dev backend
  (`schedule-check.mjs`, 23 Nov), not inside this container.
- **Disk: free space first, or the preflight stops.** Read on 24 Nov: `/` 48 GB, **12 GB free** (13 GB after the 19 Nov
  deploy); the preflight wants >= 14 GB. On the server: `local/postiz-neptive:neptive` = `neptive-next-d54aa4c8` (same
  id `e50c0317`, 11.6 GB) and `rollback-20261119-1930` (`d860f4a4`, 6.66 GB, the pre-`neptive-next` image); build cache
  0. Deliberately, before the deploy: `docker rmi local/postiz-neptive:rollback-20261119-1930` (once you no longer want
  to roll back that far; this deploy tags the current image as the new rollback), then `df -h /`.
- New at run time: the backend opens a second small Prisma pool (3 connections) for the slot lock, on first use (from
  `51dd7853`). Client passwords add no process, no env variable and no dependency (bcrypt was already there). Optional
  env `NEPTIVE_TRUSTED_PROXY_HOPS` (default 2 = host nginx + container nginx, verified in
  `/etc/nginx/sites-available/portal.neptive.com.conf`: it appends `X-Forwarded-For`); leave it unset.
- Behaviour changes for the agency:
  - from `51dd7853`: the client's approval of a PED slot schedules its DRAFT posts (`neptive/docs/approval-scheduling.md`,
    including "Known limits"). Look at pending approvals with DRAFT posts whose date has passed before deploying: on
    approval they go out at the same hour on the next possible day.
  - "Utenti cliente": "Invia link di accesso" is now "Genera link di accesso" (it never sent an email: the link is shown
    and copied), plus "Genera password temporanea" / "Rimuovi password" per user. Deleting a user also deletes their
    password.
- Expected downtime: as on 19 Nov with `--stop-before-schema` (1 min 37 s measured), **plan 1 to 2 minutes, at most 3**:
  stop, baseline counts, schema diff + `db push` (14 statements on tiny tables), recreate, "Backend is running". The
  transfer (2.37 GB, ~20-25 min at the measured 1.6-2 MB/s) is not downtime.
- Rollback: as above (old image + `compose.rollback.yml`, no database restore). The old image's own start would refuse
  the new schema exactly as described in "Rollback" (and would now also list the two new tables and the new column as
  data loss once they hold rows): keep using the override. Client passwords stored meanwhile stay in their table; the old
  code ignores them, clients fall back to magic links.

## Static privacy page (host nginx, outside the image)

`https://portal.neptive.com/privacy` is served by the HOST nginx, not by the app: `location = /privacy` in
`/etc/nginx/sites-available/portal.neptive.com.conf` aliases `/var/www/portal-neptive-static/privacy.html`.
Source of truth: `neptive/static/privacy.html`. To update: edit it, then
`scp neptive/static/privacy.html neptive-hostinger-01:/var/www/portal-neptive-static/privacy.html` (no reload needed).
Image deploys do not touch it. Data-deletion instructions for Meta: `https://portal.neptive.com/privacy#eliminazione-dati`.
Added 2026-11-19; nginx config backup in `/root/backups/nginx-portal.neptive.com.conf-before-privacy-20261119T193939Z`.
