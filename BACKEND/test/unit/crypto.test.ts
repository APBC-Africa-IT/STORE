import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../../src/shared/crypto/encryption';
import { hashPassword, verifyPassword } from '../../src/shared/crypto/password';
import { generateOpaqueToken, sha256 } from '../../src/shared/crypto/tokens';
import { normalizePhone } from '../../src/shared/phone';

describe('encryption', () => {
  it('round-trips a value', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('produces different ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('rejects tampered ciphertext', () => {
    const parts = encrypt('hello').split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decrypt(parts.join('.'))).toThrow();
  });
});

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('CorrectHorse123');
    expect(hash).not.toContain('CorrectHorse123');
    expect(await verifyPassword(hash, 'CorrectHorse123')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});

describe('tokens', () => {
  it('generates unique 43-char tokens and stable hashes', () => {
    const a = generateOpaqueToken();
    expect(a).toHaveLength(43);
    expect(a).not.toBe(generateOpaqueToken());
    expect(sha256(a)).toBe(sha256(a));
  });
});

describe('normalizePhone', () => {
  it.each([
    ['0712345678', '+254712345678'],
    ['0712 345 678', '+254712345678'],
    ['+254712345678', '+254712345678'],
    ['254712345678', '+254712345678'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('rejects junk', () => {
    expect(normalizePhone('12345')).toBeNull();
  });
});
