import { execSync } from 'child_process';
process.env.DATABASE_URL = 'postgresql://postgres:vick3900@localhost:5432/store_db';
const result = execSync('node_modules\\.bin\\prisma generate --schema prisma/schema.prisma', {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: 'postgresql://postgres:vick3900@localhost:5432/store_db' },
  encoding: 'utf-8', timeout: 60000,
});
console.log(result);
