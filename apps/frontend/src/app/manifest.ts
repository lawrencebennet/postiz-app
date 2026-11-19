import type { MetadataRoute } from 'next';

// Neptive white-label: web app manifest (name, icons, colours). New file, no upstream counterpart.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Neptive Social Portal',
    short_name: 'Neptive',
    description: 'Piani editoriali, anteprime e approvazioni.',
    start_url: '/',
    display: 'standalone',
    background_color: '#121414',
    theme_color: '#1A1C1C',
    icons: [
      { src: '/neptive/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/neptive/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
