# Upstream maintenance

Postiz is infrastructure we intend to keep upgrading. Custom work lives under obvious `neptive` paths plus a **short** list of core bridges (`NEPTIVE_CORE_TOUCHPOINTS.md`).

## Remotes

```
upstream  git@github.com:gitroomhq/postiz-app.git   # official Postiz
origin    git@github.com:lawrencebennet/postiz-app.git  # Neptive fork
```

- `main` tracks **upstream** Postiz. Do not commit Neptive work there.
- Product work lives on the **`neptive`** branch and is pushed to `origin`.

Pull Postiz updates onto the product branch with a merge (not a rebase of versioned Temporal files):

```
git checkout neptive
git fetch upstream
git merge upstream/main
git push origin neptive
```

Do **not** merge BrightBean git history into Postiz.

## Fetch and compare

```
git fetch upstream
git log --oneline HEAD..upstream/main
git diff upstream/main --stat
git diff upstream/main -- libraries/nestjs-libraries/src/database/prisma/schema.prisma
```

A healthy diff: lots of new files under `neptive/`, `libraries/nestjs-libraries/src/neptive/`, `apps/backend/src/neptive/`, `apps/frontend/src/components/neptive/`, `apps/frontend/src/app/(app)/(site)/agency/`, `apps/frontend/src/app/(app)/(portal)/`. A **small** set of files from `NEPTIVE_CORE_TOUCHPOINTS.md`.

If the diff is scattered through providers, Temporal workflows, or composer internals, stop and revert — that is Option C drift.

## Merge / rebase upstream

Prefer merge commits on the product branch so Temporal workflow files remain historically intact:

```
git fetch upstream
git merge upstream/main
```

Never edit existing `post.workflow.v1.0.x` files to “fix conflicts” by changing activity signatures. If upstream adds `v1.0.10`, keep it.

## Prisma

Upstream has **no migrate directory**; it uses `pnpm prisma-db-push` / `prisma-generate` against `libraries/nestjs-libraries/src/database/prisma/schema.prisma`.

Neptive models are **appended** at the bottom of that file, mapped to `neptive_*` tables, with **no reverse relations** on Postiz models.

When upstream edits `schema.prisma`:

1. Merge their model/enum changes.
2. Keep the `// ---- Neptive Agency Layer ----` block at the **end**.
3. `pnpm prisma-generate`
4. `pnpm prisma-db-push` (additive). Do not `--force-reset` on shared data.
5. If they add a model named like ours, rename **ours** (`Neptive…` prefix already reserved).

Conflict hotspot: end of `schema.prisma` and the `generator`/`datasource` header. Header should always match upstream.

## Dependencies

Do not bump unrelated packages while merging. If `pnpm-lock.yaml` conflicts, take upstream lockfile then `pnpm install` so Neptive (no extra npm deps in v1) does not need new packages.

## After an upstream update

1. `pnpm prisma-generate`
2. `pnpm prisma-db-push` on a copy of production data (or staging)
3. `pnpm --filter ./apps/backend exec tsc --noEmit` if configured; otherwise `pnpm build:backend` / `pnpm build:frontend` as time allows
4. `pnpm exec jest --config neptive/jest.config.ts` (isolation + approval machine)
5. Smoke: agency `/agency`, portal magic link, calendar `/launches`, compose + existing Temporal publish

## Identifying Neptive files

```
git ls-files | rg -i 'neptive'
```

Plus the touchpoint files listed in `NEPTIVE_CORE_TOUCHPOINTS.md`.
