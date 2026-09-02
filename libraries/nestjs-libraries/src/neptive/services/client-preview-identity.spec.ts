jest.mock('@gitroom/nestjs-libraries/neptive/repositories/neptive.repository', () => ({
  NeptiveRepository: class {},
}));
jest.mock('@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter', () => ({
  PostizAdapter: class {},
}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));

import { NeptiveClientService } from './client.service';

describe('Neptive client preview identity', () => {
  it('merges preview identities into existing customer branding', async () => {
    const repo = {
      customerInOrg: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      profileByCustomer: jest.fn().mockResolvedValue({
        branding: { logo: 'existing-logo', colors: { primary: '#111' } },
      }),
      upsertProfile: jest.fn().mockResolvedValue(undefined),
    };
    const service = new NeptiveClientService(
      repo as any,
      {} as any,
      {} as any
    );

    await service.updatePreviewIdentity('org-1', 'customer-1', {
      instagramName: ' casa_pandora_ ',
      instagramImage: '/ig.png',
      facebookName: 'Casa Pandora',
      facebookImage: '/fb.png',
    });

    expect(repo.upsertProfile).toHaveBeenCalledWith('org-1', 'customer-1', {
      branding: {
        logo: 'existing-logo',
        colors: { primary: '#111' },
        previewIdentity: {
          instagramName: 'casa_pandora_',
          instagramImage: '/ig.png',
          facebookName: 'Casa Pandora',
          facebookImage: '/fb.png',
        },
      },
    });
  });
});
