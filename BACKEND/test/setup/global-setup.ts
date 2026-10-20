import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

// Runs ONCE before all tests: rebuild the test database from migrations, then seed roles.
export default function setup() {
  const env = {
    ...process.env,
    ...loadEnv({ path: '.env.test', quiet: true }).parsed,
    ...loadEnv({ path: '.env.test.local', quiet: true }).parsed,
  };

  // `migrate reset` wipes the target database, so refuse anything that isn't clearly a test database.
  const dbName = new URL(env.DATABASE_URL ?? '').pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${dbName}": test DATABASE_URL must point to a database ending in _test`);
  }

  const run = (cmd: string) => execSync(cmd, { stdio: 'inherit', env });

  run('pnpm prisma migrate reset --force --skip-seed');
  run('pnpm db:seed');
}
