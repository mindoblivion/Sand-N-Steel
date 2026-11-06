/** Regression coverage for the four decorative Via Scholaris paving patches. */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  VIA_SCHOLARIS_MAIN,
  VIA_SCHOLARIS_ACADEMY_APPROACH,
  VIA_SCHOLARIS_LIBRARY_APPROACH,
  VIA_SCHOLARIS_DOCTORE_APPROACH,
} from './streetGeometry';

const cityStreets = readFileSync(
  new URL('../components/3d/city/CityStreets.tsx', import.meta.url),
  'utf8',
);

describe('Via Scholaris shared paving geometry', () => {
  test('preserves the four authored centres, sizes, rotations and vertical offsets', () => {
    expect([
      VIA_SCHOLARIS_MAIN.cx, VIA_SCHOLARIS_MAIN.cz, VIA_SCHOLARIS_MAIN.w,
      VIA_SCHOLARIS_MAIN.d, VIA_SCHOLARIS_MAIN.yaw, VIA_SCHOLARIS_MAIN.y,
    ]).toEqual([21.5, -18.5, 5, 9, -Math.PI / 4, -0.012]);
    expect([
      VIA_SCHOLARIS_ACADEMY_APPROACH.cx, VIA_SCHOLARIS_ACADEMY_APPROACH.cz,
      VIA_SCHOLARIS_ACADEMY_APPROACH.w, VIA_SCHOLARIS_ACADEMY_APPROACH.d,
      VIA_SCHOLARIS_ACADEMY_APPROACH.yaw, VIA_SCHOLARIS_ACADEMY_APPROACH.y,
    ]).toEqual([27.8, -24.2, 4, 7, Math.PI / 4, -0.01]);
    expect([
      VIA_SCHOLARIS_LIBRARY_APPROACH.cx, VIA_SCHOLARIS_LIBRARY_APPROACH.cz,
      VIA_SCHOLARIS_LIBRARY_APPROACH.w, VIA_SCHOLARIS_LIBRARY_APPROACH.d,
      VIA_SCHOLARIS_LIBRARY_APPROACH.yaw, VIA_SCHOLARIS_LIBRARY_APPROACH.y,
    ]).toEqual([24, -25.5, 3.6, 7, -Math.PI * 0.15, -0.01]);
    expect([
      VIA_SCHOLARIS_DOCTORE_APPROACH.cx, VIA_SCHOLARIS_DOCTORE_APPROACH.cz,
      VIA_SCHOLARIS_DOCTORE_APPROACH.w, VIA_SCHOLARIS_DOCTORE_APPROACH.d,
      VIA_SCHOLARIS_DOCTORE_APPROACH.yaw, VIA_SCHOLARIS_DOCTORE_APPROACH.y,
    ]).toEqual([26.5, -19, 3.8, 4.5, Math.PI * 0.12, -0.01]);
  });

  test('CityStreets renders all four patches from the shared registry', () => {
    for (const name of [
      'VIA_SCHOLARIS_MAIN',
      'VIA_SCHOLARIS_ACADEMY_APPROACH',
      'VIA_SCHOLARIS_LIBRARY_APPROACH',
      'VIA_SCHOLARIS_DOCTORE_APPROACH',
    ]) {
      expect(cityStreets).toContain(`${name}.cx`);
      expect(cityStreets).toContain(`${name}.cz`);
      expect(cityStreets).toContain(`${name}.w`);
      expect(cityStreets).toContain(`${name}.d`);
      expect(cityStreets).toContain(`${name}.yaw`);
      expect(cityStreets).toContain(`${name}.y`);
    }
    expect(cityStreets).toContain('color="#c29b6f"');
    expect(cityStreets.match(/color="#ebdcb9"/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
