import { createHash, randomInt } from 'crypto';

// Rules of the portal client passwords. Numbers are documented in neptive/docs/client-credentials.md;
// change them there too.

export const PASSWORD_MIN_LENGTH = 10;
// bcrypt only reads the first 72 bytes: a longer password would silently match any other with the
// same first 72 bytes, so it is refused instead of truncated.
export const PASSWORD_MAX_BYTES = 72;

export type PasswordProblem =
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_IS_EMAIL'
  | 'PASSWORD_TOO_COMMON';

// Trivial values (compared lower-cased, spaces removed). Short on purpose: length >= 10 already rules
// out most dictionary words; this catches the obvious long ones.
const TRIVIAL = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  'passwordpassword',
  'passw0rd123',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  'qwertyuiop123',
  'asdfghjkl1',
  'azertyuiop',
  'iloveyou12',
  'iloveyou123',
  'abcdefghij',
  'abcd123456',
  'abc1234567',
  'abcdefg123',
  'benvenuto1',
  'benvenuto123',
  'ciaociao12',
  'ciao123456',
  'neptive123',
  'neptive2026',
  'neptivesocial',
  'portaleclienti',
  'changeme123',
  'welcome123',
  'letmein123',
  'admin12345',
  'administrator',
]);

const SEQUENCES = [
  '0123456789012345678901234567890123456789',
  'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
  'qwertyuiopasdfghjklzxcvbnm',
];

function isSequence(value: string) {
  for (const source of SEQUENCES) {
    const reversed = source.split('').reverse().join('');
    if (source.includes(value) || reversed.includes(value)) {
      return true;
    }
  }
  return false;
}

export function passwordProblem(
  password: string,
  email: string
): PasswordProblem | null {
  if (typeof password !== 'string' || [...password].length < PASSWORD_MIN_LENGTH) {
    return 'PASSWORD_TOO_SHORT';
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return 'PASSWORD_TOO_LONG';
  }
  const normalized = password.trim().toLowerCase();
  const mail = (email || '').trim().toLowerCase();
  const local = mail.split('@')[0] || '';
  if (normalized === mail || (local.length >= 3 && normalized.replace(/[^a-z0-9]/g, '') === local.replace(/[^a-z0-9]/g, ''))) {
    return 'PASSWORD_IS_EMAIL';
  }
  const compact = normalized.replace(/\s+/g, '');
  if (TRIVIAL.has(compact)) {
    return 'PASSWORD_TOO_COMMON';
  }
  if (new Set(compact).size <= 2) {
    // aaaaaaaaaa, ababababab
    return 'PASSWORD_TOO_COMMON';
  }
  if (isSequence(compact)) {
    return 'PASSWORD_TOO_COMMON';
  }
  return null;
}

// Temporary password: 16 characters from an alphabet without look-alikes (no 0/o, 1/l/i), grouped
// by four for dictation: about 80 bits. Shown once to the agency, never stored in clear.
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newTemporaryPassword() {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let part = '';
    for (let i = 0; i < 4; i++) {
      part += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    }
    groups.push(part);
  }
  return groups.join('-');
}

export function normalizeLoginEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Throttling buckets are stored hashed: the table never holds an email or an IP address.
export function throttleBucket(scope: 'email' | 'ip' | 'device' | 'change', key: string) {
  return createHash('sha256').update(`neptive-login:${scope}:${key}`).digest('hex');
}

export function emailFingerprint(email: string) {
  return createHash('sha256').update(`neptive-device:${normalizeLoginEmail(email)}`).digest('hex').slice(0, 32);
}

/**
 * Client address behind the reverse proxies. Production: host nginx -> container nginx -> backend, both
 * append to X-Forwarded-For, so the client is the entry `hops` places from the right (default 2; set
 * NEPTIVE_TRUSTED_PROXY_HOPS if the chain changes). Entries further left are written by the client and
 * are ignored. Without the header (local dev, direct calls) the socket address is used.
 */
export function clientIp(
  forwardedFor: string | string[] | undefined,
  socketAddress: string | undefined,
  hops = Number(process.env.NEPTIVE_TRUSTED_PROXY_HOPS ?? 2)
) {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor || '';
  const parts = header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length && Number.isFinite(hops) && hops > 0) {
    return parts.length >= hops ? parts[parts.length - hops] : parts[0];
  }
  return socketAddress || 'unknown';
}
