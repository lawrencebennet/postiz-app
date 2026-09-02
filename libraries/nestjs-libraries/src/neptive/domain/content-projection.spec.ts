import {
  projectPostGroup,
  type ProjectionPost,
} from './content-projection';

const media = (id: string, path: string, type?: string) => ({
  id,
  path,
  ...(type ? { type } : {}),
});

const post = (
  overrides: Partial<ProjectionPost> = {}
): ProjectionPost => ({
  id: 'post-1',
  organizationId: 'org-1',
  group: 'group-1',
  parentPostId: null,
  content: '<p>Caption demo</p>',
  image: JSON.stringify([media('one', 'https://cdn.test/one.jpg')]),
  publishDate: new Date('2026-09-12T17:00:00.000Z'),
  state: 'DRAFT',
  settings: JSON.stringify({ __type: 'instagram', post_type: 'post' }),
  title: 'Casa Pandora',
  integration: {
    id: 'integration-1',
    customerId: 'customer-1',
    providerIdentifier: 'instagram',
    name: '@casapandora',
    picture: 'https://cdn.test/profile.jpg',
  },
  ...overrides,
});

describe('Neptive Postiz content projection', () => {
  it('preserves exact Postiz media order and classifies an image carousel', () => {
    const result = projectPostGroup(
      [
        post({
          image: JSON.stringify([
            media('one', 'https://cdn.test/one.jpg'),
            media('two', 'https://cdn.test/two.jpg'),
            media('three', 'https://cdn.test/three.mp4', 'video'),
          ]),
        }),
      ],
      { orgId: 'org-1', customerId: 'customer-1', title: 'Camera Deluxe' }
    );

    expect(result.contentType).toBe('CAROUSEL');
    expect(result.media.map((item) => item.id)).toEqual(['one', 'two', 'three']);
    expect(result.media[2].type).toBe('video');
    expect(result.title).toBe('Camera Deluxe');
    expect(result.caption).toContain('Caption demo');
  });

  it('classifies a single Instagram video as a Reel and a Story as Story', () => {
    const reel = projectPostGroup(
      [
        post({
          image: JSON.stringify([media('reel', 'https://cdn.test/reel.mp4')]),
        }),
      ],
      { orgId: 'org-1', customerId: 'customer-1' }
    );
    const story = projectPostGroup(
      [
        post({
          image: JSON.stringify([media('story', 'https://cdn.test/story.jpg')]),
          settings: JSON.stringify({ __type: 'instagram', post_type: 'story' }),
        }),
      ],
      { orgId: 'org-1', customerId: 'customer-1' }
    );

    expect(reel.contentType).toBe('REEL');
    expect(story.contentType).toBe('STORY');
  });

  it('rejects a Postiz group that belongs to another customer', () => {
    expect(() =>
      projectPostGroup(
        [
          post({
            integration: {
              ...post().integration,
              customerId: 'customer-2',
            },
          }),
        ],
        { orgId: 'org-1', customerId: 'customer-1' }
      )
    ).toThrow('Post group not found');
  });

  it('keeps channel variants while deriving the primary content from the first root', () => {
    const result = projectPostGroup(
      [
        post(),
        post({
          id: 'post-2',
          integration: {
            ...post().integration,
            id: 'integration-2',
            providerIdentifier: 'facebook',
            name: 'Casa Pandora Facebook',
          },
          content: '<p>Facebook caption</p>',
        }),
      ],
      { orgId: 'org-1', customerId: 'customer-1' }
    );

    expect(result.variants).toHaveLength(2);
    expect(result.platforms).toEqual(['instagram', 'facebook']);
    expect(result.caption).toContain('Caption demo');
  });
});
