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
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS, type RectCollider } from './collisionShapes';
import {
  VIA_DECUMANUS_WEST,
  VIA_DECUMANUS_EAST,
  VIA_DECUMANUS_EAST_EXTENSION,
  VIA_MERCATORIA_PATH,
  VIA_MERCATORIA_CONNECTOR,
  CARAVAN_BYPASS,
  VIA_SOCIALIS,
  VIA_TRIUMPHALIS_WEST,
  VIA_TRIUMPHALIS_EAST,
  VIA_TRIUMPHALIS_RUNNER,
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

describe('Via Decumanus registered pavement footprints', () => {
  const segments = [
    VIA_DECUMANUS_WEST,
    VIA_DECUMANUS_EAST,
    VIA_DECUMANUS_EAST_EXTENSION,
  ] as const;

  test('preserves the three existing east-west road footprints', () => {
    expect(segments.map(({ id, cx, cz, w, d }) => [id, cx, cz, w, d])).toEqual([
      ['via-decumanus-west', -11, 0, 14, 8],
      ['via-decumanus-east', 11, 0, 14, 8],
      ['via-decumanus-east-extension', 22.5, 1, 9, 7],
    ]);
  });

  test('all registered footprints have finite centres and positive dimensions', () => {
    for (const segment of segments) {
      expect(Number.isFinite(segment.cx)).toBe(true);
      expect(Number.isFinite(segment.cz)).toBe(true);
      expect(segment.w).toBeGreaterThan(0);
      expect(segment.d).toBeGreaterThan(0);
    }
  });
});

describe('Via Mercatoria connector footprint', () => {
  test('preserves the connector between the east extension and market', () => {
    expect([
      VIA_MERCATORIA_CONNECTOR.id,
      VIA_MERCATORIA_CONNECTOR.cx,
      VIA_MERCATORIA_CONNECTOR.cz,
      VIA_MERCATORIA_CONNECTOR.w,
      VIA_MERCATORIA_CONNECTOR.d,
    ]).toEqual(['via-mercatoria-connector', 22, -2, 4, 6]);
  });
});


/**
 * Axis-aligned street/paving footprints that have explicit shared geometry.
 * Rotated diagonal paths and the 14×72 avenue bed are intentionally excluded:
 * they need polygon-vs-rectangle SAT testing rather than an AABB shortcut.
 */
describe('registered city street foundation clearance', () => {
  const pavement = [
    VIA_MERCATORIA_PATH,
    VIA_DECUMANUS_WEST,
    VIA_DECUMANUS_EAST,
    VIA_DECUMANUS_EAST_EXTENSION,
    VIA_MERCATORIA_CONNECTOR,
    CARAVAN_BYPASS,
    VIA_SOCIALIS,
    VIA_TRIUMPHALIS_WEST,
    VIA_TRIUMPHALIS_EAST,
    VIA_TRIUMPHALIS_RUNNER,
  ] as const;

  const buildings = CITY_COLLIDERS.filter(
    (collider): collider is RectCollider =>
      collider.type === 'rect' && BUILDING_FOOTPRINT_IDS.includes(
        collider.id as (typeof BUILDING_FOOTPRINT_IDS)[number],
      ),
  );

  test('records the current pavement/foundation intersection baseline for follow-up review', () => {
    const overlaps: string[] = [];
    for (const road of pavement) {
      for (const building of buildings) {
        const overlapX = overlapOnAxis(road.cx, road.w / 2, building.cx, building.hw);
        const overlapZ = overlapOnAxis(road.cz, road.d / 2, building.cz, building.hd);
        if (overlapX > 1e-6 && overlapZ > 1e-6) {
          overlaps.push(`${road.id} overlaps ${building.id}`);
        }
      }
    }
    // These intersections are pre-existing in the current city layout. This
    // test records them exactly so future geometry work cannot add/remove one
    // silently; each needs a separate scene-level decision before any layout
    // changes are made.
    expect(overlaps.sort()).toEqual([
      'caravan-bypass overlaps caravanserai',
      'caravan-bypass overlaps stable',
      'via-decumanus-east overlaps smithing-forge',
      'via-decumanus-east-extension overlaps armor-workshop',
      'via-decumanus-east-extension overlaps general-store',
      'via-decumanus-east-extension overlaps smithing-forge',
      'via-mercatoria-connector overlaps armor-workshop',
      'via-mercatoria-connector overlaps general-store',
      'via-mercatoria-connector overlaps smithing-forge',
      'via-socialis overlaps city-tavern',
    ]);
  });
});
