/**
 * Users service — profile management, addresses, RBAC admin, customer management.
 */
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/codes.js';
import { recordAudit } from '../audit/audit.service.js';

// ── Profile ───────────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      customerProfile: true,
    },
  });
  if (!user || user.status === 'DELETED') throw new AppError('NOT_FOUND', 'User not found');

  const { passwordHash, totpSecretEnc, ...safe } = user;
  const permissions = [...new Set(
    user.roles.flatMap(ur => ur.role.permissions.map(rp => rp.permission.key))
  )];
  return { ...safe, permissions };
}

export async function updateProfile(userId, { firstName, lastName, email, phone }, actor) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('NOT_FOUND', 'User not found');

  // Check uniqueness of new email/phone
  if (email && email !== user.email) {
    const ex = await prisma.user.findUnique({ where: { email } });
    if (ex) throw new AppError('CONFLICT', 'Email already in use');
  }
  if (phone && phone !== user.phone) {
    const ex = await prisma.user.findUnique({ where: { phone } });
    if (ex) throw new AppError('CONFLICT', 'Phone already in use');
  }

  const updated = await prisma.$transaction(async tx => {
    const u = await tx.user.update({
      where: { id: userId },
      data: {
        firstName: firstName || undefined,
        lastName:  lastName  || undefined,
        email:     email     || undefined,
        phone:     phone     || undefined,
      },
    });
    await recordAudit({
      actor, action: 'user.profile_updated', entityType: 'user', entityId: userId,
      before: { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone },
      after:  { firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone },
    }, tx);
    return u;
  });

  const { passwordHash, totpSecretEnc, ...safe } = updated;
  return safe;
}

// ── Addresses ─────────────────────────────────────────────────────────────

export async function listAddresses(userId) {
  return prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
}

export async function createAddress(userId, data) {
  // If this is default, unset existing defaults
  if (data.isDefault) {
    await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
  }
  return prisma.address.create({ data: { ...data, userId } });
}

export async function updateAddress(userId, addressId, data) {
  const addr = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!addr) throw new AppError('NOT_FOUND', 'Address not found');

  if (data.isDefault) {
    await prisma.address.updateMany({ where: { userId, id: { not: addressId } }, data: { isDefault: false } });
  }
  return prisma.address.update({ where: { id: addressId }, data });
}

export async function deleteAddress(userId, addressId) {
  const addr = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!addr) throw new AppError('NOT_FOUND', 'Address not found');
  await prisma.address.delete({ where: { id: addressId } });
}

// ── Admin: users list + role assignment ──────────────────────────────────

export async function listUsers({ type, status, q, page = 1, pageSize = 25 }) {
  const where = {};
  if (type)   where.type   = type;
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName:  { contains: q, mode: 'insensitive' } },
      { email:     { contains: q, mode: 'insensitive' } },
      { phone:     { contains: q } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, type: true, status: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, pageSize };
}

export async function getUserDetail(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      customerProfile: true,
      addresses: true,
    },
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const { passwordHash, totpSecretEnc, ...safe } = user;
  return safe;
}

export async function assignRole(userId, roleKey, actor) {
  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.role.findUnique({ where: { key: roleKey } }),
  ]);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  if (!role) throw new AppError('NOT_FOUND', `Role ${roleKey} not found`);

  await prisma.$transaction(async tx => {
    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
    await recordAudit({ actor, action: 'user.role_assigned', entityType: 'user', entityId: userId, after: { roleKey } }, tx);
  });
}

export async function removeRole(userId, roleKey, actor) {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new AppError('NOT_FOUND', `Role ${roleKey} not found`);

  await prisma.$transaction(async tx => {
    await tx.userRole.deleteMany({ where: { userId, roleId: role.id } });
    await recordAudit({ actor, action: 'user.role_removed', entityType: 'user', entityId: userId, after: { roleKey } }, tx);
  });
}

export async function suspendUser(userId, reason, actor) {
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    // Revoke all refresh tokens
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit({ actor, action: 'user.suspended', entityType: 'user', entityId: userId, after: { reason } }, tx);
  });
}

export async function reactivateUser(userId, actor) {
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    await recordAudit({ actor, action: 'user.reactivated', entityType: 'user', entityId: userId }, tx);
  });
}

export async function deleteUser(userId, actor) {
  // Anonymise, keep orders for 7 years (KRA requirement)
  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        firstName: 'Deleted',
        lastName: 'User',
        email: null,
        phone: null,
        passwordHash: null,
        totpSecretEnc: null,
      },
    });
    await tx.address.deleteMany({ where: { userId } });
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit({ actor, action: 'user.deleted', entityType: 'user', entityId: userId }, tx);
  });
}

// ── Roles admin ───────────────────────────────────────────────────────────

export async function listRoles() {
  return prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { key: 'asc' },
  });
}
