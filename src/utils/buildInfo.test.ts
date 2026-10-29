/**
 * Alpha build identification — the label a bug report is filed against.
 *
 * THE GAP THIS PINS. The title screen's version line was a bare hardcoded string
 * ("Alpha 1.0") and `package.json` carried no release version, so a build could not
 * be tied to the commit it was made from: two alphas could wear the same label, and a
 * report could not name the code it came from. The fix is one release name in one
 * place plus a build id resolved AT BUILD TIME (`vite.config.ts` defines
 * `__BUILD_ID__` from the checkout's short commit, `dev` when there is no git).
 *
 * Sections:
 *   §A  the pure label contract — the release name, the id, the `dev` fallback
 *   §B  the bundle seam — the id is a build-time define, never a runtime git read
 *   §C  the wiring — the title screen renders the derived label and hardcodes nothing
 *
 * Run with: `bun test src/utils/buildInfo.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { ALPHA_LABEL, UNKNOWN_BUILD_ID, buildLabel, readBuildId } from './buildInfo';

const viteConfigSource = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
const titleSource = readFileSync(
  new URL('../components/hub/TitleScreen.tsx', import.meta.url),
  'utf8',
);

describe('§A — the label contract', () => {
  test('the release name and the id are joined by the existing separator', () => {
    expect(ALPHA_LABEL).toBe('Alpha 1.0');
    expect(buildLabel('b475ce4')).toBe('Alpha 1.0 · b475ce4');
  });

  test('an absent or blank id falls back to the honest placeholder, never an empty tail', () => {
    expect(buildLabel('')).toBe(`${ALPHA_LABEL} · ${UNKNOWN_BUILD_ID}`);
    expect(buildLabel('   ')).toBe(`${ALPHA_LABEL} · ${UNKNOWN_BUILD_ID}`);
    expect(buildLabel(undefined as unknown as string)).toBe(
      `${ALPHA_LABEL} · ${UNKNOWN_BUILD_ID}`,
    );
    expect(buildLabel('  b475ce4 ')).toBe(`${ALPHA_LABEL} · b475ce4`);
  });

  test('readBuildId answers a non-empty id in a bundle with no define', () => {
    // Under `bun test` there is no Vite define: the guard is what keeps this a
    // value instead of a ReferenceError.
    expect(readBuildId()).toBe(UNKNOWN_BUILD_ID);
  });
});

describe('§B — the bundle seam', () => {
  test('vite defines __BUILD_ID__ once, from a build-time commit lookup', () => {
    expect(viteConfigSource).toContain('define:');
    expect(viteConfigSource.split('__BUILD_ID__').length - 1).toBeGreaterThanOrEqual(1);
    // Build-time, not runtime: the commit is read while the config loads …
    expect(viteConfigSource).toContain('rev-parse --short HEAD');
    // … and a builder with no git binary still resolves the checkout's own refs.
    expect(viteConfigSource).toContain('.git');
    expect(viteConfigSource).toContain('packed-refs');
    // … while a checkout with no history still produces a build (the `dev` fallback).
    expect(viteConfigSource).toContain("'dev'");
  });

  test('no shipped source reads git at runtime', () => {
    const buildInfo = readFileSync(new URL('./buildInfo.ts', import.meta.url), 'utf8');
    expect(buildInfo).not.toContain('child_process');
    expect(buildInfo).not.toContain('execSync');
    expect(buildInfo).not.toContain('localStorage');
  });

  test('the declared type keeps tsc strict over the define', () => {
    const envTypes = readFileSync(new URL('../vite-env.d.ts', import.meta.url), 'utf8');
    expect(envTypes).toContain('__BUILD_ID__');
  });
});

describe('§C — the title screen renders it', () => {
  test('the version line comes from the one label, not a hardcoded string', () => {
    expect(titleSource).toContain('buildLabel(');
    expect(titleSource).toContain("from '../../utils/buildInfo'");
    expect(titleSource).not.toContain('Alpha 1.0');
  });
});
