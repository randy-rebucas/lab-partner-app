import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'coverage'],
    // Route and model tests start their own in-memory MongoDB (__tests__/helpers/db.ts).
    // This URI points nowhere, so a test that forgets to never touches a real database.
    env: {
      MONGODB_URI: 'mongodb://127.0.0.1:1/vitest-no-db',
      APP_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    },
    testTimeout: 20000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // `server-only` throws outside a React Server Component bundle; tests import server code directly.
      'server-only': path.resolve(__dirname, './__tests__/helpers/server-only.ts'),
    },
  },
});
