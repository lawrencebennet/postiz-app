# Existing Postiz quality baseline

Recorded so Neptive work is not blamed for upstream gaps.

## Tests

- Local tree at `74b01ada` contains **no** `*.spec.ts` / `*.test.ts` files outside Neptive.
- Root `package.json` script `test` runs Jest via NX `getJestProjects()`. With no `project.json` test projects, this is not a useful agency-layer gate.
- Neptive isolation tests: `pnpm exec jest --config neptive/jest.config.ts --runInBand` — **24 passed** (2026-08-23).

## Generate / install

- `pnpm install` succeeded (Node 22.22.0, pnpm 10.6.1).
- `prisma generate` succeeded against the appended Neptive models.
- `pnpm prisma-db-push` succeeded against the dedicated Postiz Postgres on **5434** (see below). 13 `neptive_*` tables exist.

## Full app build / live stack

The first attempt with stock `docker-compose.dev.yaml` failed because **host PostgreSQL 16/main already binds `127.0.0.1:5432`** (and 14/odoo14 binds `5433`). Those services are unrelated and must stay up.

**Resolved** without editing upstream compose: `neptive/docker-compose.dev.override.yaml` uses Compose `ports: !override` to publish Postiz Postgres as **`5434:5432`**. Gitignored `.env` `DATABASE_URL` uses compose credentials `postiz-local` / `postiz-local-pwd` / `postiz-db-local` on port 5434.

Stack used for vertical-slice validation:

```
docker compose -f docker-compose.dev.yaml -f neptive/docker-compose.dev.override.yaml up -d \
  postiz-postgres postiz-redis temporal-postgresql temporal-elasticsearch temporal
```

plus `pnpm run dev:backend|orchestrator|frontend`. Evidence: [VERTICAL_SLICE_VALIDATION.md](./VERTICAL_SLICE_VALIDATION.md).

Do not “fix” upstream by rewriting Temporal, providers, or composer to make a green full-repo test run.

## Upstream quirks seen live (not Neptive bugs)

- `GET /integrations` is public (provider catalog via `NoAuthIntegrationsController`). Org channels are `GET /integrations/list`.
- `Customer` unique `(orgId, name, deletedAt)` allows duplicate live names because `NULL` does not collide in that unique index. Neptive create now rejects a second live client with the same name.
