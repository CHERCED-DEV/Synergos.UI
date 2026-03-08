import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      reportsDirectory: 'coverage/libs/shared',
      reporter: ['text', 'lcov'],
    },
  },
});
