// Neptive brand theme entry. next.config (neptive/brand/next/with-neptive-brand.mjs) swaps the upstream
// font module '@gitroom/frontend/fonts/plus-jakarta-sans/plus.jakarta.sans.font' for this file, so every
// upstream `jakartaSans.className` (root layouts, app shell) gets the Neptive fonts, and the global Neptive
// stylesheet is loaded wherever the app loads its font: one swap, no upstream file edited.
//
// Fonts (both SIL Open Font License 1.1, files + licences in ./fonts, self-hosted, latin subset):
//  - Inter 4 variable (wght + opsz axes) by Rasmus Andersson: the grotesque. opsz turns it into the tighter
//    "Display" cut at heading sizes, close to the confident Swiss grotesque of the reference.
//  - Sometype Mono variable (wght) by Ryoichi Tsunekawa: labels, tags, metadata.
import localFont from 'next/font/local';
import './brand.css';

const sans = localFont({
  src: [{ path: './fonts/inter-latin-opsz-wght.woff2', weight: '100 900', style: 'normal' }],
  variable: '--nx-font-sans',
  display: 'swap',
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
});

const mono = localFont({
  src: [{ path: './fonts/sometype-mono-latin-wght.woff2', weight: '400 700', style: 'normal' }],
  variable: '--nx-font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});

export const neptiveFonts = { sans, mono };

/** same shape the upstream modules read (`.className`) */
export const jakartaSans = {
  className: `${sans.className} ${sans.variable} ${mono.variable}`,
  style: sans.style,
};
