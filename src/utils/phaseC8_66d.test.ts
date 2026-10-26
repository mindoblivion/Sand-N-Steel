/**
 * Phase C-8.66D — dev-harness safety and workshop acceptance prep.
 *
 * Run with: `bun test src/utils/phaseC8_66d.test.ts`
 *
 * ── WHY THIS SUITE EXISTS ─────────────────────────────────────────────────
 * C-8.66C shipped the disposable-profile transaction harness for the Chariot
 * Workshop.  A component called "dev" proves nothing by its name, so this suite
 * pins the three properties that make the name true, and it drives real code for
 * each of them instead of reading prose:
 *
 *   §A  **Production gating.**  `src/main.tsx` gates both harnesses on
 *       `import.meta.env.DEV && …`.  The tests below lift the two gate
 *       EXPRESSIONS out of the shipped source, substitute
 *       `import.meta.env.DEV` the way a production build does (`false`) and
 *       evaluate them (`Function(...)`, the technique `phaseFortressRotation`
 *       already uses for source expressions) across every query string and
 *       scratch-flag value that could select a harness.  With `DEV` false
 *       neither gate can be true, so supplying `?devHarness=chariot` in
 *       production cannot mount it.  The structural checks then prove both
 *       harness imports live only inside those gated branches and nowhere else,
 *       which is what lets Rollup drop them and their chunks entirely.
 *   §B  **Storage isolation.**  The harness's own save/load helpers run for real
 *       against recording fake stores: the disposable profile goes to its own
 *       key in per-tab scratch storage, and the player's save key is neither
 *       read nor written — not on a seed, not on a purchase, not on a reload.
 *   §C  **The URL purse is bounded.**  `?gold=` is untrusted input to a currency
 *       field; it is accepted only as plain decimal digits and clamped, so it can
 *       never seed a negative, fractional or overflowed balance.
 *
 * The transaction rules themselves (one deduction, no duplicates, refusals) are
 * pinned by `phaseC8_66b.test.ts`, and the harness's source-level guardrails by
 * `phaseC8_66c.test.ts`; neither is restated here.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { afterAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import * as harnessModule from '../components/dev/ChariotWorkshopHarness';
import {
  DEFAULT_HARNESS_GOLD,
  HARNESS_PROFILE_KEY,
  MAX_HARNESS_GOLD,
  loadHarnessProfile,
  readSeedGold,
  saveHarnessProfile,
} from '../components/dev/ChariotWorkshopHarness';
import { CHARIOT_PARTS, chariotPartsBySlot } from '../data/chariotParts';
import { purchaseChariotPart } from './chariotLoadout';
import { CHARIOT_WHEEL_VARIANTS } from './chariotGeometry';
import { HUB_LOCATIONS, getNearbyHubLocation } from './cityCollisions';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';

// ── Sources ────────────────────────────────────────────────────────────────
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const mainSrc = code('../main.tsx');
const appSrc = code('../App.tsx');
const gearTabSrc = code('../components/hub/GearTab.tsx');
const citySceneSrc = code('../components/3d/city/CityHubScene.tsx');

/** The player's own save key — the one the harness must never touch. */
const REAL_PROFILE_KEY = 'sand_and_steel_gladiator_save_v2';

// ── §A machinery: the shipped gates, evaluated as a build would ────────────
/** The right-hand side of one harness gate, exactly as it is written in main.tsx. */
const gateExpression = (name: string): string => {
  const match = new RegExp(`const ${name} =([\\s\\S]*?);\\n`).exec(mainSrc);
  if (!match) throw new Error(`main.tsx no longer declares ${name}`);
  return match[1].trim();
};

const CHARIOT_GATE = gateExpression('useChariotHarness');
const CHARACTER_GATE = gateExpression('useCharacterHarness');

/**
 * Evaluate a gate with `import.meta.env.DEV` substituted the way Vite does it:
 * `false` in a production build, `true` under `bun run dev`.
 */
const evaluateGate = (
  expression: string,
  dev: boolean,
  search: string,
  flag: string | null,
  storageReads: string[] = []
): boolean => {
  const body = expression.replace(/import\.meta\.env\.DEV/g, 'DEV');
  const windowStub = { location: { search } };
  const readDevHarnessFlag = () => {
    storageReads.push('sand_and_steel_dev_harness');
    return flag;
  };
  const fn = new Function(
    'DEV',
    'window',
    'readDevHarnessFlag',
    `return (${body});`
  ) as (dev: boolean, window: unknown, readFlag: () => string | null) => boolean;
  return fn(dev, windowStub, readDevHarnessFlag);
};

const SEARCHES = [
  '',
  '?devHarness=chariot',
  '?devHarness=character',
  '?devHarness=chariot&gold=1000000',
  '?devharness=chariot',
  '?DEVHARNESS=chariot',
  '?devHarness=chariot%20',
  '?devHarness=Chariot',
  '?devHarness=chariotx',
  '?other=chariot',
];
const FLAGS = [null, '', 'chariot', 'character', 'Chariot', 'chariot ', ' chariot'];
/** Query strings that legitimately select the chariot harness — the token, plus params beside it. */
const CHARIOT_QUERIES = ['?devHarness=chariot', '?devHarness=chariot&gold=1000000'];
/** The one query string that selects the character harness. */
const CHARACTER_QUERY = '?devHarness=character';

// ── §B machinery: recording fake stores ────────────────────────────────────
interface FakeStore {
  data: Map<string, string>;
  reads: string[];
  writes: string[];
  removes: string[];
}

const makeStore = (seed?: Record<string, string>): FakeStore => ({
  data: new Map(Object.entries(seed ?? {})),
  reads: [],
  writes: [],
  removes: [],
});

const asStorage = (store: FakeStore): Storage =>
  ({
    get length() {
      return store.data.size;
    },
    clear: () => {
      store.data.clear();
    },
    getItem: (key: string) => {
      store.reads.push(key);
      return store.data.has(key) ? (store.data.get(key) as string) : null;
    },
    key: (index: number) => [...store.data.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.removes.push(key);
      store.data.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.writes.push(key);
      store.data.set(key, String(value));
    },
  }) as Storage;

const REAL_WINDOW = (globalThis as unknown as { window?: unknown }).window;

/**
 * Install a fake `window` for one check.  `null` means "this store's property
 * access throws", which is how a browser with blocked storage behaves.
 */
const installWindow = (options: {
  session?: FakeStore | null;
  local?: FakeStore | null;
  search?: string;
}) => {
  const fake: Record<string, unknown> = { location: { search: options.search ?? '' } };
  for (const [prop, store] of [
    ['sessionStorage', options.session],
    ['localStorage', options.local],
  ] as const) {
    if (store === null) {
      Object.defineProperty(fake, prop, {
        get() {
          throw new Error(`${prop} is blocked`);
        },
      });
    } else if (store) {
      fake[prop] = asStorage(store);
    }
  }
  (globalThis as unknown as { window: unknown }).window = fake;
};

afterAll(() => {
  if (REAL_WINDOW === undefined) delete (globalThis as unknown as { window?: unknown }).window;
  else (globalThis as unknown as { window: unknown }).window = REAL_WINDOW;
});

const seedProfile = (gold: number): PlayerProfile => ({
  ...createNewProfile('Workshop Harness'),
  gold,
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66D §A — neither harness can mount in a production build', () => {
  test('the gates are the shipped text, and DEV is their first conjunct', () => {
    // Both expressions still begin with the DEV conjunction, which is what makes
    // the whole branch statically false once the build substitutes `false`.
    expect(CHARIOT_GATE.startsWith('import.meta.env.DEV &&')).toBe(true);
    expect(CHARACTER_GATE.startsWith('import.meta.env.DEV &&')).toBe(true);
    // …and the substitution really does remove the flag from the evaluated body.
    expect(CHARIOT_GATE.replace(/import\.meta\.env\.DEV/g, 'DEV')).not.toContain(
      'import.meta.env.DEV'
    );
  });

  test('with DEV false no query string and no scratch flag can open either harness', () => {
    for (const search of SEARCHES) {
      for (const flag of FLAGS) {
        expect(evaluateGate(CHARIOT_GATE, false, search, flag)).toBe(false);
        expect(evaluateGate(CHARACTER_GATE, false, search, flag)).toBe(false);
      }
    }
    // …and the flag is not even consulted: `false && (…)` never evaluates its
    // right-hand side, so a production load cannot read the harness flag at all.
    const reads: string[] = [];
    expect(evaluateGate(CHARIOT_GATE, false, '?devHarness=chariot', 'chariot', reads)).toBe(false);
    expect(reads).toEqual([]);
  });

  test('with DEV true the chariot harness needs the exact token, and nothing else', () => {
    for (const search of CHARIOT_QUERIES) {
      expect(evaluateGate(CHARIOT_GATE, true, search, null)).toBe(true);
    }
    expect(evaluateGate(CHARIOT_GATE, true, '', 'chariot')).toBe(true);
    for (const search of SEARCHES.filter((s) => !CHARIOT_QUERIES.includes(s))) {
      expect(evaluateGate(CHARIOT_GATE, true, search, null)).toBe(false);
    }
    for (const flag of FLAGS.filter((f) => f !== 'chariot')) {
      expect(evaluateGate(CHARIOT_GATE, true, '', flag)).toBe(false);
    }
    // The character harness has no scratch-flag route at all: its own gate never
    // reads one, so a stray flag cannot open it.
    expect(CHARACTER_GATE).not.toContain('readDevHarnessFlag');
  });

  test('the chain runs at most one branch, and the chariot one only on its own token', () => {
    // main.tsx's real shape: `if (character) … else if (chariot) … else <App />`.
    // This models that chain, so the two gates overlapping (a character query
    // plus a chariot scratch flag) is resolved the way the entry point resolves
    // it rather than asserted away.
    const chain = (search: string, flag: string | null) => {
      const character = evaluateGate(CHARACTER_GATE, true, search, flag);
      const chariot = !character && evaluateGate(CHARIOT_GATE, true, search, flag);
      return { character, chariot, app: !character && !chariot };
    };

    for (const search of SEARCHES) {
      for (const flag of FLAGS) {
        const mounted = chain(search, flag);
        // Exactly one of the three branches runs, never two.
        expect([mounted.character, mounted.chariot, mounted.app].filter(Boolean)).toHaveLength(1);
        // Neither harness can be reached by an accident of spelling.
        if (mounted.character) expect(search).toBe(CHARACTER_QUERY);
        if (mounted.chariot) {
          expect(CHARIOT_QUERIES.includes(search) || flag === 'chariot').toBe(true);
        }
      }
    }
  });

  test('each harness import lives only inside its own DEV-gated branch', () => {
    const characterIf = mainSrc.indexOf('if (useCharacterHarness) {');
    const characterImport = mainSrc.indexOf(
      "import('./components/dev/CharacterTestHarness')"
    );
    const chariotIf = mainSrc.indexOf('} else if (useChariotHarness) {');
    const chariotImport = mainSrc.indexOf(
      "import('./components/dev/ChariotWorkshopHarness')"
    );
    const appElse = mainSrc.indexOf('} else {');

    for (const marker of [characterIf, characterImport, chariotIf, chariotImport, appElse]) {
      expect(marker).toBeGreaterThan(-1);
    }
    expect(characterIf).toBeLessThan(characterImport);
    expect(characterImport).toBeLessThan(chariotIf);
    expect(chariotIf).toBeLessThan(chariotImport);
    expect(chariotImport).toBeLessThan(appElse);
    // The production path is the fallback branch, and it is still the normal app.
    expect(mainSrc.slice(appElse)).toContain('<App />');

    // One dynamic import each, and no static import anywhere in the entry point:
    // a static one would put a dev harness in the main chunk of every build.
    expect(mainSrc.split("import('./components/dev/ChariotWorkshopHarness')").length).toBe(2);
    expect(mainSrc.split("import('./components/dev/CharacterTestHarness')").length).toBe(2);
    expect(/^import\s[^\n]*components\/dev/m.test(mainSrc)).toBe(false);
  });

  test('the harness is not wired into the app’s own routing', () => {
    for (const source of [appSrc, gearTabSrc, citySceneSrc]) {
      expect(source).not.toContain('ChariotWorkshopHarness');
      expect(source).not.toContain('HARNESS_PROFILE_KEY');
    }
    // App still mounts the game from its own entry point, unchanged.
    expect(appSrc).toContain('export default App');
  });

  test('control — without the DEV conjunct a production load would mount the harness', () => {
    // The same expression with the DEV conjunct removed, i.e. what the gate would
    // look like if the harness were only "named" dev. Both routes open it in a
    // production build; the shipped gate refuses both.
    const ungated = CHARIOT_GATE.replace(/import\.meta\.env\.DEV\s*&&\s*/, '');
    expect(ungated).not.toContain('import.meta.env.DEV');
    expect(evaluateGate(ungated, false, '?devHarness=chariot', null)).toBe(true);
    expect(evaluateGate(ungated, false, '', 'chariot')).toBe(true);
    expect(evaluateGate(CHARIOT_GATE, false, '?devHarness=chariot', null)).toBe(false);
    expect(evaluateGate(CHARIOT_GATE, false, '', 'chariot')).toBe(false);
  });

  test('the harness module exports nothing that writes the player’s save', () => {
    expect(Object.keys(harnessModule).sort()).toEqual(
      [
        'ChariotWorkshopHarness',
        'DEFAULT_HARNESS_GOLD',
        'HARNESS_PROFILE_KEY',
        'MAX_HARNESS_GOLD',
        'loadHarnessProfile',
        'readSeedGold',
        'saveHarnessProfile',
      ].sort()
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66D §B — the disposable profile never reaches the player’s save', () => {
  test('a save writes its own key in scratch storage and leaves the real key alone', () => {
    const session = makeStore();
    const local = makeStore({
      [REAL_PROFILE_KEY]: JSON.stringify({ name: 'The Player', gold: 1234 }),
    });
    installWindow({ session, local });

    saveHarnessProfile(seedProfile(600));

    expect(session.writes).toEqual([HARNESS_PROFILE_KEY]);
    expect(session.reads).toEqual([]);
    expect(local.writes).toEqual([]);
    expect(local.reads).toEqual([]);
    // The player's record is byte-identical, and their key was never copied into
    // the harness's store.
    expect(local.data.get(REAL_PROFILE_KEY)).toBe(JSON.stringify({ name: 'The Player', gold: 1234 }));
    expect(session.data.has(REAL_PROFILE_KEY)).toBe(false);
  });

  test("a load reads only the harness's own key, even when the real save is present", () => {
    const session = makeStore();
    const local = makeStore({ [REAL_PROFILE_KEY]: JSON.stringify({ name: 'The Player' }) });
    installWindow({ session, local });

    // Nothing has been seeded yet, so the harness reports "no disposable record"
    // rather than falling back to the player's save.
    expect(loadHarnessProfile()).toBeNull();
    expect(session.reads).toEqual([HARNESS_PROFILE_KEY]);
    expect(local.reads).toEqual([]);
    expect(local.data.has(REAL_PROFILE_KEY)).toBe(true);
  });

  test('the keys are distinct, and the harness never names the player’s', () => {
    expect(HARNESS_PROFILE_KEY).not.toBe(REAL_PROFILE_KEY);
    expect(HARNESS_PROFILE_KEY).toContain('harness');
    const harnessSrc = code('../components/dev/ChariotWorkshopHarness.tsx');
    expect(harnessSrc).not.toContain(REAL_PROFILE_KEY);
    // …and the key this suite fakes is the one the storage layer really uses.
    expect(code('../services/storage.ts')).toContain(REAL_PROFILE_KEY);
  });

  test('the whole harness session — seed, buy, reload — never writes the real save', () => {
    const session = makeStore();
    const local = makeStore({
      [REAL_PROFILE_KEY]: JSON.stringify({ name: 'The Player', gold: 1234 }),
    });
    installWindow({ session, local, search: '?gold=600' });

    const seeded = seedProfile(readSeedGold());
    saveHarnessProfile(seeded);
    const purchase = purchaseChariotPart(seeded, 'wheels_reinforced');
    expect(purchase.ok).toBe(true);
    if (!purchase.ok) return;
    saveHarnessProfile(purchase.profile);

    expect(session.writes).toEqual([HARNESS_PROFILE_KEY, HARNESS_PROFILE_KEY]);
    expect(local.writes).toEqual([]);
    expect(session.data.has(REAL_PROFILE_KEY)).toBe(false);
    expect(local.data.get(REAL_PROFILE_KEY)).toBe(JSON.stringify({ name: 'The Player', gold: 1234 }));

    // The reload the harness performs reads its own record back.
    const reloaded = loadHarnessProfile();
    expect(reloaded?.gold).toBe(150);
    expect(reloaded?.chariot?.owned).toContain('wheels_reinforced');
    expect(local.reads).toEqual([]);
  });

  test('a blocked session store falls back to localStorage, and both blocked is survivable', () => {
    const local = makeStore();
    installWindow({ session: null, local });
    saveHarnessProfile(seedProfile(600));
    expect(local.writes).toEqual([HARNESS_PROFILE_KEY]);
    // The reload falls back to the same store, and reads only its own key.
    expect(loadHarnessProfile()?.gold).toBe(600);
    expect(local.reads).toEqual([HARNESS_PROFILE_KEY]);

    // With every store blocked the harness still runs — it just cannot persist.
    installWindow({ session: null, local: null });
    expect(() => saveHarnessProfile(seedProfile(600))).not.toThrow();
    expect(loadHarnessProfile()).toBeNull();
  });

  test('sessionStorage is preferred over localStorage, so the record is per-tab', () => {
    const session = makeStore();
    const local = makeStore();
    installWindow({ session, local });
    saveHarnessProfile(seedProfile(600));
    loadHarnessProfile();
    expect(session.writes).toEqual([HARNESS_PROFILE_KEY]);
    expect(session.reads).toEqual([HARNESS_PROFILE_KEY]);
    expect(local.writes).toEqual([]);
    expect(local.reads).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66D §C — the URL-provided purse is parsed and bounded safely', () => {
  const readAt = (search: string): number => {
    installWindow({ session: makeStore(), local: makeStore(), search });
    return readSeedGold();
  };

  const CASES: Array<[string, number]> = [
    ['', DEFAULT_HARNESS_GOLD], // no parameter at all
    ['?gold=', DEFAULT_HARNESS_GOLD], // an empty value is not a purse
    ['?gold=%20%20', DEFAULT_HARNESS_GOLD], // …nor is whitespace
    ['?gold=600', 600],
    ['?gold=0', 0], // a zero purse is legal
    ['?gold=007', 7], // leading zeros are still decimal digits
    ['?gold=%20300%20', 300], // surrounding whitespace is trimmed
    ['?gold=-5', DEFAULT_HARNESS_GOLD], // never negative
    ['?gold=-Infinity', DEFAULT_HARNESS_GOLD],
    ['?gold=1e308', DEFAULT_HARNESS_GOLD], // exponent notation is not a purse
    ['?gold=12.5', DEFAULT_HARNESS_GOLD], // …nor a fraction
    ['?gold=0x10', DEFAULT_HARNESS_GOLD], // …nor a hex literal
    ['?gold=abc', DEFAULT_HARNESS_GOLD],
    ['?gold=NaN', DEFAULT_HARNESS_GOLD],
    ['?gold=Infinity', DEFAULT_HARNESS_GOLD],
    ['?gold=9', 9],
    ['?gold=999999', 999999],
    ['?gold=1000000', MAX_HARNESS_GOLD],
    ['?gold=1000001', MAX_HARNESS_GOLD], // clamped
    [`?gold=${'9'.repeat(400)}`, MAX_HARNESS_GOLD], // overflows to Infinity, then clamps
  ];

  test('every accepted value is a whole, non-negative, bounded purse', () => {
    for (const [search, expected] of CASES) {
      const gold = readAt(search);
      expect(gold).toBe(expected);
      expect(Number.isInteger(gold)).toBe(true);
      expect(gold).toBeGreaterThanOrEqual(0);
      expect(gold).toBeLessThanOrEqual(MAX_HARNESS_GOLD);
    }
  });

  test('a huge input cannot overflow into a non-finite or precision-losing purse', () => {
    for (const raw of ['1e400', '-1e400', '9'.repeat(400), '31415926535897932384']) {
      const gold = readAt(`?gold=${raw}`);
      expect(Number.isFinite(gold)).toBe(true);
      expect(gold).toBeLessThanOrEqual(MAX_HARNESS_GOLD);
    }
  });

  test('a bounded purse still buys, and can never go negative', () => {
    const gold = readAt('?gold=1000000');
    const seeded = seedProfile(gold);
    const purchase = purchaseChariotPart(seeded, 'wheels_reinforced');
    expect(purchase.ok).toBe(true);
    if (!purchase.ok) return;
    expect(purchase.profile.gold).toBe(gold - 450);
    expect(purchase.profile.gold).toBeGreaterThanOrEqual(0);
    // The clamped ceiling is still affordable for the catalogue's dearest part.
    const dearest = Math.max(...CHARIOT_PARTS.map((part) => part.price));
    expect(MAX_HARNESS_GOLD).toBeGreaterThan(dearest);
  });

  test('control — the pre-fix parse let an absurd, fractional and zero purse through', () => {
    // The shipped-before parser (finite and non-negative, nothing more).
    const preFix = (raw: string | null): number => {
      const parsed = raw === null ? NaN : Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_HARNESS_GOLD;
    };
    expect(preFix('1e308')).toBe(1e308); // an unbounded balance
    expect(preFix('')).toBe(0); // an empty value seeded 0, not the default
    expect(preFix('12.5')).toBe(12.5); // fractional currency
    expect(preFix('0x10')).toBe(16); // a hex literal read as a purse
    // The shipped parser refuses all four, and the clamp is what bounds the
    // overflow case rather than a finite check alone.
    expect(readAt('?gold=1e308')).toBe(DEFAULT_HARNESS_GOLD);
    expect(readAt('?gold=')).toBe(DEFAULT_HARNESS_GOLD);
    expect(readAt('?gold=12.5')).toBe(DEFAULT_HARNESS_GOLD);
    expect(readAt('?gold=0x10')).toBe(DEFAULT_HARNESS_GOLD);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66D §D — the shipped workshop is unchanged', () => {
  test('the wheel slot still sells exactly the standard and reinforced sets', () => {
    const wheels = chariotPartsBySlot('wheels');
    expect(wheels.map((part) => part.id)).toEqual(['wheels_standard', 'wheels_reinforced']);
    expect(wheels.map((part) => part.price)).toEqual([0, 450]);
    expect(wheels.map((part) => part.wheelVariant)).toEqual(['standard', 'reinforced']);
    expect(wheels.map((part) => part.defaultOwned)).toEqual([true, false]);
  });

  test('no spiked or bladed wheel was added, and no part claims a performance stat', () => {
    const mentions = CHARIOT_PARTS.filter((part) =>
      /spik|blad/i.test(`${part.id} ${part.name} ${part.description}`)
    );
    expect(mentions).toEqual([]);
    // Nothing in the catalogue is presented as a racing number.
    expect(/speed|handling|acceleration|lap time/i.test(JSON.stringify(CHARIOT_PARTS))).toBe(false);
  });

  test('the finishes are the shipped ones at their shipped prices', () => {
    // L16B appended one finish at the end of the catalogue: the visitor-acquired
    // `finish_ventive` (900, never sold here). Every earlier entry is unmoved.
    expect(chariotPartsBySlot('finish').map((part) => [part.id, part.price])).toEqual([
      ['finish_stock', 0],
      ['finish_charred', 180],
      ['finish_gilded', 320],
      ['finish_oxblood', 240],
      ['finish_ventive', 900],
    ]);
  });

  test('the two wheel variants keep the audited kit specs', () => {
    // The measured fit itself (mounted hub, bottom, clearances) is pinned by
    // phaseC8_66c.test.ts against the shipping GLBs; these are the specs it is
    // measured from, and this phase changed neither.
    expect(Object.keys(CHARIOT_WHEEL_VARIANTS).sort()).toEqual(['reinforced', 'standard']);
    expect(CHARIOT_WHEEL_VARIANTS.standard).toEqual({
      node: 'Wheel_Standard',
      kitHubX: -3.75,
      radius: 0.685,
      kitBottomY: 0.065,
    });
    expect(CHARIOT_WHEEL_VARIANTS.reinforced).toEqual({
      node: 'Wheel_Reinforced',
      kitHubX: -1.25,
      radius: 0.7025,
      kitBottomY: 0.0475,
    });
  });

  test('the Imperial Stable still opens the workshop through the existing gear tab', () => {
    const stable = HUB_LOCATIONS.find((location) => location.id === 'stable');
    expect(stable?.tabKey).toBe('gear');
    expect(stable?.subTab).toBe('chariot');
    expect(getNearbyHubLocation([26, 0, 10])?.id).toBe('stable');
    // The five global tabs and the Armory's two subviews are untouched by this phase.
    expect(gearTabSrc).toContain("gearView === 'chariot'");
    expect(gearTabSrc).toContain('<ChariotWorkshopTab');
  });
});
