import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, URL-safe. Used for refresh tokens, pay links, etc. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** We store only the hash of a token, never the token itself. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
