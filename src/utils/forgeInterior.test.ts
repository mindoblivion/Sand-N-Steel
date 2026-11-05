// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  FORGE_FLOOR_HALF_X,
  FORGE_FLOOR_HALF_Z,
  FORGE_SPAWN_X,
  FORGE_SPAWN_Z,
  FORGE_EXIT_MIN_Z,
  FORGE_EXIT_HALF_WIDTH,
  FORGE_STATIONS,
  SEXTUS_FORGE_FIRST_VISIT,
  SEXTUS_FORGE_TOPICS,
  clampToForgeFloor,
  isForgeExit,
  nearestForgeStation,
} from '../components/3d/ForgeInterior';

const SOURCE = readFileSync(new URL('../components/3d/ForgeInterior.tsx', import.meta.url), 'utf8');

describe('forge interior floor bounds', () => {
  test('clamp keeps the player on the forge floor', () => {
    expect(clampToForgeFloor(0, 0)).toEqual([0, 0]);
    expect(clampToForgeFloor(99, -99)).toEqual([FORGE_FLOOR_HALF_X, -FORGE_FLOOR_HALF_Z]);
    expect(clampToForgeFloor(-99, 99)).toEqual([-FORGE_FLOOR_HALF_X, FORGE_FLOOR_HALF_Z]);
  });

  test('spawn sits inside the floor, just in front of the door', () => {
    const [cx, cz] = clampToForgeFloor(FORGE_SPAWN_X, FORGE_SPAWN_Z);
    expect(cx).toBe(FORGE_SPAWN_X);
    expect(cz).toBe(FORGE_SPAWN_Z);
    expect(Math.abs(FORGE_SPAWN_X)).toBeLessThanOrEqual(FORGE_FLOOR_HALF_X);
    expect(FORGE_SPAWN_Z).toBeLessThan(FORGE_EXIT_MIN_Z);
  });

  test('every station marker sits on the walkable floor', () => {
    for (const s of FORGE_STATIONS) {
      const [cx, cz] = clampToForgeFloor(s.x, s.z);
      expect(cx).toBe(s.x);
      expect(cz).toBe(s.z);
    }
  });
});

describe('forge interior exit', () => {
  test('the door zone on the south wall is the exit', () => {
    expect(isForgeExit(0, FORGE_EXIT_MIN_Z)).toBe(true);
    expect(isForgeExit(1, FORGE_FLOOR_HALF_Z)).toBe(true);
    expect(isForgeExit(-FORGE_EXIT_HALF_WIDTH, FORGE_FLOOR_HALF_Z)).toBe(true);
  });

  test('the exit needs the doorway, not just the south edge', () => {
    expect(isForgeExit(FORGE_EXIT_HALF_WIDTH + 0.5, FORGE_FLOOR_HALF_Z)).toBe(false);
    expect(isForgeExit(0, FORGE_EXIT_MIN_Z - 0.5)).toBe(false);
    expect(isForgeExit(0, 0)).toBe(false);
  });
});

describe('forge interior stations', () => {
  test('every station resolves near its own marker', () => {
    for (const s of FORGE_STATIONS) {
      expect(nearestForgeStation(s.x, s.z)?.id).toBe(s.id);
    }
  });

  test('open floor has no station', () => {
    expect(nearestForgeStation(0, 0)).toBeNull();
  });

  test('the keeper station is Sextus Ferratus', () => {
    const s = FORGE_STATIONS.find((st) => st.id === 'sextus');
    expect(s?.label).toBe('Sextus Ferratus');
  });

  test('the anvil and workbench stations name their actions', () => {
    const anvil = FORGE_STATIONS.find((st) => st.id === 'anvil');
    const workbench = FORGE_STATIONS.find((st) => st.id === 'workbench');
    expect(anvil?.hint).toMatch(/temper/i);
    expect(workbench?.hint).toMatch(/shop/i);
  });
});

describe('sextus ferratus dialogue', () => {
  test('first-visit greeting names the keeper', () => {
    expect(SEXTUS_FORGE_FIRST_VISIT).toContain('Sextus Ferratus');
  });

  test('topics cover repairs, forge lore, and tempering', () => {
    const labels = SEXTUS_FORGE_TOPICS.map((t) => t.label).join(' ');
    expect(labels).toMatch(/repair/i);
    expect(labels).toMatch(/forge/);
    expect(labels).toMatch(/temper/i);
    for (const t of SEXTUS_FORGE_TOPICS) {
      expect(t.line.length).toBeGreaterThan(20);
    }
  });
});

describe('forge interior render contract', () => {
  test('HUD offers a 44px return button', () => {
    expect(SOURCE).toContain('← Return to City');
    expect(SOURCE).toContain('min-h-[44px]');
    expect(SOURCE).toContain('aria-label="Return to City"');
  });

  test('furnace glow uses a flickering point light and spark particles', () => {
    expect(SOURCE).toContain('pointLight');
    expect(SOURCE).toContain('emissive');
    expect(SOURCE).toContain('pointsMaterial');
  });

  test('player rig clamps to the forge floor and exits through the door', () => {
    expect(SOURCE).toContain('clampToForgeFloor');
    expect(SOURCE).toContain('isForgeExit');
    expect(SOURCE).toContain('onExit');
  });

  test('sextus ferratus is present with dialogue', () => {
    expect(SOURCE).toContain('Sextus Ferratus');
    expect(SOURCE).toContain('sextus_ferratus');
  });
});
