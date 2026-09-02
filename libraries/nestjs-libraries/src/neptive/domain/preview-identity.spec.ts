import { normalizePreviewIdentity } from './preview-identity';

describe('Neptive preview identity', () => {
  it('returns safe platform defaults when identity is missing', () => {
    expect(normalizePreviewIdentity(undefined)).toEqual({
      instagram: { name: 'casa_pandora_', image: null },
      facebook: { name: 'Casa Pandora - Arezzo', image: null },
    });
  });

  it('keeps configured identity values while trimming blank values', () => {
    expect(
      normalizePreviewIdentity({
        instagramName: '  casa_pandora_  ',
        instagramImage: 'https://cdn.test/ig.png',
        facebookName: 'Casa Pandora',
        facebookImage: 'https://cdn.test/fb.png',
      })
    ).toEqual({
      instagram: { name: 'casa_pandora_', image: 'https://cdn.test/ig.png' },
      facebook: { name: 'Casa Pandora', image: 'https://cdn.test/fb.png' },
    });
  });
});
