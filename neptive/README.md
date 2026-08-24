# Neptive Agency Layer

Isolated agency/client domain around Postiz. Postiz remains the publishing engine.

Custom work lives on the **`neptive`** branch of `lawrencebennet/postiz-app`. Official Postiz is `upstream` (`gitroomhq/postiz-app`). See [UPSTREAM_MAINTENANCE.md](./UPSTREAM_MAINTENANCE.md).

Read in this order:

1. [NEPTIVE_POSTIZ_AUDIT.md](./NEPTIVE_POSTIZ_AUDIT.md)
2. [BRIGHTBEAN_REFERENCE_AUDIT.md](./BRIGHTBEAN_REFERENCE_AUDIT.md)
3. [NEPTIVE_FEATURE_MATRIX.md](./NEPTIVE_FEATURE_MATRIX.md)
4. [NEPTIVE_ARCHITECTURE.md](./NEPTIVE_ARCHITECTURE.md)
5. [UPSTREAM_MAINTENANCE.md](./UPSTREAM_MAINTENANCE.md)
6. [NEPTIVE_CORE_TOUCHPOINTS.md](./NEPTIVE_CORE_TOUCHPOINTS.md)
7. [EXISTING_FAILURES.md](./EXISTING_FAILURES.md)
8. [VERTICAL_SLICE_VALIDATION.md](./VERTICAL_SLICE_VALIDATION.md)

## Local stack

Host Postgres already uses `5432` and `5433`. Use the override; do not stop those services.

```
docker compose -f docker-compose.dev.yaml -f neptive/docker-compose.dev.override.yaml up -d \
  postiz-postgres postiz-redis temporal-postgresql temporal-elasticsearch temporal
```

Gitignored `.env` must set `DATABASE_URL` to port **5434** with compose credentials (`postiz-local` / `postiz-local-pwd` / `postiz-db-local`), plus `FRONTEND_URL=http://localhost:4200`, `NEXT_PUBLIC_BACKEND_URL=http://localhost:3000`, `NOT_SECURED=true`, `TEMPORAL_ADDRESS=localhost:7233`. Then `pnpm prisma-generate`, `pnpm prisma-db-push`, and `pnpm run dev:backend|orchestrator|frontend`.

## Run isolation tests

```
pnpm exec jest --config neptive/jest.config.ts --runInBand
```

## Live HTTP / Prisma / Temporal harness

Requires the stack above.

```
node --env-file=.env neptive/scripts/vertical-slice.mjs
```
