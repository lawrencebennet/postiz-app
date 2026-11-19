import { ReactNode } from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portale clienti · Neptive',
  description: 'Piano editoriale, anteprime e approvazioni.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[var(--nx-bg)]">{children}</div>;
}
