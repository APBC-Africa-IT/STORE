import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/** "261020" for 20 Oct 2026 in Nairobi time. */
function eatYyMmDd(date = new Date()): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().slice(2, 10).replace(/-/g, '');
}

/** ORD-261020-00042 — human-friendly, unique (backed by a Postgres sequence). */
export async function nextOrderNumber(db: Db): Promise<string> {
  const [row] = await db.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('order_number_seq') AS n`;
  return `ORD-${eatYyMmDd()}-${String(row!.n).padStart(5, '0')}`;
}
