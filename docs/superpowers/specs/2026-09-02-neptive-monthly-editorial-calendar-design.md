# Neptive Monthly Editorial Calendar Design

## Goal

Turn the Neptive PED into a client-facing monthly editorial review calendar backed by native Postiz content. An agency user must be able to assemble a monthly plan from existing Postiz post groups, and a client must be able to inspect the exact media order, caption, channel, schedule, and approval state from the portal.

## Scope

- Keep Postiz as the source of truth for post content, media, media order, channel, schedule, and publishing state.
- Reuse the existing Postiz composer, uploader, media URLs, and scheduling services.
- Use the existing `NeptiveEditorialPlanItem.postGroup` as the PED-to-Postiz link; add only editorial metadata required for grouping and display.
- Add a server-side content projection that resolves linked post groups to client-safe content details.
- Add responsive agency and portal calendar/list/detail views.
- Support single images, videos/Reels, Stories, and mixed media carousels when represented by Postiz.
- Preserve the existing two-level approval model: individual content approvals and whole-PED review.
- Add focused regression tests for projection, order, security, and state transitions.

## Non-goals

- No replacement or fork of the Postiz composer, Instagram provider, uploader, scheduler, or Temporal workflows.
- No media duplication in Neptive tables or storage.
- No email delivery or Resend integration.
- No automatic publishing as a result of PED approval.

## Data flow

```text
Postiz Post.group
  ├─ Post.content             -> caption projection
  ├─ Post.image               -> ordered media projection
  ├─ Post.publishDate         -> scheduled date/time
  ├─ Post.integration         -> platform/channel
  ├─ Post.state                -> publishing state
  └─ Post.parentPostId/group  -> carousel/multi-channel grouping

NeptiveEditorialPlan
  └─ NeptiveEditorialPlanItem.postGroup -> native Postiz group
       ├─ editorial title/notes/position
       └─ NeptiveContentApproval        -> review state/comments
```

The projection is resolved on the server after verifying organization and customer ownership. Client responses omit agency-only notes and expose only client-visible comments.

## Projection contract

Each linked PED item resolves to a `content` object containing:

- `postGroup`, `title`, `caption`, `platform`, `channel`, `scheduledAt`;
- `contentType`: `POST`, `CAROUSEL`, `REEL`, `STORY`, or `VIDEO`;
- `media[]` in the exact order stored in the Postiz `Post.image` JSON;
- each media entry's native URL, type, thumbnail, and optional duration metadata;
- Postiz `publishingState` and Neptive `approvalState`;
- client-safe approval comments and the linked approval id.

When a group contains multiple platform roots, the projection keeps each root/channel visible while the PED item remains linked to the one native group. A group without a Postiz post is treated as an invalid/stale link and cannot be exposed to a client.

## Agency experience

The agency PED page gets a month-range calendar and chronological list. It supports selecting an existing customer-owned draft/scheduled Postiz group and linking it to the current PED item. The existing Postiz calendar/composer remains the place where media, caption, channel, and schedule are created or edited; the PED provides a contextual link back to that native workflow.

The detail view uses the same projection and renders all media. A carousel uses stable array order, numbered navigation, thumbnails, and previous/next controls. Videos use a poster when available and native controls without autoplay with sound.

## Client experience

`/portal/ped` shows the current monthly PED with Italian labels, summary counts, calendar/list fallback, and client-safe detail views. The client can inspect exact content and approve/request changes for individual approvals. The PED header can be moved to `CLIENT_REVIEW` by the agency and approved by the client independently of Postiz publication.

## Security

Every projection lookup is scoped by `orgId` and `customerId`. A linked Postiz group is accepted only when every post in the group belongs to the same customer. Client routes derive the customer from the signed portal session and never from a URL parameter. Media URLs are returned only from customer-owned Postiz posts and are not copied into Neptive storage.

## Verification

- Focused tests cover ordered media projection, content-type detection, stale/cross-customer links, client-safe comments, and PED/content approval transitions.
- Existing Neptive isolation tests continue to pass.
- Production build is run after implementation.
- Browser verification covers agency and portal desktop/mobile layouts, carousel order, video controls, caption, approval, change request, and client isolation.
