import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      reportsDirectory: 'coverage/apps/elements/primitives/stack',
      reporter: ['text', 'lcov'],
    },
  },
});
