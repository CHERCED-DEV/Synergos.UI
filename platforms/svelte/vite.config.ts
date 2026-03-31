import { defineConfig, mergeConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createElementBuildConfig } from '../../vitals/shared/src/build/vite-base';

export default defineConfig(
  mergeConfig(createElementBuildConfig(__dirname), {
    plugins: [
      svelte({
        compilerOptions: {
          customElement: true,
        },
      }),
    ],
  }),
);
