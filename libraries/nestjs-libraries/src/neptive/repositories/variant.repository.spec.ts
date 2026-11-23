jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({ PrismaService: class {} }));

import { NeptiveVariantRepository } from './variant.repository';

describe('NeptiveVariantRepository customer scope', () => {
  it('liveItemsByGroup only looks at live plans of the same org AND customer', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repo = new NeptiveVariantRepository({ neptiveEditorialPlanItem: { findMany } } as any);
    await repo.liveItemsByGroup('org-1', 'customer-1', 'group-1');
    expect(findMany.mock.calls[0][0].where).toEqual({
      postGroup: 'group-1',
      deletedAt: null,
      plan: { orgId: 'org-1', customerId: 'customer-1', deletedAt: null },
    });
  });
});
