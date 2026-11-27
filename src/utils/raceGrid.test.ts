// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import {
  LEAGUE_POOL,
  RACE_COMPETITORS,
  ROOKIE_POOL,
  resolveRungField,
} from './raceCompetitors';
import {
  GRID_FRONT_ROW_Z,
  GRID_QUADRA_WIDTH,
  GRID_RIG_LENGTH,
  GRID_ROW_GAP,
  GRID_SAND_SOUTH_EDGE_Z,
  GRID_SLOT_LATERAL_SPACING,
  formatRacePlace,
  resolveFormationRoll,
  resolveGridFit,
  resolveGridSlots,
  resolveQualifyingSlot,
  resolveRungLockState,
  resolveStartGrid,
} from './raceGrid';
import { settleRaceCompletion } from './raceRecords';
import { CIRCUS_AXIS_X } from './collisionShapes';

/**
 * LADDER-1A — the staggered start grid, the ladder pools, and the rung lock
 * state. The grid math is pinned from CIRCUS_RACE_START; the fit section pins
 * the finding that the shipped line leaves only 1.3 units behind it, so a
 * multi-row field does not fit on the sand (see raceGrid.ts's header).
 */

describe('LADDER-1A §A — the grid is two-abreast, Quadra-wide, behind the line', () => {
  test('a 5-rig field is three rows of two, front row at the line, rows further south', () => {
    const slots = resolveGridSlots(5);
    expect(slots).toHaveLength(5);
    expect(slots.map((slot) => slot.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(slots.map((slot) => slot.row)).toEqual([0, 0, 1, 1, 2]);
    expect(slots.map((slot) => slot.side)).toEqual([-1, 1, -1, 1, -1]);
    expect(slots[0].z).toBe(GRID_FRONT_ROW_Z);
    expect(slots[0].z).toBe(42.5);
    expect(slots[2].z).toBe(GRID_FRONT_ROW_Z + GRID_ROW_GAP);
    expect(slots[4].z).toBe(GRID_FRONT_ROW_Z + 2 * GRID_ROW_GAP);
    for (const slot of slots) expect(slot.z).toBeGreaterThanOrEqual(GRID_FRONT_ROW_Z);
  });

  test('lateral spacing clears a Quadra rig with air, on the axis, inside the sand', () => {
    expect(GRID_QUADRA_WIDTH).toBeCloseTo(2.94, 9);
    expect(GRID_SLOT_LATERAL_SPACING).toBeCloseTo(3.5, 9);
    expect(GRID_SLOT_LATERAL_SPACING - GRID_QUADRA_WIDTH).toBeCloseTo(0.56, 9);
    const slots = resolveGridSlots(5);
    for (let row = 0; row < 3; row += 1) {
      const pair = slots.filter((slot) => slot.row === row);
      if (pair.length === 2) {
        expect(pair[1].x - pair[0].x).toBeCloseTo(GRID_SLOT_LATERAL_SPACING, 9);
        // Symmetric about the axis: the two slots straddle it.
        expect((pair[0].x + pair[1].x) / 2).toBeCloseTo(CIRCUS_AXIS_X, 9);
      }
    }
    // Every rig sits inside the sand (X 43.94…60.74), not on a flank lane.
    for (const slot of slots) {
      expect(slot.x - GRID_QUADRA_WIDTH / 2).toBeGreaterThanOrEqual(43.94);
      expect(slot.x + GRID_QUADRA_WIDTH / 2).toBeLessThanOrEqual(60.74);
    }
  });

  test('the row gap clears a rig: horse nose to tub rear, plus air', () => {
    expect(GRID_RIG_LENGTH).toBeCloseTo(3.05, 9);
    expect(GRID_ROW_GAP).toBeGreaterThan(GRID_RIG_LENGTH);
    expect(GRID_ROW_GAP - GRID_RIG_LENGTH).toBeCloseTo(0.95, 9);
  });

  test('malformed field sizes fail closed to a single front-row slot', () => {
    for (const size of [0, -2, 1.5, Number.NaN, undefined, null, '5']) {
      const slots = resolveGridSlots(size);
      expect(slots).toHaveLength(1);
      expect(slots[0].slot).toBe(0);
      expect(slots[0].z).toBe(GRID_FRONT_ROW_Z);
    }
  });
});

describe('LADDER-1A §B — assignment: the player starts last, the first rival takes its flank', () => {
  test('startSide +1 puts the first rival on slot 1, the player last', () => {
    const grid = resolveStartGrid(3, 1);
    expect(grid.playerSlot).toBe(2);
    expect(grid.rivalSlots).toEqual([1, 0]);
    expect(grid.slots[1].side).toBe(1);
    expect(grid.slots[grid.playerSlot].occupant).toBe('player');
    expect(grid.slots.filter((slot) => slot.occupant === 'rival')).toHaveLength(2);
  });

  test('startSide −1 puts the first rival on slot 0, the player last', () => {
    const grid = resolveStartGrid(3, -1);
    expect(grid.playerSlot).toBe(2);
    expect(grid.rivalSlots).toEqual([0, 1]);
    expect(grid.slots[0].side).toBe(-1);
  });

  test('a League field fills front to back: player last on row 2', () => {
    const grid = resolveStartGrid(5, 1);
    expect(grid.playerSlot).toBe(4);
    expect(grid.rivalSlots).toEqual([1, 0, 2, 3]);
    expect(grid.slots[4].row).toBe(2);
  });

  test('a 2-rig field cannot honour both rules: the player keeps the last slot, the rival falls back', () => {
    for (const side of [1, -1] as const) {
      const grid = resolveStartGrid(2, side);
      expect(grid.playerSlot).toBe(1);
      expect(grid.rivalSlots).toEqual([0]);
    }
  });
});

describe('LADDER-1A §C — the fit: the shipped line leaves 1.3 units behind it', () => {
  test('the sand behind the line is exactly 1.3 units', () => {
    expect(GRID_SAND_SOUTH_EDGE_Z).toBe(43.8);
    expect(GRID_SAND_SOUTH_EDGE_Z - GRID_FRONT_ROW_Z).toBeCloseTo(1.3, 9);
  });

  test('a District field (3 rigs, 2 rows) does not fit: last row lands past the sand', () => {
    const fit = resolveGridFit(3);
    expect(fit.rows).toBe(2);
    expect(fit.requiredDepth).toBe(GRID_ROW_GAP);
    expect(fit.availableDepth).toBeCloseTo(1.3, 9);
    expect(fit.fits).toBe(false);
    expect(fit.lastRowZ).toBe(46.5);
    expect(fit.lastRowInsideSand).toBe(false);
  });

  test('a League field (5 rigs, 3 rows) does not fit either', () => {
    const fit = resolveGridFit(5);
    expect(fit.rows).toBe(3);
    expect(fit.requiredDepth).toBe(2 * GRID_ROW_GAP);
    expect(fit.fits).toBe(false);
    expect(fit.lastRowZ).toBe(50.5);
    expect(fit.lastRowInsideSand).toBe(false);
  });

  test('a single-row field fits — that is the shipped 1v1', () => {
    const fit = resolveGridFit(2);
    expect(fit.rows).toBe(1);
    expect(fit.requiredDepth).toBe(0);
    expect(fit.fits).toBe(true);
    expect(fit.lastRowInsideSand).toBe(true);
  });

  test('the placed grid carries its fit with it', () => {
    expect(resolveStartGrid(3, 1).fit.fits).toBe(false);
    expect(resolveStartGrid(5, 1).fit.fits).toBe(false);
    expect(resolveStartGrid(2, 1).fit.fits).toBe(true);
  });
});

describe('LADDER-1A §D — the pools: District draws rookies, League draws its pool', () => {
  test('the shipped 1v1 ladder is untouched: exactly the three rivals, in order', () => {
    expect(RACE_COMPETITORS.map((rival) => rival.id)).toEqual([
      'russata_rookie', 'veneta_veteran', 'albata_champion',
    ]);
    expect(RACE_COMPETITORS.map((rival) => rival.lapDurationMs)).toEqual([64000, 61000, 58000]);
  });

  test('the rookie pool is three rookies, fastest first, and the District field is two of them', () => {
    expect(ROOKIE_POOL.map((rival) => rival.id)).toEqual([
      'russata_rookie', 'servius_veneta_rookie', 'manius_prasina_rookie',
    ]);
    expect(ROOKIE_POOL.map((rival) => rival.lapDurationMs)).toEqual([64000, 66000, 67000]);
    const field = resolveRungField('district');
    expect(field).toHaveLength(2);
    expect(field.every((rival) => ROOKIE_POOL.includes(rival))).toBe(true);
  });

  test('the new rookies follow the faction pattern, slower than the veteran', () => {
    const servius = ROOKIE_POOL.find((rival) => rival.id === 'servius_veneta_rookie');
    expect(servius?.name).toBe('Servius of the Veneta');
    expect(servius?.faction).toBe('Veneta · Blue');
    expect(servius?.finish).toBe('charred');
    const manius = ROOKIE_POOL.find((rival) => rival.id === 'manius_prasina_rookie');
    expect(manius?.name).toBe('Manius of the Prasina');
    expect(manius?.faction).toBe('Prasina · Green');
    expect(manius?.lapDurationMs).toBe(67000);
    expect(manius?.finish).toBe('stock');
    for (const rookie of ROOKIE_POOL) expect(rookie.lapDurationMs).toBeGreaterThan(61000);
  });

  test('the League pool is five, fastest first, and the League field is four of them', () => {
    expect(LEAGUE_POOL.map((rival) => rival.id)).toEqual([
      'albata_champion', 'appius_albata', 'tiberius_russata', 'veneta_veteran', 'spurius_prasina',
    ]);
    expect(LEAGUE_POOL.map((rival) => rival.lapDurationMs)).toEqual([58000, 59000, 60000, 61000, 62000]);
    const field = resolveRungField('league');
    expect(field).toHaveLength(4);
    expect(field.every((rival) => LEAGUE_POOL.includes(rival))).toBe(true);
  });

  test('the new League rivals fill the 58–62s band, one per empty stable seat', () => {
    const appius = LEAGUE_POOL.find((rival) => rival.id === 'appius_albata');
    expect(appius?.name).toBe('Appius of the Albata');
    expect(appius?.faction).toBe('Albata · White');
    expect(appius?.finish).toBe('triumph');
    const tiberius = LEAGUE_POOL.find((rival) => rival.id === 'tiberius_russata');
    expect(tiberius?.name).toBe('Tiberius of the Russata');
    expect(tiberius?.lapDurationMs).toBe(60000);
    const spurius = LEAGUE_POOL.find((rival) => rival.id === 'spurius_prasina');
    expect(spurius?.name).toBe('Spurius of the Prasina');
    expect(spurius?.lapDurationMs).toBe(62000);
  });

  test('the rungs never overlap in speed, and every stable has two aurigae', () => {
    const fastestRookie = Math.min(...ROOKIE_POOL.map((rival) => rival.lapDurationMs));
    const slowestLeague = Math.max(...LEAGUE_POOL.map((rival) => rival.lapDurationMs));
    expect(slowestLeague).toBeLessThan(fastestRookie);
    const all = [...ROOKIE_POOL, ...LEAGUE_POOL];
    expect(new Set(all.map((rival) => rival.id)).size).toBe(all.length);
    for (const faction of ['Russata · Red', 'Veneta · Blue', 'Albata · White', 'Prasina · Green']) {
      expect(all.filter((rival) => rival.faction === faction).length).toBeGreaterThanOrEqual(2);
    }
    const finishes = new Set(['stock', 'charred', 'gilded', 'oxblood', 'triumph', 'ventive']);
    expect(all.every((rival) => finishes.has(rival.finish))).toBe(true);
    expect(Object.isFrozen(ROOKIE_POOL)).toBe(true);
    expect(Object.isFrozen(LEAGUE_POOL)).toBe(true);
    for (const rival of all) expect(Object.isFrozen(rival)).toBe(true);
  });

  test('an unknown rung fails closed to the District field', () => {
    expect(resolveRungField('championship')).toEqual(resolveRungField('district'));
    expect(resolveRungField(undefined)).toEqual(resolveRungField('district'));
  });
});

describe('LADDER-1A §E — the lock state: District open, League locked until a District top-2', () => {
  test('a fresh profile sees District open and League locked', () => {
    const state = resolveRungLockState(createNewProfile('Ladder Racer'));
    expect(state.districtOpen).toBe(true);
    expect(state.leagueOpen).toBe(false);
    expect(state.leagueRequirement).toBe('Top-2 finish in a District race');
  });

  test('a District top-2 opens the League; a top-3 or worse does not', () => {
    const withResult = (bestFinish: unknown): PlayerProfile => ({
      ...createNewProfile('Ladder Racer'),
      racing: { districtBestFinish: bestFinish },
    } as unknown as PlayerProfile);
    expect(resolveRungLockState(withResult(1)).leagueOpen).toBe(true);
    expect(resolveRungLockState(withResult(2)).leagueOpen).toBe(true);
    expect(resolveRungLockState(withResult(3)).leagueOpen).toBe(false);
    expect(resolveRungLockState(withResult('first')).leagueOpen).toBe(false);
    expect(resolveRungLockState(withResult(undefined)).leagueOpen).toBe(false);
  });

  test('a real settleRaceCompletion District top-2 opens the League; a 3rd+ does not', () => {
    // LADDER-1E — the lock test becomes meaningful: the write, not a
    // hand-built field, is what opens the rung.
    const topTwo = settleRaceCompletion(createNewProfile('Ladder Racer'), 2, 15000, 'defeat', 1, 'district', 2);
    expect(topTwo.ok).toBe(true);
    if (!topTwo.ok) return;
    expect(resolveRungLockState(topTwo.profile).leagueOpen).toBe(true);
    const third = settleRaceCompletion(createNewProfile('Ladder Racer'), 2, 15000, 'defeat', 1, 'district', 3);
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(resolveRungLockState(third.profile).leagueOpen).toBe(false);
    // …and a League finish never re-locks the rung it opened.
    const league = settleRaceCompletion(topTwo.profile, 2, 14000, 'defeat', 2, 'league', 4);
    expect(league.ok).toBe(true);
    if (!league.ok) return;
    expect(resolveRungLockState(league.profile).leagueOpen).toBe(true);
    expect(league.profile.racing?.leagueBestFinish).toBe(4);
  });

  test('a missing or malformed profile never throws, and stays locked', () => {
    for (const profile of [null, undefined]) {
      const state = resolveRungLockState(profile);
      expect(state.districtOpen).toBe(true);
      expect(state.leagueOpen).toBe(false);
    }
  });
});

describe('LADDER-1E Part 5 §G — qualifying: the best finish earns the grid slot', () => {
  test('1st → front row, 2nd → second row, 3rd → third row, on the left flank', () => {
    // A 5-rig League field has three rows; the player takes the LEFT slot
    // of the earned row — the flank the player stands on today in both
    // shipped field sizes — so qualifying moves the ROW, never the flank.
    expect(resolveQualifyingSlot(1, 5)).toBe(0);
    expect(resolveQualifyingSlot(2, 5)).toBe(2);
    expect(resolveQualifyingSlot(3, 5)).toBe(4);
    expect(resolveStartGrid(5, 1, resolveQualifyingSlot(1, 5)).slots[0].side).toBe(-1);
    expect(resolveStartGrid(5, 1, resolveQualifyingSlot(2, 5)).slots[2].side).toBe(-1);
    expect(resolveStartGrid(5, 1, resolveQualifyingSlot(3, 5)).slots[4].side).toBe(-1);
    // A 3-rig District field has two rows: 1st is the front row, 2nd the last.
    expect(resolveQualifyingSlot(1, 3)).toBe(0);
    expect(resolveQualifyingSlot(2, 3)).toBe(2);
  });

  test('no best finish — or a malformed one — defaults to the last slot, exactly as today', () => {
    for (const bestFinish of [undefined, null, 0, -1, 1.5, Number.NaN, 'first', {}, []]) {
      expect(resolveQualifyingSlot(bestFinish, 5)).toBe(4);
      expect(resolveQualifyingSlot(bestFinish, 3)).toBe(2);
    }
    // The default is the grid's own default: an omitted player slot.
    expect(resolveStartGrid(5, 1).playerSlot).toBe(4);
    expect(resolveStartGrid(3, 1).playerSlot).toBe(2);
  });

  test('a finish deeper than the field has rows clamps to the last row', () => {
    // A 3-rig field has two rows: a 3rd-place finish and no finish both
    // stand last. A 5-rig field has three rows: 4th and 5th clamp to it.
    expect(resolveQualifyingSlot(3, 3)).toBe(2);
    expect(resolveQualifyingSlot(9, 3)).toBe(2);
    expect(resolveQualifyingSlot(4, 5)).toBe(4);
    expect(resolveQualifyingSlot(5, 5)).toBe(4);
    expect(resolveQualifyingSlot(99, 5)).toBe(4);
  });

  test('the grid takes the qualifying slot as an input: the player stands there, the rivals fill the rest', () => {
    const grid = resolveStartGrid(5, 1, 0);
    expect(grid.playerSlot).toBe(0);
    expect(grid.slots[0].occupant).toBe('player');
    // The first rival still takes the front-row slot on its flank when it
    // is free — here slot 1, the front-right — and the rest fill front
    // to back around the player.
    expect(grid.rivalSlots).toEqual([1, 2, 3, 4]);
    expect(grid.slots.filter((slot) => slot.occupant === 'rival')).toHaveLength(4);
    // A malformed slot fails closed to last, never out of the field.
    for (const slot of [undefined, null, -1, 5, 1.5, Number.NaN, 'first']) {
      expect(resolveStartGrid(5, 1, slot).playerSlot).toBe(4);
    }
    // The 2-rig fallback still holds when the player earned the front
    // row: the rival takes the other front slot.
    expect(resolveStartGrid(2, 1, 0).playerSlot).toBe(0);
    expect(resolveStartGrid(2, 1, 0).rivalSlots).toEqual([1]);
  });

  test('the roll paths are unchanged by qualifying: the path is per-slot, not per-occupant', () => {
    // The same field, the player qualified front row vs the default last:
    // every slot's path is identical — qualifying changes WHO rolls which
    // path, never the paths themselves. The player's crossing moves with
    // the slot (front row crosses first), and the leader's crossing — the
    // clock origin — does not move at all.
    const qualified = resolveFormationRoll(5, 1, 0);
    const def = resolveFormationRoll(5, 1);
    expect(qualified.paths).toEqual(def.paths);
    expect(qualified.slots).toEqual(def.slots.map((slot) => ({
      ...slot,
      occupant: slot.slot === 0 ? 'player' : slot.slot === 4 ? 'rival' : slot.occupant,
    })));
    expect(qualified.playerSlot).toBe(0);
    expect(def.playerSlot).toBe(4);
    expect(qualified.leaderCrossingMs).toBe(def.leaderCrossingMs);
    expect(qualified.playerCrossingMs).toBeLessThan(def.playerCrossingMs);
    expect(qualified.playerCrossingMs).toBe(qualified.paths[0].crossingMs);
    // And a qualified second row sits between them.
    const secondRow = resolveFormationRoll(5, 1, 2);
    expect(secondRow.playerSlot).toBe(2);
    expect(secondRow.paths).toEqual(def.paths);
    expect(secondRow.playerCrossingMs).toBeGreaterThan(qualified.playerCrossingMs);
    expect(secondRow.playerCrossingMs).toBeLessThan(def.playerCrossingMs);
  });

  test('places read as ordinals, with the 11/12/13 rule', () => {
    expect(formatRacePlace(1)).toBe('1st');
    expect(formatRacePlace(2)).toBe('2nd');
    expect(formatRacePlace(3)).toBe('3rd');
    expect(formatRacePlace(4)).toBe('4th');
    expect(formatRacePlace(5)).toBe('5th');
    expect(formatRacePlace(11)).toBe('11th');
    expect(formatRacePlace(12)).toBe('12th');
    expect(formatRacePlace(13)).toBe('13th');
    expect(formatRacePlace(21)).toBe('21st');
    expect(formatRacePlace(22)).toBe('22nd');
    expect(formatRacePlace(23)).toBe('23rd');
    expect(formatRacePlace(111)).toBe('111th');
    for (const place of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatRacePlace(place)).toBe('—');
    }
  });
});

describe('LADDER-1A §F — regression: 1A touches nothing about settlement', () => {
  test('a Biga victory still pays the ECON-1 purse and accrues ECON-2 points, prize on the second win', () => {
    const first = settleRaceCompletion(createNewProfile('Circus Career'), 2, 15000, 'victory', 1, 'district', 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.purseAwarded).toBe(100);
    expect(first.prizeAwarded).toBe(0);
    expect(first.leaguePointsEarned).toBe(50);
    const second = settleRaceCompletion(first.profile, 2, 15000, 'victory', 2, 'district', 1);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.prizeAwarded).toBe(250);
    expect(second.fameAwarded).toBe(20);
    expect(second.tierAdvanced).toBe(1);
  });
});
