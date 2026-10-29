import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { resolveBuildId } from './scripts/buildId';

/** `'/repo'`, `'repo/'`, `''`, `undefined` → a Vite-legal `'/repo/'` / `'/'`. */
function normalizeBasePath(raw: string | undefined): string {
  if (typeof raw !== 'string' || raw.trim() === '') return '/';
  const trimmed = raw.trim();
  const rooted = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return rooted.endsWith('/') ? rooted : `${rooted}/`;
}

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
    // The publish target sets BASE_PATH (the Pages workflow passes its site path,
    // e.g. '/sand-and-steel/'). Every other build - dev server, sandbox preview, a
    // plain `bun run build` - stays at the root, so this changes nothing unless the
    // variable is set. Normalized to a leading+trailing slash because Vite requires
    // that shape and a hand-set '/repo' would otherwise emit broken URLs; the SAME
    // base reaches the client as `import.meta.env.BASE_URL` (see utils/assetUrl.ts).
    base: normalizeBasePath(process.env.BASE_PATH),
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
