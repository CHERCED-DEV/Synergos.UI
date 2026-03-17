import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      reportsDirectory: 'coverage/apps/macros/test-macro',
      reporter: ['text', 'lcov'],
    },
  },
});
