/**
 * currency.test.ts — the Gold/NaN fix: one reader of the purse, and the combat display
 * it protects.
 *
 * THE BUG THIS PINS. Gold was never normalized at any boundary, so a profile whose
 * `gold` is missing or unusable (an older schema, a hand-edited save, a cloud save from
 * another build) reached App's victory settlement as `undefined`. `base.gold +
 * stats.goldEarned` then answered `NaN`, and that `NaN` was written into the profile and
 * persisted. The result screen only tested `typeof goldTotal === 'number'` — which `NaN`
 * satisfies — so the row a player reads straight after a fight said "NaN Gold", and
 * every later gold readout said the same.
 *
 * Sections:
 *   §A  `normalizeGold`'s contract — total, and it never invents a value
 *   §B  the reproduction — the settlement sum, and the RENDERED result screen
 *       (`react-dom/server`, the repo's convention; there is no DOM test library here)
 *   §C  the wiring — the victory credit, the save boundary, and the display guard
 *
 * Run with: `bun test src/utils/currency.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { normalizeGold } from './currency';
import { loadSavedProfile, PROFILE_STORAGE_KEY } from '../services/storage';
import { DuelResultModal } from '../components/hub/DuelResultModal';
import { ALL_OPPONENTS } from '../data/opponents';
import type { DuelStatistics } from '../types/game';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const modalSource = readFileSync(
  new URL('../components/hub/DuelResultModal.tsx', import.meta.url),
  'utf8',
);
const driveSource = readFileSync(new URL('../services/googleDrive.ts', import.meta.url), 'utf8');

// ── The result screen, rendered for real ───────────────────────────────────
const opponent = ALL_OPPONENTS[0];

const stats = (over: Partial<DuelStatistics> = {}): DuelStatistics => ({
  damageDealt: 140,
  damageTaken: 18,
  hitsLanded: 16,
  perfectBlocks: 2,
  dodgesPerformed: 3,
  maxCombo: 4,
  crowdHypePeak: 80,
  durationSeconds: 42,
  goldEarned: 35,
  fameEarned: 5,
  xpEarned: 40,
  ...over,
});

const renderResult = (goldTotal: number | undefined) =>
  renderToStaticMarkup(
    React.createElement(DuelResultModal, {
      didWin: true,
      opponent,
      stats: stats(),
      goldTotal,
      onContinue: () => {},
    })
  );

// ── A recording `localStorage`, so no real save is touched ────────────────
function recordingStore() {
  const values: Record<string, string> = {};
  return {
    values,
    getItem: (key: string) => (key in values ? values[key] : null),
    setItem: (key: string, value: string) => {
      values[key] = String(value);
    },
    removeItem: (key: string) => {
      delete values[key];
    },
  };
}

let store: ReturnType<typeof recordingStore>;
const REAL_LOCAL_STORAGE = (globalThis as unknown as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  store = recordingStore();
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
});

afterAll(() => {
  if (REAL_LOCAL_STORAGE === undefined) {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  } else {
    (globalThis as unknown as { localStorage: unknown }).localStorage = REAL_LOCAL_STORAGE;
  }
});

const withSave = (save: Record<string, unknown>): void => {
  store.values[PROFILE_STORAGE_KEY] = JSON.stringify(save);
};

// ══════════════════════════════════════════════════════════════════════════
describe('§A — normalizeGold is total, and never invents a value', () => {
  test('a real purse is returned unchanged', () => {
    expect(normalizeGold(0)).toBe(0);
    expect(normalizeGold(100)).toBe(100);
    expect(normalizeGold(12_345)).toBe(12_345);
    // Not re-rounded: gold is stored as an integer, and this reader does not decide that.
    expect(normalizeGold(12.5)).toBe(12.5);
  });

  test('every unusable purse reads as 0 rather than NaN', () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      undefined,
      null,
      '250',
      '',
      true,
      {},
      [],
    ]) {
      expect(normalizeGold(value)).toBe(0);
    }
  });

  test('a negative purse is floored at 0, because no rule can produce one', () => {
    expect(normalizeGold(-1)).toBe(0);
    expect(normalizeGold(-0.5)).toBe(0);
  });

  test('it is the same answer for a stored field as for a computed one', () => {
    // The shape a save without `gold` produces: `undefined` where a number belongs.
    const stored = undefined as unknown as number;
    expect(stored + 35).toBeNaN();
    expect(normalizeGold(stored) + normalizeGold(35)).toBe(35);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§B — the result screen a player reads after a fight', () => {
  test('a NaN purse is never printed', () => {
    const html = renderResult(Number.NaN);
    expect(html).not.toContain('NaN');
    // The row is withheld instead of showing a wrong number it cannot stand behind.
    expect(html).not.toContain('Purse Now');
  });

  test('a real purse still renders exactly as it did', () => {
    const html = renderResult(135);
    expect(html).toContain('Purse Now');
    expect(html).toContain('135 Gold');
  });

  test('an absent purse keeps the row out, as before', () => {
    expect(renderResult(undefined)).not.toContain('Purse Now');
  });

  test('the guard tests finiteness, not just “is a number”', () => {
    expect(modalSource).toContain('Number.isFinite(goldTotal)');
    expect(modalSource).not.toContain('typeof goldTotal');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§C — the places a NaN purse could be minted or carried in', () => {
  test('the victory credit normalizes both sides of the sum', () => {
    expect(appSource).toContain(
      'const nextGold = normalizeGold(base.gold) + normalizeGold(stats.goldEarned);'
    );
  });

  test('a save whose gold is missing or unusable loads as a whole purse', () => {
    withSave({ name: 'Titus', level: 3, gold: 120 });
    expect(loadSavedProfile()!.gold).toBe(120);

    for (const broken of [undefined, null, '120', true]) {
      withSave({ name: 'Titus', level: 3, gold: broken });
      const loaded = loadSavedProfile()!;
      expect(loaded.gold).toBe(0);
      // …and the rest of the record is untouched: the reader heals gold alone.
      expect(loaded.name).toBe('Titus');
      expect(loaded.level).toBe(3);
    }
  });

  test('loading never writes: the stored save is byte-identical afterwards', () => {
    withSave({ name: 'Titus', level: 3, gold: 120 });
    const before = store.values[PROFILE_STORAGE_KEY];
    expect(loadSavedProfile()!.gold).toBe(120);
    expect(store.values[PROFILE_STORAGE_KEY]).toBe(before);
  });

  test('a cloud save is normalized at the same boundary', () => {
    expect(driveSource).toContain('gold: normalizeGold(profile.gold)');
  });

  test('storage still answers null for a key that is not there', () => {
    expect(loadSavedProfile()).toBeNull();
  });
});
