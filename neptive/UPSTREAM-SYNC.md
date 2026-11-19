# Taking upstream Postiz changes (routine)

Branches: `neptive` = what production was built from (do not touch from here). `neptive-next` = integration branch,
already contains upstream `v2.26.0` (merge commit `596adb53`). Upstream is a fetch-only remote.

## Routine

```
git checkout neptive-next && git pull
neptive/dev/stack.sh up                  # local containers (needed for the schema dry-run)
neptive/scripts/sync-upstream.sh         # add --no-build to skip install/build/tests
```

The script, in order: refuses on a dirty tree or on `BASE=neptive`; `git fetch upstream`; creates a fresh branch
`sync/upstream-<date>` from the current branch; `git merge --no-ff upstream/main` (real merge commit);
if there are conflicts it lists them and stops with the merge in progress on that throwaway branch (resolve, or
`git merge --abort && git checkout neptive-next && git branch -D sync/upstream-<date>`); otherwise prints the merge
surface (files both sides changed since the merge base), runs `pnpm install --frozen-lockfile`, the full build
(`pnpm run build` = backend, frontend with Next's TypeScript check, orchestrator), the Neptive jest suite, and
finally the schema dry-run: newest `neptive/dev/.data/prod-*.dump` restored into a throwaway database
`pzn_sync_*` inside the local `pzn-postgres`, `prisma db push` exactly as production runs it, structured diff
(`neptive/scripts/schema-diff.py`), database dropped.

It never pushes, never deploys, never connects to production, never uses `--accept-data-loss` on anything but the
throwaway copy, never rebases or squashes.

After it: read the merge surface and schema flags, refresh the dump if it is old, start the app
(`stack.sh restore && stack.sh app`), run `node neptive/dev/qa.mjs <link>`, then merge the sync branch into
`neptive-next` yourself and push.

## Rules that keep merges cheap

- Merge, never rebase or squash (the history of Temporal `post.workflow.v1.0.x` files must stay intact).
- New Neptive code goes only under the Neptive paths below. Touching an upstream file needs a row in
  `NEPTIVE_CORE_TOUCHPOINTS.md` and in the table below.
- `rerere` is enabled in this workstation's global git config (`~/.config/git/config`): a conflict resolved once is reused on the next merge here. Not stored in the repo.
- Prisma: Neptive models are appended at the end of `schema.prisma` and use `neptive_*` tables. Never add columns to
  `Post`, `Integration`, `User`.
- Production's schema step (`prisma db push` without `--accept-data-loss`) aborts the container start on any data-loss
  warning, so every sync must read the dry-run flags before deploying. See "Schema" in `neptive/dev/README.md`.

## Neptive-owned paths (no merge risk)

`libraries/nestjs-libraries/src/neptive/**`, `apps/backend/src/neptive/**`, `apps/frontend/src/components/neptive/**`,
`apps/frontend/src/app/(app)/(portal)/**`, `apps/frontend/src/app/(app)/(site)/agency/**`,
`apps/frontend/public/neptive-demo/**`, `neptive/**`, `docs/superpowers/**`, root `AGENTS.md`.

## Merge surface today: upstream files the Neptive layer modifies

Measured with `git diff upstream/main` after the v2.26.0 merge, minus the owned paths above.

| file | change | conflict history |
|---|---|---|
| `libraries/nestjs-libraries/src/database/prisma/schema.prisma` | Neptive block appended (14 models; `NeptivePlanItemVariant` + 3 nullable item columns + 2 enum values added for post variants) | auto-merged |
| `apps/backend/src/app.module.ts` | import + register `NeptiveApiModule` | auto-merged |
| `apps/backend/src/main.ts` | CORS allowed header `neptive-portal` (+ exposed header in NOT_SECURED) | **conflicted** in v2.26.0 merge: upstream added `x-postiz-org` headers on the same lines |
| `apps/backend/src/services/auth/permissions/permissions.guard.ts` | skip policy check for `/neptive/portal*` | auto-merged |
| `apps/frontend/src/proxy.ts` | `/portal` bypasses the Postiz auth redirect | auto-merged |
| `apps/frontend/src/components/layout/layout.context.tsx` | portal 401 handling, store `neptive-portal` header | auto-merged |
| `apps/frontend/src/components/layout/top.menu.tsx` | "Agency" menu item | auto-merged |
| `libraries/helpers/src/utils/custom.fetch.func.ts` | send `neptive-portal` header in NOT_SECURED mode | auto-merged |
| `libraries/nestjs-libraries/src/temporal/temporal.module.ts` | import + `interceptors` line in the worker `workerOptions` (variant publish gate) | new on `neptive-next` (post variants) |
| `package.json`, `pnpm-lock.yaml` | `embla-carousel-react` dependency | auto-merged (lockfile verified with `--frozen-lockfile`) |
| `.gitignore` | ignore Next-generated `apps/frontend/AGENTS.md`/`CLAUDE.md` | auto-merged |
| `apps/frontend/src/app/(app)/auth/layout.tsx`, `auth/login/page.tsx`, `auth/page.tsx`, `components/auth/register.tsx`, `components/ui/logo-text.component.tsx` | white-label WIP from production working tree (no Postiz marketing panel, Neptive logo, no sign-up pitch) | **`auth/layout.tsx` conflicted** (upstream wrapped it in `MantineWrapper` + `Toaster`) |

The five auth/logo files are the part most likely to grow with the white-label work; the cheapest long-term shape is a
single Neptive component swapped in at one place rather than edits spread over these files.

## What to re-check by hand after each merge (the script cannot)

1. `proxy.ts`: the `/portal` early return still precedes the auth-cookie redirect.
2. `layout.context.tsx`: the portal branch still runs before Postiz clears `auth` on a 401.
3. `apps/backend/src/api/api.module.ts`: Neptive controllers are not in `authenticatedController` (they are registered by `NeptiveApiModule` with their own middleware); if upstream starts applying `AuthMiddleware` or a global guard more broadly, portal routes break.
4. Anything upstream renames in `@gitroom/*` imports used by Neptive code (the build catches this).
5. Browser: `/agency`, a portal magic link, `/portal/ped`, a post detail (`neptive/dev/qa.mjs`).
6. `temporal.module.ts`: the worker `workerOptions` still carry `interceptors: { activity: neptiveActivityInterceptors() }`, and
   `apps/orchestrator/src/activities/post.activity.ts` still publishes only through `postSocial` / `postSocialPending` /
   `postComment` (grep the provider calls `.post(` / `.postPending(` / `.comment(`). A new publishing activity name must be
   added to `NEPTIVE_GATED_ACTIVITIES` in `libraries/nestjs-libraries/src/neptive/publish-gate/variant-publish.gate.ts`.
