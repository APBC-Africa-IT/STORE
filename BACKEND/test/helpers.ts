import { randomInt, randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/db/prisma';
import { hashPassword } from '../src/shared/crypto/password';

export const randomPhone = () => `07${randomInt(10, 99)}${randomInt(100000, 999999)}`;
export const randomEmail = () => `user-${randomUUID().slice(0, 8)}@test.local`;

/** Creates a staff user with the given role directly in the database. */
export async function createStaffUser(roleKey: string, password = 'StaffPassword123') {
  const email = randomEmail();
  await prisma.user.create({
    data: {
      type: 'STAFF',
      email,
      firstName: 'Test',
      lastName: 'Staff',
      passwordHash: await hashPassword(password),
      roles: { create: { role: { connect: { key: roleKey } } } },
    },
  });
  return { email, password };
}

/** Signs an access token for a new staff user with the given role (skips the 2FA dance in tests). */
export async function staffToken(app: import('fastify').FastifyInstance, roleKey: string) {
  const { email } = await createStaffUser(roleKey);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  const perms = [...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)))];
  return app.jwt.sign({ sub: user.id, typ: user.type, roles: user.roles.map((r) => r.role.key), perms });
}
