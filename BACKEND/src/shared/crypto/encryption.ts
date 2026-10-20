import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../../config/config';

// AES-256-GCM for sensitive columns (TOTP secrets, rider ID numbers, payout details…).
// Stored format: v1.<iv>.<authTag>.<ciphertext>  (all base64url). "v1" lets us rotate keys later.
const KEY = Buffer.from(config.FIELD_ENCRYPTION_KEY, 'base64');

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decrypt(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unsupported ciphertext format');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
