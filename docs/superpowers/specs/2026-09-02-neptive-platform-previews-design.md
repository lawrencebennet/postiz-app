# Neptive Platform Preview Design

## Goal

Give agency users and clients a high-fidelity, client-safe preview of the same Postiz content that will be reviewed or published, with Instagram and Facebook feed treatments, draggable carousels, and a compact connected-slide strip.

## Decisions

- Postiz remains the source of truth for caption, media, media order, channel, schedule, and publishing state.
- Preview identity is stored in the existing `NeptiveClientProfile.branding` JSON under `previewIdentity`; no new settings subsystem or media table is introduced.
- The existing PED content-detail modal is the entry point for previews in both agency and portal flows.
- A normalized frontend preview model consumes the existing Postiz projection and selected customer identity settings.
- Instagram has a feed card with profile header, dots, swipe/drag carousel, video playback, and connected strip.
- Facebook has a feed card with caption above media and a separate in-modal detail state for gallery/video review.
- Missing identity values use safe defaults derived from the content channel or generic Casa Pandora-neutral labels; no customer is hardcoded.
- A small carousel dependency is acceptable because desktop mouse drag and mobile swipe must be reliable and consistent.

## Data flow

```text
Postiz postGroup/content + customer previewIdentity
        ↓
normalized preview model
        ↓
Instagram feed / Facebook feed
        ↓
carousel interaction + connected strip + review actions
```

The portal receives the identity only through the customer-scoped server path. Internal agency notes are not included in the client response.

## Scope

- editable Instagram name/image and Facebook page name/image in the agency client Overview;
- identity persistence and customer-scoped retrieval;
- platform switcher in the existing PED content detail;
- Instagram feed preview for image, carousel, and video/Reel;
- Facebook feed preview and detailed view for image, gallery/carousel, and video;
- exact Postiz media order, mixed image/video rendering, and connected strip;
- focused unit tests, existing Neptive tests, build and browser verification.

## Out of scope

- publishing to Instagram or Facebook;
- changing Postiz composer, upload, scheduler, provider integrations, or media order;
- fetching live engagement metrics or embedding third-party social iframes;
- uploading profile avatars; the settings form stores a safe URL/path value and can use existing local assets.
