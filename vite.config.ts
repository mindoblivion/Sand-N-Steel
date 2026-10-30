import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { existsSync, rmSync } from 'node:fs';
import { resolveBuildId } from './scripts/buildId';

/**
 * Development-only horse uploads — kept in the repo, never shipped.
 *
 * `public/_workspace_dist_horse_{weak,better,great}.glb` are 47.4 MB of uploaded rigs
 * used ONLY by the dev-gated fit prototype (`?devHarness=horsefit` →
 * `src/utils/horseFitPrototype.ts` → `components/dev/HorseChariotFitPrototype.tsx`).
 * No production code path loads one: the harness branch in `main.tsx` is behind
 * `import.meta.env.DEV` and is dropped from a production bundle.
 *
 * Vite copies EVERY file in `public/` into the build regardless of imports, so these
 * reached `dist/`, `cap sync` and the AAB as pure download weight (~47 MB of an ~89 MB
 * bundle). This removes them from the BUILD only: the files, the dev harness and the
 * three suites that hash-pin their bytes (`phaseC8_67d` §G, `phaseC8_68c`,
 * `phaseC8_70bStage1`) are untouched.
 */
const DEV_ONLY_PUBLIC_FILES = [
  'public/_workspace_dist_horse_weak.glb',
  'public/_workspace_dist_horse_better.glb',
  'public/_workspace_dist_horse_great.glb',
];

function pruneDevOnlyPublicFiles(): Plugin {
  let root = '.';
  let outDir = 'dist';
  return {
    name: 'sand-and-steel:prune-dev-only-public-files',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      for (const file of DEV_ONLY_PUBLIC_FILES) {
        const emitted = path.resolve(root, outDir, file.replace(/^public[\\/]/, ''));
        if (existsSync(emitted)) rmSync(emitted);
      }
    },
  };
}

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
    plugins: [tailwindcss(), react(), pruneDevOnlyPublicFiles()],
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
