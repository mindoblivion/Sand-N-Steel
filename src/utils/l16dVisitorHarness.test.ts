/**
 * L16D — the development-only visitor harness (rare chariot finish acceptance).
 *
 * Run with: `bun test src/utils/l16dVisitorHarness.test.ts`
 *
 * WHY THIS SUITE EXISTS.  L16C could not verify the L16B rare finish purchase in
 * the real UI: the visitor panel only opens inside the 3D city, the Numidian
 * bladesmith offers `finish_ventive` on specific city days, and reaching one by
 * editing a save risks the player's progress.  L16D adds a disposable harness and
 * this suite pins the three properties that make it trustworthy:
 *
 *   §A  PRODUCTION ISOLATION — the route exists only behind the repo's existing
 *       `import.meta.env.DEV` + exact-token gate, and no shipping screen imports
 *       the harness.
 *   §B  STORAGE ISOLATION — every read, write and removal touches the harness's
 *       own key and nothing else; `PROFILE_STORAGE_KEY` is never named.
 *   §C  NOTHING IS FAKED — the seeded day is the production schedule's own day,
 *       and the purchase callback is the production transaction.
 *
 * The visitor rules themselves (the offer rotation, the bargain price, the
 * refusals) are pinned by `visitorChariotFinish.test.ts` and the other visitor
 * suites and are deliberately not restated here.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DEFAULT_HARNESS_GOLD,
  HARNESS_PART_ID,
  HARNESS_VISITOR_ID,
  LOW_HARNESS_GOLD,
  MAX_HARNESS_GOLD,
  VISITOR_HARNESS_KEY,
  commitHarnessVisitorEncounter,
  commitHarnessVisitorPurchase,
  loadHarnessProfile,
  readRunMode,
  readSeedGold,
  readSeedMode,
  resetHarnessProfile,
  resolveFinishOfferDay,
  resolveItemOfferDay,
  saveHarnessProfile,
  seedFinishDayProfile,
  seedHarnessProfile,
  seedItemDayProfile,
} from '../components/dev/VisitorHarness';
import { PROFILE_STORAGE_KEY } from '../services/storage';
import { getChariotPart } from '../data/chariotParts';
import { getVisitor } from '../data/visitors';
import { getItemById } from '../data/itemsDB';
import { resolveChariotLoadout } from './chariotLoadout';
import { resolveVisitorSchedule } from './visitorSchedule';
import { resolveVisitorBargainPrice, resolveVisitorItemPrice } from './visitorPurchase';

// ── Sources ────────────────────────────────────────────────────────────────
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MAIN = code('../main.tsx');
const HARNESS = code('../components/dev/VisitorHarness.tsx');

/** The day's offer for the bladesmith, straight from the production resolver. */
const bladesmithOffer = (day: number) => {
  const arrivals = resolveVisitorSchedule({ city: { day } }).arrivals;
  return arrivals.find((a) => a.visitor.id === HARNESS_VISITOR_ID) ?? null;
};

// ── Fake storage, so the isolation claim is driven rather than grepped ─────
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
    clear: () => store.data.clear(),
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

const installWindow = (session: FakeStore | null, local: FakeStore | null) => {
  const fake: Record<string, unknown> = { location: { search: '' } };
  for (const [prop, store] of [
    ['sessionStorage', session],
    ['localStorage', local],
  ] as const) {
    if (store === null) {
      Object.defineProperty(fake, prop, {
        get() {
          throw new Error(`${prop} is blocked`);
        },
      });
    } else {
      fake[prop] = asStorage(store);
    }
  }
  (globalThis as unknown as { window: unknown }).window = fake;
};

afterAll(() => {
  if (REAL_WINDOW === undefined) delete (globalThis as unknown as { window?: unknown }).window;
  else (globalThis as unknown as { window: unknown }).window = REAL_WINDOW;
});

const REAL_SAVE = JSON.stringify({ name: 'Real Player', gold: 12_345, marker: 'untouched' });

// ══════════════════════════════════════════════════════════════════════════
describe('L16D §A — the route is dev-only and nothing shipping imports it', () => {
  test('the gate is the repo convention: DEV first, then the exact token or the scratch flag', () => {
    const gate = MAIN.slice(MAIN.indexOf('const useVisitorHarness ='));
    const body = gate.slice(0, gate.indexOf(';') + 1);
    expect(body).toContain('import.meta.env.DEV &&');
    expect(body).toContain("get('devHarness') === 'visitor'");
    expect(body).toContain("readDevHarnessFlag() === 'visitor'");
    // No wildcard, no prefix match, no other spelling of the token.
    expect(body).not.toContain("'visitor '");
    expect(body).not.toContain("startsWith('visitor')");
  });

  test('main mounts it dynamically inside the DEV gate, as its own branch, not the app', () => {
    expect(MAIN).toContain("import('./components/dev/VisitorHarness')");
    expect(MAIN.split("import('./components/dev/VisitorHarness')").length).toBe(2);
    expect(/^import\s[^\n]*components\/dev/m.test(MAIN)).toBe(false);
    const branch = MAIN.indexOf('} else if (useVisitorHarness) {');
    expect(branch).toBeGreaterThan(-1);
    // It must sit before the app fallback, so `<App />` is never mounted alongside it.
    expect(MAIN.indexOf('} else {')).toBeGreaterThan(branch);
    // …and every other harness gate still exists: this is an addition, not a replacement.
    for (const token of ['character', 'chariot', 'racing', 'horsefit', 'race', 'hud']) {
      expect(MAIN).toContain(`get('devHarness') === '${token}'`);
    }
  });

  test('the component self-guards, and no shipping screen or service names it', () => {
    expect(HARNESS).toContain('if (!import.meta.env.DEV) return null;');
    for (const file of [
      '../App.tsx',
      '../components/hub/VisitorPanel.tsx',
      '../components/3d/city/CityHubScene.tsx',
      '../utils/visitorPurchase.ts',
      '../utils/visitorSchedule.ts',
      '../utils/visitorEncounter.ts',
    ]) {
      expect(code(file)).not.toContain('VisitorHarness');
      expect(code(file)).not.toContain('VISITOR_HARNESS_KEY');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16D §B — the harness storage is its own key, and the real save is untouched', () => {
  test('the key is a distinct harness-only key', () => {
    expect(VISITOR_HARNESS_KEY).toBe('sand_and_steel_visitor_harness_v1');
    expect(VISITOR_HARNESS_KEY).not.toBe(PROFILE_STORAGE_KEY);
    expect(HARNESS).not.toContain('PROFILE_STORAGE_KEY');
    expect(HARNESS).not.toContain('saveProfile');
    expect(HARNESS).not.toContain('loadSavedProfile');
  });

  test('save, load and clear touch only the harness key, in sessionStorage first', () => {
    const session = makeStore();
    const local = makeStore();
    installWindow(session, local);

    expect(loadHarnessProfile()).toBeNull();
    saveHarnessProfile(seedHarnessProfile(500, 5));
    expect(loadHarnessProfile()?.gold).toBe(500);
    expect(session.writes).toEqual([VISITOR_HARNESS_KEY]);
    expect(session.reads).toEqual([VISITOR_HARNESS_KEY, VISITOR_HARNESS_KEY]);
    // The fallback store is never used while session storage works.
    expect(local.reads).toEqual([]);
    expect(local.writes).toEqual([]);
  });

  test('reset removes and re-seeds only the harness key, and never the player save', () => {
    const session = makeStore({ [PROFILE_STORAGE_KEY]: REAL_SAVE });
    const local = makeStore({ [PROFILE_STORAGE_KEY]: REAL_SAVE });
    installWindow(session, local);

    // Dirty the harness record first, so the reset has something to clear.
    saveHarnessProfile({ ...seedHarnessProfile(DEFAULT_HARNESS_GOLD, 5), gold: 1 });
    const reset = resetHarnessProfile();

    expect(session.removes).toEqual([VISITOR_HARNESS_KEY]);
    expect([...session.reads, ...session.writes, ...session.removes]).not.toContain(
      PROFILE_STORAGE_KEY
    );
    expect(session.data.get(PROFILE_STORAGE_KEY)).toBe(REAL_SAVE);
    expect(local.data.get(PROFILE_STORAGE_KEY)).toBe(REAL_SAVE);
    expect(reset.gold).toBe(DEFAULT_HARNESS_GOLD);
    expect(loadHarnessProfile()?.gold).toBe(DEFAULT_HARNESS_GOLD);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16D §C — the seed is a real visitor day, resolved by production', () => {
  test('the finish day is a day the production schedule actually offers the finish', () => {
    const day = resolveFinishOfferDay();
    const offer = bladesmithOffer(day);
    expect(offer).not.toBeNull();
    expect(offer?.offerPartId).toBe(HARNESS_PART_ID);
    expect(offer?.offerItemId).toBeNull();
    // The measured rotation: day 5 is the bladesmith's first finish day.
    expect(day).toBe(5);
  });

  test('the ordinary item day is a day the same resolver offers an item', () => {
    const day = resolveItemOfferDay();
    const offer = bladesmithOffer(day);
    expect(offer?.offerItemId).not.toBeNull();
    expect(offer?.offerPartId).toBeNull();
    expect(day).toBe(10);
  });

  test('the seeded profile affords the finish, owns no finish, and keeps a normal inventory', () => {
    const seeded = seedFinishDayProfile();
    const part = getChariotPart(HARNESS_PART_ID);
    expect(part).toBeDefined();
    const rate = getVisitor(HARNESS_VISITOR_ID)?.bargainRate;
    const price = resolveVisitorBargainPrice(part, rate);
    expect(price).toBe(630);

    expect(seeded.gold).toBe(DEFAULT_HARNESS_GOLD);
    expect(seeded.gold).toBeGreaterThan(price as number);
    expect(resolveChariotLoadout(seeded).owned).not.toContain(HARNESS_PART_ID);
    expect(seeded.city?.day).toBe(resolveFinishOfferDay());
    expect(seeded.inventory.length).toBeGreaterThan(0);
    // A low purse is below the bargain, which is what the refusal check needs.
    expect(LOW_HARNESS_GOLD).toBeLessThan(price as number);
  });

  test('the URL can seed the purse and the offer day, and only in the accepted form', () => {
    const session = makeStore();
    installWindow(session, makeStore());
    const withSearch = (search: string) => {
      (window as unknown as { location: { search: string } }).location.search = search;
    };

    withSearch('');
    expect(readSeedGold()).toBe(DEFAULT_HARNESS_GOLD);
    expect(readSeedMode()).toBe('part');
    expect(readRunMode()).toBe('off');

    withSearch('?gold=100');
    expect(readSeedGold()).toBe(100);
    withSearch('?gold=100&offer=item&run=buy');
    expect(readSeedMode()).toBe('item');
    expect(readRunMode()).toBe('buy');

    // Untrusted input is bounded, never a signed, fractional or overflowed purse.
    for (const bad of ['?gold=-5', '?gold=1.5', '?gold=1e9', '?gold=abc', '?gold=%20']) {
      withSearch(bad);
      expect(readSeedGold()).toBe(DEFAULT_HARNESS_GOLD);
    }
    withSearch(`?gold=${'9'.repeat(30)}`);
    expect(readSeedGold()).toBe(MAX_HARNESS_GOLD);
    // Only the exact token opens the auto-gesture / item day.
    withSearch('?offer=Items&run=buyy');
    expect(readSeedMode()).toBe('part');
    expect(readRunMode()).toBe('off');
    // Nothing above touched storage.
    expect([...session.reads, ...session.writes]).toEqual([]);
  });

  test('the seeded purse is bounded, so no caller can seed a nonsense balance', () => {
    expect(seedHarnessProfile(Number.NaN, 5).gold).toBe(0);
    expect(seedHarnessProfile(-1, 5).gold).toBe(0);
    expect(seedHarnessProfile(1e12, 5).gold).toBe(MAX_HARNESS_GOLD);
    expect(seedItemDayProfile().city?.day).toBe(resolveItemOfferDay());
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16D §D — the purchase callback is the production transaction', () => {
  test('buying with enough gold charges 630, grants the finish once and completes the visitor', () => {
    const session = makeStore();
    installWindow(session, makeStore());

    const seeded = seedFinishDayProfile();
    const before = seeded.inventory.map((item) => item.id);
    const result = commitHarnessVisitorPurchase(seeded, HARNESS_VISITOR_ID);

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'part') throw new Error('expected a part purchase');
    expect(result.part.id).toBe(HARNESS_PART_ID);
    expect(result.price).toBe(630);

    const after = result.profile;
    expect(after.gold).toBe(DEFAULT_HARNESS_GOLD - 630);
    expect(after.inventory.map((item) => item.id)).toEqual(before);
    const owned = resolveChariotLoadout(after).owned;
    expect(owned.filter((id) => id === HARNESS_PART_ID).length).toBe(1);
    expect(after.city?.completedVisitors).toContain(HARNESS_VISITOR_ID);
    // The visitor is gone from that day's schedule, which is what the panel renders.
    expect(
      resolveVisitorSchedule(after).arrivals.some((a) => a.visitor.id === HARNESS_VISITOR_ID)
    ).toBe(false);
    // …and the success was persisted to the harness key only.
    expect(session.writes).toEqual([VISITOR_HARNESS_KEY]);
    expect(loadHarnessProfile()?.gold).toBe(DEFAULT_HARNESS_GOLD - 630);
  });

  test('a second purchase is refused and grants nothing, so there is no double charge', () => {
    const session = makeStore();
    installWindow(session, makeStore());

    const first = commitHarnessVisitorPurchase(seedFinishDayProfile(), HARNESS_VISITOR_ID);
    if (!first.ok) throw new Error('first purchase should succeed');
    const writesAfterFirst = session.writes.length;

    const second = commitHarnessVisitorPurchase(first.profile, HARNESS_VISITOR_ID);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('second purchase should be refused');
    expect(second.reason).toBe('already-completed');
    // A refusal writes nothing at all.
    expect(session.writes.length).toBe(writesAfterFirst);
    expect(resolveChariotLoadout(first.profile).owned.filter((id) => id === HARNESS_PART_ID).length).toBe(1);
    expect(first.profile.gold).toBe(DEFAULT_HARNESS_GOLD - 630);
  });

  test('a purse below the bargain is refused with insufficient-gold and changes nothing', () => {
    const session = makeStore();
    installWindow(session, makeStore());

    const seeded = seedFinishDayProfile(LOW_HARNESS_GOLD);
    const result = commitHarnessVisitorPurchase(seeded, HARNESS_VISITOR_ID);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.reason).toBe('insufficient-gold');
    expect(session.writes).toEqual([]);
    expect(resolveChariotLoadout(seeded).owned).not.toContain(HARNESS_PART_ID);
  });

  test('the meeting callback is the production encounter, and completing is what ends the visit', () => {
    const session = makeStore();
    installWindow(session, makeStore());

    const seeded = seedFinishDayProfile();
    const met = commitHarnessVisitorEncounter(seeded, HARNESS_VISITOR_ID);
    expect(met.city?.seenVisitors).toContain(HARNESS_VISITOR_ID);
    // Being seen does not remove the visitor from the schedule; only completion does.
    expect(
      resolveVisitorSchedule(met).arrivals.some((a) => a.visitor.id === HARNESS_VISITOR_ID)
    ).toBe(true);
    expect(session.writes).toEqual([VISITOR_HARNESS_KEY]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16D §E — an ordinary visitor item still behaves as before', () => {
  test('the item day sells its own item at its own bargain price, not a part', () => {
    const session = makeStore();
    installWindow(session, makeStore());

    const seeded = seedItemDayProfile();
    const offer = bladesmithOffer(resolveItemOfferDay());
    const item = getItemById(offer?.offerItemId ?? '');
    expect(item).toBeDefined();
    const canonical = resolveVisitorItemPrice(item);
    const rate = getVisitor(HARNESS_VISITOR_ID)?.bargainRate;
    const price = resolveVisitorBargainPrice(item, rate);

    const result = commitHarnessVisitorPurchase(seeded, HARNESS_VISITOR_ID);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'item') throw new Error('expected an item purchase');
    expect(result.item.id).toBe(item?.id);
    expect(result.price).toBe(price as number);
    expect(canonical as number).toBeGreaterThanOrEqual(price as number);
    expect(result.profile.gold).toBe(DEFAULT_HARNESS_GOLD - (price as number));
    // An item visit grants no chariot part.
    expect(resolveChariotLoadout(result.profile).owned).not.toContain(HARNESS_PART_ID);
    expect(result.profile.city?.completedVisitors).toContain(HARNESS_VISITOR_ID);
  });

  test('the harness renders the shipping panel with no second UI path', () => {
    expect(HARNESS).toContain("from '../hub/VisitorPanel'");
    expect(HARNESS).toContain('<VisitorPanel');
    expect(HARNESS).toContain('onPurchase={handlePurchase}');
    expect(HARNESS).toContain('onEncounter={handleEncounter}');
    expect(HARNESS).toContain('purchaseVisitorOffer(');
    expect(HARNESS).toContain('recordVisitorEncounter(');
    // It does not re-implement the price, the schedule or the chariot grant.
    expect(HARNESS).not.toContain('bargainRate');
    expect(HARNESS).not.toContain('* 0.7');
    expect(HARNESS).not.toContain('completedVisitors:');
  });
});
