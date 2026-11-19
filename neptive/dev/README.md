# Local test stack (Neptive Postiz fork)

Everything here is local-only: containers prefixed `pzn-`, bound to 127.0.0.1, no email provider, no social API
keys, no LLM, no Stripe. Integration tokens in the local DB are overwritten with a dummy. The orchestrator
(the process that actually publishes via Temporal) is **not** started by these commands.

Needs: Docker, Node 22 (`>=22.12 <23`, found under `~/.local/share/mise/installs/node/22.18.0`), pnpm 10.6.1
(`~/.local/share/pzn-tools`). `neptive/dev/env.sh` puts both on PATH (`source neptive/dev/env.sh`).
If either is missing: `mise install node@22.18.0` and `npm i -g --prefix ~/.local/share/pzn-tools pnpm@10.6.1`.

## Ports

| what | address |
|---|---|
| frontend (dev) | http://localhost:4200 |
| backend API (dev) | http://localhost:3000 |
| Postgres (app DB `postiz-db`, user `postiz-app`, pw `pzn-local-only`) | 127.0.0.1:55432 |
| Redis | 127.0.0.1:56379 |
| Temporal | 127.0.0.1:57233 |

Note: the two `pnpm dev` servers (3000/4200) listen on all interfaces, not only loopback. Do not run them on an untrusted network.

## Commands (run from the repo root)

```
pnpm install                          # once (after source neptive/dev/env.sh)
neptive/dev/stack.sh up               # containers + generates ./.env with fresh secrets (git-ignored)
neptive/dev/stack.sh restore          # restore newest neptive/dev/.data/prod-*.dump, prisma db push, sanitise
ACCEPT_DATA_LOSS=1 neptive/dev/stack.sh restore   # needed today, see "Schema step" below
neptive/dev/stack.sh app              # backend + frontend in dev mode, log: neptive/dev/.data/dev.log
neptive/dev/stack.sh status
neptive/dev/stack.sh app-stop
neptive/dev/stack.sh down             # stop containers, keep data
neptive/dev/stack.sh reset            # destroy local containers + volumes (local only)
```

`restore` ends with `prepare-local-db.sh`, which (local DB only): counts then overwrites every
`Integration.token`/`refreshToken` with `LOCAL-DUMMY-NOT-A-REAL-TOKEN`, sets `admin@neptive.com`'s password
(`neptive-local-admin`, override with `ADMIN_PASSWORD=`), and creates a fresh 7-day magic link for the Casa Pandora
client user (single use: re-run `neptive/dev/prepare-local-db.sh` for a new one). Output prints the URL.

## Getting a fresh production dump (read-only on the server)

```
ssh neptive-hostinger-01 'docker exec postiz-postgres pg_dump -U postiz-app -d postiz-db --no-owner --no-privileges -Fc' \
  > neptive/dev/.data/prod-$(date +%Y%m%d-%H%M).dump
```

Dumps and everything else under `neptive/dev/.data/` are git-ignored. Treat them as customer data.

## Schema step

Production applies the schema with `pnpm run prisma-db-push` (called by `pnpm run pm2`, the container CMD in
`Dockerfile.dev`) = `prisma@6.5.0 db push`, **without** `--accept-data-loss`. `stack.sh restore` runs the same
command, and writes `.data/schema-before.sql`, `.data/schema-after.sql`, `.data/schema-changes.md` (structured diff
from `neptive/scripts/schema-diff.py`) and `.data/db-push-output.txt`.

## Browser check

```
node neptive/dev/qa.mjs "<magic link url>"     # screenshots in neptive/dev/.data/shots/
```

Uses playwright from the mise npm-playwright install and system Chromium. It logs in as admin, opens `/launches`,
`/agency` and the Casa Pandora agency pages, then the portal via the magic link: `/portal`, `/portal/ped`, one post
detail, `/portal/approvals`.

## Post variants demo (A, B, C… per PED slot)

```
neptive/dev/seed-variants.sh          # Aurora Gallorini: one slot "Reel — New Life: quale montaggio?" with variants A-D,
                                      # plus an unattached post E; prints an Aurora magic link. Re-runnable, local only.
node neptive/dev/qa-variants.mjs      # re-seeds, drives agency + client at 1440x900 and 390x844,
                                      # screenshots + log in .data/shots/variants/, API refusal checks
neptive/dev/gate-check.sh <postId>…   # runs the real post workflow v1.1.2 on the local Temporal with fake
                                      # activities and the real publish gate; prints whether the provider was called
```

The existing single-post items are not touched by the seed. Loading variants by SQL: `neptive/docs/variants-loading.md`.

## Known quirks

- Next <=16.4.4 prints a "security upgrade recommendation" and exits on the first start/build; this fork is on
  16.4.6 (see `neptive/UPSTREAM-SYNC.md`, "Deliberate divergences"). The retry loop in `stack.sh app` stays as a safety net.
- Temporal needs Elasticsearch (SQL visibility caps Text search attributes at 3 and the app registers more).
- `.env` is generated, not copied from production. `DISABLE_REGISTRATION=true`, `NOT_SECURED=true`.
- The `/agency/<customer>/ped` page content is wider than its container (calendar overflows to the right in the
  admin shell). Same on the pre-merge code, so not a merge regression.

## Production-image rehearsal (before a deploy)

Full procedure and results: `neptive/DEPLOY.md`. Tools (all local, never touch the server):

```
IMAGE=local/postiz-neptive:neptive-next-<sha> neptive/dev/rehearse-prod-image.sh restore|env|plain|diff|schema|up|counts|down
node neptive/dev/tls-proxy.mjs                  # https://127.0.0.1:8443 -> the container on :4017 (self-signed, portal.neptive.com)
node neptive/dev/prod-check.mjs                 # overlays / "Postiz" / broken images on the production build, shots in .data/shots/prod/
PZN_BASE=https://portal.neptive.com PZN_API=https://127.0.0.1:8443/api PZN_DB=rehearsal \
  PZN_HOST_RULES='MAP portal.neptive.com 127.0.0.1:8443' NODE_TLS_REJECT_UNAUTHORIZED=0 node neptive/dev/qa-variants.mjs
```

The image is built for `https://portal.neptive.com`; instead of a second local-URL image the browser maps that hostname to the
local TLS proxy (`--host-resolver-rules`), so cookies, `Secure` flags and absolute media URLs behave as in production and
nothing resolves to the real server. The rehearsal database `rehearsal` lives in `pzn-postgres` next to `postiz-db`.
