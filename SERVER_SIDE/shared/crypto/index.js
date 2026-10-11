/**
 * Cryptographic utilities:
 * - AES-256-GCM field encryption (for national IDs, payout details, TOTP secrets)
 * - OTP code generation and hashing (HMAC-SHA256)
 * - Collection code (6-digit CSPRNG)
 * - SHA-256 hashing (refresh tokens, collection codes)
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_ID_PREFIX = 'k1:'; // key versioning prefix — rotate by bumping to k2: etc.

function getEncryptionKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error('FIELD_ENCRYPTION_KEY env var not set');
  // Accept hex-encoded 32-byte key
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return buf;
}

/** Encrypt a plaintext string → KEY_ID_PREFIX + base64(iv:tag:ciphertext) */
export function encryptField(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');
  return KEY_ID_PREFIX + payload;
}

/** Decrypt a field encrypted with encryptField */
export function decryptField(ciphertext) {
  if (!ciphertext.startsWith(KEY_ID_PREFIX)) {
    throw new Error('Unknown key version prefix');
  }
  const payload = Buffer.from(ciphertext.slice(KEY_ID_PREFIX.length), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** SHA-256 hash (hex) — used for refresh tokens */
export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Generate a random opaque token (n bytes → hex string) */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Generate a 6-digit OTP code using CSPRNG */
export function generateOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** HMAC-SHA256 of a code — used to store OTP codes without plaintext */
export function hmacOtp(code) {
  const secret = process.env.OTP_HMAC_SECRET;
  if (!secret) throw new Error('OTP_HMAC_SECRET env var not set');
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

/** Constant-time compare two hex strings */
export function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Generate a 6-digit collection code */
export function generateCollectionCode() {
  return generateOtpCode();
}

/** Hash a collection code with SHA-256 */
export function hashCollectionCode(code) {
  return sha256(code);
}
