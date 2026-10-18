/**
 * Phase C-8.38 — Northern approach composition.
 *
 * Run with: bun test src/utils/phaseC8_38.test.ts
 *
 * ── WHY THE GROUP MOVED A SECOND TIME ─────────────────────────────────────
 * Phase C-8.37 moved the whole northern group — motte, moat ring, drawbridge
 * and fortress — 5.0 units north, from MOTTE_CENTER_Z = −71.5 to −76.5, so the
 * moat's outer shoreline left the Colosseum's rear gateway.  That fix was
 * correct but still tight: the apron between the Colosseum's rear stone and the
 * moat's outer bank measured only 1.39 (1.0 against the gate's rendered lintel
 * ring), the water lapped the gateway threshold and the deck began inside the
 * gateway's own silhouette — the "gateway crowding" this phase reports.
 *
 * Phase C-8.38 moves the same group a further 5.0 north, to
 * **MOTTE_CENTER_Z = −81.5** (10.0 from the layout this workstream started at),
 * which opens the apron to 6.39 against the registered rear stone and exactly
 * the moat's own 6.0 width against the rendered lintel.  The Colosseum, its
 * rear gate, its bowl cut and its C-8.33 seals did not move; only the centre
 * moved, and every dependent transform moved with it because each is *derived*
 * from that one constant (§B).
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   A. the second 5.0 move, the composition it buys (the apron rule) and the
 *      measured clearances at the new centre;
 *   B. one motte-centre-derived transform per part, plus a guard that no
 *      absolute centre literal has reappeared in any of the five files — the
 *      property that lets the group move again as a group;
 *   C. the designed route from the arena through the rear gate, the deck, the
 *      mound and the fortress, driven with the real `resolveCityMovement`;
 *   D. the ground plane, the walkable boundary, the fast-travel arrival and the
 *      hub detection, all of which followed the group edge for edge;
 *   E. the C-8.33 rear-gate seals and the C-8.36 water ring, untouched;
 *   F. no newly introduced intersection with any nearby city structure;
 *   G. a reversed-shift control, so the checks are shown to be sensitive to the
 *      very move they pin — at C-8.37's centre the apron rule fails.
 *
 * Every "before" figure below is measured against the same registry evaluated
 * at the recorded C-8.37 centre (−76.5) rather than restated as a literal.
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
  SUMMIT_CARDINAL_RADIUS,
  SUMMIT_SLOPE_FOOT_RADIUS,
  getTerrainY,
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
  GROUND_BUMP_REPEAT_X,
  GROUND_BUMP_REPEAT_Z,
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
} from './cityCollisions';

// ── Recorded references ─────────────────────────────────────────────────────

/** The motte centre before the two northern moves (Phase 35F.5 value). */
const PRE_SHIFT_MOTTE_CENTER_Z = -71.5;
/** The centre Phase C-8.37 produced — this phase's own starting point. */
const C8_37_MOTTE_CENTER_Z = -76.5;
/** The centre both moves produced — what every live transform reads today. */
const C8_38_MOTTE_CENTER_Z = -81.5;
/** The ground plane's north edge as C-8.37 left it. */
const C8_37_GROUND_PLANE_NORTH_Z = -109;

/**
 * The Colosseum's rear-MOST rendered stone, not just its registered one: the
 * tier-1 cornice / tier ledge ring (outer radius 19.5, GrandColosseum.tsx) runs
 * over the rear gate as its lintel, so at the X = 0 axis it reaches
 * Z = -25 - 19.5 = -44.5 — 0.2 north of the facade plane.
 */
const COLO_LINTEL_Z = -44.5;

/**
 * The Colosseum's rear facade plane: GrandColosseum's root [0, 0, −25] minus
 * R_FACADE 19.3 (see AGENTS.md, C-8.30/C-8.31).
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
const FORTRESS_SOUTH_WALL_CZ = MOTTE_CENTER_Z + FORTRESS_HALF;                      // -71.0
const FORTRESS_SOUTH_WALL_INNER_Z = FORTRESS_SOUTH_WALL_CZ - FORTRESS_WALL_HALF_D;  // -71.6
const FORTRESS_NORTH_WALL_INNER_Z = MOTTE_CENTER_Z - FORTRESS_HALF + FORTRESS_WALL_HALF_D; // -91.4
/** Motte-centre-relative arrival (cityCollisions FAST_TRAVEL_ARRIVALS). */
const FORTRESS_ARRIVAL_Z = MOTTE_CENTER_Z + 12.5;                                   // -69.0
/** The northern group's plan extent: the moat ring's outer shoreline. */
const GROUP_NORTH_Z = MOTTE_CENTER_Z - MOAT_OUTER_RADIUS;                           // -112.5
const GROUP_SOUTH_Z = MOTTE_CENTER_Z + MOAT_OUTER_RADIUS;                           // -50.5

/**
 * The rule this phase buys: the apron between the Colosseum's rear-most
 * rendered stone and the moat's outer bank must be at least this wide, so the
 * crossing reads as a bridge landing on a bank rather than water lapping a
 * gateway threshold.  C-8.37 measured 1.0 here; C-8.38 measures 6.0.
 */
const APRON_MIN = 5.0;

/** The apron a given motte centre would produce (negative = the group laps the gate stone). */
const apronAt = (centreZ: number): number =>
  COLO_LINTEL_Z - (centreZ + MOAT_OUTER_RADIUS);

// ── Sources the transforms live in ──────────────────────────────────────────

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const terrainHeightSrc = load('./terrainHeight.ts');
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
 * Measured from the registry, so the C-8.37 and C-8.38 figures come from the
 * same facts.
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
// A. The second 5-unit move and the apron it buys
// ═══════════════════════════════════════════════════════════════════════════

describe('A. The group moved a second 5.0 north in C-8.38', () => {
  test('the centre is 5.0 north of C-8.37 and 10.0 from the layout it started at', () => {
    expect(MOTTE_CENTER_Z).toBe(C8_38_MOTTE_CENTER_Z);
    expect(MOTTE_CENTER_Z - C8_37_MOTTE_CENTER_Z).toBeCloseTo(-5.0, 10);
    expect(MOTTE_CENTER_Z - PRE_SHIFT_MOTTE_CENTER_Z).toBeCloseTo(-10.0, 10);
  });

  test('north is −Z, and the summit moved with the centre', () => {
    // A smaller (more negative) Z is further north, away from the city.
    expect(MOTTE_CENTER_Z).toBeLessThan(C8_37_MOTTE_CENTER_Z);
    expect(getTerrainY(0, MOTTE_CENTER_Z)).toBeCloseTo(SUMMIT_Y, 10);
    // The previous centre is now 5.0 down the mound's flank, not open ground.
    expect(Math.abs(getTerrainY(0, C8_37_MOTTE_CENTER_Z) - SUMMIT_Y)).toBeLessThan(0.01);
    expect(summitLevel(0, Math.abs(MOTTE_CENTER_Z - C8_37_MOTTE_CENTER_Z))).toBeLessThan(1);
  });

  test('nothing but the centre moved: X, scale, summit, moat and deck ratios', () => {
    expect(MOTTE_CENTER_X).toBe(0);
    expect(MOTTE_SCALE).toBe(0.3145);
    expect(MOTTE_PERIMETER_RADIUS).toBe(22.0);
    expect(SUMMIT_CARDINAL_RADIUS).toBeCloseTo(12.58, 6);
    expect(SUMMIT_Y).toBeCloseTo(4.7175, 6);
    // C-8.36's ring, unchanged by the move.
    expect(MOAT_INNER_RADIUS).toBe(25.0);
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
    expect(MOAT_WATER_Y).toBeCloseTo(0.06, 6);
    expect(MOAT_GAP_HALF_ANGLE).toBe(0);
    // The deck's 6.0 × 4.22 box and its Y values are unchanged.
    expect(DECK_LENGTH).toBeCloseTo(6.0, 10);
    expect(DECK_CENTER_Z).toBeCloseTo((DECK_Z_OUTER + DECK_Z_INNER) / 2, 10);
    expect(DECK_TOP_Y).toBe(0.16);
    expect(DECK_UNDERSIDE_Y).toBe(0.09);
    // The ground plane's width, south edge and elevation are untouched.
    expect(GROUND_PLANE_WIDTH).toBe(140);
    expect(GROUND_PLANE_SOUTH_Z).toBe(70);
    expect(GROUND_PLANE_ELEVATION_Y).toBe(-0.05);
  });

  test('the moat’s outer bank clears the Colosseum’s rear stone by 6.39', () => {
    const offshore = GROUP_SOUTH_Z; // -50.5, the shoreline on the X = 0 axis
    expect(offshore).toBe(MOTTE_CENTER_Z + MOAT_OUTER_RADIUS);
    expect(COLO_REAR_Z - offshore).toBeCloseTo(6.39, 2);
    // Against the rendered lintel ring it is exactly the moat's own width.
    expect(COLO_LINTEL_Z - offshore).toBeCloseTo(6.0, 2);
    expect(COLO_LINTEL_Z - offshore).toBeCloseTo(MOAT_OUTER_RADIUS - MOAT_INNER_RADIUS, 6);

    // C-8.37's own step: 1.39 clear of the registered stone…
    const c837Shoreline = C8_37_MOTTE_CENTER_Z + MOAT_OUTER_RADIUS; // -45.5
    expect(COLO_REAR_Z - c837Shoreline).toBeCloseTo(1.39, 2);
    // …after the shoreline had lain 3.61 INSIDE the gateway before both moves.
    const preShiftShoreline = PRE_SHIFT_MOTTE_CENTER_Z + MOAT_OUTER_RADIUS; // -40.5
    expect(preShiftShoreline).toBeGreaterThan(COLO_REAR_Z);
    expect(preShiftShoreline - COLO_REAR_Z).toBeCloseTo(3.61, 2);
  });

  test('the drawbridge still lands on the outer bank, clear of the gateway', () => {
    expect(DECK_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0); // -50.5
    expect(DECK_Z_OUTER).toBe(GROUP_SOUTH_Z);         // the shoreline IS the deck's south end
    expect(COLO_LINTEL_Z - DECK_Z_OUTER).toBeCloseTo(6.0, 2);
    expect(COLO_REAR_Z - DECK_Z_OUTER).toBeCloseTo(6.39, 2);
    // C-8.37 had left the deck's south end 1.39 clear of the jamb line.
    expect(COLO_REAR_Z - (C8_37_MOTTE_CENTER_Z + 31.0)).toBeCloseTo(1.39, 2);
  });

  test('the apron rule C-8.38 buys passes now and failed at C-8.37', () => {
    expect(apronAt(C8_38_MOTTE_CENTER_Z)).toBeCloseTo(6.0, 6);
    expect(apronAt(C8_38_MOTTE_CENTER_Z)).toBeGreaterThanOrEqual(APRON_MIN);
    // The crowding C-8.38 fixes: 1.0 of apron at C-8.37's centre.
    expect(apronAt(C8_37_MOTTE_CENTER_Z)).toBeCloseTo(1.0, 6);
    expect(apronAt(C8_37_MOTTE_CENTER_Z)).toBeLessThan(APRON_MIN);
    // …and the pre-shift layout actually lapped the gate stone.
    expect(apronAt(PRE_SHIFT_MOTTE_CENTER_Z)).toBeCloseTo(-4.0, 6);
  });

  test('the motte’s south foot gained the second 5.0 of separation', () => {
    const southFoot = MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS; // -62.001
    expect(southFoot).toBeCloseTo(-62.001, 3);
    expect(COLO_FACADE_PLANE_Z - southFoot).toBeCloseTo(17.7, 1);
    const c837Foot = C8_37_MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS; // -57.001
    expect(COLO_FACADE_PLANE_Z - c837Foot).toBeCloseTo(12.7, 1);
    expect(
      (COLO_FACADE_PLANE_Z - southFoot) - (COLO_FACADE_PLANE_Z - c837Foot),
    ).toBeCloseTo(5.0, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. One motte-centre-derived transform per part
// ═══════════════════════════════════════════════════════════════════════════

describe('B. Every part of the group still derives from the one centre constant', () => {
  test('the motte group and the moat ring are placed from MOTTE_CENTER_Z', () => {
    expect(motteSrc).toContain('<group position={[0, 0, MOTTE_CENTER_Z]} scale={MOTTE_SCALE}>');
    expect(motteSrc).toContain(
      'const MOTTE_MOAT_CENTER: [number, number, number] = [0, 0, MOTTE_CENTER_Z];',
    );
    expect(motteSrc).toContain('position={[MOTTE_MOAT_CENTER[0], MOAT_WATER_Y, MOTTE_MOAT_CENTER[2]]}');
  });

  test('the fortress stands on the summit at the same centre', () => {
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

  test('no absolute centre literal survives in the five derived files', () => {
    // The property that lets the group move again as a group: a literal would
    // let one part lag behind the next coordinated move.
    for (const [name, src] of DERIVED_SOURCES) {
      const code = codeOf(src);
      for (const literal of [/\b71\.5\b/, /\b76\.5\b/, /\b81\.5\b/]) {
        expect(`${name}:${literal.test(code)}`).toBe(`${name}:false`);
      }
    }
    // The control: the literal does live, once, in the module that owns it.
    expect(/\b81\.5\b/.test(codeOf(terrainHeightSrc))).toBe(true);
    expect(/\b76\.5\b/.test(codeOf(terrainHeightSrc))).toBe(false);
    expect(/\b71\.5\b/.test(codeOf(terrainHeightSrc))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. The designed route still runs from the arena to the fortress
// ═══════════════════════════════════════════════════════════════════════════

describe('C. The rear-gate route is still continuous and walkable', () => {
  test('the real resolver walks from the arena through the gate, the deck and the fortress', () => {
    // One straight north walk at X = 0 — the C-8.31/C-8.33 designed route.
    const [endX, endZ] = walkNorth(-38, 220);
    expect(endX).toBe(0);
    // Passed the Colosseum's rear gate (the jamb line is −44.11)…
    expect(endZ).toBeLessThan(COLO_REAR_Z);
    // …crossed the deck and climbed the mound…
    expect(endZ).toBeLessThan(DECK_Z_INNER);
    // …entered the fortress through its gate gap (the south wall inner face)…
    expect(endZ).toBeLessThan(FORTRESS_SOUTH_WALL_INNER_Z);
    // …and stopped at the north wall, 5.0 further north than C-8.37 could.
    expect(endZ).toBeGreaterThan(FORTRESS_NORTH_WALL_INNER_Z + PLAYER_RADIUS - 0.5);
    expect(endZ).toBeLessThan(FORTRESS_NORTH_WALL_INNER_Z + PLAYER_RADIUS + 0.5);
    expect(collidesWith(endX, endZ, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('the same walk reverses: fortress arrival back out to the city ground', () => {
    let pos: [number, number, number] = [0, 0, FORTRESS_ARRIVAL_Z];
    for (let i = 0; i < 220; i++) {
      pos = resolveCityMovement(pos, 0, 1, 3.8, 0.1);
    }
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
// D. Ground plane, boundary, arrival and hub followed the group
// ═══════════════════════════════════════════════════════════════════════════

describe('D. The ground plane and the boundaries followed the group', () => {
  test('the plane’s north edge moved north with the group, edge for edge', () => {
    expect(GROUND_PLANE_NORTH_Z).toBe(-114);
    expect(GROUND_PLANE_NORTH_Z - C8_37_GROUND_PLANE_NORTH_Z).toBeCloseTo(-5.0, 10);
    // The edge tracks the group's second move one for one.
    expect(GROUND_PLANE_NORTH_Z - C8_37_GROUND_PLANE_NORTH_Z).toBeCloseTo(
      MOTTE_CENTER_Z - C8_37_MOTTE_CENTER_Z, 10,
    );
    expect(GROUND_PLANE_DEPTH).toBe(184);
    expect(GROUND_PLANE_DEPTH).toBe(GROUND_PLANE_SOUTH_Z - GROUND_PLANE_NORTH_Z);
  });

  test('south edge, width, elevation and both X edges are untouched', () => {
    expect(GROUND_PLANE_SOUTH_Z).toBe(70);
    expect(GROUND_PLANE_WIDTH).toBe(140);
    expect(GROUND_PLANE_ELEVATION_Y).toBe(-0.05);
    expect(GROUND_PLANE_CENTER[2]).toBeCloseTo((70 + -114) / 2, 10);
    expect(GROUND_PLANE_WEST_X).toBe(-70);
    expect(GROUND_PLANE_EAST_X).toBe(70);
  });

  test('the plane still covers every northern target with the measured margins', () => {
    // 1.5 past the moat ring, 7.34 past the motte mesh bound, 13 past the
    // walkable limit — the same margins the Ground Coverage phase measured and
    // C-8.37 kept.
    expect(GROUP_NORTH_Z - GROUND_PLANE_NORTH_Z).toBeCloseTo(1.5, 6);
    const meshNorthZ = MOTTE_CENTER_Z - MOTTE_MESH_HALF_EXTENT; // -106.66
    expect(meshNorthZ - GROUND_PLANE_NORTH_Z).toBeCloseTo(7.34, 2);
    expect(BOUNDARY_Z_MIN - GROUND_PLANE_NORTH_Z).toBeCloseTo(13, 6);
  });

  test('the walkable envelope is still derived from the moved perimeter', () => {
    expect(BOUNDARY_X).toBe(35);
    expect(BOUNDARY_Z_MAX).toBe(35);
    expect(BOUNDARY_Z_MIN).toBe(-101); // -96 after C-8.37, -91 before it
    expect(BOUNDARY_Z_MIN).toBe(MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5);
    expect(MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS).toBeCloseTo(-103.5, 6);
    expect(BOUNDARY_Z_MIN).toBeGreaterThan(MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS);
  });

  test('the ground bump repeats still hold the texture density', () => {
    expect(GROUND_BUMP_REPEAT_X).toBe(32);
    expect(GROUND_BUMP_REPEAT_Z).toBe(42); // 184 / 42 = 4.381 m per tile
    const perTileX = GROUND_PLANE_WIDTH / GROUND_BUMP_REPEAT_X; // 4.375
    const perTileZ = GROUND_PLANE_DEPTH / GROUND_BUMP_REPEAT_Z; // 4.381
    expect(Math.abs(perTileZ - perTileX) / perTileX).toBeLessThan(0.01);
  });

  test('every fast-travel arrival is inside the boundaries and collision-free', () => {
    for (const [id, [ax, az]] of Object.entries(FAST_TRAVEL_ARRIVALS)) {
      expect(`${id}:${ax >= -BOUNDARY_X && ax <= BOUNDARY_X}`).toBe(`${id}:true`);
      expect(`${id}:${az >= BOUNDARY_Z_MIN && az <= BOUNDARY_Z_MAX}`).toBe(`${id}:true`);
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
    // The arrival (12.5 out) is deliberately outside the 10.0 interaction radius.
    expect(getNearbyHubLocation([0, 0, FORTRESS_ARRIVAL_Z])).toBeNull();
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

  test('the seal keeps a player-width of corridor beside the deck', () => {
    const clearance = 2.6 - FOOTPRINT_HALF_W; // 0.49
    expect(clearance).toBeGreaterThan(PLAYER_RADIUS);
    for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.5) {
      expect(collidesWith(0, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
  });

  test('the C-8.36 water ring is complete and reaches under the deck', () => {
    expect(MOAT_GAP_HALF_ANGLE).toBe(0);
    expect(MOAT_INNER_RADIUS).toBe(25.0);
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
    // The deck footprint's outer beam at its north end is still inside the ring.
    const innerCornerRadius = Math.hypot(FOOTPRINT_HALF_W, DECK_Z_INNER - MOTTE_CENTER_Z);
    expect(innerCornerRadius).toBeCloseTo(25.089, 3);
    expect(innerCornerRadius).toBeGreaterThanOrEqual(MOAT_INNER_RADIUS);
  });

  test('every deck sample inside the outer shoreline has water beneath it', () => {
    // Re-run about the moved centre: no dry strip appears under the crossing.
    for (let x = -FOOTPRINT_HALF_W; x <= FOOTPRINT_HALF_W + 1e-9; x += 0.5) {
      for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.5) {
        const r = Math.hypot(x, z - MOTTE_CENTER_Z);
        if (r < MOAT_OUTER_RADIUS - 0.1) {
          expect(coveredByMoat(x, z, MOTTE_CENTER_Z)).toBe(true);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F. No newly introduced intersection with any nearby city structure
// ═══════════════════════════════════════════════════════════════════════════

describe('F. The group stays disjoint from every city structure', () => {
  const groupBox: Box = {
    minX: -MOAT_OUTER_RADIUS,
    maxX: MOAT_OUTER_RADIUS,
    minZ: GROUP_NORTH_Z,
    maxZ: GROUP_SOUTH_Z,
  };

  test('the group’s whole box is north of every city collider', () => {
    const nearestCityMinZ = Math.min(...cityColliders.map((c) => aabb(c).minZ));
    expect(nearestCityMinZ).toBeCloseTo(COLO_REAR_Z, 9);
    expect(nearestCityMinZ).toBeGreaterThan(groupBox.maxZ);
    // The whole 5.0 the group moved is new open apron.
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

  test('the nearest structure clears the moat’s outer ring', () => {
    const nearest = nearestCityCollider(MOTTE_CENTER_Z);
    expect(nearest.distance).toBeCloseTo(37.4872, 3);
    expect(nearest.id.startsWith('colo-')).toBe(true);
    expect(nearest.distance - MOAT_OUTER_RADIUS).toBeCloseTo(6.4872, 3);
    expect(nearest.distance - MOTTE_MESH_HALF_EXTENT).toBeCloseTo(12.3272, 3);
  });

  test('the approach corridor from the rear gate to the outer bank is clear', () => {
    for (let z = COLO_REAR_Z - 1; z >= GROUP_SOUTH_Z - 4; z -= 0.5) {
      expect(collidesWith(0, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. The checks are sensitive to the shift they pin
// ═══════════════════════════════════════════════════════════════════════════

describe('G. A reversed shift fails the same checks', () => {
  test('the apron rule fails at C-8.37’s centre (the crowding this phase fixed)', () => {
    expect(apronAt(C8_37_MOTTE_CENTER_Z)).toBeLessThan(APRON_MIN);
    expect(apronAt(C8_38_MOTTE_CENTER_Z)).toBeGreaterThanOrEqual(APRON_MIN);
    // The apron widens 1:1 with the move.
    expect(apronAt(C8_38_MOTTE_CENTER_Z) - apronAt(C8_37_MOTTE_CENTER_Z)).toBeCloseTo(5.0, 6);
  });

  test('at the C-8.37 centre the nearest structure was 5.0 closer', () => {
    const mid = nearestCityCollider(C8_37_MOTTE_CENTER_Z);
    const now = nearestCityCollider(MOTTE_CENTER_Z);
    expect(mid.distance).toBeCloseTo(32.5021, 3);
    expect(now.distance - mid.distance).toBeCloseTo(4.9851, 3);
    // C-8.37 had already cleared the ring; before it, the ring covered the stone.
    expect(mid.distance).toBeGreaterThan(MOAT_OUTER_RADIUS);
    const pre = nearestCityCollider(PRE_SHIFT_MOTTE_CENTER_Z);
    expect(MOAT_OUTER_RADIUS - pre.distance).toBeCloseTo(3.4774, 3);
  });

  test('the ground plane would have failed coverage without its own matching move', () => {
    // The C-8.37 plane still covered the C-8.37 group with the same 1.5 margin,
    // so the two moves are a matched pair, not a coincidence.
    const c837MoatNorth = C8_37_MOTTE_CENTER_Z - MOAT_OUTER_RADIUS; // -107.5
    expect(c837MoatNorth - C8_37_GROUND_PLANE_NORTH_Z).toBeCloseTo(1.5, 6);
    expect(GROUP_NORTH_Z - GROUND_PLANE_NORTH_Z).toBeCloseTo(1.5, 6);
    expect((C8_37_GROUND_PLANE_NORTH_Z - GROUND_PLANE_NORTH_Z) -
      (c837MoatNorth - GROUP_NORTH_Z)).toBeCloseTo(0, 6);
  });

  test('BOUNDARY_Z_MIN tracks the centre, not a frozen literal', () => {
    const derived = (centreZ: number): number =>
      centreZ - MOTTE_PERIMETER_RADIUS + 2.5;
    expect(derived(MOTTE_CENTER_Z)).toBe(BOUNDARY_Z_MIN);
    expect(derived(C8_37_MOTTE_CENTER_Z)).toBe(-96); // C-8.37's own limit
    expect(derived(PRE_SHIFT_MOTTE_CENTER_Z)).toBe(-91); // the pre-shift limit
  });
});
