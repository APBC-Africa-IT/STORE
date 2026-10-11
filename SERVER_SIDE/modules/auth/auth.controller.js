/**
 * Auth controller — thin HTTP layer.
 * Validates input, calls service, shapes response.
 */
import * as authService from './auth.service.js';
import { AppError } from '../../shared/errors/codes.js';

// ── Register ──────────────────────────────────────────────────────────────
export async function register(req, res) {
  const { firstName, lastName, email, phone, password, type } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Password must be at least 8 characters' } });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Email or phone required' } });
  }

  const actor = { ip: req.ip, userAgent: req.headers['user-agent'] };
  const result = await authService.registerUser({ firstName, lastName, email, phone, password, type }, actor);
  return res.status(201).json({ data: result });
}

// ── Verify email ─────────────────────────────────────────────────────────
export async function verifyEmail(req, res) {
  const { userId, token } = req.params;
  const result = await authService.verifyEmail(userId, token);
  return res.json({ data: result });
}

// ── Login ─────────────────────────────────────────────────────────────────
export async function login(req, res) {
  const { email, phone, password } = req.body;
  const result = await authService.loginUser(
    { email, phone, password },
    req.ip,
    req.headers['user-agent']
  );

  // If 2FA required, just return the challenge — no tokens yet
  if (result.twoFactorRequired) {
    return res.json({ data: result });
  }

  // Set refresh token in httpOnly cookie for web clients
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: parseInt(process.env.REFRESH_TTL_CUSTOMER_DAYS || '30') * 86400 * 1000,
  });

  return res.json({
    data: {
      accessToken: result.accessToken,
      user: result.user,
    },
  });
}

// ── Complete 2FA ──────────────────────────────────────────────────────────
export async function completeTwoFactor(req, res) {
  const { challengeId, totp } = req.body;
  const result = await authService.completeTwoFactor(
    challengeId, totp, req.ip, req.headers['user-agent']
  );

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true, sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 3600 * 1000,
  });
  return res.json({ data: { accessToken: result.accessToken, user: result.user } });
}

// ── Refresh ───────────────────────────────────────────────────────────────
export async function refresh(req, res) {
  const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!rawToken) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Refresh token required' } });
  }
  const result = await authService.rotateRefreshToken(rawToken, req.ip, req.headers['user-agent']);

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true, sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: parseInt(process.env.REFRESH_TTL_CUSTOMER_DAYS || '30') * 86400 * 1000,
  });
  return res.json({ data: { accessToken: result.accessToken } });
}

// ── Logout ────────────────────────────────────────────────────────────────
export async function logout(req, res) {
  const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
  await authService.logoutUser(rawToken);
  res.clearCookie('refreshToken');
  return res.json({ data: { message: 'Logged out' } });
}

// ── Password reset ────────────────────────────────────────────────────────
export async function requestPasswordReset(req, res) {
  const { email } = req.body;
  await authService.requestPasswordReset(email);
  return res.json({ data: { message: 'If that email exists, a reset link has been sent.' } });
}

export async function resetPassword(req, res) {
  const { token } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Password too short' } });
  }
  const result = await authService.resetPassword(token, newPassword);
  return res.json({ data: result });
}

// ── TOTP ─────────────────────────────────────────────────────────────────
export async function setupTotp(req, res) {
  const result = await authService.setupTotp(req.user.id);
  return res.json({ data: result });
}

export async function enableTotp(req, res) {
  const { code } = req.body;
  const result = await authService.enableTotp(req.user.id, code);
  return res.json({ data: result });
}

export async function disableTotp(req, res) {
  const { code } = req.body;
  const result = await authService.disableTotp(req.user.id, code);
  return res.json({ data: result });
}

// ── OTP (phone / SMS) ─────────────────────────────────────────────────────
export async function requestOtp(req, res) {
  const { phone, purpose } = req.body;
  const result = await authService.requestOtp(phone, purpose || 'VERIFY_PHONE');
  return res.json({ data: result });
}

export async function verifyOtp(req, res) {
  const { phone, purpose, code } = req.body;
  const result = await authService.verifyOtp(phone, purpose || 'VERIFY_PHONE', code);
  return res.json({ data: result });
}

// ── Me ────────────────────────────────────────────────────────────────────
export async function getMe(req, res) {
  const { passwordHash, totpSecretEnc, ...safe } = req.user;
  return res.json({ data: safe });
}
