// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  BOUNTY_HALL_FLOOR_HALF_X,
  BOUNTY_HALL_FLOOR_HALF_Z,
  BOUNTY_HALL_SPAWN_X,
  BOUNTY_HALL_SPAWN_Z,
  BOUNTY_HALL_EXIT_MIN_Z,
  BOUNTY_HALL_EXIT_HALF_WIDTH,
  BOUNTY_HALL_STATIONS,
  BOUNTY_HALL_BOARD_NAMES,
  BOUNTY_HALL_DESERTER_NAME,
  SCRIBONIA_HALL_FIRST_VISIT,
  SCRIBONIA_HALL_REPEAT,
  SCRIBONIA_HALL_TOPICS,
  clampToBountyHallFloor,
  isBountyHallExit,
  nearestBountyHallStation,
} from '../components/3d/BountyHallInterior';

const SOURCE = readFileSync(new URL('../components/3d/BountyHallInterior.tsx', import.meta.url), 'utf8');

describe('bounty hall interior floor bounds', () => {
  test('clamp keeps the player on the hall floor', () => {
    expect(clampToBountyHallFloor(0, 0)).toEqual([0, 0]);
    expect(clampToBountyHallFloor(99, -99)).toEqual([BOUNTY_HALL_FLOOR_HALF_X, -BOUNTY_HALL_FLOOR_HALF_Z]);
    expect(clampToBountyHallFloor(-99, 99)).toEqual([-BOUNTY_HALL_FLOOR_HALF_X, BOUNTY_HALL_FLOOR_HALF_Z]);
  });

  test('spawn sits inside the floor, just in front of the door', () => {
    const [cx, cz] = clampToBountyHallFloor(BOUNTY_HALL_SPAWN_X, BOUNTY_HALL_SPAWN_Z);
    expect(cx).toBe(BOUNTY_HALL_SPAWN_X);
    expect(cz).toBe(BOUNTY_HALL_SPAWN_Z);
    expect(Math.abs(BOUNTY_HALL_SPAWN_X)).toBeLessThanOrEqual(BOUNTY_HALL_FLOOR_HALF_X);
    expect(BOUNTY_HALL_SPAWN_Z).toBeLessThan(BOUNTY_HALL_EXIT_MIN_Z);
  });

  test('every station marker sits on the walkable floor', () => {
    for (const s of BOUNTY_HALL_STATIONS) {
      const [cx, cz] = clampToBountyHallFloor(s.x, s.z);
      expect(cx).toBe(s.x);
      expect(cz).toBe(s.z);
    }
  });
});

describe('bounty hall interior exit', () => {
  test('the door zone on the south wall is the exit', () => {
    expect(isBountyHallExit(0, BOUNTY_HALL_EXIT_MIN_Z)).toBe(true);
    expect(isBountyHallExit(1, BOUNTY_HALL_FLOOR_HALF_Z)).toBe(true);
    expect(isBountyHallExit(-BOUNTY_HALL_EXIT_HALF_WIDTH, BOUNTY_HALL_FLOOR_HALF_Z)).toBe(true);
  });

  test('the exit needs the doorway, not just the south edge', () => {
    expect(isBountyHallExit(BOUNTY_HALL_EXIT_HALF_WIDTH + 0.5, BOUNTY_HALL_FLOOR_HALF_Z)).toBe(false);
    expect(isBountyHallExit(0, BOUNTY_HALL_EXIT_MIN_Z - 0.5)).toBe(false);
    expect(isBountyHallExit(0, 0)).toBe(false);
  });
});

describe('bounty hall interior stations', () => {
  test('every station resolves near its own marker', () => {
    for (const s of BOUNTY_HALL_STATIONS) {
      expect(nearestBountyHallStation(s.x, s.z)?.id).toBe(s.id);
    }
  });

  test('open floor resolves no station', () => {
    expect(nearestBountyHallStation(0, 2.5)).toBeNull();
  });

  test('the board, the Acta, the cage, the red list and the back room are distinct stations', () => {
    const ids = BOUNTY_HALL_STATIONS.map((s) => s.id);
    expect(ids).toContain('board');
    expect(ids).toContain('acta');
    expect(ids).toContain('scribonia');
    expect(ids).toContain('redlist');
    expect(ids).toContain('backroom');
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("Scribonia's station is at the paymaster's cage, not a separate counter", () => {
    const s = BOUNTY_HALL_STATIONS.find((x) => x.id === 'scribonia');
    expect(s?.x).toBe(6.5);
    expect(s?.z).toBe(0.8);
  });

  test('the board wall carries the authored rung names, in rung order', () => {
    expect(BOUNTY_HALL_BOARD_NAMES.map((b) => b.name)).toEqual([
      'Decimus the Rampart',
      'Sextus Sinister',
      'Gaius the Ironclad',
      "Publius the Crowd's Darling",
      'Manius the Unscarred',
    ]);
    expect(BOUNTY_HALL_DESERTER_NAME).toBe('Lucius Cassius, called the Oathbreaker');
  });
});

describe('bounty hall keeper lines', () => {
  test("Scribonia's first-visit line matches the keeper registry verbatim", () => {
    expect(SCRIBONIA_HALL_FIRST_VISIT).toBe(
      "Read the board; sign nothing you haven't read twice. Five names, five purses — the deserter last, and he pays best taken alive.",
    );
  });

  test("Scribonia's repeat line matches the keeper registry verbatim", () => {
    expect(SCRIBONIA_HALL_REPEAT).toBe(
      'Paid to the copper, as always. The board has a new name, if your sword is bored.',
    );
  });

  test('Scribonia has three topics, each with a line', () => {
    expect(SCRIBONIA_HALL_TOPICS.length).toBe(3);
    for (const t of SCRIBONIA_HALL_TOPICS) {
      expect(t.line.length).toBeGreaterThan(20);
    }
  });

  test('the interior wires the board panel and the city return', () => {
    expect(SOURCE).toContain('onOpenServices');
    expect(SOURCE).toContain('Return to City');
    expect(SOURCE).toContain("'scribonia'");
    expect(SOURCE).toContain('BackRoomDoor');
    expect(SOURCE).toContain('BOUNTY_HALL_BOARD_NAMES');
  });
});

describe('bounty hall door panel Escape', () => {
  const city = readFileSync(new URL('../components/3d/city/CityHubScene.tsx', import.meta.url), 'utf8');

  test('the keydown effect re-subscribes when the door panel opens, so Escape closes it', () => {
    expect(city).toContain('showRaceEntry, showNavDrawer, bountyHallPanel]);');
    expect(city).toContain('if (bountyHallPanel) {');
    expect(city).toContain("if (code === 'Escape' || key === 'escape') setBountyHallPanel(false);");
  });
});
