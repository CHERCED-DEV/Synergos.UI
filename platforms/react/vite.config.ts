import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createElementBuildConfig } from '../../vitals/shared/src/build/vite-base';

export default defineConfig(
  mergeConfig(createElementBuildConfig(__dirname), {
    plugins: [react()],
  }),
);
