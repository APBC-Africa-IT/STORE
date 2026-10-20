import type { PrismaClient } from '@prisma/client';
import { nextSupplierCode } from '../../src/shared/ids/numbers';
import { normalizePartNumber } from '../../src/shared/text';

// Demo suppliers + price lists (development only). Prices are OUR cost, VAT-exclusive, in cents.
const SUPPLIERS = [
  {
    name: 'Kirinyaga Road Motor Spares', type: 'PRIMARY' as const, phone: '+254733100200', area: 'CBD',
    addressLine: 'Kirinyaga Road, Shop 14', typicalLeadTimeMins: 90,
    catalog: [
      { partNumber: '339391', description: 'KYB front shock, Note E12', costCents: 4_600_00, availability: 'IN_STOCK' as const },
      { partNumber: '04465-02220', description: 'Brake pads front, Corolla', costCents: 2_450_00, availability: 'IN_STOCK' as const },
    ],
  },
  {
    name: 'Industrial Area Auto Supplies', type: 'SECONDARY' as const, phone: '+254722300400', area: 'Industrial Area',
    addressLine: 'Lunga Lunga Road', typicalLeadTimeMins: 180,
    catalog: [{ partNumber: '339391', description: 'Shock absorber Note front', costCents: 4_300_00, availability: 'LOW' as const }],
  },
];

export async function seedSuppliers(prisma: PrismaClient) {
  for (const s of SUPPLIERS) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name } });
    const supplier =
      existing ??
      (await prisma.supplier.create({
        data: {
          code: await nextSupplierCode(prisma), name: s.name, type: s.type, phone: s.phone, area: s.area,
          addressLine: s.addressLine, typicalLeadTimeMins: s.typicalLeadTimeMins, categories: [],
        },
      }));
    for (const item of s.catalog) {
      const partNumberNorm = normalizePartNumber(item.partNumber);
      const match = await prisma.partNumber.findFirst({ where: { normalized: partNumberNorm } });
      await prisma.supplierCatalogItem.upsert({
        where: { supplierId_partNumberNorm: { supplierId: supplier.id, partNumberNorm } },
        update: {},
        create: { ...item, partNumberNorm, supplierId: supplier.id, productId: match?.productId ?? null, lastConfirmedAt: new Date() },
      });
    }
  }
  console.log(`✔ ${SUPPLIERS.length} demo suppliers with price lists`);
}
