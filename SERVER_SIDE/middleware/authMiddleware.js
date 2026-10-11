/**
 * Authentication & authorisation middleware.
 *
 * protectRoute   — verifies JWT, attaches req.user
 * requirePermission(perm) — checks RBAC permission
 * requireAnyPermission([perms]) — at least one of the listed permissions
 * protectAdmin   — legacy simple isAdmin check (kept for backward compat)
 * optionalAuth   — attaches req.user if token present, but doesn't block
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { prisma } from '../shared/db/prisma.js';
import { AppError } from '../shared/errors/codes.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_dev_secret';

// ── Token verification ──────────────────────────────────────────────────────
function extractToken(req) {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  // 2. Cookie (legacy)
  if (req.cookies?.jwt) return req.cookies.jwt;
  return null;
}

async function verifyAndLoadUser(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired token');
  }

  // Load user with roles + permissions from Prisma
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub ?? decoded.id },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user || user.isDeleted || user.status === 'DELETED') {
    throw new AppError('UNAUTHENTICATED', 'User not found or deleted');
  }
  if (user.status === 'SUSPENDED') {
    throw new AppError('FORBIDDEN', 'Account suspended');
  }

  // Flatten permission keys
  const permissions = new Set();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) {
      permissions.add(rp.permission.key);
    }
  }

  return { ...user, permissionSet: permissions };
}

// ── Middleware: require authentication ──────────────────────────────────────
export const protectRoute = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'No token provided' } });
    }
    req.user = await verifyAndLoadUser(token);
    next();
  } catch (err) {
    if (err.isAppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication failed' } });
  }
};

// ── Middleware: optional authentication (guest-friendly routes) ─────────────
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (token) {
      req.user = await verifyAndLoadUser(token);
    }
  } catch {
    // ignore — guest continues
  }
  next();
};

// ── Middleware: require a specific permission ───────────────────────────────
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }
    if (!req.user.permissionSet?.has(permission)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Missing permission: ${permission}` } });
    }
    next();
  };
}

// ── Middleware: require at least one of a list of permissions ───────────────
export function requireAnyPermission(permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }
    const has = permissions.some(p => req.user.permissionSet?.has(p));
    if (!has) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };
}

// ── Legacy: simple isAdmin check ─────────────────────────────────────────
export const protectAdmin = (req, res, next) => {
  if (!req.user?.isAdmin && !req.user?.roles?.some(r => r.role.key === 'SUPER_ADMIN' || r.role.key === 'OPERATIONS_MANAGER')) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
  }
  next();
};

// ── IP allowlist for admin routes ─────────────────────────────────────────
export function adminIpGuard(req, res, next) {
  const allowlist = process.env.ADMIN_IP_ALLOWLIST;
  if (!allowlist) return next(); // disabled

  const clientIp = req.ip || req.connection?.remoteAddress || '';
  const allowed = allowlist.split(',').map(s => s.trim()).filter(Boolean);

  const isAllowed = allowed.some(cidr => {
    if (!cidr.includes('/')) return clientIp === cidr;
    // Simple /24 CIDR check
    const [network, bits] = cidr.split('/');
    const mask = ~((1 << (32 - parseInt(bits))) - 1);
    const toInt = ip => ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0);
    try {
      return (toInt(clientIp) & mask) === (toInt(network) & mask);
    } catch {
      return false;
    }
  });

  if (!isAllowed) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied from this IP' } });
  }
  next();
}

export default { protectRoute, optionalAuth, requirePermission, requireAnyPermission, protectAdmin, adminIpGuard };
