import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLES } from '../../src/shared/auth/permissions';
import { hashPassword } from '../../src/shared/crypto/password';
import { seedCatalog } from './catalog';

const prisma = new PrismaClient();

async function main() {
  // 1. Permissions
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  console.log(`✔ ${PERMISSIONS.length} permissions`);

  // 2. Roles + their permissions (re-running the seed syncs changes)
  for (const [key, def] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({ where: { key }, update: { name: def.name }, create: { key, name: def.name } });
    const perms = await prisma.permission.findMany({ where: { key: { in: [...def.permissions] } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (perms.length) {
      await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
    }
  }
  console.log(`✔ ${Object.keys(ROLES).length} roles`);

  // 3. First admin
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✔ admin ${email} already exists`);
  } else {
    await prisma.user.create({
      data: {
        type: 'STAFF',
        email,
        firstName: 'System',
        lastName: 'Admin',
        passwordHash: await hashPassword(password),
        roles: { create: { role: { connect: { key: 'SUPER_ADMIN' } } } },
      },
    });
    console.log(`✔ admin ${email} created`);
  }

  // 4. Demo catalogue (development only)
  if (process.env.SEED_DEMO_DATA === 'true') {
    await seedCatalog(prisma);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
