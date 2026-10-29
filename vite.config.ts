import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { defineConfig } from 'vite';

/**
 * Alpha build identification (see src/utils/buildInfo.ts) — resolved ONCE, while
 * this config loads, and frozen into the bundle as `__BUILD_ID__`. The shipped
 * client therefore never shells out to git: it reports the commit of the checkout
 * that BUILT it.
 *
 * Three build-time sources, in order, because an alpha is often built somewhere
 * that has neither a release script nor a git binary:
 *   1. `BUILD_COMMIT` / `GIT_COMMIT` from the builder (CI, a release script);
 *   2. `git rev-parse --short HEAD`, when the builder has git;
 *   3. the checkout's own `.git` ref files, read directly — this is the case that
 *      actually bit the sandbox build, whose container image has no git at all
 *      (`sh: git: not found`), and it covers ordinary, packed and worktree checkouts;
 *   4. `dev` — a checkout with no history (a tarball) still builds and still says so.
 */
function readGitCommitFromFiles(): string | null {
  try {
    const gitEntry = path.resolve(import.meta.dirname, '.git');
    if (!existsSync(gitEntry)) return null;
    let gitDir = gitEntry;
    if (!statSync(gitEntry).isDirectory()) {
      // A worktree or submodule: `.git` is a file pointing at the real directory.
      const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitEntry, 'utf8'));
      if (!pointer) return null;
      gitDir = path.resolve(import.meta.dirname, pointer[1].trim());
    }
    const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const ref = /^ref:\s*(.+)$/.exec(head);
    if (!ref) return head.slice(0, 7) || null; // detached HEAD: HEAD is the sha
    const refFile = path.join(gitDir, ref[1]);
    if (existsSync(refFile)) return readFileSync(refFile, 'utf8').trim().slice(0, 7) || null;
    const packed = path.join(gitDir, 'packed-refs');
    if (existsSync(packed)) {
      for (const line of readFileSync(packed, 'utf8').split('\n')) {
        const [sha, name] = line.trim().split(/\s+/);
        if (name === ref[1] && sha) return sha.slice(0, 7);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function resolveBuildId(): string {
  const fromEnv = (process.env.BUILD_COMMIT || process.env.GIT_COMMIT || '').trim();
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    const fromGit = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (fromGit) return fromGit;
  } catch {
    // No git binary on the builder — fall through to the ref files.
  }
  return readGitCommitFromFiles() ?? 'dev';
}

export default defineConfig(() => {
  return {
    plugins: [tailwindcss(), react()],
    define: {
      __BUILD_ID__: JSON.stringify(resolveBuildId()),
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
