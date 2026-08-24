# Neptive Feature Matrix

Evidence-based. Paths are from the local trees at audit time.

| Feature | Postiz current state | BrightBean current state | Desired Neptive state | Decision | Implementation location | Reason | Risk |
|---|---|---|---|---|---|---|---|
| Customer / client grouping | `Customer` + `Integration.customerId`. Lazy create. Calendar filter. Public `GET /groups`. Files: `schema.prisma`, `integration.repository.ts`, `customer.modal.tsx` | Workspace = client brand | Customer **is** the Client; profile metadata alongside | **EXTENDED IN POSTIZ mapping** | Neptive profile 1:1 with `Customer`; adapter creates Customer | Avoid parallel Client entity | Low if we never fork Customer columns |
| Client authentication | Org JWT only; team invite = full membership | Magic link 30d + portal session | Independent portal identity + magic link | **IMPLEMENTED IN NEPTIVE** | `NeptiveClientUser`, magic tokens, `neptive_portal` cookie | Org membership is not a safe client role | Medium: two auth cookies |
| Client-specific authorization | None. CASL is subscription + ADMIN | Workspace membership + permission map; portal bound to one workspace | Server-side: session/org owns customer; never trust browser `clientId` | **IMPLEMENTED IN NEPTIVE** | Guards + `assertCustomerScope` | UI hiding is not auth | High if any query omits scope |
| Client dashboard | None | Home: pending, published, own actions | Overview of PED, approvals, upcoming, work, results | **IMPLEMENTED IN NEPTIVE** | Portal dashboard composing Neptive + Postiz adapters | Product requirement | Low |
| Client portal | `/p/:id` preview only | Dedicated portal shell | Minimal nav, one company | **IMPLEMENTED IN NEPTIVE** | `(portal)/portal/*` | Preview is not a portal | Medium UX divergence |
| Social account onboarding | Logged-in OAuth; public API connect URL with org key | ConnectionLink + full OAuth providers | Reuse Postiz OAuth; agency assigns channels to Customer | **REUSED FROM POSTIZ** | Existing integrations + customer assign | Do not rebuild providers | Connect-without-login deferred |
| Content calendar | Full calendar + customer filter | Calendar + slots/queues | Reuse Postiz calendar (agency); portal list/upcoming | **REUSED FROM POSTIZ** | Agency deep-link `/launches`; portal uses PostsService list | Do not build a second calendar | Filter is not a security boundary — portal uses adapter |
| PED | Absent | Absent (ideas/categories) | First-class editorial plan | **IMPLEMENTED IN NEPTIVE** | `NeptiveEditorialPlan` | Business object, not a calendar filter | Medium: keep posts’ schedule in Postiz |
| Post preview | `/p/:id` by cuid, no token/expiry | N/A (portal shows posts in-app) | Keep Postiz preview for share; portal shows scoped posts | **REUSED FROM POSTIZ** | Existing `/p/` | Tokenized preview is a later hardening | Cuid leak risk is upstream |
| Post comments | Org-user comments on Post | Internal/external threaded comments | Approval comments in Neptive (visibility); keep Postiz comments for `/p/` | **EXTENDED conceptually** | `NeptiveApprovalComment` | Postiz comments require login and are not visibility-split | Two comment streams — document in UI |
| Approval state | `Post.state` publish only; marketplace `approvedSubmitForOrder` | Mixed editorial+publish enum | Explicit business states; Postiz remains publish SoT | **IMPLEMENTED IN NEPTIVE** | `NeptiveContentApproval` keyed by `Post.group` | Do not dual-write publish state | Race: approve vs schedule — transactional + DRAFT revert |
| Request changes | None | Status + required comment | Same | **IMPLEMENTED IN NEPTIVE** | Approval machine | BrightBean workflow | Must unschedule if QUEUE |
| Rejection | None | Status + comment | Same | **IMPLEMENTED IN NEPTIVE** | Approval machine | | Same |
| Internal approval | None | `pending_review` | `PENDING_INTERNAL_REVIEW` | **IMPLEMENTED IN NEPTIVE** | Approval machine | Two-stage like BrightBean | Low |
| Client approval | None | `pending_client` | `PENDING_CLIENT_APPROVAL` | **IMPLEMENTED IN NEPTIVE** | Portal endpoints | | Low |
| Media | Org library, Uppy/S3 | Org + workspace folders, documents | Reuse Postiz media for social assets; deliverable metadata in Neptive | **REUSED + SMALL NEPTIVE DOMAIN** | MediaService + `NeptiveDeliverable.mediaId` | Do not clone media pipeline | Org media not customer-FK’d — filter by deliverable rows |
| Strategy | Absent | Absent | Extensible entries + visibility | **IMPLEMENTED IN NEPTIVE** | `NeptiveStrategyEntry` | Differentiator | Avoid over-engineering |
| Content pillars | Tags (org) | ContentCategory (workspace) | Strategy kind `PILLAR` | **IMPLEMENTED IN NEPTIVE** | Strategy entries | Tags are not client-scoped pillars | Low |
| Objectives | Absent | Absent | Strategy kind `OBJECTIVE` | **IMPLEMENTED IN NEPTIVE** | Strategy entries | | Low |
| Activities performed | Notifications (org, technical) | Approval/publish logs only | Manual + selected system events, visibility | **IMPLEMENTED IN NEPTIVE** | `NeptiveActivity` | Client must see work | Do not spam low-level events |
| Deliverables / materials | Media only | Media library | Documents + campaign assets as Neptive rows | **IMPLEMENTED IN NEPTIVE** | `NeptiveDeliverable` | Postiz media semantics stay social-oriented | Storage still Postiz |
| Reports | None | Placeholder + spec | Monthly summary from structured data | **IMPLEMENTED IN NEPTIVE** | `NeptiveReport` + generator | No designer v1 | Analytics quality depends on Postiz collectors |
| Analytics | Per integration/post collectors | Snapshots + KPI UI | Aggregate Postiz analytics for customer channels | **REUSED collectors, NEPTIVE aggregation** | Adapter over `IntegrationService.checkAnalytics` | Do not collect twice | Provider gaps are upstream |
| Notifications | Org in-app | Rich event matrix | Reuse org notifications for agency; portal uses activity + dashboard | **REUSED FROM POSTIZ** (agency) | Existing NotificationService optional | Avoid new email infra in v1 | Magic-link email uses EmailService |
| Audit history | Weak | ApprovalAction + PublishLog | Approval actions + activity | **IMPLEMENTED IN NEPTIVE** | `NeptiveApprovalAction` | | Low |
| Branding | None per customer | Workspace colors/logo | Profile `branding` JSON | **IMPLEMENTED IN NEPTIVE** (foundation) | Client profile | No custom domains v1 | Low |
| Magic links | Activate/invite/forgot JWT | 30d portal tokens | Portal magic links | **IMPLEMENTED IN NEPTIVE** | Hash-at-rest tokens | | Token leak |
| Team roles | SUPERADMIN/ADMIN/USER org-wide | Granular workspace RBAC | Agency uses Postiz org roles; clients are Neptive-only | **REUSED FROM POSTIZ** (agency) | AuthMiddleware | Don’t fork CASL | USER can still see all customers in Postiz calendar — known upstream gap |
| API | Strong public API | Django Ninja + API keys | Agency/portal Neptive HTTP; Postiz public API unchanged | **NEPTIVE adapter API** | `/neptive/agency`, `/neptive/portal` | Public API cannot isolate clients | Extra surface |
| Automation | Public API, MCP, Temporal | Agent API / MCP | Unchanged Postiz | **REUSED FROM POSTIZ** | No change | | Low |
| Composer | Excellent | Composer + per-platform overrides | Reuse | **REUSED FROM POSTIZ** | `/launches` | | Low |
| Publishing / Temporal | Versioned workflows | Django background tasks | Reuse Postiz | **REUSED FROM POSTIZ** | PostsService.changePostStatus | Never edit workflow files | High if violated |
| Marketplace agency directory | `SocialMediaAgency` | N/A | Ignore | **IGNORED** | — | Unrelated product | Confusion if mixed |
