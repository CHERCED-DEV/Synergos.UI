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
    outDir: '../wwwroot/synergos/hero/svelte',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/elements/hero/main.ts'),
      formats: ['iife'],
      name: 'SynergosHeroSvelte',
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
