import { execSync } from 'child_process';
process.env.DATABASE_URL = 'postgresql://postgres:vick3900@localhost:5432/store_db';
try {
  const result = execSync('node_modules\\.bin\\prisma db push --schema prisma/schema.prisma --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: 'postgresql://postgres:vick3900@localhost:5432/store_db' },
    encoding: 'utf-8',
    timeout: 90000,
  });
  console.log(result);
} catch(e) {
  console.error(e.stdout);
  console.error(e.stderr);
}
