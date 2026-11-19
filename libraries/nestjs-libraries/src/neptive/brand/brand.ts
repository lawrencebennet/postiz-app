// Neptive white-label for the backend: text branding and the email layout.
// Same words as the frontend build transform (neptive/brand/transform.cjs), read from the same brand.json.
import brand from './brand.json';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const WORDS: Array<[RegExp, string]> = Object.entries(brand.replace.words)
  .filter(([from]) => !from.startsWith('$'))
  .map(([from, to]) => [
    /^[\x00-\x7f]+$/.test(from) ? new RegExp(`\\b${escape(from)}\\b`, 'g') : new RegExp(escape(from), 'g'),
    to as string,
  ]);
// links to the upstream product in text (emails, messages): point them at the Neptive site instead
const LINKS: Array<[RegExp, string]> = [
  [/https?:\/\/(?:www\.|docs\.|platform\.|affiliate\.)?postiz\.com[^\s"'<)]*/gi, brand.website],
];

export const neptiveBrand = brand;

/** Replace user-visible upstream brand words and links. Identifiers (x-postiz-org, POSTIZ_*) are untouched. */
export function brandText(value: string): string;
export function brandText(value: string | undefined | null): string | undefined | null;
export function brandText(value: string | undefined | null) {
  if (!value || !/postiz|gitroom/i.test(value)) return value;
  let out = value;
  for (const [re, to] of LINKS) out = out.replace(re, to);
  for (const [re, to] of WORDS) out = out.replace(re, to);
  return out;
}

const htmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The email every backend message goes out in (called from EmailService.sendEmailSync, the one place all
 * emails pass through). Table layout + inline styles for mail clients; Neptive Studio palette, system fonts.
 */
export function neptiveEmail(input: { subject: string; html: string; settingsUrl?: string; fromName?: string }) {
  const subject = brandText(input.subject) || '';
  const body = brandText(input.html) || '';
  const fromName = brandText(input.fromName) || brand.email.fromName;
  const ink = brand.palette.ink;
  const off = brand.palette.offWhite;
  const sans = "Helvetica Neue, Helvetica, Arial, sans-serif";
  const mono = "SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";
  const settings = input.settingsUrl
    ? `Puoi cambiare le notifiche email dalle <a href="${input.settingsUrl}" style="color:${ink};">impostazioni</a>.`
    : '';
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(subject)}</title></head>
<body style="margin:0;padding:0;background:#EEE8DC;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEE8DC;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${off};border:1px solid #E1DACD;">
    <tr><td style="background:${ink};padding:22px 28px;">
      <span style="font-family:${sans};font-size:22px;font-weight:700;letter-spacing:-0.5px;color:${off};">${htmlEscape(brand.shortName)}</span>
      <span style="font-family:${mono};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#A3A099;padding-left:8px;">Social Portal</span>
    </td></tr>
    <tr><td style="padding:32px 28px 8px 28px;">
      <h1 style="margin:0 0 20px 0;font-family:${sans};font-size:28px;line-height:1.1;font-weight:600;letter-spacing:-0.6px;color:${ink};">${htmlEscape(subject)}</h1>
      <div style="font-family:${sans};font-size:16px;line-height:1.55;color:#333534;">${body}</div>
    </td></tr>
    <tr><td style="padding:28px;">
      <div style="border-top:1px solid #E1DACD;padding-top:16px;font-family:${mono};font-size:11px;line-height:1.6;letter-spacing:0.3px;color:#66635E;">
        ${htmlEscape(fromName)} · <a href="${brand.website}" style="color:#66635E;">${brand.website.replace(/^https?:\/\//, '')}</a><br>${settings}
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
  return { subject, html, fromName };
}
