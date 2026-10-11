/**
 * Auth service — all auth business logic.
 * Handles: register, login (with 2FA challenge), token rotation,
 * logout, OTP verification, password reset, TOTP setup/verify/disable.
 *
 * Passwords: argon2id (memory=19MiB, iterations=2) when native build is available.
 * Falls back to bcryptjs (rounds=12) gracefully if argon2 native build is missing.
 * To use argon2: install build tools then `npm install argon2`.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import crypto from 'crypto';
import { prisma } from '../../shared/db/prisma.js';
import { redis } from '../../shared/db/redis.js';
import { AppError } from '../../shared/errors/codes.js';
import { sha256, randomToken, generateOtpCode, hmacOtp, safeCompare, encryptField, decryptField } from '../../shared/crypto/index.js';
import { recordAudit } from '../audit/audit.service.js';
import { emitOutboxEvent } from '../../shared/events/outbox.js';
import { EVENTS } from '../../shared/events/event-types.js';
import { sendVerificationEmail, sendResetPasswordEmail, sendOtpSms } from '../notifications/notifications.service.js';

// ── Password hashing adapter (argon2id → bcryptjs fallback) ─────────────
// argon2 requires native build tools. When available it takes precedence.
let _argon2 = null;
async function loadArgon2() {
  if (_argon2 !== null) return _argon2;
  try { _argon2 = await import('argon2'); } catch { _argon2 = false; }
  return _argon2;
}

export async function hashPassword(plaintext) {
  const a2 = await loadArgon2();
  if (a2) {
    return a2.hash(plaintext, { type: a2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }
  return bcrypt.hash(plaintext, 12);
}

export async function verifyPassword(plaintext, hash) {
  const a2 = await loadArgon2();
  if (a2) {
    // Argon2 hashes start with $argon2; bcrypt hashes start with $2b
    if (hash.startsWith('$argon2')) return a2.verify(hash, plaintext);
    // Legacy bcrypt hash — verify with bcrypt, then re-hash with argon2 on next save
    return bcrypt.compare(plaintext, hash);
  }
  return bcrypt.compare(plaintext, hash);
}

const JWT_SECRET         = process.env.JWT_SECRET         || 'fallback_dev_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
const ACCESS_TTL_SECS    = parseInt(process.env.JWT_ACCESS_TTL_SECONDS || '900');
const REFRESH_TTL_CUSTOMER_DAYS = parseInt(process.env.REFRESH_TTL_CUSTOMER_DAYS || '30');
const REFRESH_TTL_STAFF_HOURS   = parseInt(process.env.REFRESH_TTL_STAFF_HOURS   || '12');

function isStaff(userType) {
  return ['STAFF', 'SUPPLIER_USER'].includes(userType);
}

function refreshTtlMs(userType) {
  if (isStaff(userType)) return REFRESH_TTL_STAFF_HOURS  * 3600 * 1000;
  return REFRESH_TTL_CUSTOMER_DAYS * 86400 * 1000;
}

// ── Token generation ────────────────────────────────────────────────────────
export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, typ: user.type, isAdmin: user.roles?.some(r => r.role.key === 'SUPER_ADMIN') ?? false },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL_SECS }
  );
}

async function createRefreshToken(userId, userType, ip, userAgent) {
  const familyId = crypto.randomUUID();
  const raw      = randomToken(32);
  const hash     = sha256(raw);
  const expiresAt = new Date(Date.now() + refreshTtlMs(userType));

  await prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: hash, expiresAt, ip: ip || null, userAgent: userAgent || null },
  });
  return raw;
}

// ── Registration ────────────────────────────────────────────────────────────
export async function registerUser({ firstName, lastName, email, phone, password, type = 'CUSTOMER' }, actor = {}) {
  // Check uniqueness
  const existing = await prisma.user.findFirst({
    where: { OR: [email ? { email } : {}, phone ? { phone } : {}].filter(o => Object.keys(o).length) },
  });
  if (existing) throw new AppError('CONFLICT', 'Email or phone already registered');

  const passwordHash = await hashPassword(password);

  // Verification token
  const verifyToken      = randomToken(32);
  const verifyTokenHash  = sha256(verifyToken);
  const verifyExpiry     = new Date(Date.now() + 24 * 3600 * 1000);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        type, firstName, lastName,
        email: email || null,
        phone: phone || null,
        passwordHash,
        status: 'PENDING',
      },
    });

    // Assign default role
    const roleKey = type === 'STAFF' ? 'SALES_STAFF' : 'CUSTOMER';
    const role = await tx.role.findUnique({ where: { key: roleKey } });
    if (role) await tx.userRole.create({ data: { userId: u.id, roleId: role.id } });

    // Create customer profile
    if (type === 'CUSTOMER' || type === 'TRADE_CUSTOMER') {
      await tx.customerProfile.create({ data: { userId: u.id } });
    }

    await emitOutboxEvent(EVENTS.USER_REGISTERED, 'user', u.id, { userId: u.id, email, phone }, tx);
    await recordAudit({ actor, action: 'user.registered', entityType: 'user', entityId: u.id, after: { type, email, phone } }, tx);

    return u;
  });

  // Send verification email (outside transaction — side effect)
  if (email) {
    try {
      await sendVerificationEmail({ id: user.id, email, firstName }, verifyToken);
    } catch (e) {
      console.error('[auth] Failed to send verification email:', e.message);
    }
  }

  // Store verify token in Redis (short-lived, 24h)
  await redis.setex(`verify:${user.id}`, 86400, verifyTokenHash);

  return { message: 'Registered. Check your email for a verification link.' };
}

// ── Email verification ───────────────────────────────────────────────────────
export async function verifyEmail(userId, token) {
  const storedHash = await redis.get(`verify:${userId}`);
  if (!storedHash) throw new AppError('NOT_FOUND', 'Verification token expired or not found');

  const tokenHash = sha256(token);
  if (!safeCompare(tokenHash, storedHash)) {
    throw new AppError('FORBIDDEN', 'Invalid verification token');
  }

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), status: 'ACTIVE' } });
  await redis.del(`verify:${userId}`);

  return { message: 'Email verified. You can now log in.' };
}

// ── Login ────────────────────────────────────────────────────────────────────
export async function loginUser({ email, phone, password }, ip, userAgent) {
  const where = email ? { email } : phone ? { phone } : null;
  if (!where) throw new AppError('VALIDATION_FAILED', 'Email or phone required');

  const user = await prisma.user.findUnique({
    where,
    include: { roles: { include: { role: true } } },
  });
  if (!user || !user.passwordHash) throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
  if (user.isDeleted || user.status === 'DELETED') throw new AppError('FORBIDDEN', 'Account deleted');
  if (user.status === 'SUSPENDED') throw new AppError('FORBIDDEN', 'Account suspended');

  // Brute-force guard — 5 failures → 15 min lockout
  const failKey = `login_fail:${user.id}`;
  const fails   = parseInt(await redis.get(failKey) || '0');
  if (fails >= 5) throw new AppError('RATE_LIMITED', 'Too many failed attempts. Try again in 15 minutes.');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await redis.multi().incr(failKey).expire(failKey, 900).exec();
    throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
  }
  await redis.del(failKey);

  // Staff & supplier must complete 2FA before receiving tokens
  if (isStaff(user.type) && user.totpEnabledAt) {
    const challengeId = randomToken(16);
    await redis.setex(`2fa_challenge:${challengeId}`, 300, user.id);
    return { twoFactorRequired: true, challengeId };
  }

  // Issue tokens
  const accessToken  = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id, user.type, ip, userAgent);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    accessToken, refreshToken,
    user: { id: user.id, type: user.type, email: user.email, phone: user.phone,
            firstName: user.firstName, lastName: user.lastName },
  };
}

// ── 2FA challenge completion ──────────────────────────────────────────────
export async function completeTwoFactor(challengeId, totp, ip, userAgent) {
  const userId = await redis.get(`2fa_challenge:${challengeId}`);
  if (!userId) throw new AppError('UNAUTHENTICATED', '2FA challenge expired or invalid');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || !user.totpSecretEnc) throw new AppError('UNAUTHENTICATED', '2FA not set up');

  const secret = decryptField(user.totpSecretEnc);
  const valid  = authenticator.verify({ token: totp, secret });
  if (!valid) throw new AppError('UNAUTHENTICATED', 'Invalid TOTP code');

  await redis.del(`2fa_challenge:${challengeId}`);

  const accessToken  = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id, user.type, ip, userAgent);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return { accessToken, refreshToken, user: { id: user.id, type: user.type } };
}

// ── Refresh token rotation ────────────────────────────────────────────────
export async function rotateRefreshToken(rawRefreshToken, ip, userAgent) {
  const tokenHash = sha256(rawRefreshToken);

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored) throw new AppError('UNAUTHENTICATED', 'Refresh token not found');

  // Token reuse detection — revoke entire family
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId },
      data:  { revokedAt: new Date() },
    });
    throw new AppError('UNAUTHENTICATED', 'Refresh token reuse detected — all sessions revoked');
  }

  if (stored.expiresAt < new Date()) throw new AppError('UNAUTHENTICATED', 'Refresh token expired');

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.isDeleted) throw new AppError('UNAUTHENTICATED', 'User not found');

  // Revoke old token
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  // Issue new token
  const newRefreshToken = await createRefreshToken(user.id, user.type, ip, userAgent);
  const accessToken     = signAccessToken(user);

  return { accessToken, refreshToken: newRefreshToken };
}

// ── Logout ────────────────────────────────────────────────────────────────
export async function logoutUser(rawRefreshToken) {
  if (!rawRefreshToken) return;
  const tokenHash = sha256(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where:  { tokenHash, revokedAt: null },
    data:   { revokedAt: new Date() },
  });
}

// ── Password reset request ────────────────────────────────────────────────
export async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // don't leak existence

  const token    = randomToken(32);
  const hash     = sha256(token);
  const expiry   = new Date(Date.now() + 3600 * 1000);

  await redis.setex(`pwreset:${hash}`, 3600, user.id);
  await sendResetPasswordEmail(email, `${process.env.APP_URL || 'http://localhost:5002'}/reset-password?token=${token}`);
}

export async function resetPassword(token, newPassword) {
  const hash   = sha256(token);
  const userId = await redis.get(`pwreset:${hash}`);
  if (!userId) throw new AppError('NOT_FOUND', 'Invalid or expired reset token');

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  // Revoke all refresh tokens
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await redis.del(`pwreset:${hash}`);

  return { message: 'Password reset. Please log in.' };
}

// ── TOTP Setup ────────────────────────────────────────────────────────────
export async function setupTotp(userId) {
  const secret = authenticator.generateSecret();
  const user   = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('NOT_FOUND', 'User not found');

  const otpauth = authenticator.keyuri(user.email || user.phone, 'MySpares', secret);

  // Store encrypted secret temporarily in Redis until confirmed
  const enc = encryptField(secret);
  await redis.setex(`totp_setup:${userId}`, 600, enc);

  return { otpauth, secret };
}

export async function enableTotp(userId, code) {
  const enc = await redis.get(`totp_setup:${userId}`);
  if (!enc) throw new AppError('NOT_FOUND', 'TOTP setup session expired');

  const secret = decryptField(enc);
  const valid  = authenticator.verify({ token: code, secret });
  if (!valid) throw new AppError('UNAUTHENTICATED', 'Invalid TOTP code');

  await prisma.user.update({
    where: { id: userId },
    data:  { totpSecretEnc: enc, totpEnabledAt: new Date() },
  });
  await redis.del(`totp_setup:${userId}`);

  return { message: '2FA enabled successfully' };
}

export async function disableTotp(userId, code) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpSecretEnc) throw new AppError('NOT_FOUND', '2FA not enabled');

  const secret = decryptField(user.totpSecretEnc);
  const valid  = authenticator.verify({ token: code, secret });
  if (!valid) throw new AppError('UNAUTHENTICATED', 'Invalid TOTP code');

  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null } });
  return { message: '2FA disabled' };
}

// ── OTP (phone) ────────────────────────────────────────────────────────────
export async function requestOtp(phone, purpose) {
  // Rate limit: 3 per 10 min per phone
  const rlKey  = `otp_rl:${phone}`;
  const count  = parseInt(await redis.get(rlKey) || '0');
  if (count >= 3) throw new AppError('RATE_LIMITED', 'Too many OTP requests');

  const code     = generateOtpCode();
  const codeHash = hmacOtp(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.otpCode.create({ data: { phone, purpose, codeHash, expiresAt } });
  await redis.multi().incr(rlKey).expire(rlKey, 600).exec();

  await sendOtpSms(phone, code);
  return { message: 'OTP sent' };
}

export async function verifyOtp(phone, purpose, code) {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw new AppError('NOT_FOUND', 'OTP expired or not found');

  if (otp.attempts >= 5) throw new AppError('RATE_LIMITED', 'Too many OTP attempts');

  const hash  = hmacOtp(code);
  const valid = safeCompare(hash, otp.codeHash);

  await prisma.otpCode.update({
    where: { id: otp.id },
    data:  { attempts: otp.attempts + 1, usedAt: valid ? new Date() : undefined },
  });

  if (!valid) throw new AppError('UNAUTHENTICATED', 'Invalid OTP code');

  return { verified: true };
}
