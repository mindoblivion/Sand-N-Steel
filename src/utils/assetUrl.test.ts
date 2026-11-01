/**
 * assetUrl.test.ts — the deploy base contract, pinned.
 *
 * Run with: bun test src/utils/assetUrl.test.ts
 *
 * The helper is the identity at the root by design: that is what lets every
 * existing asset literal, GLTF cache key and suite keep its meaning while the app
 * becomes servable from a subpath. The subpath behaviour is pinned through the
 * pure `withBase` / `stripBase` forms, which take the base as an argument instead
 * of reading the build's.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { SITE_BASE, assetUrl, normalizeBase, stripBase, stripSiteBase, withBase } from './assetUrl';

describe('the base is normalized to a rooted, slash-terminated path', () => {
  test('every shape a base arrives in becomes usable', () => {
    expect(normalizeBase(undefined)).toBe('/');
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('repo')).toBe('/repo/');
    expect(normalizeBase('/repo')).toBe('/repo/');
    expect(normalizeBase('/repo/')).toBe('/repo/');
    expect(normalizeBase('/a/b')).toBe('/a/b/');
  });
});

describe('assetUrl is the identity at the root', () => {
  test('the suites run at the root, so every literal keeps its meaning', () => {
    expect(SITE_BASE).toBe('/');
    expect(assetUrl('/models/arena_roman.glb')).toBe('/models/arena_roman.glb');
    expect(assetUrl('/music/title_main.ogg')).toBe('/music/title_main.ogg');
    expect(stripSiteBase('/privacy')).toBe('/privacy');
  });

  test('a value that is not root-relative is never rewritten', () => {
    expect(assetUrl('models/a.glb')).toBe('models/a.glb');
    expect(assetUrl('https://cdn.example/a.glb')).toBe('https://cdn.example/a.glb');
    expect(assetUrl('')).toBe('');
  });
});

describe('at a subpath the same literal resolves inside the base', () => {
  test('a public file path gains exactly one base prefix', () => {
    expect(withBase('/repo/', '/models/arena_roman.glb')).toBe('/repo/models/arena_roman.glb');
    expect(withBase('/repo/', '/icons/icon-192.png')).toBe('/repo/icons/icon-192.png');
    expect(withBase('/repo/', '/')).toBe('/repo/');
    // No doubled slash, and a non-rooted base still works.
    expect(withBase('repo', '/a.glb')).toBe('/repo/a.glb');
    expect(withBase('/', '/a.glb')).toBe('/a.glb');
  });

  test('the public pages resolve under the base and nowhere else', () => {
    expect(stripBase('/repo/', '/repo/privacy')).toBe('/privacy');
    expect(stripBase('/repo/', '/repo/privacy/')).toBe('/privacy/');
    expect(stripBase('/repo/', '/repo')).toBe('/');
    expect(stripBase('/repo/', '/repo/')).toBe('/');
    // A path outside the base is not rewritten, so it cannot resolve as a page.
    expect(stripBase('/repo/', '/privacy')).toBe('/privacy');
  });

  test('the base and the inverse are consistent', () => {
    for (const path of ['/models/minotaur.glb', '/signs/city_tavern/city_tavern.glb', '/offline.html']) {
      expect(stripBase('/repo/', withBase('/repo/', path))).toBe(path);
    }
  });
});
