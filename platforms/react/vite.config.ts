import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const elementEntry = process.env['ELEMENT_ENTRY'] ?? '';
const elementName = process.env['ELEMENT_NAME'] ?? 'element';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: `dist/${elementName}`,
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, elementEntry),
      formats: ['iife'],
      name: 'SynergosElement',
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
      '@synergos/core': resolve(__dirname, 'libs/core/src/index.ts'),
      '@synergos/shared': resolve(__dirname, 'libs/shared/src/index.ts'),
      '@synergos/core-assets': resolve(__dirname, '../../vitals/core-assets/src/index.ts'),
    },
  },
});
