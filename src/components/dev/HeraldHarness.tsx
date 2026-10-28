/**
 * L21M — DEVELOPMENT-ONLY visitor-herald diagnostic.
 *
 * WHY IT EXISTS. L21B (the herald calls the day's visitors) and L21D (a dismissal
 * removes only what the toast displayed) are pinned by pure suites, but neither
 * had ever been read off a screen: the cry only exists while the city hub is
 * mounted on a day the schedule resolves, and this sandbox renders that hub at a
 * few frames per second — reaching an arrival day by playing would mean
 * fabricating a save, which risks the player's progress.
 *
 * WHAT IT IS. One disposable screen, reachable ONLY through `?devHarness=herald`
 * (or the scratch flag `sand_and_steel_dev_harness = 'herald'`) inside a Vite dev
 * build, mounted INSTEAD OF `<App />`. Everything it shows is production:
 *
 *   1. the profile is a MINIMAL FIXTURE held in component state — `{ city: { day:
 *      5 } }`, exactly the shape `resolveVisitorSchedule` reads. This module does
 *      not import `services/storage` at all, so `loadSavedProfile`, `saveProfile`
 *      and `PROFILE_STORAGE_KEY` are not merely unused: they are unreachable;
 *   2. the arrivals come from `resolveVisitorSchedule(profile)` — the one resolver.
 *      The harness REPORTS whether that answer contains the bladesmith rather than
 *      assuming he is in town;
 *   3. the first cry comes from `createVisitorHeraldLedger().announce(profile)` —
 *      the one ledger — never from a typed string;
 *   4. the toast is the shipping `HeraldToast`, handed the live queue and an
 *      `onDismiss` that is the production `removeDisplayedCries` helper;
 *   5. the second cry is a SECOND real ledger's answer for the next day the
 *      schedule resolves anyone (day 8 today — walked, never hard-coded). The L21B
 *      ledger is one-shot per `(day, visitor)`, which is exactly why a second
 *      instance, not a hand-written string, supplies the second queue item;
 *   6. "Dismiss previous snapshot" replays the L21D case precisely: it hands the
 *      snapshot the toast rendered BEFORE the second cry was appended to the same
 *      production dismissal path, so the newer cry stays queued and is then what
 *      the toast shows.
 *
 * PERSISTENCE. The only storage this file touches is `HERALD_HARNESS_KEY`, a
 * scratch record of the last cry this tab emitted. Reset removes that key and
 * re-seeds the in-memory run. No game-save key is read, written or cleared, and no
 * browser storage is wiped.
 *
 * Removal: delete this file, revert the `?devHarness=herald` gate and branch in
 * `src/main.tsx`, and delete `src/utils/l21mHeraldHarness.test.ts`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HeraldToast } from '../hub/HeraldToast';
import { removeDisplayedCries } from '../../utils/heraldQueue';
import { createVisitorHeraldLedger, type VisitorHeraldLedger } from '../../utils/visitorHerald';
import { resolveVisitorSchedule } from '../../utils/visitorSchedule';

/** The harness's own scratch key. Never a game-save key. */
export const HERALD_HARNESS_KEY = 'sand_and_steel_herald_harness_v1';

/** The visitor whose arrival this diagnostic reads — reported, not assumed. */
export const HARNESS_VISITOR_ID = 'numidian_bladesmith';

/** The seeded city day. Day 5 is the bladesmith's first arrival in the rotation. */
export const HARNESS_CITY_DAY = 5;

/** How far ahead the second cry is looked for. */
const MAX_DAY_SCAN = 365;

/**
 * The seeded fixture: a profile carrying only the one field the schedule reads.
 * Typed off the resolver itself, so it cannot drift from the accepted shape.
 */
export type HarnessProfile = NonNullable<Parameters<typeof resolveVisitorSchedule>[0]>;

export const seedHeraldHarnessProfile = (day: number = HARNESS_CITY_DAY): HarnessProfile => ({
  city: { day },
});

// ── The harness's own scratch record ───────────────────────────────────────
export interface HeraldHarnessRecord {
  /** The city day the record was written for. */
  day: number;
  /** The first cry the real ledger emitted, so the panel can report the last run. */
  firstCry: string | null;
}

/**
 * `sessionStorage` first (per-tab, never part of a saved browser profile), with
 * `localStorage` only as a fallback where session storage is unavailable.
 */
const scratchStorage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
};

/** Touches only `HERALD_HARNESS_KEY`. */
export const loadHarnessRecord = (): HeraldHarnessRecord | null => {
  try {
    const raw = scratchStorage()?.getItem(HERALD_HARNESS_KEY) ?? null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HeraldHarnessRecord> | null;
    if (!parsed || typeof parsed.day !== 'number') return null;
    return {
      day: parsed.day,
      firstCry: typeof parsed.firstCry === 'string' ? parsed.firstCry : null,
    };
  } catch {
    return null;
  }
};

/** Touches only `HERALD_HARNESS_KEY`. */
export const saveHarnessRecord = (record: HeraldHarnessRecord): void => {
  try {
    scratchStorage()?.setItem(HERALD_HARNESS_KEY, JSON.stringify(record));
  } catch {
    // A harness that cannot persist still runs — the screen just reports no record.
  }
};

/** Removes ONLY the harness's own record. The player's save key is never named. */
export const clearHarnessRecord = (): void => {
  try {
    scratchStorage()?.removeItem(HERALD_HARNESS_KEY);
  } catch {
    // Nothing to clear.
  }
};

// ── The second cry, resolved from the real schedule ────────────────────────
export interface HarnessSecondCry {
  /** The later city day the schedule answered for. */
  day: number;
  /** The cry a SECOND ledger emitted for that day. */
  cry: string;
}

/**
 * The first later day on which the schedule resolves anyone, and the cry a fresh
 * ledger says for it. Nothing is hard-coded: if the rotation moves, the harness
 * follows it, and if it resolves nobody the harness simply has no second cry.
 */
export const resolveSecondCry = (fromDay: number = HARNESS_CITY_DAY): HarnessSecondCry | null => {
  for (let day = fromDay + 1; day <= fromDay + MAX_DAY_SCAN; day += 1) {
    const cries = createVisitorHeraldLedger().announce({ city: { day } });
    if (cries.length > 0) return { day, cry: cries[0] };
  }
  return null;
};

// ── The run: pure state, so the acceptance can be driven by tests ──────────
export interface HeraldHarnessRun {
  /** The cries the first (real) ledger answered on the seeded day. */
  emitted: string[];
  /** The second ledger's cry, once the harness appended it. */
  secondCry: string | null;
  /** The day that second cry belongs to. */
  secondCryDay: number | null;
  /** The stack the toast was rendering BEFORE the second cry was appended. */
  priorSnapshot: string[] | null;
  /** The live queue, exactly what the toast is shown. */
  queue: string[];
  /** Every cry a dismissal actually removed, in order. */
  dismissed: string[];
  /** The L21D case was exercised: an older snapshot was dismissed, the newer cry survived. */
  preservedNewer: boolean;
  /** Reset ran at least once. */
  reseeded: boolean;
}

export const createHeraldHarnessRun = (): HeraldHarnessRun => ({
  emitted: [],
  secondCry: null,
  secondCryDay: null,
  priorSnapshot: null,
  queue: [],
  dismissed: [],
  preservedNewer: false,
  reseeded: false,
});

/** Append the cries a ledger answered — the same append `App` performs. */
export const appendEmittedCries = (
  run: HeraldHarnessRun,
  cries: readonly string[]
): HeraldHarnessRun => {
  if (cries.length === 0) return run;
  return { ...run, emitted: [...run.emitted, ...cries], queue: [...run.queue, ...cries] };
};

/**
 * Append the second cry while the first is still displayed, recording the stack the
 * toast was rendering at that moment — the snapshot a stale dismissal would carry.
 */
export const appendSecondCry = (
  run: HeraldHarnessRun,
  second: HarnessSecondCry | null
): HeraldHarnessRun => {
  if (!second || run.secondCry !== null) return run;
  return {
    ...run,
    secondCry: second.cry,
    secondCryDay: second.day,
    priorSnapshot: run.queue.length > 0 ? run.queue : null,
    queue: [...run.queue, second.cry],
  };
};

/**
 * Dismiss with the snapshot a toast displayed. The production `removeDisplayedCries`
 * decides what goes; this only records what happened, so the panel can report it.
 */
export const dismissDisplayed = (
  run: HeraldHarnessRun,
  displayed: readonly string[]
): HeraldHarnessRun => {
  const queue = removeDisplayedCries(run.queue, displayed);
  // The helper returns the SAME array when nothing matched — no state to change.
  if (queue === run.queue) return run;
  const newerPreserved =
    run.secondCry !== null && !displayed.includes(run.secondCry) && queue.includes(run.secondCry);
  return {
    ...run,
    queue,
    dismissed: [...run.dismissed, ...displayed],
    preservedNewer: run.preservedNewer || newerPreserved,
    priorSnapshot:
      run.priorSnapshot && run.priorSnapshot.some((cry) => displayed.includes(cry))
        ? null
        : run.priorSnapshot,
  };
};

/** Reset: a fresh in-memory run, marked as reseeded. */
export const resetHeraldHarnessRun = (): HeraldHarnessRun => ({
  ...createHeraldHarnessRun(),
  reseeded: true,
});

/**
 * Long enough for a human to drive the two-step demo. It is the toast's own prop —
 * the dismissal path (timer or control) is the same `onDismiss(cries)` call either way.
 */
const DIAGNOSTIC_TOAST_MS = 60_000;

export const HeraldHarness: React.FC = () => {
  // Self-guard: belt-and-suspenders so a stale import can never render in prod.
  if (!import.meta.env.DEV) return null;

  const [profile] = useState<HarnessProfile>(() => seedHeraldHarnessProfile());
  const [run, setRun] = useState<HeraldHarnessRun>(createHeraldHarnessRun);
  // One ledger per mount, exactly as `App` holds one in a ref.
  const firstLedger = useRef<VisitorHeraldLedger>(createVisitorHeraldLedger());
  const [second, setSecond] = useState<HarnessSecondCry | null>(() =>
    resolveSecondCry(HARNESS_CITY_DAY)
  );
  // Read once, before this run writes anything: the tab's previous diagnostic.
  const [previous] = useState<HeraldHarnessRecord | null>(() => loadHarnessRecord());

  const schedule = resolveVisitorSchedule(profile);
  const arrivals = schedule.arrivals.map((arrival) => arrival.visitor.id);
  const hannoPresent = arrivals.includes(HARNESS_VISITOR_ID);

  // The day's arrivals, once, through the real ledger. StrictMode's second
  // invocation answers [] because the ledger spends its keys before returning.
  useEffect(() => {
    const cries = firstLedger.current.announce(profile);
    setRun((previousRun) => appendEmittedCries(previousRun, cries));
  }, [profile]);

  // The tab's own record of what this diagnostic emitted. Nothing else is stored.
  useEffect(() => {
    if (run.emitted.length === 0) return;
    saveHarnessRecord({ day: schedule.day, firstCry: run.emitted[0] });
  }, [run.emitted, schedule.day]);

  const handleDismiss = useCallback((displayed: readonly string[]) => {
    setRun((previousRun) => dismissDisplayed(previousRun, displayed));
  }, []);

  const handleAppendSecond = () => {
    setRun((previousRun) => appendSecondCry(previousRun, second));
  };

  const handleDismissPrior = () => {
    if (run.priorSnapshot) handleDismiss(run.priorSnapshot);
  };

  const handleReset = () => {
    clearHarnessRecord();
    firstLedger.current = createVisitorHeraldLedger();
    setSecond(resolveSecondCry(schedule.day));
    const fresh = resetHeraldHarnessRun();
    setRun(appendEmittedCries(fresh, firstLedger.current.announce(profile)));
  };

  const steps: { id: string; label: string; done: boolean }[] = [
    { id: 'day', label: `day resolved (${schedule.day})`, done: schedule.day === HARNESS_CITY_DAY },
    { id: 'arrival', label: `schedule returned ${HARNESS_VISITOR_ID}`, done: hannoPresent },
    { id: 'emitted', label: 'real ledger emitted the cry', done: run.emitted.length > 0 },
    { id: 'displayed', label: 'the toast rendered it', done: run.emitted.length > 0 },
    { id: 'dismissed', label: 'the toast was dismissed', done: run.dismissed.length > 0 },
    { id: 'preserved', label: 'newer cry survived a stale dismissal', done: run.preservedNewer },
    { id: 'reseed', label: 'reset restored the initial state', done: run.reseeded },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-3 sm:p-5">
      <div className="max-w-md mx-auto rounded-2xl border border-cyan-700/60 bg-cyan-950/30 p-3 font-mono text-[11px] leading-relaxed">
        <div className="text-cyan-300 font-bold uppercase tracking-wider mb-1">
          Dev diagnostic — visitor herald
        </div>
        <div className="text-amber-300/90 mb-1">
          Development diagnostic, not gameplay. The game is not mounted on this route.
        </div>
        <div>
          scratch key: <span className="text-amber-200">{HERALD_HARNESS_KEY}</span> — the real save is
          never read or written
        </div>
        <div data-testid="herald-harness-day">
          resolved city day: <span className="text-cyan-200">{schedule.day}</span>
        </div>
        <div data-testid="herald-harness-arrivals">
          scheduled visitor ids: {arrivals.join(', ') || 'none'}
        </div>
        <div data-testid="herald-harness-hanno">
          {HARNESS_VISITOR_ID} present: {hannoPresent ? 'yes' : 'no'}
        </div>
        <div data-testid="herald-harness-emitted">
          ledger emitted: {run.emitted.length > 0 ? run.emitted.join(' | ') : '—'}
        </div>
        <div data-testid="herald-harness-second">
          second cry: {second ? `day ${second.day} — ${second.cry}` : 'none resolved'}
        </div>
        <div data-testid="herald-harness-queue">
          queue: {run.queue.length > 0 ? run.queue.join(' | ') : 'empty'}
        </div>
        <div data-testid="herald-harness-dismissed">
          dismissed: {run.dismissed.length > 0 ? run.dismissed.join(' | ') : 'none'}
        </div>
        <div data-testid="herald-harness-record">
          previous run in this tab:{' '}
          {previous ? `day ${previous.day} — ${previous.firstCry ?? 'no cry'}` : 'none'}
        </div>

        <div className="mt-2" data-testid="herald-harness-steps">
          {steps.map((step) => (
            <div key={step.id} data-step={step.id} data-done={step.done ? 'true' : 'false'}>
              <span className={step.done ? 'text-emerald-400' : 'text-neutral-500'}>
                {step.done ? '✓' : '—'}
              </span>{' '}
              {step.label}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            data-testid="herald-harness-append"
            onClick={handleAppendSecond}
            disabled={!second || run.secondCry !== null}
            className="min-h-[44px] px-3 rounded-xl bg-cyan-800 hover:bg-cyan-700 disabled:opacity-40 text-cyan-50 font-bold uppercase tracking-wider cursor-pointer"
          >
            Append second cry
          </button>
          <button
            data-testid="herald-harness-dismiss-prior"
            onClick={handleDismissPrior}
            disabled={!run.priorSnapshot}
            className="min-h-[44px] px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 cursor-pointer"
          >
            Dismiss previous snapshot
          </button>
          <button
            data-testid="herald-harness-reset"
            onClick={handleReset}
            className="min-h-[44px] px-3 rounded-xl bg-amber-800 hover:bg-amber-700 text-amber-50 cursor-pointer"
          >
            Reset harness
          </button>
        </div>
        <div className="mt-2 text-neutral-400">
          “Dismiss previous snapshot” hands the stack the toast rendered <em>before</em> the second
          cry was appended to the production dismissal path — the L21D case. The toast’s own ✕
          dismisses what it currently shows.
        </div>
      </div>

      <HeraldToast cries={run.queue} onDismiss={handleDismiss} durationMs={DIAGNOSTIC_TOAST_MS} />
    </div>
  );
};
