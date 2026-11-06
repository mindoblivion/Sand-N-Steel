/** Regression coverage for decorative outer-district diagonal paving. */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  NORTHWEST_TEMPLE_APPROACH,
  SOUTHEAST_CRAFTING_APPROACH,
  SOUTHWEST_GUILD_APPROACH,
} from './streetGeometry';

const cityStreets = readFileSync(
  new URL('../components/3d/city/CityStreets.tsx', import.meta.url),
  'utf8',
);

describe('outer-district shared paving geometry', () => {
  test('preserves the three authored centres, sizes, and yaw rotations', () => {
    expect([
      NORTHWEST_TEMPLE_APPROACH.cx, NORTHWEST_TEMPLE_APPROACH.cz,
      NORTHWEST_TEMPLE_APPROACH.w, NORTHWEST_TEMPLE_APPROACH.d,
      NORTHWEST_TEMPLE_APPROACH.yaw, NORTHWEST_TEMPLE_APPROACH.beddingYaw,
    ]).toEqual([-24, -24, 7, 10, -Math.PI / 4, Math.PI / 4]);

    expect([
      SOUTHEAST_CRAFTING_APPROACH.cx, SOUTHEAST_CRAFTING_APPROACH.cz,
      SOUTHEAST_CRAFTING_APPROACH.w, SOUTHEAST_CRAFTING_APPROACH.d,
      SOUTHEAST_CRAFTING_APPROACH.yaw, SOUTHEAST_CRAFTING_APPROACH.beddingYaw,
    ]).toEqual([24, 24, 7, 10, -Math.PI / 4, Math.PI / 4]);

    expect([
      SOUTHWEST_GUILD_APPROACH.cx, SOUTHWEST_GUILD_APPROACH.cz,
      SOUTHWEST_GUILD_APPROACH.w, SOUTHWEST_GUILD_APPROACH.d,
      SOUTHWEST_GUILD_APPROACH.yaw, SOUTHWEST_GUILD_APPROACH.beddingYaw,
    ]).toEqual([-24, 24, 7, 10, Math.PI / 4, -Math.PI / 4]);
  });

  test('CityStreets renders all three patches from the shared registry', () => {
    for (const name of [
      'NORTHWEST_TEMPLE_APPROACH',
      'SOUTHEAST_CRAFTING_APPROACH',
      'SOUTHWEST_GUILD_APPROACH',
    ]) {
      expect(cityStreets).toContain(`${name}.cx`);
      expect(cityStreets).toContain(`${name}.cz`);
      expect(cityStreets).toContain(`${name}.w`);
      expect(cityStreets).toContain(`${name}.d`);
      expect(cityStreets).toContain(`${name}.yaw`);
    }
    expect(cityStreets.match(/color="#a88960"/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
