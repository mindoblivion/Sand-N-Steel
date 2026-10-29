/**
 * bridgeGuards.test.ts -- DB-2 'The Bridge Guards' literal pins.
 *
 * Reads src/components/3d/city/BridgeGuards.tsx and pins the brief's
 * verbatim values: guard positions, guard count, facing, mesh budget,
 * and the no-wall-clock / no-random rules.
 */
// @ts-ignore: bun:test is provided by the bun runtime; tsc has no bun-types here
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../components/3d/city/BridgeGuards.tsx', import.meta.url),
  'utf8',
);

const countOf = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe('DB-2 bridge guards literals', () => {
  test('pins guard 1 (west) position [-3.5, 0, -48.5]', () => {
    expect(source).toContain('[-3.5, 0, -48.5]');
  });

  test('pins guard 2 (east) position [3.5, 0, -48.5]', () => {
    expect(source).toContain('[3.5, 0, -48.5]');
  });

  test('mounts exactly 2 guards', () => {
    expect(countOf(source, '<GuardFigure')).toBe(2);
  });

  test('both guards face north (rotationY = PI)', () => {
    expect(countOf(source, '<GuardFigure')).toBe(2);
    expect(source).toContain('rotation-y={Math.PI}');
  });

  test('uses at most 20 mesh elements', () => {
    const meshes = countOf(source, '<mesh');
    expect(meshes).toBeGreaterThan(0);
    expect(meshes).toBeLessThanOrEqual(20);
  });

  test('no wall-clock reads in source', () => {
    expect(source).not.toContain('Date.now');
    expect(source).not.toContain('performance.now');
  });

  test('no Math.random in source', () => {
    expect(source).not.toContain('Math.random');
  });
});
