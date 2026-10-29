import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { resolveBuildId } from './scripts/buildId';

/**
 * Alpha build identification (see src/utils/buildInfo.ts) — resolved ONCE, while
 * this config loads, and frozen into the bundle as `__BUILD_ID__`. The shipped
 * client therefore never shells out to git: it reports the commit of the checkout
 * that BUILT it.
 *
 * The resolution order, its validation and its fallbacks live in ONE place,
 * `scripts/buildId.ts` (env `BUILD_COMMIT`/`GIT_COMMIT`, then `git rev-parse
 * --short HEAD`, then the checkout's own `.git` ref files — which is the case that
 * matters here, since this container has no git binary — then `dev`). This config
 * only passes the checkout root in, so the ref files are read from the directory
 * the config was loaded from rather than from `import.meta` inside the module.
 */
export default defineConfig(() => {
  return {
    plugins: [tailwindcss(), react()],
    define: {
      __BUILD_ID__: JSON.stringify(resolveBuildId(import.meta.dirname)),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
