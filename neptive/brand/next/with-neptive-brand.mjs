// Neptive white-label hook for the frontend build. apps/frontend/next.config.js wraps its config with this
// function (the only line Neptive adds there). Everything the brand needs at build level lives here:
//
//  1. a loader rule: upstream source and locale files that contain an upstream brand word or asset path go
//     through neptive/brand/transform.cjs (Postiz -> Neptive, /postiz.svg -> /neptive/brand/mark.svg ...)
//  2. module substitutions: a few upstream modules (logos, the font module, the login form) are swapped for
//     Neptive ones at resolve time, so the upstream files stay untouched. Listed in ALIASES; the brand check
//     verifies that every aliased upstream file still exists and warns when upstream changed it.
//  3. rewrites served before the public folder: requests for the upstream logo / favicon files get the
//     Neptive files, so even a hard-coded or cached URL never shows the upstream mark.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { brand, QUICK } = require('../transform.cjs');
const LOADER = path.join(here, 'brand-loader.cjs');

/** upstream import specifier -> Neptive module (relative to apps/frontend) */
export const ALIASES = {
  '@gitroom/frontend/components/new-layout/logo': './src/components/neptive/brand/logo.tsx',
  '@gitroom/frontend/components/ui/logo-text.component': './src/components/neptive/brand/logo.tsx',
  '@gitroom/frontend/fonts/plus-jakarta-sans/plus.jakarta.sans.font': './src/components/neptive/brand/theme.ts',
  '@gitroom/frontend/components/auth/login': './src/components/neptive/brand/login.tsx',
};

export function withNeptiveBrand(config) {
  const frontendDir = path.resolve(here, '../../../apps/frontend');
  const upstreamRewrites = config.rewrites;
  return {
    ...config,
    turbopack: {
      ...(config.turbopack || {}),
      rules: {
        ...(config.turbopack?.rules || {}),
        '*': {
          condition: {
            all: [{ not: 'foreign' }, { path: /\.(tsx|ts|jsx|js|mjs|json)$/ }, { content: QUICK }],
          },
          loaders: [LOADER],
        },
      },
      resolveAlias: { ...(config.turbopack?.resolveAlias || {}), ...ALIASES },
    },
    // same substitutions for `next build --webpack` (not the default, kept so both bundlers agree)
    webpack: (webpackConfig, options) => {
      const out = config.webpack ? config.webpack(webpackConfig, options) : webpackConfig;
      out.resolve.alias = {
        ...(out.resolve.alias || {}),
        ...Object.fromEntries(Object.entries(ALIASES).map(([k, v]) => [`${k}$`, path.join(frontendDir, v)])),
      };
      out.module.rules.push({
        test: /\.(tsx|ts|jsx|js|mjs|json)$/,
        exclude: /node_modules/,
        enforce: 'pre',
        use: [LOADER],
      });
      return out;
    },
    async rewrites() {
      const original = upstreamRewrites ? await upstreamRewrites() : [];
      const beforeFiles = Object.entries(brand.assets).map(([source, destination]) => ({ source, destination }));
      if (Array.isArray(original)) return { beforeFiles, afterFiles: original, fallback: [] };
      return { ...original, beforeFiles: [...beforeFiles, ...(original.beforeFiles || [])] };
    },
  };
}
