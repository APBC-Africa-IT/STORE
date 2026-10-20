import { Secret, TOTP } from 'otpauth';

const ISSUER = 'MySpares';

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function totpFor(secretBase32: string, label: string) {
  return new TOTP({ issuer: ISSUER, label, algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secretBase32) });
}

/** The URL authenticator apps understand (also what the QR code encodes). */
export function totpUri(secretBase32: string, label: string): string {
  return totpFor(secretBase32, label).toString();
}

/** Accepts the current code and one step either side (clock drift). */
export function verifyTotp(secretBase32: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return totpFor(secretBase32, 'verify').validate({ token: code, window: 1 }) !== null;
}
