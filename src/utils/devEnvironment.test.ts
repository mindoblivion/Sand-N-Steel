/**
 * Environment gate — platform-neutral local development and build contract.
 *
 * Run with: `bun test src/utils/devEnvironment.test.ts`.
 * The game is built from this repository with Vite and Capacitor. No hosted-editor
 * integration, proprietary preview metadata, or remote game runtime is required.
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
const compose = read('docker-compose.dev.yml');
const vite = read('vite.config.ts');
const pkg = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
};
const gitignore = read('.gitignore');
const workflow = read('.github/workflows/environment.yml');
const capacitor = read('capacitor.config.ts');

describe('§A — local development uses checked-out source', () => {
  test('Docker runs the Vite dev server from the repository source', () => {
    expect(compose).toMatch(/image:\\s*oven\\/bun/);
    expect(compose).toContain('.:/app');
    expect(compose).toContain('web_node_modules:/app/node_modules');
    expect(compose).toContain('bun install --frozen-lockfile');
    expect(compose).toContain('exec bun run dev');
    expect(compose).toMatch(/-\\s*"?3000:3000"?/);
    expect(compose).toContain('127.0.0.1:3000/');
    expect(compose).toContain('restart: on-failure');
  });

  test('Vite binds the development server on the expected interface and port', () => {
    expect(vite).toMatch(/port:\\s*3000/);
    expect(vite).toMatch(/host:\\s*'0\\.0\\.0\\.0'/);
    expect(pkg.scripts.dev).toBe('vite');
  });
});

describe('§B — the shipped app is built locally and has no hosted runtime URL', () => {
  test('Capacitor packages the local production build', () => {
    expect(capacitor).toContain("webDir: 'dist'");
    expect(capacitor).not.toMatch(/server\\s*:\\s*\\{/);
    expect(capacitor).not.toMatch(/url:\\s*['"]https?:/);
  });

  test('the project manifest contains no hosted-editor SDK dependency', () => {
    const names = Object.keys(pkg.dependencies).map((name) => name.toLowerCase());
    expect(names.some((name) => name.includes('base44'))).toBe(false);
  });

  test('retired hosted-editor configuration is absent', () => {
    for (const path of ['.base44', 'docker-compose.base44.yml']) {
      expect(existsSync(resolve(ROOT, path))).toBe(false);
    }
  });
});

describe('§C — startup assets and repository hygiene remain guarded', () => {
  test('every registered startup asset exists in public/', () => {
    const missing = STARTUP_ASSETS.filter((url) => !existsSync(resolve(ROOT, assetRepoPath(url))));
    expect(missing).toEqual([]);
  });

  test('the build check reads the shared startup asset registry', () => {
    const check = read('scripts/startupAssetCheck.ts');
    expect(check).toContain("from '../src/utils/startupAssets'");
    expect(check).toContain('STARTUP_ASSETS');
  });

  test('one package manager owns the dependency tree', () => {
    expect(existsSync(resolve(ROOT, 'bun.lock'))).toBe(true);
    for (const stray of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) {
      expect(existsSync(resolve(ROOT, stray))).toBe(false);
    }
  });

  test('gitignore excludes generated output and dependency directories', () => {
    const ignored = gitignore.split('\\n').map((line) => line.trim());
    for (const rule of ['dist/', 'node_modules/']) {
      expect(ignored.includes(rule)).toBe(true);
    }
  });
});

describe('§D — CI verifies the independent production build', () => {
  test('the environment gate runs on pull requests and main', () => {
    expect(workflow).toContain('pull_request:');
    expect(workflow).toMatch(/push:[\\s\\S]*?branches:\\s*\\[main\\]/);
    expect(workflow).toContain('runs-on: ubuntu-24.04');
  });

  test('CI installs, typechecks, tests and builds from the repository', () => {
    for (const command of [
      'bun install --frozen-lockfile',
      'bun run lint',
      'bun test',
      'bun run scripts/collisionTests.ts',
      'bun run scripts/combatTests.ts',
      'bun run build',
    ]) {
      expect(workflow.includes(command)).toBe(true);
    }
  });
});
