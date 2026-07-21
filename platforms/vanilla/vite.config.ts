import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'path';
import { createElementBuildConfig } from '../../vitals/shared/src/build/vite-base';

export default defineConfig(
  mergeConfig(createElementBuildConfig(__dirname), {
    resolve: {
      alias: {
        // Vanilla libs re-export from vitals — same pattern as React/Svelte
        '@synergos/core': resolve(__dirname, 'libs/core/src/index.ts'),
        '@synergos/shared': resolve(__dirname, 'libs/shared/src/index.ts'),
      },
    },
  }),
);
