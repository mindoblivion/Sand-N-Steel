/**
 * L21M — the development-only visitor-herald diagnostic.
 *
 * Run with: `bun test src/utils/l21mHeraldHarness.test.ts`
 *
 * WHY THIS SUITE EXISTS. L21B (the herald calls the day's visitors) and L21D (a
 * dismissal removes only what the toast displayed) are pinned by pure suites, but
 * the cry had never been read off a screen: it only exists while the 3D city hub
 * is mounted on a day the schedule resolves, and this sandbox renders that hub at
 * a few frames per second. L21M adds a disposable diagnostic route and this suite
 * pins the properties that make it trustworthy:
 *
 *   §A  ROUTE — the harness is behind the repo's existing `import.meta.env.DEV` +
 *       exact-token gate, is mounted INSTEAD OF `<App />`, and nothing shipping
 *       imports it.
 *   §B  THE CRY IS REAL — the day-5 fixture resolves to the bladesmith through
 *       `resolveVisitorSchedule`, and the first cry is exactly what
 *       `createVisitorHeraldLedger().announce` answers for that profile.
 *   §C  THE SECOND CRY IS REAL — it is a SECOND ledger's answer for a later day the
 *       schedule resolves, and appending it while the first is displayed keeps both.
 *   §D  THE QUEUE RULE — dismissing the older displayed snapshot preserves the newer
 *       cry (through the production `removeDisplayedCries`, which the harness's
 *       dismiss handler calls), and the newer cry is what the real toast renders next.
 *   §E  STORAGE ISOLATION — every read, write and removal touches the harness's own
 *       key; the real save key is never named and its value never changes.
 *   §F  THE TOAST'S PROPS — the harness hands the shipping `HeraldToast` its own
 *       dismissal callback and its own timer override. The wiring itself is pinned at
 *       SOURCE level (there is no DOM renderer here to click the toast), while the
 *       behaviour that callback performs is driven through the harness helper.
 *
 * `removeDisplayedCries` itself is pinned by `heraldQueue.test.ts`; the state
 * transitions here are only run through the harness's own helpers, with the ledger
 * and the resolver being the production ones. As in `l16dVisitorHarness.test.ts`
 * this environment has no DOM renderer and no `@testing-library/react`, so this
 * suite does NOT verify button clicks or timer behaviour — it pins the route and
 * the queue transitions a click performs, and says so.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  HARNESS_CITY_DAY,
  HARNESS_VISITOR_ID,
  HERALD_HARNESS_KEY,
  appendEmittedCries,
  appendSecondCry,
  clearHarnessRecord,
  createHeraldHarnessRun,
  dismissDisplayed,
  loadHarnessRecord,
  resetHeraldHarnessRun,
  resolveSecondCry,
  saveHarnessRecord,
  seedHeraldHarnessProfile,
} from '../components/dev/HeraldHarness';
import { HeraldToast } from '../components/hub/HeraldToast';
import { createVisitorHeraldLedger, visitorHeraldCry } from './visitorHerald';
import { resolveVisitorSchedule } from './visitorSchedule';
import { removeDisplayedCries } from './heraldQueue';
import { PROFILE_STORAGE_KEY } from '../services/storage';

// ── Sources ────────────────────────────────────────────────────────────────
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
/** Comments are stripped so prose cannot satisfy or defeat a source pin. */
const code = (rel: string): string =>
  load(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MAIN = code('../main.tsx');
const HARNESS = code('../components/dev/HeraldHarness.tsx');

/**
 * One top-level `const NAME = …` statement of the harness source, sliced up to the
 * next top-level declaration. The source is comment-stripped, so prose can never
 * satisfy a pin.
 */
const harnessStatement = (name: string): string => {
  const start = HARNESS.indexOf(`const ${name} =`);
  expect(start).toBeGreaterThan(-1);
  const rest = HARNESS.slice(start + 1);
  const next = rest.search(/\n {2}const [A-Za-z]/);
  return next === -1 ? rest : rest.slice(0, next);
};

// ── The production answers every assertion below is built from ─────────────
const scheduleOfDay = (day: number) => resolveVisitorSchedule({ city: { day } });

/** Emit the first cry exactly as the harness's mount effect does. */
const emitFirstCry = () => {
  const profile = seedHeraldHarnessProfile();
  const cries = createVisitorHeraldLedger().announce(profile);
  return { profile, cries, run: appendEmittedCries(createHeraldHarnessRun(), cries) };
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
describe('L21M §A — the route is dev-only, and it mounts instead of App', () => {
  test('the gate is the repo convention: DEV first, then the exact token or the scratch flag', () => {
    const gate = MAIN.slice(MAIN.indexOf('const useHeraldHarness ='));
    const body = gate.slice(0, gate.indexOf(';') + 1);
    expect(body).toContain('import.meta.env.DEV &&');
    expect(body).toContain("get('devHarness') === 'herald'");
    expect(body).toContain("readDevHarnessFlag() === 'herald'");
    expect(body).not.toContain("startsWith('herald')");
    expect(body).not.toContain("'herald '");
  });

  test('main mounts it dynamically inside the DEV gate, as its own branch, not the app', () => {
    expect(MAIN).toContain("import('./components/dev/HeraldHarness')");
    // Exactly one dynamic import site, and no static import of the component.
    expect(MAIN.split("import('./components/dev/HeraldHarness')").length).toBe(2);
    expect(/^import\s[^\n]*components\/dev/m.test(MAIN)).toBe(false);

    const branch = MAIN.indexOf('} else if (useHeraldHarness) {');
    expect(branch).toBeGreaterThan(-1);
    // It must sit before the app fallback, so `<App />` is never mounted alongside it.
    expect(MAIN.indexOf('} else {')).toBeGreaterThan(branch);
    // …and the sibling harnesses are still there: this is an addition, not a replacement.
    for (const token of ['character', 'chariot', 'racing', 'horsefit', 'race', 'hud', 'visitor']) {
      expect(MAIN).toContain(`get('devHarness') === '${token}'`);
    }
  });

  test('the component self-guards, never imports App, and no shipping screen names it', () => {
    expect(HARNESS).toContain('if (!import.meta.env.DEV) return null;');
    expect(HARNESS).not.toContain("from '../../App'");
    for (const file of [
      '../App.tsx',
      '../components/hub/HeraldToast.tsx',
      '../utils/visitorHerald.ts',
      '../utils/heraldQueue.ts',
      '../utils/visitorSchedule.ts',
    ]) {
      expect(code(file)).not.toContain('HeraldHarness');
      expect(code(file)).not.toContain('HERALD_HARNESS_KEY');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L21M §B — the seeded day-5 fixture, and a first cry from the real ledger', () => {
  test('the fixture carries only the field the resolver reads', () => {
    expect(seedHeraldHarnessProfile()).toEqual({ city: { day: HARNESS_CITY_DAY } });
    expect(HARNESS_CITY_DAY).toBe(5);
  });

  test('the production schedule resolves the bladesmith on that day', () => {
    const schedule = scheduleOfDay(HARNESS_CITY_DAY);
    expect(schedule.day).toBe(HARNESS_CITY_DAY);
    expect(schedule.arrivals.map((arrival) => arrival.visitor.id)).toContain(HARNESS_VISITOR_ID);
  });

  test('the harness reports presence from the resolver rather than asserting it', () => {
    // A day the schedule answers nobody for: the same predicate says "no".
    const emptyIds = scheduleOfDay(1).arrivals.map((arrival) => arrival.visitor.id);
    expect(emptyIds).not.toContain(HARNESS_VISITOR_ID);
    expect(HARNESS).toContain('arrivals.includes(HARNESS_VISITOR_ID)');
  });

  test('the emitted cry is the real ledger’s answer, never a typed string', () => {
    const { profile, cries, run } = emitFirstCry();
    const visitor = scheduleOfDay(HARNESS_CITY_DAY).arrivals.find(
      (arrival) => arrival.visitor.id === HARNESS_VISITOR_ID
    )?.visitor;
    expect(visitor).toBeDefined();
    expect(cries).toEqual([visitorHeraldCry(visitor!)]);
    expect(run.emitted).toEqual(cries);
    expect(run.queue).toEqual(cries);
    expect(run.emitted[0]).toContain('Hanno of Cirta');
    expect(run.emitted[0]).toContain('The herald cries: ');
    // The cry is not in the harness's own source: it can only have come from the ledger.
    expect(HARNESS).not.toContain('Hanno of Cirta');
    expect(HARNESS).not.toContain('The herald cries: ');
    // One-shot, which is exactly why a second ledger instance supplies the second cry.
    expect(createVisitorHeraldLedger().announce(profile).length).toBeGreaterThan(0);
    const spent = createVisitorHeraldLedger();
    expect(spent.announce(profile)).toEqual(cries);
    expect(spent.announce(profile)).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L21M §C — a second cry, appended while the first is displayed', () => {
  test('the second cry is a real ledger’s answer for a later day the schedule resolves', () => {
    const second = resolveSecondCry(HARNESS_CITY_DAY);
    expect(second).not.toBeNull();
    expect(second!.day).toBeGreaterThan(HARNESS_CITY_DAY);
    const dayIds = scheduleOfDay(second!.day).arrivals.map((arrival) => arrival.visitor.id);
    expect(dayIds.length).toBeGreaterThan(0);
    expect(second!.cry).toBe(createVisitorHeraldLedger().announce({ city: { day: second!.day } })[0]);
  });

  test('every day between the seeded day and the second cry resolves nobody', () => {
    const second = resolveSecondCry(HARNESS_CITY_DAY)!;
    for (let day = HARNESS_CITY_DAY + 1; day < second.day; day += 1) {
      expect(createVisitorHeraldLedger().announce({ city: { day } })).toEqual([]);
    }
  });

  test('appending keeps both cries in the queue and records the stack the toast rendered', () => {
    const second = resolveSecondCry(HARNESS_CITY_DAY)!;
    const { cries, run } = emitFirstCry();
    const appended = appendSecondCry(run, second);
    expect(appended.queue).toEqual([cries[0], second.cry]);
    expect(appended.secondCry).toBe(second.cry);
    expect(appended.secondCryDay).toBe(second.day);
    // The snapshot the toast was rendering BEFORE the append — the stale dismissal's payload.
    expect(appended.priorSnapshot).toEqual([cries[0]]);
    // Distinct cries: the second is not a re-render of the first.
    expect(appended.queue[0]).not.toBe(appended.queue[1]);
    // Only one second cry can be appended.
    expect(appendSecondCry(appended, second)).toBe(appended);
    expect(appendSecondCry(run, null)).toBe(run);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L21M §D — dismissing the displayed snapshot preserves the newer cry', () => {
  const appendedRun = () => {
    const second = resolveSecondCry(HARNESS_CITY_DAY)!;
    const { cries, run } = emitFirstCry();
    return { cries, second, run: appendSecondCry(run, second) };
  };

  test('dismissing the OLDER snapshot leaves the newer cry queued', () => {
    const { cries, second, run } = appendedRun();
    const after = dismissDisplayed(run, run.priorSnapshot!);
    expect(after.queue).toEqual([second.cry]);
    expect(after.dismissed).toEqual([cries[0]]);
    expect(after.preservedNewer).toBe(true);
    expect(after.priorSnapshot).toBeNull();
  });

  test('the preserved cry is what the real toast renders next', () => {
    const { second, run } = appendedRun();
    const after = dismissDisplayed(run, run.priorSnapshot!);
    const html = renderToStaticMarkup(
      React.createElement(HeraldToast, { cries: after.queue, onDismiss: () => {} })
    );
    expect(html).toContain(second.cry);
    expect(html).toContain('role="status"');
  });

  test('that newer cry can then be dismissed, and the queue empties', () => {
    const { second, run } = appendedRun();
    const afterStale = dismissDisplayed(run, run.priorSnapshot!);
    const afterSecond = dismissDisplayed(afterStale, afterStale.queue);
    expect(afterSecond.queue).toEqual([]);
    expect(afterSecond.dismissed).toEqual([afterStale.dismissed[0], second.cry]);
    expect(
      renderToStaticMarkup(
        React.createElement(HeraldToast, { cries: afterSecond.queue, onDismiss: () => {} })
      )
    ).toBe('');
  });

  test('a dismissal that matches nothing changes nothing (the helper returns the same array)', () => {
    const { run } = appendedRun();
    expect(dismissDisplayed(run, [])).toBe(run);
    expect(dismissDisplayed(run, ['not a cry'])).toBe(run);
  });

  test('control — dismissing the CURRENT stack removes both, because both were displayed', () => {
    const { cries, second, run } = appendedRun();
    const cleared = dismissDisplayed(run, run.queue);
    // Every row of the live stack was displayed, so the production helper removes the
    // whole queue and both cries are recorded as dismissed — the reference case the
    // stale-snapshot path above must NOT reproduce.
    expect(cleared.queue).toEqual([]);
    expect(cleared.dismissed).toEqual([cries[0], second.cry]);
    expect(cleared.preservedNewer).toBe(false);
    expect(cleared.priorSnapshot).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L21M §E — reset touches only the harness key and its own state', () => {
  test('the key is a distinct harness-only key and the save API is never named', () => {
    expect(HERALD_HARNESS_KEY).toBe('sand_and_steel_herald_harness_v1');
    expect(HERALD_HARNESS_KEY).not.toBe(PROFILE_STORAGE_KEY);
    for (const banned of [
      'PROFILE_STORAGE_KEY',
      'saveProfile',
      'loadSavedProfile',
      'clearSavedProfile',
      'services/storage',
      'sessionStorage.clear',
      'localStorage.clear',
    ]) {
      expect(HARNESS).not.toContain(banned);
    }
  });

  test('save and load touch only the harness key, in sessionStorage first', () => {
    const session = makeStore();
    const local = makeStore();
    installWindow(session, local);

    expect(loadHarnessRecord()).toBeNull();
    saveHarnessRecord({ day: HARNESS_CITY_DAY, firstCry: 'a cry' });
    expect(loadHarnessRecord()).toEqual({ day: HARNESS_CITY_DAY, firstCry: 'a cry' });
    expect(session.writes).toEqual([HERALD_HARNESS_KEY]);
    expect(session.reads).toEqual([HERALD_HARNESS_KEY, HERALD_HARNESS_KEY]);
    // The fallback store is never used while session storage works.
    expect(local.reads).toEqual([]);
    expect(local.writes).toEqual([]);
  });

  test('a malformed record reads as none rather than throwing', () => {
    const session = makeStore({ [HERALD_HARNESS_KEY]: '{"nope":true' });
    installWindow(session, makeStore());
    expect(loadHarnessRecord()).toBeNull();
  });

  test('reset removes only the harness key, restores the initial run, and leaves the save intact', () => {
    const session = makeStore({ [PROFILE_STORAGE_KEY]: REAL_SAVE });
    const local = makeStore({ [PROFILE_STORAGE_KEY]: REAL_SAVE });
    installWindow(session, local);

    saveHarnessRecord({ day: HARNESS_CITY_DAY, firstCry: 'dirty' });
    clearHarnessRecord();
    const fresh = resetHeraldHarnessRun();

    expect(session.removes).toEqual([HERALD_HARNESS_KEY]);
    expect([...session.reads, ...session.writes, ...session.removes]).not.toContain(
      PROFILE_STORAGE_KEY
    );
    expect(session.data.get(PROFILE_STORAGE_KEY)).toBe(REAL_SAVE);
    expect(local.data.get(PROFILE_STORAGE_KEY)).toBe(REAL_SAVE);

    expect(fresh).toEqual({
      emitted: [],
      secondCry: null,
      secondCryDay: null,
      priorSnapshot: null,
      queue: [],
      dismissed: [],
      preservedNewer: false,
      reseeded: true,
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L21M §F — the harness hands the shipping toast its own dismissal and timer', () => {
  /**
   * These are SOURCE pins, and they say so: this environment has no DOM renderer, so
   * nothing here clicks the toast. What they guarantee is that the component's props
   * are the harness's own callback — routed through the helper §D drives behaviourally
   * — and not a wholesale clear, and that the timer is the diagnostic override.
   */
  test('the toast is given the live queue and the harness’s own dismissal callback', () => {
    expect(HARNESS).toContain('onDismiss={handleDismiss}');
    expect(HARNESS).toContain('cries={run.queue}');

    const dismissHandler = harnessStatement('handleDismiss');
    // It routes through the harness helper — the one §D drives, which calls the
    // production `removeDisplayedCries` — rather than clearing the queue itself.
    expect(dismissHandler).toContain('dismissDisplayed(previousRun, displayed)');
    // Not the pre-L21D whole-queue clear, and not a whole-run reset.
    expect(dismissHandler).not.toContain('createHeraldHarnessRun');
    expect(dismissHandler).not.toContain('resetHeraldHarnessRun');
    expect(dismissHandler).not.toContain('removeDisplayedCries');
    // Stable identity: it is the toast timer's dependency, exactly as in App.tsx.
    expect(dismissHandler).toContain('}, []);');
  });

  test('that callback removes exactly what was displayed — the production helper’s answer', () => {
    const second = resolveSecondCry(HARNESS_CITY_DAY)!;
    const { cries, run } = emitFirstCry();
    const appended = appendSecondCry(run, second);
    // The helper the handler calls answers identically to the production rule, in both
    // the stale-snapshot case and the whole-stack case.
    expect(dismissDisplayed(appended, [cries[0]]).queue).toEqual(
      removeDisplayedCries(appended.queue, [cries[0]])
    );
    expect(dismissDisplayed(appended, appended.queue).queue).toEqual(
      removeDisplayedCries(appended.queue, appended.queue)
    );
    // …and it is a prefix rule, not a length rule: a non-prefix snapshot changes nothing.
    expect(removeDisplayedCries(appended.queue, [second.cry])).toBe(appended.queue);
  });

  test('the diagnostic timer is the harness’s own override, and the 7 s default is untouched', () => {
    expect(HARNESS).toContain('durationMs={DIAGNOSTIC_TOAST_MS}');
    expect(HARNESS).toContain('const DIAGNOSTIC_TOAST_MS = 60_000;');
    // The harness never falls back to the production default by accident…
    expect(HARNESS).not.toContain('7000');
    expect(HARNESS).not.toContain('durationMs = ');
    // …and the shipping default itself is exactly what it was.
    expect(code('../components/hub/HeraldToast.tsx')).toContain('durationMs = 7000');
  });

  test('reset clears only the harness record and reseeds — it never clears storage', () => {
    const resetHandler = harnessStatement('handleReset');
    expect(resetHandler).toContain('clearHarnessRecord()');
    expect(resetHandler).toContain('resetHeraldHarnessRun()');
    expect(resetHandler).toContain('createVisitorHeraldLedger()');
    for (const banned of [
      '.clear(',
      'clearSavedProfile',
      'saveProfile',
      'loadSavedProfile',
      'PROFILE_STORAGE_KEY',
      'localStorage',
      'sessionStorage',
    ]) {
      expect(resetHandler).not.toContain(banned);
    }

    // The state transition the handler performs, driven for real: a fresh ledger
    // re-emits the same first cry, so reset restores the initial run.
    const { profile, cries } = emitFirstCry();
    const afterReset = appendEmittedCries(
      resetHeraldHarnessRun(),
      createVisitorHeraldLedger().announce(profile)
    );
    expect(afterReset.queue).toEqual(cries);
    expect(afterReset.emitted).toEqual(cries);
    expect(afterReset.reseeded).toBe(true);
    expect(afterReset.dismissed).toEqual([]);
    expect(afterReset.preservedNewer).toBe(false);
  });
});
