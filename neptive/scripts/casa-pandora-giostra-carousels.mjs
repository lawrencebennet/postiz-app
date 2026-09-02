import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const frontend = process.env.FRONTEND_URL || 'http://localhost:4200';
const demoDir = `${frontend}/neptive-demo`;

const carousel = (slug, title, date, caption, folder) => ({
  slug,
  title,
  date,
  caption,
  folder,
  media: Array.from({ length: 5 }, (_, index) => ({
    id: `casa-pandora-${slug}-slide-${index + 1}`,
    path: `${demoDir}/${folder}/slide-${String(index + 1).padStart(2, '0')}.png`,
    type: 'image',
  })),
});

const carousels = [
  carousel(
    'giostra-v2',
    'Giostra del Saracino — 150ª edizione',
    '2026-09-06T15:00:00.000Z',
    'Arezzo, questa domenica cambia ritmo. La 150ª Giostra del Saracino torna in Piazza Grande: salva il post e vivi la città con Casa Pandora.',
    'giostra-v2'
  ),
  carousel(
    'giostra-5-slides',
    'Una domenica ad Arezzo da vivere',
    '2026-09-13T10:00:00.000Z',
    'Ad Arezzo questa settimana non si guarda soltanto: si vive. Ecco cosa non perdere durante la Giostra del Saracino, a pochi passi da Casa Pandora.',
    'giostra-5-slides'
  ),
];

async function main() {
  const customer = await prisma.customer.findFirst({
    where: { name: 'Casa Pandora', deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!customer) throw new Error('Casa Pandora customer not found');

  const agencyUser = await prisma.user.findFirst({
    where: { organizations: { some: { organizationId: customer.orgId } } },
    orderBy: { createdAt: 'asc' },
  });

  const integration = await prisma.integration.findFirst({
    where: {
      organizationId: customer.orgId,
      customerId: customer.id,
      providerIdentifier: 'instagram',
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!integration) throw new Error('Casa Pandora Instagram integration not found');

  const plan = await prisma.neptiveEditorialPlan.findFirst({
    where: {
      orgId: customer.orgId,
      customerId: customer.id,
      name: 'Casa Pandora — Settembre 2026',
      deletedAt: null,
    },
  });
  if (!plan) throw new Error('Casa Pandora September PED not found');

  const result = [];
  for (const content of carousels) {
    const group = `casa-pandora-september-2026-${content.slug}`;
    const postData = {
      integrationId: integration.id,
      group,
      publishDate: new Date(content.date),
      state: 'DRAFT',
      content: `<p>${content.caption}</p>`,
      image: JSON.stringify(content.media),
      settings: JSON.stringify({ __type: 'instagram', post_type: 'post' }),
      creationMethod: 'UNKNOWN',
      approvedSubmitForOrder: 'NO',
    };
    const existing = await prisma.post.findFirst({
      where: { organizationId: customer.orgId, group, deletedAt: null },
    });
    const post = existing
      ? await prisma.post.update({ where: { id: existing.id }, data: postData })
      : await prisma.post.create({
          data: { organizationId: customer.orgId, ...postData },
        });

    const lastItem = await prisma.neptiveEditorialPlanItem.findFirst({
      where: { planId: plan.id },
      orderBy: { position: 'desc' },
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
          position: (lastItem?.position ?? -1) + 1,
        },
      });
    }

    const approval = await prisma.neptiveContentApproval.findFirst({
      where: { orgId: customer.orgId, postGroup: group, deletedAt: null },
    });
    if (approval) {
      await prisma.neptiveContentApproval.update({
        where: { id: approval.id },
        data: {
          customerId: customer.id,
          title: content.title,
          status: 'PENDING_CLIENT_APPROVAL',
          submittedAt: approval.submittedAt || new Date(),
          approvedAt: null,
        },
      });
    } else {
      await prisma.neptiveContentApproval.create({
        data: {
          orgId: customer.orgId,
          customerId: customer.id,
          postGroup: group,
          title: content.title,
          status: 'PENDING_CLIENT_APPROVAL',
          submittedAt: new Date(),
          createdByUserId: agencyUser?.id,
        },
      });
    }
    result.push({
      group,
      postId: post.id,
      title: content.title,
      media: content.media.length,
      dimensions: '1080x1440',
      status: 'PENDING_CLIENT_APPROVAL',
    });
  }

  console.log(JSON.stringify({ customerId: customer.id, pedId: plan.id, contents: result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
