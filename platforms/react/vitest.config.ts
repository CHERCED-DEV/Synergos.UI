import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['**/*.spec.{ts,tsx}'],
    coverage: {
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@synergos/contracts': resolve(__dirname, '../../vitals/contracts/src/index.ts'),
      '@synergos/core': resolve(__dirname, 'libs/core/src/index.ts'),
      '@synergos/shared': resolve(__dirname, 'libs/shared/src/index.ts'),
      '@synergos/core-assets': resolve(__dirname, '../../vitals/core-assets/src/index.ts'),
    },
  },
});
