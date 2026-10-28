/**
 * Day/night cycle T0 — the game clock's unit suite.
 *
 * Run with: bun test src/utils/timeState.test.ts
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the seven phases, in order, with the design's own ids and names;
 *   §B  the resolver's discipline — absent / malformed / non-number / NaN /
 *       infinite / negative / fractional `time.total` all read as a valid state
 *       (0 → Day 1, dawn), and a legacy save wakes there;
 *   §C  phase and day derivation across a full cycle AND across a day boundary;
 *   §D  `phasesUntilDawn` — its convention (7 at dawn … 1 at night) and its
 *       consistency: stepping by it always lands on a dawn and increments `day`;
 *   §E  `advanceTimeBy` purity — a deep-frozen input is never mutated, a new
 *       profile is returned, and a negative / fractional / nonsense step count is
 *       normalised;
 *   §F  `advanceToNextDawn` from EVERY phase, including the dawn-stay rule;
 *   §G  the profile table — its provenance (the two anchors are exact), its
 *       interpolation's shape, and that it is DATA with no scene reading it.
 *
 * The suite states the phase order and the conventions itself and derives
 * everything else from them, so a quietly reordered table or a flipped
 * convention fails here rather than passing because the suite read the module
 * back.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ANCHOR_MIDDAY,
  ANCHOR_NIGHT,
  PHASES_PER_DAY,
  PHASE_DAYLIGHT,
  PHASE_PROFILES,
  TIME_PHASES,
  TIME_PHASE_NAMES,
  advanceTimeBy,
  advanceToNextDawn,
  getPhaseProfile,
  resolveTimeState,
} from './timeState';
import type { TimePhase } from './timeState';
import type { PlayerProfile } from '../types/game';

// ── Sources (for the scope guards) ─────────────────────────────────────────
const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const MODULE_SRC = code('./timeState.ts');

/** Every file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

/** The seven phases and their names, written out: the specification. */
const EXPECTED_PHASES: readonly TimePhase[] = [
  'dawn',
  'morning',
  'midday',
  'afternoon',
  'golden',
  'dusk',
  'night',
];

const EXPECTED_NAMES: Readonly<Record<TimePhase, string>> = {
  dawn: 'Dawn',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  golden: 'Golden Hour',
  dusk: 'Dusk',
  night: 'Night',
};

/**
 * A profile carrying (or omitting) a clock, and nothing else this module reads.
 * The module deliberately touches only `profile.time.total`, so a cast literal
 * is the honest fixture — no other field has any bearing on the resolver.
 */
const profileWith = (total: unknown): PlayerProfile =>
  ({ time: { total } } as unknown as PlayerProfile);

const profileWithoutTime = (): PlayerProfile =>
  ({ name: 'Test', gold: 100 } as unknown as PlayerProfile);

/** Deep-freeze, so any in-place write throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** A profile with several fields, so "other fields survive" is testable. */
const richProfile = (total: number): PlayerProfile =>
  deepFreeze({
    name: 'Spartacus',
    gold: 250,
    level: 4,
    time: { total },
    appearance: { skinColor: '#fff' },
  } as unknown as PlayerProfile);

// ══════════════════════════════════════════════════════════════════════════
describe('T0 §A — the seven phases', () => {
  test('there are exactly seven, in cycle order, dawn first and night last', () => {
    expect(PHASES_PER_DAY).toBe(7);
    expect(TIME_PHASES).toHaveLength(7);
    expect(TIME_PHASES).toEqual(EXPECTED_PHASES);
    expect(TIME_PHASES[0]).toBe('dawn');
    expect(TIME_PHASES[PHASES_PER_DAY - 1]).toBe('night');
  });

  test('every phase has its designed name, and no extra names exist', () => {
    expect(TIME_PHASE_NAMES).toEqual(EXPECTED_NAMES);
    expect(Object.keys(TIME_PHASE_NAMES).sort()).toEqual([...EXPECTED_PHASES].sort());
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('T0 §B — the resolver’s discipline', () => {
  test('an absent profile, and a profile with no clock, resolve to Day 1 at dawn', () => {
    for (const input of [null, undefined, profileWithoutTime()]) {
      const state = resolveTimeState(input);
      expect(state.total).toBe(0);
      expect(state.day).toBe(1);
      expect(state.phaseIndex).toBe(0);
      expect(state.phase).toBe('dawn');
      expect(state.phasesUntilDawn).toBe(7);
      expect(state.isNight).toBe(false);
    }
  });

  test('a malformed clock resolves to 0 rather than throwing', () => {
    const malformed = [
      { time: null },
      { time: 7 },
      { time: 'seven' },
      { time: {} },
      { time: { total: null } },
      { time: { total: '3' } },
      { time: { total: {} } },
      { time: [3] },
      {},
    ];
    for (const profile of malformed) {
      const state = resolveTimeState(profile as unknown as PlayerProfile);
      expect(state.total, JSON.stringify(profile)).toBe(0);
      expect(state.phase).toBe('dawn');
      expect(state.day).toBe(1);
    }
  });

  test('a non-number, NaN or infinite total resolves to 0', () => {
    for (const value of ['1', null, undefined, {}, [], NaN, Infinity, -Infinity]) {
      expect(resolveTimeState(profileWith(value)).total, String(value)).toBe(0);
    }
  });

  test('a negative total resolves to 0', () => {
    for (const value of [-1, -7, -0.5, -1000]) {
      const state = resolveTimeState(profileWith(value));
      expect(state.total, String(value)).toBe(0);
      expect(state.day).toBe(1);
      expect(state.phase).toBe('dawn');
    }
  });

  test('a fractional total is floored, not rounded or carried', () => {
    expect(resolveTimeState(profileWith(0.9)).total).toBe(0);
    expect(resolveTimeState(profileWith(6.99)).total).toBe(6);
    expect(resolveTimeState(profileWith(6.99)).phase).toBe('night');
    expect(resolveTimeState(profileWith(7.1)).total).toBe(7);
    expect(resolveTimeState(profileWith(7.1)).phase).toBe('dawn');
    expect(resolveTimeState(profileWith(7.1)).day).toBe(2);
  });

  test('a legacy save (no clock) wakes on Day 1 at dawn, deliberately not retro-credited', () => {
    const state = resolveTimeState(profileWithoutTime());
    expect(state).toEqual({
      total: 0,
      day: 1,
      phaseIndex: 0,
      phase: 'dawn',
      phasesUntilDawn: 7,
      isNight: false,
    });
  });

  test('isNight is true for the night phase only — the stated convention', () => {
    for (const [index, phase] of TIME_PHASES.entries()) {
      expect(resolveTimeState(profileWith(index)).isNight, phase).toBe(phase === 'night');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('T0 §C — phase and day derivation', () => {
  test('a whole cycle walks the seven phases on Day 1', () => {
    for (const [index, phase] of EXPECTED_PHASES.entries()) {
      const state = resolveTimeState(profileWith(index));
      expect(state.total).toBe(index);
      expect(state.phaseIndex).toBe(index);
      expect(state.phase).toBe(phase);
      expect(state.day).toBe(1);
    }
  });

  test('the phase is total mod 7 and the day is floor(total / 7) + 1', () => {
    for (let total = 0; total < 70; total++) {
      const state = resolveTimeState(profileWith(total));
      expect(state.phaseIndex, String(total)).toBe(total % 7);
      expect(state.phase).toBe(TIME_PHASES[total % 7]);
      expect(state.day, String(total)).toBe(Math.floor(total / 7) + 1);
    }
  });

  test('the day boundary is night → dawn, and the day increments there', () => {
    const last = resolveTimeState(profileWith(6));
    const first = resolveTimeState(profileWith(7));
    expect(last.phase).toBe('night');
    expect(last.day).toBe(1);
    expect(first.phase).toBe('dawn');
    expect(first.day).toBe(2);
    // …and it repeats at every boundary
    expect(resolveTimeState(profileWith(13)).phase).toBe('night');
    expect(resolveTimeState(profileWith(13)).day).toBe(2);
    expect(resolveTimeState(profileWith(14)).phase).toBe('dawn');
    expect(resolveTimeState(profileWith(14)).day).toBe(3);
  });

  test('a large total still derives a phase and a day', () => {
    const state = resolveTimeState(profileWith(1000));
    expect(state.phaseIndex).toBe(1000 % 7);
    expect(state.day).toBe(Math.floor(1000 / 7) + 1);
    expect(state.total).toBe(1000);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('T0 §D — phasesUntilDawn', () => {
  test('the convention is 7 - phaseIndex: 7 at dawn, 1 at night', () => {
    expect(resolveTimeState(profileWith(0)).phasesUntilDawn).toBe(7);
    expect(resolveTimeState(profileWith(1)).phasesUntilDawn).toBe(6);
    expect(resolveTimeState(profileWith(5)).phasesUntilDawn).toBe(2);
    expect(resolveTimeState(profileWith(6)).phasesUntilDawn).toBe(1);
    for (const [index, phase] of TIME_PHASES.entries()) {
      expect(resolveTimeState(profileWith(index)).phasesUntilDawn, phase).toBe(
        PHASES_PER_DAY - index
      );
    }
  });

  test('stepping by phasesUntilDawn always lands on a dawn and increments the day', () => {
    for (const index of [0, 1, 2, 3, 4, 5, 6]) {
      const start = 7 + index;
      const state = resolveTimeState(profileWith(start));
      const landed = resolveTimeState(advanceTimeBy(profileWith(start), state.phasesUntilDawn));
      expect(landed.phase, `${start} + ${state.phasesUntilDawn}`).toBe('dawn');
      expect(landed.phaseIndex).toBe(0);
      expect(landed.total % PHASES_PER_DAY).toBe(0);
      expect(landed.day).toBe(state.day + 1);
    }
  });

  test('it is 7 for any total that is itself a dawn', () => {
    for (const total of [0, 7, 14, 21]) {
      expect(resolveTimeState(profileWith(total)).phasesUntilDawn, String(total)).toBe(7);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('T0 §E — advanceTimeBy is pure', () => {
  test('a deep-frozen profile is never mutated, and a new one is returned', () => {
    const frozen = richProfile(3);
    const advanced = advanceTimeBy(frozen, 2);
    expect(advanced).not.toBe(frozen);
    expect(advanced.time).not.toBe(frozen.time);
    expect(advanced.time?.total).toBe(5);
    expect(frozen.time?.total).toBe(3);
  });

  test('every other field survives the advance untouched', () => {
    const frozen = richProfile(5);
    const advanced = advanceTimeBy(frozen, 3);
    expect(advanced.name).toBe('Spartacus');
    expect(advanced.gold).toBe(250);
    expect(advanced.level).toBe(4);
    expect(advanced.appearance).toBe(frozen.appearance);
  });

  test('the result is independent — writing to it cannot reach the source', () => {
    const frozen = richProfile(2);
    const advanced = advanceTimeBy(frozen, 1);
    (advanced.time as { total: number }).total = 99;
    expect(frozen.time?.total).toBe(2);
    expect(resolveTimeState(frozen).total).toBe(2);
  });

  test('a negative or nonsense step count is treated as 0', () => {
    for (const steps of [-1, -100, NaN, Infinity, -Infinity]) {
      const advanced = advanceTimeBy(richProfile(4), steps as number);
      expect(advanced.time?.total, String(steps)).toBe(4);
    }
  });

  test('a fractional step count is floored', () => {
    expect(advanceTimeBy(richProfile(1), 2.9).time?.total).toBe(3);
    expect(advanceTimeBy(richProfile(1), 0.5).time?.total).toBe(1);
  });

  test('a malformed or absent clock advances from 0, not from garbage', () => {
    expect(advanceTimeBy(profileWithoutTime(), 3).time?.total).toBe(3);
    expect(advanceTimeBy(profileWith(-50), 2).time?.total).toBe(2);
    expect(advanceTimeBy(profileWith(6.9), 1).time?.total).toBe(7);
  });

  test('advancing a whole cycle keeps the phase and increments the day', () => {
    const before = resolveTimeState(profileWith(4));
    const after = resolveTimeState(advanceTimeBy(profileWith(4), PHASES_PER_DAY));
    expect(after.phase).toBe(before.phase);
    expect(after.day).toBe(before.day + 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('T0 §F — advanceToNextDawn', () => {
  test('from every phase, the total rounds up to the next multiple of 7', () => {
    for (const [index, phase] of TIME_PHASES.entries()) {
      const landed = resolveTimeState(advanceToNextDawn(profileWith(index)));
      if (index === 0) {
        expect(landed.total, phase).toBe(0);
      } else {
        expect(landed.total, phase).toBe(PHASES_PER_DAY);
      }
      expect(landed.phase, phase).toBe('dawn');
      expect(landed.total % PHASES_PER_DAY).toBe(0);
    }
  });

  test('from dawn the clock STAYS — the pinned dawn-stay behaviour', () => {
    for (const total of [0, 7, 14]) {
      const landed = advanceToNextDawn(profileWith(total));
      expect(landed.time?.total, String(total)).toBe(total);
      expect(resolveTimeState(landed).day).toBe(resolveTimeState(profileWith(total)).day);
    }
    // a legacy save sits at dawn, so it stays at Day 1
    expect(advanceToNextDawn(profileWithoutTime()).time?.total).toBe(0);
  });

  test('from every other phase the day increments', () => {
    for (const total of [1, 2, 3, 4, 5, 6]) {
      const before = resolveTimeState(profileWith(total));
      const after = resolveTimeState(advanceToNextDawn(profileWith(total)));
      expect(after.day, String(total)).toBe(before.day + 1);
      expect(after.phase).toBe('dawn');
    }
  });

  test('it lands on the next multiple of 7 across a day boundary', () => {
    expect(advanceToNextDawn(profileWith(9)).time?.total).toBe(14);
    expect(advanceToNextDawn(profileWith(13)).time?.total).toBe(14);
    expect(advanceToNextDawn(profileWith(19)).time?.total).toBe(21);
  });

  test('it is pure — a deep-frozen profile is untouched', () => {
    const frozen = richProfile(4);
    const landed = advanceToNextDawn(frozen);
    expect(landed).not.toBe(frozen);
    expect(landed.time).not.toBe(frozen.time);
    expect(landed.time?.total).toBe(7);
    expect(frozen.time?.total).toBe(4);
    expect(landed.gold).toBe(250);
  });

  test('it is idempotent from the dawn it lands on', () => {
    const once = advanceToNextDawn(profileWith(3));
    const twice = advanceToNextDawn(once);
    expect(twice.time?.total).toBe(once.time?.total);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('T0 §G — the phase profile table (data, provenance, shape)', () => {
  test('it is keyed by exactly the seven phases', () => {
    expect(Object.keys(PHASE_PROFILES)).toEqual([...TIME_PHASES]);
    for (const phase of TIME_PHASES) {
      expect(PHASE_PROFILES[phase].id).toBe(phase);
      expect(PHASE_PROFILES[phase].name).toBe(EXPECTED_NAMES[phase]);
      expect(getPhaseProfile(phase)).toBe(PHASE_PROFILES[phase]);
    }
  });

  test('the two anchors are exact in the table — midday and night are not interpolated', () => {
    const midday = PHASE_PROFILES.midday;
    const night = PHASE_PROFILES.night;
    expect(midday.daylight).toBe(1);
    expect(night.daylight).toBe(0);
    for (const key of Object.keys(ANCHOR_MIDDAY) as (keyof typeof ANCHOR_MIDDAY)[]) {
      expect(midday[key], `midday.${key}`).toBe(ANCHOR_MIDDAY[key]);
      expect(night[key], `night.${key}`).toBe(ANCHOR_NIGHT[key]);
    }
    // the midday sun really is the city's own noon rig
    expect(midday.sunIntensity).toBe(2.15);
    expect(midday.sunColor).toBe('#fffbeb');
    expect(midday.fogColor).toBe('#e3dbc6');
    // and the night anchor really is the torchlit one
    expect(night.torchIntensity).toBe(1.4);
    expect(midday.torchIntensity).toBe(0);
  });

  test('every phase sits between the two anchors, field by field', () => {
    const numeric = (key: keyof typeof ANCHOR_NIGHT): boolean =>
      typeof ANCHOR_NIGHT[key] === 'number';
    for (const phase of TIME_PHASES) {
      const profile = PHASE_PROFILES[phase];
      const t = PHASE_DAYLIGHT[phase];
      expect(t, phase).toBeGreaterThanOrEqual(0);
      expect(t, phase).toBeLessThanOrEqual(1);
      for (const key of Object.keys(ANCHOR_NIGHT) as (keyof typeof ANCHOR_NIGHT)[]) {
        if (!numeric(key)) continue;
        const night = ANCHOR_NIGHT[key] as number;
        const midday = ANCHOR_MIDDAY[key] as number;
        const lo = Math.min(night, midday);
        const hi = Math.max(night, midday);
        const value = profile[key] as number;
        expect(value, `${phase}.${String(key)}`).toBeGreaterThanOrEqual(lo);
        expect(value, `${phase}.${String(key)}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  test('the interpolation’s shape reads as a day', () => {
    // the key light grows with the daylight weight, monotonically
    const byDaylight = [...TIME_PHASES].sort(
      (a, b) => PHASE_DAYLIGHT[a] - PHASE_DAYLIGHT[b]
    );
    for (let i = 1; i < byDaylight.length; i++) {
      const prev = PHASE_PROFILES[byDaylight[i - 1]];
      const next = PHASE_PROFILES[byDaylight[i]];
      expect(next.sunIntensity).toBeGreaterThanOrEqual(prev.sunIntensity);
      expect(next.ambientIntensity).toBeGreaterThanOrEqual(prev.ambientIntensity);
      expect(next.torchIntensity).toBeLessThanOrEqual(prev.torchIntensity);
    }
    // the sun is highest at midday and below the horizon at night
    expect(PHASE_PROFILES.midday.sunElevationDeg).toBe(68);
    expect(PHASE_PROFILES.night.sunElevationDeg).toBe(-24);
    expect(PHASE_PROFILES.golden.sunElevationDeg).toBeLessThan(
      PHASE_PROFILES.midday.sunElevationDeg
    );
  });

  test('every colour is a well-formed hex value', () => {
    for (const phase of TIME_PHASES) {
      const profile = PHASE_PROFILES[phase];
      for (const key of ['sunColor', 'skyColor', 'groundColor', 'fogColor', 'skyDomeColor'] as const) {
        expect(profile[key], `${phase}.${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  test('the table is data — no function in it, and no scene consumes it in T0', () => {
    for (const phase of TIME_PHASES) {
      for (const value of Object.values(PHASE_PROFILES[phase])) {
        expect(typeof value, `${phase}`).not.toBe('function');
      }
    }
    // Suites are not consumers either: since GC20-X the save corpus drives
    // `resolveTimeState` over every fixture (a test, not a screen).  The guard's
    // property is that no SHIPPED source reads the module while nothing paints it.
    const sources = filesUnder(path('..')).filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) &&
        !/\.test\.tsx?$/.test(file) &&
        !file.endsWith('timeState.ts')
    );
    // `code`, not `load`: a prose mention of the module (e.g. the cross-reference
    // in `types/game.ts`) is not a consumer — only real source is scanned.
    const consumers = sources.filter((file) => /timeState/.test(code(file)));
    expect(consumers).toEqual([]);
    // no shipped source writes the field either — T0 adds no profile write
    expect(code('../services/storage.ts')).not.toContain('time:');
  });

  test('the declaration is optional on PlayerProfile, and the module reads no save', () => {
    expect(code('../types/game.ts')).toContain('time?: { total: number }');
    for (const token of ['localStorage', 'sessionStorage', 'saveProfile', 'PROFILE_STORAGE_KEY']) {
      expect(MODULE_SRC).not.toContain(token);
    }
    // the module imports the type and nothing else
    const imports = MODULE_SRC.match(/^import .*$/gm) ?? [];
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain("from '../types/game'");
  });
});
