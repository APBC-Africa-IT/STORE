/**
 * Database seed — roles/permissions, ledger accounts, business settings, demo data.
 * Run with: node prisma/seed/index.js
 * Or via: npx prisma db seed (add "seed" script to package.json if needed)
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../SERVER_SIDE/shared/auth/permissions.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Permissions ──────────────────────────────────────────────────────────
  console.log('  → Permissions...');
  for (const [, key] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }

  // ── Roles + role-permissions ──────────────────────────────────────────────
  console.log('  → Roles...');
  for (const [roleKey, permKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: { name: roleKey.replace(/_/g, ' ') },
      create: { key: roleKey, name: roleKey.replace(/_/g, ' ') },
    });

    // Delete existing role permissions and re-create (idempotent)
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permKey of permKeys) {
      const perm = await prisma.permission.findUnique({ where: { key: permKey } });
      if (perm) {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      }
    }
  }

  // ── Ledger accounts ────────────────────────────────────────────────────────
  console.log('  → Ledger accounts...');
  const accounts = [
    { code: '1000', name: 'Cash — Till',           type: 'ASSET' },
    { code: '1010', name: 'M-Pesa Clearing',        type: 'ASSET' },
    { code: '1020', name: 'Card Clearing',          type: 'ASSET' },
    { code: '1030', name: 'Bank',                   type: 'ASSET' },
    { code: '1040', name: 'COD Cash in Transit',    type: 'ASSET' },
    { code: '1100', name: 'Accounts Receivable',    type: 'ASSET' },
    { code: '1200', name: 'Inventory',              type: 'ASSET' },
    { code: '2000', name: 'Supplier Payables',      type: 'LIABILITY' },
    { code: '2010', name: 'Rider Payables',         type: 'LIABILITY' },
    { code: '2100', name: 'VAT Output',             type: 'LIABILITY' },
    { code: '2200', name: 'Customer Deposits',      type: 'LIABILITY' },
    { code: '4000', name: 'Sales Revenue — Parts',  type: 'REVENUE' },
    { code: '4010', name: 'Delivery Revenue',       type: 'REVENUE' },
    { code: '5000', name: 'Cost of Goods Sold',     type: 'EXPENSE' },
    { code: '5100', name: 'Delivery Logistics Cost',type: 'EXPENSE' },
    { code: '5200', name: 'Inventory Write-offs',   type: 'EXPENSE' },
  ];
  for (const acc of accounts) {
    await prisma.ledgerAccount.upsert({ where: { code: acc.code }, update: { name: acc.name, type: acc.type }, create: acc });
  }

  // ── Business settings ──────────────────────────────────────────────────────
  console.log('  → Business settings...');
  const { SETTING_DEFAULTS } = await import('../../SERVER_SIDE/modules/settings/settings.service.js');
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // ── Default inventory location ─────────────────────────────────────────────
  console.log('  → Default location...');
  await prisma.location.upsert({
    where: { code: 'HUB-NBO' },
    update: {},
    create: { code: 'HUB-NBO', name: 'Nairobi Hub', isDefault: true, address: 'Nairobi, Kenya' },
  });

  // ── Demo admin user ────────────────────────────────────────────────────────
  console.log('  → Demo admin user...');
  const { hashPassword } = await import('../../SERVER_SIDE/modules/auth/auth.service.js');
  const adminPwHash = await hashPassword('Admin@MySpares2026!');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@myspares.co.ke' },
    update: {},
    create: {
      type: 'STAFF',
      status: 'ACTIVE',
      email: 'admin@myspares.co.ke',
      firstName: 'System',
      lastName: 'Admin',
      passwordHash: adminPwHash,
      emailVerifiedAt: new Date(),
    },
  });

  const superAdminRole = await prisma.role.findUnique({ where: { key: 'SUPER_ADMIN' } });
  if (superAdminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: superAdminRole.id },
    });
  }

  // ── Demo categories ────────────────────────────────────────────────────────
  console.log('  → Demo categories...');
  const categories = [
    { name: 'Brakes', slug: 'brakes', sortOrder: 1 },
    { name: 'Suspension', slug: 'suspension', sortOrder: 2 },
    { name: 'Engine', slug: 'engine', sortOrder: 3 },
    { name: 'Electrical', slug: 'electrical', sortOrder: 4 },
    { name: 'Body Parts', slug: 'body-parts', sortOrder: 5 },
    { name: 'Filters', slug: 'filters', sortOrder: 6 },
    { name: 'Tyres & Wheels', slug: 'tyres-wheels', sortOrder: 7 },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({ where: { slug: cat.slug }, update: {}, create: cat });
  }

  // ── Demo brands ────────────────────────────────────────────────────────────
  console.log('  → Demo brands...');
  const brands = [
    { name: 'Toyota Genuine', slug: 'toyota-genuine' },
    { name: 'Brembo', slug: 'brembo' },
    { name: 'Bosch', slug: 'bosch' },
    { name: 'NGK', slug: 'ngk' },
    { name: 'Denso', slug: 'denso' },
    { name: 'Monroe', slug: 'monroe' },
  ];
  for (const brand of brands) {
    await prisma.brand.upsert({ where: { slug: brand.slug }, update: {}, create: brand });
  }

  // ── Demo vehicle data ──────────────────────────────────────────────────────
  console.log('  → Demo vehicles...');
  const toyotaMake = await prisma.vehicleMake.upsert({ where: { slug: 'toyota' }, update: {}, create: { name: 'Toyota', slug: 'toyota' } });
  const subaruMake = await prisma.vehicleMake.upsert({ where: { slug: 'subaru' }, update: {}, create: { name: 'Subaru', slug: 'subaru' } });

  const corollaModel = await prisma.vehicleModel.upsert({
    where: { makeId_slug: { makeId: toyotaMake.id, slug: 'corolla' } },
    update: {},
    create: { makeId: toyotaMake.id, name: 'Corolla', slug: 'corolla' },
  });
  await prisma.vehicle.upsert({
    where: { externalRef: 'COROLLA_2014_2019' },
    update: {},
    create: { modelId: corollaModel.id, yearFrom: 2014, yearTo: 2019, engine: '1.8L 2ZR-FE Petrol', externalRef: 'COROLLA_2014_2019' },
  });

  // ── Demo POS register ──────────────────────────────────────────────────────
  console.log('  → Demo POS register...');
  const location = await prisma.location.findFirst({ where: { isDefault: true } });
  if (location) {
    await prisma.register.upsert({
      where: { code: 'POS-01' },
      update: {},
      create: { code: 'POS-01', locationId: location.id, isActive: true },
    });
  }

  // ── Demo delivery zone ─────────────────────────────────────────────────────
  console.log('  → Demo delivery zones...');
  const zones = [
    { name: 'Nairobi CBD', customerFeeCents: 30000, riderFeeCents: 20000, expressSurchargeCents: 20000 },
    { name: 'Westlands',   customerFeeCents: 35000, riderFeeCents: 25000, expressSurchargeCents: 20000 },
    { name: 'Kilimani',    customerFeeCents: 35000, riderFeeCents: 25000, expressSurchargeCents: 20000 },
    { name: 'Thika Road',  customerFeeCents: 45000, riderFeeCents: 35000, expressSurchargeCents: 30000 },
  ];
  for (const zone of zones) {
    const existing = await prisma.deliveryZone.findFirst({ where: { name: zone.name } });
    if (!existing) await prisma.deliveryZone.create({ data: { ...zone, feeType: 'FLAT', isActive: true } });
  }

  console.log('✅ Seed complete!');
  console.log('   Admin: admin@myspares.co.ke / Admin@MySpares2026!');
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
