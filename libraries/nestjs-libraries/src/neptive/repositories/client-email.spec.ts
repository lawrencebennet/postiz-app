jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

import { NeptiveRepository } from './neptive.repository';
import { normalizeLoginEmail } from '../domain/credentials';

describe('client user email canonical form', () => {
  it('is stored and looked up trimmed and lower-cased, the same form the login uses', async () => {
    const create = jest.fn(async ({ data }) => data);
    const findFirst = jest.fn(async (args) => args);
    const repo = new NeptiveRepository({ neptiveClientUser: { create, findFirst } } as any);
    const created: any = await repo.createClientUser({
      orgId: 'o',
      customerId: 'c',
      email: '  Anna.Rossi@CasaPandora.IT ',
      name: 'Anna',
      role: 'CLIENT_MEMBER',
    });
    expect(created.email).toBe('anna.rossi@casapandora.it');
    expect(created.email).toBe(normalizeLoginEmail('  Anna.Rossi@CasaPandora.IT '));
    const lookup: any = await repo.clientUserByEmail('o', 'c', ' ANNA.rossi@casapandora.it');
    expect(lookup.where.email).toBe('anna.rossi@casapandora.it');
  });
});
