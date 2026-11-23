# Approval → scheduling (the client's "Approva" schedules the post)

Since `neptive-next` 2026-11-23. Code: `libraries/nestjs-libraries/src/neptive/services/publish-scheduler.service.ts`
(rules), `adapters/postiz.adapter.ts` (bridge to Postiz/Temporal), `domain/publish-date.ts` (date rule). No schema
change, no upstream file touched.

## What happens

| event | effect |
|---|---|
| Client or agency approves a **variant** (slot confirmed) | after the confirmation transaction: every non-deleted **root** post (`parentPostId` null) of that variant's group that is `DRAFT` → `PostsService.changePostStatus(…, 'schedule')` = `QUEUE` + `postWorkflowV112` (`post_<id>`, `TERMINATE_EXISTING`). Other variants untouched. |
| Approval of a **single-content PED item** (item.postGroup, no variant rows) | same. The publish gate ignores groups never attached as variants, so it does not block them. |
| Approval of a group that is on **no live PED item** and is no variant | unchanged: nothing scheduled (the agency schedules it). |
| Planned date already passed | moved (`PostsService.changeDate(…, 'update')`) to the next occurrence of the same Europe/Rome wall-clock time (`nextPublishDate`, DST aware), then scheduled. Written in the client activity. |
| Agency **reopens** the slot | posts of the previously confirmed group still `QUEUE` → `changePostStatus(…, 'draft')`, then `post_<id>` terminated by id. `PUBLISHED` / `ERROR` untouched. |
| Posts already `QUEUE` / `PUBLISHED` / `ERROR` at approval | untouched (only `DRAFT` roots are scheduled). Comments (child posts) are published by their root's workflow. |

Activities: success → `POST_SCHEDULED`, `CLIENT_VISIBLE`, "Programmato: <slot>" with one line per channel (and the old
date when it was moved). Failure → `OTHER`, `INTERNAL`, "Approvato ma non programmato: <slot>" (reason, moved dates,
"ATTENZIONE …" if the rollback itself could not be confirmed). Reopen that could not stop a workflow → `OTHER`,
`INTERNAL`, "Riaperto ma ancora programmato: <slot>".

Portal: the confirmation banner adds "Verrà pubblicato il <giorno mese> alle <hh:mm>." (earliest `QUEUE` channel,
Europe/Rome) once the posts are queued; nothing when they are still `DRAFT`.

## Fail closed

`PostsService.startWorkflow` swallows every Temporal error and `changePostStatus` writes `QUEUE` before starting the
workflow, so "no exception" does not mean "scheduled". The scheduler therefore:

1. re-reads the variant at scheduling time: only the live, confirmed variant of a live slot of the same customer
   (`variantMayPublish`, the publish gate's rule); every post of the group must belong to the customer;
2. checks that Temporal answers (`getSystemInfo`, 8 s timeout) **before** touching any post;
3. after scheduling, checks that `post_<id>` is `RUNNING` for every post (describe, 8 s timeout);
4. on any doubt puts **every** post it queued back to `DRAFT` (+ terminate by id) and writes the agency activity.
   All-or-nothing per group: Instagram never goes out without its Facebook twin because of this code.

The approval is committed before any of this and is never undone; the scheduler never throws (an audit-write failure
after the commit does not skip the scheduling either). Idempotent: a second approval is refused by the approval state
machine / slot transaction before scheduling; a repeated scheduling call finds no `DRAFT` root and does nothing; one
workflow per post (`post_<id>`, `TERMINATE_EXISTING`), checked live with `count WorkflowId="post_<id>" AND Running` = 1.

## Upstream behaviour this relies on / works around (re-check after each Postiz merge)

- `changePostStatus(org, id, 'schedule'|'draft')`, `changeDate(org, id, iso, 'update')`, workflow id `post_<id>` and
  type `postWorkflowV112` in `startWorkflow`.
- `startWorkflow` / `deletePost` find the workflows to terminate with the visibility query `postId="<id>"`. It is
  eventually consistent (a workflow started a second ago is not listed: `changePostStatus(…, 'draft')` right after a
  schedule did **not** terminate it in the local check) and `postId` is a **TEXT** search attribute, so the query is a
  full-text match: any shared hyphen token terminates the other post's workflow (verified locally:
  `postId="ffffffff-1111-2222-8000-444444444444"` lists every `…-8000-…` post). Neptive terminates `post_<id>` by id on
  unschedule and verifies `RUNNING` after scheduling; it cannot protect *other* posts from this upstream query.

## Checks

```
pnpm exec jest --config neptive/jest.config.ts --runInBand      # unit (scheduler, adapter, approval, variant, date)
node neptive/dev/schedule-check.mjs                              # LOCAL e2e: real backend + local Temporal, no orchestrator
```

`schedule-check.mjs` re-seeds the Aurora variants demo, adds a temporary local Facebook channel, and checks: variant B
approved → only B (IG + FB) `QUEUE` with `RUNNING` workflows, A/C/D/E `DRAFT`; second approval refused, still one
workflow per post; real workflow v1.1.2 + real gate with fake provider (`gate-check.sh`) lets B through; reopen →
`DRAFT` + workflows terminated; passed date → next 10:00 Rome; **Temporal stopped** → approval accepted, posts `DRAFT`,
confirmation kept, agency activity; single-content item → scheduled and unscheduled. It removes what it added.
