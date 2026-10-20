import type { PrismaClient } from '@prisma/client';
import { slugify } from '../../src/shared/text';

// Demo Nairobi delivery zones. Fees in cents (KES × 100). Edit real fees in the admin panel.
const ZONES: Array<[name: string, customerFee: number, riderFee: number]> = [
  ['CBD', 200_00, 150_00],
  ['Westlands', 300_00, 200_00],
  ['Kilimani', 300_00, 200_00],
  ['Thika Road', 400_00, 300_00],
  ['Mombasa Road', 400_00, 300_00],
  ['Karen', 500_00, 350_00],
];

export async function seedZones(prisma: PrismaClient) {
  let order = 0;
  for (const [name, customerFeeCents, riderFeeCents] of ZONES) {
    await prisma.deliveryZone.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name), customerFeeCents, riderFeeCents, expressSurchargeCents: 200_00, sortOrder: order++ },
    });
  }
  console.log(`✔ ${ZONES.length} delivery zones`);
}
