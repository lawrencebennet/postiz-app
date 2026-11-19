// PostCSS plugin of the Neptive white-label theme (registered in apps/frontend/postcss.config.mjs).
//
// Upstream hard-codes its brand colours in about a hundred Tailwind arbitrary classes (bg-[#612BD3],
// text-[#FC69FF], border-[#612bd3]/50 ...), in stylesheets and in SVG attributes. Instead of overriding each
// class, this plugin rewrites the colour VALUES in the compiled CSS: every upstream brand colour becomes a
// Neptive CSS variable whose value depends on the colour mode (brand.css). For SVG presentation attributes
// (fill="#612BD3", stop-color=...) it generates the matching attribute-selector rules where brand.css has
// the marker comment `neptive-svg-colours`. It also flattens the radii of the Tailwind output to the Neptive
// shapes. Values only: selectors and class names are untouched, so upstream markup keeps working and new
// upstream uses of these colours are themed automatically. The brand check fails when upstream source uses
// a purple/magenta that is not in this table.

/** upstream colour (lower-case hex, no #) -> Neptive variable holding an "r g b" triple */
const COLOURS = {
  // the upstream purple, its shades and the violet accents of onboarding, previews, consent screens
  ...Object.fromEntries(
    ['612bd3', '612ad5', '7236f1', '8155dd', '7950f2', '832ad5', '5023b8', '3900b2', '8b5cf6', '7c3aed', '9333ea',
      '4f46e5', 'a855f7', '6d28d9', '5520cb', '5720cb', '662fda', '5826c2', '7b3ff2', '7c3aff', '622aff', '622ff6',
      '7640e0', '9d6eff', '8c66ff', 'ae8afc', 'a78bfa', 'c4b5fd', '7e22ce', '6b21a8']
      .map((h) => [h, '--nx-accent-rgb'])
  ),
  fc69ff: '--nx-signal-rgb',
  d82d7e: '--nx-red-rgb',
  ff3ea2: '--nx-red-rgb',
  ebe8ff: '--nx-soft-rgb',
  cebdf2: '--nx-soft-rgb',
  b69dec: '--nx-soft-rgb',
  dacbfb: '--nx-soft-rgb',
  '291259': '--nx-soft-rgb',
  '2d1b57': '--nx-soft-rgb',
};

const toRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rules = Object.entries(COLOURS).flatMap(([hex, v]) => {
  const [r, g, b] = toRgb(hex);
  return [
    [new RegExp(`#${hex}(?![0-9a-f])`, 'gi'), `rgb(var(${v}))`],
    // Tailwind output: rgb(97 43 211 / var(--tw-bg-opacity)), rgb(97 43 211 / 0.1), rgba(97, 43, 211, .5)
    [
      new RegExp(`rgba?\\(\\s*${r}[ ,]+${g}[ ,]+${b}\\s*(?:[/,]\\s*([^)]+))?\\)`, 'g'),
      (_m, a) => (a ? `rgb(var(${v}) / ${a.trim()})` : `rgb(var(${v}))`),
    ],
  ];
});

const svgRules = () =>
  Object.entries(COLOURS)
    .map(([hex, v]) =>
      ['fill', 'stroke', 'stop-color']
        .map((attr) => `[${attr}='#${hex}' i]{${attr}:rgb(var(${v}))}`)
        .join('\n')
    )
    .join('\n');

// px radius -> Neptive radius (pills and circles stay)
const radius = (px) => {
  if (px <= 4 || px >= 100) return px;
  if (px <= 10) return 4;
  if (px <= 16) return 6;
  return 8;
};

const plugin = () => ({
  postcssPlugin: 'neptive-theme',
  Once(root, { parse }) {
    root.walkComments((comment) => {
      if (comment.text.trim() === 'neptive-svg-colours') comment.replaceWith(parse(svgRules()).nodes);
    });
  },
  Declaration(decl) {
    let value = decl.value;
    if (/#|rgb/i.test(value)) {
      for (const [re, to] of rules) value = value.replace(re, to);
    }
    if (/^border(-[a-z]+)*-radius$/.test(decl.prop) && /px/.test(value)) {
      const file = decl.source?.input?.file || '';
      // only the app's own Tailwind/global styles, never third-party component CSS
      if (/apps[\\/]frontend[\\/]src[\\/]app[\\/]global\.scss/.test(file)) {
        value = value.replace(/(\d+(?:\.\d+)?)px/g, (_m, n) => `${radius(Number(n))}px`);
      }
    }
    if (value !== decl.value) decl.value = value;
  },
});
plugin.postcss = true;

module.exports = plugin;
module.exports.COLOURS = COLOURS;
