/**
 * Via Scholaris paving/foundation intersection baseline.
 *
 * The four Academy-quarter paving rectangles were missing from the existing
 * rotated-paving SAT audit. This test records their current intersections
 * against the live building-footprint registry so later layout work cannot
 * silently add or remove contacts. It does not declare these intersections
 * visually acceptable; the city layout milestone must resolve them explicitly.
 *
 * Run with: bun test src/utils/scholarisPavingClearance.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS, type RectCollider } from './collisionShapes';
import {
  VIA_SCHOLARIS_MAIN,
  VIA_SCHOLARIS_ACADEMY_APPROACH,
  VIA_SCHOLARIS_LIBRARY_APPROACH,
  VIA_SCHOLARIS_DOCTORE_APPROACH,
} from './streetGeometry';

const BUILDING_FOOTPRINT_IDS = [
  'smithing-forge',
  'city-tavern',
  'general-store',
  'caravanserai',
  'merchant-house',
  'armor-workshop',
  'stable',
  'gladiator-academy',
  'doctore-house',
  'records-library',
  'bathhouse',
  'roman-shrine',
  'bounty-hall',
  'gladiator-barracks',
  'veteran-hall',
  'arena-medical',
  'training-hall',
] as const;

/** SAT for a Three.js yaw-rotated paving rectangle against an AABB. */
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

describe('Via Scholaris paving foundation intersections', () => {
  const paths = [
    VIA_SCHOLARIS_MAIN,
    VIA_SCHOLARIS_ACADEMY_APPROACH,
    VIA_SCHOLARIS_LIBRARY_APPROACH,
    VIA_SCHOLARIS_DOCTORE_APPROACH,
  ] as const;

  const buildings = CITY_COLLIDERS.filter(
    (collider): collider is RectCollider =>
      collider.type === 'rect' &&
      BUILDING_FOOTPRINT_IDS.includes(
        collider.id as (typeof BUILDING_FOOTPRINT_IDS)[number],
      ),
  );

  test('all surveyed building footprints are registered', () => {
    const registered = new Set(buildings.map((building) => building.id));
    expect(BUILDING_FOOTPRINT_IDS.filter((id) => !registered.has(id))).toEqual([]);
  });

  test('records the exact existing Scholaris intersection baseline', () => {
    const overlaps: string[] = [];
    for (const path of paths) {
      for (const building of buildings) {
        if (rotatedRectOverlapsAabb(path, building)) {
          overlaps.push(`${path.id} overlaps ${building.id}`);
        }
      }
    }

    // These nine intersections were measured against the live registry.
    // Some may represent intended entrance aprons; all require an explicit
    // decision in the city layout blueprint before geometry is changed.
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
