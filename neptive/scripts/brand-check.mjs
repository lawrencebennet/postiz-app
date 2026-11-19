#!/usr/bin/env node
// Neptive brand check: fails when user-visible upstream branding (Postiz / Gitroom names, postiz.com links,
// upstream logos) reappears, typically after an upstream merge. Run by neptive/scripts/sync-upstream.sh.
//
//   node neptive/scripts/brand-check.mjs            check (exit 1 on new findings)
//   node neptive/scripts/brand-check.mjs --update   rewrite neptive/brand/brand-allowlist.json from the
//                                                    current findings (review the diff before committing!)
//
// What it looks at:
//  1. upstream source that ends up in the browser (apps/frontend/src, libraries/react-shared-libraries,
//     libraries/helpers) and the 16 locale files, AFTER the build transform neptive/brand/transform.cjs, i.e.
//     exactly what the Next build ships. Any line still containing postiz/gitroom that is not a comment is a
//     finding. Identifiers that must keep the upstream name (headers, env vars, packages, deep links, the MCP
//     agent id) are listed once, with the reason, in neptive/brand/brand-allowlist.json.
//  2. backend/orchestrator source strings with the brand word: emails and HTTP error messages are branded at
//     runtime (neptive/brand/brand.ts), everything else is a finding to triage in the allow-list.
//  3. logos: every upstream brand image (neptive/brand/upstream-logos.json) must be redirected by a rewrite in
//     brand.json `assets`; a new image under apps/frontend/public whose name looks like a brand mark fails.
//  4. the upstream modules Neptive swaps at build time (resolveAlias in with-neptive-brand.mjs) must still
//     exist; when upstream changed one of them since the recorded hash, it is reported (not a failure) so
//     the Neptive replacement can be compared with it.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = new URL('../../', import.meta.url).pathname;
const { transform, brand } = require('../brand/transform.cjs');
const ALLOW_FILE = join(ROOT, 'neptive/brand/brand-allowlist.json');
const update = process.argv.includes('--update');
const BRAND = /postiz|gitroom|পোস্টিজ|פוסטיז/i;

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const rel = (p) => relative(ROOT, p);
const isNeptive = (p) => /(^|\/)neptive(\/|$)|\(portal\)|\(site\)\/agency/.test(rel(p));
const isComment = (line) => /^\s*(\/\/|\/?\*|\{\s*\/\*)/.test(line);
const norm = (line) => line.trim().replace(/\s+/g, ' ').slice(0, 220);
// Internal identifiers that keep the upstream name on purpose (renaming them breaks upstream compatibility
// or external integrations). They are removed from a line before it is tested.
const IDENTIFIERS = [
  /@gitroom\/[\w/.@-]*/g, // workspace package aliases
  /\bgitroom(?=@|\b['"]?\s*[:,)]|\.(?:com|ai)\b)/g, // root package name, cookie/storage keys
  /x-postiz-[\w-]+/gi, // HTTP headers
  /\bPOSTIZ_\w+/g, // env vars
  /NEXT_PUBLIC_POSTIZ_\w+/g,
  /@postiz\/[\w-]+/g, // npm packages (@postiz/wallets)
  /\bpostiz:\/\/[\w/-]*/g, // mobile app deep link scheme
  /ui:\/\/postiz\/\w+/g, // MCP app resource URIs
  /\bpostiz-(?:upload|clipping|store|uploader|frontend|backend|orchestrator|app|agent)\b/g,
  /getAgent\(['"]postiz['"]\)|agent=["']postiz["']|agents: \{ postiz|\bpostiz: (?:await|agent)\b|(?:id|name): ['"]postiz['"]/g, // Mastra agent id
  /Symbol\.for\(['"]postiz\.[\w]+['"]\)/g,
  /\bpostiz-db\b|\bpostiz-(?:postgres|redis)\b/g,
  /\b[a-z0-9]+(?:_[a-z0-9]+)*_(?:postiz|gitroom)(?:_[a-z0-9]+)*\b|\b(?:postiz|gitroom)_[a-z0-9_]+\b/g, // translation keys
];
const strip = (line) => IDENTIFIERS.reduce((l, re) => l.replace(re, ''), line);

const findings = []; // { kind, file, text }

// 1. browser-bound upstream source + locales, after the build transform
const FRONT = ['apps/frontend/src', 'libraries/react-shared-libraries/src', 'libraries/helpers/src'];
for (const base of FRONT) {
  for (const file of walk(join(ROOT, base))) {
    if (!/\.(tsx?|jsx?|mjs|json|scss|css)$/.test(file) || isNeptive(file) || /\.spec\.|\.test\./.test(file)) continue;
    const out = transform(readFileSync(file, 'utf8'));
    if (!BRAND.test(strip(out))) continue;
    const kind = file.includes('/locales/') ? 'locale' : 'frontend';
    for (const line of out.split('\n')) {
      if (BRAND.test(strip(line)) && !isComment(line)) findings.push({ kind, file: rel(file), text: norm(line) });
    }
  }
}
// 2. server strings (quoted literals only; runtime-branded paths are emails and HttpException messages)
for (const base of ['apps/backend/src', 'apps/orchestrator/src', 'libraries/nestjs-libraries/src']) {
  for (const file of walk(join(ROOT, base))) {
    if (!/\.ts$/.test(file) || isNeptive(file) || /\.spec\.ts$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    if (!BRAND.test(src)) continue;
    for (const line of src.split('\n')) {
      if (isComment(line)) continue;
      const literals = line.match(/'[^']*'|"[^"]*"|`[^`]*`/g) || [];
      if (literals.some((l) => BRAND.test(strip(l)))) findings.push({ kind: 'server', file: rel(file), text: norm(line) });
    }
  }
}
// 3. logos
const logos = JSON.parse(readFileSync(join(ROOT, 'neptive/brand/upstream-logos.json'), 'utf8')).sha256;
for (const file of Object.keys(logos)) {
  if (!file.startsWith('apps/frontend/public/')) continue;
  const url = file.replace('apps/frontend/public', '');
  if (!brand.assets[url]) findings.push({ kind: 'logo', file, text: `upstream brand image ${url} is not redirected in brand.json assets` });
}
const known = new Set(Object.keys(logos));
for (const file of walk(join(ROOT, 'apps/frontend/public'))) {
  const r = rel(file);
  if (r.startsWith('apps/frontend/public/neptive/') || known.has(r)) continue;
  if (/\.(svg|png|ico|jpg|webp)$/.test(r) && /(postiz|gitroom|logo|favicon|brand|fav)/i.test(r.split('/').pop()))
    findings.push({ kind: 'logo', file: r, text: `new image that looks like a brand mark: /${r.replace('apps/frontend/public/', '')}` });
}
// 4. swapped upstream modules
const notes = [];
const swapsFile = join(ROOT, 'neptive/brand/swapped-modules.json');
const swaps = existsSync(swapsFile) ? JSON.parse(readFileSync(swapsFile, 'utf8')) : {};
const { ALIASES } = await import('../brand/next/with-neptive-brand.mjs');
const nextSwaps = {};
for (const spec of Object.keys(ALIASES)) {
  const base = join(ROOT, 'apps/frontend/src', spec.replace('@gitroom/frontend/', ''));
  const file = ['.tsx', '.ts'].map((e) => base + e).find(existsSync);
  if (!file) {
    findings.push({ kind: 'swap', file: spec, text: 'upstream module swapped by Neptive no longer exists: update ALIASES' });
    continue;
  }
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
  nextSwaps[rel(file)] = hash;
  if (swaps[rel(file)] && swaps[rel(file)] !== hash)
    notes.push(`upstream changed ${rel(file)} (swapped for a Neptive module): compare and port what matters, then --update`);
}

// compare with the allow-list
const key = (f) => `${f.kind}|${f.file}|${f.text}`;
const allow = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, 'utf8')) : { entries: [] };
const allowed = new Map(allow.entries.map((e) => [key(e), e]));
if (update) {
  const rules = require('../brand/allowlist-reasons.cjs');
  const reasonOf = (f) =>
    allowed.get(key(f))?.reason ||
    rules.find(([re]) => re.test(`${f.file} ${f.text}`))?.[1] ||
    'TODO: why is this acceptable?';
  const entries = findings.map((f) => ({ ...f, reason: reasonOf(f) }));
  writeFileSync(ALLOW_FILE, JSON.stringify({ $comment: allow.$comment || 'Accepted brand-check findings. Every entry needs a reason.', entries }, null, 1) + '\n');
  writeFileSync(swapsFile, JSON.stringify(nextSwaps, null, 1) + '\n');
  console.log(`allow-list rewritten: ${entries.length} entries (${entries.filter((e) => e.reason.startsWith('TODO')).length} without a reason)`);
  process.exit(0);
}
const fresh = findings.filter((f) => !allowed.has(key(f)));
const stale = allow.entries.filter((e) => !findings.some((f) => key(f) === key(e)));
const counts = findings.reduce((a, f) => ((a[f.kind] = (a[f.kind] || 0) + 1), a), {});
console.log(`brand-check: ${findings.length} occurrences scanned (${JSON.stringify(counts)}), ${allow.entries.length} allow-listed`);
for (const n of notes) console.log(`NOTE  ${n}`);
if (stale.length) console.log(`(${stale.length} allow-list entries no longer occur; --update to prune)`);
const todo = allow.entries.filter((e) => !e.reason || e.reason.startsWith('TODO'));
if (todo.length) console.log(`FAIL  ${todo.length} allow-list entries have no reason`);
if (fresh.length) {
  console.log(`FAIL  ${fresh.length} new user-visible brand occurrences:`);
  for (const f of fresh.slice(0, 80)) console.log(`  [${f.kind}] ${f.file}: ${f.text}`);
  if (fresh.length > 80) console.log(`  ... and ${fresh.length - 80} more`);
}
if (fresh.length || todo.length) {
  console.log('Fix them (brand.json words/assets, transform, or hide/remove the element) or allow-list with a reason (--update).');
  process.exit(1);
}
console.log('OK');
