import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/daemon/main.ts', 'src/cli/index.ts'],
      thresholds: {
        lines: 55,
        branches: 75,
        functions: 80,
      },
    },
  },
});
