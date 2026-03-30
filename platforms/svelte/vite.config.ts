import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        customElement: true,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['iife'],
      name: 'SynergosElementSvelte',
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
      '@synergos/core-assets': resolve(__dirname, '../../vitals/core-assets/src/index.ts'),
    },
  },
});
