# Neptive Monthly Editorial Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Neptive PED a real monthly client-facing editorial calendar backed by native Postiz post groups, including exact media previews, carousels, videos, captions, schedules, and approvals.

**Architecture:** Keep `NeptiveEditorialPlanItem.postGroup` as the only PED-to-Postiz content link. Add a server-side projection in `PostizAdapter`/Neptive services that validates customer ownership and resolves Postiz content, ordered `Post.image` media, integration, schedule, and state into a client-safe DTO. Build shared calendar/list/detail media components used by both agency and portal pages; the native Postiz composer remains the authoring surface.

**Tech Stack:** NestJS, Prisma, Next.js/React, SWR, existing Postiz media and composer components, Jest, Browser skill.

**Spec:** `docs/superpowers/specs/2026-09-02-neptive-monthly-editorial-calendar-design.md`

## Global Constraints

- Work only in `/home/lorenzo/Work/postiz-app/.worktrees/neptive` on branch `neptive`.
- Push only `origin` at `git@github.com:lawrencebennet/postiz-app.git`; never push upstream or `main`.
- Postiz remains source of truth for media, media ordering, caption, schedule, channel, and publishing state.
- Do not duplicate Postiz media or scheduling fields in Neptive tables.
- Do not fork or replace the Postiz composer, uploader, Instagram provider, scheduler, or Temporal publishing workflow.
- Client authorization derives from the signed portal session and is enforced server-side.
- No email/Resend integration in this objective.
- Use Italian client-facing labels where appropriate and keep agency-only notes out of client responses.

---

### Task 1: Lock the Postiz projection contract with tests

**Files:** Create `libraries/nestjs-libraries/src/neptive/domain/content-projection.ts` and its focused spec.

- [ ] Write failing tests for ordered media parsing, `POST`/`CAROUSEL`/`REEL`/`STORY`/`VIDEO` classification, multi-platform roots, malformed media JSON, and client-safe comments.
- [ ] Run the focused test and confirm it fails for the missing projection behavior.
- [ ] Implement minimal pure projection helpers using the native `Media` shape and exact Postiz media order; do not change Postiz data.
- [ ] Run the focused test and confirm green.
- [ ] Commit: `test: define Neptive Postiz content projection`.

### Task 2: Add customer-scoped Postiz group projection API

**Files:** `postiz.adapter.ts`, `ped.service.ts`, `approval.service.ts`, both Neptive controllers, repository only where link validation/query support is needed, and focused service tests.

- [ ] Write failing tests for valid same-customer groups, cross-customer groups, missing/stale links, and portal customer resolution from session only.
- [ ] Implement adapter methods that load all native Postiz posts in a group, preserve roots/children and media order, and return client-safe projection metadata.
- [ ] Expose resolved PED item content for agency and portal routes; keep existing routes backward-compatible where practical.
- [ ] Filter portal comments to `CLIENT_VISIBLE` and reject cross-customer group access server-side.
- [ ] Run focused and existing Neptive isolation tests.
- [ ] Commit: `feat: project Postiz content into Neptive PED`.

### Task 3: Build shared calendar, list, and media detail components

**Files:** Create `ped-calendar.tsx`, `ped-content-card.tsx`, `ped-content-detail.tsx`; modify `neptive.ui.tsx` only for shared labels/status helpers.

- [ ] Add pure helper tests for month grouping, summaries, and content-type labels.
- [ ] Implement a responsive monthly calendar plus chronological mobile fallback using projected dates and states only.
- [ ] Implement shared detail rendering for caption, channel, schedule, publication state, approval state, first comment, and safe metadata.
- [ ] Implement exact-order carousel navigation with numbered slides and thumbnails; use `<video controls preload="metadata">` with poster and no sound autoplay.
- [ ] Run frontend type-check/build for the touched components.
- [ ] Commit: `feat: add responsive PED content previews`.

### Task 4: Upgrade the agency PED workflow

**Files:** `agency.client.tsx`, `neptive.hooks.ts`, and the agency PED page wrapper only if data wiring requires it.

- [ ] Write failing tests for linking an existing customer-owned Postiz group, duplicate links, stale groups, and cross-customer groups.
- [ ] Add `+ Add content` to select an existing Postiz draft/scheduled group or open the native Postiz composer/calendar in context; never duplicate caption/media/date fields.
- [ ] Render the linked monthly calendar, chronological list, detail view, counts, item approval state, and change-request feedback.
- [ ] Keep PED transitions and add `Send PED to client` without publishing content.
- [ ] Verify `/agency/<customerId>/ped` in the browser.
- [ ] Commit: `feat: make agency PED a monthly content calendar`.

### Task 5: Upgrade the client portal review experience

**Files:** `portal.tsx`, `neptive.hooks.ts`, and portal page wrappers under `apps/frontend/src/app/(app)/(portal)/portal/`.

- [ ] Write failing tests for hidden internal notes, visible comments, individual approve/request-change actions, PED approval, and cross-client rejection.
- [ ] Add Italian PED header, month/date range, review status, objectives, type counts, and responsive calendar/list fallback.
- [ ] Add client content cards and detail review with date/time, platform, type, title, caption, slide count, exact carousel order, and playable video.
- [ ] Add `Approva contenuto`, `Richiedi modifica` with required feedback, and overall PED approval.
- [ ] Verify desktop and narrow/mobile browser layouts with Casa Pandora.
- [ ] Commit: `feat: add client-facing PED review portal`.

### Task 6: Create the Casa Pandora September demo

**Files:** Add an idempotent local fixture script under `neptive/scripts/`, update `neptive/PROVA_CASA_PANDORA.md`, and keep generated/local assets ignored.

- [ ] Write fixture assertions for single image, five-plus ordered carousel, Reel/video, second carousel, and Story/multi-story content with September 2026 dates and neutral Italian captions.
- [ ] Implement fixture creation through existing Postiz APIs/services without resets/deletes and without adding Postiz fields to PED tables.
- [ ] Verify projection in agency and portal and document the native Postiz authoring flow and public HTTPS media requirement for real Instagram publishing.
- [ ] Commit: `docs: document September PED demo`.

### Task 7: Full verification and branch-only push

- [ ] Run `mise exec node@22.12.0 pnpm@10.6.1 -- pnpm exec jest --config neptive/jest.config.ts --runInBand`.
- [ ] Run `mise exec node@22.12.0 pnpm@10.6.1 -- pnpm run build`.
- [ ] Verify services, agency and portal browser journeys, carousel order, video playback, captions, approvals, request changes, isolation, desktop, and mobile.
- [ ] Run `git diff --check`; verify no `.env`, node_modules, generated files, or raw tokens are staged.
- [ ] Commit integrated changes.
- [ ] Verify `git remote -v` and push only with `git push origin neptive`; never push upstream, `main`, or any other branch.
