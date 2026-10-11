/**
 * Singleton Prisma client using pg adapter (Prisma 7).
 * Import `prisma` wherever you need database access.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.PG_URI ||
  'postgresql://postgres:vick3900@localhost:5432/store_db';

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export default prisma;
