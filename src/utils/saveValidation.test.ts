/**
 * saveValidation.test.ts — the save-safety pass, save-loading half.
 *
 * Run with: bun test src/utils/saveValidation.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A `isValidStoredProfile` — the shape the game will run on: every non-optional
 *      member of `PlayerProfile` present at its own type.  A save carrying every
 *      field the game needs PASSES (including one written before `injury` / `isLeftyMode`
 *      / `chariot` / `racing` existed), and a save missing or mistyping any single
 *      required field FAILS.  Nested content is deliberately not this check's business.
 *   §B `loadSavedProfile` — a good save comes back exactly as it was parsed; a save
 *      that is not valid JSON, or is missing a field the game runs on, is answered
 *      with `null` AND has its original bytes kept verbatim under the quarantine key,
 *      while the profile key itself is never emptied, rewritten or removed.
 *   §C `readStoredProfileSummary` — the tolerant read the overwrite dialog names the
 *      existing gladiator with: `null` only when nothing is stored, and the identity
 *      fields `null` (but a summary all the same) when the stored bytes are unreadable.
 *   §D the wiring — the game's load path never deletes the player's save, the
 *      quarantine key is its own key, and every route into character creation passes
 *      through App's `beginCharacterCreation` gate.
 *
 * The storage sections drive a recording store rather than a browser's own, so nothing
 * here can touch a real save.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  PROFILE_STORAGE_KEY,
  PROFILE_QUARANTINE_KEY,
  createNewProfile,
  isValidStoredProfile,
  loadSavedProfile,
  readStoredProfileSummary,
  wasStoredSaveQuarantined,
} from '../services/storage';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** A source with its comments stripped, so prose can neither satisfy nor defeat a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

/* ---------------------------------------------------------------------------
 * A recording store, so no browser and no real save is involved.
 * ------------------------------------------------------------------------- */

interface StoreLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const makeStore = (seed: Record<string, string> = {}) => {
  const data = new Map<string, string>(Object.entries(seed));
  return {
    data,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
  };
};

/** Run `fn` with `localStorage` replaced, then put the real one back. */
const withStore = <T>(store: StoreLike, fn: () => T): T => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};

/** The fields a stored save must carry — the specification, written out on purpose. */
const REQUIRED_FIELDS = [
  'name',
  'title',
  'rank',
  'appearance',
  'level',
  'xp',
  'xpToNextLevel',
  'unspentStatPoints',
  'baseStats',
  'gold',
  'fame',
  'currentTier',
  'tierProgress',
  'defeatedOpponentIds',
  'bossKills',
  'newGamePlus',
  'trainingSessionsLeft',
  'equipped',
  'inventory',
  'fightsWon',
  'fightsLost',
  'peakCrowdHypeOverall',
] as const;

/** A minimal save the game can run on — and that carries NO optional field. */
const validStoredProfile = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Crixus',
  title: 'The Sandborn Rebel',
  rank: 'Veteran',
  appearance: { skinColor: '#c68b59', characterModel: 'roman_warrior' },
  level: 4,
  xp: 120,
  xpToNextLevel: 300,
  unspentStatPoints: 0,
  baseStats: { strength: 11, agility: 9, stamina: 10, defense: 6 },
  gold: 420,
  fame: 37,
  currentTier: 2,
  tierProgress: { 1: 5, 2: 1 },
  defeatedOpponentIds: ['marcus'],
  bossKills: 1,
  newGamePlus: 0,
  trainingSessionsLeft: 1,
  equipped: { weapon: { id: 'gladius', name: 'Gladius' } },
  inventory: [{ id: 'gladius' }],
  fightsWon: 7,
  fightsLost: 2,
  peakCrowdHypeOverall: 88,
  ...overrides,
});

describe('§A isValidStoredProfile — the shape the game will run on', () => {
  test('a save carrying every required field passes', () => {
    expect(isValidStoredProfile(validStoredProfile())).toBe(true);
  });

  test('a freshly created profile — the game\'s own output — passes', () => {
    expect(isValidStoredProfile(createNewProfile('Test Gladiator'))).toBe(true);
  });

  test('a save written before the optional fields existed still passes', () => {
    const old = validStoredProfile();
    for (const optional of ['injury', 'isLeftyMode', 'chariot', 'racing']) {
      expect(optional in old).toBe(false);
    }
    expect(isValidStoredProfile(old)).toBe(true);
  });

  test('anything that is not a plain object fails', () => {
    for (const value of [null, undefined, 42, 'save', true, [], [validStoredProfile()]]) {
      expect(isValidStoredProfile(value), String(value)).toBe(false);
    }
  });

  test('missing any ONE required field fails', () => {
    for (const field of REQUIRED_FIELDS) {
      const save = validStoredProfile();
      delete save[field];
      expect(isValidStoredProfile(save), `without ${field}`).toBe(false);
    }
  });

  test('a required field at the WRONG type fails', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['name is a number', { name: 42 }],
      ['rank is an object', { rank: { value: 'Rookie' } }],
      ['level is a string', { level: '4' }],
      ['fame is NaN', { fame: Number.NaN }],
      ['gold is Infinity', { gold: Number.POSITIVE_INFINITY }],
      ['appearance is an array', { appearance: [] }],
      ['tierProgress is an array', { tierProgress: [] }],
      ['defeatedOpponentIds is an object', { defeatedOpponentIds: {} }],
      ['inventory is an object', { inventory: {} }],
      ['baseStats missing defense', { baseStats: { strength: 1, agility: 1, stamina: 1 } }],
      ['baseStats.strength is a string', { baseStats: { strength: '10', agility: 1, stamina: 1, defense: 1 } }],
      ['equipped has no weapon', { equipped: {} }],
      ['equipped.weapon is a string', { equipped: { weapon: 'gladius' } }],
    ];
    for (const [label, override] of cases) {
      expect(isValidStoredProfile(validStoredProfile(override)), label).toBe(false);
    }
  });

  test('it is a shape check only: nested content and unknown fields are the game\'s business', () => {
    const save = validStoredProfile({
      appearance: { anything: 'goes' },
      tierProgress: {},
      equipped: { weapon: { id: 'x' }, helm: 'not-an-armor' },
      injury: { weird: true },
      somethingNew: 7,
    });
    expect(isValidStoredProfile(save)).toBe(true);
  });

  test('the required list is exactly the non-optional members of PlayerProfile, read from the type', () => {
    // Any non-optional field added to the interface without a rule in the loader would
    // silently become a save the game boots with and then trips over, so the two are
    // held equal here.  Only the interface's own top-level members (2-space indent)
    // count; the nested stat/equipment members are not fields of the profile itself.
    const type = load('../types/game.ts');
    const start = type.indexOf('export interface PlayerProfile');
    const body = type.slice(start, type.indexOf('\n}', start));
    const topLevel = body
      .split('\n')
      .filter((line) => /^ {2}[A-Za-z_]/.test(line))
      .map((line) => line.trim());
    const nonOptional = topLevel.filter((line) => !line.includes('?')).map((line) => line.slice(0, line.indexOf(':')));
    expect(nonOptional.sort()).toEqual([...REQUIRED_FIELDS].sort());
  });
});

describe('§B loadSavedProfile — a good save is returned untouched, a bad one is kept', () => {
  test('nothing stored loads as no save, and reports no new quarantine', () => {
    // The quarantine flag is module state that latches on the first bad save
    // anywhere in the process — the save corpus suite deliberately loads a
    // corrupt fixture, so in a full-repo run it can already be true here.  The
    // assertion is therefore relative: this load must not change the flag.
    const before = wasStoredSaveQuarantined();
    const store = makeStore();
    withStore(store, () => {
      expect(loadSavedProfile()).toBeNull();
      expect(store.data.has(PROFILE_QUARANTINE_KEY)).toBe(false);
    });
    expect(wasStoredSaveQuarantined()).toBe(before);
  });

  test('a valid save comes back exactly as parsed — no field added, removed or repaired', () => {
    const stored = validStoredProfile();
    const raw = JSON.stringify(stored);
    const store = makeStore({ [PROFILE_STORAGE_KEY]: raw });
    withStore(store, () => {
      const loaded = loadSavedProfile();
      expect(loaded).not.toBeNull();
      expect(loaded).toEqual(stored);
      // Optional fields are NOT invented on the way through.
      for (const optional of ['injury', 'isLeftyMode', 'chariot', 'racing']) {
        expect(Object.prototype.hasOwnProperty.call(loaded, optional), optional).toBe(false);
      }
      // The stored bytes are untouched, character for character.
      expect(store.data.get(PROFILE_STORAGE_KEY)).toBe(raw);
      expect(store.data.has(PROFILE_QUARANTINE_KEY)).toBe(false);
    });
  });

  test('unreadable bytes load as no save, are kept verbatim under the quarantine key, and say so once', () => {
    const raw = '{ this is not json';
    const store = makeStore({ [PROFILE_STORAGE_KEY]: raw });
    withStore(store, () => {
      expect(loadSavedProfile()).toBeNull();
      expect(store.data.get(PROFILE_QUARANTINE_KEY)).toBe(raw);
      // The player's own key is never emptied or rewritten by the load path.
      expect(store.data.get(PROFILE_STORAGE_KEY)).toBe(raw);
    });
    expect(wasStoredSaveQuarantined()).toBe(true);
  });

  test('valid JSON that is missing a field the game runs on is quarantined too', () => {
    const stored = validStoredProfile();
    delete stored.baseStats;
    const raw = JSON.stringify(stored);
    const store = makeStore({ [PROFILE_STORAGE_KEY]: raw });
    withStore(store, () => {
      expect(loadSavedProfile()).toBeNull();
      expect(store.data.get(PROFILE_QUARANTINE_KEY)).toBe(raw);
      expect(store.data.get(PROFILE_STORAGE_KEY)).toBe(raw);
    });
  });

  test('valid JSON that is not an object at all is quarantined', () => {
    const raw = '42';
    const store = makeStore({ [PROFILE_STORAGE_KEY]: raw });
    withStore(store, () => {
      expect(loadSavedProfile()).toBeNull();
      expect(store.data.get(PROFILE_QUARANTINE_KEY)).toBe(raw);
    });
  });

  test('the quarantine key holds the MOST RECENT unreadable save', () => {
    const store = makeStore();
    withStore(store, () => {
      store.setItem(PROFILE_STORAGE_KEY, 'first bad save');
      loadSavedProfile();
      expect(store.data.get(PROFILE_QUARANTINE_KEY)).toBe('first bad save');

      store.setItem(PROFILE_STORAGE_KEY, 'second bad save');
      loadSavedProfile();
      expect(store.data.get(PROFILE_QUARANTINE_KEY)).toBe('second bad save');
      expect(store.data.get(PROFILE_STORAGE_KEY)).toBe('second bad save');
    });
  });

  test('a store that refuses writes still gives a usable answer', () => {
    const hostile = {
      getItem: () => 'not json',
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => {},
    };
    withStore(hostile, () => {
      expect(loadSavedProfile()).toBeNull();
    });
  });
});

describe('§C readStoredProfileSummary — what the overwrite dialog names', () => {
  test('nothing stored is null — there is no gladiator to warn about', () => {
    const store = makeStore();
    withStore(store, () => {
      expect(readStoredProfileSummary()).toBeNull();
    });
  });

  test('a readable save reports name, rank and fame', () => {
    const store = makeStore({
      [PROFILE_STORAGE_KEY]: JSON.stringify(validStoredProfile({ name: 'Crixus', rank: 'Veteran', fame: 37 })),
    });
    withStore(store, () => {
      expect(readStoredProfileSummary()).toEqual({ name: 'Crixus', fame: 37, rank: 'Veteran' });
    });
  });

  test('an unreadable save is STILL a save: the identity reads null, the summary does not', () => {
    for (const raw of ['{ broken', '42', 'null', '["a"]']) {
      const store = makeStore({ [PROFILE_STORAGE_KEY]: raw });
      withStore(store, () => {
        expect(readStoredProfileSummary(), raw).toEqual({ name: null, fame: null, rank: null });
      });
    }
  });

  test('fields that are missing or the wrong type read as null rather than as a lie', () => {
    const store = makeStore({
      [PROFILE_STORAGE_KEY]: JSON.stringify({ name: '   ', fame: 'lots', rank: 3 }),
    });
    withStore(store, () => {
      expect(readStoredProfileSummary()).toEqual({ name: null, fame: null, rank: null });
    });
  });

  test('fame of 0 is reported as 0, not as absent', () => {
    const store = makeStore({
      [PROFILE_STORAGE_KEY]: JSON.stringify(validStoredProfile({ name: 'Titus', rank: 'Rookie', fame: 0 })),
    });
    withStore(store, () => {
      expect(readStoredProfileSummary()).toEqual({ name: 'Titus', fame: 0, rank: 'Rookie' });
    });
  });

  test('reading a summary never writes anything', () => {
    const store = makeStore({ [PROFILE_STORAGE_KEY]: '{ broken' });
    withStore(store, () => {
      readStoredProfileSummary();
      expect([...store.data.keys()]).toEqual([PROFILE_STORAGE_KEY]);
    });
  });
});

describe('§D the wiring — the save is never dropped, and every way in is gated', () => {
  test('the quarantine key is its own key, distinct from the player\'s save', () => {
    expect(PROFILE_QUARANTINE_KEY).not.toBe(PROFILE_STORAGE_KEY);
    expect(PROFILE_QUARANTINE_KEY.startsWith(PROFILE_STORAGE_KEY)).toBe(true);
  });

  test('the load path never removes the player\'s save', () => {
    const storage = load('../services/storage.ts');
    const loadFn = storage.slice(
      storage.indexOf('export function loadSavedProfile'),
      storage.indexOf('export function saveProfile'),
    );
    expect(loadFn).not.toContain('removeItem');
  });

  test('App routes every entry into character creation through one gate', () => {
    const app = code(load('../App.tsx'));
    // The gate exists, and it asks the tolerant reader before it does anything.
    expect(app).toContain('const beginCharacterCreation = () => {');
    expect(app).toContain('const stored = readStoredProfileSummary();');
    expect(app).toContain('setOverwriteConfirm(stored);');
    // With no save stored it goes straight in — the flow before this pass, unchanged.
    expect(app).toContain("setCurrentScreen('create_character');");
    // The modal's own confirm is what continues into creation.
    expect(app).toContain('setOverwriteConfirm(null);');
    // Every route in — the title's tap and all five sign-in fallbacks — goes through
    // the gate. Only the gate itself and the modal's confirm reach creation directly.
    expect((app.match(/beginCharacterCreation\(\);/g) ?? []).length).toBe(6);
    expect((app.match(/setCurrentScreen\('create_character'\)/g) ?? []).length).toBe(2);
    // The title is told about a quarantined save rather than failing silently.
    expect(app).toContain('saveQuarantineNotice={saveQuarantineNotice}');
    expect(app).toContain('if (wasStoredSaveQuarantined()) setSaveQuarantineNotice(true);');
  });
});

describe('§E the title states a quarantined save, once, in plain language', () => {
  const title = load('../components/hub/TitleScreen.tsx');
  const titleCode = code(title);

  test('the notice is rendered from the flag, is dismissible, and is never a dialog', () => {
    expect(titleCode).toContain('saveQuarantineNotice && !quarantineNoticeDismissed');
    expect(titleCode).toContain('data-title-notice="save-quarantined"');
    expect(titleCode).toContain('data-title-notice-action="dismiss"');
    expect(titleCode).toContain('role="alert"');
    expect(titleCode).toContain('setQuarantineNoticeDismissed(true)');
    // A notice, not a gate: it reads and writes no save at all.
    expect(titleCode).not.toContain('localStorage');
  });

  test('it says what a player can act on, without jargon', () => {
    expect(title).toContain('A saved gladiator couldn&rsquo;t be read');
    expect(title).toContain('Nothing has been deleted');
    expect(title).toContain('asks before it replaces anything');
  });
});
