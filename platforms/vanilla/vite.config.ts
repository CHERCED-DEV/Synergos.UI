import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../../wwwroot/synergos/hero/vanilla',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/elements/hero/main.js'),
      formats: ['iife'],
      name: 'SynergosHeroVanilla',
      fileName: () => 'main.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
