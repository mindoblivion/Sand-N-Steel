/**
 * Phase C-8.64B — East Circus District: access roads, forecourt and boundary.
 *
 * Run with: bun test src/utils/phaseC8_64b.test.ts
 *
 * ── WHAT THIS PHASE SHIPS ─────────────────────────────────────────────────
 * C-8.64A placed the chariot arena on bare sand east of the city and closed its
 * two collision mouths; the district around it had no street of its own and no
 * boundary of its own.  This phase lays the district's paved shell and the one
 * rule its walkability needs:
 *
 *   • `components/3d/city/EastCircusDistrict.tsx` — four paved runs (Via
 *     Circensis' two legs, the forum link, the service lane) built from the
 *     city's own `RomanPavedStreet` primitive, the carceres forecourt paved in
 *     the forum's `forumPaving` with its two gilded trims, the low travertine
 *     parapet closing the forecourt's south edge, and three 0.16-high kerbs.
 *     Every footprint comes from `utils/circusDistrictGeometry.ts`, which this
 *     suite reads, so the drawn pavement and the asserted pavement are the same
 *     numbers.
 *   • `collisionShapes.ts` — ONE new collider, `forecourt-parapet` (the only
 *     solid thing the district adds; roads are pavement and a 0.16 kerb is
 *     stepped over, exactly as the city's own street curbs are).
 *   • `cityCollisions.ts` — the district band's south limit extended from
 *     C-8.64A's 47.5 (the carceres apron) to 55.0 (the forecourt parapet's
 *     outer face), plus the two rules that make the union with the city square
 *     consistent at their shared edge X = 35.
 *
 * ── HOW IT IS VERIFIED ────────────────────────────────────────────────────
 *   • every figure is re-derived from the two source modules and the shipped
 *     registry, not restated;
 *   • the routes, the junctions and the forecourt perimeter are DRIVEN with the
 *     real `resolveCityMovement` (3.8 u/s, 0.1 s steps = 0.38 per step, the
 *     shipped movement rate) in both directions along the whole route;
 *   • §F replays the pre-C-8.64B envelope through the same predicates, so the
 *     boundary change is shown to be load-bearing rather than incidental.
 *
 * ── NOT VERIFIED HERE ─────────────────────────────────────────────────────
 * Appearance.  The sandbox has no GPU (SwiftShader, ~2 fps in the city hub), so
 * the district's *look* — the pavement reading as stone, the forecourt as a
 * space, the parapet as a wall — needs the on-device (Android) check recorded in
 * AGENTS.md.  Nothing in this suite is visual acceptance.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  CIRCUS_WEST_X,
  CIRCUS_EAST_X,
  CIRCUS_SOUTH_Z,
  CIRCUS_CARCERES_WEST_X,
  CIRCUS_CARCERES_EAST_X,
  CIRCUS_CARCERES_FRONT_Z,
  CIRCUS_WEST_OUTLINE,
  type Collider,
  type RectCollider,
  type SegmentCollider,
} from './collisionShapes';
import {
  resolveCityMovement,
  BOUNDARY_X,
  BOUNDARY_Z_MIN,
  BOUNDARY_Z_MAX,
  CIRCUS_ENVELOPE_X_EAST,
  CIRCUS_ENVELOPE_Z_MIN,
  CIRCUS_ENVELOPE_Z_MAX,
  clampBoundaryX,
  clampBoundaryZ,
} from './cityCollisions';
import {
  ARENA_EAST_X,
  ARENA_WEST_X,
  CARAVANSERAI_SOUTH_Z,
  CIRCUS_APPROACH,
  CIRCUS_APPROACH_LINK,
  CIRCUS_FORECOURT,
  CIRCUS_FORECOURT_PARAPET,
  CIRCUS_SERVICE_LANE,
  CIRCUS_VIA,
  DISTRICT_KERBS,
  DISTRICT_ROADS,
  FORGE_EAST_X,
  FORGE_NORTH_Z,
  KERB_HEIGHT,
  STABLE_EAST_X,
  STABLE_SOUTH_Z,
  WORKSHOP_NORTH_Z,
} from './circusDistrictGeometry';
import { GROUND_PLANE_EAST_X, GROUND_PLANE_SOUTH_Z } from '../components/3d/city/ProcessionAvenue';

// ── Sources ────────────────────────────────────────────────────────────────
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const districtSrc = load('../components/3d/city/EastCircusDistrict.tsx');
const arenaSrc = load('../components/3d/city/EastCircusArena.tsx');
const sceneSrc = load('../components/3d/city/CityHubScene.tsx');
const geometrySrc = load('./circusDistrictGeometry.ts');

/** The arena's source asset — byte-identical through C-8.64A and this phase. */
const GLB_BYTES = readFileSync(new URL('../../public/_workspace_arena.glb', import.meta.url));

// ── Geometry helpers ───────────────────────────────────────────────────────
interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const boxOf = (r: { cx: number; cz: number; w: number; d: number }): Box => ({
  x0: r.cx - r.w / 2,
  x1: r.cx + r.w / 2,
  z0: r.cz - r.d / 2,
  z1: r.cz + r.d / 2,
});

const rectBox = (c: RectCollider): Box => ({
  x0: c.cx - c.hw,
  x1: c.cx + c.hw,
  z0: c.cz - c.hd,
  z1: c.cz + c.hd,
});

/** Axis-separated gap between two boxes (0 when they overlap). */
const gapBetween = (a: Box, b: Box): { x: number; z: number; dist: number } => {
  const x = Math.max(b.x0 - a.x1, a.x0 - b.x1, 0);
  const z = Math.max(b.z0 - a.z1, a.z0 - b.z1, 0);
  return { x, z, dist: Math.hypot(x, z) };
};

/** Overlap of two boxes, per axis (negative = separated). */
const overlapBetween = (a: Box, b: Box): { x: number; z: number } => ({
  x: Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0),
  z: Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0),
});

const rect = (id: string): RectCollider => {
  const c = CITY_COLLIDERS.find((k) => k.id === id) as RectCollider | undefined;
  if (!c) throw new Error(`no collider ${id}`);
  return c;
};

const inBox = (b: Box, x: number, z: number): boolean =>
  x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

const rects = CITY_COLLIDERS.filter((c): c is RectCollider => c.type === 'rect');
const isCircus = (c: Collider): boolean => c.id.startsWith('circus-');
const circusPerimeter = CITY_COLLIDERS.filter(isCircus) as SegmentCollider[];
const nonCircus = CITY_COLLIDERS.filter((c) => !isCircus(c));

/** Distance from a point to a collider, whatever its shape. */
const distanceTo = (c: Collider, x: number, z: number): number => {
  if (c.type === 'rect') {
    const b = rectBox(c);
    return Math.hypot(Math.max(b.x0 - x, x - b.x1, 0), Math.max(b.z0 - z, z - b.z1, 0));
  }
  if (c.type === 'circle') return Math.max(0, Math.hypot(x - c.cx, z - c.cz) - c.r);
  const dx = c.x2 - c.x1;
  const dz = c.z2 - c.z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - c.x1) * dx + (z - c.z1) * dz) / len2));
  return Math.hypot(x - (c.x1 + t * dx), z - (c.z1 + t * dz));
};

/**
 * Does any collider actually run THROUGH this pavement box?  A pavement that
 * abuts a building's face (the approach's west end against the Smithing Forge,
 * the service lane's against the Imperial Stable) is the intended "terminates at
 * a building line" arrangement, not a blocker — what this phase must not create
 * is a solid standing inside a road.  So the test is true interpenetration: a
 * positive overlap on both axes for a rectangle, or a shape that reaches into
 * the box for a segment or circle.
 */
const blocked = (b: Box): string[] => {
  const hits: string[] = [];
  for (const c of CITY_COLLIDERS) {
    if (c.type === 'rect') {
      const o = overlapBetween(b, rectBox(c));
      if (o.x > 1e-9 && o.z > 1e-9) hits.push(c.id);
      continue;
    }
    if (c.type === 'circle') {
      const nx = Math.max(b.x0, Math.min(c.cx, b.x1));
      const nz = Math.max(b.z0, Math.min(c.cz, b.z1));
      if (Math.hypot(c.cx - nx, c.cz - nz) < c.r) hits.push(c.id);
      continue;
    }
    // A segment: sample it finely enough that any crossing of the box is found.
    const len = Math.hypot(c.x2 - c.x1, c.z2 - c.z1);
    const steps = Math.max(2, Math.ceil(len / 0.05));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = c.x1 + (c.x2 - c.x1) * t;
      const z = c.z1 + (c.z2 - c.z1) * t;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
        hits.push(c.id);
        break;
      }
    }
  }
  return hits;
};

/** The shipped walk: 3.8 u/s in 0.1 s steps, stopping after 6 blocked steps. */
const driven = (
  start: [number, number, number],
  dir: [number, number],
  steps: number,
): [number, number, number][] => {
  const path: [number, number, number][] = [start];
  let pos = start;
  let stuck = 0;
  for (let i = 0; i < steps; i++) {
    const next = resolveCityMovement(pos, dir[0], dir[1], 3.8, 0.1);
    stuck = next[0] === pos[0] && next[2] === pos[2] ? stuck + 1 : 0;
    pos = next;
    path.push(pos);
    if (stuck > 5) break;
  }
  return path;
};

const last = (p: [number, number, number][]): [number, number, number] => p[p.length - 1];

/** Every step of a walk is clear of every collider… */
const clearOf = (path: [number, number, number][]): void => {
  for (const p of path) {
    expect(collidesWith(p[0], p[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  }
};

/** …and inside the movement envelope (an identity clamp means no boundary bite). */
const insideEnvelope = (path: [number, number, number][]): void => {
  for (const p of path) {
    expect(clampBoundaryX(p[0], p[2])).toBeCloseTo(p[0], 9);
    expect(clampBoundaryZ(p[0], p[2])).toBeCloseTo(p[2], 9);
  }
};

/** The arena floor: the sand slab's own footprint, shrunk by the player radius. */
const reachesInterior = (x: number, z: number): boolean =>
  x > 44.2 && x < 60.5 && z > -24.5 && z < 43.6;

const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol;

// ══════════════════════════════════════════════════════════════════════════
// A. The layout, measured
// ══════════════════════════════════════════════════════════════════════════

describe('A. The district layout', () => {
  test('the four runs are the measured rectangles the module derives', () => {
    expect(DISTRICT_ROADS.length).toBe(4);
    const b = boxOf(CIRCUS_APPROACH);
    expect(b).toMatchObject({ x0: FORGE_EAST_X, z0: 4.5, z1: 10.5 });
    expect(b.x1).toBeCloseTo(38.0, 9);
    expect(CIRCUS_APPROACH.d).toBeCloseTo(6.0, 9);

    const link = boxOf(CIRCUS_APPROACH_LINK);
    expect(link.x1).toBeCloseTo(FORGE_EAST_X, 9); // meets the approach along X 22.75
    expect(CIRCUS_APPROACH_LINK.d).toBeCloseTo(3.0, 9);
    expect(CIRCUS_APPROACH_LINK.cz - CIRCUS_APPROACH_LINK.d / 2).toBeCloseTo(FORGE_NORTH_Z + 0.15, 9);
    expect(CIRCUS_APPROACH_LINK.cz + CIRCUS_APPROACH_LINK.d / 2).toBeCloseTo(CARAVANSERAI_SOUTH_Z - 0.2, 9);

    const via = boxOf(CIRCUS_VIA);
    expect(via.x0).toBeCloseTo(BOUNDARY_X, 9); // the district's own west limit
    expect(via.x1).toBeCloseTo(ARENA_WEST_X - 0.38, 9); // 0.38 clear of the wall
    expect(via.z0).toBeCloseTo(10.5, 9); // starts at the approach's north edge
    expect(via.z1).toBeCloseTo(CIRCUS_FORECOURT.cz - CIRCUS_FORECOURT.d / 2, 9); // opens into the forecourt

    const lane = boxOf(CIRCUS_SERVICE_LANE);
    expect(lane.x0).toBeCloseTo(STABLE_EAST_X, 9); // leaves the stable's east face
    expect(lane.x1).toBeCloseTo(BOUNDARY_X, 9); // meets the north–south run
    expect(CIRCUS_SERVICE_LANE.d).toBeCloseTo(5.0, 9);
  });

  test('no two paved surfaces overlap — every pair meets flush or is separated', () => {
    const surfaces = [...DISTRICT_ROADS.map((r) => ({ id: r.id, box: boxOf(r) })),
      { id: CIRCUS_FORECOURT.id, box: boxOf(CIRCUS_FORECOURT) }];
    for (let i = 0; i < surfaces.length; i++) {
      for (let j = i + 1; j < surfaces.length; j++) {
        const o = overlapBetween(surfaces[i].box, surfaces[j].box);
        // Touching (overlap 0 on one axis) is the junction; anything strictly
        // positive on BOTH axes would z-fight.
        const interpenetrates = o.x > 1e-9 && o.z > 1e-9;
        expect({ pair: `${surfaces[i].id}/${surfaces[j].id}`, interpenetrates })
          .toMatchObject({ interpenetrates: false });
      }
    }
  });

  test('the junctions really are shared edges, not gaps', () => {
    const app = boxOf(CIRCUS_APPROACH);
    const via = boxOf(CIRCUS_VIA);
    expect(near(app.z1, via.z0, 1e-9)).toBe(true); // approach's north edge = via's start
    expect(via.x1 <= app.x1 + 1e-9 && via.x0 >= app.x0).toBe(true); // inside the approach's X span
    const link = boxOf(CIRCUS_APPROACH_LINK);
    expect(near(link.x1, app.x0, 1e-9)).toBe(true);
    const lane = boxOf(CIRCUS_SERVICE_LANE);
    expect(near(lane.x1, via.x0, 1e-9)).toBe(true);
    const fore = boxOf(CIRCUS_FORECOURT);
    expect(near(via.z1, fore.z0, 1e-9)).toBe(true);
    // …and the link meets the approach across the latter's west end, inside its
    // own Z band (the link's 3.00 sits inside the approach's 6.00).
    expect(link.z0).toBeGreaterThan(app.z0);
    expect(link.z1).toBeLessThan(app.z1);
    expect(near(link.x1, app.x0, 1e-9)).toBe(true);
  });

  test('every road keeps a usable width for the 0.80 player diameter', () => {
    for (const road of DISTRICT_ROADS) {
      const width = Math.min(road.w, road.d);
      // The band the player's CENTRE can occupy across the road, at minimum.
      const usable = width - 2 * PLAYER_RADIUS;
      expect({ id: road.id, usable: +usable.toFixed(3) })
        .toMatchObject({ usable: expect.any(Number) });
      expect(usable).toBeGreaterThanOrEqual(2 * PLAYER_RADIUS);
      expect(width).toBeGreaterThan(2 * PLAYER_RADIUS);
    }
    // The narrowest run is the arena frontage: 3.00 between the city limit and
    // the wall, 2.20 of centre band — 2.75× the player diameter.
    expect(Math.min(CIRCUS_VIA.w, CIRCUS_VIA.d)).toBeCloseTo(3.0, 9);
  });

  test('the forecourt faces the closed carceres end without covering it', () => {
    const fore = boxOf(CIRCUS_FORECOURT);
    expect(fore.z0).toBeCloseTo(CIRCUS_CARCERES_FRONT_Z + 0.1, 9);
    expect(fore.x0).toBeCloseTo(BOUNDARY_X, 9);
    expect(fore.x1).toBeCloseTo(ARENA_EAST_X - 0.8, 9);
    // Wider than the carceres block it faces, so it frames the front.
    expect(fore.x1 - fore.x0).toBeGreaterThan(CIRCUS_CARCERES_EAST_X - CIRCUS_CARCERES_WEST_X);
    // It starts SOUTH of the carceres' front face, so it never covers the block.
    expect(fore.z0).toBeGreaterThan(CIRCUS_CARCERES_FRONT_Z);
    expect(fore.z0).toBeGreaterThan(CIRCUS_SOUTH_Z);
    // …and it is a real space, not a strip.
    expect(fore.z1 - fore.z0).toBeGreaterThan(2 * (2 * PLAYER_RADIUS));
    expect((fore.z1 - fore.z0) * (fore.x1 - fore.x0)).toBeGreaterThan(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. Clearances against the real registry
// ══════════════════════════════════════════════════════════════════════════

describe('B. Clearances and the registry', () => {
  test('no pavement is blocked by any collider — every road stays open', () => {
    // `blocked` returns the colliders that touch a pavement's own footprint;
    // the registry's shapes are the ones the resolver uses, so an empty result
    // is the phase's "no blocker across the intended roads" requirement.
    for (const road of DISTRICT_ROADS) {
      expect({ id: road.id, hits: blocked(boxOf(road)) }).toMatchObject({ hits: [] });
    }
    expect({ id: CIRCUS_FORECOURT.id, hits: blocked(boxOf(CIRCUS_FORECOURT)) })
      .toMatchObject({ hits: [] });
  }, 30000);

  test('the named neighbours keep the measured clearances', () => {
    const measured: Record<string, number> = {};
    const neighbours = [
      'smithing-forge',
      'armor-workshop',
      'general-store',
      'merchant-house',
      'caravanserai',
      'stable',
      'gladiator-academy',
      'doctore-house',
      'records-library',
    ];
    for (const id of neighbours) {
      const b = rectBox(rect(id));
      measured[id] = Math.min(
        ...DISTRICT_ROADS.map((r) => gapBetween(boxOf(r), b).dist),
        gapBetween(boxOf(CIRCUS_FORECOURT), b).dist,
      );
    }
    // Approach: flush at the forge's east face, 0.50 under the workshop's north
    // face, 0.65 over the stable's south face.
    expect(measured['smithing-forge']).toBeCloseTo(0, 9);
    expect(measured['armor-workshop']).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(measured['stable']).toBeCloseTo(0, 9); // the service lane leaves its east face
    expect(measured['caravanserai']).toBeGreaterThanOrEqual(0.2 - 1e-9);
    // Nothing else is anywhere near the district.
    expect(measured['general-store']).toBeGreaterThan(1.0);
    expect(measured['merchant-house']).toBeGreaterThan(1.0);
    expect(measured['gladiator-academy']).toBeGreaterThan(1.0);
    expect(measured['doctore-house']).toBeGreaterThan(1.0);
    expect(measured['records-library']).toBeGreaterThan(1.0);
  }, 30000);

  test('the arena ring still clears the district by the same figures', () => {
    // The lane hugs the arena's west frontage: its east edge is 0.38 from the
    // wall line — the wall's own base band — while the resolver keeps a
    // 0.4-radius player 0.40 off the stone, so the pavement meets the wall
    // without the ring cutting the road: the whole standable band (up to
    // 37.98) lies on the slab (which reaches 38.00).
    expect(ARENA_WEST_X - (CIRCUS_VIA.cx + CIRCUS_VIA.w / 2)).toBeCloseTo(0.38, 9);
    expect(ARENA_WEST_X - PLAYER_RADIUS).toBeLessThanOrEqual(
      CIRCUS_VIA.cx + CIRCUS_VIA.w / 2);
    // The lane's centre line and the forecourt's interior keep a full player
    // radius from every `circus-*` segment.
    for (const c of circusPerimeter) {
      for (const p of [
        { x: CIRCUS_VIA.cx, z: 20 },
        { x: CIRCUS_VIA.cx, z: 40 },
        { x: 50.25, z: CIRCUS_FORECOURT.cz },
        { x: 40, z: CIRCUS_FORECOURT.cz },
      ]) {
        expect({ id: c.id, blocked: distanceTo(c, p.x, p.z) < PLAYER_RADIUS })
          .toMatchObject({ blocked: false });
      }
    }
  }, 30000);

  test('the registry grew by exactly one rectangle: the forecourt parapet', () => {
    expect(nonCircus.length).toBe(111); // 110 + this phase's parapet
    expect(CITY_COLLIDERS.length).toBe(142); // C-8.64A's 141 + 1
    expect(rects.length).toBe(32); // 31 + 1
    expect(circusPerimeter.length).toBe(31); // the arena perimeter is untouched
    expect(new Set(CITY_COLLIDERS.map((c) => c.id)).size).toBe(142);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length).toBe(46);
  });

  test('the parapet rectangle is exactly the layout module’s own numbers', () => {
    const p = rect(CIRCUS_FORECOURT_PARAPET.id);
    expect(p.cx).toBeCloseTo(CIRCUS_FORECOURT_PARAPET.cx, 9);
    expect(p.cz).toBeCloseTo(CIRCUS_FORECOURT_PARAPET.cz, 9);
    expect(p.hw * 2).toBeCloseTo(CIRCUS_FORECOURT_PARAPET.w, 9);
    expect(p.hd * 2).toBeCloseTo(CIRCUS_FORECOURT_PARAPET.d, 9);
    // Its outer face IS the district envelope's south limit.
    const outer = CIRCUS_FORECOURT_PARAPET.cz + CIRCUS_FORECOURT_PARAPET.d / 2;
    expect(outer).toBeCloseTo(CIRCUS_ENVELOPE_Z_MAX, 9);
    // It bounds the forecourt's south edge flush, and blocks no pavement.
    expect(CIRCUS_FORECOURT.cz + CIRCUS_FORECOURT.d / 2)
      .toBeCloseTo(CIRCUS_FORECOURT_PARAPET.cz - CIRCUS_FORECOURT_PARAPET.d / 2, 9);
    expect(near(overlapBetween(boxOf(CIRCUS_FORECOURT), rectBox(p)).z, 0, 1e-9)).toBe(true);
  });

  test('the kerbs are decorative, laid outside their roads', () => {
    expect(DISTRICT_KERBS.length).toBe(4); // 2 frontage kerbs + the west edge in two runs
    expect(KERB_HEIGHT).toBeCloseTo(0.16, 9);
    for (const kerb of DISTRICT_KERBS) {
      const kb = boxOf(kerb);
      // No kerb sits on a slab (that would z-fight).
      for (const road of DISTRICT_ROADS) {
        const o = overlapBetween(kb, boxOf(road));
        expect({ id: kerb.id, onSlab: o.x > 1e-9 && o.z > 1e-9 }).toMatchObject({ onSlab: false });
      }
      // …and none is registered as a collider.
      expect(CITY_COLLIDERS.some((c) => c.id === kerb.id)).toBe(false);
    }
    // The west edge kerbs mark the district's own west limit, split around the
    // service lane's junction so neither stands on the lane.
    const westN = DISTRICT_KERBS.find((k) => k.id === 'circus-boundary-kerb-w-n')!;
    const westS = DISTRICT_KERBS.find((k) => k.id === 'circus-boundary-kerb-w-s')!;
    for (const k of [westN, westS]) {
      expect(k.cx + k.w / 2).toBeCloseTo(BOUNDARY_X, 9);
    }
    expect(boxOf(westN).z0).toBeCloseTo(boxOf(CIRCUS_APPROACH).z1 + 0.4, 9);
    expect(boxOf(westN).z1).toBeCloseTo(boxOf(CIRCUS_SERVICE_LANE).z0 - 0.4, 9);
    expect(boxOf(westS).z0).toBeCloseTo(boxOf(CIRCUS_SERVICE_LANE).z1 + 0.4, 9);
    expect(boxOf(westS).z1).toBeCloseTo(
      CIRCUS_FORECOURT_PARAPET.cz + CIRCUS_FORECOURT_PARAPET.d / 2, 9);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The driven route, both directions
// ══════════════════════════════════════════════════════════════════════════

describe('C. Driven routes with the real resolver', () => {
  test('the primary route runs from the forum to the forecourt, collision-free', () => {
    // 1. the forum link, eastbound from the plaza's own paving.
    const link = driven([16.0, 0, CIRCUS_APPROACH_LINK.cz], [1, 0], 30);
    expect(last(link)[0]).toBeGreaterThan(22.0);
    clearOf(link);
    insideEnvelope(link);

    // 2. the approach, eastbound: crossing the forge/workshop/stable gap.
    const approach = driven([23.2, 0, CIRCUS_APPROACH.cz], [1, 0], 40);
    expect(last(approach)[0]).toBeGreaterThan(35.0);
    clearOf(approach);
    insideEnvelope(approach);

    // 3. the arena frontage, southbound into the forecourt.
    const via = driven([last(approach)[0], 0, 12.0], [0, 1], 120);
    const end = last(via);
    expect(end[2]).toBeGreaterThan(CIRCUS_FORECOURT.cz - CIRCUS_FORECOURT.d / 2);
    expect(inBox(boxOf(CIRCUS_FORECOURT), end[0], end[2])).toBe(true);
    clearOf(via);
    insideEnvelope(via);
  }, 30000);

  test('the reverse route runs from the forecourt back to the city', () => {
    // Northbound up the arena frontage…
    const via = driven([CIRCUS_VIA.cx, 0, 52.0], [0, -1], 120);
    const end = last(via);
    expect(end[2]).toBeLessThan(boxOf(CIRCUS_APPROACH).z1);
    clearOf(via);
    insideEnvelope(via);
    // …then westbound through the gap to the forum link.
    const approach = driven([end[0], 0, CIRCUS_APPROACH.cz], [-1, 0], 40);
    expect(last(approach)[0]).toBeLessThan(24.0);
    clearOf(approach);
    insideEnvelope(approach);
    const link = driven([last(approach)[0], 0, CIRCUS_APPROACH_LINK.cz], [-1, 0], 30);
    expect(last(link)[0]).toBeLessThan(20.0);
    clearOf(link);
    insideEnvelope(link);
  }, 30000);

  test('the secondary lane is a real second route', () => {
    const west = driven([STABLE_EAST_X + 0.05, 0, CIRCUS_SERVICE_LANE.cz], [1, 0], 25);
    expect(last(west)[0]).toBeGreaterThan(BOUNDARY_X - 1e-9);
    clearOf(west);
    insideEnvelope(west);
    // From there the frontage run carries on south to the forecourt.
    const south = driven([CIRCUS_VIA.cx, 0, CIRCUS_SERVICE_LANE.cz], [0, 1], 100);
    expect(last(south)[2]).toBeGreaterThan(boxOf(CIRCUS_FORECOURT).z0);
    clearOf(south);
    insideEnvelope(south);
  }, 30000);

  test('every road is traversable across its full width', () => {
    // The centre and both edges of the usable band, for the two narrow runs.
    for (const offset of [-1.05, 0, 1.05]) {
      const x = CIRCUS_VIA.cx + offset;
      expect(x - PLAYER_RADIUS).toBeGreaterThanOrEqual(BOUNDARY_X - 1e-9);
      expect(x + PLAYER_RADIUS).toBeLessThanOrEqual(ARENA_WEST_X + 1e-9);
      const path = driven([x, 0, 12.0], [0, 1], 110);
      expect({ offset, z: +last(path)[2].toFixed(2) })
        .toMatchObject({ z: expect.any(Number) });
      expect(last(path)[2]).toBeGreaterThan(boxOf(CIRCUS_FORECOURT).z0);
      clearOf(path);
    }
    for (const offset of [-2.1, 0, 2.1]) {
      const z = CIRCUS_APPROACH.cz + offset;
      const path = driven([24.0, 0, z], [1, 0], 40);
      expect(last(path)[0]).toBeGreaterThan(34.0);
      clearOf(path);
    }
  }, 30000);

  test('the junctions let the route turn, and the arena wall is the only stop', () => {
    // Approach ↔ frontage junction: east is stopped by the wall within a step
    // of contact; south is open (the turn the route takes).
    const east = driven([CIRCUS_VIA.cx, 0, CIRCUS_APPROACH.cz], [1, 0], 12);
    const contact = ARENA_WEST_X - PLAYER_RADIUS;
    expect(last(east)[0]).toBeGreaterThan(contact - 0.38);
    expect(last(east)[0]).toBeLessThan(ARENA_WEST_X);
    clearOf(east);
    const south = driven([CIRCUS_VIA.cx, 0, CIRCUS_APPROACH.cz], [0, 1], 12);
    expect(last(south)[2]).toBeGreaterThan(boxOf(CIRCUS_APPROACH).z1 + 0.9);
    clearOf(south);

    // Service-lane ↔ frontage junction: east blocked by the wall, west open.
    const laneEast = driven([CIRCUS_VIA.cx, 0, CIRCUS_SERVICE_LANE.cz], [1, 0], 12);
    expect(last(laneEast)[0]).toBeLessThan(ARENA_WEST_X);
    expect(last(laneEast)[0]).toBeLessThanOrEqual(ARENA_WEST_X - PLAYER_RADIUS + 1e-9);
    clearOf(laneEast);

    // Link ↔ approach junction: west is open (the route out to the forum).
    const west = driven([FORGE_EAST_X - 0.05, 0, CIRCUS_APPROACH_LINK.cz], [-1, 0], 20);
    expect(last(west)[0]).toBeLessThan(FORGE_EAST_X - 3);
    clearOf(west);
  }, 30000);
});

// ══════════════════════════════════════════════════════════════════════════
// D. The forecourt perimeter and the closed arena
// ══════════════════════════════════════════════════════════════════════════

describe('D. The forecourt', () => {
  test('the parapet closes the forecourt’s south edge', () => {
    const push = driven([50.0, 0, CIRCUS_FORECOURT.cz], [0, 1], 40);
    const z = last(push)[2];
    const contact = CIRCUS_FORECOURT_PARAPET.cz - CIRCUS_FORECOURT_PARAPET.d / 2 - PLAYER_RADIUS;
    expect(z).toBeLessThan(CIRCUS_FORECOURT_PARAPET.cz - CIRCUS_FORECOURT_PARAPET.d / 2);
    expect(z).toBeGreaterThan(contact - 0.38);
    clearOf(push);
  }, 30000);

  test('the parapet stops a walk at every point across its length', () => {
    for (const x of [36.0, 43.0, 52.34, 61.0, 65.0]) {
      const push = driven([x, 0, CIRCUS_FORECOURT.cz], [0, 1], 40);
      const z = last(push)[2];
      expect({ x, passes: z > CIRCUS_FORECOURT_PARAPET.cz }).toMatchObject({ passes: false });
      clearOf(push);
    }
  }, 30000);

  test('the player cannot enter the arena through its closed carceres end', () => {
    const push = driven([52.34, 0, CIRCUS_FORECOURT.cz], [0, -1], 40);
    const p = last(push);
    expect(p[2]).toBeGreaterThan(CIRCUS_CARCERES_FRONT_Z);
    expect(reachesInterior(p[0], p[2])).toBe(false);
    for (const step of push) {
      expect({ interior: reachesInterior(step[0], step[2]) }).toMatchObject({ interior: false });
      expect(collidesWith(step[0], step[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
    // The whole forecourt's north edge is refused, not just the axis.
    for (const x of [40.0, 44.0, 48.0, 56.0, 60.0, 64.0]) {
      const walk = driven([x, 0, CIRCUS_FORECOURT.cz], [0, -1], 40);
      expect({ x, inside: reachesInterior(last(walk)[0], last(walk)[2]) })
        .toMatchObject({ inside: false });
      expect(last(walk)[2]).toBeGreaterThan(CIRCUS_SOUTH_Z);
      clearOf(walk);
    }
  }, 30000);

  test('the forecourt opens east into the perimeter corridor (the district loops)', () => {
    const east = driven([61.0, 0, CIRCUS_FORECOURT.cz], [1, 0], 40);
    expect(last(east)[0]).toBeGreaterThan(CIRCUS_EAST_X);
    clearOf(east);
    insideEnvelope(east);
    // …and from there the corridor runs north around the arena.
    const north = driven([last(east)[0], 0, CIRCUS_FORECOURT.cz], [0, -1], 90);
    expect(last(north)[2]).toBeLessThan(CIRCUS_SOUTH_Z);
    clearOf(north);
    insideEnvelope(north);
  }, 30000);

  test('the forecourt pavement itself is entirely standable', () => {
    const b = boxOf(CIRCUS_FORECOURT);
    let cells = 0;
    // The carceres' front face is a collider at Z 46.00, so the pavement's own
    // first 0.40 (the player's radius) is the band its body occupies rather than
    // its centre: the grid starts a clear radius in.
    for (let x = b.x0 + 0.25; x <= b.x1; x += 0.75) {
      for (let z = b.z0 + PLAYER_RADIUS + 0.05; z <= b.z1 - 0.25; z += 0.75) {
        // Only cells the envelope actually lets the player reach.
        if (clampBoundaryX(x, z) !== x) continue;
        cells++;
        expect({ x: +x.toFixed(2), z: +z.toFixed(2), blocked: collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS) })
          .toMatchObject({ blocked: false });
      }
    }
    expect(cells).toBeGreaterThan(150);
  }, 30000);
});

// ══════════════════════════════════════════════════════════════════════════
// E. The movement envelope
// ══════════════════════════════════════════════════════════════════════════

describe('E. The movement envelope', () => {
  test('the city square is bit-for-bit what it was', () => {
    expect(BOUNDARY_X).toBe(35);
    expect(BOUNDARY_Z_MAX).toBe(35);
    expect(BOUNDARY_Z_MIN).toBe(-101);
    expect(clampBoundaryX(20, 30)).toBeCloseTo(20, 9);
    expect(clampBoundaryZ(20, 40)).toBe(BOUNDARY_Z_MAX);
    expect(clampBoundaryZ(34, 30)).toBeCloseTo(30, 9);
  });

  test('the district band now reaches the forecourt parapet and no further', () => {
    expect(CIRCUS_ENVELOPE_X_EAST).toBe(67.5);
    expect(CIRCUS_ENVELOPE_Z_MIN).toBe(-35.0);
    expect(CIRCUS_ENVELOPE_Z_MAX).toBe(55.0);
    expect(CIRCUS_ENVELOPE_Z_MAX).toBeCloseTo(
      CIRCUS_FORECOURT_PARAPET.cz + CIRCUS_FORECOURT_PARAPET.d / 2, 9);
    // The whole forecourt pavement is inside the band…
    expect(boxOf(CIRCUS_FORECOURT).z1).toBeLessThan(CIRCUS_ENVELOPE_Z_MAX);
    // …and the band is the smallest limit that fits it (one 0.38 step wider
    // would open ground behind the wall).
    expect(CIRCUS_ENVELOPE_Z_MAX - boxOf(CIRCUS_FORECOURT).z1).toBeCloseTo(
      CIRCUS_FORECOURT_PARAPET.d, 9);
    expect(clampBoundaryZ(50, 55.0)).toBeCloseTo(55.0, 9);
    expect(clampBoundaryZ(50, 60.0)).toBeCloseTo(55.0, 9);
  });

  test('the district is reachable from the city and keeps its own limits', () => {
    const east = driven([30.0, 0, 0.0], [1, 0], 20);
    expect(last(east)[0]).toBeGreaterThan(BOUNDARY_X + 1);
    // The city's own southern limit still holds west of it…
    const citySouth = driven([20.0, 0, 30.0], [0, 1], 30);
    expect(last(citySouth)[2]).toBeCloseTo(BOUNDARY_Z_MAX, 6);
    // …and east of it the walk leaves the city square's own Z band and is stopped
    // by the forecourt's south parapet, short of the district limit.
    // The start is the forecourt's north band, NOT the C-8.64A apron line this
    // test walked before the band moved south: (50, 40) lies INSIDE the arena's
    // closed ring (the carceres front face at Z 46.00 is the ring's south
    // boundary), so the only exterior start on this axis is 0.5 south of the
    // carceres apron, on the forecourt's own pavement.
    const parapetFace = CIRCUS_FORECOURT_PARAPET.cz - CIRCUS_FORECOURT_PARAPET.d / 2;
    const districtSouth = driven([50.0, 0, boxOf(CIRCUS_FORECOURT).z0 + 0.5], [0, 1], 60);
    const zEnd = last(districtSouth)[2];
    expect(zEnd).toBeGreaterThan(BOUNDARY_Z_MAX); // past the city square's own limit
    expect(zEnd).toBeGreaterThan(CIRCUS_FORECOURT.cz); // into the forecourt's south half
    expect(zEnd).toBeLessThan(CIRCUS_ENVELOPE_Z_MAX); // short of the district's limit
    expect(zEnd).toBeLessThan(parapetFace); // never inside the wall
    // Stopped at the parapet's own contact line, within one 0.38 walk step.
    expect(parapetFace - PLAYER_RADIUS - zEnd).toBeLessThanOrEqual(0.38 + 1e-9);
    expect(zEnd).toBeGreaterThan(parapetFace - PLAYER_RADIUS - 0.38 - 1e-9);
    clearOf(districtSouth);
    // The north limit is C-8.64A's, unchanged.
    expect(clampBoundaryZ(50, CIRCUS_ENVELOPE_Z_MIN - 3)).toBeCloseTo(CIRCUS_ENVELOPE_Z_MIN, 9);
  }, 30000);

  test('the shared edge X = 35 is consistent in both axes', () => {
    // South of the city the district band's west floor is the city limit: a
    // westward move is stopped there instead of being clamped into the square.
    expect(clampBoundaryX(34, 50)).toBe(BOUNDARY_X);
    expect(clampBoundaryX(30, 40)).toBe(BOUNDARY_X);
    expect(clampBoundaryX(20, 34)).toBeCloseTo(20, 9); // inside the square's Z range: untouched
    // A player clamped exactly onto the limit is district-side, so the Z clamp
    // does not pull them north.
    expect(clampBoundaryZ(BOUNDARY_X, 50)).toBeCloseTo(50, 9);
    expect(clampBoundaryZ(BOUNDARY_X, 40)).toBeCloseTo(40, 9);
    // The walk that used to teleport: westbound from (36, 50).
    const walk = driven([36.0, 0, 50.0], [-1, 0], 12);
    for (const step of walk) {
      expect({ z: +step[2].toFixed(6) }).toMatchObject({ z: 50 }); // never snapped north
      expect(step[0]).toBeGreaterThanOrEqual(BOUNDARY_X - 1e-9);
    }
    expect(last(walk)[0]).toBeCloseTo(BOUNDARY_X, 6);
    clearOf(walk);
  }, 30000);

  test('nothing about the district is reachable without pavement under it', () => {
    // The routes stand on the four runs, and the runs reach the forecourt.
    const fore = boxOf(CIRCUS_FORECOURT);
    const reachesForecourt = DISTRICT_ROADS.some((r) =>
      near(boxOf(r).z1, fore.z0, 1e-9) || near(boxOf(r).x1, fore.x0, 1e-9));
    expect(reachesForecourt).toBe(true);
    // The pavement never leaves the envelope (roads cannot stick out of the band).
    for (const road of [...DISTRICT_ROADS, CIRCUS_FORECOURT]) {
      const b = boxOf(road);
      expect(clampBoundaryZ(b.x0 + 0.4, b.z0 + 0.4)).toBeCloseTo(b.z0 + 0.4, 9);
      expect(clampBoundaryX(b.x0 + 0.4, b.z0 + 0.4)).toBeCloseTo(b.x0 + 0.4, 9);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Control — the pre-C-8.64B envelope
// ══════════════════════════════════════════════════════════════════════════

describe('F. The envelope change is load-bearing', () => {
  // C-8.64A's own rules, replayed exactly: band south limit 47.5, district only
  // strictly east of BOUNDARY_X, and no west-floor rule.
  const oldClampX = (x: number, z: number): number => {
    const east = z >= CIRCUS_ENVELOPE_Z_MIN && z <= 47.5 ? CIRCUS_ENVELOPE_X_EAST : BOUNDARY_X;
    return Math.max(-BOUNDARY_X, Math.min(east, x));
  };
  const oldClampZ = (x: number, z: number): number => {
    const inDistrict = x > BOUNDARY_X;
    return Math.max(inDistrict ? CIRCUS_ENVELOPE_Z_MIN : BOUNDARY_Z_MIN,
      Math.min(inDistrict ? 47.5 : BOUNDARY_Z_MAX, z));
  };

  test('the old band left the forecourt’s south half out of bounds', () => {
    const z = CIRCUS_FORECOURT.cz; // 50.30, dead centre of the new forecourt
    expect(oldClampZ(50, z)).toBe(47.5); // out of bounds under C-8.64A
    expect(clampBoundaryZ(50, z)).toBeCloseTo(z, 9); // in bounds now
    // The parapet's own line was outside it too — the wall could not be reached.
    expect(oldClampZ(50, CIRCUS_FORECOURT_PARAPET.cz)).toBe(47.5);
    expect(oldClampZ(50, CIRCUS_ENVELOPE_Z_MAX)).toBe(47.5);
  });

  test('the old clamps teleported a player walking west off the forecourt', () => {
    // One step west from (36, 50): X clamps to 35 (the band is open, its floor
    // is −35 in the old rule), then Z clamps at x = 35 — which is NOT
    // district-side under the old rule — and the player is snapped 15 units
    // north, into the city square's own Z band.
    const x = oldClampX(36 - 0.38, 50);
    const z = oldClampZ(x, 50);
    expect(x).toBeCloseTo(35, 9);
    expect(z).toBe(35);
    expect(Math.abs(z - 50)).toBeGreaterThan(14);
    // The shipped rules hold the same position instead: one step west keeps its
    // X (35.62), a further push stops on the district's own west limit —
    // BOUNDARY_X — and the Z is untouched either way.
    expect(clampBoundaryX(36 - 0.38, 50)).toBeCloseTo(35.62, 9);
    expect(clampBoundaryX(30, 50)).toBe(BOUNDARY_X);
    expect(clampBoundaryZ(clampBoundaryX(36 - 0.38, 50), 50)).toBeCloseTo(50, 9);
  });

  test('the shipped rules keep every C-8.64A guarantee', () => {
    // Outside the band the city square's own limits are untouched…
    expect(clampBoundaryX(37.8, CIRCUS_ENVELOPE_Z_MAX + 5)).toBe(BOUNDARY_X);
    expect(clampBoundaryX(37.8, CIRCUS_ENVELOPE_Z_MIN - 5)).toBe(BOUNDARY_X);
    expect(clampBoundaryZ(0, 37.8)).toBe(BOUNDARY_Z_MAX);
    expect(clampBoundaryZ(40, CIRCUS_ENVELOPE_Z_MIN - 3.8)).toBeCloseTo(CIRCUS_ENVELOPE_Z_MIN, 9);
    // …and inside it the arena's own approaches still work.
    for (const [x, z] of [
      [52.34, CIRCUS_SOUTH_Z],
      [52.34, CIRCUS_CARCERES_FRONT_Z + 1.0],
      [52.34, -30.08],
      [52.34, -30.65],
    ] as Array<[number, number]>) {
      expect(clampBoundaryX(x, z)).toBeCloseTo(x, 9);
      expect(clampBoundaryZ(x, z)).toBeCloseTo(z, 9);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. What did not move
// ══════════════════════════════════════════════════════════════════════════

describe('G. Scope guard', () => {
  test('the arena asset and its transform are untouched', () => {
    const blob = createHash('sha1')
      .update(`blob ${GLB_BYTES.length}\0`, 'utf8')
      .update(GLB_BYTES)
      .digest('hex');
    expect(blob).toBe('d701424aab906c0b6af850cb7874505efe3d4809');
    // C-8.69B derived the arena's Y from the ground plane plus a 0.05 ground
    // clearance, so the pin is the derivation and its operands, not a literal.
    expect(arenaSrc).toContain('export const CIRCUS_ARENA_GROUND_CLEARANCE = 0.05;');
    expect(arenaSrc).toContain('GROUND_PLANE_ELEVATION_Y + CIRCUS_ARENA_GROUND_CLEARANCE');
    expect(arenaSrc).toContain('52.34,');
    expect(arenaSrc).toContain('43.8,');
    expect(arenaSrc).toContain('Math.PI / 2');
    expect(arenaSrc).toContain('0.2');
    // The district adds nothing to the arena component.
    expect(districtSrc.includes('_workspace_arena.glb')).toBe(false);
  });

  test('the arena perimeter is still C-8.64A’s closed 31-segment ring', () => {
    // Re-derived from the same outline the registry builds it from: 7 straights
    // plus 24 chords of the 13-point profile (12 per side, meeting at the apex).
    const mirror = (x: number) => 2 * 52.34 - x;
    expect(CIRCUS_WEST_OUTLINE.length).toBe(13);
    const expected = 7 + (CIRCUS_WEST_OUTLINE.length - 1) * 2;
    expect(expected).toBe(31);
    expect(circusPerimeter.length).toBe(31);
    expect(circusPerimeter.every((c) => c.type === 'segment')).toBe(true);
    // Every segment still joins end to end — the ring has no free end.
    const key = (x: number, z: number) => `${x.toFixed(9)}|${z.toFixed(9)}`;
    const ends = new Map<string, number>();
    for (const s of circusPerimeter) {
      for (const k of [key(s.x1, s.z1), key(s.x2, s.z2)]) {
        ends.set(k, (ends.get(k) ?? 0) + 1);
      }
    }
    for (const [k, n] of ends) {
      expect({ k, joined: n >= 2 }).toMatchObject({ joined: true });
    }
    // …and its two north cap endpoints are the axis apex and its mirror.
    expect(ends.has(key(52.34, -30.65))).toBe(true);
    expect(mirror(CIRCUS_WEST_OUTLINE[0][0])).toBeCloseTo(CIRCUS_EAST_X, 9);
  });

  test('the district uses only the city’s existing road materials', () => {
    expect(districtSrc).toContain("from './RomanStreetPavement'");
    expect(districtSrc).toContain('RomanPavedStreet');
    expect(districtSrc).toContain('ROMAN_PALETTE.forumPaving');
    expect(districtSrc).toContain('ROMAN_PALETTE.goldAccent');
    expect(districtSrc).toContain('ROMAN_PALETTE.roadKerb');
    // No new light sources, no per-frame state, no asset of its own.
    expect(districtSrc.includes('pointLight')).toBe(false);
    expect(districtSrc.includes('spotLight')).toBe(false);
    expect(districtSrc.includes('useState')).toBe(false);
    expect(districtSrc.includes('useFrame')).toBe(false);
    // No GLB is loaded, no scene or mesh is cloned, and the paving primitive is
    // not re-implemented.  The one `clone(` in the file is the documented bump
    // map, which shares the shared NOISE_TEXTURE's canvas image (zero memory)
    // exactly as ProcessionAvenue's plaza and ground bump maps do.
    const code = districtSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    const clones = code.split('clone(').length - 1;
    expect(clones).toBe(1);
    expect(code).toContain('NOISE_TEXTURE.clone()');
    expect(districtSrc.includes('useGLTF')).toBe(false);
    expect(districtSrc.includes('gltf')).toBe(false);
    // Every footprint comes from the layout module, not a literal here.
    expect(districtSrc).toContain("from '../../../utils/circusDistrictGeometry'");
    expect(districtSrc.includes('position={[52.34')).toBe(false);
  });

  test('the layout module is pure, and the district is mounted exactly once', () => {
    expect(geometrySrc.includes("from 'three'")).toBe(false);
    expect(geometrySrc.includes("from 'react'")).toBe(false);
    expect(geometrySrc.includes('useGLTF')).toBe(false);
    const mounts = sceneSrc.split('<EastCircusDistrict').length - 1;
    expect(mounts).toBe(1);
    expect(sceneSrc.split('<EastCircusArena').length - 1).toBe(1);
  });

  test('the roads sit on the city’s existing ground plane', () => {
    // The plane already spans the whole district: no ground-plane change was
    // needed, and none was made (the phase adds pavement, not terrain).
    const fore = boxOf(CIRCUS_FORECOURT);
    expect(GROUND_PLANE_EAST_X).toBeGreaterThan(ARENA_EAST_X + 1.0);
    expect(GROUND_PLANE_SOUTH_Z).toBeGreaterThan(fore.z1 + 4);
    expect(CIRCUS_ENVELOPE_X_EAST).toBeLessThan(GROUND_PLANE_EAST_X);
    expect(CIRCUS_ENVELOPE_Z_MAX).toBeLessThan(GROUND_PLANE_SOUTH_Z);
  });
});
