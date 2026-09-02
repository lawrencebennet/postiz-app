# Casa Pandora Local Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Install and run the Neptive Postiz fork locally, create a test agency/client setup for Casa Pandora, and document both user journeys.

**Architecture:** Use the existing `neptive` branch in an isolated worktree. Infrastructure runs in Docker with Postiz Postgres bound to port 5434, while backend, orchestrator, and frontend run from the host. The agency API creates the Postiz Customer and Neptive profile; the client invitation creates a separate magic-link portal identity.

**Tech Stack:** Node.js 22.12+, PNPM 10.6.1, Next.js, NestJS, Prisma 6.5, PostgreSQL 17, Redis 7, Temporal 1.28, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-02-casa-pandora-local-setup-design.md`

## Global Constraints

- Use PNPM only for JavaScript dependencies and scripts.
- Use Node `>=22.12.0 <23.0.0`.
- Do not commit `.env`, generated secrets, or the raw client magic token.
- Do not reset or delete application data from the database.
- Use `localhost` consistently for browser access and cookies.
- Keep Postiz publishing, social OAuth, and Temporal workflow code unchanged.

---

### Task 1: Prepare the local toolchain and environment

**Files:**
- Create: `.env` locally from `.env.example` (gitignored, never commit)

**Interfaces:**
- Consumes: `neptive/env.local.example`, `.env.example`, `package.json`, `pnpm-lock.yaml`.
- Produces: a Node 22 + PNPM 10.6.1 shell and local environment values consumed by Prisma, Nest, Next, and Temporal.

- [x] **Step 1: Select the required Node version.**

Run from the Neptive worktree:

```bash
mise install node@22.12.0 pnpm@10.6.1
mise exec node@22.12.0 pnpm@10.6.1 -- node --version
```

Expected: Node reports `v22.12.x`.

- [x] **Step 2: Enable PNPM 10.6.1.**

Run:

```bash
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm --version
```

Expected: `10.6.1`.

- [x] **Step 3: Create the local environment file.**

Copy `.env.example` to `.env` and set these exact local values, retaining optional provider variables empty:

```dotenv
DATABASE_URL="postgresql://postiz-local:postiz-local-pwd@localhost:5434/postiz-db-local"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="<generated local secret>"
FRONTEND_URL="http://localhost:4200"
NEXT_PUBLIC_BACKEND_URL="http://localhost:3001"
BACKEND_INTERNAL_URL="http://localhost:3001"
TEMPORAL_ADDRESS="localhost:7233"
NOT_SECURED="true"
STORAGE_PROVIDER="local"
IS_GENERAL="true"
DISABLE_REGISTRATION="false"
```

Expected: `.env` exists and `git status --short --ignored .env` reports it as ignored.

- [x] **Step 4: Install dependencies.**

Run:

```bash
pnpm install --frozen-lockfile
```

Expected: PNPM completes without changing `pnpm-lock.yaml`.

### Task 2: Start infrastructure and synchronize Prisma

**Files:**
- Modify: local Docker volumes only

**Interfaces:**
- Consumes: `.env` and `neptive/docker-compose.dev.override.yaml`.
- Produces: reachable Postgres on `localhost:5434`, Redis on `localhost:6379`, Temporal on `localhost:7233`, and a generated Prisma client with Neptive models.

- [x] **Step 1: Start only the required infrastructure.**

Run:

```bash
docker compose -f docker-compose.dev.yaml -f neptive/docker-compose.dev.override.yaml up -d postiz-postgres temporal-postgresql temporal-elasticsearch temporal
```

Expected: containers start; existing host Postgres services on ports 5432/5433 remain untouched. Redis is provided by the existing service on `localhost:6379` on this machine, so `postiz-redis` is not started to avoid a port collision.

- [x] **Step 2: Check service health and ports.**

Run:

```bash
docker compose -f docker-compose.dev.yaml -f neptive/docker-compose.dev.override.yaml ps
docker exec postiz-postgres pg_isready -U postiz-local -d postiz-db-local
redis-cli -h localhost ping
```

Expected: Postgres returns `accepting connections`, Redis returns `PONG`, and Temporal is running.

- [x] **Step 3: Generate Prisma and push the additive schema.**

Run:

```bash
pnpm prisma-generate
pnpm prisma-db-push
```

Expected: Prisma client generation succeeds and schema push completes without a reset.

### Task 3: Start and verify the application processes

**Files:**
- Create: local process logs outside git, for example `/tmp/postiz-neptive-*.log`

**Interfaces:**
- Consumes: the prepared environment and infrastructure.
- Produces: backend on port 3001 (3000 is occupied locally), orchestrator on port 3002, and frontend on port 4200.

- [x] **Step 1: Start backend, orchestrator, and frontend.**

Run each from the Neptive worktree in separate terminals, or as background processes with logs:

```bash
pnpm run dev:backend
pnpm run dev:orchestrator
pnpm run dev:frontend
```

Expected: all three processes remain running without fatal startup errors.

- [x] **Step 2: Verify basic HTTP reachability.**

Run:

```bash
curl -fsS http://localhost:3001/auth/can-register
curl -fsSI http://localhost:4200/auth/login
```

Expected: backend returns JSON and frontend returns an HTTP success/redirect response.

- [x] **Step 3: Run Neptive isolation tests.**

Run:

```bash
pnpm exec jest --config neptive/jest.config.ts --runInBand
```

Expected: the Neptive test suite passes; any failure is captured before creating fixtures.

### Task 4: Create Casa Pandora and client access

**Files:**
- Create: local database rows in `Customer`, `NeptiveClientProfile`, `NeptiveClientUser`, and `NeptiveMagicLink`
- Create: `neptive/PROVA_CASA_PANDORA.md`

**Interfaces:**
- Consumes: agency authentication and `/neptive/agency/*` endpoints.
- Produces: an agency admin account, the Casa Pandora customer, a client portal user `cliente@casapandora.local`, and a newly generated magic URL.

- [x] **Step 1: Create or authenticate the agency admin.**

Use the first-user registration flow if the database is fresh; otherwise use the existing local admin account. For a fresh local database, register through `http://localhost:4200/auth/login` with:

```text
Email: agency@neptive.local
Password: NeptiveVal1d!
Provider: LOCAL
Company: Neptive Agency
```

Expected: login succeeds and the response provides the local auth session.

- [x] **Step 2: Create Casa Pandora through the agency endpoint.**

With the admin session, call:

```http
POST /neptive/agency/clients
Content-Type: application/json

{"name":"Casa Pandora","website":"https://casapandora.local","notes":"Cliente demo locale"}
```

Expected: response contains a Customer id and Casa Pandora is visible at `http://localhost:4200/agency`.

- [x] **Step 3: Invite the client through the agency endpoint.**

Call using the returned `customerId`:

```http
POST /neptive/agency/clients/<customerId>/users
Content-Type: application/json

{"email":"cliente@casapandora.local","name":"Cliente Casa Pandora","role":"CLIENT_ADMIN"}
```

Expected: response returns a local magic URL. If email delivery is not configured, the URL is still returned by the local API.

- [x] **Step 4: Consume and verify the magic URL.**

Open the returned URL, continue to the portal, and verify:

```http
GET /neptive/portal/me
```

Expected: `email` is `cliente@casapandora.local` and `customerId` is Casa Pandora’s id. The same raw magic token cannot be consumed a second time.

- [x] **Step 5: Seed only non-destructive demo data if the guide needs visible PED content.**

Use the existing `neptive/scripts/vertical-slice.mjs` only if a visible validation fixture is needed, and do not run a reset. Keep fixture rows clearly labeled and scoped to Casa Pandora.

### Task 5: Write and validate the user guide

**Files:**
- Create: `neptive/PROVA_CASA_PANDORA.md`

**Interfaces:**
- Consumes: actual local URLs, generated admin/client credentials, customer id, magic link, and observed UI routes.
- Produces: a standalone Italian guide for admin and client verification.

- [x] **Step 1: Document prerequisites and service URLs.**

Include the worktree location, `localhost:4200`, backend `localhost:3001`, and the required Docker command.

- [x] **Step 2: Document the admin journey.**

Include login, `/agency`, creating/opening Casa Pandora, PED creation, content/approval routes, and inviting the client user.

- [x] **Step 3: Document the client journey.**

Include the email identity, magic-link URL, `/portal`, PED, approvals, calendar/content, and logout. Mark the magic token as local/test-only.

- [x] **Step 4: Validate every guide URL and credential.**

Run:

```bash
curl -fsSI http://localhost:4200/agency
curl -fsSI http://localhost:4200/portal/login
```

Then complete the admin and client flows manually in the browser.

- [x] **Step 5: Review git state and commit only source/docs changes.**

Run:

```bash
git status --short
git diff --check
```

Expected: `.env`, node_modules, logs, and raw tokens are ignored; only the intended guide/spec/plan changes are tracked.
