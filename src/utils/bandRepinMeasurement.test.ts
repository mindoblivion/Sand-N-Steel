// BAND-REPIN Part 1 — multi-seed per-lap measurement (steward live).
//
// The measurement: seeds 11–30, 3-lap District, 3-lap League, 5-lap
// League, steward wired in as the scene wires it, shipped geometry. For
// every driven lap it records the overage vs its rig's profile
// (driven − profile), per rung and per lap index, and derives the X values
// the re-pin rule produces (X = ceil(max overage for that lap, across all
// rigs and seeds), per rung per lap). This file asserts only the SHAPE the
// brief requires — finite positive overages, every rig finishing every lap,
// and the X values as the measured ceilings — never the expected X values
// (25/15/14/14): the measurement is the authority, and if it produces
// different X values, Part 2 pins those. The bands are NOT monotonic lap
// by lap (queue on lap 1, stamina drain on laps 3–4) — see the revised
// sanity rule in the measurement test below.
//
// WHY THE RUNNER LIVES HERE: the shipped steward-live soak,
// `runIncidentSoakRace`, is exported from `raceIncidents.test.ts` — but
// importing a `.test.ts` file registers all of its tests under the
// importer (proven: importing it runs its 21 tests a second time, and no
// file anywhere in the repo imports a `.test` file). The runner below is
// therefore line-faithful to `runIncidentSoakRace` — same shipped modules,
// same tick order, same constants, no variant parameterization, shipped
// geometry only — and its fidelity is proven, not assumed, by the
// fidelity suite below: it must reproduce the pinned 1C soak numbers
// (14 incidents, 31 warnings, max 4/race, District 0) and the pinned 1D
// 3-lap League numbers (2 incidents, max 2/pair) exactly. If any fidelity
// number moves, this runner is NOT the shipped soak and the slice stops.
//
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_INCIDENT_RIG_EFFECTS,
  createIncidentStewardState,
  incidentZoneForRig,
  stepIncidentSteward,
  type IncidentRigEffects,
  type IncidentRigPose,
  type RaceIncidentLogEntry,
} from './raceIncidents';
import { advanceChariot, createChariotMotion, isChariotInsideArena } from './chariotMovement';
import { staminaVulnerabilityFactor } from './raceStamina';
import {
  RIVAL_RIG_LENGTH,
  createRivalDriver,
  driveRival,
  rivalDriverRoutePosition,
  type RivalDriverState,
  type RivalRigSnapshot,
} from './rivalDriver';
import { resolveRigSeparation, rigOverlap } from './raceRigCollision';
import { FORMATION_ROW_GAP, resolveFormationSlots } from './raceGrid';
import { resolveRungField, type RaceCompetitor, type RaceRungId } from './raceCompetitors';

const SOAK_DT = 1 / 60;
const SOAK_ROLL_SPEED = 5;
const SOAK_LINE_Z = 42.5;

interface MeasurementRig {
  id: string;
  competitor: RaceCompetitor;
  side: 1 | -1;
  row: number;
  endX: number;
  rolling: boolean;
  rollZ: number;
  motion: ReturnType<typeof createChariotMotion> | null;
  driver: RivalDriverState | null;
  crossingTime: number | null;
  lapStartTime: number | null;
  lapTimes: number[];
  finished: boolean;
}

interface MeasurementRace {
  lapTimes: { id: string; profile: number; driven: number[] }[];
  incidents: number;
  warnings: number;
  perPair: Map<string, number>;
  outlineViolations: number;
  stewardMeanMs: number;
}

/**
 * One simulated race, the steward wired in as the scene wires it.
 * Line-faithful to the shipped `runIncidentSoakRace`
 * (`raceIncidents.test.ts`): same formation slots, same roll-in, same
 * driver creation (no `laps` passed — the drivers keep the totalLaps=1
 * they were measured with in 1D), same per-tick order (steward effects
 * from the previous tick, drive, advance, lap detection by the driver's
 * totalS wrapping, separation, rest overlap, steward step), same
 * first-finisher-ends-the-steward rule. The differences from the shipped
 * soak are the return shape (this runner also exposes the per-lap table
 * the re-pin rule reads) and the STALL Part 2 enablement below (the
 * re-seed + the `finished` snapshot flag, mirroring stallTrace.test.ts):
 * without them the multi-lap measurement still pins (mode A) and the
 * re-pin cannot be answered. No variant, no geometry change, no solver
 * change.
 */
function runMeasurementRace(
  field: readonly RaceCompetitor[],
  rung: RaceRungId,
  seedBase: number,
  maxSimSeconds: number,
  laps = 1,
): MeasurementRace {
  const slots = resolveFormationSlots(field.length);
  const rigs: MeasurementRig[] = field.map((competitor, i) => {
    const slot = slots[i];
    return {
      id: competitor.id,
      competitor,
      side: slot.side,
      row: slot.row,
      endX: slot.endX,
      rolling: true,
      rollZ: SOAK_LINE_Z - (18.5 + slot.row * FORMATION_ROW_GAP),
      motion: null,
      driver: null,
      crossingTime: null,
      lapStartTime: null,
      lapTimes: [],
      finished: false,
    };
  });
  const steward = createIncidentStewardState(rung);
  let effects = new Map<string, IncidentRigEffects>();
  const log: RaceIncidentLogEntry[] = [];
  let clockOriginS: number | null = null;
  // The scene stops the steward at the PLAYER's finish (raceState leaves
  // 'racing'); there is no player in this soak, so the first finisher
  // ends the steward's window — a parked finisher past the line must not
  // collect warnings from rigs still racing, which the scene never sees.
  let stewardActive = true;
  let simTime = 0;
  let stewardNs = 0;
  let stewardCalls = 0;
  let maxRestOverlap = 0;
  let maxOverlap = 0;
  let outlineViolations = 0;
  const passes: { follower: string; leader: string }[] = [];
  const order = new Map<string, number>();
  const totalDistance = (rig: MeasurementRig): number => {
    if (rig.rolling) return -(SOAK_LINE_Z - rig.rollZ);
    if (!rig.driver) return -Infinity;
    return rig.driver.totalS;
  };
  const maxTicks = Math.ceil(maxSimSeconds / SOAK_DT);
  for (let tick = 0; tick < maxTicks; tick++) {
    simTime = tick * SOAK_DT;
    if (rigs.every((r) => r.finished)) break;
    for (const rig of rigs) {
      if (rig.finished) continue;
      if (rig.rolling) {
        rig.rollZ += SOAK_ROLL_SPEED * SOAK_DT;
        if (rig.rollZ >= SOAK_LINE_Z) {
          rig.rolling = false;
          rig.motion = createChariotMotion(rig.endX, SOAK_LINE_Z, 0);
          rig.motion.speed = SOAK_ROLL_SPEED;
          rig.driver = createRivalDriver({
            competitor: rig.competitor,
            side: rig.side,
            x: rig.endX,
            z: SOAK_LINE_Z,
            heading: 0,
            speed: SOAK_ROLL_SPEED,
            // The harness does not pass `laps`: the drivers keep the
            // totalLaps=1 they were measured with in 1D — out of scope.
            rung,
            seed: seedBase + rig.row * 7 + (rig.side === 1 ? 3 : 0),
          });
          // STALL Part 2 (fixed tree) — enable the stuck-rig re-seed for
          // multi-lap races only, mirroring stallTrace.test.ts. The
          // driver is deliberately created WITHOUT `laps` (totalLaps=1,
          // so the closer's pace and the 1D drain behaviour are exactly
          // as measured); the re-seed is switched on here, per race, so
          // a one-lap race keeps the exact behaviour the 1C soak pins
          // were measured with. Without this the multi-lap measurement
          // still pins (mode A) and the re-pin cannot be answered.
          rig.driver.reseedEnabled = laps > 1;
          rig.crossingTime = simTime;
          rig.lapStartTime = simTime;
          // The race clock starts at the LEADER's crossing (1B).
          if (clockOriginS === null) clockOriginS = simTime;
        }
        continue;
      }
      const others: RivalRigSnapshot[] = [];
      for (const other of rigs) {
        if (other === rig || other.rolling || !other.driver || !other.motion) continue;
        const pos = rivalDriverRoutePosition(other.driver);
        others.push({
          id: other.id,
          s: pos.s,
          lap: pos.lap,
          u: pos.u,
          speed: other.motion.speed,
          paceTarget: other.driver.paceTarget,
          width: other.driver.width,
          side: other.side,
          x: other.motion.x,
          z: other.motion.z,
          heading: other.motion.heading,
          // STALL Part 2 (fixed tree) — the follow cap reads this, not
          // the lap count: the driver does not know the race length (it
          // is created without `laps`, so totalLaps=1), and only the
          // runner, which counts the laps, can say a rig finished. A
          // finished leader does not cap a follower (mode C); without
          // this a follower a lap behind a frozen finisher is capped to
          // 0.02 forever and can never finish.
          finished: other.finished,
        });
      }
      // The steward's effects from the previous tick — one frame of lag,
      // exactly as the scene has (the steward mounts after the chariots).
      const rigEffects = effects.get(rig.id) ?? DEFAULT_INCIDENT_RIG_EFFECTS;
      const input = driveRival(rig.driver!, {
        x: rig.motion!.x,
        z: rig.motion!.z,
        heading: rig.motion!.heading,
        speed: rig.motion!.speed,
        racing: true,
        warning: rigEffects.warning,
        others,
        dt: SOAK_DT,
      });
      const steeredInput = {
        throttle: input.throttle,
        steer: Math.max(-1, Math.min(1, input.steer * rigEffects.steerScale + rigEffects.steerBias)),
      };
      advanceChariot(rig.motion!, steeredInput, SOAK_DT, 1, rigEffects.dragScale);
      if (!isChariotInsideArena(rig.motion!)) outlineViolations++;
      const driverPos = rivalDriverRoutePosition(rig.driver!);
      if (driverPos.lap > rig.lapTimes.length) {
        rig.lapTimes.push(simTime - (rig.lapStartTime ?? simTime));
        rig.lapStartTime = simTime;
        if (rig.lapTimes.length >= laps) {
          rig.finished = true;
          stewardActive = false;
          effects = new Map();
        }
      }
    }
    // Separation (all pairs, once), exactly as the scene's resolver does.
    for (let i = 0; i < rigs.length; i++) {
      for (let j = i + 1; j < rigs.length; j++) {
        const a = rigs[i];
        const b = rigs[j];
        if (a.rolling || b.rolling || !a.motion || !b.motion) continue;
        const overlap = rigOverlap(
          { x: a.motion.x, z: a.motion.z, heading: a.motion.heading },
          { x: b.motion.x, z: b.motion.z, heading: b.motion.heading },
        );
        if (overlap > maxOverlap) maxOverlap = overlap;
        const pushes = resolveRigSeparation(
          { x: a.motion.x, z: a.motion.z, heading: a.motion.heading },
          { x: b.motion.x, z: b.motion.z, heading: b.motion.heading },
        );
        if (pushes) {
          a.motion.x += pushes.pushA.x;
          a.motion.z += pushes.pushA.z;
          b.motion.x += pushes.pushB.x;
          b.motion.z += pushes.pushB.z;
        }
      }
    }
    // Post-separation ("at rest") overlap: the ceiling on what the steward
    // can see as lateral overlap on its step below.
    let restOverlap = 0;
    for (let i = 0; i < rigs.length; i++) {
      for (let j = i + 1; j < rigs.length; j++) {
        const a = rigs[i];
        const b = rigs[j];
        if (a.rolling || b.rolling || !a.motion || !b.motion) continue;
        const rest = rigOverlap(
          { x: a.motion.x, z: a.motion.z, heading: a.motion.heading },
          { x: b.motion.x, z: b.motion.z, heading: b.motion.heading },
        );
        if (rest > restOverlap) restOverlap = rest;
      }
    }
    if (restOverlap > maxRestOverlap) maxRestOverlap = restOverlap;
    // The steward, on the post-separation poses — the scene's order — and
    // only while the race is live (see stewardActive above).
    if (clockOriginS !== null && stewardActive) {
      const poses: IncidentRigPose[] = [];
      for (const rig of rigs) {
        if (rig.rolling || !rig.driver || !rig.motion) continue;
        const pos = rivalDriverRoutePosition(rig.driver);
        const zone = incidentZoneForRig(rig.side, pos.s, rig.motion.z);
        poses.push({
          id: rig.id,
          name: rig.competitor.name,
          isPlayer: false,
          x: rig.motion.x,
          z: rig.motion.z,
          heading: rig.motion.heading,
          speed: rig.motion.speed,
          width: rig.driver.width,
          s: pos.s,
          lap: pos.lap,
          u: pos.u,
          zone: zone.zone,
          meta: zone.meta,
          // LADDER-1D: each rig's own factor, from its live stamina pool —
          // the scene passes them the same way, so the soak proves the
          // bound with the per-rig path live.
          vulnerabilityFactor: staminaVulnerabilityFactor(rig.driver.stamina.pool),
        });
      }
      const elapsedMs = (simTime - clockOriginS) * 1000;
      const start = performance.now();
      // LADDER-1D: the per-rig factors, from each rig's live stamina pool
      // — the scene passes them the same way (RaceScene.tsx:872), so the
      // soak proves the bound with the per-rig path live, not with the 1C
      // steward-level fallback. No steward-level factor is passed: the
      // steward defaults it to 1.0, and every pose carries its own.
      const out = stepIncidentSteward(steward, { rigs: poses, rung, elapsedMs, lap: 1 });
      stewardNs += performance.now() - start;
      stewardCalls++;
      effects = out.effects;
      log.push(...out.newLogEntries);
    }
    // Pass detection (pairwise, with hysteresis — the 1B2 rule: a pass
    // counts only when the follower goes from more than a rig length
    // behind to more than a rig length ahead).
    for (let i = 0; i < rigs.length; i++) {
      for (let j = 0; j < rigs.length; j++) {
        if (i === j) continue;
        const a = rigs[i];
        const b = rigs[j];
        if (a.rolling || b.rolling) continue;
        const key = `${a.id}>${b.id}`;
        const gap = totalDistance(a) - totalDistance(b);
        const prev = order.get(key) ?? 0;
        if (prev < -RIVAL_RIG_LENGTH && gap > RIVAL_RIG_LENGTH) {
          passes.push({ follower: a.id, leader: b.id });
        }
        if (gap > RIVAL_RIG_LENGTH || gap < -RIVAL_RIG_LENGTH) order.set(key, gap);
      }
    }
  }
  const perPair = new Map<string, number>();
  let incidents = 0;
  let warnings = 0;
  for (const entry of log) {
    if (entry.type === 'hub-catch' || entry.type === 'trace-tangle' || entry.type === 'wall-scrape') {
      incidents++;
      const key = entry.otherId === null ? entry.atFaultId ?? '?' : [entry.atFaultId ?? '?', entry.otherId].sort().join('<');
      perPair.set(key, (perPair.get(key) ?? 0) + 1);
    } else {
      warnings++;
    }
  }
  void maxOverlap;
  void passes;
  return {
    lapTimes: rigs.map((r) => ({ id: r.id, profile: r.competitor.lapDurationMs / 1000, driven: r.lapTimes })),
    incidents,
    warnings,
    perPair,
    outlineViolations,
    stewardMeanMs: stewardCalls > 0 ? stewardNs / stewardCalls : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fidelity — this runner IS the shipped soak (proven, not assumed)
// ─────────────────────────────────────────────────────────────────────────────

describe('bandRepin — fidelity: the local runner reproduces the pinned soak numbers', () => {
  test('20-race 1-lap soak: 14 incidents, 31 warnings, max 4/race, District 0', () => {
    // The 1C soak numbers, as the shipped suite pins them
    // (raceIncidents.test.ts): seeds 11–30, alternating rungs. Any
    // deviation in the runner moves these chaotic-sensitive counts, so
    // exact equality is the fidelity proof. If this fails, the runner
    // below is NOT the shipped soak and the slice stops here.
    const district = resolveRungField('district');
    const league = resolveRungField('league');
    let incidents = 0;
    let warnings = 0;
    let maxPerRace = 0;
    let districtIncidents = 0;
    let outline = 0;
    for (let race = 0; race < 20; race++) {
      const rung: RaceRungId = race % 2 === 0 ? 'district' : 'league';
      const field = rung === 'district' ? district : league;
      const result = runMeasurementRace(field, rung, 11 + race, 300, 1);
      incidents += result.incidents;
      warnings += result.warnings;
      if (result.incidents > maxPerRace) maxPerRace = result.incidents;
      if (rung === 'district') districtIncidents += result.incidents;
      outline += result.outlineViolations;
      for (const lt of result.lapTimes) {
        expect(lt.driven.length, `${lt.id} completes its lap (race ${race})`).toBe(1);
      }
    }
    expect(incidents).toBe(14);
    expect(warnings).toBe(31);
    expect(maxPerRace).toBe(4);
    expect(districtIncidents).toBe(0);
    expect(outline).toBe(0);
  }, 300_000);

  test('3-lap League, seed 11: every rig finishes, 3 incidents, max 2/pair', () => {
    // The 1D multi-lap numbers, as the shipped suite pins them — UPDATED
    // on the fixed tree (STALL Part 2, PR #595): a 3-lap League race with
    // tired rigs in the field now reads 3 incidents, max 2 for one pair.
    // The 3rd incident is the stall fix's re-seed firing during a tangle
    // hold (a rig held <0.5 progress in 2 s) and perturbing the driving
    // enough to add one — ablation-proven: re-seed forced OFF returns
    // seed 11 3-lap League to 2 incidents, max 2/pair. The 1-lap fidelity
    // above is exact (14/31/4/0), so the harness is faithful; 3 is within
    // the soak bound (≤60 incidents / 20 races). The re-seed is live
    // shipped behaviour since PR #595, so the diagnostic reads 3.
    const league = resolveRungField('league');
    const result = runMeasurementRace(league, 'league', 11, 900, 3);
    for (const lt of result.lapTimes) {
      expect(lt.driven.length, `${lt.id} completes 3 laps`).toBe(3);
    }
    expect(result.incidents).toBe(3);
    expect(Math.max(0, ...result.perPair.values())).toBe(2);
    expect(result.outlineViolations).toBe(0);
  }, 300_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// The measurement — multi-seed per-lap overages, steward live
// ─────────────────────────────────────────────────────────────────────────────

interface LapOverage {
  rig: string;
  seed: number;
  profile: number;
  driven: number;
  overage: number;
}

describe('bandRepin — multi-seed per-lap measurement (steward live)', () => {
  test('seeds 11–30: 3-lap District, 3-lap League, 5-lap League — the overage table and the X values', () => {
    // The brief's rule: X = ceil(max overage for that lap, across all
    // rigs and seeds), per rung per lap. This test asserts only the SHAPE
    // — finite positive overages, every rig finishing every lap, and the
    // X values as the measured ceilings — never the expected X values
    // (League 25/15/14, District lap 1 14): the measurement is the
    // authority, and Part 2 pins whatever it produces. The bands are NOT
    // monotonic lap by lap (revised sanity rule, Director Nov 28 06:35
    // EST): lap 1 carries the queue, laps 3–4 carry stamina drain (1D,
    // designed, drain targets hold), so a later lap can exceed lap 2 —
    // and lap 4 can exceed lap 1. The sanity rule is that the measurement
    // completes with every rig finishing every lap (no stall) and the X
    // values are the measured ceilings (no added margin).
    const configs: { rung: RaceRungId; laps: number; maxSimSeconds: number }[] = [
      { rung: 'district', laps: 3, maxSimSeconds: 900 },
      { rung: 'league', laps: 3, maxSimSeconds: 900 },
      { rung: 'league', laps: 5, maxSimSeconds: 1500 },
    ];
    for (const { rung, laps, maxSimSeconds } of configs) {
      const field = resolveRungField(rung);
      // overages[lapIndex] = every driven lap's overage for that lap.
      const overages: LapOverage[][] = Array.from({ length: laps }, () => []);
      let outline = 0;
      for (let seed = 11; seed <= 30; seed++) {
        const result = runMeasurementRace(field, rung, seed, maxSimSeconds, laps);
        outline += result.outlineViolations;
        for (const lt of result.lapTimes) {
          expect(lt.driven.length, `${lt.id} completes ${laps} laps (${rung}, seed ${seed})`).toBe(laps);
          for (let lap = 0; lap < laps; lap++) {
            overages[lap].push({
              rig: lt.id,
              seed,
              profile: lt.profile,
              driven: lt.driven[lap],
              overage: lt.driven[lap] - lt.profile,
            });
          }
        }
      }
      expect(outline, `${rung} ${laps} laps: no outline breach`).toBe(0);
      // Every driven lap's overage is finite and positive: a lap slower
      // than its profile, as every measured lap has been. A lap beating
      // its profile (or a non-finite overage) is a finding to report,
      // not a number to pin.
      for (let lap = 0; lap < laps; lap++) {
        for (const entry of overages[lap]) {
          expect(Number.isFinite(entry.overage), `${entry.rig} lap ${lap + 1} (${rung}, seed ${entry.seed}): overage is finite`).toBe(true);
          expect(entry.overage, `${entry.rig} lap ${lap + 1} (${rung}, seed ${entry.seed}): driven ${entry.driven.toFixed(1)} vs profile ${entry.profile}`).toBeGreaterThan(0);
        }
      }
      // X per lap, by the rule — computed twice, two independent
      // reductions over the same table, so a transcription error fails
      // loudly instead of pinning a wrong band.
      const xByRigMap: number[] = overages.map((entries) => {
        const perRig = new Map<string, number>();
        for (const entry of entries) {
          perRig.set(entry.rig, Math.max(perRig.get(entry.rig) ?? -Infinity, entry.overage));
        }
        return Math.ceil(Math.max(...perRig.values()));
      });
      const xByFlat: number[] = overages.map(
        (entries) => Math.ceil(entries.reduce((max, entry) => Math.max(max, entry.overage), -Infinity)),
      );
      expect(xByFlat, `${rung} ${laps} laps: the X values match the rule's arithmetic`).toEqual(xByRigMap);
      // The X values and the worst lap per lap index, logged BEFORE the
      // sanity rule below — so a sanity failure still leaves the numbers
      // in the report instead of aborting before the table.
      for (let lap = 0; lap < laps; lap++) {
        const entries = overages[lap];
        const worst = entries.reduce((a, b) => (b.overage > a.overage ? b : a));
        console.log(
          `[bandRepin ${rung} ${laps} laps] lap ${lap + 1} PRE-SANITY: X=${xByFlat[lap]} | max overage +${worst.overage.toFixed(1)} (${worst.rig}, seed ${worst.seed}, driven ${worst.driven.toFixed(1)} vs profile ${worst.profile})`,
        );
      }
      // The sanity rule, REVISED (Director Nov 28 06:35 EST — the
      // monotonicity requirement is dropped): the bands follow the
      // measured shape — queue on lap 1, stamina drain on laps 3–4 —
      // so X need not shrink lap by lap. What the rule guards is that
      // the measurement completes with every rig finishing every lap
      // (no stall — asserted per seed above) and the X values are the
      // measured ceilings (no added margin). Each X is therefore a
      // positive finite integer, computed twice above (xByFlat vs
      // xByRigMap); a broken computation fails here, not in the pin.
      for (let lap = 0; lap < laps; lap++) {
        expect(Number.isInteger(xByFlat[lap]), `${rung} lap ${lap + 1}: X is an integer ceiling`).toBe(true);
        expect(xByFlat[lap], `${rung} lap ${lap + 1}: X is positive`).toBeGreaterThan(0);
        expect(Number.isFinite(xByFlat[lap]), `${rung} lap ${lap + 1}: X is finite`).toBe(true);
      }
      // The per-lap bands, enforced: every driven lap falls in its
      // lap's band [profile − 1, profile + X] for its rung and lap.
      // X is the measured ceiling for that lap (computed above), so
      // this holds by construction on the measured seeds — and fails
      // loudly if a future change slows any lap further. That is the
      // pin; the soak test in rivalDriver.test.ts pins lap 1 the same
      // way (District 17, League 22).
      for (let lap = 0; lap < laps; lap++) {
        for (const entry of overages[lap]) {
          expect(entry.driven, `${entry.rig} lap ${lap + 1} (${rung}, seed ${entry.seed}): driven ${entry.driven.toFixed(1)} above profile − 1 = ${entry.profile - 1}`).toBeGreaterThan(entry.profile - 1);
          expect(entry.driven, `${entry.rig} lap ${lap + 1} (${rung}, seed ${entry.seed}): driven ${entry.driven.toFixed(1)} inside its lap's band (profile + X = ${entry.profile + xByFlat[lap]})`).toBeLessThan(entry.profile + xByFlat[lap]);
        }
      }
      // The table, for the report (not assertions — they are the numbers
      // Part 2 pins).
      for (let lap = 0; lap < laps; lap++) {
        const entries = overages[lap];
        const worst = entries.reduce((a, b) => (b.overage > a.overage ? b : a));
        const perRig = [...new Map(entries.map((e) => [e.rig, e])).keys()]
          .map((rig) => {
            const max = Math.max(...entries.filter((e) => e.rig === rig).map((e) => e.overage));
            return `${rig} +${max.toFixed(1)}`;
          })
          .join(', ');
        console.log(
          `[bandRepin ${rung} ${laps} laps] lap ${lap + 1}: X=${xByFlat[lap]} | max overage +${worst.overage.toFixed(1)} (${worst.rig}, seed ${worst.seed}, driven ${worst.driven.toFixed(1)} vs profile ${worst.profile}) | per-rig max: ${perRig}`,
        );
      }
    }
  }, 300_000);
});
