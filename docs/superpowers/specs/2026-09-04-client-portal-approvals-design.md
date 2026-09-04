# Client Portal and Approval Workflow Design

**Date:** 2026-09-04

**Status:** Approved in conversation; implementation pending written-spec review.

## Goal

Give agency clients a simple Italian-first portal where they can open a private link or sign in with email and password, navigate all content assigned to them, inspect the complete post and media, leave review feedback, approve individual posts, or approve a whole campaign at once.

## Scope

This feature adds a least-privilege client surface alongside the existing authenticated agency application and keeps the existing public post preview working. The client portal is scoped to Postiz’s existing `Customer` grouping: a client sees posts published through integrations assigned to that customer.

Included:

- Separate client portal accounts, not agency `User` accounts.
- Revocable private access links that exchange for a client portal session.
- Email/password sign-in for the same portal account.
- Italian-first dashboard and post detail views.
- Full post copy, media, platform, scheduled date, post threads, and review state.
- Per-post approval and “approve all” for a campaign.
- Per-post “request changes” with a required comment.
- Review history and agency notifications for client actions.
- Agency controls to create/update portal credentials, copy a link, and revoke links.
- Translation keys for every new/touched client-facing string, including the existing preview strings.

Not included in this iteration:

- Client editing of post copy, media, dates, channels, or settings.
- Automatic publishing when a client approves.
- Client access to the agency calendar, channel settings, billing, analytics, or team management.
- Social OAuth or third-party client authentication.
- Self-service password reset; the agency can reset credentials from the portal settings screen.

## Design decisions

### Separate identity and session boundary

Add a `ClientPortalAccount` model connected to one organization and one existing `Customer`. The account stores the client name, email, and a bcrypt password hash. The organization/email combination is unique and one customer has at most one portal account in this iteration.

Add a `ClientPortalToken` model for link access. Only a SHA-256 hash of the random token is stored. A token has `createdAt`, `lastUsedAt`, and `revokedAt`; an unrevoked token remains valid until revoked by the agency. Link exchange creates a short-lived, signed client portal session in an HTTP-only cookie. Password login creates the same kind of session. The client session contains only the portal account identifier and expires after 30 days.

Client portal API routes use a dedicated guard that resolves the portal account and organization from the client session. They never use the existing agency `AuthMiddleware`, and they never accept an agency organization id from the browser. Admin management routes continue using the existing agency middleware and require an ADMIN or SUPERADMIN role.

### Content visibility

All client content queries must scope through the authenticated portal account’s `customerId`, the organization id, and non-deleted integrations/posts. A post is visible when its integration belongs to that customer. Campaigns are grouped by the existing `Post.group` value. Campaign detail queries reuse the existing recursive post/thread behavior so the client can see the complete post rather than a truncated card.

Approval does not change `Post.state` and does not publish anything. It records the client’s approval decision for the agency to act on. A post with no review is `PENDING`; its latest review determines whether it is `APPROVED` or `CHANGES_REQUESTED`.

### Review history

Add a `ClientPortalReview` append-only model with:

- `clientPortalAccountId`;
- `postId`;
- `status` of `APPROVED` or `CHANGES_REQUESTED`;
- optional `comment`;
- `createdAt`.

The service rejects `CHANGES_REQUESTED` when the trimmed comment is empty. It also rejects reviews for posts outside the client’s customer scope. The latest review is used for current status while the full history is returned in post detail, allowing the client and agency to understand what changed over time.

“Approve all” runs in a transaction: it finds every visible post in the selected campaign that is not already approved, creates an `APPROVED` review for each, and returns refreshed campaign counts. Repeating the action is idempotent and does not create duplicate approval records for already-approved posts.

## API shape

### Client authentication

- `POST /client-portal/auth/login` with `{ email, password }`; sets the client session cookie.
- `POST /client-portal/auth/token` with `{ token }`; validates the token hash, updates `lastUsedAt`, and sets the same client session cookie.
- `GET /client-portal/session`; returns the signed-in client account or an unauthenticated response.
- `POST /client-portal/auth/logout`; clears the client session cookie.

### Client data and actions

- `GET /client-portal/dashboard`; returns client identity, summary counts, and campaign summaries.
- `GET /client-portal/campaigns/:group`; returns the full campaign with its posts, media, platform data, current review status, and review history.
- `GET /client-portal/posts/:id`; returns the full recursive post/thread detail after scope validation.
- `POST /client-portal/posts/:id/reviews` with `{ status: 'APPROVED' | 'CHANGES_REQUESTED', comment?: string }`.
- `POST /client-portal/campaigns/:group/approve`; approves all pending/non-approved posts in that campaign in one transaction.

### Agency management

- `GET /client-portal/accounts`; lists customers and portal account status for the current organization.
- `POST /client-portal/accounts`; creates a portal account for a customer and returns a one-time plaintext link token for copying.
- `PUT /client-portal/accounts/:id`; updates client name, email, and optionally replaces the password.
- `POST /client-portal/accounts/:id/token`; revokes existing active tokens and returns a new plaintext link token once.
- `POST /client-portal/accounts/:id/revoke`; revokes all link tokens and disables portal access until re-enabled by the agency.

Management responses never return password hashes or stored token hashes. Link tokens are returned only in the create/rotate response so the agency can copy the complete `/portal/access?token=...` URL.

## Frontend experience

Create a route group that does not render the agency `LayoutComponent`:

- `/portal/access?token=...`: exchanges the token and redirects to `/portal`.
- `/portal/login`: email/password login and a clear link-access alternative.
- `/portal`: dashboard with a welcome header, summary cards, campaign list, filters, and prominent “Da approvare” actions.
- `/portal/campaign/[group]`: full campaign review view, grouped by post/date/platform, with review status chips and “Approva tutto”.
- `/portal/post/[id]`: full post view with all media, copy, metadata, review history, comment form, “Approva”, and “Richiedi modifiche”.

Navigation is intentionally small: Panoramica, Da approvare, Approvati, Modifiche richieste, and Esci. The UI is responsive and uses existing Tailwind tokens/components. Approval actions show a confirmation state, disable while saving, refresh SWR data after success, and show a localized error without losing the typed comment.

Add `/settings/client-portal` for agency admins. It lists customers, shows whether an account exists, allows credential setup, copies or rotates the private link, and revokes access. The screen explains that visibility follows the channels assigned to each customer.

The existing `/p/[id]` preview remains backward-compatible. Its client-facing actions and comments copy are moved to i18n keys; new client portal links are generated from the admin screen rather than changing old links.

## Italian localization

Use the existing shared i18next setup and add matching keys to the English and Italian locale files. The portal wrapper sets Italian as its initial language so the client experience is predictable even when the browser language is English. The existing missing `apple` Italian key is added during the localization pass. Any user-visible English literal touched in the preview or portal is replaced by a translation key; provider names, brand names, and user-authored post content remain unchanged.

## Error handling and security

- Invalid, revoked, or malformed link tokens return a generic Italian access error and never reveal whether an account exists.
- Invalid login credentials return one generic error message.
- Review requests are validated server-side for status, post scope, comment requirement, and post existence.
- Batch approval uses a transaction and returns a safe no-op result when nothing remains to approve.
- All client-session cookies are HTTP-only, secure outside local insecure mode, same-site, and scoped to the frontend domain consistently with existing auth cookies.
- Account and token operations are organization-scoped; an id from another organization is treated as not found.
- Passwords use the repository’s existing bcrypt/password helper; plaintext passwords and link tokens are never logged or persisted.
- Client routes do not expose agency user ids, organization ids, API keys, channel credentials, internal settings, or billing data.
- The client-facing media response uses the same safe media URLs already used by the public preview.

## Notifications

Each new approval or change request creates an organization notification linked to the relevant post/campaign. The notification includes the client name, action, and link to the agency post view. No workflow or orchestrator activity is changed.

## Testing strategy

Backend tests cover token hashing/exchange, account scoping, credential validation, campaign visibility, review validation, required change comments, idempotent batch approval, and organization notifications using service/repository boundaries. Frontend tests cover Italian labels, login/link states, dashboard status filters, confirmation behavior, required-comment validation, and SWR refresh after a successful review. A production frontend build and the relevant backend test suites must run before completion.

## Migration and compatibility

The Prisma migration adds only nullable/new tables and enum values; it does not alter existing post state semantics, existing agency users, public preview URLs, or orchestrator workflows. Existing customers remain valid without portal accounts. The feature is opt-in until an agency creates an account and link for a customer.
