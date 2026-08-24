# Vertical slice validation

Live check that the already-implemented Option B agency layer works against a real local Postiz stack. This is not an architecture redesign and not a UI polish pass.

Validated chain:

```
Agency user → Client A → portal user → magic link → Client A auth
→ Client A sees only Client A Postiz content → approve
→ Neptive persists APPROVED → Postiz scheduling (DRAFT → QUEUE)
→ Temporal remains the publishing engine
```

Client A must not read, infer, mutate, or approve Client B.

Date: 2026-08-23. Repo: `postiz-app` on `main`, tracking official Postiz `origin` (`git@github.com:gitroomhq/postiz-app.git`). There is no `upstream` remote; core diffs are against `origin/main`.

---

## Environment

| Item | Value |
|---|---|
| Host OS | Linux (Ubuntu), Node 22, pnpm 10.6.1 |
| App origin | `http://localhost:4200` (must not be `127.0.0.1` — CORS / `NOT_SECURED` cookies) |
| Backend | `http://localhost:3000` |
| Orchestrator | `http://localhost:3002` |
| Temporal | `localhost:7233`, namespace `default` |
| Redis | `localhost:6379` |
| Postiz Postgres | `localhost:5434` → container `5432` |
| Host Postgres (untouched) | `127.0.0.1:5432` (Ubuntu 16/main), `127.0.0.1:5433` (14/odoo14) |
| `.env` | gitignored. `DATABASE_URL` uses compose credentials `postiz-local` / `postiz-local-pwd` / `postiz-db-local` on port **5434** (not `.env.example`’s `postiz-user`). `JWT_SECRET` set. `NOT_SECURED=true`. `STORAGE_PROVIDER=local`. `IS_GENERAL=true`. No Resend / social provider credentials. |

Compose override (local only, not an upstream edit): `neptive/docker-compose.dev.override.yaml` maps Postiz Postgres with `ports: !override` → `5434:5432`.

---

## Services

Started with:

```
docker compose -f docker-compose.dev.yaml -f neptive/docker-compose.dev.override.yaml up -d \
  postiz-postgres postiz-redis temporal-postgresql temporal-elasticsearch temporal
```

Then `pnpm run dev:backend`, `dev:orchestrator`, `dev:frontend`.

| Service | Observed |
|---|---|
| `postiz-postgres` | running, published `5434:5432` |
| `postiz-redis` | running, `6379` |
| `temporal` | running, `7233`. Namespace `default` Registered |
| `temporal-postgresql` / `temporal-elasticsearch` | running, not published to host |
| Nest backend | `*:3000`, HTTP 200 on `/` |
| Next frontend | `*:4200` |
| Orchestrator | `*:3002` (no `/health`; process listening) |

Node app processes die if the agent/dev session is interrupted. Docker usually stays up. Temporal has previously `Exited (255)` after long idle; `docker compose up -d` the temporal trio again if `7233` is down. **Do not stop host Postgres on 5432/5433.**

---

## Database

Dedicated Postiz database on 5434. Host 5432/5433 were not used and were not stopped.

- 82 tables in `public`
- **13** `neptive_*` tables:

`neptive_activities`, `neptive_approval_actions`, `neptive_approval_comments`, `neptive_client_profiles`, `neptive_client_users`, `neptive_content_approvals`, `neptive_deliverables`, `neptive_editorial_plan_items`, `neptive_editorial_plans`, `neptive_magic_links`, `neptive_portal_sessions`, `neptive_reports`, `neptive_strategy_entries`

No extra columns on Postiz `Post` / `Integration` / `User`. Client brand remains Postiz `Customer` + `NeptiveClientProfile`.

---

## Port collision

Host already bound `5432` and `5433`. Least-invasive fix: Compose override remaps Postiz Postgres to **5434**. `.env` `DATABASE_URL` points at 5434. Upstream `docker-compose.dev.yaml` is unchanged.

---

## Prisma

```
pnpm prisma-generate
pnpm prisma-db-push
```

Both succeeded against the 5434 database. Neptive models are append-only at the end of `schema.prisma`.

---

## Agency auth

Local register/login: `agency@neptive.local` / `NeptiveVal1d!` (`provider: LOCAL`).

- Login returns Postiz `auth` header/cookie
- `GET /user/self` → 200, org `f5fcf048-9a35-4562-a30b-85dfb19edb4b`
- `/neptive/agency/*` uses Postiz `AuthMiddleware`

Browser: existing session opened `http://localhost:4200/launches` then **Agency** → `/agency`. Client A detail `http://localhost:4200/agency/8cb334a3-9098-4417-8a02-bcd7c63a7810` (4 channels). Approvals tab listed Client A rows `REJECTED` / `CHANGES_REQUESTED` / `APPROVED`. Post-group picker showed only Client A DRAFT groups (`71b1a9af-…`, `de181473-…`), not Client B.

---

## Mapping

| Concept | Live id |
|---|---|
| Organization | `f5fcf048-9a35-4562-a30b-85dfb19edb4b` |
| Agency user | `68cee443-4ea1-4e8d-90c2-37dd8103fe45` |
| Client A (`Customer`) | `8cb334a3-9098-4417-8a02-bcd7c63a7810` (4 integrations) |
| Client B (`Customer`) | `5ba92049-bc22-4320-b2d7-6c70f5ef5463` (3 integrations) |

Portal users are `NeptiveClientUser`, not `UserOrganization`. Cookie `neptive_portal` is separate from Postiz `auth`.

---

## Magic link

SHA-256 at rest. GET peeks. POST consumes once. 30-day expiry.

HTTP harness + later UI mint:

- Invite returns `url` with raw token; DB stores hash only
- GET peek `{ valid: true, email, name }` does not consume (confirmed: loading `/portal/magic/…` then GET still `{ valid: true }`)
- POST consume → portal session bound to Client A `customerId`
- Replay GET `{ valid: false }`; replay POST **401**
- Invalid / expired → 401

UI mint used for frontend smoke:

`http://localhost:4200/portal/magic/y7guUZyRbgmF-7ALkMLqCIRhkEe7wxeE-poADIB4re0`  
→ Continue → `/portal` as **Client A User**. Replay after that was 401.

---

## Portal auth

- Session JSON bound to one `customerId` (`8cb334a3-…` for A, `5ba92049-…` for B)
- Portal cookie is not Postiz org auth: `/user/self`, `/neptive/agency/clients`, `/integrations/list`, `/posts` all **401** with only `neptive-portal`
- Portal middleware does not throw `HttpForbiddenException` (that class would clear the agency `auth` cookie)
- `customerId` from body/query is ignored; server uses session

Same browser profile can hold both cookies at once (shared jar). Isolation is enforced on the API when the wrong cookie is sent, not by mutually exclusive cookies in one Chrome profile.

---

## Isolation

Client A IDOR against Client B ped / approval / report → **403**. Cannot approve Client B post group. Query `customerId` ignored on portal lists. Portal cannot hit agency mutate routes (401).

`GET /integrations` returns **200** without auth. That is Postiz `NoAuthIntegrationsController` (provider **catalog**), not org channels. Org channels are `GET /integrations/list` (401 without Postiz `auth`). Recorded in the harness; not a Neptive leak.

---

## Post visibility

- Client A scheduled/list groups: `28580326-…`, `71b1a9af-…`, `de181473-…`
- Client B groups: `b6f8bdb7-…`, `174027c8-…`
- Client A scheduled list **excludes** Client B QUEUE bait post `cmt60uwk7000fdzrv0rgjtakn`

Browser portal **Upcoming** showed only Client A content (`Client A draft approve fixture post`) in Postiz state **QUEUE**. No Client B rows. Portal shell has no Agency / Calendar / Settings nav.

---

## Approval workflow

Machine: `DRAFT → PENDING_INTERNAL_REVIEW → PENDING_CLIENT_APPROVAL → APPROVED`, plus `CHANGES_REQUESTED` / `REJECTED`.

| Check | Result |
|---|---|
| Invalid jump | 400 |
| Client B cannot approve Client A | 403 |
| Client A approves own content | 201, status `APPROVED` |
| Audit | `SUBMITTED, SUBMITTED, APPROVED_INTERNAL, APPROVED_CLIENT` (duplicate `SUBMITTED` on create + first transition — minor) |
| `APPROVED` is terminal | further `CHANGES_REQUESTED` → 400 |
| REJECTED stays Postiz `DRAFT` | not queued |
| Already `PUBLISHED` fixture | not unpublished |

---

## Schedule bridge

`PostizAdapter.changeGroupPublishAuthorization()` calls `PostsService.changePostStatus(orgId, postId, 'schedule'|'draft')`. It does not write `Post.state` via raw Prisma. Skips already `PUBLISHED` / `ERROR`.

Live: Client A approve-path post `cmt60uwjt0003dzrvmyc4oqiw` **DRAFT → QUEUE**. Neptive status `APPROVED`; Postiz status `QUEUE` (not a Neptive publish enum).

`CHANGES_REQUESTED` unschedules only while approval is still `PENDING_*` and the post is already `QUEUE` (harness simulated that with Prisma). After `APPROVED`, unscheduling via the Neptive machine is refused.

---

## Temporal handoff

On approve, Temporal accepted workflow:

- Type: `postWorkflowV109`
- Task queue: `main`
- WorkflowId: `post_cmt60uwjt0003dzrvmyc4oqiw`
- RunId: `01a02f74-2a58-7b4d-a12e-a01a5b886b9c`
- Namespace: `default`
- Search attributes include `organizationId` + `postId`
- `publishDate` far in the future (**2026-09-13**) — no real social publish

Orchestrator workers `main` (workflows) and `x` (activities) were RUNNING during the HTTP run. No provider credentials; no attempt to publish to real accounts.

Inside the Temporal container, CLI must use `TEMPORAL_ADDRESS=<container-ip>:7233`, not `127.0.0.1`. Host `localhost:7233` works for the app.

---

## Tests

```
pnpm exec jest --config neptive/jest.config.ts --runInBand
```

**24 passed, 0 failed** (re-run 2026-08-23 after frontend smoke). Covers the full approval matrix, `APPROVED` terminal, no QUEUE/PUBLISHED in Neptive enums, `getOrForbid`, session binding, schedule-bridge contract.

Live HTTP harness:

```
node --env-file=.env neptive/scripts/vertical-slice.mjs
```

**55 passed, 0 failed** at `2026-08-23T16:28:59Z` (`neptive/.validation-last.json`, gitignored). Treat **2xx** as success (Nest POST often **201**). Seed cleanup must delete posts before integrations (`Post_integrationId_fkey`).

The harness now reuses existing Client A/B by name, preferring the customer with the highest `channelCount`, so it does not keep inserting duplicate `Customer` rows.

---

## Commands

```
cd postiz-app

docker compose -f docker-compose.dev.yaml -f neptive/docker-compose.dev.override.yaml up -d \
  postiz-postgres postiz-redis temporal-postgresql temporal-elasticsearch temporal

# .env DATABASE_URL host port must be 5434
pnpm prisma-generate
pnpm prisma-db-push

pnpm run dev:backend      # wait for "Backend started successfully on port 3000"
pnpm run dev:orchestrator
pnpm run dev:frontend     # Next on 4200

pnpm exec jest --config neptive/jest.config.ts --runInBand
node --env-file=.env neptive/scripts/vertical-slice.mjs
```

---

## Pass / fail

| Slice | Status | Evidence |
|---|---|---|
| STACK | **GREEN** | Docker five-service set running; backend 3000; frontend 4200; orchestrator 3002; Temporal 7233 / namespace `default` |
| DATABASE | **GREEN** | 5434 dedicated DB; 13 `neptive_*` tables; host 5432/5433 untouched |
| PORTAL AUTH | **GREEN** | Magic peek/consume/replay; session bound to one customer; portal cookie ≠ Postiz `auth` |
| CLIENT ISOLATION | **GREEN** | IDOR 403; query `customerId` ignored; agency routes 401 with portal cookie |
| POST VISIBILITY | **GREEN** | HTTP lists + portal Upcoming show Client A only; Client B QUEUE bait excluded |
| APPROVAL WORKFLOW | **GREEN** | Two-stage path, invalid jump 400, APPROVED terminal, audit persisted |
| POSTIZ SCHEDULING BRIDGE | **GREEN** | `changePostStatus(..., 'schedule')` DRAFT→QUEUE; PUBLISHED not unpublished |
| TEMPORAL HANDOFF | **GREEN** | `postWorkflowV109` on `main`, workflowId `post_<postId>`, far-future date, no real publish |
| UPSTREAM COMPATIBILITY | **GREEN** | Same 8 core files; **401 insertions / 9 deletions** vs `origin/main`; **no new core touchpoints** |

Frontend smoke: **GREEN for this slice** (Agency nav, Client A workspace, portal magic confirm, Client A-only upcoming QUEUE). Alignment, raw JSON in Upcoming, and always-visible approval action buttons are polish, not blockers.

---

## Limitations (documented, not turned into Option C)

1. Postiz `Customer` unique `(orgId, name, deletedAt)` allows multiple live rows named “Client A” because SQL `NULL ≠ NULL`. Neptive `create` now rejects a second live client with the same name. Empty duplicates from the earlier harness may still exist until soft-deleted.
2. `GET /integrations` is an upstream public **catalog**, not org channels.
3. `APPROVED` is terminal. Unschedule-on-CHANGES_REQUESTED is only for `PENDING_*` + Postiz `QUEUE`.
4. Create-approval no longer writes a `SUBMITTED` action at DRAFT; `SUBMITTED` is recorded on `PENDING_INTERNAL_REVIEW`.
5. No Resend: invite still returns `{ id, email, url }` (email send is try/caught). No social OAuth: no real publish.
6. `NOT_SECURED=true` is required for the `neptive-portal` JS header path. Use `localhost`, not `127.0.0.1`.
7. Portal Upcoming renders post content as JSON — acceptable for this slice.

---

## Blockers

None for proceeding to PED / Strategy / Activities / Materials / Reports polish.

Do not start that polish by forking Temporal, providers, composer, or Postiz `Post.state`.

---

## Core files modified

Still exactly the eight listed in `NEPTIVE_CORE_TOUCHPOINTS.md`:

- `apps/backend/src/app.module.ts`
- `apps/backend/src/main.ts`
- `apps/backend/src/services/auth/permissions/permissions.guard.ts`
- `apps/frontend/src/components/layout/layout.context.tsx`
- `apps/frontend/src/components/layout/top.menu.tsx`
- `apps/frontend/src/proxy.ts`
- `libraries/helpers/src/utils/custom.fetch.func.ts`
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

`git diff origin/main --stat` on those files: **401 insertions, 9 deletions**. Isolated trees remain untracked/new: `libraries/nestjs-libraries/src/neptive/**`, `apps/backend/src/neptive/**`, `apps/frontend/src/components/neptive/**`, `apps/frontend/src/app/(app)/(site)/agency/**`, `apps/frontend/src/app/(app)/(portal)/portal/**`, `neptive/**`.

**New core touchpoints this phase: none.**
