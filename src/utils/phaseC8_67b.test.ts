/**
 * Phase C-8.67B — racing progression data model, transactions and persistence.
 *
 * Run with: `bun test src/utils/phaseC8_67b.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the data model: the three configurations and their prices, and the
 *       effective state any profile resolves to — a legacy save with no
 *       `racing` field, a partial field, and eleven malformed shapes, each of
 *       which must land on "Biga selected, Triga and Quadra locked" rather than
 *       throwing.  Biga is shown to be un-lockable from every one of them, and
 *       an orphan Quadra (4 without 3) is shown to be rejected;
 *   §B  purchase: Triga deducts exactly 750 once, Quadra exactly 1,500 once and
 *       only after Triga, a repeat purchase never charges again, an unknown or
 *       unaffordable operation leaves the caller's profile — and its gold —
 *       byte-identical, and no input object is ever mutated in place;
 *   §C  selection: free, allowed only for an unlocked configuration, idempotent,
 *       and it never moves gold;
 *   §D  independence: chariot wheel/finish ownership never unlocks a horse
 *       count, a racing purchase never touches the chariot loadout, the chariot
 *       catalogue and `ITEMS_DB` are untouched, and no application screen
 *       consumes this module yet (this phase is data + logic only);
 *   §E  persistence: a real `saveProfile()` / `loadSavedProfile()` round trip
 *       preserves a valid racing field, leaves a legacy save without one exactly
 *       as it was, and the Google Drive path's whole-profile serialization
 *       (`JSON.stringify(profile, null, 2)` up, `response.json()` down) is
 *       exercised locally with the same technique.  **No cloud upload, download
 *       or account-save mutation is performed anywhere in this suite.**
 *
 * The save used throughout is `createNewProfile()` — the same factory the game
 * uses — plus an explicit gold balance.  The player's real save in a browser's
 * `localStorage` is never read or written by this file.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── In-memory localStorage polyfill (bun's runtime has no DOM) ─────────────
const _store = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    _store.set(key, value);
  },
  removeItem: (key: string) => {
    _store.delete(key);
  },
  clear: () => {
    _store.clear();
  },
};
// @ts-ignore — assign to global before storage.ts is used
globalThis.localStorage = localStorageShim;

import { PlayerProfile } from '../types/game';
import { createNewProfile, saveProfile, loadSavedProfile } from '../services/storage';
import { CHARIOT_PARTS, DEFAULT_CHARIOT_FINISH, DEFAULT_CHARIOT_WHEELS } from '../data/chariotParts';
import { purchaseChariotPart, resolveChariotLoadout } from './chariotLoadout';
import {
  BIGA_HORSES,
  RACING_CONFIGS,
  defaultRacingState,
  describeRacingRejection,
  getRacingConfig,
  getRacingPurchaseEligibility,
  getRacingSelectionEligibility,
  isRacingConfigUnlocked,
  purchaseRacingConfig,
  resolveRacingState,
  selectRacingConfig,
} from './racingProgression';

// ── Sources ────────────────────────────────────────────────────────────────
const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const GAME_TYPES = code('../types/game.ts');
const STORAGE = code('../services/storage.ts');
const DRIVE = code('../services/googleDrive.ts');
const APP = code('../App.tsx');
const MODULE = code('./racingProgression.ts');

const SRC_ROOT = path('../');
/**
 * The module itself and every `*.test.ts` file are not application code: the
 * consumer sweep below is about what a *screen* consumes.  (Phase C-8.67C added
 * `phaseC8_67c.test.ts`, which imports the module, so the exclusion is stated by
 * extension rather than by one suite's filename.)
 */
const isSuiteOrModule = (file: string): boolean =>
  file.endsWith('racingProgression.ts') || file.endsWith('.test.ts');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    // `SRC_ROOT` is a directory URL, so it already ends in a separator.  Joining
    // without a second one keeps these paths slice-able back to repo-relative
    // names in the consumer sweep below — the doubled slash used to survive the
    // slice and leave a leading `/` on every comparison name.
    const full = `${dir.replace(/\/+$/, '')}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// ── Fixtures ───────────────────────────────────────────────────────────────
/** A fresh gladiator with the gold a test needs — the game's own factory. */
const profileWithGold = (gold: number): PlayerProfile => ({
  ...createNewProfile('Tester'),
  gold,
});

/** The stored shape a successful transaction writes. */
const stored = (unlocked: number[], selected: number) => ({ unlocked, selected });

const asJson = (value: unknown): string => JSON.stringify(value);

/** The eleven malformed `racing` shapes the resolver has to survive. */
const MALFORMED_RACING: unknown[] = [
  'triga',
  3,
  [],
  true,
  null,
  { unlocked: 'triga' },
  { unlocked: null },
  { unlocked: {} },
  { selected: 'triga' },
  { selected: 5 },
  { selected: 2.5 },
];

beforeEach(() => {
  _store.clear();
});

// ───────────────────────────────────────────────────────────────────────────
describe('C-8.67B §A — the data model and the effective state', () => {
  test('the catalogue is Biga 2, Triga 3, Quadra 4 with the proposed prices', () => {
    expect(RACING_CONFIGS.map((c) => c.id)).toEqual(['biga', 'triga', 'quadra']);
    expect(RACING_CONFIGS.map((c) => c.horses)).toEqual([2, 3, 4]);
    expect(RACING_CONFIGS.map((c) => c.name)).toEqual(['Biga', 'Triga', 'Quadra']);
    expect(RACING_CONFIGS.map((c) => c.price)).toEqual([0, 750, 1500]);
    expect(RACING_CONFIGS[0].requires).toBeUndefined();
    expect(RACING_CONFIGS[1].requires).toBe('biga');
    expect(RACING_CONFIGS[2].requires).toBe('triga');
    expect(BIGA_HORSES).toBe(2);
  });

  test('a configuration resolves by team size and by name, and nothing else does', () => {
    expect(getRacingConfig(2)?.name).toBe('Biga');
    expect(getRacingConfig(3)?.name).toBe('Triga');
    expect(getRacingConfig(4)?.name).toBe('Quadra');
    expect(getRacingConfig('biga')?.horses).toBe(2);
    expect(getRacingConfig('triga')?.horses).toBe(3);
    expect(getRacingConfig('quadra')?.horses).toBe(4);
    for (const junk of [0, 1, 5, 2.5, NaN, Infinity, '2', 'triga ', 'BIGA', '', null, undefined, {}, []]) {
      expect(getRacingConfig(junk)).toBeUndefined();
    }
  });

  test('a legacy profile with no racing field resolves to Biga only', () => {
    const legacy = createNewProfile('Legacy');
    expect('racing' in legacy).toBe(false);
    expect(resolveRacingState(legacy)).toEqual({ unlocked: [2], selected: 2, horses: 2 });
    expect(isRacingConfigUnlocked(legacy, 2)).toBe(true);
    expect(isRacingConfigUnlocked(legacy, 3)).toBe(false);
    expect(isRacingConfigUnlocked(legacy, 4)).toBe(false);
  });

  test('a missing profile resolves to the default state instead of throwing', () => {
    expect(resolveRacingState(null)).toEqual(defaultRacingState());
    expect(resolveRacingState(undefined)).toEqual(defaultRacingState());
    expect(defaultRacingState()).toEqual({ unlocked: [2], selected: 2, horses: 2 });
  });

  test('every malformed racing shape resolves to Biga selected, Triga and Quadra locked', () => {
    for (const racing of MALFORMED_RACING) {
      const profile = { ...profileWithGold(5000), racing } as unknown as PlayerProfile;
      const state = resolveRacingState(profile);
      expect(`${asJson(racing)} → ${asJson(state.unlocked)}/${state.selected}`).toBe(
        `${asJson(racing)} → [2]/2`
      );
      expect(state.horses).toBe(state.selected);
    }
  });

  test('malformed shapes are shown to be malformed — the shipped field is not one of them', () => {
    // The control for the test above: the same predicate passes a real unlock.
    const good = { ...profileWithGold(5000), racing: stored([3, 4], 4) } as PlayerProfile;
    expect(resolveRacingState(good).unlocked).toEqual([2, 3, 4]);
    expect(resolveRacingState(good).selected).toBe(4);
    for (const racing of MALFORMED_RACING) {
      const profile = { ...profileWithGold(5000), racing } as unknown as PlayerProfile;
      expect(resolveRacingState(profile).unlocked).toEqual([2]);
    }
  });

  test('a partial field never unlocks anything and never loses Biga', () => {
    const onlyUnlocked = { ...profileWithGold(5000), racing: { unlocked: [3] } } as PlayerProfile;
    expect(resolveRacingState(onlyUnlocked)).toEqual({ unlocked: [2, 3], selected: 2, horses: 2 });

    const onlySelected = { ...profileWithGold(5000), racing: { selected: 3 } } as PlayerProfile;
    expect(resolveRacingState(onlySelected)).toEqual({ unlocked: [2], selected: 2, horses: 2 });

    const empty = { ...profileWithGold(5000), racing: {} } as PlayerProfile;
    expect(resolveRacingState(empty)).toEqual({ unlocked: [2], selected: 2, horses: 2 });
  });

  test('a valid racing field resolves exactly as stored', () => {
    const triga = { ...profileWithGold(5000), racing: stored([3], 3) } as PlayerProfile;
    expect(resolveRacingState(triga)).toEqual({ unlocked: [2, 3], selected: 3, horses: 3 });

    const quadra = { ...profileWithGold(5000), racing: stored([3, 4], 4) } as PlayerProfile;
    expect(resolveRacingState(quadra)).toEqual({ unlocked: [2, 3, 4], selected: 4, horses: 4 });

    const bothBiga = { ...profileWithGold(5000), racing: stored([3, 4], 2) } as PlayerProfile;
    expect(resolveRacingState(bothBiga).selected).toBe(2);
  });

  test('Quadra is not validly unlocked without Triga', () => {
    const orphan = { ...profileWithGold(5000), racing: stored([4], 4) } as PlayerProfile;
    expect(resolveRacingState(orphan)).toEqual({ unlocked: [2], selected: 2, horses: 2 });

    // And the transaction layer will not create that state either.
    const rich = profileWithGold(5000);
    const refused = purchaseRacingConfig(rich, 4);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toBe('prerequisite-locked');
  });

  test('junk, unknown and duplicate entries in unlocked are dropped', () => {
    const messy = {
      ...profileWithGold(5000),
      racing: { unlocked: [3, 9, 2, '4', null, 3, 3.5] },
    } as unknown as PlayerProfile;
    expect(resolveRacingState(messy)).toEqual({ unlocked: [2, 3], selected: 2, horses: 2 });

    const messyHigh = {
      ...profileWithGold(5000),
      racing: { unlocked: [4, 4, 3, 4], selected: 4 },
    } as unknown as PlayerProfile;
    expect(resolveRacingState(messyHigh)).toEqual({ unlocked: [2, 3, 4], selected: 4, horses: 4 });
  });

  test('Biga can never be locked, whatever the profile says', () => {
    const shapes: unknown[] = [
      ...MALFORMED_RACING,
      {},
      { unlocked: [] },
      { unlocked: [4] },
      { unlocked: [4], selected: 4 },
      { unlocked: null, selected: 3 },
    ];
    for (const racing of shapes) {
      const profile = { ...profileWithGold(5000), racing } as unknown as PlayerProfile;
      expect(resolveRacingState(profile).unlocked).toContain(2);
      expect(isRacingConfigUnlocked(profile, 2)).toBe(true);
      const bought = purchaseRacingConfig(profile, 2);
      expect(bought.ok).toBe(false);
      expect(bought.ok === false && bought.reason).toBe('already-unlocked');
      expect(profile.gold).toBe(5000);
    }
  });

  test('the selected configuration is always 2, 3 or 4 and always unlocked', () => {
    const shapes: unknown[] = [
      ...MALFORMED_RACING,
      {},
      { selected: 3, unlocked: [3] },
      { selected: 4, unlocked: [3, 4] },
      { selected: 4, unlocked: [4] },
      { selected: 1 },
      { selected: -2 },
      { selected: 100 },
    ];
    for (const racing of shapes) {
      const profile = { ...profileWithGold(5000), racing } as unknown as PlayerProfile;
      const state = resolveRacingState(profile);
      expect([2, 3, 4]).toContain(state.selected);
      expect(state.unlocked).toContain(state.selected);
      expect(state.unlocked[0]).toBe(2);
    }
  });

  test('resolving a frozen profile neither throws nor mutates it', () => {
    const profile = {
      ...profileWithGold(5000),
      racing: stored([3, 4], 4),
    } as PlayerProfile;
    Object.freeze(profile.racing!.unlocked);
    Object.freeze(profile.racing);
    Object.freeze(profile);

    const before = asJson(profile);
    expect(resolveRacingState(profile)).toEqual({ unlocked: [2, 3, 4], selected: 4, horses: 4 });
    expect(resolveRacingState(profile)).toEqual(resolveRacingState(profile));
    expect(asJson(profile)).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('C-8.67B §B — purchase', () => {
  test('Triga costs exactly 750, once, and is recorded without being selected', () => {
    const profile = profileWithGold(5000);
    const result = purchaseRacingConfig(profile, 3);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(profile.gold - result.profile.gold).toBe(750);
    expect(result.profile.gold).toBe(4250);
    expect(result.profile.racing).toEqual(stored([3], 2));
    expect(resolveRacingState(result.profile)).toEqual({ unlocked: [2, 3], selected: 2, horses: 2 });
    // A purchase is not a selection, and the caller's profile is untouched.
    expect(profile.gold).toBe(5000);
    expect(profile.racing).toBeUndefined();
  });

  test('Triga also resolves when it is bought by name', () => {
    const result = purchaseRacingConfig(profileWithGold(5000), 'triga');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(4250);
    expect(result.profile.racing).toEqual(stored([3], 2));
  });

  test('Quadra costs exactly 1,500, once, and only after Triga', () => {
    const refused = purchaseRacingConfig(profileWithGold(5000), 4);
    expect(refused).toEqual({ ok: false, reason: 'prerequisite-locked' });

    const afterTriga = purchaseRacingConfig(profileWithGold(5000), 3);
    expect(afterTriga.ok).toBe(true);
    if (!afterTriga.ok) return;

    const quadra = purchaseRacingConfig({ ...afterTriga.profile, gold: 3000 }, 4);
    expect(quadra.ok).toBe(true);
    if (!quadra.ok) return;
    expect(3000 - quadra.profile.gold).toBe(1500);
    expect(quadra.profile.racing).toEqual(stored([3, 4], 2));
  });

  test('a duplicate purchase never charges twice', () => {
    const first = purchaseRacingConfig(profileWithGold(5000), 3);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = purchaseRacingConfig(first.profile, 3);
    expect(second).toEqual({ ok: false, reason: 'already-unlocked' });
    expect(first.profile.gold).toBe(4250);

    const third = purchaseRacingConfig(first.profile, 'triga');
    expect(third).toEqual({ ok: false, reason: 'already-unlocked' });
    expect(first.profile.gold).toBe(4250);

    const quadraOnce = purchaseRacingConfig({ ...first.profile, gold: 5000 }, 4);
    expect(quadraOnce.ok).toBe(true);
    if (!quadraOnce.ok) return;
    const quadraAgain = purchaseRacingConfig(quadraOnce.profile, 4);
    expect(quadraAgain).toEqual({ ok: false, reason: 'already-unlocked' });
    expect(quadraOnce.profile.gold).toBe(3500);
  });

  test('Biga is free and always available — it is never "bought"', () => {
    for (const gold of [0, 100, 5000]) {
      const profile = profileWithGold(gold);
      const result = purchaseRacingConfig(profile, 2);
      expect(result).toEqual({ ok: false, reason: 'already-unlocked' });
      expect(profile.gold).toBe(gold);
      expect(profile.racing).toBeUndefined();
    }
  });

  test('insufficient gold is refused and leaves the original profile unchanged', () => {
    const poor = profileWithGold(749);
    const before = asJson(poor);
    expect(purchaseRacingConfig(poor, 3)).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect(asJson(poor)).toBe(before);
    expect(poor.gold).toBe(749);

    const poorQuadra = { ...purchaseRacingConfig(profileWithGold(5000), 3) };
    expect(poorQuadra.ok).toBe(true);
    if (!poorQuadra.ok) return;
    const broke = { ...poorQuadra.profile, gold: 1499 };
    const brokeBefore = asJson(broke);
    expect(purchaseRacingConfig(broke, 4)).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect(asJson(broke)).toBe(brokeBefore);
  });

  test('exactly enough gold pays to exactly zero', () => {
    const result = purchaseRacingConfig(profileWithGold(750), 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(0);
    // …and then Quadra is unaffordable, not silently free.
    expect(purchaseRacingConfig(result.profile, 4)).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });
  });

  test('a profile with no usable gold balance cannot buy anything', () => {
    for (const gold of [undefined, null, NaN, Infinity, '5000'] as unknown[]) {
      const profile = { ...createNewProfile('Tester'), gold } as unknown as PlayerProfile;
      const before = asJson(profile);
      expect(purchaseRacingConfig(profile, 3)).toEqual({ ok: false, reason: 'insufficient-gold' });
      expect(asJson(profile)).toBe(before);
    }
  });

  test('unknown configurations, sizes and profiles are refused', () => {
    for (const ref of [0, 1, 5, 2.5, NaN, 'quadriga', 'TRIGA', '', null, undefined, {}, []]) {
      const profile = profileWithGold(5000);
      const result = purchaseRacingConfig(profile, ref);
      expect(result).toEqual({ ok: false, reason: 'unknown-config' });
      expect(profile.gold).toBe(5000);
    }
    expect(purchaseRacingConfig(null, 3)).toEqual({ ok: false, reason: 'no-profile' });
    expect(purchaseRacingConfig(undefined, 3)).toEqual({ ok: false, reason: 'no-profile' });
  });

  test('the eligibility read-out matches what the purchase then does', () => {
    const poor = profileWithGold(600);
    expect(getRacingPurchaseEligibility(poor, 3)).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });

    const rich = profileWithGold(5000);
    expect(getRacingPurchaseEligibility(rich, 3)).toEqual({ ok: true });
    expect(getRacingPurchaseEligibility(rich, 4)).toEqual({
      ok: false,
      reason: 'prerequisite-locked',
    });
    expect(getRacingPurchaseEligibility(rich, 2)).toEqual({
      ok: false,
      reason: 'already-unlocked',
    });
    expect(getRacingPurchaseEligibility(rich, 9)).toEqual({ ok: false, reason: 'unknown-config' });
    expect(getRacingPurchaseEligibility(null, 3)).toEqual({ ok: false, reason: 'no-profile' });

    const bought = purchaseRacingConfig(rich, 3);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(getRacingPurchaseEligibility(bought.profile, 4)).toEqual({ ok: true });
    expect(getRacingPurchaseEligibility(bought.profile, 3)).toEqual({
      ok: false,
      reason: 'already-unlocked',
    });
  });

  test('a refused purchase does not mutate a frozen profile, and a success never does either', () => {
    const profile = {
      ...profileWithGold(5000),
      racing: stored([3, 4], 4),
    } as PlayerProfile;
    Object.freeze(profile.racing!.unlocked);
    Object.freeze(profile.racing);
    Object.freeze(profile);
    const before = asJson(profile);

    expect(purchaseRacingConfig(profile, 3)).toEqual({ ok: false, reason: 'already-unlocked' });
    expect(purchaseRacingConfig(profile, 4)).toEqual({ ok: false, reason: 'already-unlocked' });
    expect(purchaseRacingConfig(profile, 2)).toEqual({ ok: false, reason: 'already-unlocked' });
    expect(asJson(profile)).toBe(before);

    const fresh = { ...profileWithGold(5000), chariot: { owned: ['wheels_standard'], equipped: { wheels: 'wheels_standard', finish: 'finish_stock' } } };
    Object.freeze(fresh);
    const freshBefore = asJson(fresh);
    const result = purchaseRacingConfig(fresh, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile).not.toBe(fresh);
    expect(asJson(fresh)).toBe(freshBefore);
  });

  test('the same purchase twice from the same base profile is deterministic', () => {
    const base = profileWithGold(5000);
    const a = purchaseRacingConfig(base, 3);
    const b = purchaseRacingConfig(base, 3);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(asJson(a.profile)).toBe(asJson(b.profile));
    expect(base.gold).toBe(5000);
  });

  test('every refusal has a player-facing explanation', () => {
    for (const reason of [
      'no-profile',
      'unknown-config',
      'already-unlocked',
      'prerequisite-locked',
      'insufficient-gold',
      'not-unlocked',
    ] as const) {
      const text = describeRacingRejection(reason);
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('C-8.67B §C — selection', () => {
  test('selecting Biga is always allowed and costs nothing', () => {
    for (const gold of [0, 100, 5000]) {
      const profile = { ...profileWithGold(gold), racing: stored([3, 4], 4) } as PlayerProfile;
      const result = selectRacingConfig(profile, 2);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.profile.gold).toBe(gold);
      expect(result.profile.racing).toEqual(stored([3, 4], 2));
      expect(resolveRacingState(result.profile).selected).toBe(2);
    }

    // A legacy profile with no racing field can still select Biga safely.
    const legacy = profileWithGold(100);
    const legacyResult = selectRacingConfig(legacy, 2);
    expect(legacyResult.ok).toBe(true);
    if (!legacyResult.ok) return;
    expect(legacyResult.profile.racing).toEqual(stored([], 2));
    expect(legacyResult.profile.gold).toBe(100);
  });

  test('a locked configuration cannot be selected, and the profile is left alone', () => {
    const profile = profileWithGold(5000);
    const before = asJson(profile);
    expect(selectRacingConfig(profile, 3)).toEqual({ ok: false, reason: 'not-unlocked' });
    expect(selectRacingConfig(profile, 4)).toEqual({ ok: false, reason: 'not-unlocked' });
    expect(selectRacingConfig(profile, 'triga')).toEqual({ ok: false, reason: 'not-unlocked' });
    expect(asJson(profile)).toBe(before);
    expect(profile.gold).toBe(5000);
  });

  test('a bought configuration can be selected, free, and it sticks', () => {
    const bought = purchaseRacingConfig(profileWithGold(5000), 3);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const selected = selectRacingConfig(bought.profile, 3);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(selected.profile.gold).toBe(4250);
    expect(selected.profile.racing).toEqual(stored([3], 3));
    expect(resolveRacingState(selected.profile)).toEqual({
      unlocked: [2, 3],
      selected: 3,
      horses: 3,
    });

    // Quadra, once owned, selects by name too.
    const both = { ...selected.profile, gold: 5000 };
    const quadra = purchaseRacingConfig(both, 4);
    expect(quadra.ok).toBe(true);
    if (!quadra.ok) return;
    const chosen = selectRacingConfig(quadra.profile, 'quadra');
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.profile.racing).toEqual(stored([3, 4], 4));
    expect(chosen.profile.gold).toBe(3500);
  });

  test('re-selecting the configuration already in use is idempotent', () => {
    const profile = { ...profileWithGold(5000), racing: stored([3], 3) } as PlayerProfile;
    const result = selectRacingConfig(profile, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(asJson(result.profile)).toBe(asJson(profile));
    expect(result.profile.gold).toBe(5000);
  });

  test('selection refuses unknown configurations and missing profiles', () => {
    for (const ref of [0, 1, 5, 8.5, 'bigga', null, undefined, {}, []]) {
      expect(selectRacingConfig(profileWithGold(5000), ref)).toEqual({
        ok: false,
        reason: 'unknown-config',
      });
    }
    expect(selectRacingConfig(null, 2)).toEqual({ ok: false, reason: 'no-profile' });
    expect(selectRacingConfig(undefined, 2)).toEqual({ ok: false, reason: 'no-profile' });
  });

  test('the selection eligibility read-out matches what the selection then does', () => {
    const profile = { ...profileWithGold(0), racing: stored([3], 3) } as PlayerProfile;
    expect(getRacingSelectionEligibility(profile, 2)).toEqual({ ok: true });
    expect(getRacingSelectionEligibility(profile, 3)).toEqual({ ok: true });
    expect(getRacingSelectionEligibility(profile, 4)).toEqual({
      ok: false,
      reason: 'not-unlocked',
    });
    expect(getRacingSelectionEligibility(profile, 7)).toEqual({
      ok: false,
      reason: 'unknown-config',
    });
    expect(getRacingSelectionEligibility(null, 2)).toEqual({ ok: false, reason: 'no-profile' });
  });

  test('selecting never touches gold, on any path', () => {
    const profile = {
      ...profileWithGold(1234),
      racing: stored([3, 4], 4),
    } as PlayerProfile;
    for (const ref of [2, 3, 4, 'triga', 'quadra'] as const) {
      const result = selectRacingConfig(profile, ref);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.profile.gold).toBe(1234);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('C-8.67B §D — unlocks are independent of the chariot workshop', () => {
  test('buying chariot parts never unlocks a horse count', () => {
    let profile = profileWithGold(5000);
    // L16B appended a VISITOR-ONLY finish (`finish_ventive`). It carries a real
    // price but the workshop never sells it, so it is outside this workshop-only
    // sweep; its own suite pins that refusal and the visitor trade that grants it.
    for (const part of CHARIOT_PARTS.filter((p) => p.price > 0 && !p.visitorOnly)) {
      const bought = purchaseChariotPart(profile, part.id);
      expect(bought.ok).toBe(true);
      if (!bought.ok) return;
      profile = bought.profile;
    }
    // Every part is owned now, and racing is exactly where it started.
    expect(resolveChariotLoadout(profile).owned.length).toBeGreaterThan(2);
    expect(resolveRacingState(profile)).toEqual({ unlocked: [2], selected: 2, horses: 2 });
    expect(isRacingConfigUnlocked(profile, 3)).toBe(false);
    expect(isRacingConfigUnlocked(profile, 4)).toBe(false);
    // …and Triga is still purchasable, on its own price.
    expect(getRacingPurchaseEligibility(profile, 3)).toEqual({ ok: true });
  });

  test('owning every finish and wheel leaves Triga and Quadra locked', () => {
    const profile = {
      ...profileWithGold(5000),
      chariot: {
        owned: CHARIOT_PARTS.map((p) => p.id),
        equipped: { wheels: DEFAULT_CHARIOT_WHEELS, finish: DEFAULT_CHARIOT_FINISH },
      },
    } as PlayerProfile;
    expect(resolveRacingState(profile).unlocked).toEqual([2]);
    expect(getRacingPurchaseEligibility(profile, 3)).toEqual({ ok: true });
    expect(getRacingPurchaseEligibility(profile, 4)).toEqual({
      ok: false,
      reason: 'prerequisite-locked',
    });
  });

  test('a racing purchase leaves the chariot loadout byte-identical', () => {
    const profile = {
      ...profileWithGold(5000),
      chariot: {
        owned: [DEFAULT_CHARIOT_WHEELS, DEFAULT_CHARIOT_FINISH, 'finish_gilded'],
        equipped: { wheels: DEFAULT_CHARIOT_WHEELS, finish: 'finish_gilded' },
      },
    } as PlayerProfile;
    const chariotBefore = asJson(profile.chariot);
    const loadoutBefore = resolveChariotLoadout(profile);

    const bought = purchaseRacingConfig(profile, 3);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(asJson(bought.profile.chariot)).toBe(chariotBefore);
    expect(resolveChariotLoadout(bought.profile)).toEqual(loadoutBefore);
    expect(bought.profile.gold).toBe(4250);

    const selected = selectRacingConfig(bought.profile, 3);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(asJson(selected.profile.chariot)).toBe(chariotBefore);
  });

  test('the racing module has no chariot or item dependency', () => {
    expect(MODULE).not.toContain('chariotParts');
    expect(MODULE).not.toContain('chariotLoadout');
    expect(MODULE).not.toContain('itemsDB');
    expect(MODULE).not.toContain('localStorage');
    expect(MODULE).not.toContain('saveProfile');
    expect(MODULE).not.toContain('fetch(');
    // It imports the types only.
    expect(MODULE).toContain("from '../types/game'");
  });

  test('the chariot catalogue and prices are untouched by this phase', () => {
    // L16B appended `finish_ventive` (900, visitor-acquired) at the end; the six
    // entries this phase pinned are unchanged in id, order and price.
    const prices = CHARIOT_PARTS.map((p) => [p.id, p.price]);
    expect(prices).toEqual([
      ['wheels_standard', 0],
      ['wheels_reinforced', 450],
      ['finish_stock', 0],
      ['finish_charred', 180],
      ['finish_gilded', 320],
      ['finish_oxblood', 240],
      ['finish_ventive', 900],
    ]);
  });

  test('the racing module is consumed by the C-8.67C UI, the C-8.70B pre-race panel, and by nothing else', () => {
    // Phase C-8.67B asserted this list was EMPTY ("data + logic only, no UI").
    // Phase C-8.67C wired the module into the player-facing Racing Configuration
    // section, App's two handlers and its dev-only harness.  Phase C-8.70B added
    // exactly one more: `PreRacePanel`, the East Circus District's read-only
    // pre-race surface, which reads the selected team through the module's pure
    // `getSelectedRacingConfig` and writes nothing.  The guard stays a deliberate,
    // narrow allowlist: a *gameplay* file — a race loop, an arena entry, physics,
    // a HUD — still cannot start importing it without failing here, so a new
    // consumer must be named here on purpose rather than slipping in under a
    // blanket allowance.
    const consumers = sourceFiles(SRC_ROOT)
      .filter((file) => !isSuiteOrModule(file))
      .filter((file) => code(file).includes('racingProgression'))
      .map((file) => file.slice(SRC_ROOT.length))
      .sort();
    expect(consumers).toEqual([
      'App.tsx',
      'components/dev/RacingConfigHarness.tsx',
      'components/hub/PreRacePanel.tsx',
      'components/hub/RacingConfigSection.tsx',
    ]);
    expect(code('./racingProgression.ts').length).toBeGreaterThan(1000);
  });

  test('the profile type declares the field as optional and nothing writes it by default', () => {
    expect(GAME_TYPES).toContain('racing?: RacingProgression');
    expect(GAME_TYPES).toContain('export type ChariotTeamSize = 2 | 3 | 4;');
    expect(GAME_TYPES).toContain('export interface RacingProgression {');
    // No migration, no default injection: `createNewProfile` writes no racing.
    expect(STORAGE).not.toContain('racing');
    expect(DRIVE).not.toContain('racing');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('C-8.67B §E — persistence, local and cloud-shaped', () => {
  test('a local save/load round trip preserves a valid racing field', () => {
    const profile = {
      ...profileWithGold(4250),
      racing: stored([3], 3),
    } as PlayerProfile;
    saveProfile(profile);
    const loaded = loadSavedProfile();
    expect(loaded).not.toBeNull();
    expect(loaded!.racing).toEqual(stored([3], 3));
    expect(resolveRacingState(loaded)).toEqual({ unlocked: [2, 3], selected: 3, horses: 3 });
    expect(asJson(loaded)).toBe(asJson(profile));
  });

  test('a legacy save round-trips with no racing field added — byte-identical', () => {
    const legacy = createNewProfile('Legacy');
    const before = asJson(legacy);
    saveProfile(legacy);
    const loaded = loadSavedProfile();
    expect(loaded).not.toBeNull();
    expect('racing' in loaded!).toBe(false);
    expect(asJson(loaded)).toBe(before);
  });

  test('a purchase then a save/load round trip keeps gold and the unlock exactly', () => {
    const bought = purchaseRacingConfig(profileWithGold(5000), 3);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    saveProfile(bought.profile);
    const loaded = loadSavedProfile()!;
    expect(loaded.gold).toBe(4250);
    expect(loaded.racing).toEqual(stored([3], 2));
    expect(resolveRacingState(loaded)).toEqual({ unlocked: [2, 3], selected: 2, horses: 2 });
  });

  test('the cloud path serializes the whole profile — no field whitelist', () => {
    // The upload body's own expression, read out of the shipped service…
    expect(DRIVE).toContain('const fileContent = JSON.stringify(profile, null, 2);');
    expect(DRIVE).toContain('const profile: PlayerProfile = await response.json();');
    // …and the import path hands that profile straight to the existing save.
    expect(APP).toContain('saveProfile(loadedProfile);');
    expect(String(STORAGE.match(/JSON\.parse\(raw\)/) !== null)).toBe('true');
    expect(String(STORAGE.match(/JSON\.stringify\(profile\)/) !== null)).toBe('true');
  });

  test('the cloud serialization technique preserves racing, and legacy saves too', () => {
    // Exactly what `saveProfileToDrive` builds and `loadProfileFromDrive` parses.
    const upload = (profile: PlayerProfile) => JSON.stringify(profile, null, 2);
    const download = (text: string) => JSON.parse(text) as PlayerProfile;

    const racing = {
      ...profileWithGold(2750),
      racing: stored([3, 4], 4),
    } as PlayerProfile;
    const roundTripped = download(upload(racing));
    expect(roundTripped.racing).toEqual(stored([3, 4], 4));
    expect(resolveRacingState(roundTripped)).toEqual({
      unlocked: [2, 3, 4],
      selected: 4,
      horses: 4,
    });
    expect(asJson(roundTripped)).toBe(asJson(racing));

    const legacy = createNewProfile('Legacy');
    const legacyText = upload(legacy);
    const legacyBack = download(legacyText);
    expect('racing' in legacyBack).toBe(false);
    expect(legacyText).not.toContain('racing');
    expect(asJson(legacyBack)).toBe(asJson(legacy));

    // A malformed field survives the round trip and still resolves safely.
    const malformed = { ...profileWithGold(100), racing: { selected: 4 } } as PlayerProfile;
    const malformedBack = download(upload(malformed));
    expect(resolveRacingState(malformedBack)).toEqual({
      unlocked: [2],
      selected: 2,
      horses: 2,
    });
  });

  test('the profile preview metadata is unaffected by the new field', () => {
    const profile = { ...profileWithGold(4250), racing: stored([3], 3) } as PlayerProfile;
    const preview = {
      name: profile.name,
      level: profile.level,
      gold: profile.gold,
      fame: profile.fame,
      tier: profile.currentTier,
    };
    expect(Object.keys(preview)).toEqual(['name', 'level', 'gold', 'fame', 'tier']);
    expect(JSON.stringify(preview)).not.toContain('racing');
  });
});
