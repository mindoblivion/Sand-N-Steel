/**
 * Via Mercatoria pavement clearance regression.
 *
 * The alley is intentionally kept west of the Merchant House foundation and
 * just south of the General Store foundation. This test checks the actual
 * street-mesh footprint against the live building collider registry, and keeps
 * the merchant-house fast-travel arrival inside the paved approach.
 *
 * Run with: bun test src/utils/viaMercatoriaClearance.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS, type RectCollider } from './collisionShapes';
import { VIA_MERCATORIA_PATH } from './streetGeometry';

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

function overlapOnAxis(aCenter: number, aHalf: number, bCenter: number, bHalf: number): number {
  return Math.min(aCenter + aHalf, bCenter + bHalf) -
    Math.max(aCenter - aHalf, bCenter - bHalf);
}

describe('Via Mercatoria pavement footprint', () => {
  const buildings = CITY_COLLIDERS.filter(
    (collider): collider is RectCollider =>
      collider.type === 'rect' && BUILDING_FOOTPRINT_IDS.includes(
        collider.id as (typeof BUILDING_FOOTPRINT_IDS)[number],
      ),
  );

  test('every expected neighbouring building footprint is registered', () => {
    const registered = new Set(buildings.map((building) => building.id));
    expect(BUILDING_FOOTPRINT_IDS.filter((id) => !registered.has(id))).toEqual([]);
  });

  test('pavement does not overlap a registered building foundation', () => {
    const overlaps = buildings
      .filter((building) => {
        const overlapX = overlapOnAxis(
          VIA_MERCATORIA_PATH.cx,
          VIA_MERCATORIA_PATH.w / 2,
          building.cx,
          building.hw,
        );
        const overlapZ = overlapOnAxis(
          VIA_MERCATORIA_PATH.cz,
          VIA_MERCATORIA_PATH.d / 2,
          building.cz,
          building.hd,
        );
        return overlapX > 1e-6 && overlapZ > 1e-6;
      })
      .map((building) => building.id)
      .sort();

    expect(overlaps).toEqual([]);
  });

  test('merchant-house arrival remains inside the paved approach', () => {
    const arrival = [21, -13] as const;
    expect(Math.abs(arrival[0] - VIA_MERCATORIA_PATH.cx))
      .toBeLessThanOrEqual(VIA_MERCATORIA_PATH.w / 2);
    expect(Math.abs(arrival[1] - VIA_MERCATORIA_PATH.cz))
      .toBeLessThanOrEqual(VIA_MERCATORIA_PATH.d / 2);
  });
});
