import { normalizePreviewContent, swipeDirection } from './preview-model';

describe('Neptive platform preview model', () => {
  const content = {
    postGroup: 'group-1',
    title: 'Giostra del Saracino',
    caption: '<p>Caption demo</p>',
    platform: 'instagram',
    platforms: ['instagram'],
    channel: '@casapandora_',
    profileImage: 'https://cdn.test/profile.png',
    scheduledAt: '2026-09-06T15:00:00.000Z',
    contentType: 'CAROUSEL',
    publishingState: 'DRAFT',
    media: [
      { id: '1', path: '/slide-1.png', type: 'image', order: 0 },
      { id: '2', path: '/slide-2.png', type: 'image', order: 1 },
    ],
    variants: [],
  } as any;

  it('selects the requested platform without changing Postiz media order', () => {
    const result = normalizePreviewContent(
      content,
      {
        instagram: { name: 'casa_pandora_', image: null },
        facebook: { name: 'Casa Pandora', image: null },
      },
      'instagram'
    );

    expect(result.profile.name).toBe('casa_pandora_');
    expect(result.media.map((item) => item.id)).toEqual(['1', '2']);
    expect(result.platform).toBe('instagram');
  });

  it('uses the Facebook identity and content variant when available', () => {
    const result = normalizePreviewContent(
      {
        ...content,
        variants: [
          {
            postId: 'fb-1',
            platform: 'facebook',
            channel: 'Casa Pandora Facebook',
            profileImage: 'https://cdn.test/fb-post.png',
            caption: 'Facebook caption',
            scheduledAt: content.scheduledAt,
            contentType: 'CAROUSEL',
            media: content.media,
            publishingState: 'DRAFT',
          },
        ],
      },
      {
        instagram: { name: 'casa_pandora_', image: null },
        facebook: { name: 'Casa Pandora', image: '/fb-profile.png' },
      },
      'facebook'
    );

    expect(result.profile).toEqual({ name: 'Casa Pandora', image: '/fb-profile.png' });
    expect(result.caption).toBe('Facebook caption');
    expect(result.media.map((item) => item.id)).toEqual(['1', '2']);
  });
});

describe('Neptive preview swipe direction', () => {
  it('changes slide only when the horizontal gesture crosses the threshold', () => {
    expect(swipeDirection(-80, 40)).toBe(1);
    expect(swipeDirection(80, 40)).toBe(-1);
    expect(swipeDirection(20, 40)).toBe(0);
    expect(swipeDirection(-20, 40)).toBe(0);
  });
});
