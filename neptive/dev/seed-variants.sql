-- LOCAL DEMO ONLY: one Aurora Gallorini PED slot with four post variants (A-D),
-- plus one extra unattached post (E) the agency can attach from the UI.
-- Run through neptive/dev/seed-variants.sh (refuses anything but the local pzn-postgres).
-- Statements 3-5 are the same ones documented in neptive/docs/variants-loading.md.
\set ON_ERROR_STOP on
\set org      '''d6d585e7-d225-4225-9f96-d8b595c53d72'''
\set customer '''7233ce6e-bd06-46cd-9d5e-cc53d19cdeec'''
\set integ    '''abdd89db-9823-4d67-ae5b-2b1f95df6135'''
\set plan     '''8565dcbd-66c9-45ab-806f-7d6e971a9393'''
\set item     '''5eed0000-0000-4000-8000-000000000001'''
\set when     '''2026-12-09 17:30:00'''

begin;

-- reset previous runs of this seed (fixed ids only)
delete from neptive_approval_comments where "approvalId" in (select id from neptive_content_approvals where "postGroup" like '5eed6000-%');
delete from neptive_approval_actions  where "approvalId" in (select id from neptive_content_approvals where "postGroup" like '5eed6000-%');
delete from neptive_content_approvals where "postGroup" like '5eed6000-%';
delete from neptive_activities where "relatedPostGroup" like '5eed6000-%';
delete from neptive_plan_item_variants where "postGroup" like '5eed6000-%';
delete from neptive_editorial_plan_items where id = :item;
delete from "Post" where id like '5eed1000-%';

-- 1. the Postiz posts, one group per variant (normally loaded by the usual content loader)
insert into "Post"(id, state, "publishDate", "organizationId", "integrationId", content, "group", title, settings, image, "createdAt", "updatedAt") values
('5eed1000-0000-4000-8000-00000000000a', 'QUEUE', :when, :org, :integ,
 '[{"content": "Una stanza, una finestra, la luce che cambia. ✨\n\nNew Life\nVideo: Stefano Bennati – Stereosound MusicStage\n\n#singerlife #performer #newlife #videoclip", "id": ""}]',
 '5eed6000-0000-4000-8000-00000000000a', 'New Life — montaggio 1',
 '{"__type": "instagram", "post_type": "post", "collaborators": []}',
 '[{"id": "17afad33-69cd-49b3-a238-9d86eb1c6e66", "path": "https://portal.neptive.com/uploads/aurora_ped2026_07_reel-newlife_BOZZA.mp4", "alt": "Video verticale in bianco e nero seppia: una donna in abito bianco in una villa d''epoca.", "thumbnail": "https://portal.neptive.com/uploads/aurora_ped2026_07_reel-newlife_copertina.jpg"}]',
 now(), now()),
('5eed1000-0000-4000-8000-00000000000b', 'QUEUE', :when, :org, :integ,
 '[{"content": "Ci sono stanze che ricordano tutto.\nQuesta ricorda una canzone. ✨\n\nNew Life — fuori ora.\n\n#newlife #singer #musicvideo", "id": ""}]',
 '5eed6000-0000-4000-8000-00000000000b', 'New Life — montaggio 1, caption breve',
 '{"__type": "instagram", "post_type": "post", "collaborators": []}',
 '[{"id": "17afad33-69cd-49b3-a238-9d86eb1c6e66", "path": "https://portal.neptive.com/uploads/aurora_ped2026_07_reel-newlife_BOZZA.mp4", "alt": "Video verticale in bianco e nero seppia: una donna in abito bianco in una villa d''epoca.", "thumbnail": "https://portal.neptive.com/uploads/aurora_ped2026_07_reel-newlife_copertina.jpg"}]',
 now(), now()),
('5eed1000-0000-4000-8000-00000000000c', 'QUEUE', :when, :org, :integ,
 '[{"content": "Dal set di New Life: luce naturale, una voce, nessun filtro. 🎬\n\nTi è piaciuto questo montaggio? Dimmelo nei commenti.\n\n#newlife #backstage #performer", "id": ""}]',
 '5eed6000-0000-4000-8000-00000000000c', 'New Life — montaggio 2 (dal set)',
 '{"__type": "instagram", "post_type": "post", "collaborators": []}',
 '[{"id": "260bcd3a-f83c-4f73-933e-32126b4ab377", "path": "https://portal.neptive.com/uploads/aurora_ped2026_06_storie-newlife-dal-set_1.mp4", "alt": "Video verticale dal set del videoclip New Life.", "thumbnail": "https://portal.neptive.com/uploads/aurora_ped2026_06_storie-newlife-dal-set_2.jpg"}]',
 now(), now()),
('5eed1000-0000-4000-8000-00000000000d', 'QUEUE', :when, :org, :integ,
 '[{"content": "Dietro le quinte di New Life, in cinque scatti. 📸\nScorri fino all''ultimo.\n\n#newlife #dietrolequinte #singerlife", "id": ""}]',
 '5eed6000-0000-4000-8000-00000000000d', 'New Life — carosello dietro le quinte',
 '{"__type": "instagram", "post_type": "post", "collaborators": []}',
 '[{"id": "b18af829-6baa-4814-b6fc-5997f7e86749", "path": "https://portal.neptive.com/uploads/aurora_ped2026_05_newlife-dietro-le-quinte_1.jpg"},
   {"id": "4274caee-4a40-4d50-8503-97fcb818c76c", "path": "https://portal.neptive.com/uploads/aurora_ped2026_05_newlife-dietro-le-quinte_2.jpg"},
   {"id": "875f8ea1-da36-4e07-b790-35f1e5767179", "path": "https://portal.neptive.com/uploads/aurora_ped2026_05_newlife-dietro-le-quinte_3.jpg"},
   {"id": "4ecbfd81-ca2a-45eb-85de-ae38ad1d9db7", "path": "https://portal.neptive.com/uploads/aurora_ped2026_05_newlife-dietro-le-quinte_4.jpg"},
   {"id": "b7f4e355-29c7-4251-9b95-a67788400165", "path": "https://portal.neptive.com/uploads/aurora_ped2026_05_newlife-dietro-le-quinte_5.jpg"}]',
 now(), now()),
-- E: not attached; the agency attaches it from /agency/<customer>/ped during the demo
('5eed1000-0000-4000-8000-00000000000e', 'DRAFT', :when, :org, :integ,
 '[{"content": "Una finestra, un respiro, poi la musica. ✨\n\n#newlife", "id": ""}]',
 '5eed6000-0000-4000-8000-00000000000e', 'New Life — foto singola',
 '{"__type": "instagram", "post_type": "post", "collaborators": []}',
 '[{"id": "875f8ea1-da36-4e07-b790-35f1e5767179", "path": "https://portal.neptive.com/uploads/aurora_ped2026_05_newlife-dietro-le-quinte_3.jpg"}]',
 now(), now());

-- 2. the plan item (slot). postGroup stays NULL: a slot with variant rows ignores it.
insert into neptive_editorial_plan_items(id, "planId", "postGroup", title, notes, position, "createdAt", "updatedAt")
values (:item, :plan, null, 'Reel — New Life: quale montaggio?', 'Demo varianti (seed locale)', 8, now(), now());

-- 3. one variant row per post group, labels in order
insert into neptive_plan_item_variants(id, "orgId", "customerId", "itemId", "postGroup", label, position, "createdAt", "updatedAt") values
(gen_random_uuid()::text, :org, :customer, :item, '5eed6000-0000-4000-8000-00000000000a', 'A', 0, now(), now()),
(gen_random_uuid()::text, :org, :customer, :item, '5eed6000-0000-4000-8000-00000000000b', 'B', 1, now(), now()),
(gen_random_uuid()::text, :org, :customer, :item, '5eed6000-0000-4000-8000-00000000000c', 'C', 2, now(), now()),
(gen_random_uuid()::text, :org, :customer, :item, '5eed6000-0000-4000-8000-00000000000d', 'D', 3, now(), now());

-- 4. one approval per variant, already in front of the client
insert into neptive_content_approvals(id, "orgId", "customerId", "postGroup", status, title, "submittedAt", "createdAt", "updatedAt")
select gen_random_uuid()::text, v."orgId", v."customerId", v."postGroup", 'PENDING_CLIENT_APPROVAL',
       i.title || ' · ' || v.label, now(), now(), now()
from neptive_plan_item_variants v join neptive_editorial_plan_items i on i.id = v."itemId"
where v."itemId" = :item and v."removedAt" is null
on conflict ("orgId", "postGroup") do nothing;

-- 5. history row so the approval timeline shows who proposed it
insert into neptive_approval_actions(id, "approvalId", "actorType", action, comment, "createdAt")
select gen_random_uuid()::text, a.id, 'SYSTEM', 'SUBMITTED', 'Variante ' || v.label || ' proposta al cliente', now()
from neptive_content_approvals a
join neptive_plan_item_variants v on v."orgId" = a."orgId" and v."postGroup" = a."postGroup"
where v."itemId" = :item
  and not exists (select 1 from neptive_approval_actions x where x."approvalId" = a.id);

-- demo only: Aurora has no preview identity configured, so the mockups would fall back to the
-- hard-coded default (a Casa Pandora handle). Same value the agency sets in Agency → Overview.
update neptive_client_profiles
   set branding = jsonb_set(coalesce(branding::jsonb, '{}'::jsonb), '{previewIdentity}',
                            '{"instagramName": "auroragallorini", "facebookName": "Aurora Gallorini"}'::jsonb)
 where "customerId" = :customer;

commit;

-- read back (same query as in the doc)
select i.title, v.label, v.position, v."postGroup", v."removedAt" is not null as removed,
       a.status as approval, coalesce(i."confirmedVariantId" = v.id, false) as confirmed,
       p.state as post_state, p."publishDate"
from neptive_plan_item_variants v
join neptive_editorial_plan_items i on i.id = v."itemId"
left join neptive_content_approvals a on a."orgId" = v."orgId" and a."postGroup" = v."postGroup" and a."deletedAt" is null
left join "Post" p on p."group" = v."postGroup" and p."deletedAt" is null and p."parentPostId" is null
where v."itemId" = :item
order by v.position;
