import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

// .env.test is committed; .env.test.local (git-ignored) holds machine-specific overrides.
const testEnv = {
  ...loadEnv({ path: '.env.test', quiet: true }).parsed,
  ...loadEnv({ path: '.env.test.local', quiet: true }).parsed,
};

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['test/setup/global-setup.ts'],
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    fileParallelism: false, // integration tests share one test database
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
