# Neptive Postiz Audit

**Repository:** `/home/lawrence-bennet/dev/social/postiz-app`  
**Remote:** `origin` → `git@github.com:gitroomhq/postiz-app.git` (official Postiz; treat as upstream until a fork remote is added)  
**HEAD:** `74b01ada` — `feat: one click claude connector`  
**Branch:** `main` tracking `origin/main`  
**License:** AGPL-3.0  
**Package name:** `gitroom` (historical; product is Postiz)  
**Node:** `>=22.12.0 <23.0.0` · **Package manager:** `pnpm@10.6.1`

Local code is the source of truth. `CLAUDE.md` still says the frontend is Vite React; the current tree is **Next.js App Router**. Publishing is **Temporal**, not cron.

---

## 1. Structure

| Path | Role |
|---|---|
| `apps/backend` | NestJS HTTP API (internal + public) |
| `apps/frontend` | Next.js 16 App Router UI (port 4200) |
| `apps/orchestrator` | Temporal workers / workflows / activities |
| `apps/commands` | CLI |
| `apps/extension` | Browser extension |
| `apps/sdk` | Thin Node SDK for the public API |
| `libraries/nestjs-libraries` | Prisma, services, providers, DTOs, Temporal helpers |
| `libraries/react-shared-libraries` | Shared React (forms, i18n, toaster) |
| `libraries/helpers` | JWT/crypto, cookies, fetch |

Backend layering required by `CLAUDE.md`: **DTO → Controller → Service → Repository** (sometimes Manager). Controllers live in `apps/backend`; logic lives in `libraries/nestjs-libraries`.

Prisma schema: `libraries/nestjs-libraries/src/database/prisma/schema.prisma`  
Generate/push uses `prisma@6.5.0`. There is **no Prisma migrate history** in-repo; upstream uses `db push`.

Docker: `docker-compose.yaml` (prod-ish) and `docker-compose.dev.yaml` (Postgres 17, Redis 7, Temporal stack).

---

## 2. Tenancy and ownership

**Root tenant = `Organization`.** Almost every resource is org-scoped.

| Model | Owner | Notes |
|---|---|---|
| `User` | Global | Joins orgs via `UserOrganization`. `isSuperAdmin` is platform-level. |
| `UserOrganization` | Org | Role `SUPERADMIN \| ADMIN \| USER`. Not resource-scoped. |
| `Customer` | Org | Client-group label. Unique `(orgId, name, deletedAt)`. Relations: `integrations[]` only. |
| `Integration` | Org | Social channel. Optional `customerId`. |
| `Post` | Org | Tied to `Integration`. Multi-platform set shares `group`. Customer is **inferred** via `integration.customerId`. |
| `Media` | Org | **No customer scope.** |
| `Comments` | Org + Post + User | Requires a real Postiz user. |
| `Notifications` | Org | |
| `Webhooks` | Org | |
| `OAuthApp` / `OAuthAuthorization` | Org | Public-API OAuth (`pos_` tokens). |
| `Organization.apiKey` | Org | Public API key; middleware treats caller as org SUPERADMIN. |

`SocialMediaAgency` is a **marketplace directory listing**, not a CRM client. `Post.approvedSubmitForOrder` is **marketplace** confirmation, not client approval.

There is **no** PreviewToken, Approval, ClientMembership, CustomerUser, or customer-scoped media model.

---

## 3. Customer / client groups

**Implementation:** thin grouping of integrations.

- Create is **lazy**: assigning a name to a channel find-or-creates `Customer` (`integration.repository.ts` `updateOnCustomerName`).
- Internal API: `GET /integrations/customers`, `PUT /integrations/:id/customer-name`, `PUT /integrations/:id/group`.
- Public API: `GET /public/v1/groups`, `GET /public/v1/integrations?group=`.
- Frontend: `customer.modal.tsx` (assign channel), `select.customer.tsx` (calendar filter). No `/customers` CRM page.
- Posts: `posts.repository.ts` filters `integration.customerId` when `query.customer` is set.
- Analytics: per-integration / per-post only. No customer rollup endpoint.
- Media: org-only.
- Users: cannot be scoped to a customer.

**Invite for a client to connect socials without full app access:** **does not exist.** Team invite JWT grants **full org membership**. Social OAuth state is always org-scoped. BrightBean’s `ConnectionLink` is the reference pattern; Postiz public `GET /public/v1/social/:integration` is org-API-key based.

**Verdict:** `Customer` is a grouping mechanism, **not** a security boundary. It is still the correct entity to **map** to Neptive Client (do not create a parallel Client table). Security must be added in the Neptive layer.

---

## 4. Preview / comments / approval

- Route: `/p/[id]` — unauthenticated (`proxy.ts` allows `/p/`).
- ID = Post `cuid`, **not** a token. No expiry, no revoke. Security = unguessability.
- `GET /public/posts/:id` loads recursively **without org check**.
- Comments persist on `Comments` and require login (`POST /posts/:id/comments`). Authors shown as `User1` / `User2`.
- Multi-platform: preview follows `parentPostId` for one integration thread, not a tokenized post-group artifact.
- `Post.state`: `QUEUE | PUBLISHED | ERROR | DRAFT` — publishing lifecycle only.

**There is no agency approval state machine.** Preview comments are not approval.

---

## 5. Roles, CASL, auth

CASL (`@casl/ability`) mostly gates **subscription entitlements** (channels, posts/month, webhooks, team members, AI), plus `Sections.ADMIN` for ADMIN/SUPERADMIN. If Stripe is unset, policies are effectively allowed.

No per-customer or per-channel permissions. API keys and `pos_` tokens impersonate **org SUPERADMIN**.

Auth: JWT in `auth` cookie + `showorg` org selection. Providers: LOCAL, GitHub, Google, Apple, Farcaster, Wallet, generic OIDC. Activation / invite / forgot-password are JWT links, not a client portal.

`AuthMiddleware` re-resolves the user from DB (does not trust JWT claims). `HttpForbiddenException` is mapped to **401 and clears the auth cookie** — Neptive portal must **not** throw this class.

---

## 6. Public API (`/public/v1`)

Auth: org API key or `pos_` OAuth token → fake SUPERADMIN.

Useful: upload, posts CRUD/status, groups (customers list), integrations (+ group filter), social connect URL, analytics per integration/post, notifications, video gen.

**Missing for agency:** Customer CRUD, client users, client-scoped auth, PED, approval, strategy, activities, deliverables, reports, customer analytics rollup, guest preview tokens.

Because the public API is org-SUPERADMIN, an external portal **cannot** enforce client isolation through it. A BFF that holds the org API key would still see every customer unless Postiz grows customer-scoped tokens (it has not).

---

## 7. Frontend

Next.js App Router + Tailwind 3 + Mantine + CSS variables (`apps/frontend/src/app/colors.scss`). Primary `#612bd3`. Dark-first.

Site nav (`top.menu.tsx`): Calendar/Launches, Agent, Analytics, Media, Plugs, Integrations, Billing, Settings.

UI primitives: `@gitroom/react/form/{button,input,textarea,select,checkbox}`. Fetch: `useFetch` + SWR. Each SWR hook must be its own hook.

Preview lives under `(preview)/p/[id]` with a stripped layout — pattern to copy for the client portal.

---

## 8. Temporal (do not fork)

Versioned post workflows `post.workflow.v1.0.1` … `v1.0.9`. Rules from `CLAUDE.md`: never mutate an existing workflow/activity signature; add a new version. Agency code must create/schedule via `PostsService` and let Temporal publish.

Also: token refresh, autopost, email, digest. **Do not rebuild providers or the publish pipeline.**

---

## 9. Tests

Root Jest config uses NX `getJestProjects()`. **No `*.spec.ts` / `*.test.ts` files exist in the tree.** Agency-critical paths are untested upstream. Do not attribute that gap to Neptive.

---

## 10. Implications for Neptive

Reuse: Organization tenancy, Customer as client label, calendar customer filter, composer, media storage, public post preview, PostsService status (`DRAFT`/`QUEUE`), Temporal publish, per-channel analytics collectors.

Must add (outside Postiz core semantics): client identity + isolation, portal UX, PED, explicit approval, strategy, activity log, deliverables metadata, monthly reports, client dashboard.
