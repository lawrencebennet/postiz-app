# Neptive core touchpoints

Intentional modifications **outside** `neptive/` folders. If a file is not listed here and is not under a `neptive` path, it should not be in `git diff upstream/main`.

| File | Why | What depends on it | Upstream conflict likelihood | Can it be eliminated? |
|---|---|---|---|---|
| `libraries/nestjs-libraries/src/database/prisma/schema.prisma` | Append Neptive models/enums | All Neptive persistence | Medium (file end + header) | Only with a second Prisma schema (more ops cost) |
| `apps/backend/src/app.module.ts` | Import `NeptiveApiModule` | HTTP surface | Low (one import) | No, unless Option A |
| `apps/backend/src/main.ts` | CORS header `neptive-portal` | Portal cookie in `NOT_SECURED` | Low | Yes if portal always httpOnly same-site |
| `apps/backend/src/services/auth/permissions/permissions.guard.ts` | Skip `/neptive/portal` + `/neptive/portal-auth` if a future policy is attached | Portal without `req.org` | Low | Yes if we never use `@CheckPolicies` on portal |
| `apps/frontend/src/proxy.ts` | Allow `/portal` without Postiz `auth` cookie | Client portal | Medium (auth redirects change often) | No for Option B |
| `apps/frontend/src/components/layout/top.menu.tsx` | Agency nav item | Agency UX | Medium (menu churn) | Yes with a plugin slot (does not exist) |
| `apps/frontend/src/components/layout/layout.context.tsx` | Portal 401 must not clear Postiz auth; persist `neptive-portal` header | Dual auth | Medium | No |
| `libraries/helpers/src/utils/custom.fetch.func.ts` | Send `neptive-portal` header in `NOT_SECURED` mode | Portal session | Low | Yes if portal is always httpOnly |
| `apps/frontend/src/app/(app)/auth/{layout,page,login/page}.tsx`, `components/auth/register.tsx`, `components/ui/logo-text.component.tsx` | White-label (work in progress taken from the production working tree) | Auth screens | High (upstream edits auth often; `layout.tsx` conflicted at the v2.26.0 merge) | Yes, by swapping one Neptive component in |
| `libraries/nestjs-libraries/src/temporal/temporal.module.ts` | One import + `interceptors: { activity: neptiveActivityInterceptors() }` in the social/main worker options: the publish gate that refuses `postSocial` / `postSocialPending` / `postComment` for post variants the client has not confirmed (`libraries/nestjs-libraries/src/neptive/publish-gate/`) | Publishing safety of PED variants | Medium (upstream tunes `workerOptions` here; the line sits next to `maxHeartbeatThrottleInterval`) | No: it is the only point every publish passes through without editing the frozen workflows or the activities |
| `.gitignore` | Ignore Next.js-generated `apps/frontend/AGENTS.md` and `CLAUDE.md` | Clean clones | Low | Yes |

**Not touchpoints (new isolated trees):**

- `libraries/nestjs-libraries/src/neptive/**`
- `apps/backend/src/neptive/**`
- `apps/frontend/src/components/neptive/**`
- `apps/frontend/src/app/(app)/(site)/agency/**`
- `apps/frontend/src/app/(app)/(portal)/**`
- `neptive/**`

**Forbidden without a new row in this file:** Temporal workflows (the variant gate is a worker interceptor precisely so that no workflow or activity file changes), social providers, composer internals, Prisma columns on `Post`/`Integration`/`User`.
