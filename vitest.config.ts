import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // e2e/ is Playwright's; keeping it out stops vitest collecting those specs.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
