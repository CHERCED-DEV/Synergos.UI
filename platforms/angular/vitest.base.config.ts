import { defineConfig } from 'vitest/config';

const projectRoot = process.env['NX_PROJECT_ROOT_PATH'] ?? '.';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      reportsDirectory: `../../coverage/${projectRoot}`,
      reporter: ['text', 'lcov'],
    },
  },
});
