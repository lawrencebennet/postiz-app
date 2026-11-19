import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Agenzia · Neptive',
  description: 'Clienti, piani editoriali, approvazioni e report.',
};

export default function AgencyLayout({ children }: { children: ReactNode }) {
  return children;
}
