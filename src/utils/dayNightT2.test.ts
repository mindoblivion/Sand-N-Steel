/**
 * Day/Night T2 — the clock's SEAMS. Regression suite.
 *
 * Run with: bun test src/utils/dayNightT2.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A  the advance table's pure rows: the duel result's ONE settlement (including the
 *       double-invocation proof), and the story valve;
 *   §B  the day boundary: it fires when night becomes dawn and not otherwise, and it
 *       cannot fire twice for one duel;
 *   §C  the Ludi rotation and the banner's line (Day 1 = Market Day, `Dies <name> ·
 *       Prima Luce`);
 *   §D  the rollover's effects: the training-session refresh, Dies Quietus's extra session,
 *       and the night at the Caravanserai (S5's wound effect AND the next dawn in one
 *       profile);
 *   §E  the wiring: where each advance lives, that the duel result is still the ONE write
 *       point, and that a refused transaction advances nothing;
 *   §F  the RACE binding, reported as PENDING (no profile-writing race seam exists);
 *   §G  the scene reads (the city and the duel resolve the clock, the dev stepper is
 *       unchanged) and the retired constant.
 *
 * The App-level seams are pinned by SOURCE, the repo's own idiom for a component this
 * suite cannot mount (`injury`, `treatment`, `bossKills`, `phase39c` all do the same). The
 * settlement itself is pinned by DRIVING it (§A/§B), which is why the double-invocation
 * property is a real assertion rather than a reading of the handler's shape.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PHASES_PER_DAY,
  advanceForStoryBeat,
  advanceTimeBy,
  advanceToNextDawn,
  resolveTimeState,
} from './timeState';
import {
  LUDI_QUIETUS_INDEX,
  LUDI_ROTATION,
  TRAINING_SESSIONS_FULL,
  applyDayRollover,
  dayBannerText,
  dayRolledTo,
  ludiDayName,
  settleDuelClock,
} from './dayRollover';
import { REST_PRICE, restAtInn } from './injury';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';

// ── Sources (for the seam guards) ──────────────────────────────────────────
const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

const APP = code('../App.tsx');
const SRC_ROOT = path('..');
const SOURCES = filesUnder(SRC_ROOT).filter(
  (file) =>
    /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file),
);

/** A slice of `App.tsx` between two handler anchors. */
const handlerOf = (from: string, to: string): string => {
  const start = APP.indexOf(from);
  const end = APP.indexOf(to);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
};

/** A fresh gladiator with the clock set to `total` phases. */
const at = (total: number, over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Tester'),
  time: { total },
  ...over,
});

// ── §A the advance table's pure rows ───────────────────────────────────────
describe('A. The duel result advances exactly one phase, exactly once', () => {
  test('one settlement steps the clock by one phase', () => {
    const before = at(4); // golden
    const first = settleDuelClock(before, false);
    expect(first.stepped).toBe(true);
    expect(resolveTimeState(before).total).toBe(4);
    expect(resolveTimeState(first.profile).total).toBe(5);
    expect(resolveTimeState(first.profile).phase).toBe('dusk');
  });

  test('DOUBLE INVOCATION: the second call into the same bout cannot advance again', () => {
    // This is the transaction-scoped guarantee: the caller keeps ONE flag per bout
    // (`App`'s ref, armed on entry), and the helper consumes it. A re-fired result path
    // therefore re-saves the same clock rather than walking it twice.
    const before = at(4);
    const first = settleDuelClock(before, false);
    const second = settleDuelClock(first.profile, first.stepped);
    expect(resolveTimeState(second.profile).total).toBe(5);
    expect(resolveTimeState(second.profile).total).toBe(resolveTimeState(first.profile).total);
    // …and a THIRD does nothing either.
    const third = settleDuelClock(second.profile, second.stepped);
    expect(resolveTimeState(third.profile).total).toBe(5);
  });

  test('the settlement is result-agnostic: a loss and a win read identically', () => {
    // `handleMatchComplete` composes the win and the loss write and then runs ONE tail; the
    // settlement takes no outcome at all, so a defeat can never be the path that skips it.
    const won = settleDuelClock(at(2, { fightsWon: 3 }), false);
    const lost = settleDuelClock(at(2, { fightsLost: 3 }), false);
    expect(resolveTimeState(won.profile).total).toBe(3);
    expect(resolveTimeState(lost.profile).total).toBe(3);
  });

  test('the settlement never mutates the profile it is handed', () => {
    const before = at(4);
    const snapshot = JSON.stringify(before);
    settleDuelClock(before, false);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test('the story valve is the one sanctioned story step: +1 phase, pure', () => {
    const before = at(3);
    const snapshot = JSON.stringify(before);
    const after = advanceForStoryBeat(before);
    expect(resolveTimeState(after).total).toBe(4);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
  });
});

// ── §B the day boundary ────────────────────────────────────────────────────
describe('B. The rollover fires when night becomes dawn, and only then', () => {
  test('a night duel result crosses into the new day', () => {
    const night = at(6);
    expect(resolveTimeState(night).phase).toBe('night');
    expect(resolveTimeState(night).day).toBe(1);
    const settled = settleDuelClock(night, false);
    expect(resolveTimeState(settled.profile).phase).toBe('dawn');
    expect(dayRolledTo(night, settled.profile)).toBe(2);
  });

  test('a duel in the middle of the day does not', () => {
    for (const total of [0, 1, 2, 3, 4, 5]) {
      const before = at(total);
      const settled = settleDuelClock(before, false);
      expect(dayRolledTo(before, settled.profile)).toBeNull();
    }
  });

  test('the rollover cannot fire twice for ONE duel', () => {
    const night = at(6);
    const first = settleDuelClock(night, false);
    const second = settleDuelClock(first.profile, first.stepped);
    expect(dayRolledTo(night, first.profile)).toBe(2);
    expect(dayRolledTo(first.profile, second.profile)).toBeNull();
  });
});

// ── §C the Ludi rotation and the banner ────────────────────────────────────
describe('C. The Ludi rotation and the day banner', () => {
  test('the seven names, in the director’s order, Day 1 = Market Day', () => {
    expect([...LUDI_ROTATION]).toEqual([
      'Dies Mercatus',
      'Dies Ferratus',
      'Dies Fortunae',
      'Dies Equorum',
      'Dies Sanguinis',
      'Ludi Magni',
      'Dies Quietus',
    ]);
    expect(LUDI_QUIETUS_INDEX).toBe(6);
  });

  test('day identity is (day - 1) mod 7, and it wraps', () => {
    expect(ludiDayName(1)).toBe('Dies Mercatus');
    expect(ludiDayName(2)).toBe('Dies Ferratus');
    expect(ludiDayName(5)).toBe('Dies Sanguinis');
    expect(ludiDayName(6)).toBe('Ludi Magni');
    expect(ludiDayName(7)).toBe('Dies Quietus');
    expect(ludiDayName(8)).toBe('Dies Mercatus');
    expect(ludiDayName(14)).toBe('Dies Quietus');
  });

  test('a malformed day reads as Day 1 rather than indexing outside the table', () => {
    expect(ludiDayName(0)).toBe('Dies Quietus');
    expect(ludiDayName(Number.NaN)).toBe('Dies Mercatus');
  });

  test('the banner is the new day’s name and the dawn that opened it', () => {
    expect(dayBannerText(1)).toBe('Dies Mercatus · Prima Luce');
    expect(dayBannerText(2)).toBe('Dies Ferratus · Prima Luce');
    expect(dayBannerText(7)).toBe('Dies Quietus · Prima Luce');
  });
});

// ── §D the rollover's effects and the night at the inn ─────────────────────
describe('D. The rollover’s effects, and the Caravanserai’s night', () => {
  test('training sessions come back to the tree’s own full value', () => {
    expect(TRAINING_SESSIONS_FULL).toBe(2);
    const spent = at(7, { trainingSessionsLeft: 0 });
    expect(applyDayRollover(spent, 2).trainingSessionsLeft).toBe(2);
  });

  test('Dies Quietus grants one more', () => {
    const spent = at(42, { trainingSessionsLeft: 0 });
    // Day 7 of a week: total 42 = 6 whole days, i.e. day 7 at dawn.
    expect(resolveTimeState(spent).day).toBe(7);
    expect(applyDayRollover(spent, 7).trainingSessionsLeft).toBe(TRAINING_SESSIONS_FULL + 1);
    // …and the day after goes back to the normal allotment.
    expect(applyDayRollover(spent, 8).trainingSessionsLeft).toBe(TRAINING_SESSIONS_FULL);
  });

  test('the rollover touches nothing but the day’s own effects', () => {
    const hurt = at(7, {
      trainingSessionsLeft: 0,
      gold: 40,
      injury: { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 },
    });
    const rolled = applyDayRollover(hurt, 2);
    expect(rolled.gold).toBe(40);
    // The calendar NEVER decrements an injury — injuries count down in fights only.
    expect(rolled.injury).toEqual(hurt.injury);
    expect(resolveTimeState(rolled).total).toBe(resolveTimeState(hurt).total);
  });

  test('S5’s rest numbers are unchanged, and the night lands on the next dawn', () => {
    const hurt = at(4, {
      gold: 100,
      injury: { fightsRemaining: 3, penaltyStrength: 2, penaltyAgility: 2 },
    });
    const rested = restAtInn(hurt);
    // S5's own effect: 25 gold and two fights off the wound, untouched by this slice.
    expect(rested.gold).toBe(100 - REST_PRICE);
    expect(rested.injury?.fightsRemaining).toBe(1);
    // T2's half: the same profile then lands on the next dawn (total 7 = Day 2, dawn).
    const night = advanceToNextDawn(rested);
    expect(resolveTimeState(night).total).toBe(PHASES_PER_DAY);
    expect(resolveTimeState(night).phase).toBe('dawn');
    expect(resolveTimeState(night).day).toBe(2);
    // ONE profile carries both effects, which is what the App seam saves.
    expect(night.gold).toBe(75);
    expect(night.injury?.fightsRemaining).toBe(1);
  });

  test('from Prima Luce the night sleeps a FULL cycle (tomorrow’s dawn)', () => {
    const dawn = at(0, { gold: 100 });
    // T0's pinned rule: `advanceToNextDawn` keeps a dawn where it stands …
    expect(resolveTimeState(advanceToNextDawn(dawn)).total).toBe(0);
    // … so the Rest seam steps a whole day instead, which is the price its label states.
    const tomorrow = advanceTimeBy(dawn, PHASES_PER_DAY);
    expect(resolveTimeState(tomorrow).total).toBe(PHASES_PER_DAY);
    expect(resolveTimeState(tomorrow).phase).toBe('dawn');
    expect(resolveTimeState(tomorrow).day).toBe(2);
  });
});

// ── §E the wiring ──────────────────────────────────────────────────────────
describe('E. The wiring: one write point per seam, and refusals advance nothing', () => {
  const DUEL = handlerOf('const handleMatchComplete', 'const handleDuelResultDismiss');
  const TRAIN = handlerOf('const handleTrainStat', 'const handleBuyItem');
  const REST = handlerOf('const payForNight', 'const handleBuyRacingConfig');
  const ENTER = handlerOf('const handleEnterDuel', 'const handleEnterDoctoreTest');

  test('the duel result is still ONE write, and the advance rides it', () => {
    expect(DUEL.match(/saveProfile\(/g) ?? []).toHaveLength(1);
    expect(DUEL.match(/setDuelResult\(/g) ?? []).toHaveLength(1);
    expect(DUEL.match(/settleDuelClock\(/g) ?? []).toHaveLength(1);
    expect(DUEL).toContain('settleDuelClock(settledProfile, duelTimeSteppedRef.current)');
    expect(DUEL).toContain('const timedProfile = onDayRollover(profile, clock.profile);');
    // A8 REBASE, not a weakening: the awards are composed onto `timedProfile` and the
    // transaction's ONE set/save pair carries the awarded profile.  Still one write.
    // STORY-5a REBASE, same rule: the dice trail's own record is composed onto
    // `timedProfile` first (its bout's win must ride the same save), so the awards
    // are applied to `trailProfile` — still inside the one transaction, still one
    // write, and the clock still advances before it.
    expect(DUEL).toContain('applyTriumphAwards(trailProfile, duelTriumphStats)');
    expect(DUEL).toContain('setProfile(awards.profile);');
    expect(DUEL).toContain('saveProfile(awards.profile);');
    // The advance is INSIDE the transaction: after the win/loss composition, before the save.
    expect(DUEL.indexOf('} else {')).toBeLessThan(DUEL.indexOf('settleDuelClock('));
    expect(DUEL.indexOf('settleDuelClock(')).toBeLessThan(DUEL.indexOf('saveProfile(awards.profile)'));
    // Nothing on entry, in a render or in an effect can advance it.
    expect(DUEL).not.toContain('advanceTimeBy');
  });

  test('the bout’s settlement flag is armed on entry and consumed by the write', () => {
    expect(ENTER).toContain('duelTimeSteppedRef.current = false;');
    expect(ENTER).not.toContain('settleDuelClock');
    expect(ENTER).not.toContain('saveProfile');
    expect(APP.match(/duelTimeSteppedRef\.current = clock\.stepped;/g) ?? []).toHaveLength(1);
  });

  test('a training session advances in its own transaction, and a refusal does not', () => {
    expect(TRAIN).toContain('advanceTimeBy(trained, 1)');
    expect(TRAIN.match(/advanceTimeBy\(/g) ?? []).toHaveLength(1);
    expect(TRAIN.match(/saveProfile\(/g) ?? []).toHaveLength(1);
    // The gold refusal RETURNS before the advance: a session that cannot be paid for
    // changes neither gold, nor stats, nor the clock.
    expect(TRAIN.indexOf('profile.gold < cost')).toBeGreaterThan(-1);
    expect(TRAIN.indexOf('profile.gold < cost')).toBeLessThan(TRAIN.indexOf('advanceTimeBy('));
    expect(TRAIN.indexOf('return;')).toBeLessThan(TRAIN.indexOf('advanceTimeBy('));
  });

  test('the night at the Caravanserai is S5’s effect and the dawn in ONE save', () => {
    expect(REST.match(/restAtInn\(profile\)/g) ?? []).toHaveLength(1);
    expect(REST.match(/advanceToNextDawn\(/g) ?? []).toHaveLength(1);
    expect(REST.match(/saveProfile\(/g) ?? []).toHaveLength(1);
    expect(REST).toContain('const settled = onDayRollover(profile, toDawn);');
    expect(REST).toContain('setProfile(settled);');
    expect(REST).toContain('saveProfile(settled);');
    // An unwounded gladiator still buys the night, at S5's own price and nothing else.
    expect(REST).toContain('subject.gold >= REST_PRICE');
  });

  test('the rollover seam is defined once and called by the three advance seams', () => {
    expect(APP.match(/const onDayRollover =/g) ?? []).toHaveLength(1);
    expect(APP.match(/onDayRollover\(profile,/g) ?? []).toHaveLength(3);
  });

  test('the banner is driven by the seam and drawn over the city only', () => {
    expect(APP).toContain('setDayBanner({ day: rolledTo, text: dayBannerText(rolledTo) });');
    expect(APP).toContain('<DayBanner');
    const banner = code('../components/ui/DayBanner.tsx');
    expect(banner).toContain('opacity');
    expect(banner).toContain('transition');
    // Two opacity transitions and two timers: no per-frame work at all.
    expect(banner).not.toContain('useFrame');
    expect(load('../components/ui/DayBanner.tsx')).toContain('DAY_FADE_MS = 600');
  });
});

// ── §F the race binding, reported pending ──────────────────────────────────
describe('F. The race binding is PENDING — no profile-writing race seam exists', () => {
  test('the race screen writes no save and reads no clock', () => {
    const race = code('../components/3d/RaceScene.tsx');
    expect(race).not.toContain('saveProfile');
    expect(race).not.toContain('resolveTimeState');
    expect(race).not.toContain('advanceTimeBy');
    expect(race).not.toContain('advanceToNextDawn');
  });

  test('App’s two race handlers advance nothing', () => {
    for (const [from, to] of [
      ['const handleStartRace', 'const handleExitRace'],
      ['const handleExitRace', 'const handleOpenHubTab'],
    ] as const) {
      const block = handlerOf(from, to);
      expect(block).not.toContain('advanceTimeBy');
      expect(block).not.toContain('advanceToNextDawn');
      expect(block).not.toContain('settleDuelClock');
    }
  });

  test('the finish-line API still has no caller, which is the seam this waits on', () => {
    // Stage 1 Slice 1 shipped the race saves-read-only: `finishRace` is the API the finish
    // line will call, and nothing calls it yet. The race row of the advance table therefore
    // has no transaction to ride, and this slice invents none.
    const state = code('./raceState.ts');
    expect(state).toContain('finishRace');
    expect(APP).not.toContain('finishRace');
  });
});

// ── §G the scene reads and the retired constant ────────────────────────────
describe('G. The scenes read the clock; the staging constant is gone', () => {
  test('the city resolves the phase from the save and paints that one row', () => {
    const city = code('../components/3d/city/CityHubScene.tsx');
    expect(city).toContain('const cityPhase = resolveTimeState(playerProfile).phase;');
    expect(city).toContain('const cityPhaseLight = getPhaseLight(cityPhase);');
    expect(city).toContain('<CityAtmosphere phase={cityPhase} />');
    expect(city.match(/resolveTimeState\(/g) ?? []).toHaveLength(1);
  });

  test('the duel freezes its hour at entry, so a mid-duel write cannot relight it', () => {
    const duel = code('../components/duel/DuelScene.tsx');
    expect(duel).toContain(
      'const [entryPhase] = useState(() => resolveTimeState(playerProfile).phase);'
    );
    expect(duel).toContain('resolveDuelPhaseLight(entryPhase, opponent.isBoss === true)');
    expect(duel.match(/resolveTimeState\(/g) ?? []).toHaveLength(1);
  });

  test('no shipped source names the retired constant', () => {
    const offenders = SOURCES.filter((file) =>
      /CURRENT_PHASE(?!_SOURCE)/.test(code(file))
    ).map((file) => file.slice(SRC_ROOT.length + 1));
    expect(offenders).toEqual([]);
  });

  test('the dev phase stepper still opens on golden hour', () => {
    const harness = code('../components/dev/PhaseLightHarness.tsx');
    expect(harness).toContain('useState<TimePhase>(DEFAULT_PHASE)');
    expect(harness).toContain('TIME_PHASES.map');
    expect(harness).toContain('resolveDuelPhaseLight');
    expect(harness).toContain('applyPhaseLight(scene, rowPhase)');
  });
});
