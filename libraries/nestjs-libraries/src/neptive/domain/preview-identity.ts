export type PreviewIdentity = {
  instagram: { name: string; image: string | null };
  facebook: { name: string; image: string | null };
};

export type PreviewIdentityInput = {
  instagramName?: unknown;
  instagramImage?: unknown;
  facebookName?: unknown;
  facebookImage?: unknown;
};

const valueOrNull = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const nameOrDefault = (value: unknown, fallback: string) =>
  valueOrNull(value) || fallback;

export function normalizePreviewIdentity(
  value: PreviewIdentityInput | PreviewIdentity | null | undefined
): PreviewIdentity {
  const source = value as Record<string, any> | undefined;
  const instagram = source?.instagram;
  const facebook = source?.facebook;
  return {
    instagram: {
      name: nameOrDefault(
        instagram?.name ?? source?.instagramName,
        'Instagram profile'
      ),
      image: valueOrNull(instagram?.image ?? source?.instagramImage),
    },
    facebook: {
      name: nameOrDefault(
        facebook?.name ?? source?.facebookName,
        'Facebook page'
      ),
      image: valueOrNull(facebook?.image ?? source?.facebookImage),
    },
  };
}

export function previewIdentityInput(value: unknown): PreviewIdentityInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return {
    instagramName: source.instagramName,
    instagramImage: source.instagramImage,
    facebookName: source.facebookName,
    facebookImage: source.facebookImage,
  };
}
