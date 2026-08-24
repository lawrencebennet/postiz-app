import { createHash, randomBytes } from 'crypto';

export function hashNeptiveToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function newNeptiveToken() {
  return randomBytes(32).toString('base64url');
}
