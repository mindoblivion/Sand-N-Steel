/**
 * Phase C-8.45 — the Training Hall collider.
 *
 * Run with: bun test src/utils/phaseC8_45.test.ts
 *
 * ── WHY THIS COLLIDER EXISTS ──────────────────────────────────────────────
 * C-8.44's read-only audit walked every rendered city building and its
 * collider, and found exactly one building with no collision at all: the
 * Training Hall in the western annex (`TrainingYard.tsx` → `TrainingHall.tsx`).
 * The player could walk straight through its walls.  This phase registers it
 * with the registry's existing convention — one axis-aligned rectangle on the
 * building's rendered lower-step footprint — and rebases the one test that
 * pinned the absolute collider count.
 *
 * ── THE MEASUREMENT (derived here from the sources, not restated) ─────────
 * `TrainingYard.tsx` mounts `<TrainingHall />` inside its root group
 * `[-18, 0, 0]`; the hall's own group is `[-12.35, 0, 3.00]` with yaw `+π/2`,
 * so its world root is `[-30.35, 0, 3.00]`.  Its `BuildingFoundation` lower
 * step is `(HALL_W + 2 × 0.25) × (HALL_D + 2 × 0.25)` = `7.5 × 2.7`
 * (component-local X × Z); the π/2 yaw swaps the axes, giving a world
 * footprint of X `[-31.70, -29.00]`, Z `[-0.75, 6.75]` — the rectangle the
 * registry now carries as `RECT('training-hall', -30.35, 3.00, 2.7, 7.5)`.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   A. the registry entry: one rectangle, unique id, matching the measured
 *      rendered lower-step footprint, and the only collider covering it;
 *   B. the hall is solid to the real `resolveCityMovement` on all four sides,
 *      and neither principal axis can be walked through;
 *   C. the hall can still be walked around where the surrounding geometry
 *      allows it;
 *   D. the Arena Medical House ↔ Training Hall passage stays traversable end
 *      to end at the 0.4 player radius, through its narrowest section;
 *   E. the training-yard walls and the east entrance gate are unchanged;
 *   F. all 21 hub triggers remain reachable and all 21 arrivals collision-free;
 *   G. everything the phase must not touch — the C-8.43 widths, the Forge's
 *      deliberate 9.5, the C-8.33 seals, the C-8.38 motte centre, the C-8.41
 *      kerb, the C-8.36 water ring and the drawbridge — is unchanged.
 *
 * The one control (§H) reproduces the pre-fix defect against a registry with
 * `training-hall` spliced out, so the checks are shown to be sensitive to the
 * collider this phase added and to nothing else.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type Collider,
  type RectCollider,
} from './collisionShapes';
import {
  resolveCityMovement,
  HUB_LOCATIONS,
  FAST_TRAVEL_ARRIVALS,
  BOUNDARY_X,
} from './cityCollisions';
import { MOTTE_CENTER_Z } from './terrainHeight';
import {
  MOAT_INNER_RADIUS,
  MOAT_OUTER_RADIUS,
  MOAT_WATER_Y,
  MOAT_GAP_HALF_ANGLE,
  KERB_INNER_RADIUS,
  KERB_OUTER_RADIUS,
  KERB_BASE_Y,
  KERB_TOP_Y,
  KERB_GATE_HALF_W,
} from '../components/3d/city/NorthernMotte';
import { DECK_Z_OUTER, DECK_Z_INNER, DECK_LENGTH, DECK_TOP_Y } from '../components/3d/city/Drawbridge';
import { BRIDGE_Z_OUTER } from './terrainHeight';

// ── Sources ─────────────────────────────────────────────────────────────────

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const hallSrc = load('../components/3d/city/TrainingHall.tsx');
const yardSrc = load('../components/3d/city/TrainingYard.tsx');
const collisionSrc = load('./collisionShapes.ts');

// ── The measured rendered footprint, derived from those sources ─────────────

/** `const HALL_W = 7;` — the hall's wall footprint width (component-local X). */
const HALL_W = Number(hallSrc.match(/const\s+HALL_W\s*=\s*([\d.]+)\s*;/)?.[1]);
/** `const HALL_D = 2.2;` — the hall's wall footprint depth (component-local Z). */
const HALL_D = Number(hallSrc.match(/const\s+HALL_D\s*=\s*([\d.]+)\s*;/)?.[1]);
/** The foundation projection the hall passes (`projection={0.25}`). */
const PROJECTION = Number(hallSrc.match(/projection=\{([\d.]+)\}/)?.[1]);

/** The hall's own group transform — position and the +π/2 yaw. */
const HALL_LOCAL = hallSrc.match(
  /<group position=\{\[(-?[\d.]+),\s*0,\s*(-?[\d.]+)\]\} rotation=\{\[0,\s*Math\.PI \/ 2,\s*0\]\}>/,
);
/** The yard root group the hall is mounted inside. */
const YARD_ROOT = yardSrc.match(/<group position=\{\[(-?[\d.]+),\s*0,\s*(-?[\d.]+)\]\}>/);

/** World root of the hall, from the two transforms above. */
const HALL_CX = Number(YARD_ROOT?.[1]) + Number(HALL_LOCAL?.[1]);
const HALL_CZ = Number(YARD_ROOT?.[2]) + Number(HALL_LOCAL?.[2]);

/** Lower ground step of `BuildingFoundation` — `size + projection × 2`. */
const LOCAL_HALF_X = (HALL_W + PROJECTION * 2) / 2;
const LOCAL_HALF_Z = (HALL_D + PROJECTION * 2) / 2;

/** The yaw is `+π/2`, so the local half-extents swap onto the world axes. */
const YAW = Math.PI / 2;
const COS_YAW = Math.abs(Math.cos(YAW)); // 0
const SIN_YAW = Math.abs(Math.sin(YAW)); // 1
const HALL_HW = LOCAL_HALF_X * COS_YAW + LOCAL_HALF_Z * SIN_YAW; // 1.35 (world X)
const HALL_HD = LOCAL_HALF_X * SIN_YAW + LOCAL_HALF_Z * COS_YAW; // 3.75 (world Z)

const HALL_MIN_X = HALL_CX - HALL_HW;
const HALL_MAX_X = HALL_CX + HALL_HW;
const HALL_MIN_Z = HALL_CZ - HALL_HD;
const HALL_MAX_Z = HALL_CZ + HALL_HD;

// ── Helpers ─────────────────────────────────────────────────────────────────

const SPEED = 3.8;
const DELTA = 0.1;

function walk(start: [number, number], dx: number, dz: number, steps: number) {
  let pos: [number, number, number] = [start[0], 0, start[1]];
  const trail: Array<[number, number]> = [[start[0], start[1]]];
  for (let i = 0; i < steps; i++) {
    pos = resolveCityMovement(pos, dx, dz, SPEED, DELTA);
    trail.push([pos[0], pos[2]]);
  }
  return { end: [pos[0], pos[2]] as [number, number], trail };
}

/** Point-in-footprint test against the *registered* rectangle's bounds. */
const rectById = (id: string): RectCollider => {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`no rect collider '${id}'`);
  return c;
};

/** Point-only containment probe (`collidesWith` at a negligible radius). */
const POINT_R = 1e-3;
const coversPoint = (colliders: Collider[], x: number, z: number) =>
  collidesWith(x, z, POINT_R, colliders);

/** Run `fn` with every `training-hall` collider spliced out of the registry. */
function withoutTrainingHall<T>(fn: () => T): T {
  const snapshot = CITY_COLLIDERS.slice();
  try {
    for (let i = CITY_COLLIDERS.length - 1; i >= 0; i--) {
      if (CITY_COLLIDERS[i].id === 'training-hall') CITY_COLLIDERS.splice(i, 1);
    }
    return fn();
  } finally {
    CITY_COLLIDERS.length = 0;
    CITY_COLLIDERS.push(...snapshot);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A. The registry entry
// ══════════════════════════════════════════════════════════════════════════

describe('A. The registry carries exactly one training-hall rectangle', () => {
  test('the rectangle matches the rendered lower-step footprint, measured from source', () => {
    const hall = rectById('training-hall');
    // Sanity-check the derivation itself before comparing against the registry.
    expect([HALL_W, HALL_D, PROJECTION]).toEqual([7, 2.2, 0.25]);
    expect([HALL_CX, HALL_CZ]).toEqual([-30.35, 3.0]);
    expect(HALL_MIN_X).toBeCloseTo(-31.7, 10);
    expect(HALL_MAX_X).toBeCloseTo(-29.0, 10);
    expect(HALL_MIN_Z).toBeCloseTo(-0.75, 10);
    expect(HALL_MAX_Z).toBeCloseTo(6.75, 10);
    // …and the registry agrees with it to machine precision.
    expect(hall.cx).toBeCloseTo(HALL_CX, 10);
    expect(hall.cz).toBeCloseTo(HALL_CZ, 10);
    expect(hall.hw).toBeCloseTo(HALL_HW, 10);
    expect(hall.hd).toBeCloseTo(HALL_HD, 10);
  });

  test('the id is unique in the registry', () => {
    const ids = CITY_COLLIDERS.map((c) => c.id);
    expect(ids.filter((id) => id === 'training-hall').length).toBe(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('the registry grew by exactly one collider and one rectangle', () => {
    // 109 colliders / 30 rectangles was the C-8.43 state (C-8.38 left 109).
    // This phase's own addition is the one rectangle below; Phase C-8.64A later
    // appended its `circus-*` segments — 31 after the entrance-alignment
    // closure — and Phase C-8.64B the `forecourt-parapet` rectangle
    // (110 + 31 + 1 = 142 colliders, 30 + 1 + 1 = 32 rectangles).
    expect(CITY_COLLIDERS.length).toBe(142);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(32);
  });

  test('no other collider covers the training hall footprint', () => {
    const others = CITY_COLLIDERS.filter((c) => c.id !== 'training-hall');
    let covered = 0;
    for (let i = 0; i <= 24; i++) {
      for (let j = 0; j <= 24; j++) {
        const x = HALL_MIN_X + ((HALL_MAX_X - HALL_MIN_X) * i) / 24;
        const z = HALL_MIN_Z + ((HALL_MAX_Z - HALL_MIN_Z) * j) / 24;
        if (coversPoint(others, x, z)) covered++;
      }
    }
    // Before this phase the whole footprint was open ground: 0 of 625 interior
    // samples sat inside any collider.  It is now covered by exactly one rect.
    expect(covered).toBe(0);
    expect(coversPoint(CITY_COLLIDERS, HALL_CX, HALL_CZ)).toBe(true);
  });

  test('the comment states the footprint it matches', () => {
    expect(collisionSrc).toContain("RECT('training-hall', -30.35, 3.00, 2.7, 7.5)");
    expect(collisionSrc).toMatch(/lower-step footprint/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The hall is solid to the real resolver
// ══════════════════════════════════════════════════════════════════════════

const insideHall = ([x, z]: [number, number]) =>
  x > HALL_MIN_X && x < HALL_MAX_X && z > HALL_MIN_Z && z < HALL_MAX_Z;

describe('B. The hall blocks movement from every side and on both axes', () => {
  test('a player at the hall centre is inside its collider', () => {
    expect(collidesWith(HALL_CX, HALL_CZ, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
  });

  test('west-bound walk from the east stops at the hall’s east face', () => {
    const r = walk([-27, 3], -1, 0, 40);
    // The player centre can reach HALL_MAX_X + PLAYER_RADIUS = -28.60, no closer.
    expect(r.end[0]).toBeGreaterThanOrEqual(HALL_MAX_X + PLAYER_RADIUS - 1e-9);
    expect(r.trail.some(insideHall)).toBe(false);
  });

  test('east-bound walk from the west stops at the hall’s west face', () => {
    const r = walk([-33.5, 3], 1, 0, 40);
    expect(r.end[0]).toBeLessThanOrEqual(HALL_MIN_X - PLAYER_RADIUS + 1e-9);
    expect(r.trail.some(insideHall)).toBe(false);
  });

  test('south-bound walk from the north stops at the hall’s north face', () => {
    const r = walk([HALL_CX, 9], 0, -1, 40);
    expect(r.end[1]).toBeGreaterThanOrEqual(HALL_MAX_Z + PLAYER_RADIUS - 1e-9);
    expect(r.trail.some(insideHall)).toBe(false);
  });

  test('north-bound walk out of the medical corridor stops at the hall’s south face', () => {
    const start: [number, number] = [HALL_CX, -1.5]; // mid-corridor, clear of both buildings
    expect(collidesWith(start[0], start[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    const r = walk(start, 0, 1, 40);
    expect(r.end[1]).toBeLessThanOrEqual(HALL_MIN_Z - PLAYER_RADIUS + 1e-9);
    expect(r.trail.some(insideHall)).toBe(false);
  });

  test('neither principal axis can be crossed through the building', () => {
    // The two crossing walks above never leave the hall's X band from one side
    // to the other, nor its Z band — so the footprint is impassable.
    const west = walk([-27, 3], -1, 0, 60);
    const east = walk([-33.5, 3], 1, 0, 60);
    expect(west.end[0]).toBeGreaterThan(HALL_MIN_X);
    expect(east.end[0]).toBeLessThan(HALL_MAX_X);
    const south = walk([HALL_CX, 9], 0, -1, 60);
    const north = walk([HALL_CX, -1.5], 0, 1, 60);
    expect(south.end[1]).toBeGreaterThan(HALL_MIN_Z);
    expect(north.end[1]).toBeLessThan(HALL_MAX_Z + 1.0); // stays south of the hall
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The hall can still be walked around
// ══════════════════════════════════════════════════════════════════════════

describe('C. Movement around the hall remains possible', () => {
  test('the west side is walkable from the corridor to beyond the hall’s north end', () => {
    const r = walk([-33, -1.5], 0, 1, 60);
    expect(r.end[1]).toBeGreaterThan(HALL_MAX_Z + 1); // clears the building
    expect(r.trail.some(insideHall)).toBe(false);
    expect(r.trail.every(([x, z]) => !collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS))).toBe(true);
  });

  test('the north side is walkable across to the western boundary', () => {
    const r = walk([HALL_CX, 8.5], -1, 0, 40);
    expect(r.end[0]).toBe(-BOUNDARY_X);
    expect(r.trail.some(insideHall)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The Arena Medical House ↔ Training Hall passage
// ══════════════════════════════════════════════════════════════════════════

const CORRIDOR_Z = -1.5; // mid-gap between the medical house’s north face and the hall’s south face

describe('D. The medical-house ↔ hall passage stays traversable end to end', () => {
  test('the corridor between the two buildings is bounded as measured', () => {
    const medical = rectById('arena-medical');
    expect(medical.cz + medical.hd).toBeCloseTo(-2.25, 10); // medical north face
    expect(HALL_MIN_Z).toBeCloseTo(-0.75, 10); // hall south face
    // The plan gap between the two registered footprints.
    expect(HALL_MIN_Z - (medical.cz + medical.hd)).toBeCloseTo(1.5, 10);
  });

  test('the narrowest section is between the two faces, wide enough for the player', () => {
    // Where both buildings bound the corridor, the usable band of player
    // centres is the 1.5 plan gap less the 0.8 player diameter.
    const medical = rectById('arena-medical');
    const gap = HALL_MIN_Z - (medical.cz + medical.hd);
    expect(gap - PLAYER_RADIUS * 2).toBeCloseTo(0.7, 10);
    expect(gap - PLAYER_RADIUS * 2).toBeGreaterThan(0);
    // …and the resolver agrees: clear at the corridor centre, blocked a radius
    // clear of each face.
    const midX = (HALL_MIN_X + HALL_MAX_X) / 2;
    expect(collidesWith(midX, CORRIDOR_Z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(midX, medical.cz + medical.hd - 0.35, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
    expect(collidesWith(midX, HALL_MIN_Z + 0.35, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
  });

  test('a complete route runs through the passage, collision-free at every step', () => {
    // Enter from the east (open ground between the medical house and the yard
    // wall), cross the narrowest section between the two buildings, and exit
    // west of both — end to end, not merely a free midpoint.
    const r = walk([-25.5, CORRIDOR_Z], -1, 0, 40);
    // Crossed the narrowest section — the whole hall's X band — to the west.
    expect(r.end[0]).toBeLessThan(HALL_MIN_X - PLAYER_RADIUS);
    expect(r.end[0]).toBe(-BOUNDARY_X);
    const throughNarrow = r.trail.filter(([x]) => x <= HALL_MAX_X && x >= HALL_MIN_X);
    expect(throughNarrow.length).toBeGreaterThan(0); // the route really uses the gap
    for (const [x, z] of r.trail) {
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `blocked at (${x}, ${z})`).toBe(false);
    }
    // The route holds the corridor's centre line — no drift into either face.
    expect(r.trail.every(([, z]) => Math.abs(z - CORRIDOR_Z) < 1e-9)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. Training-yard walls and gate unchanged
// ══════════════════════════════════════════════════════════════════════════

describe('E. The yard enclosure and its east entrance are unchanged', () => {
  test('the enclosure still has its 14 wall segments and the two street walls', () => {
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('yard-wall')).length).toBe(14);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('street-wall')).length).toBe(2);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('street-return')).length).toBe(2);
  });

  test('the entrance gap is traversable and the wall still blocks beside it', () => {
    // Entering at the gap centre, and a point inside the courtyard.
    expect(collidesWith(-11.113, 0, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(-15, 0, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    // The rendered wall's west side (radius 7 about [-18, 0]) still blocks.
    expect(collidesWith(-25, 0, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
  });

  test('a walk in from the east still reaches the courtyard', () => {
    const r = walk([-5, 0], -1, 0, 40);
    expect(r.end[0]).toBeLessThan(-14); // well inside the enclosure
    expect(collidesWith(r.end[0], r.end[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Hubs and fast-travel arrivals
// ══════════════════════════════════════════════════════════════════════════

describe('F. Hub triggers and arrivals are unaffected', () => {
  test('all 21 hub interaction triggers remain reachable', () => {
    // C-8.70B added the East Circus District's race entry — the 21st trigger.
    expect(HUB_LOCATIONS.length).toBe(21);
    const unreachable: string[] = [];
    for (const loc of HUB_LOCATIONS) {
      const lx = loc.position[0];
      const lz = loc.position[2];
      let ok = !collidesWith(lx, lz, PLAYER_RADIUS, CITY_COLLIDERS);
      for (let a = 0; a < 16 && !ok; a++) {
        const ang = (a / 16) * Math.PI * 2;
        if (!collidesWith(lx + Math.cos(ang) * loc.radius, lz + Math.sin(ang) * loc.radius, PLAYER_RADIUS, CITY_COLLIDERS)) {
          ok = true;
        }
      }
      if (!ok) unreachable.push(loc.id);
    }
    expect(unreachable).toEqual([]);
  });

  test('all 21 fast-travel arrivals are collision-free and have a clear step out', () => {
    expect(Object.keys(FAST_TRAVEL_ARRIVALS).length).toBe(21);
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS), `${loc.id} arrival blocked`).toBe(false);
      // A necessary condition for reachability: one direction is clear for 2 units.
      const clear = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dz]) => {
        for (let d = 0.5; d <= 2.0; d += 0.5) {
          if (collidesWith(ax + dx * d, az + dz * d, PLAYER_RADIUS, CITY_COLLIDERS)) return false;
        }
        return true;
      });
      expect(clear, `${loc.id} arrival [${ax}, ${az}] has no clear step out`).toBe(true);
    }
  });

  test('the training-yard arrival is clear and can move', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.training_yard;
    expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    const r = walk([ax, az], 0, -1, 4);
    expect(Math.abs(r.end[1] - az)).toBeGreaterThan(0.5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. Preservation — nothing else moved
// ══════════════════════════════════════════════════════════════════════════

describe('G. Every other collider and the northern group are untouched', () => {
  test('the C-8.43 corrections are exactly as shipped (tavern 8.9 × 7.7, caravanserai 9.1 × 8.1)', () => {
    expect(rectById('city-tavern')).toMatchObject({ cx: -16, cz: 14, hw: 8.9 / 2, hd: 7.7 / 2 });
    expect(rectById('caravanserai')).toMatchObject({ cx: 16, cz: 14, hw: 9.1 / 2, hd: 8.1 / 2 });
  });

  test('the Smithing Forge keeps its deliberate 9.5 width', () => {
    expect(rectById('smithing-forge')).toMatchObject({ cx: 18, cz: 2.6, hw: 9.5 / 2, hd: 8.0 / 2 });
  });

  test('the Arena Medical House collider is unchanged', () => {
    expect(rectById('arena-medical')).toMatchObject({ cx: -29, cz: -5, hw: 5.5 / 2, hd: 5.5 / 2 });
  });

  test('the C-8.33 rear-gate seals still bridge the podium cut to the facade jamb', () => {
    const COLO_R = 19.3;
    const COLO_ROOT_Z = -25;
    const PODIUM_R = 15.3;
    const gateHalf = Math.asin(2.7 / COLO_R);
    const podiumGap = Math.asin(2.6 / PODIUM_R);
    const facade: [number, number] = [COLO_R * Math.sin(Math.PI - gateHalf), COLO_R * Math.cos(Math.PI - gateHalf) + COLO_ROOT_Z];
    const bowl: [number, number] = [PODIUM_R * Math.sin(Math.PI - podiumGap), PODIUM_R * Math.cos(Math.PI - podiumGap) + COLO_ROOT_Z];
    for (const id of ['colo-gateseal-l', 'colo-gateseal-r']) {
      const seal = CITY_COLLIDERS.find((c) => c.id === id);
      expect(seal?.type).toBe('segment');
      if (!seal || seal.type !== 'segment') throw new Error('missing seal');
      const sx = Math.sign(seal.x1) || 1;
      expect(seal.x1).toBeCloseTo(sx * facade[0], 9);
      expect(seal.z1).toBeCloseTo(facade[1], 9);
      expect(seal.x2).toBeCloseTo(sx * bowl[0], 9);
      expect(seal.z2).toBeCloseTo(bowl[1], 9);
    }
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length).toBe(46);
  });

  test('the northern group keeps MOTTE_CENTER_Z −81.5 and its derived walls', () => {
    expect(MOTTE_CENTER_Z).toBe(-81.5);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
    const fortress = CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-'));
    expect(fortress.length).toBe(5);
    expect(rectById('fortress-south-l').cz).toBeCloseTo(MOTTE_CENTER_Z + 10.5, 9);
    expect(rectById('fortress-north').cz).toBeCloseTo(MOTTE_CENTER_Z - 10.5, 9);
  });

  test('the C-8.41 kerb and the C-8.36 water ring are unchanged', () => {
    expect([KERB_INNER_RADIUS, KERB_OUTER_RADIUS, KERB_BASE_Y, KERB_TOP_Y, KERB_GATE_HALF_W]).toEqual([
      30.9, 31.35, -0.1, 0.14, 2.7,
    ]);
    expect([MOAT_INNER_RADIUS, MOAT_OUTER_RADIUS, MOAT_WATER_Y, MOAT_GAP_HALF_ANGLE]).toEqual([25.0, 31.0, 0.06, 0]);
  });

  test('the drawbridge deck is unchanged', () => {
    expect(DECK_Z_OUTER).toBe(BRIDGE_Z_OUTER);
    expect(DECK_Z_INNER).toBeCloseTo(-56.5, 10);
    expect(DECK_LENGTH).toBeCloseTo(6.0, 10);
    expect(DECK_TOP_Y).toBe(0.16);
  });

  test('training-hall is the only id this phase introduced', () => {
    // The registry's other ids are untouched — no stray or renamed rectangle
    // appears, and 'training' names this collider alone.
    expect(CITY_COLLIDERS.filter((c) => /training/i.test(c.id)).map((c) => c.id)).toEqual([
      'training-hall',
    ]);
    expect(CITY_COLLIDERS.some((c) => /veranda|post|bench|banner/i.test(c.id))).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// H. Control — the pre-fix defect, reproduced against a spliced registry
// ══════════════════════════════════════════════════════════════════════════

describe('H. Control: the C-8.44 defect reproduces without the collider', () => {
  test('with training-hall spliced out, the same walk passes through the building', () => {
    const end = withoutTrainingHall(() => walk([-27, 3], -1, 0, 60).end);
    // No collider ⇒ nothing stops the player: it walks clean to the boundary.
    expect(end[0]).toBe(-BOUNDARY_X);
    expect(insideHall(end)).toBe(false);
    // …and the hall's own centre is open ground in that registry.
    expect(withoutTrainingHall(() => coversPoint(CITY_COLLIDERS, HALL_CX, HALL_CZ))).toBe(false);
  });

  test('the shipped registry is intact again after the control', () => {
    // 141 since Phase C-8.64A appended its 31 `circus-*` perimeter segments,
    // 142 since Phase C-8.64B appended the `forecourt-parapet` rectangle.
    expect(CITY_COLLIDERS.length).toBe(142);
    expect(CITY_COLLIDERS.filter((c) => c.id === 'training-hall').length).toBe(1);
    expect(collidesWith(HALL_CX, HALL_CZ, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
  });
});
