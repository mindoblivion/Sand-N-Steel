/**
 * LADDER-1E Part 4 — Fortuna's Hand (challenge §2E, brief §6).
 *
 * Run with: bun test src/utils/fortunasHand.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the rates are exactly the disclosed percentages, per rung:
 *      District +4% (rival behind the player) / −3% (rival ahead);
 *      League +2% / −1.5%.
 *   §B the Hand is a pure function of (position relative to the player,
 *      lap, rung) — the same inputs always give the same multiplier, and
 *      only those inputs change it.
 *   §C the Hand is zero on the final lap (and on a single-lap race, which
 *      is all final lap).
 *   §D the Hand never fires with no player snapshot (the soak harness, a
 *      unit test with no player) — it fails closed to 1.0, so the soak
 *      pins hold exactly.
 *   §E the Hand never applies to the player: the player's cap path
 *      (`chariotMovement.ts`, `raceStamina.ts`) contains no Hand reference,
 *      and the Hand module returns a rival multiplier only.
 *   §F the Hand and stamina compose in the driver's target as
 *      paceCap × style × stamina × Hand — neither hides the other — and
 *      the Hand reads only the player's POSITION, never its pace or speed,
 *      so a rival's cap with the Hand is paceCap × (1 + hand) and nothing
 *      else.
 *   §G the results line prints the rung rates and whether the Hand was
 *      active in the race just run (off on the final lap), and the scene
 *      renders it.
 *
 * The driver tests read `driver.lastTarget` — the target the driver
 * throttled around on the last tick, after the corner limit and the follow
 * cap — so the exact percentage is proved, not inferred from the
 * throttle's ±0.05 hysteresis window (a 4% Hand on a ~2.7 u/s cap is only
 * ~0.11 u/s, barely wider than the window). The throttle is never
 * asserted here; the target is.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  FORTUNAS_HAND_RATES,
  fortunasHandMultiplier,
  fortunasHandRatesText,
  fortunasHandResultsLine,
} from './fortunasHand';
import { LEAGUE_POOL, resolveRivalDriverProfile, type RaceCompetitor, type RaceRungId } from './raceCompetitors';
import {
  analyzeRivalRoute,
  createRivalDriver,
  driveRival,
  resolveDriverPaceCap,
  routeHeadingAt,
  routePointAt,
  routeSampleAt,
  type RivalDriverState,
  type RivalRigSnapshot,
} from './rivalDriver';
import { RACE_ROUTE_LENGTH } from './raceRival';
import { createChariotMotion } from './chariotMovement';

const DT = 1 / 60;
// Tiberius is the frontrunner: style fraction 1.00 in every zone and every
// lap, so the driver's target is exactly cap × stamina × Hand — no style
// factor to account for. (Aulus is a closer: 0.85 early, 1.00 in the final
// third — the wrong rig for an exact-percentage probe.)
const TIBERIUS: RaceCompetitor = LEAGUE_POOL[2];

// A driver at a route distance, on its lane, at its pace — the standard
// rig for the unit tests (no other rigs unless the test adds them). Mirrors
// `driverAt` in `rivalDriver.test.ts`, plus the rung/laps the Hand reads.
function driverAt(
  competitor: RaceCompetitor,
  side: 1 | -1,
  s: number,
  seed = 11,
  opts: { rung?: RaceRungId; laps?: number } = {},
): { driver: RivalDriverState; motion: ReturnType<typeof createChariotMotion> } {
  const analysis = analyzeRivalRoute(side);
  const point = routePointAt(analysis, s);
  const motion = createChariotMotion(point[0], point[1], routeHeadingAt(analysis, s));
  motion.speed = resolveDriverPaceCap(resolveRivalDriverProfile(competitor));
  const driver = createRivalDriver({
    competitor,
    side,
    x: point[0],
    z: point[1],
    heading: motion.heading,
    speed: motion.speed,
    seed,
    ...(opts.rung !== undefined ? { rung: opts.rung } : {}),
    ...(opts.laps !== undefined ? { laps: opts.laps } : {}),
  });
  // Seed the driver's route position at s (the creation projection is at
  // the line, s = 0, and the arc window would reject a mid-route pose).
  // The scene never does this — it always creates drivers at the
  // handoff, s = 0 — so this is test-only scaffolding.
  driver.totalS = s;
  driver.sampleIndex = routeSampleAt(analysis, s);
  driver.lap = 0;
  return { driver, motion };
}

function tickFor(
  driver: RivalDriverState,
  motion: ReturnType<typeof createChariotMotion>,
  others: readonly RivalRigSnapshot[] = [],
) {
  return driveRival(driver, {
    x: motion.x,
    z: motion.z,
    heading: motion.heading,
    speed: motion.speed,
    racing: true,
    warning: 'none',
    others,
    dt: DT,
  });
}

/**
 * A player snapshot at an unwrapped route distance. The paceTarget and
 * speed are the player's live values in the scene — the Hand must never
 * read them, so tests vary them to prove it.
 */
function playerSnap(
  total: number,
  paceTarget = 0,
  speed = 0,
  side: 1 | -1 = -1,
): RivalRigSnapshot {
  const lap = Math.floor(total / RACE_ROUTE_LENGTH);
  const s = total - lap * RACE_ROUTE_LENGTH;
  return { id: 'player', s, lap, u: 0, speed, paceTarget, width: 1.5, side, x: 0, z: 0, heading: 0 };
}

describe('fortunasHand — the rates (§A)', () => {
  test('the rate table names exactly the disclosed percentages', () => {
    expect(FORTUNAS_HAND_RATES.district.behind).toBe(0.04);
    expect(FORTUNAS_HAND_RATES.district.ahead).toBe(-0.03);
    expect(FORTUNAS_HAND_RATES.league.behind).toBe(0.02);
    expect(FORTUNAS_HAND_RATES.league.ahead).toBe(-0.015);
  });

  test('District: +4% behind the player, −3% ahead', () => {
    expect(fortunasHandMultiplier({ playerTotal: 70, myTotal: 20, lap: 0, totalLaps: 3, rung: 'district' })).toBeCloseTo(1.04, 10);
    expect(fortunasHandMultiplier({ playerTotal: 5, myTotal: 20, lap: 0, totalLaps: 3, rung: 'district' })).toBeCloseTo(0.97, 10);
  });

  test('League: +2% behind the player, −1.5% ahead', () => {
    expect(fortunasHandMultiplier({ playerTotal: 70, myTotal: 20, lap: 0, totalLaps: 5, rung: 'league' })).toBeCloseTo(1.02, 10);
    expect(fortunasHandMultiplier({ playerTotal: 5, myTotal: 20, lap: 0, totalLaps: 5, rung: 'league' })).toBeCloseTo(0.985, 10);
  });

  test('an unknown rung fails closed to the District rates', () => {
    const rung = 'championship' as unknown as RaceRungId;
    expect(fortunasHandMultiplier({ playerTotal: 70, myTotal: 20, lap: 0, totalLaps: 3, rung })).toBeCloseTo(1.04, 10);
    expect(fortunasHandMultiplier({ playerTotal: 5, myTotal: 20, lap: 0, totalLaps: 3, rung })).toBeCloseTo(0.97, 10);
  });
});

describe('fortunasHand — pure function, final lap, no player (§B, §C, §D)', () => {
  test('the same inputs always give the same multiplier (pure)', () => {
    const input = { playerTotal: 70, myTotal: 20, lap: 0, totalLaps: 3, rung: 'district' as RaceRungId };
    expect(fortunasHandMultiplier(input)).toBe(fortunasHandMultiplier(input));
    expect(fortunasHandMultiplier(input)).toBe(fortunasHandMultiplier({ ...input }));
    // Only the three inputs change it: rung, lap, position.
    expect(fortunasHandMultiplier({ ...input, rung: 'league' })).not.toBe(fortunasHandMultiplier(input));
    expect(fortunasHandMultiplier({ ...input, lap: 2 })).not.toBe(fortunasHandMultiplier(input));
    expect(fortunasHandMultiplier({ ...input, playerTotal: 5 })).not.toBe(fortunasHandMultiplier(input));
  });

  test('the Hand is zero on the final lap, both rungs, both directions', () => {
    // District 3 laps: lap 2 is the final lap. League 5 laps: lap 4.
    for (const [rung, totalLaps, finalLap] of [['district', 3, 2], ['league', 5, 4]] as const) {
      expect(fortunasHandMultiplier({ playerTotal: 70, myTotal: 20, lap: finalLap, totalLaps, rung })).toBe(1);
      expect(fortunasHandMultiplier({ playerTotal: 5, myTotal: 20, lap: finalLap, totalLaps, rung })).toBe(1);
      // One lap past the final lap is still off (defensive).
      expect(fortunasHandMultiplier({ playerTotal: 70, myTotal: 20, lap: finalLap + 1, totalLaps, rung })).toBe(1);
    }
  });

  test('a single-lap race is all final lap: the Hand never applies', () => {
    expect(fortunasHandMultiplier({ playerTotal: 70, myTotal: 20, lap: 0, totalLaps: 1, rung: 'district' })).toBe(1);
    expect(fortunasHandMultiplier({ playerTotal: 5, myTotal: 20, lap: 0, totalLaps: 1, rung: 'league' })).toBe(1);
  });

  test('no player snapshot: the Hand is 1.0 on any lap, any rung', () => {
    for (const rung of ['district', 'league'] as const) {
      for (const lap of [0, 1, 2, 4]) {
        expect(fortunasHandMultiplier({ playerTotal: null, myTotal: 20, lap, totalLaps: 5, rung })).toBe(1);
      }
    }
  });

  test('a tie is exactly 1.0 — the boundary is not a hidden term', () => {
    expect(fortunasHandMultiplier({ playerTotal: 20, myTotal: 20, lap: 0, totalLaps: 3, rung: 'district' })).toBe(1);
    expect(fortunasHandMultiplier({ playerTotal: 20, myTotal: 20, lap: 0, totalLaps: 5, rung: 'league' })).toBe(1);
  });
});

describe('fortunasHand — the driver consumes it per-tick, rivals only (§F)', () => {
  test('District: a rival behind the player targets cap × 1.04, exactly', () => {
    const { driver, motion } = driverAt(TIBERIUS, -1, 20, 11, { rung: 'district', laps: 3 });
    const cap = resolveDriverPaceCap(resolveRivalDriverProfile(TIBERIUS));
    tickFor(driver, motion, [playerSnap(70)]);
    expect(driver.lastTarget).toBeCloseTo(cap * 1.04, 10);
    expect(driver.handTicks).toBe(1);
  });

  test('District: a rival ahead of the player targets cap × 0.97, exactly', () => {
    const { driver, motion } = driverAt(TIBERIUS, -1, 20, 11, { rung: 'district', laps: 3 });
    const cap = resolveDriverPaceCap(resolveRivalDriverProfile(TIBERIUS));
    tickFor(driver, motion, [playerSnap(5)]);
    expect(driver.lastTarget).toBeCloseTo(cap * 0.97, 10);
    expect(driver.handTicks).toBe(1);
  });

  test('League: +2% behind, −1.5% ahead, exactly', () => {
    const cap = resolveDriverPaceCap(resolveRivalDriverProfile(TIBERIUS));
    const behind = driverAt(TIBERIUS, -1, 20, 11, { rung: 'league', laps: 5 });
    tickFor(behind.driver, behind.motion, [playerSnap(70)]);
    expect(behind.driver.lastTarget).toBeCloseTo(cap * 1.02, 10);
    const ahead = driverAt(TIBERIUS, -1, 20, 11, { rung: 'league', laps: 5 });
    tickFor(ahead.driver, ahead.motion, [playerSnap(5)]);
    expect(ahead.driver.lastTarget).toBeCloseTo(cap * 0.985, 10);
  });

  test('the Hand reads only the player’s POSITION — never its pace or speed', () => {
    // The same position, three different player paceTargets/speeds: the
    // target must be identical. A rival's cap with the Hand is paceCap ×
    // (1 + hand) and nothing else — no other hidden term.
    const cap = resolveDriverPaceCap(resolveRivalDriverProfile(TIBERIUS));
    const targets: number[] = [];
    for (const [paceTarget, speed] of [[0, 0], [13, 5], [2.72, 2.72]] as const) {
      const { driver, motion } = driverAt(TIBERIUS, -1, 20, 11, { rung: 'district', laps: 3 });
      tickFor(driver, motion, [playerSnap(70, paceTarget, speed)]);
      targets.push(driver.lastTarget);
    }
    expect(targets[0]).toBeCloseTo(cap * 1.04, 10);
    expect(targets[1]).toBeCloseTo(targets[0], 10);
    expect(targets[2]).toBeCloseTo(targets[0], 10);
  });

  test('the Hand does not filter by side: a rival on the other flank still answers it', () => {
    const { driver, motion } = driverAt(TIBERIUS, -1, 20, 11, { rung: 'district', laps: 3 });
    const cap = resolveDriverPaceCap(resolveRivalDriverProfile(TIBERIUS));
    // The player on the opposite flank (side 1) is 50 ahead — the Hand
    // compares unwrapped route distance, and both flanks share one length.
    tickFor(driver, motion, [playerSnap(70, 0, 0, 1)]);
    expect(driver.lastTarget).toBeCloseTo(cap * 1.04, 10);
    expect(driver.handTicks).toBe(1);
  });

  test('the Hand is zero on the final lap in the driver, and handTicks never moves', () => {
    const { driver, motion } = driverAt(TIBERIUS, -1, 20, 11, { rung: 'district', laps: 3 });
    const cap = resolveDriverPaceCap(resolveRivalDriverProfile(TIBERIUS));
    // Final lap of a 3-lap race: totalS on lap 2, the player 50 ahead.
    const length = driver.analysis.length;
    driver.totalS = 2 * length + 20;
    driver.sampleIndex = routeSampleAt(driver.analysis, 20);
    driver.lap = 2;
    for (let i = 0; i < 60; i++) tickFor(driver, motion, [playerSnap(2 * length + 70)]);
    expect(driver.lastTarget).toBeCloseTo(cap, 10);
    expect(driver.handTicks).toBe(0);
  });

  test('no player snapshot: the driver never applies the Hand', () => {
    const { driver, motion } = driverAt(TIBERIUS, -1, 20, 11, { rung: 'district', laps: 3 });
    const cap = resolveDriverPaceCap(resolveRivalDriverProfile(TIBERIUS));
    for (let i = 0; i < 60; i++) tickFor(driver, motion, []);
    expect(driver.lastTarget).toBeCloseTo(cap, 10);
    expect(driver.handTicks).toBe(0);
  });

  test('the Hand composes with stamina: paceCap × stamina × Hand, neither hiding the other', () => {
    const { driver, motion } = driverAt(TIBERIUS, -1, 20, 11, { rung: 'district', laps: 3 });
    const cap = resolveDriverPaceCap(resolveRivalDriverProfile(TIBERIUS));
    // Pool 0: the stamina multiplier is exactly 0.88 (the floor). The
    // Hand must multiply it, not replace it and not be swallowed by it.
    driver.stamina.pool = 0;
    tickFor(driver, motion, [playerSnap(70)]);
    expect(driver.lastTarget).toBeCloseTo(cap * 0.88 * 1.04, 10);
    expect(driver.lastTarget).not.toBeCloseTo(cap * 0.88, 10);
    expect(driver.lastTarget).not.toBeCloseTo(cap * 1.04, 10);
    expect(driver.handTicks).toBe(1);
  });

  test('handTicks counts every racing tick the Hand applies', () => {
    const { driver, motion } = driverAt(TIBERIUS, -1, 20, 11, { rung: 'district', laps: 3 });
    for (let i = 0; i < 60; i++) tickFor(driver, motion, [playerSnap(70)]);
    expect(driver.handTicks).toBe(60);
  });
});

describe('fortunasHand — the results line (§G)', () => {
  test('the card line names the same rates as the results line', () => {
    // LADDER-1E Part 5 — the race card reads `fortunasHandRatesText`,
    // and the results line is built from the same fragment, so the two
    // can never disagree about what the Hand does on a rung.
    expect(fortunasHandRatesText('district')).toBe('rivals behind +4%, ahead -3%');
    expect(fortunasHandRatesText('league')).toBe('rivals behind +2%, ahead -1.5%');
    expect(fortunasHandRatesText('championship' as never)).toBe('rivals behind +4%, ahead -3%');
    expect(fortunasHandResultsLine('district', true, 3)).toContain(fortunasHandRatesText('district'));
    expect(fortunasHandResultsLine('league', true, 5)).toContain(fortunasHandRatesText('league'));
  });

  test('District active: the rates and the active laps, off on the final lap', () => {
    const line = fortunasHandResultsLine('district', true, 3);
    expect(line).toContain("Fortuna's Hand");
    expect(line).toContain('District');
    expect(line).toContain('+4%');
    expect(line).toContain('-3%');
    expect(line).toContain('Active laps 1-2');
    expect(line).toContain('off on the final lap');
  });

  test('League active: +2%, -1.5%, laps 1-4', () => {
    const line = fortunasHandResultsLine('league', true, 5);
    expect(line).toContain('League');
    expect(line).toContain('+2%');
    expect(line).toContain('-1.5%');
    expect(line).toContain('Active laps 1-4');
    expect(line).toContain('off on the final lap');
  });

  test('inactive: the line says the Hand was not applied', () => {
    expect(fortunasHandResultsLine('district', false, 3)).toContain('Not applied in this race.');
    expect(fortunasHandResultsLine('league', false, 5)).toContain('Not applied in this race.');
  });

  test('a single-lap race never claims the Hand applied', () => {
    expect(fortunasHandResultsLine('district', true, 1)).toContain('Not applied in this race.');
  });
});

describe('fortunasHand — the wiring (§E, §G)', () => {
  const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const sceneSrc = load('../components/3d/RaceScene.tsx');
  const movementSrc = load('./chariotMovement.ts');
  const staminaSrc = load('./raceStamina.ts');
  const driverSrc = load('./rivalDriver.ts');

  test('the results panel prints Fortuna’s Hand', () => {
    expect(sceneSrc).toContain('data-race-fortunas-hand');
    expect(sceneSrc).toContain('fortunasHandResultsLine(');
  });

  test('the Hand never touches the player’s cap path', () => {
    // The player's cap is maxSpeed × the stamina multiplier — the Hand is
    // a rival-only adjustment, and neither module that computes the
    // player's cap may reference it.
    expect(movementSrc).not.toContain('fortunasHand');
    expect(staminaSrc).not.toContain('fortunasHand');
  });

  test('the driver consumes the Hand per-tick at the target computation', () => {
    expect(driverSrc).toContain('fortunasHandMultiplier({');
    expect(driverSrc).toContain('handMultiplier');
  });
});
