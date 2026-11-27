/**
 * LADDER-1D — raceStamina module tests (§6).
 *
 * Pure-module tests only: bands, drain ordering, team-size and loadout
 * factors, the recovery cap, easing endpoints, the vulnerability factor,
 * and the results-screen tracking. The drain targets (metronome / frontrunner
 * / closer over shipped races) are proven by the soak in Part 5, not here.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  RACE_STAMINA_CONFIG,
  createRaceStamina,
  finishDrainFactor,
  loadoutDrainFactor,
  paceCapMultiplierFor,
  staminaBarBand,
  staminaPaceBand,
  staminaVulnerabilityFactor,
  stepRaceStamina,
  teamSizeDrainFactor,
  wheelsDrainFactor,
  type RaceStaminaState,
  type RaceStaminaTickInput,
} from './raceStamina';

const DT_MS = 1000;

function tick(
  state: RaceStaminaState,
  input: Partial<RaceStaminaTickInput> & { speed: number; paceCap: number },
): RaceStaminaState {
  return stepRaceStamina(state, {
    dtMs: DT_MS,
    teamSize: 2,
    wheelsId: 'wheels_standard',
    finishId: 'finish_stock',
    zone: 'meta',
    lap: 0,
    ...input,
  });
}

/** Step `seconds` one-second ticks at a fixed speed/cap/zone. */
function runFor(
  state: RaceStaminaState,
  seconds: number,
  input: Partial<RaceStaminaTickInput> & { speed: number; paceCap: number },
): RaceStaminaState {
  for (let i = 0; i < seconds; i += 1) tick(state, input);
  return state;
}

describe('raceStamina — pace bands (§3)', () => {
  test('bands derive from speed relative to the pace cap', () => {
    expect(staminaPaceBand(5, 10)).toBe('cruise'); // 50%
    expect(staminaPaceBand(6.9, 10)).toBe('cruise'); // just under 70%
    expect(staminaPaceBand(7, 10)).toBe('press'); // exactly 70% is press
    expect(staminaPaceBand(8, 10)).toBe('press'); // 80%
    expect(staminaPaceBand(9.2, 10)).toBe('press'); // exactly 92% is press
    expect(staminaPaceBand(9.3, 10)).toBe('allOut'); // above 92%
    expect(staminaPaceBand(10, 10)).toBe('allOut');
  });

  test('a stopped rig cruises, and a missing cap fails closed to cruise', () => {
    expect(staminaPaceBand(0, 10)).toBe('cruise');
    expect(staminaPaceBand(5, 0)).toBe('cruise');
    expect(staminaPaceBand(5, Number.NaN)).toBe('cruise');
    expect(staminaPaceBand(Number.NaN, 10)).toBe('cruise');
  });

  test('player thresholds are 9.1 and 11.96 u/s against maxSpeed 13', () => {
    expect(staminaPaceBand(9.1, 13)).toBe('press');
    expect(staminaPaceBand(9.09, 13)).toBe('cruise');
    expect(staminaPaceBand(11.96, 13)).toBe('press');
    expect(staminaPaceBand(11.97, 13)).toBe('allOut');
  });
});

describe('raceStamina — drain ordering and rates (§3, §6)', () => {
  test('drain ordering: all-out > press > cruise, at the config rates', () => {
    const cruise = runFor(createRaceStamina(), 10, { speed: 5, paceCap: 10 });
    const press = runFor(createRaceStamina(), 10, { speed: 8, paceCap: 10 });
    const allOut = runFor(createRaceStamina(), 10, { speed: 9.5, paceCap: 10 });
    expect(cruise.pool).toBeCloseTo(100 - 10 * RACE_STAMINA_CONFIG.drainPerSecond.cruise, 6);
    expect(press.pool).toBeCloseTo(100 - 10 * RACE_STAMINA_CONFIG.drainPerSecond.press, 6);
    expect(allOut.pool).toBeCloseTo(100 - 10 * RACE_STAMINA_CONFIG.drainPerSecond.allOut, 6);
    expect(allOut.pool).toBeLessThan(press.pool);
    expect(press.pool).toBeLessThan(cruise.pool);
  });

  test('the pool clamps at 0 and never goes negative', () => {
    const state = runFor(createRaceStamina(), 1000, { speed: 9.5, paceCap: 10 });
    expect(state.pool).toBe(0);
    expect(state.lowestPool).toBe(0);
  });

  test('a non-positive timestep is a no-op', () => {
    const state = createRaceStamina();
    stepRaceStamina(state, {
      speed: 9.5, paceCap: 10, dtMs: 0, teamSize: 2,
      wheelsId: 'wheels_standard', finishId: 'finish_stock', zone: 'meta', lap: 0,
    });
    expect(state.pool).toBe(100);
    expect(state.band).toBe('cruise');
  });
});

describe('raceStamina — team-size factors (§3, §6)', () => {
  test('Biga 1.0 / Triga 0.9 / Quadra 0.8 on the same band', () => {
    expect(teamSizeDrainFactor(2)).toBe(1.0);
    expect(teamSizeDrainFactor(3)).toBe(0.9);
    expect(teamSizeDrainFactor(4)).toBe(0.8);
    const press = { speed: 8, paceCap: 10, zone: 'meta' as const };
    const biga = runFor(createRaceStamina(), 10, { ...press, teamSize: 2 });
    const triga = runFor(createRaceStamina(), 10, { ...press, teamSize: 3 });
    const quadra = runFor(createRaceStamina(), 10, { ...press, teamSize: 4 });
    expect(100 - biga.pool).toBeCloseTo(10 * RACE_STAMINA_CONFIG.drainPerSecond.press, 6);
    expect(100 - triga.pool).toBeCloseTo(10 * RACE_STAMINA_CONFIG.drainPerSecond.press * 0.9, 6);
    expect(100 - quadra.pool).toBeCloseTo(10 * RACE_STAMINA_CONFIG.drainPerSecond.press * 0.8, 6);
  });
});

describe('raceStamina — loadout factors (§3, §6)', () => {
  test('Reinforced wheels cut turn drain slightly, and only on turns', () => {
    const pressMeta = { speed: 8, paceCap: 10, zone: 'meta' as const };
    const pressStraight = { speed: 8, paceCap: 10, zone: 'straight' as const };
    const standard = runFor(createRaceStamina(), 10, { ...pressMeta, wheelsId: 'wheels_standard' });
    const reinforcedMeta = runFor(createRaceStamina(), 10, { ...pressMeta, wheelsId: 'wheels_reinforced' });
    const reinforcedStraight = runFor(createRaceStamina(), 10, { ...pressStraight, wheelsId: 'wheels_reinforced' });
    const standardStraight = runFor(createRaceStamina(), 10, { ...pressStraight, wheelsId: 'wheels_standard' });
    expect(100 - reinforcedMeta.pool).toBeCloseTo(
      (100 - standard.pool) * RACE_STAMINA_CONFIG.reinforcedWheelsTurnDrainFactor,
      6,
    );
    expect(reinforcedStraight.pool).toBeCloseTo(standardStraight.pool, 6);
    expect(wheelsDrainFactor('wheels_reinforced', 'meta-exit')).toBe(
      RACE_STAMINA_CONFIG.reinforcedWheelsTurnDrainFactor,
    );
    expect(wheelsDrainFactor('wheels_standard', 'meta')).toBe(1);
    expect(wheelsDrainFactor('wheels_unknown', 'meta')).toBe(1);
  });

  test('every finish is exactly 1.0 — finishes are cosmetic', () => {
    for (const finishId of [
      'finish_stock',
      'finish_charred',
      'finish_gilded',
      'finish_oxblood',
      'finish_ventive',
      'finish_triumph_banners',
      'finish_unknown',
    ]) {
      expect(finishDrainFactor(finishId)).toBe(1);
      expect(loadoutDrainFactor('wheels_standard', finishId, 'meta')).toBe(1);
      expect(loadoutDrainFactor('wheels_reinforced', finishId, 'meta')).toBe(
        RACE_STAMINA_CONFIG.reinforcedWheelsTurnDrainFactor,
      );
    }
  });
});

describe('raceStamina — recovery (§3, §6)', () => {
  test('cruise on a straight regains at the config rate', () => {
    const state = createRaceStamina();
    state.pool = 90;
    runFor(state, 10, { speed: 5, paceCap: 10, zone: 'straight' });
    expect(state.pool).toBeCloseTo(90 + 10 * RACE_STAMINA_CONFIG.recoveryPerSecond, 6);
  });

  test('a full lap of cruising cannot refill more than 10 pool', () => {
    const state = createRaceStamina();
    state.pool = 50;
    runFor(state, 200, { speed: 5, paceCap: 10, zone: 'straight' });
    expect(state.pool).toBeCloseTo(50 + RACE_STAMINA_CONFIG.recoveryCapPerLap, 6);
    expect(state.recoveredThisLap).toBeCloseTo(RACE_STAMINA_CONFIG.recoveryCapPerLap, 6);
    // Further cruising this lap regains nothing.
    runFor(state, 10, { speed: 5, paceCap: 10, zone: 'straight' });
    expect(state.pool).toBeCloseTo(50 + RACE_STAMINA_CONFIG.recoveryCapPerLap, 6);
    // The next lap resets the cap.
    tick(state, { speed: 5, paceCap: 10, zone: 'straight', lap: 1 });
    expect(state.pool).toBeCloseTo(
      50 + RACE_STAMINA_CONFIG.recoveryCapPerLap + RACE_STAMINA_CONFIG.recoveryPerSecond,
      6,
    );
  });

  test('recovery needs cruise AND a straight — press on a straight drains', () => {
    const state = createRaceStamina();
    runFor(state, 10, { speed: 8, paceCap: 10, zone: 'straight' });
    expect(state.pool).toBeLessThan(100);
    expect(state.pool).toBeCloseTo(100 - 10 * RACE_STAMINA_CONFIG.drainPerSecond.press, 6);
  });

  test('cruise on a meta drains — recovery is straights only', () => {
    const state = createRaceStamina();
    runFor(state, 10, { speed: 5, paceCap: 10, zone: 'meta' });
    expect(state.pool).toBeCloseTo(100 - 10 * RACE_STAMINA_CONFIG.drainPerSecond.cruise, 6);
  });

  test('recovery clamps at the full pool', () => {
    const state = createRaceStamina();
    runFor(state, 10, { speed: 5, paceCap: 10, zone: 'straight' });
    expect(state.pool).toBe(100);
    expect(state.recoveredThisLap).toBe(0);
  });
});

describe('raceStamina — pace-cap easing (§3, §6)', () => {
  test('endpoints: 1.0 at 40 and above, 0.88 at 0', () => {
    expect(paceCapMultiplierFor(100)).toBe(1);
    expect(paceCapMultiplierFor(40)).toBe(1);
    expect(paceCapMultiplierFor(0)).toBe(RACE_STAMINA_CONFIG.paceCapEaseFloor);
    expect(paceCapMultiplierFor(0)).toBe(0.88);
  });

  test('the easing is linear and monotonic between 40 and 0', () => {
    expect(paceCapMultiplierFor(20)).toBeCloseTo(0.94, 9);
    expect(paceCapMultiplierFor(10)).toBeCloseTo(0.91, 9);
    expect(paceCapMultiplierFor(30)).toBeCloseTo(0.97, 9);
    let previous = paceCapMultiplierFor(40);
    for (let pool = 39; pool >= 0; pool -= 1) {
      const current = paceCapMultiplierFor(pool);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
    expect(paceCapMultiplierFor(Number.NaN)).toBe(1);
  });
});

describe('raceStamina — vulnerability factor (§3, §6)', () => {
  test('exactly 1.0 above 25 stamina, 1.5 at 25 or below', () => {
    expect(staminaVulnerabilityFactor(100)).toBe(1);
    expect(staminaVulnerabilityFactor(26)).toBe(1);
    expect(staminaVulnerabilityFactor(25)).toBe(RACE_STAMINA_CONFIG.vulnerabilityFactor);
    expect(staminaVulnerabilityFactor(24.9)).toBe(RACE_STAMINA_CONFIG.vulnerabilityFactor);
    expect(staminaVulnerabilityFactor(0)).toBe(RACE_STAMINA_CONFIG.vulnerabilityFactor);
    expect(staminaVulnerabilityFactor(1.5)).toBe(1.5);
    expect(staminaVulnerabilityFactor(Number.NaN)).toBe(1);
  });
});

describe('raceStamina — HUD bar band (§3, §6)', () => {
  test('healthy at or above 40, working 25–40, blown at or below 25', () => {
    // The bar reads the module's own two thresholds, so it can never
    // disagree with the physics: 40 is where the pace-cap easing starts,
    // 25 is where the tangle window widens. Both boundaries belong to the
    // healthier side's neighbour exactly as the helpers define them —
    // 40 itself is healthy (multiplier 1.0), 25 itself is blown
    // (vulnerability 1.5).
    expect(staminaBarBand(100)).toBe('healthy');
    expect(staminaBarBand(40)).toBe('healthy');
    expect(staminaBarBand(39.9)).toBe('working');
    expect(staminaBarBand(26)).toBe('working');
    expect(staminaBarBand(25)).toBe('blown');
    expect(staminaBarBand(24.9)).toBe('blown');
    expect(staminaBarBand(0)).toBe('blown');
    expect(staminaBarBand(Number.NaN)).toBe('healthy');
    // The band and the helpers agree at every boundary.
    expect(paceCapMultiplierFor(40)).toBe(1);
    expect(staminaVulnerabilityFactor(25)).toBe(RACE_STAMINA_CONFIG.vulnerabilityFactor);
  });
});

describe('raceStamina — results tracking (§3)', () => {
  test('lowestPool tracks the minimum and timeAllOutMs counts all-out time only', () => {
    const state = createRaceStamina();
    runFor(state, 5, { speed: 5, paceCap: 10 }); // cruise on a meta: drains
    runFor(state, 3, { speed: 9.5, paceCap: 10 }); // all-out: drains faster
    runFor(state, 5, { speed: 8, paceCap: 10 }); // press
    expect(state.lowestPool).toBeCloseTo(state.pool, 9);
    expect(state.timeAllOutMs).toBe(3000);
    expect(state.band).toBe('press');
    // Recovery cannot raise lowestPool.
    runFor(state, 10, { speed: 5, paceCap: 10, zone: 'straight' });
    expect(state.lowestPool).toBeLessThan(state.pool);
  });
});

describe('raceStamina — CPU (§6: the gate, not an assumption)', () => {
  test('stepping a full field (6 rigs) costs less than the driver bar, per tick per rig', () => {
    // The per-tick stamina cost for fields of up to 6 rigs (5 rivals +
    // the player), measured the same way as the 1B2 driver CPU
    // (performance.now() around the step, reported per tick per rig).
    // The bound is the driver's bar (0.05 ms/tick/rig) — the stamina
    // step is a handful of arithmetic ops, so it must sit far under it.
    const rigs: { state: RaceStaminaState; input: RaceStaminaTickInput }[] = [
      { state: createRaceStamina(), input: { speed: 2.7, paceCap: 2.72, dtMs: 1000 / 60, teamSize: 2, wheelsId: 'wheels_standard', finishId: 'finish_stock', zone: 'straight', lap: 0 } },
      { state: createRaceStamina(), input: { speed: 2.3, paceCap: 2.67, dtMs: 1000 / 60, teamSize: 2, wheelsId: 'wheels_reinforced', finishId: 'finish_gilded', zone: 'meta', lap: 0 } },
      { state: createRaceStamina(), input: { speed: 2.6, paceCap: 2.63, dtMs: 1000 / 60, teamSize: 2, wheelsId: 'wheels_standard', finishId: 'finish_stock', zone: 'straight', lap: 0 } },
      { state: createRaceStamina(), input: { speed: 2.2, paceCap: 2.58, dtMs: 1000 / 60, teamSize: 2, wheelsId: 'wheels_standard', finishId: 'finish_stock', zone: 'meta-exit', lap: 0 } },
      { state: createRaceStamina(), input: { speed: 1.2, paceCap: 2.6, dtMs: 1000 / 60, teamSize: 2, wheelsId: 'wheels_reinforced', finishId: 'finish_stock', zone: 'straight', lap: 0 } },
      // The player: a Quadra at full throttle on a straight (the heaviest
      // path — team-size factor + all-out drain + the recovery cap check).
      { state: createRaceStamina(), input: { speed: 12.5, paceCap: 13, dtMs: 1000 / 60, teamSize: 4, wheelsId: 'wheels_reinforced', finishId: 'finish_triumph', zone: 'straight', lap: 0 } },
    ];
    const ticks = 120_000;
    // The cruise-on-a-straight rig recovers, so it starts the loop below
    // max — otherwise its pool would sit at 100 the whole time and the
    // "real work" check below could not tell recovery from a no-op.
    const recovering = rigs[4];
    for (let i = 0; i < 60; i++) {
      stepRaceStamina(recovering.state, { ...recovering.input, zone: 'meta' });
    }
    const before = rigs.map((rig) => rig.state.pool);
    const start = performance.now();
    for (let t = 0; t < ticks; t++) {
      for (const rig of rigs) stepRaceStamina(rig.state, rig.input);
    }
    const msPerTickPerRig = (performance.now() - start) / ticks / rigs.length;
    // The steps are real work, not no-ops: the five draining rigs lost
    // pool, and the cruise-on-a-straight rig regained it (recovery).
    for (let i = 0; i < rigs.length; i++) {
      if (i === 4) expect(rigs[i].state.pool, `rig ${i} recovers on a cruise straight`).toBeGreaterThan(before[i]);
      else expect(rigs[i].state.pool, `rig ${i} drains`).toBeLessThan(before[i]);
    }
    console.log(`[1D stamina CPU] ${rigs.length} rigs × ${ticks} ticks: ${msPerTickPerRig.toFixed(5)} ms/tick/rig (bound 0.05)`);
    expect(msPerTickPerRig, 'stamina CPU per tick per rig').toBeLessThan(0.05);
  });
});

describe('raceStamina — the save boundary (§5: session-only, §J stays 29)', () => {
  test('the stamina state is session-only: six fields, no save key, fresh per race, no storage or save call in the module', () => {
    // The state shape — exactly the six session fields. No profile id,
    // no race id, no save key: the state is anonymous per-race state, so
    // it cannot be persisted as a per-profile field, and §J stays 29
    // (the saveCorpus scan proves the count in the full battery).
    const state = createRaceStamina();
    expect(Object.keys(state).sort()).toEqual(
      ['band', 'lap', 'lowestPool', 'pool', 'recoveredThisLap', 'timeAllOutMs'],
    );
    // Fresh per call: two states do not share identity, and mutating one
    // leaves the other at full pool.
    const other = createRaceStamina();
    stepRaceStamina(state, {
      dtMs: 1000,
      speed: 9.5,
      paceCap: 10,
      teamSize: 2,
      wheelsId: 'wheels_standard',
      finishId: 'finish_stock',
      zone: 'meta',
      lap: 0,
    });
    expect(state.pool).toBeLessThan(100);
    expect(other.pool).toBe(100);
    // The module itself writes no saves: no storage or settlement call
    // anywhere in raceStamina.ts (the 1C save-boundary pattern).
    const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
    const module = load('./raceStamina.ts');
    for (const forbidden of ['saveProfile', 'localStorage', 'sessionStorage', 'indexedDB', 'settleRaceCompletion']) {
      expect(module, `raceStamina.ts must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });
});
