'use client';

// Neptive marks. Swapped in (next config resolveAlias) for the upstream modules
// '@gitroom/frontend/components/new-layout/logo' (sidebar, consent screen) and
// '@gitroom/frontend/components/ui/logo-text.component' (auth pages, connect link, billing).
// Typographic only: "Neptive" set in the brand grotesque, outlined to paths (no font dependency), and an
// "N" monogram tile for small square places.
import { FC } from 'react';
import clsx from 'clsx';

const WORDMARK =
  'M 53.625,92.75 15.25,24.9375 q 1.125,9.875 1.125,15.875 V 92.75 H 0 V 4.6875 H 21.0625 L 60,73.0625 Q 58.875,63.625 58.875,55.875 V 4.6875 H 75.25 V 92.75 Z M 114.5,94 Q 99.25,94 91.0625,85 82.875,75.9375 82.875,58.625 q 0,-16.75 8.3125,-25.75 8.3125,-9 23.5625,-9 14.5625,0 22.25,9.6875 7.6875,9.625 7.6875,28.25 v 0.5 h -43.375 q 0,9.875 3.625,14.9375 3.6875,5 10.4375,5 9.3125,0 11.75,-8.0625 l 16.5625,1.4375 Q 136.5,94 114.5,94 Z m 0,-59.0625 q -6.1875,0 -9.5625,4.3125 -3.3125,4.3125 -3.5,12.0625 h 26.25 q -0.5,-8.1875 -3.9375,-12.25 -3.4375,-4.125 -9.25,-4.125 z M 216,58.625 q 0,16.9375 -6.8125,26.1875 Q 202.4375,94 190.0625,94 182.9375,94 177.625,90.9375 172.375,87.8125 169.5625,82 h -0.375 q 0.375,1.875 0.375,11.375 v 25.9375 H 152 v -78.625 q 0,-9.5625 -0.5,-15.5625 h 17.0625 q 0.3125,1.125 0.5,4.4375 0.25,3.3125 0.25,6.5625 h 0.25 q 5.9375,-12.4375 21.625,-12.4375 11.8125,0 18.3125,9.125 6.5,9.0625 6.5,25.8125 z m -18.3125,0 q 0,-22.75 -13.9375,-22.75 -7,0 -10.75,6.125 -3.6875,6.125 -3.6875,17.125 0,10.9375 3.6875,16.9375 Q 176.75,82 183.625,82 197.6875,82 197.6875,58.625 Z M 241.5,93.875 q -7.75,0 -11.9375,-4.1875 -4.1875,-4.25 -4.1875,-12.8125 V 37 h -8.5625 V 25.125 h 9.4375 l 5.5,-15.875 h 11 v 15.875 h 12.8125 V 37 H 242.75 v 35.125 q 0,4.9375 1.875,7.3125 1.875,2.3125 5.8125,2.3125 2.0625,0 5.875,-0.875 V 91.75 q -6.5,2.125 -14.8125,2.125 z M 260.8125,12.9375 V 0 h 17.5625 v 12.9375 z m 0,79.8125 V 25.125 H 278.375 V 92.75 Z m 66.3125,0 h -21 L 281.9375,25.125 H 300.5 l 11.8125,37.8125 q 0.9375,3.125 4.4375,15.625 0.625,-2.5625 2.5625,-9 1.9375,-6.4375 14.375,-44.4375 h 18.375 z M 383.25,94 Q 368,94 359.8125,85 351.625,75.9375 351.625,58.625 q 0,-16.75 8.3125,-25.75 8.3125,-9 23.5625,-9 14.5625,0 22.25,9.6875 7.6875,9.625 7.6875,28.25 v 0.5 h -43.375 q 0,9.875 3.625,14.9375 3.6875,5 10.4375,5 9.3125,0 11.75,-8.0625 l 16.5625,1.4375 Q 405.25,94 383.25,94 Z m 0,-59.0625 q -6.1875,0 -9.5625,4.3125 -3.3125,4.3125 -3.5,12.0625 h 26.25 q -0.5,-8.1875 -3.9375,-12.25 -3.4375,-4.125 -9.25,-4.125 z';

const N_GLYPH =
  'M 118.71338,150 73.742676,70.532227 q 1.318359,11.572265 1.318359,18.603515 V 150 H 55.871582 V 46.801758 h 24.682617 l 45.629881,80.126952 q -1.31836,-11.05957 -1.31836,-20.1416 V 46.801758 h 19.18946 V 150 Z';

/** "Neptive" wordmark, coloured by currentColor */
export const NeptiveWordmark: FC<{ className?: string; title?: string }> = ({ className, title = 'Neptive' }) => (
  <svg viewBox="0 0 413.44 119.31" className={className} role="img" aria-label={title} fill="currentColor">
    <path d={WORDMARK} />
  </svg>
);

/** square "N" monogram tile */
export const NeptiveMonogram: FC<{ size?: number; className?: string }> = ({ size = 40, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    role="img"
    aria-label="Neptive"
    className={clsx('shrink-0', className)}
  >
    <rect width="64" height="64" rx="5" fill="var(--nx-text, #F9F4EB)" />
    <path
      transform="translate(-3.99 -3.42) scale(0.36)"
      fill="var(--nx-surface, #1A1C1C)"
      d={N_GLYPH}
    />
  </svg>
);

/** brand lock-up: wordmark + mono product line */
export const NeptiveLockup: FC<{ className?: string; product?: string }> = ({ className, product = 'Social Portal' }) => (
  <div className={clsx('flex items-end gap-[10px] text-[var(--nx-text)]', className)}>
    <NeptiveWordmark className="h-[26px] w-auto" />
    <span className="nx-label !text-[10px] leading-none pb-[2px]">{product}</span>
  </div>
);

/** replaces upstream new-layout/logo (sidebar: 60px square slot) */
export const Logo = () => (
  <a href="/launches" aria-label="Neptive" className="mt-[8px] block">
    <NeptiveMonogram size={44} />
  </a>
);

/** replaces upstream ui/logo-text.component */
export const LogoTextComponent = () => <NeptiveLockup />;
