# Neptive Platform Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Instagram and Facebook previews over native Postiz content for agency and client PED review.

**Architecture:** Keep Postiz as source of truth and add a normalized frontend preview layer. Persist only preview identity settings in `NeptiveClientProfile.branding.previewIdentity`; render platform-specific feed/detail cards inside the existing PED detail flow.

**Tech Stack:** NestJS, Prisma, Next.js/React, SWR, Tailwind utility classes, Jest, `embla-carousel-react` for drag/swipe.

**Spec:** `docs/superpowers/specs/2026-09-02-neptive-platform-previews-design.md`

## Global Constraints

- Work only in `/home/lorenzo/Work/postiz-app/.worktrees/neptive` on branch `neptive`.
- Never push to upstream or main; if pushing, use only `origin neptive`.
- Do not duplicate or mutate Postiz media, captions, ordering, schedule, network, or publishing state.
- Do not hardcode Casa Pandora-specific rendering logic.
- Keep agency-only notes out of portal preview responses.
- Run focused tests, all Neptive tests, build, and browser checks before claiming completion.

---

### Task 1: Preview contracts and identity normalization

**Files:**
- Create: `libraries/nestjs-libraries/src/neptive/domain/preview-identity.ts`
- Test: `libraries/nestjs-libraries/src/neptive/domain/preview-identity.spec.ts`
- Create: `apps/frontend/src/components/neptive/preview/preview-model.ts`
- Test: `apps/frontend/src/components/neptive/preview/preview-model.spec.ts`
- Modify: `libraries/nestjs-libraries/src/neptive/domain/content-projection.ts`
- Test: `libraries/nestjs-libraries/src/neptive/domain/content-projection.spec.ts`

**Interfaces:**
- `normalizePreviewIdentity(value, fallback)` returns `{ instagram: { name, image }, facebook: { name, image } }`.
- `normalizePreviewContent(content, identity, platform)` returns the selected platform preview model with ordered media, caption, schedule, state, and content type.
- `swipeDirection(deltaX, threshold)` returns `-1`, `0`, or `1` for previous/no-op/next.

- [ ] Write failing tests for sanitized defaults, configured identity, exact media order, platform selection, and swipe threshold.
- [ ] Run `pnpm exec jest --config ./neptive/jest.config.ts --runInBand` and confirm the new tests fail for missing exports/behavior.
- [ ] Implement the pure contracts and expose Postiz integration profile picture in the projection where available.
- [ ] Run the focused tests and then all Neptive tests; confirm green.
- [ ] Commit `feat: add normalized platform preview contracts`.

### Task 2: Persist and expose customer preview identities

**Files:**
- Modify: `libraries/nestjs-libraries/src/neptive/dto/neptive.dto.ts`
- Modify: `libraries/nestjs-libraries/src/neptive/repositories/neptive.repository.ts`
- Modify: `libraries/nestjs-libraries/src/neptive/services/client.service.ts`
- Modify: `apps/backend/src/neptive/agency.controller.ts`
- Modify: `apps/backend/src/neptive/portal.controller.ts`
- Modify: `apps/frontend/src/components/neptive/neptive.hooks.tsx`
- Test: `libraries/nestjs-libraries/src/neptive/services/client-preview-identity.spec.ts`

**Interfaces:**
- `PUT /neptive/agency/clients/:customerId/preview-identity` accepts four optional strings: `instagramName`, `instagramImage`, `facebookName`, `facebookImage`.
- `GET /neptive/portal/preview-identity` returns only the current portal customer’s normalized identity.
- Agency client payload includes normalized `previewIdentity`.

- [ ] Write failing service tests for merge-with-existing-branding, safe defaults, and customer-scoped access.
- [ ] Run the focused test and confirm failure before implementation.
- [ ] Implement DTO validation, JSON merge persistence, agency endpoint, and portal endpoint.
- [ ] Run focused and all Neptive tests.
- [ ] Commit `feat: persist customer platform preview identity`.

### Task 3: Build shared carousel and platform preview renderers

**Files:**
- Create: `apps/frontend/src/components/neptive/preview/profile-header.tsx`
- Create: `apps/frontend/src/components/neptive/preview/preview-media-carousel.tsx`
- Create: `apps/frontend/src/components/neptive/preview/connected-carousel-strip.tsx`
- Create: `apps/frontend/src/components/neptive/preview/instagram-preview-card.tsx`
- Create: `apps/frontend/src/components/neptive/preview/facebook-preview-card.tsx`
- Create: `apps/frontend/src/components/neptive/preview/facebook-preview-detail.tsx`
- Create: `apps/frontend/src/components/neptive/preview/platform-preview-switcher.tsx`
- Modify: `apps/frontend/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- `PreviewMediaCarousel` accepts ordered media, aspect treatment, platform label, and `onIndexChange`; it renders image/video, arrows, dots, and drag/swipe.
- `InstagramPreviewCard` renders feed header, media, dots, caption, schedule, and connected strip.
- `FacebookPreviewCard` renders page feed caption above media and invokes `onOpenDetail`.
- `FacebookPreviewDetail` renders the expanded gallery/video review.

- [ ] Add the smallest compatible carousel dependency with PNPM if not already available.
- [ ] Write failing pure/component tests for media order, dots/index, video controls, and connected strip count.
- [ ] Run focused tests and confirm failure.
- [ ] Implement renderer components using direct imports and stable callbacks; avoid global listeners and autoplay with sound.
- [ ] Run frontend typecheck/build and focused tests.
- [ ] Commit `feat: add Instagram and Facebook preview renderers`.

### Task 4: Wire previews and settings into agency/client PED flows

**Files:**
- Modify: `apps/frontend/src/components/neptive/ped-content-detail.tsx`
- Modify: `apps/frontend/src/components/neptive/agency.client.tsx`
- Modify: `apps/frontend/src/components/neptive/portal.tsx`
- Modify: `neptive/PROVA_CASA_PANDORA.md`

**Interfaces:**
- Existing `PedContentDetail` gets a platform switcher and uses the normalized preview model.
- Agency Overview gets an editable “Identità anteprime” form and saves the four identity values.
- Portal loads the customer-scoped identity and presents client-safe Instagram/Facebook previews.

- [ ] Write failing frontend tests or deterministic model tests for switch default, Facebook detail opening, and identity form payload.
- [ ] Run focused tests and confirm failure.
- [ ] Integrate renderer without changing approval/scheduling calls.
- [ ] Add Italian labels, empty states, and mobile layout fallback.
- [ ] Run frontend build and all Neptive tests.
- [ ] Commit `feat: integrate platform previews into PED review`.

### Task 5: Casa Pandora fixture, browser qualification, and delivery

**Files:**
- Modify: `neptive/scripts/casa-pandora-september.mjs`
- Modify: `neptive/PROVA_CASA_PANDORA.md`
- Test: existing Neptive suites plus browser checks.

- [ ] Extend the local fixture with preview identity defaults and ensure existing Giostra carousel groups remain ordered.
- [ ] Run the fixture idempotently and verify both agency and portal API responses are customer-scoped.
- [ ] Verify desktop agency and client PED: Instagram, Facebook, carousel drag/swipe, dots, connected strip, video fallback, and Facebook detail.
- [ ] Verify mobile viewport and no console errors.
- [ ] Run `pnpm exec jest --config ./neptive/jest.config.ts --runInBand`.
- [ ] Run `pnpm run build`.
- [ ] Run `git diff --check`, verify `git remote -v`, commit any remaining changes, and push only `git push origin neptive`.
