/**
 * Phase C-8.70B Stage 1, Slice 1 — the race state machine's unit suite.
 *
 * Run with: bun test src/utils/raceState.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A every LEGAL transition, one test each;
 *   §B that every ILLEGAL pair is a NO-OP — the whole 5 × 4 grid is swept, and
 *      the eight legal pairs above are the only ones that may move the machine;
 *   §C abort from every state (and that a repeat abort cannot move it twice);
 *   §D the finish API — `racing` only, and nothing in the shipped source calls
 *      it yet;
 *   §E the derived presentation: the countdown's steps, `COUNTDOWN_MS`, the
 *      green light's beat inside `racing`, and the mm:ss.t race clock;
 *   §F the module's purity — it imports nothing at all, so no path through the
 *      machine can read or write a save.
 *
 * The suite states the eight legal pairs itself and derives everything else: a
 * transition that quietly joins the table, or one that is dropped, fails here
 * rather than passing because the suite read the table back.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  COUNTDOWN_MS,
  COUNTDOWN_STEPS,
  COUNTDOWN_STEP_MS,
  GO_DISPLAY_MS,
  GO_LABEL,
  RACE_INITIAL_STATE,
  RACE_STATES,
  abortRace,
  finishRace,
  formatRaceElapsed,
  getCountdownStep,
  isRaceRunning,
  markCountdownElapsed,
  raceTransition,
  startRace,
} from './raceState';
import type { RaceEvent, RaceState } from './raceState';

const moduleSource = readFileSync(new URL('./raceState.ts', import.meta.url), 'utf8');
const suiteSource = readFileSync(new URL('./raceState.test.ts', import.meta.url), 'utf8');
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** The module with its comments stripped, so no assertion can be defeated by prose. */
const moduleCode = moduleSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

const EVENTS: readonly RaceEvent[] = ['start', 'countdown-elapsed', 'finish', 'abort'];

/**
 * The machine's whole contract, written out.  Anything not listed here must be a
 * no-op (see §B); anything listed here must move the machine (see §A).
 */
const LEGAL: ReadonlyArray<readonly [RaceState, RaceEvent, RaceState]> = [
  ['idle', 'start', 'countdown'],
  ['countdown', 'countdown-elapsed', 'racing'],
  ['racing', 'finish', 'finished'],
  ['idle', 'abort', 'aborted'],
  ['countdown', 'abort', 'aborted'],
  ['racing', 'abort', 'aborted'],
  ['finished', 'abort', 'aborted'],
  ['aborted', 'abort', 'aborted'],
];

const expectedFor = (state: RaceState, event: RaceEvent): RaceState =>
  LEGAL.find(([from, on]) => from === state && on === event)?.[2] ?? state;

// ══════════════════════════════════════════════════════════════════════════
// A. Every legal transition
// ══════════════════════════════════════════════════════════════════════════

describe('A. The legal transitions', () => {
  test('a fresh race is idle', () => {
    expect(RACE_INITIAL_STATE).toBe('idle');
    expect(RACE_STATES[0]).toBe('idle');
    expect(RACE_STATES).toEqual(['idle', 'countdown', 'racing', 'finished', 'aborted']);
  });

  test('idle → countdown on start', () => {
    expect(raceTransition('idle', 'start')).toBe('countdown');
    expect(startRace('idle')).toBe('countdown');
  });

  test('countdown → racing when the countdown elapses', () => {
    expect(raceTransition('countdown', 'countdown-elapsed')).toBe('racing');
    expect(markCountdownElapsed('countdown')).toBe('racing');
  });

  test('racing → finished through the finish API', () => {
    expect(raceTransition('racing', 'finish')).toBe('finished');
    expect(finishRace('racing')).toBe('finished');
  });

  test('abort reaches aborted from every state', () => {
    for (const state of RACE_STATES) {
      expect(abortRace(state), state).toBe('aborted');
    }
  });

  test('the whole lifecycle runs idle → countdown → racing → finished', () => {
    let state: RaceState = RACE_INITIAL_STATE;
    state = startRace(state);
    expect(state).toBe('countdown');
    state = markCountdownElapsed(state);
    expect(state).toBe('racing');
    state = finishRace(state);
    expect(state).toBe('finished');
    // …and a finished race can still be torn down.
    expect(abortRace(state)).toBe('aborted');
  });

  test('the named helpers are the table, not a second copy of it', () => {
    for (const state of RACE_STATES) {
      expect(startRace(state)).toBe(raceTransition(state, 'start'));
      expect(markCountdownElapsed(state)).toBe(raceTransition(state, 'countdown-elapsed'));
      expect(finishRace(state)).toBe(raceTransition(state, 'finish'));
      expect(abortRace(state)).toBe(raceTransition(state, 'abort'));
    }
  });

  test('every legal pair is legal — and each is exactly one row', () => {
    expect(LEGAL).toHaveLength(8);
    for (const [from, on, to] of LEGAL) {
      expect(raceTransition(from, on), `${from} + ${on}`).toBe(to);
    }
    // no duplicate (state, event) pair, so the list above is unambiguous
    const pairs = LEGAL.map(([from, on]) => `${from}|${on}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. Illegal transitions are no-ops
// ══════════════════════════════════════════════════════════════════════════

describe('B. Illegal transitions are no-ops', () => {
  test('the whole 5 × 4 grid matches the contract', () => {
    for (const state of RACE_STATES) {
      for (const event of EVENTS) {
        expect(raceTransition(state, event), `${state} + ${event}`).toBe(expectedFor(state, event));
      }
    }
    // the grid really is 20 pairs, and exactly the legal rows that are not the
    // identity move the machine (aborted + abort is legal and stays put)
    expect(RACE_STATES.length * EVENTS.length).toBe(20);
    const moving = RACE_STATES.flatMap((state) =>
      EVENTS.filter((event) => raceTransition(state, event) !== state).map((event) => `${state}|${event}`)
    ).sort();
    const legalMoves = LEGAL.filter(([from, , to]) => from !== to)
      .map(([from, on]) => `${from}|${on}`)
      .sort();
    expect(moving).toEqual(legalMoves);
    expect(moving).toHaveLength(7);
  });

  test('start is refused anywhere but idle', () => {
    for (const state of ['countdown', 'racing', 'finished', 'aborted'] as RaceState[]) {
      expect(startRace(state), state).toBe(state);
    }
  });

  test('the countdown can only elapse from countdown', () => {
    for (const state of ['idle', 'racing', 'finished', 'aborted'] as RaceState[]) {
      expect(markCountdownElapsed(state), state).toBe(state);
    }
  });

  test('a race can only be finished while it is racing', () => {
    for (const state of ['idle', 'countdown', 'finished', 'aborted'] as RaceState[]) {
      expect(finishRace(state), state).toBe(state);
    }
  });

  test('a stray second start cannot restart a running countdown', () => {
    expect(startRace(startRace('idle'))).toBe('countdown');
  });

  test('a finish arriving before the countdown ended changes nothing', () => {
    expect(finishRace('countdown')).toBe('countdown');
    expect(markCountdownElapsed(finishRace('countdown'))).toBe('racing');
  });

  test('an unknown event is a no-op too (the machine is total)', () => {
    for (const state of RACE_STATES) {
      expect(raceTransition(state, 'teleport' as RaceEvent), state).toBe(state);
    }
  });

  test('the machine never mutates its inputs', () => {
    const statesBefore = [...RACE_STATES];
    const legalBefore = JSON.stringify(LEGAL);
    for (const state of RACE_STATES) {
      for (const event of EVENTS) raceTransition(state, event);
    }
    expect([...RACE_STATES]).toEqual(statesBefore);
    expect(JSON.stringify(LEGAL)).toBe(legalBefore);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. Abort, from everywhere
// ══════════════════════════════════════════════════════════════════════════

describe('C. Abort', () => {
  test('abort works from every state, and aborted is where it lands', () => {
    for (const state of RACE_STATES) {
      expect(abortRace(state), state).toBe('aborted');
      expect(raceTransition(state, 'abort'), state).toBe('aborted');
    }
  });

  test('a repeated abort cannot move the machine twice', () => {
    expect(abortRace(abortRace('racing'))).toBe('aborted');
    expect(abortRace('aborted')).toBe('aborted');
  });

  test('abort mid-countdown and mid-race both land on aborted', () => {
    expect(abortRace(startRace('idle'))).toBe('aborted');
    expect(abortRace(markCountdownElapsed(startRace('idle')))).toBe('aborted');
  });

  test('abort is the only event a finished race accepts', () => {
    for (const event of EVENTS) {
      const result = raceTransition('finished', event);
      if (event === 'abort') expect(result).toBe('aborted');
      else expect(result, event).toBe('finished');
    }
  });

  test('isRaceRunning answers for exactly the two live states', () => {
    expect(isRaceRunning('idle')).toBe(false);
    expect(isRaceRunning('countdown')).toBe(true);
    expect(isRaceRunning('racing')).toBe(true);
    expect(isRaceRunning('finished')).toBe(false);
    expect(isRaceRunning('aborted')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The finish API
// ══════════════════════════════════════════════════════════════════════════

describe('D. The finish API', () => {
  test('finishRace is the racing → finished step and nothing else', () => {
    expect(finishRace('racing')).toBe('finished');
    expect(finishRace('idle')).toBe('idle');
    expect(finishRace('countdown')).toBe('countdown');
    expect(finishRace('finished')).toBe('finished');
    expect(finishRace('aborted')).toBe('aborted');
  });

  test('nothing in the shipped game calls it yet — only the module and this suite', () => {
    // Stage 2's finish line is the intended caller. Until it exists, the two
    // production files that drive the race must not name it at all.
    for (const file of ['../App.tsx', '../components/3d/RaceScene.tsx']) {
      expect(load(file).includes('finishRace'), file).toBe(false);
    }
    expect(moduleCode.includes('export function finishRace')).toBe(true);
    expect(suiteSource.includes('finishRace')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The countdown and the race clock (derived, never stored)
// ══════════════════════════════════════════════════════════════════════════

describe('E. The derived presentation', () => {
  test('the countdown is 3 · 2 · 1 followed by the green light', () => {
    expect([...COUNTDOWN_STEPS]).toEqual(['3', '2', '1']);
    expect(COUNTDOWN_STEP_MS).toBe(1000);
    expect(COUNTDOWN_MS).toBe(3000);
    expect(COUNTDOWN_MS).toBe(COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS);
    expect(GO_LABEL).toBe('GO');
    expect(GO_DISPLAY_MS).toBeGreaterThan(0);
    // the green light is a beat inside racing, not a step of the countdown
    expect(COUNTDOWN_STEPS as readonly string[]).not.toContain('GO');
  });

  test('getCountdownStep walks one step per second, then answers null', () => {
    expect(getCountdownStep(0)).toBe('3');
    expect(getCountdownStep(1)).toBe('3');
    expect(getCountdownStep(999)).toBe('3');
    expect(getCountdownStep(1000)).toBe('2');
    expect(getCountdownStep(1999)).toBe('2');
    expect(getCountdownStep(2000)).toBe('1');
    expect(getCountdownStep(2999)).toBe('1');
    // …and null from COUNTDOWN_MS on: the moment `countdown-elapsed` is due
    expect(getCountdownStep(COUNTDOWN_MS)).toBe(null);
    expect(getCountdownStep(COUNTDOWN_MS + 5000)).toBe(null);
  });

  test('a negative or nonsense reading has no step, and never throws', () => {
    expect(getCountdownStep(-1)).toBe(null);
    expect(getCountdownStep(NaN)).toBe(null);
    expect(getCountdownStep(Infinity)).toBe(null);
    expect(getCountdownStep(-Infinity)).toBe(null);
  });

  test('every step lasts exactly one second', () => {
    for (const [index, step] of COUNTDOWN_STEPS.entries()) {
      expect(getCountdownStep(index * COUNTDOWN_STEP_MS), step).toBe(step);
      expect(getCountdownStep(index * COUNTDOWN_STEP_MS + COUNTDOWN_STEP_MS - 1), step).toBe(step);
    }
  });

  test('the clock renders mm:ss.t', () => {
    expect(formatRaceElapsed(0)).toBe('00:00.0');
    expect(formatRaceElapsed(999)).toBe('00:00.9');
    expect(formatRaceElapsed(1000)).toBe('00:01.0');
    expect(formatRaceElapsed(65432)).toBe('01:05.4');
    expect(formatRaceElapsed(60000)).toBe('01:00.0');
    expect(formatRaceElapsed(3599999)).toBe('59:59.9');
  });

  test('the clock never renders a broken string', () => {
    for (const value of [-1, -1000, NaN, -Infinity]) {
      expect(formatRaceElapsed(value)).toBe('00:00.0');
    }
    // minutes do not wrap, and the format stays mm:ss.t
    expect(formatRaceElapsed(6000000)).toBe('100:00.0');
    expect(formatRaceElapsed(12345)).toMatch(/^\d{2,}:\d{2}\.\d$/);
  });

  test('the clock is monotonic over a minute of tenths', () => {
    let previous = -1;
    for (let ms = 0; ms <= 60000; ms += 100) {
      const tenths = Number(formatRaceElapsed(ms).replace(/[:.]/g, ''));
      expect(tenths).toBeGreaterThan(previous);
      previous = tenths;
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Purity — the machine cannot reach a save
// ══════════════════════════════════════════════════════════════════════════

describe('F. Purity', () => {
  test('the module imports nothing at all', () => {
    expect(moduleCode).not.toContain('import ');
    expect(moduleCode).not.toContain('require(');
  });

  test('it names no storage, no save writer and no renderer', () => {
    for (const token of ['localStorage', 'sessionStorage', 'saveProfile', 'PROFILE_STORAGE_KEY', 'window', 'document', 'three', 'react']) {
      expect(moduleCode.toLowerCase(), token).not.toContain(token.toLowerCase());
    }
  });

  test('the same inputs always answer the same state', () => {
    for (const state of RACE_STATES) {
      for (const event of EVENTS) {
        const first = raceTransition(state, event);
        expect(raceTransition(state, event)).toBe(first);
        expect(raceTransition(state, event)).toBe(first);
      }
    }
  });
});
