import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../wwwroot/synergos/hero/react',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/elements/hero/main.tsx'),
      formats: ['iife'],
      name: 'SynergosHeroReact',
      fileName: () => 'main.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      '@synergos/contracts': resolve(__dirname, '../contracts/src/index.ts'),
      '@synergos/core': resolve(__dirname, '../core/src/index.ts'),
      '@synergos/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
