import type { Prisma, PrismaClient, UserType } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  findUserByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }

  findUserByPhone(phone: string) {
    return this.db.user.findUnique({ where: { phone } });
  }

  findUserById(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }

  async createUserWithRole(
    data: { type: UserType; email?: string | null; phone?: string | null; passwordHash: string; firstName: string; lastName: string },
    roleKey: string,
  ) {
    return this.db.user.create({
      data: {
        ...data,
        roles: { create: { role: { connect: { key: roleKey } } } },
      },
    });
  }

  /** Role keys + permission keys for a user (used to build the access token). */
  async getAuthContext(userId: string) {
    const roles = await this.db.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const roleKeys = roles.map((r) => r.role.key);
    const perms = new Set<string>();
    for (const r of roles) for (const rp of r.role.permissions) perms.add(rp.permission.key);
    return { roles: roleKeys, permissions: [...perms] };
  }

  touchLastLogin(userId: string) {
    return this.db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  // ── refresh tokens ──
  createRefreshToken(
    db: Db,
    data: { userId: string; familyId: string; tokenHash: string; expiresAt: Date; ip?: string; userAgent?: string },
  ) {
    return db.refreshToken.create({ data });
  }

  findRefreshToken(tokenHash: string) {
    return this.db.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  }

  /** Atomically mark a token as used. Returns false if someone already used it (race / reuse). */
  async markRotated(db: Db, id: string, replacedBy: string) {
    const res = await db.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), replacedBy },
    });
    return res.count === 1;
  }

  revokeFamily(familyId: string) {
    return this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  get client() {
    return this.db;
  }
}
