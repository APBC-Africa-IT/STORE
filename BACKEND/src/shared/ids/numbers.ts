import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/** Date parts in Nairobi time: { yymmdd: "261020", yymm: "2610" } */
function eatDate(date = new Date()) {
  const iso = new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString();
  const yymmdd = iso.slice(2, 10).replace(/-/g, '');
  return { yymmdd, yymm: yymmdd.slice(0, 4) };
}

async function nextval(db: Db, sequence: 'order_number_seq' | 'po_number_seq' | 'grn_number_seq' | 'supplier_code_seq') {
  // The sequence name comes from the fixed list above, never from user input.
  const [row] = await db.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT nextval('${sequence}') AS n`);
  return String(row!.n);
}

/** ORD-261020-00042 */
export async function nextOrderNumber(db: Db) {
  return `ORD-${eatDate().yymmdd}-${(await nextval(db, 'order_number_seq')).padStart(5, '0')}`;
}

/** PO-2610-00007 */
export async function nextPoNumber(db: Db) {
  return `PO-${eatDate().yymm}-${(await nextval(db, 'po_number_seq')).padStart(5, '0')}`;
}

/** GRN-2610-00003 */
export async function nextGrnNumber(db: Db) {
  return `GRN-${eatDate().yymm}-${(await nextval(db, 'grn_number_seq')).padStart(5, '0')}`;
}

/** SUP-0012 */
export async function nextSupplierCode(db: Db) {
  return `SUP-${(await nextval(db, 'supplier_code_seq')).padStart(4, '0')}`;
}
