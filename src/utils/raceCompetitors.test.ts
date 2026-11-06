// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { RACE_COMPETITORS, resolveRaceCompetitor } from './raceCompetitors';

describe('East Circus rival roster', () => {
  test('provides three distinct, progressively faster faction challengers', () => {
    expect(RACE_COMPETITORS.map((rival) => rival.id)).toEqual([
      'russata_rookie', 'veneta_veteran', 'albata_champion',
    ]);
    expect(new Set(RACE_COMPETITORS.map((rival) => rival.name)).size).toBe(3);
    expect(RACE_COMPETITORS.map((rival) => rival.lapDurationMs)).toEqual([64000, 61000, 58000]);
    expect(RACE_COMPETITORS.every((rival) =>
      Number.isFinite(rival.lapDurationMs) && rival.lapDurationMs > 0 &&
      (rival.startSide === -1 || rival.startSide === 1)
    )).toBe(true);
    expect(RACE_COMPETITORS.map((rival) => rival.finish)).toEqual(['oxblood', 'ventive', 'triumph']);
  });

  test('wins deterministically advance the rival tier; losses do not advance it', () => {
    expect(resolveRaceCompetitor(0)).toBe(RACE_COMPETITORS[0]);
    expect(resolveRaceCompetitor(1)).toBe(RACE_COMPETITORS[1]);
    expect(resolveRaceCompetitor(2)).toBe(RACE_COMPETITORS[2]);
    expect(resolveRaceCompetitor(3)).toBe(RACE_COMPETITORS[2]);
    expect(resolveRaceCompetitor(0)).toBe(RACE_COMPETITORS[0]);
  });

  test('malformed and negative career counts fail closed to the first rival', () => {
    for (const value of [undefined, null, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2']) {
      expect(resolveRaceCompetitor(value)).toBe(RACE_COMPETITORS[0]);
    }
  });

  test('catalogue is immutable', () => {
    expect(Object.isFrozen(RACE_COMPETITORS)).toBe(true);
    for (const rival of RACE_COMPETITORS) expect(Object.isFrozen(rival)).toBe(true);
  });
});
