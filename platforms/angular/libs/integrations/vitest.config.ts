import { defineConfig } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: dirname(fileURLToPath(import.meta.url)),
    include: ['src/**/*.spec.ts'],
    coverage: {
      reportsDirectory: 'coverage/libs/integrations',
      reporter: ['text', 'lcov'],
    },
  },
});
