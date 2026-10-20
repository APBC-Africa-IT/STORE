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
