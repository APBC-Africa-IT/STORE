import type { PrismaClient } from '@prisma/client';
import { encrypt } from '../../src/shared/crypto/encryption';
import { nextRiderCode } from '../../src/shared/ids/numbers';

// Demo boda boda riders (development only). The ID numbers are fake.
const RIDERS = [
  { name: 'Peter Kamau', phone: '+254712000101', nationalId: '20111101', bikePlate: 'KMFA 101A', isPreferred: true },
  { name: 'Brian Otieno', phone: '+254712000102', nationalId: '20111102', bikePlate: 'KMFB 102B', isPreferred: false },
];

export async function seedRiders(prisma: PrismaClient) {
  for (const r of RIDERS) {
    if (await prisma.rider.findUnique({ where: { phone: r.phone } })) continue;
    await prisma.rider.create({
      data: {
        code: await nextRiderCode(prisma), name: r.name, phone: r.phone, mpesaNumber: r.phone, bikePlate: r.bikePlate,
        nationalIdEnc: encrypt(r.nationalId), nationalIdLast4: r.nationalId.slice(-4), isPreferred: r.isPreferred, isOnDuty: true,
      },
    });
  }
  console.log(`✔ ${RIDERS.length} demo riders (on duty)`);
}
