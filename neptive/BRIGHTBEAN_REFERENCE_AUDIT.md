# BrightBean Studio — Reference Audit

**Repository:** `/home/lawrence-bennet/dev/social/brightbean-studio`  
**Remote:** `git@github.com:brightbeanxyz/brightbean-studio.git`  
**HEAD:** `d85fce1`  
**License:** AGPL-3.0  

BrightBean is a **domain reference**, not a runtime dependency. Do not copy frontend templates, HTMX, or Django apps into Postiz. Recreate useful concepts in Postiz’s Next.js + NestJS stack.

AGPL implication: studying workflows is fine; shipping BrightBean source inside a network service requires AGPL compliance. Neptive reimplements concepts and does not vendor BrightBean files.

---

## Mapping

| BrightBean | Agency meaning | Postiz analogue |
|---|---|---|
| Organization | Agency tenant | `Organization` |
| Workspace | One client brand | `Customer` (channel group) — **not** a second org |
| `WorkspaceMembership(role=client)` | External client user | **Missing** — Neptive `NeptiveClientUser` |
| Magic-link portal | Passwordless client UX | **Missing** |
| `PlatformPost.status` | Editorial + publish mixed | Split: Postiz `Post.state` (publish) vs Neptive approval (business) |
| ConnectionLink | Client connects socials without full app | **Missing** in Postiz |
| ContentCategory | Soft content pillars | Postiz `Tags` (org-wide, not client strategy) |

There is **no** Django `Client`, `PED`, `Strategy`, `Report`, or `WhiteLabelConfig` model. Specs in `development_specs/` describe reports/white-label that are **not shipped**.

---

## Tenant and RBAC

- Org roles: owner / admin / member.
- Workspace roles: owner, manager, editor, contributor, **client**, viewer, plus org-level CustomRole JSON maps.
- Client built-in grants: `approve_posts`, `view_analytics`. Cannot create/publish/inbox/settings.
- Isolation: `for_workspace` / `for_org` managers; URL workspace id without membership → `PermissionDenied`. Tests cover IDOR on comments, media, API keys, calendar.

**Pattern to keep:** clients are a **first-class restricted identity**, not “a normal user with some menu items hidden.” Portal is a separate shell (`portal_base.html`).

---

## Client portal

- Invite creates a User with `workspace_role=client`.
- Magic link: 48-char token, **30-day** expiry, GET peeks (email-scanner safe), POST consumes once, session flag `is_portal_session` + `portal_workspace_id`.
- Routes: dashboard, approvals, published, activity; reports page is a **placeholder**.
- Queries always bound to session workspace. External comments only.

**Pattern to keep:** passwordless magic link + session bound to **one** client. Do not give clients Postiz `UserOrganization` membership.

---

## Approval

Workspace modes: `none | optional | required_internal | required_internal_and_client`.

`PlatformPost` statuses mix editorial and publish (`draft` … `published` / `failed`). Transitions include `pending_review` → `approved` → `pending_client` → `approved`. Changes/reject require a comment. `ApprovalAction` is the audit trail. `PostComment.visibility` is `internal | external`. Reminders: 24h internal / 48h client.

**Pattern to keep:** two-stage review, visibility-split comments, action audit, hold. **Pattern to reject:** mixing publish state into the same enum as approval — Postiz already owns `Post.state`.

---

## What BrightBean does *not* give us

| Concept | Status in BrightBean |
|---|---|
| PED / editorial plan entity | Absent (Idea kanban + categories only) |
| Strategy module | Absent |
| Agency “work performed” log | Absent (approval/publish logs only) |
| Client deliverables library beyond media | Absent |
| Monthly report builder | Spec only; portal placeholder |
| Full white-label | Partial colors/logo |

These are **Neptive differentiators**, not ports.

---

## Onboarding ConnectionLink

Shareable link so a client can connect social accounts without portal approval (`apps/onboarding/models.py`). Postiz does not have this. **Do not rebuild OAuth** — if we add connect-links later, they must wrap Postiz social OAuth with a customer-scoped state. Out of first vertical slice; document as follow-up.

---

## Tests worth mirroring (conceptually)

- Magic link peek vs consume (`apps/client_portal/tests.py`)
- Approval two-stage + portal queue (`apps/approvals/test_workflow.py`)
- Cross-workspace IDOR (`apps/approvals/test_security.py`, media, API keys)

Neptive isolation tests must prove Client A cannot read/mutate Client B by ID.
