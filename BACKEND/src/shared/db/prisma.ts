import { PrismaClient } from '@prisma/client';
import { isDev } from '../../config/config';

export const prisma = new PrismaClient({
  log: isDev ? ['warn', 'error'] : ['error'],
});
