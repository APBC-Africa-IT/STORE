import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { config } from '../../config/config';

/** 256-bit random token, URL-safe. Used for refresh tokens, pay links, etc. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** We store only the hash of a token, never the token itself. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** A short numeric code people can read out loud, e.g. "482913" (collection codes, delivery OTPs). */
export function generateNumericCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}

/** Keyed hash for short codes: a stolen database alone can't be used to guess them. */
export function hmacCode(value: string): string {
  return createHmac('sha256', config.FIELD_ENCRYPTION_KEY).update(value).digest('hex');
}
