/** Regression coverage for the four decorative Via Scholaris paving patches. */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CITY_COLLIDERS, type RectCollider } from './collisionShapes';
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


// Keep Via Scholaris on the same yaw-aware foundation audit used by the other
// rotated city paths. This records the current authored intersections; it does
// not decide whether their visible contact is intentional. That still needs a
// landscape scene review before any paving or building transform is changed.

/** Separating Axis Theorem for a Three.js yaw-rotated paving rectangle vs AABB. */
function rotatedRectOverlapsAabb(
  road: { cx: number; cz: number; w: number; d: number; yaw: number },
  building: RectCollider,
): boolean {
  const c = Math.cos(road.yaw);
  const s = Math.sin(road.yaw);
  // Three.js rotation [0, yaw, 0] maps local +X to (cos, -sin)
  // and local +Z to (sin, cos) in the world's X/Z plane.
  const localX: [number, number] = [c, -s];
  const localZ: [number, number] = [s, c];
  const axes = [[1, 0], [0, 1], localX, localZ] as const;
  const dx = building.cx - road.cx;
  const dz = building.cz - road.cz;

  for (const [ax, az] of axes) {
    const distance = Math.abs(dx * ax + dz * az);
    const roadRadius =
      (road.w / 2) * Math.abs(localX[0] * ax + localX[1] * az) +
      (road.d / 2) * Math.abs(localZ[0] * ax + localZ[1] * az);
    const buildingRadius =
      building.hw * Math.abs(ax) + building.hd * Math.abs(az);
    if (distance >= roadRadius + buildingRadius - 1e-6) return false;
  }
  return true;
}

describe('Via Scholaris paving/foundation intersection baseline', () => {
  const buildingIds = new Set([
    'ishtar-central', 'ishtar-tower-l', 'ishtar-tower-r',
    'smithing-forge', 'city-tavern', 'general-store', 'caravanserai',
    'merchant-house', 'armor-workshop', 'stable', 'gladiator-academy',
    'doctore-house', 'records-library', 'bathhouse', 'roman-shrine',
    'bounty-hall', 'gladiator-barracks', 'veteran-hall', 'arena-medical',
    'training-hall',
  ]);
  const paths = [
    VIA_SCHOLARIS_MAIN,
    VIA_SCHOLARIS_ACADEMY_APPROACH,
    VIA_SCHOLARIS_LIBRARY_APPROACH,
    VIA_SCHOLARIS_DOCTORE_APPROACH,
  ] as const;
  const buildings = CITY_COLLIDERS.filter(
    (collider): collider is RectCollider =>
      collider.type === 'rect' && buildingIds.has(collider.id),
  );

  test('records the exact current yaw-aware foundation intersections', () => {
    const overlaps: string[] = [];
    for (const path of paths) {
      for (const building of buildings) {
        if (rotatedRectOverlapsAabb(path, building)) {
          overlaps.push(`${path.id} overlaps ${building.id}`);
        }
      }
    }

    expect(overlaps.sort()).toEqual([
      'via-scholaris-academy-approach overlaps doctore-house',
      'via-scholaris-academy-approach overlaps gladiator-academy',
      'via-scholaris-academy-approach overlaps records-library',
      'via-scholaris-doctore-approach overlaps doctore-house',
      'via-scholaris-doctore-approach overlaps merchant-house',
      'via-scholaris-library-approach overlaps gladiator-academy',
      'via-scholaris-library-approach overlaps records-library',
      'via-scholaris-main overlaps doctore-house',
      'via-scholaris-main overlaps merchant-house',
    ]);
  });
});
