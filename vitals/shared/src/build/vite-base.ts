import { resolve } from 'path';

/**
 * Shared Vite build config for all non-Angular platforms.
 *
 * Each platform's vite.config.ts calls this with __dirname,
 * then adds its own plugins (React, Svelte, etc.).
 *
 * Env vars:
 *   ELEMENT_ENTRY — relative path to the element's entry file (from platformDir)
 *   ELEMENT_NAME  — element name (used for output dir)
 */
export function createElementBuildConfig(platformDir: string) {
  const elementEntry = process.env['ELEMENT_ENTRY'] ?? '';
  const elementName = process.env['ELEMENT_NAME'] ?? 'element';

  return {
    build: {
      outDir: `dist/${elementName}`,
      emptyOutDir: true,
      lib: {
        entry: resolve(platformDir, elementEntry),
        formats: ['iife'] as const,
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
        '@synergos/contracts': resolve(platformDir, '../../vitals/contracts/src/index.ts'),
        '@synergos/core': resolve(platformDir, 'libs/core/src/index.ts'),
        '@synergos/shared': resolve(platformDir, 'libs/shared/src/index.ts'),
        '@synergos/core-assets': resolve(platformDir, '../../vitals/core-assets/src/index.ts'),
      },
    },
  };
}
