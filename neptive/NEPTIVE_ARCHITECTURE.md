# Neptive Architecture

## Decision: Option B — isolated module inside the Postiz monorepo

| Option | Verdict |
|---|---|
| **A** Separate Neptive app + Postiz Public API | Rejected for v1. Public API authenticates as org SUPERADMIN. A BFF holding that key would see every customer. Composer/calendar would be a second origin. Client isolation cannot be enforced through current public endpoints. |
| **B** Isolated Neptive package/folder in the monorepo, tiny core bridges | **Selected.** Same process, same DB, same design system. `git diff` vs upstream is append-only Prisma models + a short touchpoint list. |
| **C** Scatter agency fields through Postiz core | Rejected except unavoidable bridges (nav, proxy, CORS, layout 401). |

Dependency direction: **Neptive → Postiz services** (`PostsService`, `IntegrationService`, `MediaService`, `EmailService`, Prisma `Customer`). Never Postiz core → Neptive.

OAuth apps / API keys stay org-wide automation tools. They are **not** used as the client portal credential.

---

## Mapping

```
Agency tenant     = Postiz Organization
Internal users    = Postiz UserOrganization (SUPERADMIN / ADMIN / USER)
Client brand      = Postiz Customer (+ NeptiveClientProfile)
Client people     = NeptiveClientUser (NOT UserOrganization)
Publish state     = Postiz Post.state + Temporal
Approval state    = NeptiveContentApproval (keyed by Post.group)
PED               = NeptiveEditorialPlan
```

Existing Customers created from the channel modal are valid clients; a profile row is created lazily.

---

## Why separate portal auth

A Postiz USER sees every integration and every post in the org. There is no customer-scoped CASL. Putting clients on `UserOrganization` would require forking authorization throughout Postiz core (Option C).

Independent portal identity:

- Cannot hit `/settings`, `/billing`, `/integrations` as an org member.
- Cookie `neptive_portal` is distinct from `auth`.
- Portal middleware never throws `HttpForbiddenException` (that class clears the agency `auth` cookie).

Magic links: raw token in email, SHA-256 at rest, GET is peek, POST consumes, 30-day expiry (BrightBean pattern).

---

## Isolation

Every Neptive row stores `orgId` + `customerId` (Postiz Customer id). Portal endpoints **ignore** client ids from the body/URL and use `session.customerId`. Agency endpoints take `:customerId` and `assertCustomerInOrg(org.id, customerId)` against Postiz `Customer`.

Postiz data (posts, analytics, integrations) is loaded only through adapters that pass `customerId` into existing filters (`integration.customerId`).

No reverse Prisma relations on Postiz models — IDs only — so upstream `schema.prisma` merges are append-only at file end.

---

## Approval vs publishing

```
Neptive: DRAFT → PENDING_INTERNAL_REVIEW → PENDING_CLIENT_APPROVAL → APPROVED
                              ↘ CHANGES_REQUESTED / REJECTED
Postiz:  DRAFT | QUEUE | PUBLISHED | ERROR
```

- Approve may authorize `PostsService.changePostStatus(..., 'schedule')` (`DRAFT` → `QUEUE`) if the post is still a draft.
- `APPROVED` is terminal in Neptive (no outbound transitions). Portal/agency cannot `CHANGES_REQUESTED` after `APPROVED`.
- Changes requested / reject unschedule only while the Neptive row is still `PENDING_*` and Postiz `Post.state` is `QUEUE` (calendar schedule without finishing the Neptive machine, or a race). Then revert to `DRAFT` so Temporal will not publish.
- Already `PUBLISHED`: never unpublish.
- Transitions use `updateMany` with `status = expected` to avoid lost races.

Live validation also confirmed that Postiz `GET /integrations` is the **provider catalog** (`NoAuthIntegrationsController`), not org channels. Org channels are `GET /integrations/list` and require Postiz `auth`. That catalog 200 is upstream, not a Neptive leak.

---

## Layout of custom code

```
neptive/                          docs + touchpoint manifest (this folder)
libraries/nestjs-libraries/src/neptive/   domain, dto, repos, services, module
apps/backend/src/neptive/                 controllers + portal middleware + Nest module
apps/frontend/src/components/neptive/     UI
apps/frontend/src/app/(app)/(site)/agency/
apps/frontend/src/app/(app)/(portal)/portal/
```

HTTP:

- `/neptive/agency/*` — `AuthMiddleware` (Postiz org users)
- `/neptive/portal-auth/*` — public magic-link consume
- `/neptive/portal/*` — `NeptivePortalMiddleware`

---

## Frontend

Recreate BrightBean UX *ideas* with Postiz tokens (`bg-newBgColorInner`, `border-newTableBorder`, `bg-forth`, Button/Input from `@gitroom/react/form`). Agency nav item “Agency”. Client portal is a stripped shell like `/p/`.

Agency users keep using `/launches` (composer + calendar). Client pages deep-link with the existing customer filter where useful; portal never loads the full calendar app.

---

## Database ownership

| Table prefix | Owner | References |
|---|---|---|
| Existing Postiz models | Postiz | Untouched columns |
| `neptive_*` | Neptive | `orgId`, `customerId`, `postGroup`, `mediaId`, `userId` as strings |

Migrations: additive `db push` of new models. See `UPSTREAM_MAINTENANCE.md`. Destructive resets are forbidden as a normal workflow.

---

## Follow-ups (not blocking v1)

- Customer-scoped Postiz CASL (would let us drop some portal isolation work).
- Tokenized preview links.
- Client social connect-link wrapping Postiz OAuth state.
- Report designer / PDF.
- White-label custom domains.
