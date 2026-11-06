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
  VIA_TABERNARIA,
  VIA_TABERNARIA_EAST,
  TAVERN_TO_FORUM_PATH,
  FORUM_TO_BATHHOUSE_PATH,
  FORUM_TO_BOUNTY_HALL_PATH,
  FORUM_TO_SHRINE_PATH,
  COURTYARD_TO_BARRACKS_PATH,
  COURTYARD_TO_MEDICAL_HOUSE_PATH,
  NORTHWEST_TEMPLE_APPROACH,
  SOUTHEAST_CRAFTING_APPROACH,
  SOUTHWEST_GUILD_APPROACH,
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


/** Separating Axis Theorem for a Three.js yaw-rotated pavement rectangle vs an AABB. */
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

/** Rotated paths are checked as oriented rectangles, not inflated AABBs. */
describe('registered rotated pedestrian pavement foundation intersections', () => {
  const paths = [
    VIA_TABERNARIA,
    VIA_TABERNARIA_EAST,
    TAVERN_TO_FORUM_PATH,
    FORUM_TO_BATHHOUSE_PATH,
    FORUM_TO_BOUNTY_HALL_PATH,
    FORUM_TO_SHRINE_PATH,
    COURTYARD_TO_BARRACKS_PATH,
    COURTYARD_TO_MEDICAL_HOUSE_PATH,
  ] as const;
  const buildings = CITY_COLLIDERS.filter(
    (collider): collider is RectCollider =>
      collider.type === 'rect' && BUILDING_FOOTPRINT_IDS.includes(
        collider.id as (typeof BUILDING_FOOTPRINT_IDS)[number],
      ),
  );

  test('uses Three.js yaw orientation rather than its mirrored rotation', () => {
    const probe = {
      type: 'rect' as const,
      id: 'sat-orientation-probe',
      cx: -3,
      cz: -1.5,
      hw: 0.25,
      hd: 0.25,
    };
    const positiveYaw = { cx: 0, cz: 0, w: 2, d: 6, yaw: Math.PI / 4 };
    expect(rotatedRectOverlapsAabb(positiveYaw, probe)).toBe(true);
    expect(rotatedRectOverlapsAabb({ ...positiveYaw, yaw: -Math.PI / 4 }, probe)).toBe(false);
  });

  test('records the exact existing rotated-path intersection baseline', () => {
    const overlaps: string[] = [];
    for (const path of paths) {
      for (const building of buildings) {
        if (rotatedRectOverlapsAabb(path, building)) {
          overlaps.push(`${path.id} overlaps ${building.id}`);
        }
      }
    }
    // These ten intersections are present in the authored city layout. Several
    // are paving approaches that intentionally meet their destination buildings;
    // the others need scene-level review before anyone changes their geometry.
    // Keep the measured set explicit so future edits cannot silently add/remove one.
    expect(overlaps.sort()).toEqual([
      'courtyard-to-barracks overlaps gladiator-barracks',
      'courtyard-to-medical-house overlaps arena-medical',
      'courtyard-to-medical-house overlaps gladiator-barracks',
      'forum-to-bathhouse overlaps bathhouse',
      'forum-to-bounty-hall overlaps bounty-hall',
      'forum-to-shrine overlaps roman-shrine',
      'tavern-to-forum overlaps city-tavern',
      'via-tabernaria overlaps city-tavern',
      'via-tabernaria-east overlaps caravanserai',
      'via-tabernaria-east overlaps smithing-forge',
    ]);
  });
});


/**
 * Outer-district diagonal paving is visual-only and points toward future
 * expansion areas. Keep its existing building intersections explicit until
 * the city is reviewed in-game; do not move slabs or foundations from this
 * numerical audit alone.
 */
describe('outer-district diagonal paving foundation intersections', () => {
  const paths = [
    NORTHWEST_TEMPLE_APPROACH,
    SOUTHEAST_CRAFTING_APPROACH,
    SOUTHWEST_GUILD_APPROACH,
  ] as const;
  const buildings = CITY_COLLIDERS.filter(
    (collider): collider is RectCollider =>
      collider.type === 'rect' && BUILDING_FOOTPRINT_IDS.includes(
        collider.id as (typeof BUILDING_FOOTPRINT_IDS)[number],
      ),
  );

  test('records the current intersections for visual review', () => {
    const overlaps: string[] = [];
    for (const path of paths) {
      for (const building of buildings) {
        if (rotatedRectOverlapsAabb(path, building)) {
          overlaps.push(`${path.id} overlaps ${building.id}`);
        }
      }
    }

    // These are four existing mesh/foundation intersections. Their visual
    // impact and intent require a landscape scene review before any transform
    // changes; this baseline prevents them from changing silently.
    expect(overlaps.sort()).toEqual([
      'northwest-temple-approach overlaps veteran-hall',
      'southeast-crafting-approach overlaps stable',
      'southwest-guild-approach overlaps bathhouse',
      'southwest-guild-approach overlaps bounty-hall',
    ]);
  });
});
