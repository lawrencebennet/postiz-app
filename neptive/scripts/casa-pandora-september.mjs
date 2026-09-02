import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const frontend = process.env.FRONTEND_URL || 'http://localhost:4200';
const demoDir = `${frontend}/neptive-demo`;

const media = (name, type = 'image', thumbnail) => ({
  id: `casa-pandora-${name}`,
  path: `${demoDir}/${name}`,
  type,
  ...(thumbnail ? { thumbnail: `${demoDir}/${thumbnail}` } : {}),
});

const contents = [
  {
    slug: 'single-camera-deluxe',
    title: 'Camera Deluxe — dettaglio',
    date: '2026-09-03T17:00:00.000Z',
    caption: 'Un dettaglio della Camera Deluxe: luce, comfort e la calma di Casa Pandora.',
    media: [media('casa-pandora-slide-01.svg')],
    approval: 'PENDING_CLIENT_APPROVAL',
  },
  {
    slug: 'carousel-esperienza',
    title: 'L’esperienza Casa Pandora',
    date: '2026-09-08T18:30:00.000Z',
    caption: 'Scorri per scoprire l’esperienza Casa Pandora, dall’arrivo al momento del relax.',
    media: [
      media('casa-pandora-slide-01.svg'),
      media('casa-pandora-slide-02.svg'),
      media('casa-pandora-slide-03.svg'),
      media('casa-pandora-slide-04.svg'),
      media('casa-pandora-slide-05.svg'),
    ],
    approval: 'PENDING_CLIENT_APPROVAL',
  },
  {
    slug: 'reel-benvenuto',
    title: 'Reel — Benvenuti a Casa Pandora',
    date: '2026-09-12T17:00:00.000Z',
    caption: 'Tre secondi per entrare nell’atmosfera di Casa Pandora. Ti aspettiamo.',
    media: [media('casa-pandora-reel.mp4', 'video')],
    approval: 'PENDING_CLIENT_APPROVAL',
  },
  {
    slug: 'carousel-prenota',
    title: 'Perché scegliere Casa Pandora',
    date: '2026-09-19T10:00:00.000Z',
    caption: 'Cinque motivi per scegliere Casa Pandora per il tuo prossimo soggiorno.',
    media: [
      media('casa-pandora-slide-05.svg'),
      media('casa-pandora-slide-04.svg'),
      media('casa-pandora-slide-03.svg'),
      media('casa-pandora-slide-02.svg'),
      media('casa-pandora-slide-01.svg'),
    ],
    approval: 'APPROVED',
  },
  {
    slug: 'story-last-minute',
    title: 'Story — disponibilità settembre',
    date: '2026-09-25T08:00:00.000Z',
    caption: 'Ultime disponibilità di settembre: scrivici per prenotare.',
    media: [media('casa-pandora-slide-02.svg')],
    settings: { post_type: 'story' },
    approval: 'PENDING_CLIENT_APPROVAL',
  },
];

async function main() {
  const customer = await prisma.customer.findFirst({
    where: { name: 'Casa Pandora', deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!customer) throw new Error('Casa Pandora customer not found');

  const profile = await prisma.neptiveClientProfile.findUnique({
    where: { customerId: customer.id },
  });
  const existingBranding =
    profile?.branding && typeof profile.branding === 'object' && !Array.isArray(profile.branding)
      ? profile.branding
      : {};
  await prisma.neptiveClientProfile.upsert({
    where: { customerId: customer.id },
    create: {
      orgId: customer.orgId,
      customerId: customer.id,
      branding: {
        ...existingBranding,
        previewIdentity: {
          instagramName: 'casa_pandora_',
          facebookName: 'Casa Pandora - Arezzo',
        },
      },
    },
    update: {
      branding: {
        ...existingBranding,
        previewIdentity: {
          instagramName: 'casa_pandora_',
          facebookName: 'Casa Pandora - Arezzo',
        },
      },
    },
  });

  // Keep the earlier smoke-test PED out of the client-facing demo so the
  // September calendar is the single, unambiguous review surface.
  await prisma.neptiveEditorialPlan.updateMany({
    where: {
      customerId: customer.id,
      name: 'PED Demo Casa Pandora',
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });

  const agencyUser = await prisma.user.findFirst({
    where: { organizations: { some: { organizationId: customer.orgId } } },
    orderBy: { createdAt: 'asc' },
  });

  const integration = await prisma.integration.upsert({
    where: {
      organizationId_internalId: {
        organizationId: customer.orgId,
        internalId: 'casa-pandora-demo-instagram',
      },
    },
    update: { name: '@casapandora · demo', customerId: customer.id },
    create: {
      organizationId: customer.orgId,
      customerId: customer.id,
      internalId: 'casa-pandora-demo-instagram',
      name: '@casapandora · demo',
      providerIdentifier: 'instagram',
      type: 'social',
      token: 'demo-only-no-publishing',
      profile: 'casapandora',
      picture: `${frontend}/icons/platforms/instagram.png`,
    },
  });

  const ped = await prisma.neptiveEditorialPlan.findFirst({
    where: {
      orgId: customer.orgId,
      customerId: customer.id,
      name: 'Casa Pandora — Settembre 2026',
      deletedAt: null,
    },
  });
  const plan = ped || await prisma.neptiveEditorialPlan.create({
    data: {
      orgId: customer.orgId,
      customerId: customer.id,
      name: 'Casa Pandora — Settembre 2026',
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T23:59:59.000Z'),
      status: 'CLIENT_REVIEW',
      objectives: 'Raccontare l’esperienza Casa Pandora e aumentare le richieste di prenotazione nel mese di settembre.',
      notes: 'Fixture locale: contenuti dimostrativi non pubblicabili.',
      createdByUserId: agencyUser?.id,
    },
  });

  const result = [];
  for (const [position, content] of contents.entries()) {
    const group = `casa-pandora-september-2026-${content.slug}`;
    const existingPost = await prisma.post.findFirst({
      where: { organizationId: customer.orgId, group, deletedAt: null },
    });
    const post = existingPost || await prisma.post.create({
      data: {
        organizationId: customer.orgId,
        integrationId: integration.id,
        group,
        publishDate: new Date(content.date),
        state: 'DRAFT',
        content: `<p>${content.caption}</p>`,
        image: JSON.stringify(content.media),
        settings: JSON.stringify({
          __type: 'instagram',
          post_type: content.settings?.post_type || 'post',
        }),
        creationMethod: 'UNKNOWN',
        approvedSubmitForOrder: 'NO',
      },
    });

    const item = await prisma.neptiveEditorialPlanItem.findFirst({
      where: { planId: plan.id, postGroup: group },
    });
    if (!item) {
      await prisma.neptiveEditorialPlanItem.create({
        data: {
          planId: plan.id,
          postGroup: group,
          title: content.title,
          position,
        },
      });
    }

    const approval = await prisma.neptiveContentApproval.findFirst({
      where: { orgId: customer.orgId, postGroup: group, deletedAt: null },
    });
    if (!approval) {
      await prisma.neptiveContentApproval.create({
        data: {
          orgId: customer.orgId,
          customerId: customer.id,
          postGroup: group,
          title: content.title,
          status: content.approval,
          submittedAt: content.approval === 'PENDING_CLIENT_APPROVAL' ? new Date() : null,
          approvedAt: content.approval === 'APPROVED' ? new Date() : null,
          createdByUserId: agencyUser?.id,
        },
      });
    }
    result.push({ group, postId: post.id, title: content.title, media: content.media.length, status: content.approval });
  }

  console.log(JSON.stringify({ customerId: customer.id, pedId: plan.id, integrationId: integration.id, contents: result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
