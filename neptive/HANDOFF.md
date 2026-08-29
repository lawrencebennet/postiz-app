# Neptive × Postiz — agent handoff

**Start here.** This is a Postiz fork with an isolated agency/client layer (Neptive). Read this file before changing code.

Italian product owner summary is at the bottom.

---

## Git (other computer)

```
git clone git@github.com:lawrencebennet/postiz-app.git
cd postiz-app
git checkout neptive
git remote add upstream git@github.com:gitroomhq/postiz-app.git   # if clone did not copy remotes
```

| Remote | URL | Role |
|---|---|---|
| `origin` | `git@github.com:lawrencebennet/postiz-app.git` | Our fork. Push product work here. |
| `upstream` | `git@github.com:gitroomhq/postiz-app.git` | Official Postiz. Pull updates. Never push here. |

- Branch **`neptive`**: all customizations. This is the working branch.
- Branch **`main`**: clean Postiz. Do not commit Neptive on `main`.
- Pull Postiz: `git fetch upstream && git merge upstream/main` while on `neptive`. Prefer merge, not rebase (Temporal workflow versions).

Do **not** commit `.env`. `apps/frontend/AGENTS.md` and `apps/frontend/CLAUDE.md` are gitignored (Next.js regenerates them). Root `AGENTS.md` is ours — it points agents at this file.

---

## What we customized (COSA)

Product goal: **multi-client agency**. The agency admin uses Postiz. Each client gets a portal that shows **only their** PED, strategy, approvals, materials, reports, and scheduled content.

Postiz remains the publishing engine (OAuth, composer, calendar, `Post.state`, Temporal).

Neptive owns:

- Client identity (`Customer` + `NeptiveClientProfile`)
- Portal users (`NeptiveClientUser`, **not** `UserOrganization`)
- Magic-link auth (cookie `neptive_portal`, separate from Postiz `auth`)
- Isolation (`orgId` + `customerId`; portal ignores body/URL `customerId`)
- PED (`NeptiveEditorialPlan` + items)
- Approval business state (`DRAFT → PENDING_INTERNAL_REVIEW → PENDING_CLIENT_APPROVAL → APPROVED`)
- Strategy, activities, deliverables, reports

**Not built (do not pretend it exists):**

- Import PED from Excel / Notion / another project
- Auto-create Postiz posts from PED rows
- Auto-publish because a PED exists
- White-label domains / PDF reports / Elestio
- Real social OAuth credentials in this repo

Publishing still means: connect channels in Postiz → compose on that Customer → Neptive approval (optional) → `PostsService.changePostStatus(..., 'schedule')` → Temporal.

---

## Where (DOVE)

Isolated trees (almost all of the product):

```
neptive/                                          docs, compose override, tests, harness
libraries/nestjs-libraries/src/neptive/**         domain, Prisma repos, services, adapter
apps/backend/src/neptive/**                        HTTP + portal middleware
apps/frontend/src/components/neptive/**          Agency + portal UI
apps/frontend/src/app/(app)/(site)/agency/**      /agency routes
apps/frontend/src/app/(app)/(portal)/portal/**   /portal routes
```

Only **8** Postiz core files were touched. List + why: [NEPTIVE_CORE_TOUCHPOINTS.md](./NEPTIVE_CORE_TOUCHPOINTS.md).

HTTP:

- `/neptive/agency/*` — Postiz org JWT (`auth`)
- `/neptive/portal-auth/*` — public magic peek/consume
- `/neptive/portal/*` — `NeptivePortalMiddleware`; customer always from session

Do **not** edit Temporal `post.workflow.v1.0.x`, social providers, composer internals, or add Neptive columns on `Post` / `Integration` / `User`.

---

## How (COME)

Architecture decision: **Option B** (isolated modules + tiny bridges). See [NEPTIVE_ARCHITECTURE.md](./NEPTIVE_ARCHITECTURE.md).

```
Agency tenant  = Postiz Organization
Agency people  = Postiz UserOrganization
Client brand   = Postiz Customer + NeptiveClientProfile
Client people   = NeptiveClientUser + magic link
PED            = NeptiveEditorialPlan (clients see it after Send to client)
Posts          = Postiz only
Approval       = NeptiveContentApproval keyed by Post.group
Publish        = Postiz DRAFT|QUEUE|PUBLISHED|ERROR + Temporal
```

Two state machines stay separate. `APPROVED` in Neptive may call `changePostStatus(..., 'schedule')`. It does not write `Post.state` via raw Prisma. `APPROVED` is terminal in Neptive.

Portal cookie must never throw `HttpForbiddenException` (that class clears the agency `auth` cookie).

---

## Restart on a new machine

Needs: **Node 22** (`>=22.12 <23`), **pnpm 10.6.1**, **Docker**.

Host Postgres on `5432`/`5433` (if present) is **not** Postiz. Do not stop it. Postiz Postgres is published on **5434**.

```bash
cd postiz-app
git checkout neptive
pnpm install

# copy env — see neptive/env.local.example
cp .env.example .env
# then edit DATABASE_URL host port to 5434 and compose user/password:
# postgresql://postiz-local:postiz-local-pwd@localhost:5434/postiz-db-local
# JWT_SECRET=<long random hex>
# NOT_SECURED=true
# STORAGE_PROVIDER=local
# IS_GENERAL=true
# TEMPORAL_ADDRESS=localhost:7233
# FRONTEND_URL=http://localhost:4200
# NEXT_PUBLIC_BACKEND_URL=http://localhost:3000

docker compose -f docker-compose.dev.yaml -f neptive/docker-compose.dev.override.yaml up -d \
  postiz-postgres postiz-redis temporal-postgresql temporal-elasticsearch temporal

pnpm prisma-generate
pnpm prisma-db-push

pnpm run --filter ./apps/backend --filter ./apps/orchestrator --filter ./apps/frontend --parallel dev
```

Open **http://localhost:4200** (`localhost`, not `127.0.0.1` — CORS / cookies).

| Service | Port |
|---|---|
| Frontend | 4200 |
| Backend | 3000 |
| Orchestrator | 3002 |
| Postiz Postgres | 5434 |
| Redis | 6379 |
| Temporal | 7233 |

If Redis bind fails on 6379, it is often already running (`docker ps`). Skip compose and start the app.

`docker compose up -d` leaves healthy containers running. It does not stop host Postgres.

### Local agency login (this DB, if you reused the same fixtures)

Created by the validation harness, **not** a Postiz factory default:

- Email: `agency@neptive.local`
- Password: `NeptiveVal1d!`

On a **fresh** database, register the first user at `/auth/login` (LOCAL). That user is the org admin.

Client portal: Agency → client → **Client users** → invite. Copy the magic URL (Resend is unset, so email will not send). Client opens `/portal/magic/...` → Continue.

### Tests

```
pnpm exec jest --config neptive/jest.config.ts --runInBand
node --env-file=.env neptive/scripts/vertical-slice.mjs
```

Evidence of the last green live run: [VERTICAL_SLICE_VALIDATION.md](./VERTICAL_SLICE_VALIDATION.md).

---

## Docs map

| File | Use |
|---|---|
| **This file** | Handoff, restart, git |
| [NEPTIVE_ARCHITECTURE.md](./NEPTIVE_ARCHITECTURE.md) | Option B, mapping, isolation |
| [NEPTIVE_CORE_TOUCHPOINTS.md](./NEPTIVE_CORE_TOUCHPOINTS.md) | The only 8 core file edits |
| [NEPTIVE_FEATURE_MATRIX.md](./NEPTIVE_FEATURE_MATRIX.md) | Feature-by-feature vs Postiz/BrightBean |
| [UPSTREAM_MAINTENANCE.md](./UPSTREAM_MAINTENANCE.md) | Merging official Postiz |
| [VERTICAL_SLICE_VALIDATION.md](./VERTICAL_SLICE_VALIDATION.md) | What was proven live |
| [EXISTING_FAILURES.md](./EXISTING_FAILURES.md) | Upstream gaps, not Neptive bugs |

---

## What to do next (product)

Safe to continue **inside** Neptive trees:

1. PED import (CSV/JSON) and/or “create Postiz drafts from PED items”
2. Agency UX polish (link PED item ↔ `Post.group` in the UI)
3. Connect real social OAuth in `.env` (never commit secrets)
4. Strategy / materials / reports depth

Do **not** start by forking Temporal, providers, or `Post.state`.

---

## Italiano (owner)

Abbiamo customizzato Postiz con un layer **Neptive** sulla branch `neptive` del fork `lawrencebennet/postiz-app`.

- **Tu (admin agency):** login Postiz → menu Agency → un cliente alla volta (PED, strategy, approvazioni, utenti).
- **Il cliente:** magic link → `/portal` → vede solo il suo contenuto.
- **Pubblicazione:** sempre Postiz (canali + composer + Temporal). Il PED **non** importa post e **non** pubblica da solo.

Su un altro PC: clona il fork, `git checkout neptive`, crea `.env` (porta Postgres **5434**), Docker come sopra, `pnpm install` + prisma + `dev`.
