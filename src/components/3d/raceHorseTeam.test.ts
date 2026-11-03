// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getHorseStations } from '../../utils/chariotTeamFormation';
import { RACE_HORSE_FIT_SCALE, RACE_HORSE_WITHERS_X, RACE_HORSE_YAW } from './RaceHorseTeam';

describe('race horse team rendering contract', () => {
  test('uses the measured fit and points the horse forward along -Z', () => {
    expect(RACE_HORSE_FIT_SCALE).toBeCloseTo(0.553, 3);
    expect(RACE_HORSE_WITHERS_X).toBeCloseTo(0.42598, 5);
    expect(RACE_HORSE_YAW).toBeCloseTo(Math.PI / 2, 8);
  });

  test('renders exactly the selected Biga, Triga or Quadra stations', () => {
    expect(getHorseStations(2)).toHaveLength(2);
    expect(getHorseStations(3)).toHaveLength(3);
    expect(getHorseStations(4)).toHaveLength(4);
    for (const size of [2, 3, 4] as const) {
      const stations = getHorseStations(size);
      expect(new Set(stations.map((station) => station.lane)).size).toBe(size);
      expect(stations.every((station) => station.groundY === 0)).toBe(true);
    }
  });

  test('race scene mounts the selected team under the moving chariot root', () => {
    const scene = readFileSync(new URL('./RaceScene.tsx', import.meta.url), 'utf8');
    expect(scene.includes('RaceHorseTeam')).toBe(true);
    expect(scene.includes('teamSize={teamSize}')).toBe(true);
    expect(scene.includes('speed={raceState === \'racing\' && !frozen ? motion.speed : 0}')).toBe(true);
  });
});
