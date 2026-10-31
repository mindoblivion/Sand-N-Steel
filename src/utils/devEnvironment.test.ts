/**
 * Environment gate — the dev environment's own regression suite.
 *
 * Run with: `bun test src/utils/devEnvironment.test.ts`
 *
 * ── WHY THIS SUITE EXISTS ─────────────────────────────────────────────────────
 * The Base44 sandbox, GitHub Codespaces and the Android release workflow all boot
 * this repository through the same handful of files: `docker-compose.base44.yml`
 * (host port 3000 → the Vite dev server on the cloned source), `.base44/environment.json`
 * (the preview metadata), `vite.config.ts` (bind address and port), `package.json`
 * (the commands everything calls) and `.github/workflows/environment.yml` (the gate).
 *
 * Those files had no test. A stray `npm install` (a `package-lock.json` beside
 * `bun.lock`), a compose edit that serves a built bundle instead of the dev server,
 * or a host/port drift all break "edits appear in the preview" while every gameplay
 * suite still passes — the environment dies silently, which is exactly what happened
 * before this phase (a committed terminal dump, an untracked npm lockfile, and no CI
 * gate on any of it).
 *
 * §A  the compose wiring: port 3000, the dev command, the source mount, health, restart
 * §B  the preview metadata and the Vite bind address agree with it
 * §C  the commands the guard and the CI gate depend on still exist
 * §D  the startup assets the boot shell needs are present in `public/`
 * §E  the repository root carries no stray lockfile, core dump or terminal dump
 * §F  the CI gate runs every suite this phase relies on
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STARTUP_ASSETS, assetRepoPath } from './startupAssets';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

const compose = read('docker-compose.base44.yml');
const env = JSON.parse(read('.base44/environment.json')) as {
  previewPort: number;
  healthPath: string;
  startCommand: string;
  secrets: unknown[];
};
const vite = read('vite.config.ts');
const pkg = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
};
const gitignore = read('.gitignore');
const workflow = read('.github/workflows/environment.yml');

describe('§A — the compose wiring keeps the preview on live source', () => {
  test('the web entry point is host port 3000', () => {
    expect(compose).toMatch(/-\s*"?3000:3000"?/);
    expect(compose).toMatch(/^services:\s*$/m);
    expect(compose).toMatch(/^\s{2}web:\s*$/m);
  });

  test('the app runs FROM THE CLONED SOURCE on a runtime image, never a bundled build', () => {
    // A plain runtime base, bind-mounted source, and the Vite DEV server.
    expect(compose).toMatch(/image:\s*oven\/bun/);
    expect(compose).toContain('.:/app');
    expect(compose).toContain('web_node_modules:/app/node_modules');
    expect(compose).toContain('exec bun run dev');
    // Serving a prebuilt bundle would make every edit invisible — refuse it.
    expect(compose).not.toMatch(/vite preview|bun run preview|serve\s+dist/);
    expect(compose).not.toMatch(/image:\s*(ghcr\.io|registry\.)/);
  });

  test('dependencies install from the committed lockfile before the server starts', () => {
    expect(compose).toContain('bun install --frozen-lockfile');
    expect(pkg.scripts.dev).toBe('vite');
  });

  test('the service is probed over HTTP on 3000 and restarts on failure', () => {
    expect(compose).toContain('healthcheck:');
    expect(compose).toContain('127.0.0.1:3000/');
    expect(compose).toMatch(/restart:\s*on-failure/);
  });
});

describe('§B — the preview metadata and the Vite bind agree', () => {
  test('.base44/environment.json points the preview at the compose entry point', () => {
    expect(env.previewPort).toBe(3000);
    expect(env.healthPath).toBe('/');
    expect(env.startCommand).toContain('docker-compose.base44.yml');
    expect(Array.isArray(env.secrets)).toBe(true);
  });

  test('Vite binds 0.0.0.0:3000 so the sandbox proxy can reach it', () => {
    expect(vite).toMatch(/port:\s*3000/);
    expect(vite).toMatch(/host:\s*'0\.0\.0\.0'/);
  });
});

describe('§C — the commands the environment depends on exist', () => {
  test('the scripts the compose command, the guard and CI call are present and honest', () => {
    expect(pkg.scripts.build).toContain('vite build');
    // This branch invokes the startup checker directly rather than through an npm script alias.
    expect(pkg.scripts.build).toContain('scripts/startupAssetCheck.ts');
    expect(pkg.scripts.lint).toBe('tsc --noEmit');
  });

  test('one package manager pins the tree: bun owns bun.lock', () => {
    expect(existsSync(resolve(ROOT, 'bun.lock'))).toBe(true);
  });
});

describe('§D — the startup assets the boot shell needs are shipped', () => {
  test('every registered startup asset exists in public/', () => {
    const missing = STARTUP_ASSETS.filter((url) => !existsSync(resolve(ROOT, assetRepoPath(url))));
    expect(missing).toEqual([]);
  });

  test('the build check still reads that one registry, not a second list', () => {
    const check = read('scripts/startupAssetCheck.ts');
    expect(check).toContain("from '../src/utils/startupAssets'");
    expect(check).toContain('STARTUP_ASSETS');
  });
});

describe('§E — the repository root stays clean of environment artifacts', () => {
  test('no stray lockfile beside bun.lock (npm/yarn/pnpm installs are refused)', () => {
    for (const stray of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) {
      expect({ file: stray, present: existsSync(resolve(ROOT, stray)) }).toEqual({ file: stray, present: false });
    }
  });

  test('no terminal dump or core dump at the root', () => {
    for (const stray of ['codespace-diagnostics.txt', 'core', 'diagnostics.txt']) {
      expect({ file: stray, present: existsSync(resolve(ROOT, stray)) }).toEqual({ file: stray, present: false });
    }
  });

  test('.gitignore keeps build output, dependencies and the known artifacts out of git', () => {
    const ignored = gitignore.split('\n').map((line) => line.trim());
    for (const rule of [
      'dist/',
      'node_modules/',
      '*.backup.glb',
      'core',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'codespace-diagnostics.txt',
    ]) {
      expect({ rule, ignored: ignored.includes(rule) }).toEqual({ rule, ignored: true });
    }
  });
});

describe('§F — the CI gate runs the environment and gameplay suites', () => {
  test('the gate runs on pull requests into development-focus-strategy and pushes to the development/recovery branches', () => {
    expect(workflow).toMatch(/^on:\s*$/m);
    expect(workflow).toContain('pull_request:');
    expect(workflow).toMatch(/push:[\s\S]*?branches:\s*\[development-focus-strategy,\s*recovery-development-validation\]/);
    expect(workflow).toContain('runs-on: ubuntu-24.04');
  });

  test('the gate installs from the lockfile and runs every suite this phase relies on', () => {
    for (const command of [
      'bun install --frozen-lockfile',
      'bun run lint',
      'bun test',
      'bun run scripts/collisionTests.ts',
      'bun run scripts/combatTests.ts',
      'bun run build',
    ]) {
      expect({ command, gated: workflow.includes(command) }).toEqual({ command, gated: true });
    }
  });
});
