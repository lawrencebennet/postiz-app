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
`apps/frontend/public/neptive-demo/**`, `apps/frontend/public/neptive/**`, `neptive/**`, `docs/superpowers/**`, root `AGENTS.md`.

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
| `package.json`, `pnpm-lock.yaml` | **Next 16.4.2 -> 16.4.6** (`next` dependency, `pnpm.overrides.next`, `eslint-config-next`): see "Deliberate divergences" | will conflict if upstream moves `next` on the same lines: keep the higher version |
| `.gitignore` | ignore Next-generated `apps/frontend/AGENTS.md`/`CLAUDE.md` | auto-merged |
| `apps/frontend/next.config.js` | white-label: import + `withNeptiveBrand(nextConfig)` (build transform, module swaps, asset rewrites, `/auth` redirect) | new (white-label) |
| `apps/frontend/postcss.config.mjs` | white-label: Neptive theme PostCSS plugin after tailwind | new (white-label) |
| `apps/frontend/src/app/(app)/auth/layout.tsx` | renders `NeptiveAuthShell` instead of the upstream frame (marketing panel, testimonials) | **conflicted** in v2.26.0 (upstream added `MantineWrapper` + `Toaster`, both kept) |
| `libraries/nestjs-libraries/src/services/email.service.ts` | white-label: import + `neptiveEmail()` call in `sendEmailSync` (subject, body, sender, layout) | new (white-label) |
| `libraries/nestjs-libraries/src/chat/start.mcp.ts` | white-label: MCP server name from brand (5 `name:` lines + import) | new (white-label) |
| `libraries/helpers/src/swagger/load.swagger.ts` | white-label: API title | new (white-label) |
| `apps/backend/src/api/routes/copilot.controller.ts` | `/copilot/chat` and `/copilot/agent` answer 503 when `OPENAI_API_KEY` is missing instead of leaving the request open (2 lines; see "Deliberate divergences") | new (found in the production-image rehearsal) |
| new files in upstream folders | `apps/frontend/src/app/manifest.ts`, `app/(app)/opengraph-image.png`, `app/(app)/apple-icon.png` | no merge risk unless upstream adds the same files |

**22 upstream files** differ from `upstream/main` (19 modified + 3 new, `package.json`/`pnpm-lock.yaml` counted).
The white-label adds 6 modified + 3 new; it also removed the earlier draft edits of `auth/login/page.tsx`,
`auth/page.tsx`, `components/auth/register.tsx`, `components/ui/logo-text.component.tsx` (back to upstream).
How the white-label works and how to check it: `neptive/WHITE-LABEL.md`. `sync-upstream.sh` runs the brand
check as step 4b.

## Deliberate divergences (drop when upstream catches up)

- **Next 16.4.6 instead of upstream's 16.4.2.** `next build` on <=16.4.4 exits non-zero on the first run with
  `SecurityFatalError` (npm advisories GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8, moderate). In a Docker build that
  is a failed deploy. Three lines in `package.json` (`dependencies.next`, `devDependencies.eslint-config-next`,
  `pnpm.overrides.next`) plus the lockfile; own commit, revert it to go back. Drop this row when upstream's `next` is
  >= 16.4.5: on the next merge, take upstream's version if it is >= 16.4.6, otherwise keep ours.

- **`/copilot/*` answers 503 without an LLM key** (`copilot.controller.ts`). Upstream returns without responding, the
  request hangs until nginx times out (60 s) and nginx then marks the backend down for ~10 s, so unrelated requests
  get 502. Reproduced on the production image locally (4 portal requests failed with `no live upstreams`). Drop when
  upstream answers or closes the response in that branch.

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
7. White-label: `node neptive/scripts/brand-check.mjs` passes (also step 4b of the script); if it reports that an
   upstream module swapped by Neptive changed (login form, logos, font module), compare it with the Neptive
   copy in `apps/frontend/src/components/neptive/brand/`. Browser: `node neptive/dev/brand-sweep.mjs --langs=it,en`.
8. Approval scheduling (`neptive/docs/approval-scheduling.md`, no upstream file touched): `PostsService.changePostStatus`
   / `changeDate(…, 'update')` keep their signatures, `startWorkflow` still uses workflow id `post_<id>` and
   `postWorkflowV112` (else `PostizAdapter.postWorkflowRunning` checks the wrong workflow and every approval fails
   closed). Run `node neptive/dev/schedule-check.mjs`.
