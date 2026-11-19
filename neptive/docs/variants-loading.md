# Loading post variants (A, B, C…) with SQL

For agents that load PED content straight into the database. The UI equivalent is
Agency → customer → PED → open a content → “Aggiungi un post esistente come nuova variante”.

## Model in one paragraph

A PED item (`neptive_editorial_plan_items`, one row = one date/slot) holds 1..N variants
(`neptive_plan_item_variants`, one row per alternative). Each variant points at one whole Postiz post
group (`Post.group`: media, caption, channel, date). The client's decision on each variant lives in the
existing `neptive_content_approvals` row for that group (unique per `orgId` + `postGroup`). When the client
approves a variant, `neptive_editorial_plan_items.confirmedVariantId` is set to that variant's id; the
other variants become read-only ("non scelta").

An item **without** variant rows is a legacy single-post slot: it uses `neptive_editorial_plan_items.postGroup`
exactly as before and nothing below applies to it.

## Publishing rule you must know before loading

A post group that has a row in `neptive_plan_item_variants` (even a removed one, `removedAt` set) is
**never published** by Postiz unless it is the confirmed variant of a live item. The orchestrator refuses
the publish and marks the post `ERROR` with a "Neptive: not published…" message. So:

- you may load variant posts as `QUEUE` (scheduled) or `DRAFT`: nothing goes out before the client chooses;
- after the client confirms, the confirmed post publishes at its date **only if it is `QUEUE`**. Approval does
  not schedule anything (same as for single posts). If the date passed while the slot was undecided, the post
  is in `ERROR`: reschedule it in Postiz;
- never delete variant rows to "free" a post: insert a new post group instead. Rows are soft-removed
  (`removedAt`) and keep blocking on purpose.

## Rows to insert (N variants for one item)

Prerequisites: the posts exist in `"Post"` (one `group` per variant, on integrations of the same customer),
and the plan exists. Values to fill: `:org`, `:customer`, `:item` (existing or new item id), the groups.

```sql
begin;

-- 0. only for a NEW slot (skip if the item exists). Leave postGroup NULL: a slot with variant rows ignores it.
insert into neptive_editorial_plan_items(id, "planId", "postGroup", title, notes, position, "createdAt", "updatedAt")
values (:item, :plan, null, 'Reel — New Life: quale montaggio?', null, 8, now(), now());

-- 0b. only when turning an EXISTING single-post item into a variant slot: its current post becomes variant A
--     (labels must stay unique inside the item, so start the new ones at B).
-- insert into neptive_plan_item_variants(id, "orgId", "customerId", "itemId", "postGroup", label, position, "createdAt", "updatedAt")
-- select gen_random_uuid()::text, :org, :customer, i.id, i."postGroup", 'A', 0, now(), now()
-- from neptive_editorial_plan_items i where i.id = :item and i."postGroup" is not null;

-- 1. one row per variant. label = what the client sees on the switcher; position = order (0, 1, 2…)
insert into neptive_plan_item_variants(id, "orgId", "customerId", "itemId", "postGroup", label, position, "createdAt", "updatedAt") values
(gen_random_uuid()::text, :org, :customer, :item, '<group A>', 'A', 0, now(), now()),
(gen_random_uuid()::text, :org, :customer, :item, '<group B>', 'B', 1, now(), now()),
(gen_random_uuid()::text, :org, :customer, :item, '<group C>', 'C', 2, now(), now());

-- 2. one approval per variant, already in front of the client (status PENDING_CLIENT_APPROVAL).
--    Without it the client sees the variant as "In preparazione" and cannot act on it.
insert into neptive_content_approvals(id, "orgId", "customerId", "postGroup", status, title, "submittedAt", "createdAt", "updatedAt")
select gen_random_uuid()::text, v."orgId", v."customerId", v."postGroup", 'PENDING_CLIENT_APPROVAL',
       i.title || ' · ' || v.label, now(), now(), now()
from neptive_plan_item_variants v join neptive_editorial_plan_items i on i.id = v."itemId"
where v."itemId" = :item and v."removedAt" is null
on conflict ("orgId", "postGroup") do nothing;

-- 3. (optional) a history row per approval, shown in the agency decision log
insert into neptive_approval_actions(id, "approvalId", "actorType", action, comment, "createdAt")
select gen_random_uuid()::text, a.id, 'SYSTEM', 'SUBMITTED', 'Variante ' || v.label || ' proposta al cliente', now()
from neptive_content_approvals a
join neptive_plan_item_variants v on v."orgId" = a."orgId" and v."postGroup" = a."postGroup"
where v."itemId" = :item
  and not exists (select 1 from neptive_approval_actions x where x."approvalId" = a.id);

commit;
```

Constraints the database enforces: `("orgId", "postGroup")` is unique in `neptive_plan_item_variants`
(a post group can be a variant of one item only, ever); `itemId` must reference an existing item.
Constraints the services enforce and SQL loaders must respect: same `customerId` as the plan; labels unique
among live variants of the item (max 12 chars); do not also put a variant's group in another item's
`postGroup`; do not set `confirmedVariantId` by hand (the client's approval sets it together with the
approval status in one transaction).

A worked, runnable example is `neptive/dev/seed-variants.sql` (local demo, Aurora Gallorini).

## Read back

```sql
select i.title, v.label, v.position, v."postGroup",
       v."removedAt" is not null                    as removed,
       a.status                                     as approval,
       coalesce(i."confirmedVariantId" = v.id, false) as confirmed,
       p.state                                      as post_state,
       p."publishDate"
from neptive_plan_item_variants v
join neptive_editorial_plan_items i on i.id = v."itemId"
left join neptive_content_approvals a
       on a."orgId" = v."orgId" and a."postGroup" = v."postGroup" and a."deletedAt" is null
left join "Post" p
       on p."group" = v."postGroup" and p."deletedAt" is null and p."parentPostId" is null
where v."itemId" = :item
order by v.position;
```

Every variant of a loaded slot should show `approval = PENDING_CLIENT_APPROVAL`, `confirmed = false`,
`removed = false`, and one post row per channel of the group.

## Undo a load (before the client acted)

Soft-remove instead of deleting, so the posts stay blocked from publishing:

```sql
update neptive_plan_item_variants set "removedAt" = now() where "itemId" = :item and "removedAt" is null;
update neptive_editorial_plan_items set "deletedAt" = now() where id = :item;   -- if the item itself goes
```
