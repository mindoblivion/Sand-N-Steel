// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  COLOSSEUM_ARENA_RX,
  COLOSSEUM_ARENA_RZ,
  COLOSSEUM_SPAWN_X,
  COLOSSEUM_SPAWN_Z,
  COLOSSEUM_EXIT_MIN_X,
  COLOSSEUM_EXIT_HALF_WIDTH,
  clampToArenaEllipse,
  isColosseumExit,
} from '../components/3d/ColosseumInterior';

const SOURCE = readFileSync(new URL('../components/3d/ColosseumInterior.tsx', import.meta.url), 'utf8');

describe('colosseum interior arena bounds', () => {
  test('arena is ~40x25 units', () => {
    expect(COLOSSEUM_ARENA_RX).toBe(20);
    expect(COLOSSEUM_ARENA_RZ).toBe(12.5);
  });

  test('points inside the ellipse are unchanged', () => {
    expect(clampToArenaEllipse(0, 0)).toEqual([0, 0]);
    expect(clampToArenaEllipse(5, 3)).toEqual([5, 3]);
    expect(clampToArenaEllipse(-19.9, 0)).toEqual([-19.9, 0]);
  });

  test('points outside are clamped onto the ellipse', () => {
    expect(clampToArenaEllipse(40, 0)).toEqual([20, 0]);
    expect(clampToArenaEllipse(0, 30)).toEqual([0, 12.5]);
    const [cx, cz] = clampToArenaEllipse(30, 20);
    expect((cx / COLOSSEUM_ARENA_RX) ** 2 + (cz / COLOSSEUM_ARENA_RZ) ** 2).toBeCloseTo(1, 6);
    expect(cx).toBeLessThanOrEqual(COLOSSEUM_ARENA_RX);
    expect(cz).toBeLessThanOrEqual(COLOSSEUM_ARENA_RZ);
  });

  test('spawn sits inside the arena', () => {
    const v =
      (COLOSSEUM_SPAWN_X / COLOSSEUM_ARENA_RX) ** 2 +
      (COLOSSEUM_SPAWN_Z / COLOSSEUM_ARENA_RZ) ** 2;
    expect(v).toBeLessThan(1);
  });
});

describe('colosseum interior exit', () => {
  test('the gate mouth triggers the exit', () => {
    expect(isColosseumExit(COLOSSEUM_EXIT_MIN_X, 0)).toBe(true);
    expect(isColosseumExit(19.5, 1)).toBe(true);
  });

  test('the exit does not fire away from the gate', () => {
    expect(isColosseumExit(0, 0)).toBe(false);
    expect(isColosseumExit(19.5, COLOSSEUM_EXIT_HALF_WIDTH + 1)).toBe(false);
    expect(isColosseumExit(COLOSSEUM_SPAWN_X, COLOSSEUM_SPAWN_Z)).toBe(false);
    expect(isColosseumExit(-19, 0)).toBe(false);
  });

  test('walking through the gate calls onExit', () => {
    expect(SOURCE).toMatch(/isColosseumExit\([^)]*\)[^{]*\{[^}]*onExitRef\.current\(\)/s);
  });

  test('HUD offers a 44px Return to City button', () => {
    expect(SOURCE).toContain('← Return to City');
    expect(SOURCE).toContain('min-h-[44px]');
  });
});

describe('colosseum interior render contract', () => {
  test('exports the ColosseumInterior component', () => {
    expect(SOURCE).toContain('export const ColosseumInterior');
  });

  test('reuses the arena interior textures (no duplicated crowd code)', () => {
    for (const name of [
      'getArenaSandTexture',
      'getArenaRingPaintTexture',
      'getPodiumWallTexture',
      'getPodiumInscriptionTexture',
      'getArenaTierTexture',
    ]) {
      expect(SOURCE).toContain(name);
    }
    expect(SOURCE).not.toContain('crowdHype');
  });

  test('renders a dialog overlay with a canvas', () => {
    expect(SOURCE).toContain('role="dialog"');
    expect(SOURCE).toContain('<Canvas');
  });
});
