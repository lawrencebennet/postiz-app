// Neptive white-label: the one text transformation applied to upstream frontend source at build time.
// Used by the Turbopack loader (neptive/brand/next/brand-loader.cjs) and by the brand check, which runs the
// same function over the upstream tree to see what would still leak. Pure string work, no AST: it only
// touches capitalised brand words (never identifiers, which are all lower-case or embedded: x-postiz-org,
// POSTIZ_API_KEY, @postiz/wallets, postiz:// stay as they are) and a fixed list of public asset paths.
const fs = require('fs');
const path = require('path');

const BRAND_FILE = path.join(__dirname, '../../libraries/nestjs-libraries/src/neptive/brand/brand.json');
const brand = JSON.parse(fs.readFileSync(BRAND_FILE, 'utf8'));

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// \b on both sides: "Postiz" inside PostizAdapter or POSTIZ_API_KEY is not a word of its own and is left alone
const wordRe = (w) => (/^[\x00-\x7f]+$/.test(w) ? new RegExp(`\\b${escape(w)}\\b`, 'g') : new RegExp(escape(w), 'g'));
const WORDS = Object.entries(brand.replace.words).map(([from, to]) => [wordRe(from), to]);

// asset paths, only as whole quoted / url() values: '/postiz.svg', "/favicon.ico", url(/logo.svg)
const ASSETS = Object.entries(brand.assets).map(([from, to]) => [
  new RegExp(`(?<=['"\`(])${escape(from)}(?=['"\`)?#])`, 'g'),
  to,
]);

const QUICK = new RegExp(
  [...Object.keys(brand.replace.words), ...Object.keys(brand.assets)].map(escape).join('|')
);

function transform(source) {
  if (!QUICK.test(source)) return source;
  let out = source;
  for (const [re, to] of WORDS) out = out.replace(re, to);
  for (const [re, to] of ASSETS) out = out.replace(re, to);
  return out;
}

module.exports = { brand, transform, QUICK };
