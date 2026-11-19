/**
 * LADDER-1B — the rolling-start formation, the roll paths, the clock origin,
 * the Clean Start rework's time bases, and the rung entry. Pure tests only:
 * the scene's wiring (the clock origin, the N mounts, the formation camera)
 * is pinned by the phaseC8_70bStage1 guards, not here.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CIRCUS_AXIS_X } from './collisionShapes';
import { CIRCUS_RACE_START } from './circusDistrictGeometry';
import {
  CHARIOT_MOVEMENT,
  createChariotLaunchState,
  launchAccelScale,
  trackChariotLaunch,
} from './chariotMovement';
import {
  FORMATION_FRONT_ROW_Z,
  FORMATION_ROW_GAP,
  FORMATION_ROLL_SPEED,
  FORMATION_WEST_FLANK_X,
  FORMATION_EAST_FLANK_X,
  GRID_RIG_LENGTH,
  SPINA_TIP_BOX,
  getRollPathPoseAtDistance,
  resolveFormationFit,
  resolveFormationRoll,
  resolveFormationSlots,
  resolveRollClockOriginMs,
  resolveRollPathClearance,
  resolveRollPhase,
} from './raceGrid';
import { RACE_LANE_OFFSET, getRaceRivalSpeed } from './raceRival';
import { resolveRaceRungId, resolveRungField } from './raceCompetitors';
import { advanceRaceLap, createRaceLapTracker, RACE_FINISH_LINE_Z, RACE_NORTH_TURN_Z, RACE_SOUTH_TURN_Z } from './raceLap';

const WEST_FLANK: readonly [number, number] = [43.94, 51.5];
const EAST_FLANK: readonly [number, number] = [53.18, 60.74];

describe('LADDER-1B — the formation', () => {
  test('District forms 3 rigs in 2 rows, League 5 rigs in 3 rows, player last', () => {
    const district = resolveFormationSlots(3);
    expect(district).toHaveLength(3);
    expect(district.map((slot) => slot.row)).toEqual([0, 0, 1]);
    expect(district[2].occupant).toBe('player');
    const league = resolveFormationSlots(5);
    expect(league).toHaveLength(5);
    expect(league.map((slot) => slot.row)).toEqual([0, 0, 1, 1, 2]);
    expect(league[4].occupant).toBe('player');
  });

  test('every slot stands on a flank column, never on the axis north of the spina tip', () => {
    for (const fieldSize of [3, 5]) {
      for (const slot of resolveFormationSlots(fieldSize)) {
        const [min, max] = slot.side === -1 ? WEST_FLANK : EAST_FLANK;
        expect(slot.x).toBeGreaterThanOrEqual(min);
        expect(slot.x).toBeLessThanOrEqual(max);
        // The flank centres, not the axis slots: the spina occupies the axis
        // north of its tip (38.72), so no formation slot may stand on it.
        expect(Math.abs(slot.x - CIRCUS_AXIS_X)).toBeGreaterThan(4);
      }
    }
    expect(FORMATION_WEST_FLANK_X).toBeCloseTo(47.72, 2);
    expect(FORMATION_EAST_FLANK_X).toBeCloseTo(56.96, 2);
  });

  test('rows are one formation row gap apart, front row nearest the line', () => {
    // LADDER-1B deviation, stated: the formation row gap is 7.5, not the
    // standing grid's 4.0 — the roll catch-up (see FORMATION_ROW_GAP) needs
    // it, or the back rig's nose is inside the front rig's tub at its
    // crossing. The formation still mirrors the grid's assignment.
    expect(FORMATION_ROW_GAP).toBe(7.5);
    for (const fieldSize of [3, 5]) {
      const slots = resolveFormationSlots(fieldSize);
      const byRow = new Map<number, number>();
      for (const slot of slots) byRow.set(slot.row, slot.z);
      const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]);
      expect(rows[0][1]).toBe(FORMATION_FRONT_ROW_Z);
      for (let i = 1; i < rows.length; i += 1) {
        expect(rows[i - 1][1] - rows[i][1]).toBeCloseTo(FORMATION_ROW_GAP, 8);
      }
      // The front row is nearest the line (the largest z); rows run north.
      expect(Math.max(...slots.map((slot) => slot.z))).toBe(FORMATION_FRONT_ROW_Z);
    }
  });

  test('the formation fits the straight for both rungs', () => {
    for (const fieldSize of [3, 5]) {
      const fit = resolveFormationFit(fieldSize);
      expect(fit.fits).toBe(true);
      // The whole formation stands south of the north-turn checkpoint, on
      // the 64.5-unit straight: front row 24, League last row 9.0.
      expect(fit.lastRowZ).toBeGreaterThan(RACE_NORTH_TURN_Z);
      expect(fit.frontRowZ - fit.lastRowZ).toBeCloseTo((fit.rows - 1) * FORMATION_ROW_GAP, 8);
    }
    expect(resolveFormationFit(5).lastRowZ).toBeCloseTo(9, 8);
  });

  test('a malformed field size fails closed to a single front-row slot', () => {
    expect(resolveFormationSlots(0)).toHaveLength(1);
    expect(resolveFormationSlots('league')).toHaveLength(1);
    expect(resolveFormationSlots(3)[0].z).toBe(FORMATION_FRONT_ROW_Z);
  });
});

describe('LADDER-1B — the roll paths', () => {
  test('every roll path ends on the shipped route start pose, heading north', () => {
    for (const fieldSize of [3, 5]) {
      const roll = resolveFormationRoll(fieldSize);
      for (const path of roll.paths) {
        const slot = roll.slots[path.slot];
        const end = getRollPathPoseAtDistance(path, path.length);
        expect(end.x).toBeCloseTo(CIRCUS_AXIS_X + slot.side * RACE_LANE_OFFSET, 8);
        expect(end.z).toBe(CIRCUS_RACE_START.z);
        // The handoff heading: within 7.3° of north (measured 0.127 rad) —
        // the race phase takes over from exactly the pose the shipped route
        // starts from, with no snap.
        expect(Math.abs(end.heading)).toBeLessThanOrEqual(0.15);
        expect(slot.endX).toBeCloseTo(end.x, 8);
        expect(slot.endZ).toBe(CIRCUS_RACE_START.z);
      }
    }
  });

  test('no probe leaves the driveable outline at any sample', () => {
    for (const fieldSize of [3, 5]) {
      const roll = resolveFormationRoll(fieldSize);
      for (const path of roll.paths) {
        const clearance = resolveRollPathClearance(path);
        expect(clearance.allProbesInside).toBe(true);
        // Measured min probe margin 0.150 (the body at the line, the shipped
        // line position's own margin); the test asserts it stays positive.
        expect(clearance.minProbeMargin).toBeGreaterThan(0.1);
      }
    }
  });

  test('no path crosses the line northbound before the clock starts', () => {
    for (const fieldSize of [3, 5]) {
      const roll = resolveFormationRoll(fieldSize);
      for (const path of roll.paths) {
        const clearance = resolveRollPathClearance(path);
        // The only southbound excursion is the turn's bounded dip: measured
        // max z 42.510, 0.010 past the line. The northbound crossing at the
        // path's end is the first (and only) northbound crossing — the clock
        // start — so no earlier sample is north of the line heading north.
        expect(clearance.maxZ).toBeLessThanOrEqual(42.6);
        expect(clearance.maxZ).toBeGreaterThan(CIRCUS_RACE_START.z);
        // Every sample before the last is south of the line or on it; the
        // path approaches the line from the south only at its end.
        const beforeEnd = path.points.slice(0, -1);
        expect(Math.max(...beforeEnd.map((point) => point.z))).toBeLessThanOrEqual(42.6);
      }
    }
  });

  test('no two rigs come within the rig length during the roll', () => {
    // The collision distance asserted is the rig length (3.05, nose to tub):
    // two rigs closer than that on the same line overlap. Measured min
    // separation while both rigs are still rolling is 6.501.
    for (const fieldSize of [3, 5]) {
      const roll = resolveFormationRoll(fieldSize);
      let minSeparation = Infinity;
      for (let ms = 0; ms <= roll.playerCrossingMs; ms += 50) {
        const poses = roll.paths.map((path) => ({
          pose: getRollPathPoseAtDistance(path, (FORMATION_ROLL_SPEED * ms) / 1000),
          crossed: ms >= path.crossingMs,
        }));
        for (let a = 0; a < poses.length; a += 1) {
          for (let b = a + 1; b < poses.length; b += 1) {
            if (poses[a].crossed || poses[b].crossed) continue;
            const distance = Math.hypot(
              poses[a].pose.x - poses[b].pose.x,
              poses[a].pose.z - poses[b].pose.z,
            );
            minSeparation = Math.min(minSeparation, distance);
          }
        }
      }
      expect(minSeparation).toBeGreaterThan(GRID_RIG_LENGTH);
      expect(minSeparation).toBeGreaterThan(6);
    }
  });

  test('at each back rig crossing, the flank-mate ahead is clear by more than a rig length', () => {
    // The front rig crosses first and drops to its shipped race pace while
    // the back rig is still rolling at 5 u/s; the gap at the back rig's
    // crossing is (front pace) × (row gap / roll speed). Worst case is the
    // District player behind Servius (2.39 u/s): measured 3.58, 0.53 clear
    // of the 3.05 rig length. This is what the 7.5 formation row gap buys.
    for (const [rung, fieldSize] of [['district', 3], ['league', 5]] as const) {
      const roll = resolveFormationRoll(fieldSize);
      const field = resolveRungField(rung);
      for (let s = 1; s < roll.paths.length; s += 1) {
        const slot = roll.slots[s];
        const ahead = roll.slots.find(
          (candidate) => candidate.side === slot.side && candidate.row === slot.row - 1,
        );
        if (!ahead) continue;
        const aheadRivalIndex = roll.rivalSlots.indexOf(ahead.slot);
        const aheadRival = field[aheadRivalIndex];
        const speed = getRaceRivalSpeed({
          lapDurationMs: aheadRival.lapDurationMs,
          startSide: ahead.side,
        });
        const gapMs = roll.paths[s].crossingMs - roll.paths[ahead.slot].crossingMs;
        const gapUnits = (speed * gapMs) / 1000;
        expect(gapUnits).toBeGreaterThan(GRID_RIG_LENGTH);
      }
    }
  });

  test('every roll path clears the spina tip box with margin', () => {
    for (const fieldSize of [3, 5]) {
      const roll = resolveFormationRoll(fieldSize);
      for (const path of roll.paths) {
        const clearance = resolveRollPathClearance(path);
        // Measured min tip clearance 3.78 (the west flank centre is 3.78
        // west of the tip's west face); the test asserts at least 3.
        expect(clearance.minTipClearance).toBeGreaterThan(3);
        for (const point of path.points) {
          const insideTipBox = point.x >= SPINA_TIP_BOX.xMin
            && point.x <= SPINA_TIP_BOX.xMax
            && point.z >= SPINA_TIP_BOX.zMin
            && point.z <= SPINA_TIP_BOX.zMax;
          expect(insideTipBox).toBe(false);
        }
      }
    }
  });

  test('the roll phase reports rolling, then racing from the rig own crossing', () => {
    const roll = resolveFormationRoll(3);
    const playerPath = roll.paths[roll.playerSlot];
    const rolling = resolveRollPhase(playerPath, 1000);
    expect(rolling.rolling).toBe(true);
    expect(rolling.rollDistance).toBeCloseTo(FORMATION_ROLL_SPEED * 1, 8);
    expect(rolling.raceElapsedMs).toBe(0);
    const racing = resolveRollPhase(playerPath, playerPath.crossingMs + 500);
    expect(racing.rolling).toBe(false);
    expect(racing.raceElapsedMs).toBeCloseTo(500, 8);
  });
});

describe('LADDER-1B — the clock origin', () => {
  test('the race clock starts at the leader crossing, not at GO', () => {
    for (const fieldSize of [3, 5]) {
      const roll = resolveFormationRoll(fieldSize);
      // The leader is the front row: the shortest path, the first crossing.
      const frontRowCrossing = Math.min(
        ...roll.paths.filter((path) => roll.slots[path.slot].row === 0).map((path) => path.crossingMs),
      );
      expect(roll.leaderCrossingMs).toBeCloseTo(frontRowCrossing, 8);
      expect(resolveRollClockOriginMs(10000, roll.leaderCrossingMs)).toBeCloseTo(
        10000 + roll.leaderCrossingMs,
        8,
      );
      // The player's crossing is later: District 1.50 s, League 3.00 s.
      expect(roll.playerCrossingMs).toBeGreaterThan(roll.leaderCrossingMs);
    }
    const district = resolveFormationRoll(3);
    expect((district.playerCrossingMs - district.leaderCrossingMs) / 1000).toBeCloseTo(1.5, 2);
    const league = resolveFormationRoll(5);
    expect((league.playerCrossingMs - league.leaderCrossingMs) / 1000).toBeCloseTo(3, 2);
    // The roll duration the brief asks the slice to report: the League
    // player crosses ~7.08 s after GO at the 5 u/s parade pace.
    expect(league.playerCrossingMs / 1000).toBeCloseTo(7.08, 2);
  });
});

describe('LADDER-1B — the lap, via the unmodified tracker', () => {
  test('the tracker created at the crossing does not finish on the northward departure', () => {
    const tracker = createRaceLapTracker(RACE_FINISH_LINE_Z);
    // The roll ends at the line heading north; the race departs north. The
    // northward crossing cannot fire crossedFinish (it requires lastZ <
    // 42.5 and z >= 42.5) — the tracker must stay unfinished.
    let current = tracker;
    for (let z = 42.5; z >= 30; z -= 1) {
      const update = advanceRaceLap(current, { x: CIRCUS_AXIS_X + RACE_LANE_OFFSET, z });
      current = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
    expect(current.finished).toBe(false);
  });

  test('a full lap completes on the first southward crossing after the south turn', () => {
    let tracker = createRaceLapTracker(RACE_FINISH_LINE_Z);
    const eastX = CIRCUS_AXIS_X + RACE_LANE_OFFSET;
    const westX = CIRCUS_AXIS_X - RACE_LANE_OFFSET;
    const feed = (x: number, z: number) => {
      const update = advanceRaceLap(tracker, { x, z });
      tracker = update.tracker;
      return update.finishedNow;
    };
    // North up the east lane to the north turn, changing to the west lane there.
    for (let z = 42.5; z >= RACE_NORTH_TURN_Z; z -= 1) feed(eastX, z);
    expect(feed(westX, RACE_NORTH_TURN_Z - 1)).toBe(false);
    expect(tracker.northTurnCompleted).toBe(true);
    // South down the west lane to the south turn, changing back east there.
    for (let z = RACE_NORTH_TURN_Z; z <= RACE_SOUTH_TURN_Z; z += 1) feed(westX, z);
    expect(feed(eastX, RACE_SOUTH_TURN_Z)).toBe(false);
    expect(tracker.southTurnCompleted).toBe(true);
    // South across the line: the lap completes.
    expect(feed(eastX, RACE_FINISH_LINE_Z + 0.1)).toBe(true);
    expect(tracker.finished).toBe(true);
  });
});

describe('LADDER-1B — Clean Start, reworked to the crossing', () => {
  const launch = CHARIOT_MOVEMENT.launch;

  test('release inside the window after the leader crossing boosts', () => {
    // The window is measured from the LEADER's crossing (the clock origin),
    // not from GO: the player revs during the roll, releases 200 ms after
    // the leader crosses, and the launch is clean.
    const state = createChariotLaunchState();
    trackChariotLaunch(state, 1, false, 0);
    expect(state.revved).toBe(true);
    trackChariotLaunch(state, 0, true, 200);
    expect(state.quality).toBe('clean');
    // The boost runs from the PLAYER's own crossing, not the leader's: at
    // 1000 ms after the player's crossing it is still 1.35×.
    expect(launchAccelScale(state, 1000)).toBe(launch.cleanBoost);
    expect(launchAccelScale(state, launch.cleanDurationMs + 1)).toBe(1);
  });

  test('holding through the window after the leader crossing bogs', () => {
    const state = createChariotLaunchState();
    trackChariotLaunch(state, 1, false, 0);
    trackChariotLaunch(state, 1, true, launch.releaseWindowMs + 1);
    expect(state.quality).toBe('bogged');
    expect(launchAccelScale(state, 500)).toBe(launch.boggedFactor);
    expect(launchAccelScale(state, launch.boggedDurationMs + 1)).toBe(1);
  });

  test('the shipped launch constants are the values tested', () => {
    expect(launch.revThreshold).toBe(0.5);
    expect(launch.releaseWindowMs).toBe(300);
    expect(launch.cleanBoost).toBe(1.35);
    expect(launch.cleanDurationMs).toBe(1200);
    expect(launch.boggedFactor).toBe(0.5);
    expect(launch.boggedDurationMs).toBe(1200);
  });

  test('no rev built during the roll means no launch', () => {
    const state = createChariotLaunchState();
    trackChariotLaunch(state, 0, false, 0);
    trackChariotLaunch(state, 0, true, 100);
    expect(state.quality).toBe('none');
    expect(launchAccelScale(state, 100)).toBe(1);
  });
});

describe('LADDER-1B — entry', () => {
  test('an unknown rung fails closed to District', () => {
    expect(resolveRaceRungId('championship')).toBe('district');
    expect(resolveRaceRungId(undefined)).toBe('district');
    expect(resolveRaceRungId(null)).toBe('district');
    expect(resolveRaceRungId('league')).toBe('league');
    expect(resolveRungField('championship')).toHaveLength(2);
    expect(resolveRungField('league')).toHaveLength(4);
  });
});
