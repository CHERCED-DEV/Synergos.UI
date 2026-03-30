import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      // entry: resolve(__dirname, 'src/elements/<name>/main.tsx'),
      formats: ['iife'],
      name: 'SynergosElementReact',
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
      '@synergos/contracts': resolve(__dirname, '../../vitals/contracts/src/index.ts'),
      '@synergos/core': resolve(__dirname, '../../vitals/core/src/index.ts'),
      '@synergos/shared': resolve(__dirname, '../../vitals/shared/src/index.ts'),
    },
  },
});
