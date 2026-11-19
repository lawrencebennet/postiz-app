# White-label: Neptive Social Portal

The product is shown as **Neptive Social Portal** (short: Neptive). Upstream Postiz keeps its source as it is;
the brand is applied at a few interception points, so upstream merges stay cheap. Brand data lives in one file:
`libraries/nestjs-libraries/src/neptive/brand/brand.json` (name, words to replace, asset redirects, palette,
email sender).

## Interception points

| where | what it does | upstream file touched |
|---|---|---|
| Next build: `neptive/brand/next/with-neptive-brand.mjs` | Turbopack (and webpack) loader running `neptive/brand/transform.cjs` on every upstream source and locale file that contains a brand word: "Postiz"/"Gitroom" (and the bn/he transliterations) become "Neptive" in strings, JSX, page titles, translations (all 16 locales, at build time, files untouched). Identifiers are never touched (`x-postiz-org`, `POSTIZ_*`, `@postiz/*`, `postiz://`, `PostizAdapter`) because the match is on whole capitalised words. | `apps/frontend/next.config.js` (2 lines) |
| same loader: `cuts` in brand.json | exact snippets removed from one upstream file: the upstream CLI cards in Settings > Agents and onboarding (`npm install -g postiz`). brand-check fails if a snippet stops matching | none |
| same loader: `neptive/brand/locales/<lang>.json` | Neptive translation keys merged into the upstream locale when it is bundled (sidebar entry `agency` → "Agenzia") | none |
| same wrapper: `resolveAlias` | swaps 4 upstream modules for Neptive ones: sidebar logo, logo-text, the font module (`plus.jakarta.sans.font` → `components/neptive/brand/theme.ts`, which also loads `brand.css`), the login form | none |
| same wrapper: `rewrites.beforeFiles` | `/postiz.svg`, `/logo.svg`, `/favicon.ico`, `/favicon.png`, `/postiz-fav.png`, auth background images … are served from `public/neptive/brand/` | none |
| same wrapper: `redirects` | with `DISABLE_REGISTRATION=true`, `/auth` (where signed-out visitors land) goes to `/auth/login` | none |
| PostCSS: `neptive/brand/postcss/neptive-theme.cjs` | every upstream purple/pink in the compiled CSS (Tailwind arbitrary classes, stylesheets) becomes a Neptive variable; SVG `fill`/`stroke`/`stop-color` attributes with those colours get generated rules; radii in the app stylesheet flattened | `apps/frontend/postcss.config.mjs` |
| `components/neptive/brand/brand.css` | the theme: upstream CSS variables for both colour modes (`colors.scss`) re-valued, base type, app shell (sidebar labels, top bar title), upstream marketing links hidden (`a[href*=postiz.com]`, `gitroomhq`, Chrome store), Neptive component classes (`nx-*`) | none |
| auth layout | `app/(app)/auth/layout.tsx` only renders `NeptiveAuthShell`; the forms inside stay upstream except the login (aliased) | `app/(app)/auth/layout.tsx` |
| emails | `EmailService.sendEmailSync` (every email passes there) calls `neptiveEmail()`: branded subject, body, sender name, Neptive layout | `libraries/nestjs-libraries/src/services/email.service.ts` |
| HTTP error messages | `NeptiveBrandErrorsInterceptor`, registered as `APP_INTERCEPTOR` by `NeptiveApiModule`: `HttpException` messages branded in place (class/status kept) | none |
| MCP server name | `start.mcp.ts`: `name: NEPTIVE_MCP_NAME` ("Neptive MCP") | `libraries/nestjs-libraries/src/chat/start.mcp.ts` |
| Swagger title | "Neptive Social Portal API" | `libraries/helpers/src/swagger/load.swagger.ts` |
| metadata | new files: `app/manifest.ts`, `app/(app)/opengraph-image.png`, `app/(app)/apple-icon.png`; portal title from `(portal)/layout.tsx` | none (new files) |

The OAuth consent screen, connect-link page, preview page, logout tooltip etc. are covered by the build transform.

## Brand check

`node neptive/scripts/brand-check.mjs` (step 4b of `neptive/scripts/sync-upstream.sh`) fails on any **new**
user-visible occurrence of the upstream brand:

1. browser-bound upstream source and the locales, after the build transform (what ships);
2. server string literals (emails and HTTP errors are branded at runtime; the rest is listed);
3. upstream logo files must be redirected; a new image named like a brand mark fails;
4. the 4 swapped upstream modules must exist; a change upstream is reported so the Neptive copy can follow.

Accepted occurrences are in `neptive/brand/brand-allowlist.json`, each with a reason
(rules in `neptive/brand/allowlist-reasons.cjs`). Identifiers that keep the upstream name are listed in the
script (`IDENTIFIERS`). After a merge: run it, fix or explain, `--update`, review the diff.

Rendered check: `node neptive/dev/brand-sweep.mjs --langs=it,en` crawls admin, public and portal pages and
searches visible text, titles, meta, alt/aria/placeholder, link targets and image bytes (against
`neptive/brand/upstream-logos.json`). Emails: `pnpm exec jest --config neptive/jest.config.ts brand` renders
them to `neptive/dev/.data/emails/`. Screenshots: `node neptive/dev/brand-shots.mjs`.

## Production settings to check

`EMAIL_FROM_NAME` in production `.env` is shown as sender: it is branded at send time ("Postiz" → "Neptive"),
but setting it to `Neptive Social Portal` is cleaner.

## Fonts

Inter 4 (variable, wght+opsz) and Sometype Mono (variable), both SIL Open Font License 1.1, self-hosted from
`apps/frontend/src/components/neptive/brand/fonts/` (licence texts next to the files). The reference site's
SuisseBPIntl is commercial and is not used.
