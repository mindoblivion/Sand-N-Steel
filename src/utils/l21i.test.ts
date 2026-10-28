/**
 * l21i.test.ts — L21I, the title-screen saved-profile hydration race.
 *
 * Run with: bun test src/utils/l21i.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A a save present at startup already owns the FIRST render: rendering the real
 *      `App` to static markup runs no effects, so that markup IS the first paint —
 *      it must offer Continue, never Play;
 *   §B the primary action decides after the fullscreen attempt and still routes a
 *      returning player to the city — a pending, resolved or rejected fullscreen
 *      cannot change the destination, and a second tap routes nowhere;
 *   §C with no save, the title still offers — and takes — the creation path;
 *   §D an unreadable save reads as "no save" but is NOT removed from storage;
 *   §E hydration writes nothing, and the new-character path cannot reach the save.
 *
 * ── HOW IT KEEPS AWAY FROM REAL SAVES ─────────────────────────────────────
 * Every case installs a fake `localStorage` on `globalThis` and reads only what it
 * put there; the real browser store is never touched, and the original binding is
 * restored afterwards. `renderToStaticMarkup` renders the real components but runs
 * no effects, so no music, audio or 3D preload is started.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PROFILE_STORAGE_KEY, loadSavedProfile, createNewProfile } from '../services/storage';
import { runTitlePrimaryAction } from './titleAction';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** Source with comments stripped, so prose can neither satisfy nor defeat a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const appSrc = code(load('../App.tsx'));
const titleSrc = code(load('../components/hub/TitleScreen.tsx'));

/** A fake store that records every write, so "hydration wrote nothing" is checkable. */
function installFakeStorage(entries: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(entries));
  const writes: string[] = [];
  const store = {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: (key: string) => {
      writes.push(key);
      data.delete(key);
    },
    clear: () => {
      writes.push('*');
      data.clear();
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
  return { data, writes };
}

/** The real App, rendered exactly once, with no effects — i.e. its first paint. */
async function renderAppFirstPaint(): Promise<string> {
  const { App } = await import('../App');
  return renderToStaticMarkup(React.createElement(App));
}

/** A minimal real profile: enough for the title to read it as "a save exists". */
const savedFixture = () => {
  const profile = createNewProfile('L21I Fixture');
  return { profile, raw: JSON.stringify(profile) };
};

const originalLocalStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  installFakeStorage();
});

afterAll(() => {
  (globalThis as unknown as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

describe('§A — a save present at startup owns the first render', () => {
  test('the first paint offers the Continue action, not Play', async () => {
    const { raw } = savedFixture();
    installFakeStorage({ [PROFILE_STORAGE_KEY]: raw });

    const html = await renderAppFirstPaint();

    expect(html).toContain('data-title-action="continue"');
    expect(html).not.toContain('data-title-action="play"');
  });

  test('hydration is part of the state initializer, not a passive effect', () => {
    // The whole race is "the first render carries null". Pin the shape that prevents it.
    expect(appSrc).toMatch(/useState<PlayerProfile \| null>\(\(\) => loadSavedProfile\(\)\)/);
  });

  test('the title-mount boot effect no longer re-loads the save', () => {
    // One reader at mount; a second one in an effect is what made the first paint stale.
    const start = appSrc.indexOf('music.init(sounds.getAudioContext())');
    expect(start).toBeGreaterThan(-1);
    const bootEffect = appSrc.slice(start, appSrc.indexOf('}, []);', start));

    expect(bootEffect).not.toContain('loadSavedProfile');
    expect(bootEffect).not.toContain('setProfile');
    // …and it still does the thing it exists for besides the audio engine.
    expect(bootEffect).toContain('preloadTitleStage');
  });
});

describe('§B — the primary action decides after the fullscreen attempt', () => {
  test('a pending fullscreen holds the route; a save still means Continue', async () => {
    const { profile } = savedFixture();
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    const routed: string[] = [];
    const run = runTitlePrimaryAction({
      savedProfile: profile,
      started: { current: false },
      requestFullscreen: () => pending,
      playFeedback: () => routed.push('feedback'),
      onContinueAdventure: () => routed.push('continue'),
      onNewCharacter: () => routed.push('new_character'),
    });

    // While fullscreen is still in flight nothing has been chosen.
    await Promise.resolve();
    expect(routed).toEqual([]);

    release();
    expect(await run).toBe('continue');
    expect(routed).toEqual(['feedback', 'continue']);
  });

  test('a rejected fullscreen still routes a returning player to the city', async () => {
    const { profile } = savedFixture();
    const routed: string[] = [];
    const destination = await runTitlePrimaryAction({
      savedProfile: profile,
      started: { current: false },
      requestFullscreen: () => Promise.reject(new Error('denied')),
      playFeedback: () => routed.push('feedback'),
      onContinueAdventure: () => routed.push('continue'),
      onNewCharacter: () => routed.push('new_character'),
    });

    expect(destination).toBe('continue');
    expect(routed).toEqual(['feedback', 'continue']);
  });

  test('a second tap routes nowhere', async () => {
    const { profile } = savedFixture();
    const routed: string[] = [];
    const guard = { current: false };
    const ctx = {
      savedProfile: profile,
      started: guard,
      requestFullscreen: () => Promise.resolve(),
      playFeedback: () => routed.push('feedback'),
      onContinueAdventure: () => routed.push('continue'),
      onNewCharacter: () => routed.push('new_character'),
    };

    expect(await runTitlePrimaryAction(ctx)).toBe('continue');
    expect(await runTitlePrimaryAction(ctx)).toBeNull();
    expect(routed).toEqual(['feedback', 'continue']);
  });

  test('TitleScreen drives that one action from a single onClick', () => {
    expect(titleSrc).toContain('await runTitlePrimaryAction(');
    expect(titleSrc).toContain('onClick={handlePrimaryAction}');
    // The removed double-fire path (a window tap listener) must not come back.
    expect(titleSrc).not.toMatch(
      /window\.addEventListener\(\s*['"](click|pointerdown|touchstart|touchend)['"]/,
    );
  });
});

describe('§C — with no save, character creation stays available', () => {
  test('the first paint offers the Play action', async () => {
    installFakeStorage();
    const html = await renderAppFirstPaint();
    expect(html).toContain('data-title-action="play"');
    expect(html).not.toContain('data-title-action="continue"');
  });

  test('the primary action routes to creation', async () => {
    const routed: string[] = [];
    const destination = await runTitlePrimaryAction({
      savedProfile: null,
      started: { current: false },
      requestFullscreen: () => Promise.resolve(),
      playFeedback: () => routed.push('feedback'),
      onContinueAdventure: () => routed.push('continue'),
      onNewCharacter: () => routed.push('new_character'),
    });

    expect(destination).toBe('new_character');
    expect(routed).toEqual(['feedback', 'new_character']);
  });
});

describe('§D — an unreadable save is not destroyed by reading it', () => {
  test('corrupt JSON reads as "no save" and the raw value survives', async () => {
    const corrupt = '{"name":"Broken",';
    installFakeStorage({ [PROFILE_STORAGE_KEY]: corrupt });

    expect(loadSavedProfile()).toBeNull();
    // A failed parse is not a delete: the store still holds exactly what it held.
    expect(globalThis.localStorage.getItem(PROFILE_STORAGE_KEY)).toBe(corrupt);

    const html = await renderAppFirstPaint();
    expect(html).toContain('data-title-action="play"');
    expect(globalThis.localStorage.getItem(PROFILE_STORAGE_KEY)).toBe(corrupt);
  });

  test('reading a save never writes, overwrites or removes it', async () => {
    const { raw } = savedFixture();
    const store = installFakeStorage({ [PROFILE_STORAGE_KEY]: raw });

    const html = await renderAppFirstPaint();

    expect(html).toContain('data-title-action="continue"');
    expect(store.writes).toEqual([]);
    expect(store.data.get(PROFILE_STORAGE_KEY)).toBe(raw);
  });
});

describe('§E — a pre-hydration tap cannot replace the save', () => {
  test('the new-character path touches no storage', () => {
    // `handleCharacterCreated` is the only writer on that path, and it runs after the
    // player finishes creation — never as a side effect of choosing the path.
    const start = appSrc.indexOf('const handleNewCharacter = () => {');
    expect(start).toBeGreaterThan(-1);
    const body = appSrc.slice(start, appSrc.indexOf('};', start));

    expect(body).toContain("setCurrentScreen('create_character')");
    expect(body).not.toContain('saveProfile');
    expect(body).not.toContain('clearSavedProfile');
    expect(body).not.toContain('setProfile');
  });

  test('only the explicit reset path clears the save', () => {
    const calls = appSrc.match(/clearSavedProfile\(\)/g) ?? [];
    expect(calls.length).toBe(1);
    const resetAt = appSrc.indexOf('const handleResetGame = () => {');
    expect(resetAt).toBeGreaterThan(-1);
    expect(appSrc.indexOf('clearSavedProfile();', resetAt)).toBeGreaterThan(resetAt);
  });
});
