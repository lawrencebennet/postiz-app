// Neptive frame for the sign-in screens: every /auth/** page (login, forgot password, reset, activation,
// registration notice) and the client portal entry pages (/portal/login, /portal/magic/*).
// apps/frontend/src/app/(app)/auth/layout.tsx only delegates here: the look of the auth pages lives in this
// Neptive file, the upstream page components (forms, logic) render inside it.
import { ReactNode } from 'react';
import { NeptiveLockup } from '@gitroom/frontend/components/neptive/brand/logo';

export const NeptiveAuthShell = ({
  children,
  eyebrow = '[ Neptive Studio ]',
  title = (
    <>
      Social
      <br />
      portal.
    </>
  ),
  intro = 'Piani editoriali, anteprime e approvazioni dei clienti, in un unico posto.',
  tag = '[ Area riservata ]',
}: {
  children: ReactNode;
  eyebrow?: string;
  title?: ReactNode;
  intro?: string;
  tag?: string;
}) => {
  const year = new Date().getFullYear();
  return (
    <div className="nx-auth dark min-h-screen w-full flex flex-col bg-[var(--nx-bg)] text-[var(--nx-text)]">
      <header className="px-[20px] md:px-[40px] pt-[22px] md:pt-[28px] flex items-center justify-between gap-[16px]">
        <NeptiveLockup />
        <span className="nx-label hidden sm:block">{tag}</span>
      </header>
      <main className="flex-1 w-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(400px,460px)] gap-x-[56px] gap-y-[28px] px-[20px] md:px-[40px] pt-[36px] pb-[32px] md:py-[48px] items-start lg:items-end content-start lg:content-stretch">
        <section className="flex flex-col justify-end min-w-0">
          <span className="nx-label mb-[14px] lg:mb-[26px]">{eyebrow}</span>
          <h1 className="nx-display text-[46px] sm:text-[64px] lg:text-[clamp(80px,8.6vw,132px)]">{title}</h1>
          {intro && (
            <p className="hidden lg:block max-w-[460px] mt-[30px] text-[19px] leading-[1.3] tracking-[-0.02em] text-[var(--nx-text-muted)]">
              {intro}
            </p>
          )}
        </section>
        <section className="nx-card nx-fade-in w-full max-w-[460px] lg:max-w-none mx-auto lg:mx-0 p-[24px] md:p-[32px] flex">
          <div className="flex-1 min-w-0 flex">{children}</div>
        </section>
      </main>
      <footer className="px-[20px] md:px-[40px] pb-[18px]">
        <div className="nx-rule pt-[12px] grid grid-cols-2 md:grid-cols-4 gap-[8px] nx-label">
          <span>Neptive Studio</span>
          <span className="hidden md:block">Social Portal</span>
          <span className="hidden md:block">© {year}</span>
          <a href="mailto:info@neptive.com" className="text-end hover:text-[var(--nx-text)]">
            info@neptive.com
          </a>
        </div>
      </footer>
    </div>
  );
};
