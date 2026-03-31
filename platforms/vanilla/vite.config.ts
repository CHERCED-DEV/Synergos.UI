import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'path';
import { createElementBuildConfig } from '../../vitals/shared/src/build/vite-base';

export default defineConfig(
  mergeConfig(createElementBuildConfig(__dirname), {
    resolve: {
      alias: {
        // Vanilla has no local libs — point directly to vitals
        '@synergos/core': resolve(__dirname, '../../vitals/core/src/index.ts'),
        '@synergos/shared': resolve(__dirname, '../../vitals/shared/src/index.ts'),
      },
    },
  }),
);
