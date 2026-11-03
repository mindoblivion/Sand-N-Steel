/**
 * Building plinth overlap audit.
 *
 * Reads the live building-footprint rectangles from CITY_COLLIDERS and checks
 * for unintended positive-area intersections. The Ishtar gate's central arch
 * intentionally overlaps its two tower footprints: those three rectangles
 * model one continuous gateway structure, not three independent buildings.
 *
 * This catches future building moves or footprint edits that accidentally
 * interpenetrate neighbouring plinths. It does not claim to detect visual
 * overlap in upper floors, roofs, foliage, or decorative props.
 *
 * Run with: bun test src/utils/cityBuildingFootprints.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS, type RectCollider } from './collisionShapes';

const BUILDING_FOOTPRINT_IDS = [
  'ishtar-central',
  'ishtar-tower-l',
  'ishtar-tower-r',
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

const ALLOWED_COMPOUND_OVERLAPS = new Set([
  'ishtar-central|ishtar-tower-l',
  'ishtar-central|ishtar-tower-r',
]);

function overlapOnAxis(
  aCenter: number,
  aHalf: number,
  bCenter: number,
  bHalf: number,
): number {
  return Math.min(aCenter + aHalf, bCenter + bHalf) -
    Math.max(aCenter - aHalf, bCenter - bHalf);
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

describe('city building foundation footprints', () => {
  test('every audited building has a live rectangular footprint', () => {
    const byId = new Map(
      CITY_COLLIDERS
        .filter((collider): collider is RectCollider => collider.type === 'rect')
        .map((collider) => [collider.id, collider]),
    );

    const missing = BUILDING_FOOTPRINT_IDS.filter((id) => !byId.has(id));
    expect(missing).toEqual([]);
  });

  test('building plinths do not have unintended positive-area overlaps', () => {
    const byId = new Map(
      CITY_COLLIDERS
        .filter((collider): collider is RectCollider => collider.type === 'rect')
        .map((collider) => [collider.id, collider]),
    );

    const overlaps: string[] = [];
    for (let i = 0; i < BUILDING_FOOTPRINT_IDS.length; i += 1) {
      const a = byId.get(BUILDING_FOOTPRINT_IDS[i]);
      if (!a) continue;

      for (let j = i + 1; j < BUILDING_FOOTPRINT_IDS.length; j += 1) {
        const b = byId.get(BUILDING_FOOTPRINT_IDS[j]);
        if (!b) continue;

        const overlapX = overlapOnAxis(a.cx, a.hw, b.cx, b.hw);
        const overlapZ = overlapOnAxis(a.cz, a.hd, b.cz, b.hd);
        if (overlapX > 1e-6 && overlapZ > 1e-6) {
          overlaps.push(pairKey(a.id, b.id));
        }
      }
    }

    overlaps.sort();
    expect(overlaps).toEqual([...ALLOWED_COMPOUND_OVERLAPS].sort());
  });
});
