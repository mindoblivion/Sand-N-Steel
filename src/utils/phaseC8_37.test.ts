/**
 * Phase C-8.37 — Northern landmark separation.
 *
 * Run with: bun test src/utils/phaseC8_37.test.ts
 *
 * ── WHY THE GROUP MOVED ────────────────────────────────────────────────────
 * The northern group — motte, moat ring, drawbridge and fortress — stood with
 * its centre at Z = −71.5, which put the moat's outer shoreline (Z = −40.5)
 * *inside* the Colosseum's rear gateway: the Colosseum's rear stone reaches
 * Z = −44.11 at its gate jambs, and the drawbridge's southern 3.6 units lay
 * south of that line, i.e. under the building.  The whole group moved 5.0
 * world units north, to MOTTE_CENTER_Z = −76.5, so the moat's outer shoreline
 * now sits at −45.5 — 1.39 units clear of the rear stone — and the drawbridge
 * no longer enters the gateway at all.  The Colosseum, its rear gate, its bowl
 * cut and its C-8.33 seals did not move.
 *
 * Phase C-8.38 moved the same group a further 5.0 north (MOTTE_CENTER_Z
 * −76.5 → −81.5) to give the northern approach a readable composition: the
 * 1.39-unit clearance this phase bought was still narrow enough that the water
 * lapped the gateway threshold and the deck began inside the gateway's own
 * silhouette.  This suite is rebased onto that centre — the *properties* it
 * pins (the group is one constant, the route is walkable, the ground covers the
 * envelope, no city collider overlaps the group, the shift is what makes the
 * checks pass) are unchanged, and C-8.37's own intermediate values (−71.5 →
 * −76.5) are kept below as recorded references rather than restated.
 *
 * ── HOW IT WAS MOVED ──────────────────────────────────────────────────────
 * Every dependent transform is now *derived* from terrainHeight's
 * MOTTE_CENTER_Z rather than repeating a literal: NorthernMotte's group, the
 * moat ring's centre, NorthernFortress's group, Drawbridge's deck span,
 * collisionShapes' fortress walls and motte perimeter, and cityCollisions'
 * north boundary, fortress hub centre and fast-travel arrival.  The group can
 * therefore only move as a group, and §B asserts exactly that (§B also fails
 * if an absolute centre literal reappears in any of those five files).
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   A. the relocation itself and the increased landmark separation;
 *   B. one motte-centre-derived transform per part (motte, moat, fortress,
 *      drawbridge, registry, boundaries);
 *   C. the drawbridge-to-gate alignment and the continuous walkable route
 *      (driven with the real `resolveCityMovement`, not asserted on paper);
 *   D. ground-plane coverage, terrain boundaries and fast-travel arrivals;
 *   E. preservation of the C-8.33 rear-gate seals and the C-8.36 water ring;
 *   F. no newly introduced intersection with any nearby city structure;
 *   G. a reversed-shift control, so the checks are shown to be sensitive to
 *      the very move they pin.
 *
 * Every "before" figure below is measured against the same registry at the
 * recorded pre-shift centre (−71.5) rather than restated as a literal.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  MOTTE_CENTER_X,
  MOTTE_CENTER_Z,
  MOTTE_SCALE,
  MOTTE_PERIMETER_RADIUS,
  SUMMIT_Y,
  SUMMIT_SLOPE_FOOT_RADIUS,
  SUMMIT_CARDINAL_RADIUS,
  getTerrainY,
  isOnBridge,
  summitLevel,
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z_OUTER,
  BRIDGE_Z_INNER,
} from './terrainHeight';
import {
  MOAT_INNER_RADIUS,
  MOAT_OUTER_RADIUS,
  MOAT_WATER_Y,
  MOAT_GAP_HALF_ANGLE,
} from '../components/3d/city/NorthernMotte';
import {
  DECK_Z_OUTER,
  DECK_Z_INNER,
  DECK_LENGTH,
  DECK_CENTER_Z,
  DECK_TOP_Y,
  DECK_UNDERSIDE_Y,
  BEAM_WIDTH,
} from '../components/3d/city/Drawbridge';
import {
  GROUND_PLANE_WIDTH,
  GROUND_PLANE_DEPTH,
  GROUND_PLANE_ELEVATION_Y,
  GROUND_PLANE_CENTER,
  GROUND_PLANE_NORTH_Z,
  GROUND_PLANE_SOUTH_Z,
  GROUND_PLANE_WEST_X,
  GROUND_PLANE_EAST_X,
} from '../components/3d/city/ProcessionAvenue';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type Collider,
  type SegmentCollider,
} from './collisionShapes';
import {
  BOUNDARY_X,
  BOUNDARY_Z_MIN,
  BOUNDARY_Z_MAX,
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  resolveCityMovement,
  getNearbyHubLocation,
  // Phase C-8.70B — the walkable envelope's own clamps.
  clampBoundaryX,
  clampBoundaryZ,
} from './cityCollisions';

// ── Recorded references ─────────────────────────────────────────────────────

/** The motte centre before this phase (Phase 35F.5 value). */
const PRE_SHIFT_MOTTE_CENTER_Z = -71.5;
/** The centre this phase produced, before Phase C-8.38's second 5.0 move. */
const C8_37_MOTTE_CENTER_Z = -76.5;
/** The centre both moves produced — what every live transform reads today. */
const C8_38_MOTTE_CENTER_Z = -81.5;
/** The plane's north edge before this phase (Ground Coverage phase value). */
const PRE_SHIFT_GROUND_PLANE_NORTH_Z = -104;
/** Post-shift deck's south end (Phase 35E + Drawbridge Alignment 2 value). */
const PRE_SHIFT_DECK_Z_OUTER = -40.5;

/**
 * The Colosseum's rear-MOST rendered stone, not just its registered one: the
 * tier-1 cornice / tier ledge ring (outer radius 19.5, GrandColosseum.tsx)
 * runs straight over the rear gate as its lintel, so at the X = 0 axis it
 * reaches Z = -25 - 19.5 = -44.5 — 0.2 north of the facade plane.  The moat's
 * outer bank is measured against this stone.
 */
const COLO_LINTEL_Z = -44.5;

/**
 * The Colosseum's rear facade plane: GrandColosseum's root [0, 0, −25] minus
 * R_FACADE 19.3 (see AGENTS.md, C-8.30/C-8.31).  The registered rear stone
 * stops 0.19 south of it because the axial gate cuts the drum there.
 */
const COLO_FACADE_PLANE_Z = -44.3;

/** Motte base ring: 80 model units × MOTTE_SCALE — the mesh's plan footprint. */
const MOTTE_MESH_HALF_EXTENT = 80 * MOTTE_SCALE; // 25.16
/** Widest lateral extent of the bridge: the outer face of a side beam. */
const FOOTPRINT_HALF_W = BRIDGE_HALF_WIDTH + BEAM_WIDTH / 2; // 2.11
/** The fortress's own 21×21 world half-footprint at scale 0.30. */
const FORTRESS_HALF = 10.5;
/** Half thickness of each fortress wall rect. */
const FORTRESS_WALL_HALF_D = 0.6;
const FORTRESS_SOUTH_WALL_CZ = MOTTE_CENTER_Z + FORTRESS_HALF;                 // -66.0
const FORTRESS_SOUTH_WALL_INNER_Z = FORTRESS_SOUTH_WALL_CZ - FORTRESS_WALL_HALF_D; // -66.6
const FORTRESS_NORTH_WALL_INNER_Z = MOTTE_CENTER_Z - FORTRESS_HALF + FORTRESS_WALL_HALF_D; // -86.4
/** Motte-centre-relative arrival (cityCollisions FAST_TRAVEL_ARRIVALS). */
const FORTRESS_ARRIVAL_Z = MOTTE_CENTER_Z + 12.5;                              // -64.0
/** The northern group's plan extent: the moat ring's outer shoreline. */
const GROUP_NORTH_Z = MOTTE_CENTER_Z - MOAT_OUTER_RADIUS;                      // -107.5
const GROUP_SOUTH_Z = MOTTE_CENTER_Z + MOAT_OUTER_RADIUS;                      // -45.5

// ── Sources the transforms live in ──────────────────────────────────────────

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const motteSrc = load('../components/3d/city/NorthernMotte.tsx');
const fortressSrc = load('../components/3d/city/NorthernFortress.tsx');
const drawbridgeSrc = load('../components/3d/city/Drawbridge.tsx');
const collisionSrc = load('./collisionShapes.ts');
const cityCollisionsSrc = load('./cityCollisions.ts');

/** The five files whose northern transforms must all derive from the centre. */
const DERIVED_SOURCES: Array<[string, string]> = [
  ['NorthernMotte', motteSrc],
  ['NorthernFortress', fortressSrc],
  ['Drawbridge', drawbridgeSrc],
  ['collisionShapes', collisionSrc],
  ['cityCollisions', cityCollisionsSrc],
];

/** Strip comments, so a literal is only detected in executable code. */
const codeOf = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ── Geometry helpers ────────────────────────────────────────────────────────

interface Box { minX: number; maxX: number; minZ: number; maxZ: number }

/** Conservative axis-aligned bounds of a collider (a no-overlap proof). */
function aabb(c: Collider): Box {
  if (c.type === 'rect') {
    return { minX: c.cx - c.hw, maxX: c.cx + c.hw, minZ: c.cz - c.hd, maxZ: c.cz + c.hd };
  }
  if (c.type === 'circle') {
    return { minX: c.cx - c.r, maxX: c.cx + c.r, minZ: c.cz - c.r, maxZ: c.cz + c.r };
  }
  return {
    minX: Math.min(c.x1, c.x2),
    maxX: Math.max(c.x1, c.x2),
    minZ: Math.min(c.z1, c.z2),
    maxZ: Math.max(c.z1, c.z2),
  };
}

/** Nearest distance from a world point to a collider (0 = the point is inside). */
function distanceToCollider(x: number, z: number, c: Collider): number {
  if (c.type === 'rect') {
    const cx = Math.max(c.cx - c.hw, Math.min(x, c.cx + c.hw));
    const cz = Math.max(c.cz - c.hd, Math.min(z, c.cz + c.hd));
    return Math.hypot(x - cx, z - cz);
  }
  if (c.type === 'circle') {
    return Math.max(0, Math.hypot(x - c.cx, z - c.cz) - c.r);
  }
  const sdx = c.x2 - c.x1;
  const sdz = c.z2 - c.z1;
  const lenSq = sdx * sdx + sdz * sdz;
  let t = 0;
  if (lenSq > 1e-10) {
    t = Math.max(0, Math.min(1, ((x - c.x1) * sdx + (z - c.z1) * sdz) / lenSq));
  }
  return Math.hypot(x - (c.x1 + t * sdx), z - (c.z1 + t * sdz));
}

/** Colliders of the group itself — everything else is a "nearby structure". */
const isGroupCollider = (id: string): boolean =>
  id.startsWith('fortress-') || id.startsWith('motte-wall');

const cityColliders = CITY_COLLIDERS.filter((c) => !isGroupCollider(c.id));
const coloSegments = CITY_COLLIDERS.filter(
  (c): c is SegmentCollider => c.type === 'segment' && c.id.startsWith('colo-'),
);

/** The Colosseum's northernmost registered stone (its rear-gate jamb line). */
const COLO_REAR_Z = Math.min(...coloSegments.flatMap((s) => [s.z1, s.z2])); // -44.1102

/**
 * Nearest city collider to a given motte centre, and the distance to it.
 * Measured from the registry, so the pre-shift and post-shift figures come
 * from the same facts.
 */
function nearestCityCollider(centreZ: number): { id: string; distance: number } {
  let best = { id: '', distance: Infinity };
  for (const c of cityColliders) {
    const d = distanceToCollider(0, centreZ, c);
    if (d < best.distance) best = { id: c.id, distance: d };
  }
  return best;
}

/** Coverage rule of the C-8.36 water annulus about a given motte centre. */
const coveredByMoat = (x: number, z: number, centreZ: number): boolean => {
  const r = Math.hypot(x, z - centreZ);
  return r >= MOAT_INNER_RADIUS && r <= MOAT_OUTER_RADIUS;
};

/** Walk straight north at X = 0 with the real resolver; returns the stop. */
function walkNorth(startZ: number, steps: number): [number, number] {
  let pos: [number, number, number] = [0, 0, startZ];
  for (let i = 0; i < steps; i++) {
    pos = resolveCityMovement(pos, 0, -1, 3.8, 0.1);
  }
  return [pos[0], pos[2]];
}

// ═══════════════════════════════════════════════════════════════════════════
// A. The 5-unit northward relocation and the increased separation
// ═══════════════════════════════════════════════════════════════════════════

describe('A. The northern group moved north (5.0 in C-8.37, 5.0 more in C-8.38)', () => {
  test('the motte centre is exactly 5.0 north of the recorded pre-shift value', () => {
    // C-8.37's own move, kept as a recorded step of the composed distance..
    expect(MOTTE_CENTER_Z).toBe(C8_38_MOTTE_CENTER_Z);
    expect(MOTTE_CENTER_Z - C8_37_MOTTE_CENTER_Z).toBeCloseTo(-5.0, 10);
    // …and the composed distance from the layout this workstream started at.
    expect(MOTTE_CENTER_Z - PRE_SHIFT_MOTTE_CENTER_Z).toBeCloseTo(-10.0, 10);
  });

  test('north is −Z (the ramp climbs that way), so the move is northward', () => {
    // The documented convention: the mound's south rim faces the city at
    // MOTTE_CENTER_Z + 25.16, and the fortress gate faces it too, so a smaller
    // (more negative) Z is further north, away from the city.
    expect(MOTTE_CENTER_Z).toBeLessThan(PRE_SHIFT_MOTTE_CENTER_Z);
    // The summit sits at the new centre, and the old centre is now on the
    // mound's northern flank rather than open ground.
    expect(getTerrainY(0, MOTTE_CENTER_Z)).toBeCloseTo(SUMMIT_Y, 10);
    expect(getTerrainY(0, PRE_SHIFT_MOTTE_CENTER_Z)).toBeCloseTo(SUMMIT_Y, 10);
    expect(summitLevel(0, PRE_SHIFT_MOTTE_CENTER_Z - MOTTE_CENTER_Z)).toBeLessThan(1);
  });

  test('nothing but the centre moved: X, scale and the perimeter radius', () => {
    expect(MOTTE_CENTER_X).toBe(0);
    expect(MOTTE_SCALE).toBe(0.3145);
    expect(MOTTE_PERIMETER_RADIUS).toBe(22.0);
    expect(SUMMIT_CARDINAL_RADIUS).toBeCloseTo(12.58, 6);
    expect(SUMMIT_Y).toBeCloseTo(4.7175, 6);
  });

  test('the moat’s outer shoreline is clear of the Colosseum’s rear stone', () => {
    // The Colosseum's rear-most registered stone is its gate jamb line; its
    // rear-most RENDERED stone is the gate lintel ring 0.39 further north.  The
    // moat's outer shoreline crossed both before the first shift and now clears
    // them by the moat's own width.
    expect(COLO_REAR_Z).toBeCloseTo(-44.11, 2);
    const offshore = GROUP_SOUTH_Z; // -50.5, the shoreline on the X = 0 axis
    expect(offshore).toBeLessThan(COLO_LINTEL_Z);
    expect(COLO_LINTEL_Z - offshore).toBeCloseTo(6.0, 2);
    expect(COLO_LINTEL_Z - offshore).toBeCloseTo(MOAT_OUTER_RADIUS - MOAT_INNER_RADIUS, 6);
    expect(COLO_REAR_Z - offshore).toBeCloseTo(6.39, 2);

    // C-8.37's own step: 1.39 clear of the registered stone…
    const c837Shoreline = C8_37_MOTTE_CENTER_Z + MOAT_OUTER_RADIUS; // -45.5
    expect(COLO_REAR_Z - c837Shoreline).toBeCloseTo(1.39, 2);
    // …after the shoreline had lain 3.61 INSIDE the gateway.
    const preShiftShoreline = PRE_SHIFT_MOTTE_CENTER_Z + MOAT_OUTER_RADIUS; // -40.5
    expect(preShiftShoreline).toBeGreaterThan(COLO_REAR_Z);
    expect(preShiftShoreline - COLO_REAR_Z).toBeCloseTo(3.61, 2);
  });

  test('the drawbridge begins on the outer bank, clear of the rear gateway', () => {
    expect(DECK_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0);     // -50.5
    expect(DECK_Z_OUTER).toBeLessThan(COLO_LINTEL_Z);     // north of every rear stone
    expect(COLO_LINTEL_Z - DECK_Z_OUTER).toBeCloseTo(6.0, 2);
    expect(COLO_REAR_Z - DECK_Z_OUTER).toBeCloseTo(6.39, 2);
    // C-8.37 left it 1.39 clear of the jamb line; Phase C-8.30/31 recorded the
    // pre-shift deck reaching 3.8 units inside the opening, measured as 3.61
    // against the registered stone.
    expect(COLO_REAR_Z - (C8_37_MOTTE_CENTER_Z + 31.0)).toBeCloseTo(1.39, 2);
    expect(PRE_SHIFT_DECK_Z_OUTER).toBeGreaterThan(COLO_REAR_Z);
    expect(PRE_SHIFT_DECK_Z_OUTER - COLO_REAR_Z).toBeCloseTo(3.61, 2);
  });

  test('the motte’s south foot gained the whole separation from the Colosseum', () => {
    const southFoot = MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS; // -62.001
    expect(southFoot).toBeCloseTo(-62.001, 3);
    expect(COLO_FACADE_PLANE_Z - southFoot).toBeCloseTo(17.7, 1);
    const preShiftFoot = PRE_SHIFT_MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS;
    expect(COLO_FACADE_PLANE_Z - preShiftFoot).toBeCloseTo(7.7, 1);
    expect(
      (COLO_FACADE_PLANE_Z - southFoot) - (COLO_FACADE_PLANE_Z - preShiftFoot),
    ).toBeCloseTo(10.0, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. One motte-centre-derived transform per part
// ═══════════════════════════════════════════════════════════════════════════

describe('B. Every part of the group derives from the one centre constant', () => {
  test('the motte group and the moat ring are placed from MOTTE_CENTER_Z', () => {
    expect(motteSrc).toContain('<group position={[0, 0, MOTTE_CENTER_Z]} scale={MOTTE_SCALE}>');
    expect(motteSrc).toContain(
      'const MOTTE_MOAT_CENTER: [number, number, number] = [0, 0, MOTTE_CENTER_Z];',
    );
    expect(motteSrc).toContain('position={[MOTTE_MOAT_CENTER[0], MOAT_WATER_Y, MOTTE_MOAT_CENTER[2]]}');
  });

  test('the fortress stands on the summit at the same centre', () => {
    expect(fortressSrc).toContain('position={[0, SUMMIT_Y, MOTTE_CENTER_Z]}');
    expect(fortressSrc).toContain('position={[0, SUMMIT_Y, MOTTE_CENTER_Z]} scale={0.30}');
  });

  test('the drawbridge span follows the shared bridge constants', () => {
    expect(drawbridgeSrc).toContain('export const DECK_Z_OUTER = BRIDGE_Z_OUTER;');
    expect(drawbridgeSrc).toContain('export const DECK_Z_INNER = BRIDGE_Z_INNER - 0.5;');
    expect(BRIDGE_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0);
    expect(BRIDGE_Z_INNER).toBe(MOTTE_CENTER_Z + 25.5);
  });

  test('the collision registry follows the same centre', () => {
    expect(collisionSrc).toContain(
      "RECT('fortress-south-l', -5.75, MOTTE_CENTER_Z + FORTRESS_HALF_DEPTH, 9.5, 1.2)",
    );
    expect(collisionSrc).toContain(
      "RECT('fortress-north', 0, MOTTE_CENTER_Z - FORTRESS_HALF_DEPTH, 21.0, 1.2)",
    );
    expect(collisionSrc).toContain("RECT('fortress-east', 10.5, MOTTE_CENTER_Z, 1.2, 21.0)");
    expect(collisionSrc).toMatch(/MOTTE_R \* Math\.cos\(theta\) \+ MOTTE_CENTER_Z/);
  });

  test('the boundary, the hub centre and the arrival follow the same centre', () => {
    expect(cityCollisionsSrc).toContain(
      'BOUNDARY_Z_MIN = MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5',
    );
    expect(cityCollisionsSrc).toMatch(/position: \[0, 0, MOTTE_CENTER_Z\]/);
    expect(cityCollisionsSrc).toMatch(/northern_fortress:\s+\[0, MOTTE_CENTER_Z \+ 12\.5\]/);
    expect(FAST_TRAVEL_ARRIVALS.northern_fortress).toEqual([0, FORTRESS_ARRIVAL_Z]);
    expect(HUB_LOCATIONS.find((l) => l.id === 'northern_fortress')!.position).toEqual([
      0, 0, MOTTE_CENTER_Z,
    ]);
  });

  test('no absolute pre- or post-shift centre literal survives in the five files', () => {
    for (const [name, src] of DERIVED_SOURCES) {
      const code = codeOf(src);
      for (const literal of [/\b71\.5\b/, /\b76\.5\b/, /\b81\.5\b/]) {
        expect(`${name}:${literal.test(code)}`).toBe(`${name}:false`);
      }
    }
    // The control: the same pattern does find the literal in terrainHeight's
    // declaration, so the checks above are not vacuously true.
    expect(/\b81\.5\b/.test(codeOf(load('./terrainHeight.ts')))).toBe(true);
  });

  test('the group is internally consistent at runtime', () => {
    expect(DECK_Z_OUTER).toBe(BRIDGE_Z_OUTER);          // -50.5
    expect(DECK_Z_INNER).toBe(BRIDGE_Z_INNER - 0.5);    // -56.5
    expect(DECK_LENGTH).toBeCloseTo(6.0, 10);
    expect(DECK_CENTER_Z).toBeCloseTo((DECK_Z_OUTER + DECK_Z_INNER) / 2, 10);
    expect(BOUNDARY_Z_MIN).toBe(MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5); // -101

    const south = CITY_COLLIDERS.find((c) => c.id === 'fortress-south-l');
    const north = CITY_COLLIDERS.find((c) => c.id === 'fortress-north');
    const east = CITY_COLLIDERS.find((c) => c.id === 'fortress-east');
    const west = CITY_COLLIDERS.find((c) => c.id === 'fortress-west');
    for (const c of [south, north, east, west]) expect(c!.type).toBe('rect');
    expect((south as any).cz).toBeCloseTo(FORTRESS_SOUTH_WALL_CZ, 10);
    expect((north as any).cz).toBeCloseTo(MOTTE_CENTER_Z - FORTRESS_HALF, 10);
    expect((east as any).cz).toBeCloseTo(MOTTE_CENTER_Z, 10);
    expect((west as any).cz).toBeCloseTo(MOTTE_CENTER_Z, 10);

    // The motte perimeter ring the boundary is derived from.
    const ring = CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall'));
    expect(ring.length).toBe(20);
    for (const seg of ring as SegmentCollider[]) {
      for (const [x, z] of [[seg.x1, seg.z1], [seg.x2, seg.z2]]) {
        expect(Math.hypot(x, z - MOTTE_CENTER_Z)).toBeCloseTo(MOTTE_PERIMETER_RADIUS, 6);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. Drawbridge-to-gate alignment and the continuous walkable route
// ═══════════════════════════════════════════════════════════════════════════

describe('C. The drawbridge meets the gate and the crossing stays walkable', () => {
  test('the deck and both side beams fit the gate’s clear passage', () => {
    // C-8.31's gate is 5.40 wide at the facade and C-8.33's passages are cut on
    // the doorway's own 5.2-unit line (|X| ≤ 2.6), so the 4.22-wide structure
    // passes with room to spare.
    expect(FOOTPRINT_HALF_W).toBeCloseTo(2.11, 6);
    expect(FOOTPRINT_HALF_W).toBeLessThan(2.6);
    expect(2.6 - FOOTPRINT_HALF_W).toBeGreaterThan(PLAYER_RADIUS);
  });

  test('the deck spans the moat from the outer bank to the motte rim', () => {
    expect(DECK_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0);  // outer shoreline
    expect(DECK_Z_INNER).toBe(MOTTE_CENTER_Z + 25.0);  // 0.16 onto the rim
    const rimZ = MOTTE_CENTER_Z + MOTTE_MESH_HALF_EXTENT; // -56.34
    expect(DECK_Z_INNER).toBeLessThan(rimZ);           // the deck reaches past it
    expect(rimZ - DECK_Z_INNER).toBeCloseTo(0.16, 2);
  });

  test('terrain is flat at ground level across the whole deck, then rises', () => {
    expect(getTerrainY(0, DECK_CENTER_Z)).toBe(0);
    expect(isOnBridge(0, DECK_CENTER_Z)).toBe(true);
    for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.25) {
      expect(getTerrainY(0, z)).toBe(0);
    }
    // The visible slope leaves Y = 0 at MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS
    // and climbs to the summit at the motte centre.
    expect(getTerrainY(0, MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS)).toBe(0);
    expect(getTerrainY(0, MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS - 0.02)).toBeGreaterThan(0);
    expect(getTerrainY(0, MOTTE_CENTER_Z)).toBeCloseTo(SUMMIT_Y, 10);
    expect(summitLevel(0, 0)).toBe(0);
  });

  test('the whole deck footprint is collision-free (crossing stays walkable)', () => {
    for (let x = -FOOTPRINT_HALF_W; x <= FOOTPRINT_HALF_W + 1e-9; x += 0.5) {
      for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.5) {
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
      }
    }
  });

  test('the real resolver walks from the arena through the gate, the deck and the fortress', () => {
    // One straight north walk at X = 0 — the C-8.31/C-8.33 designed route — from
    // inside the arena (0, −38) to the fortress north wall.
    const [endX, endZ] = walkNorth(-38, 200);
    expect(endX).toBe(0);
    // Passed the Colosseum's rear gate (the jamb line is −44.11)…
    expect(endZ).toBeLessThan(COLO_REAR_Z);
    // …crossed the deck and climbed the mound…
    expect(endZ).toBeLessThan(DECK_Z_INNER);
    // …entered the fortress through its gate gap (the south wall inner face)…
    expect(endZ).toBeLessThan(FORTRESS_SOUTH_WALL_INNER_Z);
    // …and stopped at the north wall, i.e. 21 units of courtyard later.
    expect(endZ).toBeGreaterThan(FORTRESS_NORTH_WALL_INNER_Z + PLAYER_RADIUS - 0.5);
    expect(endZ).toBeLessThan(FORTRESS_NORTH_WALL_INNER_Z + PLAYER_RADIUS + 0.5);
    expect(collidesWith(endX, endZ, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('the same walk reverses: fortress arrival back out to the city ground', () => {
    let pos: [number, number, number] = [0, 0, FORTRESS_ARRIVAL_Z];
    for (let i = 0; i < 200; i++) {
      pos = resolveCityMovement(pos, 0, 1, 3.8, 0.1);
    }
    // South of the Colosseum's facade, on the city approach.
    expect(pos[2]).toBeGreaterThan(-30);
    expect(getTerrainY(pos[0], pos[2])).toBe(0);
  });

  test('the ascent is continuous: terrain rises monotonically along the walk', () => {
    let previous = -Infinity;
    for (let z = DECK_Z_INNER; z >= FORTRESS_ARRIVAL_Z; z -= 0.25) {
      const y = getTerrainY(0, z);
      expect(y).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = y;
    }
    expect(previous).toBeCloseTo(SUMMIT_Y, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. Ground-plane coverage, terrain boundaries and fast-travel arrivals
// ═══════════════════════════════════════════════════════════════════════════

describe('D. The ground plane and the boundaries followed the group', () => {
  test('the plane’s north edge moved north with the group, edge for edge', () => {
    expect(GROUND_PLANE_NORTH_Z).toBe(-114);
    expect(GROUND_PLANE_NORTH_Z - PRE_SHIFT_GROUND_PLANE_NORTH_Z).toBeCloseTo(-10.0, 10);
    // The edge tracks the group's two 5.0 moves one for one.
    expect(GROUND_PLANE_NORTH_Z - PRE_SHIFT_GROUND_PLANE_NORTH_Z).toBeCloseTo(
      MOTTE_CENTER_Z - PRE_SHIFT_MOTTE_CENTER_Z, 10,
    );
    expect(GROUND_PLANE_DEPTH).toBe(GROUND_PLANE_SOUTH_Z - GROUND_PLANE_NORTH_Z);
    expect(GROUND_PLANE_DEPTH).toBe(184);
  });

  test('south edge, width and elevation are untouched', () => {
    expect(GROUND_PLANE_SOUTH_Z).toBe(70);
    expect(GROUND_PLANE_WIDTH).toBe(140);
    expect(GROUND_PLANE_ELEVATION_Y).toBe(-0.05);
    expect(GROUND_PLANE_CENTER[2]).toBeCloseTo((70 + -114) / 2, 10);
    expect(GROUND_PLANE_WEST_X).toBe(-70);
    expect(GROUND_PLANE_EAST_X).toBe(70);
  });

  test('the plane still covers every northern target with its measured margins', () => {
    // 1.5 past the moat ring, 7.34 past the motte mesh bound, 13 past the
    // walkable limit — the same margins the Ground Coverage phase measured, and
    // the same margins the group's first move kept.
    expect(GROUP_NORTH_Z - GROUND_PLANE_NORTH_Z).toBeCloseTo(1.5, 6);
    const meshNorthZ = MOTTE_CENTER_Z - MOTTE_MESH_HALF_EXTENT; // -106.66
    expect(meshNorthZ - GROUND_PLANE_NORTH_Z).toBeCloseTo(7.34, 2);
    expect(BOUNDARY_Z_MIN - GROUND_PLANE_NORTH_Z).toBeCloseTo(13, 6);
  });

  test('the walkable envelope is derived from the moved perimeter', () => {
    expect(BOUNDARY_X).toBe(35);
    expect(BOUNDARY_Z_MAX).toBe(35);
    expect(BOUNDARY_Z_MIN).toBe(-101); // -91 before the group's first 5.0 move
    expect(MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS).toBeCloseTo(-103.5, 6);
    expect(BOUNDARY_Z_MIN).toBeGreaterThan(MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS);
  });

  test('every fast-travel arrival is inside the boundaries and collision-free', () => {
    for (const [id, [ax, az]] of Object.entries(FAST_TRAVEL_ARRIVALS)) {
      // Phase C-8.70B: the walkable world is the city square UNION the East
      // Circus District band (C-8.64A/B), so the literal bounds become the
      // movement envelope's own clamp — the same "inside the walkable world"
      // invariant, stated against what now actually bounds movement.
      expect(`${id}:${clampBoundaryX(ax, az) === ax}`).toBe(`${id}:true`);
      expect(`${id}:${clampBoundaryZ(ax, az) === az}`).toBe(`${id}:true`);
      expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
  });

  test('the fortress arrival moved with the group and stays on the summit', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    expect(az).toBeCloseTo(-69.0, 10);
    expect(az).toBeCloseTo(MOTTE_CENTER_Z + 12.5, 10);
    expect(az).toBeCloseTo(FORTRESS_SOUTH_WALL_CZ + 2.0, 6); // 2.0 south of the wall
    expect(getTerrainY(ax, az)).toBeCloseTo(SUMMIT_Y, 2);
    expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('the fortress hub reads its own centre, and detection moved with it', () => {
    const loc = HUB_LOCATIONS.find((l) => l.id === 'northern_fortress')!;
    expect(loc.position[2]).toBe(MOTTE_CENTER_Z);
    expect(getNearbyHubLocation([0, 0, MOTTE_CENTER_Z])!.id).toBe('northern_fortress');
    expect(getNearbyHubLocation([0, 0, MOTTE_CENTER_Z + 3.5])!.id).toBe('northern_fortress');
    // The arrival (12.5 out) is deliberately outside the 10.0 interaction radius.
    expect(getNearbyHubLocation([0, 0, FORTRESS_ARRIVAL_Z])).toBeNull();
  });

  test('the fortress stays inside the walkable world boundary', () => {
    const box: Box = {
      minX: -FORTRESS_HALF, maxX: FORTRESS_HALF,
      minZ: MOTTE_CENTER_Z - FORTRESS_HALF, maxZ: MOTTE_CENTER_Z + FORTRESS_HALF,
    };
    expect(box.minX).toBeGreaterThanOrEqual(-BOUNDARY_X);
    expect(box.maxX).toBeLessThanOrEqual(BOUNDARY_X);
    expect(box.minZ).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
    expect(box.maxZ).toBeLessThanOrEqual(BOUNDARY_Z_MAX);
    // Every courtyard corner the player can reach is inside the boundary too.
    for (const x of [-9.5, 9.5]) {
      for (const z of [MOTTE_CENTER_Z - 9.5, MOTTE_CENTER_Z + 9.5]) {
        expect(z).toBeGreaterThan(BOUNDARY_Z_MIN);
        expect(Math.abs(x)).toBeLessThan(BOUNDARY_X);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. The C-8.33 seals and the C-8.36 water ring are preserved
// ═══════════════════════════════════════════════════════════════════════════

describe('E. The rear-gate seals and the water ring are untouched', () => {
  const seals = CITY_COLLIDERS.filter(
    (c): c is SegmentCollider => c.type === 'segment' && c.id.startsWith('colo-gateseal'),
  );

  test('both C-8.33 seals survive, mirrored, with their recorded endpoints', () => {
    expect(seals.map((s) => s.id).sort()).toEqual(['colo-gateseal-l', 'colo-gateseal-r']);
    for (const s of seals) {
      const side = s.id.endsWith('-l') ? -1 : 1;
      // Facade jamb (the rear drum's cut face) then bowl cut edge (the podium's).
      expect(s.x1).toBeCloseTo(side * 2.7, 9);
      expect(s.z1).toBeCloseTo(COLO_REAR_Z, 9);
      expect(s.x2).toBeCloseTo(side * 2.6, 9);
      expect(s.z2).toBeCloseTo(-40.0775, 4);
    }
  });

  test('each seal endpoint is still an existing cut-face endpoint (no slit)', () => {
    const rearWall = CITY_COLLIDERS.find((c) => c.id === 'colo-rearwall-l-0') as SegmentCollider;
    const rearPodium = CITY_COLLIDERS.find((c) => c.id === 'colo-rearpodium-l-0') as SegmentCollider;
    const seal = seals.find((s) => s.id === 'colo-gateseal-l')!;
    expect(seal.x1).toBeCloseTo(rearWall.x1, 9);
    expect(seal.z1).toBeCloseTo(rearWall.z1, 9);
    expect(seal.x2).toBeCloseTo(rearPodium.x1, 9);
    expect(seal.z2).toBeCloseTo(rearPodium.z1, 9);
  });

  test('the seal keeps a player-width of corridor beside the deck', () => {
    const clearance = 2.6 - FOOTPRINT_HALF_W; // 0.49
    expect(clearance).toBeGreaterThan(PLAYER_RADIUS);
    for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.5) {
      expect(collidesWith(FOOTPRINT_HALF_W, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
  });

  test('the water ring is still a complete 25.0 → 31.0 annulus', () => {
    expect(MOAT_GAP_HALF_ANGLE).toBe(0);
    expect(MOAT_INNER_RADIUS).toBe(25.0);
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
    expect(MOAT_WATER_Y).toBe(0.06);
    expect(MOAT_WATER_Y).toBeLessThan(DECK_UNDERSIDE_Y);
    expect(MOAT_WATER_Y).toBeGreaterThan(GROUND_PLANE_ELEVATION_Y);
  });

  test('the water still runs under the whole deck at the shifted centre', () => {
    // Same grid the C-8.36 coverage measurement used (|x| ≤ 2.0 step 0.5, the
    // deck span step 0.25), now about the moved centre.
    const uncovered: Array<[number, number]> = [];
    let total = 0;
    for (let x = -BRIDGE_HALF_WIDTH; x <= BRIDGE_HALF_WIDTH + 1e-9; x += 0.5) {
      for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.25) {
        total++;
        if (!coveredByMoat(x, z, MOTTE_CENTER_Z)) uncovered.push([x, z]);
      }
    }
    expect(total).toBe(225);
    // The only uncovered samples are the approach-end landing line — the deck's
    // south end resting on the outer bank — exactly as C-8.36 recorded.
    expect(uncovered.length).toBe(8);
    for (const [x, z] of uncovered) {
      expect(z).toBeCloseTo(DECK_Z_OUTER, 9);
      expect(Math.abs(x)).toBeGreaterThan(0);
    }
    // The whole crossing north of that line is covered.
    expect(uncovered.every(([, z]) => z > DECK_Z_OUTER - 0.25)).toBe(true);
    // …and the ring reaches under the deck's north end at the centreline and
    // at both side beams (C-8.36's inner edge).
    expect(coveredByMoat(0, DECK_Z_INNER, MOTTE_CENTER_Z)).toBe(true);
    expect(coveredByMoat(FOOTPRINT_HALF_W, DECK_Z_INNER, MOTTE_CENTER_Z)).toBe(true);
  });

  test('the water stayed in place relative to the group (coverage is radius-based)', () => {
    // Every uncovered/covered verdict is a function of the radius about the
    // motte centre, so neither 5.0 move can change it: the same grid at either
    // earlier centre, shifted back by the matching distance, gives identical
    // verdicts — which is why the deck/water relationship needs no re-tuning.
    for (let x = -BRIDGE_HALF_WIDTH; x <= BRIDGE_HALF_WIDTH + 1e-9; x += 0.5) {
      for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.25) {
        const verdict = coveredByMoat(x, z, MOTTE_CENTER_Z);
        expect(coveredByMoat(x, z + 5.0, C8_37_MOTTE_CENTER_Z)).toBe(verdict);
        expect(coveredByMoat(x, z + 10.0, PRE_SHIFT_MOTTE_CENTER_Z)).toBe(verdict);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F. No newly introduced intersection with a nearby city structure
// ═══════════════════════════════════════════════════════════════════════════

describe('F. The moved group intersects no nearby city structure', () => {
  const groupBox: Box = {
    minX: -MOAT_OUTER_RADIUS,
    maxX: MOAT_OUTER_RADIUS,
    minZ: GROUP_NORTH_Z,
    maxZ: GROUP_SOUTH_Z,
  };

  test('the group’s whole box is north of every city collider', () => {
    // The registry's northernmost city stone is the Colosseum's rear-gate jamb
    // line; with the group's southernmost stone (the moat shoreline) north of
    // it, no city collider can overlap the group in Z.
    const nearestCityMinZ = Math.min(...cityColliders.map((c) => aabb(c).minZ));
    expect(nearestCityMinZ).toBeCloseTo(COLO_REAR_Z, 9);
    expect(nearestCityMinZ).toBeGreaterThan(groupBox.maxZ);
    expect(nearestCityMinZ - groupBox.maxZ).toBeCloseTo(6.39, 2);
  });

  test('no city collider’s bounds overlap the group’s bounds', () => {
    const overlapping: string[] = [];
    for (const c of cityColliders) {
      const b = aabb(c);
      const disjoint =
        b.maxX < groupBox.minX || b.minX > groupBox.maxX ||
        b.maxZ < groupBox.minZ || b.minZ > groupBox.maxZ;
      if (!disjoint) overlapping.push(c.id);
    }
    expect(overlapping).toEqual([]);
  });

  test('the nearest structure clears the moat’s outer ring by the apron’s own depth', () => {
    const nearest = nearestCityCollider(MOTTE_CENTER_Z);
    expect(nearest.distance).toBeCloseTo(37.4872, 3);
    expect(nearest.id.startsWith('colo-')).toBe(true);
    // The ring's clearance to the nearest Colosseum stone is the same 6.5 the
    // apron measures against that stone (the 6.0 lintel figure plus its own
    // rearward overhang), so the two independent readings agree.
    expect(nearest.distance - MOAT_OUTER_RADIUS).toBeCloseTo(6.4872, 3);
    // …and 12.33 from the motte mesh's own footprint.
    expect(nearest.distance - MOTTE_MESH_HALF_EXTENT).toBeCloseTo(12.3272, 3);
  });

  test('the rendered motte footprint and moat both fit inside that clearance', () => {
    const nearest = nearestCityCollider(MOTTE_CENTER_Z);
    expect(MOTTE_MESH_HALF_EXTENT).toBeCloseTo(25.16, 2);
    expect(MOTTE_MESH_HALF_EXTENT).toBeLessThan(nearest.distance);
    expect(MOAT_OUTER_RADIUS).toBeLessThan(nearest.distance);
    // The motte mesh itself reaches 7.34 short of the Colosseum's rear stone.
    expect(nearest.distance - MOTTE_MESH_HALF_EXTENT).toBeGreaterThan(7);
  });

  test('the fortress walls overlap nothing outside the group', () => {
    const walls = CITY_COLLIDERS.filter(
      (c) => c.id.startsWith('fortress-'),
    );
    expect(walls.length).toBe(5);
    for (const wall of walls) {
      const w = aabb(wall);
      for (const other of cityColliders) {
        const b = aabb(other);
        const disjoint =
          b.maxX < w.minX || b.minX > w.maxX ||
          b.maxZ < w.minZ || b.minZ > w.maxZ;
        expect(`${wall.id}>${other.id}:${disjoint}`).toBe(`${wall.id}>${other.id}:true`);
      }
    }
  });

  test('the approach corridor from the Colosseum’s gate to the ramp is clear', () => {
    // 5.0 units longer than before the shift, and the deck's own footprint sits
    // inside it.
    for (let z = COLO_REAR_Z - 1; z >= GROUP_SOUTH_Z - 8; z -= 0.5) {
      expect(collidesWith(0, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
    for (let z = -45; z >= -54; z -= 1) {
      expect(collidesWith(0, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. The checks are sensitive to the shift they pin
// ═══════════════════════════════════════════════════════════════════════════

describe('G. A reversed shift fails the same checks', () => {
  test('at the old centre the group overlapped the Colosseum (the defect)', () => {
    const preShiftGroupSouth = PRE_SHIFT_MOTTE_CENTER_Z + MOAT_OUTER_RADIUS; // -40.5
    expect(preShiftGroupSouth).toBeGreaterThan(COLO_REAR_Z);
    const preShiftBox: Box = {
      minX: -MOAT_OUTER_RADIUS,
      maxX: MOAT_OUTER_RADIUS,
      minZ: PRE_SHIFT_MOTTE_CENTER_Z - MOAT_OUTER_RADIUS,
      maxZ: preShiftGroupSouth,
    };
    const overlapping = cityColliders.filter((c) => {
      const b = aabb(c);
      return !(
        b.maxX < preShiftBox.minX || b.minX > preShiftBox.maxX ||
        b.maxZ < preShiftBox.minZ || b.minZ > preShiftBox.maxZ
      );
    });
    expect(overlapping.length).toBeGreaterThan(0);
    expect(overlapping.map((c) => c.id).every((id) => id.startsWith('colo-'))).toBe(true);
  });

  test('at the old centre the nearest structure was inside the moat ring', () => {
    const pre = nearestCityCollider(PRE_SHIFT_MOTTE_CENTER_Z);
    expect(pre.distance).toBeCloseTo(27.5226, 3);
    expect(pre.distance).toBeLessThan(MOAT_OUTER_RADIUS); // the ring covered it
    expect(MOAT_OUTER_RADIUS - pre.distance).toBeCloseTo(3.4774, 3);
    // The shipped centre reverses that relationship, and each 5.0 move widens
    // it by exactly 5.0 — the clearance is bought 1:1 by moving the group.
    const mid = nearestCityCollider(C8_37_MOTTE_CENTER_Z);
    const now = nearestCityCollider(MOTTE_CENTER_Z);
    expect(now.distance).toBeGreaterThan(MOAT_OUTER_RADIUS);
    expect(mid.distance - pre.distance).toBeCloseTo(4.9795, 3);
    expect(now.distance - mid.distance).toBeCloseTo(4.9851, 3);
    expect(now.distance - pre.distance).toBeCloseTo(9.9646, 3);
  });

  test('the ground plane would have failed coverage without its own matching moves', () => {
    expect(PRE_SHIFT_GROUND_PLANE_NORTH_Z).toBeGreaterThan(GROUND_PLANE_NORTH_Z);
    // The pre-shift plane still covered the pre-shift group with the same 1.5
    // margin, so the two moves are a matched pair, not a coincidence.
    const preShiftMoatNorth = PRE_SHIFT_MOTTE_CENTER_Z - MOAT_OUTER_RADIUS; // -102.5
    expect(preShiftMoatNorth - PRE_SHIFT_GROUND_PLANE_NORTH_Z).toBeCloseTo(1.5, 6);
    expect(GROUP_NORTH_Z - GROUND_PLANE_NORTH_Z).toBeCloseTo(1.5, 6);
    // Plane edge and group both moved the same 5.0, so the margin is identical.
    expect((PRE_SHIFT_GROUND_PLANE_NORTH_Z - GROUND_PLANE_NORTH_Z) -
      (preShiftMoatNorth - GROUP_NORTH_Z)).toBeCloseTo(0, 6);
  });

  test('BOUNDARY_Z_MIN tracks the centre, not a frozen literal', () => {
    const derived = (centreZ: number): number =>
      centreZ - MOTTE_PERIMETER_RADIUS + 2.5;
    expect(derived(MOTTE_CENTER_Z)).toBe(BOUNDARY_Z_MIN);
    expect(derived(C8_37_MOTTE_CENTER_Z)).toBe(-96); // C-8.37's own limit
    expect(derived(PRE_SHIFT_MOTTE_CENTER_Z)).toBe(-91); // the pre-shift limit
  });
});
