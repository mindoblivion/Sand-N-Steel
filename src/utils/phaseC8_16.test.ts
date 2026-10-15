/**
 * Phase C-8.16 — Doctore House west-facing entrance.
 *
 * The C-8.15 audit found the Doctore House's south doorway (local Z 2.52 →
 * world [28, -15.48]) buried inside the MerchantHouse collider
 * (x[22.15,29.85] z[-16.5,-9.5]): the approach there is unreachable, and the
 * hub table resolves such a point to `merchant_house` rather than
 * `doctore_house`. Phase C-8.16 (Option C1) reorients the doorway onto the
 * west face (local -X) using the primitive's documented outward convention and
 * relocates the west-face window onto the east face.
 *
 * Nothing else moves: the building root, collider, hub, fast-travel arrival,
 * foundation, the MerchantHouse and the Via Mercatoria paving are all
 * untouched, and the pre-existing MerchantHouse↔DoctoreHouse interpenetration
 * stays exactly as it was (no collider was narrowed to conceal it).
 *
 * Every case runs against the real registry (CITY_COLLIDERS), the real
 * movement resolver (resolveCityMovement), the real hub table and the real
 * street footprint module — no mocks. The transform cases read the rendered
 * component source and push the parsed transforms through three.js itself, so
 * the expected world plane/normal are derived from the components' actual
 * conventions rather than assumed.
 *
 * Run with: bun test src/utils/phaseC8_16.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  overlappingColliderIds,
  type Collider,
  type RectCollider,
} from './collisionShapes';
import {
  resolveCityMovement,
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  getNearbyHubLocation,
} from './cityCollisions';
import { VIA_MERCATORIA_PATH } from './streetGeometry';

// ── Component sources ─────────────────────────────────────────────────────

const houseSrc = readFileSync(
  new URL('../components/3d/city/DoctoreHouse.tsx', import.meta.url),
  'utf8',
);
const archSrc = readFileSync(
  new URL('../components/3d/city/ClassicalArchitecture.tsx', import.meta.url),
  'utf8',
);

// ── Helpers ────────────────────────────────────────────────────────────────

const R = PLAYER_RADIUS;

/** Documented Phase 31D arrival invariant: player radius + 0.5 safety margin. */
const ARRIVAL_CLEARANCE = R + 0.5; // 0.9

/** Find a rect collider by ID from the live CITY_COLLIDERS registry. */
function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

const doctore = findRect('doctore-house');
const merchantHouse = findRect('merchant-house');
const generalStore = findRect('general-store');
const forge = findRect('smithing-forge');
const workshop = findRect('armor-workshop');

/** Axis-aligned overlap of two rect footprints; <= 0 on either axis = no overlap. */
function overlap(a: RectCollider, b: RectCollider) {
  return {
    overlapX:
      Math.min(a.cx + a.hw, b.cx + b.hw) - Math.max(a.cx - a.hw, b.cx - b.hw),
    overlapZ:
      Math.min(a.cz + a.hd, b.cz + b.hd) - Math.max(a.cz - a.hd, b.cz - b.hd),
  };
}

/**
 * IDs of colliders whose footprint contains the point. Radius-free containment
 * (collidesWith's geometry tests are strict `dist < r`, so they say nothing at
 * r = 0): `distanceTo` returns 0 exactly when the point is inside the shape.
 */
function containingFootprints(x: number, z: number): string[] {
  return CITY_COLLIDERS.filter((c) => distanceTo(c, x, z) === 0).map((c) => c.id);
}

/** Shortest distance between two rect footprints (0 when they overlap). */
function rectGap(a: RectCollider, b: RectCollider): number {
  const { overlapX, overlapZ } = overlap(a, b);
  return Math.hypot(Math.max(0, -overlapX), Math.max(0, -overlapZ));
}

/** Shortest distance from a point to any collider (rect, circle or segment). */
function distanceTo(c: Collider, x: number, z: number): number {
  if (c.type === 'rect') {
    const dx = Math.max(c.cx - c.hw - x, 0, x - (c.cx + c.hw));
    const dz = Math.max(c.cz - c.hd - z, 0, z - (c.cz + c.hd));
    return Math.hypot(dx, dz);
  }
  if (c.type === 'circle') {
    return Math.max(0, Math.hypot(x - c.cx, z - c.cz) - c.r);
  }
  const vx = c.x2 - c.x1;
  const vz = c.z2 - c.z1;
  const t = Math.max(
    0,
    Math.min(1, ((x - c.x1) * vx + (z - c.z1) * vz) / (vx * vx + vz * vz)),
  );
  return Math.hypot(x - (c.x1 + t * vx), z - (c.z1 + t * vz));
}

// Production movement constants (matching resolveCityMovement callers).
const SPEED = 3.8;
const DT = 1 / 60;
const STEP = SPEED * DT; // ≈ 0.06333

/** Drive the real resolver for `steps` frames in direction (dx, dz). */
function walk(
  start: [number, number, number],
  dx: number,
  dz: number,
  steps: number,
): Array<[number, number, number]> {
  const traj: Array<[number, number, number]> = [start];
  let pos = start;
  for (let i = 0; i < steps; i++) {
    pos = resolveCityMovement(pos, dx, dz, SPEED, DT);
    traj.push(pos);
  }
  return traj;
}

/** True if any position in the trajectory overlaps the given colliders. */
function everInside(
  traj: Array<[number, number, number]>,
  colliders: Collider[],
): boolean {
  return traj.some((p) => collidesWith(p[0], p[2], R, colliders));
}

/** Parse a JSX angle token: `Math.PI`, `-Math.PI / 2`, or a plain literal. */
function angle(token: string): number {
  const t = token.trim();
  if (t === 'Math.PI') return Math.PI;
  if (t === '-Math.PI') return -Math.PI;
  const half = /^(-?)Math\.PI\s*\/\s*2$/.exec(t);
  if (half) return (half[1] === '-' ? -1 : 1) * (Math.PI / 2);
  return Number(t);
}

interface ParsedXform {
  localPosition: [number, number, number];
  rotation: [number, number, number];
}

/** Extract `position={[...]} rotation={[...]}` from a named JSX primitive. */
function parseXform(tag: string): ParsedXform | null {
  const re = new RegExp(
    `<${tag}\\s+position=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\}\\s*` +
      `rotation=\\{\\[\\s*([^,]+),\\s*([^,]+),\\s*([^\\]]+)\\]\\}`,
  );
  const m = re.exec(houseSrc);
  if (!m) return null;
  return {
    localPosition: [Number(m[1]), Number(m[2]), Number(m[3])],
    rotation: [angle(m[4]), angle(m[5]), angle(m[6])],
  };
}

/**
 * Push a child transform through the real root group with three.js and report
 * its world position, its local +Z axis in world space (the doorway/window
 * primitives' outward normal) and the world-space bounds of a local box.
 */
function placeOnRoot(
  xf: ParsedXform,
  rootPos: [number, number, number],
  localBox?: { x: [number, number]; y: [number, number]; z: [number, number] },
) {
  const root = new THREE.Object3D();
  root.position.fromArray(rootPos);
  const child = new THREE.Object3D();
  child.position.fromArray(xf.localPosition);
  child.rotation.set(xf.rotation[0], xf.rotation[1], xf.rotation[2]);
  root.add(child);
  root.updateMatrixWorld(true);

  const worldPosition = child.getWorldPosition(new THREE.Vector3());
  const outwardNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(
    child.getWorldQuaternion(new THREE.Quaternion()),
  );

  let bounds: { min: THREE.Vector3; max: THREE.Vector3 } | null = null;
  if (localBox) {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const x of localBox.x) {
      for (const y of localBox.y) {
        for (const z of localBox.z) {
          const p = child.localToWorld(new THREE.Vector3(x, y, z));
          min.min(p);
          max.max(p);
        }
      }
    }
    bounds = { min, max };
  }

  return { worldPosition, outwardNormal, bounds };
}

// ── Source-derived transforms ─────────────────────────────────────────────

const rootMatch =
  /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/.exec(
    houseSrc,
  );
const foundationMatch =
  /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}[\s\S]*?projection=\{([\d.]+)\}/.exec(
    houseSrc,
  );
const doorwayXform = parseXform('ClassicalDoorway');
const windowXform = parseXform('ClassicalWindow');

const ROOT: [number, number, number] = rootMatch
  ? [Number(rootMatch[1]), Number(rootMatch[2]), Number(rootMatch[3])]
  : [NaN, NaN, NaN];

// The ClassicalDoorway primitive's own local profile, read from
// ClassicalArchitecture.tsx. Every outward-facing element sits at POSITIVE
// local Z and the recessed interior at NEGATIVE local Z, so the primitive's
// outward normal is local +Z and the group `rotation` alone decides which wall
// the opening faces:
//   dark recess              position [0, height / 2, -depth / 4]
//   warm interior back wall  position [0, height / 2, -depth / 2 - 0.03]
//   raised threshold         position [0, 0.06, 0.05]
//   threshold contact step   position [0, 0.02, depth / 2 + 0.12]  (outermost)
//   jambs                    position [±(width/2 + 0.11), height / 2, 0.02]
//   lintel                   position [0, height + lintelHeight / 2, 0.04]
//   projecting cornice cap   position [0, height + lintelHeight + 0.05, 0.06]
// There is no door LEAF mesh: the opening is a recessed void closed by a warm
// interior back wall, so only the recess/jambs/lintel/cap/threshold transforms
// need to reorient.
const DOOR = { width: 1.4, height: 2.2, depth: 0.35, jambWidth: 0.22, lintelHeight: 0.28 };
const DOOR_LOCAL_BOX: { x: [number, number]; y: [number, number]; z: [number, number] } = {
  x: [-(DOOR.width / 2 + DOOR.jambWidth), DOOR.width / 2 + DOOR.jambWidth],
  y: [0, DOOR.height + DOOR.lintelHeight + 0.1],
  // outer face of the contact step … outer face of the interior back wall
  z: [-(DOOR.depth / 2 + 0.03 + 0.02), DOOR.depth / 2 + 0.12 + 0.125],
};
/** Height of the ground-level threshold steps — they are lips, not walls. */
const THRESHOLD_LIP_TOP = 0.06;

const doorPlacement = doorwayXform
  ? placeOnRoot(doorwayXform, ROOT, DOOR_LOCAL_BOX)
  : null;
const windowPlacement = windowXform ? placeOnRoot(windowXform, ROOT) : null;

const DOCTORE_HUB = HUB_LOCATIONS.find((l) => l.id === 'doctore_house');
const MERCHANT_HUB = HUB_LOCATIONS.find((l) => l.id === 'merchant_house');
const DOCTORE_ARRIVAL = FAST_TRAVEL_ARRIVALS.doctore_house;
const MERCHANT_ARRIVAL = FAST_TRAVEL_ARRIVALS.merchant_house;
const GS_ARRIVAL = FAST_TRAVEL_ARRIVALS.general_store;

/** Walk east from the fast-travel arrival and return the full trajectory. */
const approachTraj = walk([DOCTORE_ARRIVAL[0], 0, DOCTORE_ARRIVAL[1]], 1, 0, 60);
const approachEnd = approachTraj[approachTraj.length - 1];

/** Distance from the final standoff to the doorway's world pivot. */
const STANDOFF_TO_DOOR_PLANE = doorPlacement
  ? doorPlacement.worldPosition.x - approachEnd[0]
  : NaN;
/** Distance from the final standoff to the blocking collider face. */
const STANDOFF_TO_COLLIDER = doctore.cx - doctore.hw - approachEnd[0];

// ── A. Doorway placement and world-space orientation ──────────────────────

describe('A. West doorway: transform, world plane and outward normal', () => {
  test('component source exposes the root group, foundation, doorway and window', () => {
    expect(rootMatch).not.toBeNull();
    expect(foundationMatch).not.toBeNull();
    expect(doorwayXform).not.toBeNull();
    expect(windowXform).not.toBeNull();
  });

  test("the doorway primitive's outward normal really is local +Z", () => {
    // Evidence from ClassicalArchitecture.tsx, not assumption: the outermost
    // element (threshold contact step) and the lintel/cap sit at +Z while the
    // recess and its back wall sit at -Z.
    expect(archSrc).toContain('position={[0, 0.02, depth / 2 + 0.12]}');
    expect(archSrc).toContain('position={[0, height / 2, -depth / 4]}');
    expect(archSrc).toContain('position={[0, height / 2, -depth / 2 - 0.03]}');
    expect(archSrc).toContain('position={[0, height + lintelHeight + 0.05, 0.06]}');
  });

  test('the doorway was moved from the south face to the west face', () => {
    expect(doorwayXform!.localPosition).toEqual([-2.77, 0, 0]);
    expect(doorwayXform!.rotation[1]).toBeCloseTo(-Math.PI / 2, 10);
    // A group transform alone is not enough — the parsed rotation is what the
    // world-space assertions below are derived from.
    expect(doorPlacement!.worldPosition.x).toBeCloseTo(25.23, 10); // west side
    expect(doorPlacement!.worldPosition.y).toBeCloseTo(0, 10);
    expect(doorPlacement!.worldPosition.z).toBeCloseTo(-18, 10); // still mid-depth
  });

  test('the doorway faces west: outward normal ≈ (-1, 0, 0)', () => {
    const n = doorPlacement!.outwardNormal;
    expect(n.x).toBeCloseTo(-1, 10);
    expect(n.y).toBeCloseTo(0, 10);
    expect(n.z).toBeCloseTo(0, 10);
  });

  test('the door plane sits the documented 0.02 outside the 2.75 wall face', () => {
    const wallFaceX = ROOT[0] - 2.75; // 25.25
    expect(wallFaceX - doorPlacement!.worldPosition.x).toBeCloseTo(0.02, 10);
    expect(doorPlacement!.worldPosition.x).toBeLessThan(wallFaceX);
  });

  test('the whole assembly lands on the west wall, within the wall footprint', () => {
    const { min, max } = doorPlacement!.bounds!;
    // Outward lip protrudes west of the wall face; the recess sits inside it.
    expect(min.x).toBeCloseTo(24.81, 10);
    expect(max.x).toBeCloseTo(25.455, 10);
    expect(min.x).toBeLessThan(ROOT[0] - 2.75);
    expect(max.x).toBeLessThan(ROOT[0] + 2.75);
    // Opening + jambs stay inside the face's Z extent (wall is 5.0 deep).
    expect(min.z).toBeGreaterThan(ROOT[2] - 2.5);
    expect(max.z).toBeLessThan(ROOT[2] + 2.5);
    expect(min.z).toBeCloseTo(-18.92, 10);
    expect(max.z).toBeCloseTo(-17.08, 10);
    // Nothing is left on the old south face.
    expect(max.z).toBeLessThan(ROOT[2] + 2.0);
  });

  test('the window moved west→east and faces east: normal ≈ (+1, 0, 0)', () => {
    expect(windowXform!.localPosition).toEqual([2.76, 2.2, 0]);
    expect(windowXform!.rotation[1]).toBeCloseTo(Math.PI / 2, 10);
    const p = windowPlacement!.worldPosition;
    expect(p.x).toBeCloseTo(30.76, 10); // east wall face 30.75 + 0.01
    expect(p.y).toBeCloseTo(2.2, 10);
    expect(p.z).toBeCloseTo(-18, 10);
    const n = windowPlacement!.outwardNormal;
    expect(n.x).toBeCloseTo(1, 10);
    expect(n.y).toBeCloseTo(0, 10);
    expect(n.z).toBeCloseTo(0, 10);
    // …and no longer shares the west wall with the entrance.
    expect(p.x).toBeGreaterThan(ROOT[0]);
  });

  test('the doorway no longer overlaps the window band on the west wall', () => {
    // Old layout put the window at local X -2.76 — squarely on the new
    // entrance's Z band (-18.92 … -17.08), hence the relocation.
    const windowWestX = ROOT[0] - 2.76;
    const { min, max } = doorPlacement!.bounds!;
    expect(windowWestX).toBeGreaterThan(min.x);
    expect(windowWestX).toBeLessThan(max.x);
    expect(windowPlacement!.worldPosition.x).toBeGreaterThan(max.x);
  });

  test('the doorway clears the courtyard props at its new position', () => {
    // Weapon rack local [-2.2, 0, 1.8] and straw dummy local [-2.2, 0, -1.5]
    // (both children of the root, unchanged). The dummy's target disc spans
    // z ≈ -19.51 … -19.29, clear of the doorway's southernmost jamb face.
    const dummyTargetZ = ROOT[2] - 1.5 - 0.11;
    const rackZ = ROOT[2] + 1.8 - 0.6;
    expect(dummyTargetZ).toBeLessThan(doorPlacement!.bounds!.min.z);
    expect(rackZ).toBeGreaterThan(doorPlacement!.bounds!.max.z);
  });
});

// ── B. Opening and approach zone sit outside the building colliders ───────

describe('B. Usable opening and approach zone are collider-free', () => {
  test('the outward threshold lip lies outside every collider', () => {
    for (const x of [24.81, 24.9, 24.95, 24.99]) {
      for (const z of [-18, -18.7, -17.3]) {
        expect(
          containingFootprints(x, z),
          `lip point (${x}, ${z}) should be outside every collider footprint`,
        ).toEqual([]);
      }
    }
  });

  test('only the Doctore House itself contains the door plane', () => {
    expect(containingFootprints(doorPlacement!.worldPosition.x, -18)).toEqual([
      'doctore-house',
    ]);
  });

  test('the approach zone in front of the opening is walkable at player radius', () => {
    // Straight-on band plus the jambs' Z span, stopping 0.05 short of the
    // geometric collider bound so tangency is not mistaken for penetration.
    for (let x = 24.55; x >= 23.7; x -= 0.05) {
      for (let z = -18.8; z <= -17.2; z += 0.1) {
        expect(
          collidesWith(x, z, R, CITY_COLLIDERS),
          `approach point (${x.toFixed(2)}, ${z.toFixed(2)}) should be walkable`,
        ).toBe(false);
      }
    }
  });

  test('the Merchant House does not reach the new entrance', () => {
    const dx = Math.max(merchantHouse.cx - merchantHouse.hw - 25.23, 0, 25.23 - (merchantHouse.cx + merchantHouse.hw));
    const dz = Math.max(merchantHouse.cz - merchantHouse.hd - -18, 0, -18 - (merchantHouse.cz + merchantHouse.hd));
    expect(Math.hypot(dx, dz)).toBeGreaterThan(R); // ≥ 1.5 south of its south edge
    expect(distanceTo(merchantHouse, 24.0, -18)).toBeCloseTo(1.5, 10);
  });
});

// ── C. The real resolver reaches the west entrance from the arrival ───────

describe('C. Movement resolver: arrival → west entrance', () => {
  test('the arrival itself is collision-free', () => {
    const [ax, az] = DOCTORE_ARRIVAL;
    expect(collidesWith(ax, az, R, CITY_COLLIDERS)).toBe(false);
    expect(nearestColliderDistance(ax, az)).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
  });

  test('walking east stops at the west wall without trapping or penetrating', () => {
    expect(approachEnd[0]).toBeGreaterThan(24.5);
    expect(approachEnd[0]).toBeLessThan(24.61);
    expect(approachEnd[2]).toBeCloseTo(DOCTORE_ARRIVAL[1], 10);
    // Progress was made and no frame teleported.
    let prev: [number, number, number] = approachTraj[0];
    for (const p of approachTraj.slice(1)) {
      const d = Math.hypot(p[0] - prev[0], p[2] - prev[2]);
      expect(d).toBeLessThanOrEqual(STEP + 1e-9);
      prev = p;
    }
    expect(approachTraj[1][0]).toBeGreaterThan(DOCTORE_ARRIVAL[0]);
    // Never inside any collider at any frame, and the stop is clear.
    expect(everInside(approachTraj, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(approachEnd[0], approachEnd[2], R, CITY_COLLIDERS)).toBe(false);
    expect([...overlappingColliderIds(approachEnd[0], approachEnd[2], R, CITY_COLLIDERS)]).toEqual([]);
  });

  test('the standoff is a full player radius clear of the blocking wall', () => {
    // Measured, not assumed: the stop is one movement step west of the exact
    // geometric bound (collider face 25.0 − player radius 0.4 = 24.6).
    expect(STANDOFF_TO_COLLIDER).toBeGreaterThan(R - 1e-9);
    expect(STANDOFF_TO_COLLIDER).toBeLessThan(R + STEP);
    expect(STANDOFF_TO_COLLIDER).toBeCloseTo(0.4233, 3);
    expect(STANDOFF_TO_DOOR_PLANE).toBeCloseTo(0.6533, 3);
    expect(STANDOFF_TO_DOOR_PLANE).toBeGreaterThan(R);
  });

  test('lateral approaches also land on the west wall and stay clear', () => {
    for (const z of [-18.9, -18.5, -17.5]) {
      const traj = walk([DOCTORE_ARRIVAL[0], 0, z], 1, 0, 60);
      const end = traj[traj.length - 1];
      expect(end[0]).toBeCloseTo(approachEnd[0], 6);
      expect(end[2]).toBeCloseTo(z, 10);
      expect(everInside(traj, CITY_COLLIDERS)).toBe(false);
    }
  });

  test('the arrival is not a movement trap (all four directions leave it)', () => {
    const [ax, az] = DOCTORE_ARRIVAL;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const moved = resolveCityMovement([ax, 0, az], dx, dz, SPEED, DT);
      expect(
        Math.hypot(moved[0] - ax, moved[2] - az),
        `stuck pushing [${dx}, ${dz}]`,
      ).toBeGreaterThan(STEP * 0.9);
    }
  });

  test('approaching from the north-east around the corner still reaches the door', () => {
    // Arrive from the paved Via Mercatoria's south end, then turn west onto
    // the entrance: proves the approach is not a dead-end pocket.
    const south = walk([VIA_MERCATORIA_PATH.cx, 0, -13.6], 0, -1, 80);
    const west = walk(south[south.length - 1], -1, 0, 120);
    const end = west[west.length - 1];
    expect(end[0]).toBeLessThan(23.0);
    expect(everInside(south, CITY_COLLIDERS)).toBe(false);
    expect(everInside(west, CITY_COLLIDERS)).toBe(false);
  });
});

function nearestColliderDistance(x: number, z: number): number {
  let best = Infinity;
  for (const c of CITY_COLLIDERS) best = Math.min(best, distanceTo(c, x, z));
  return best;
}

// ── D. Final position ↔ interaction range and hub selection ───────────────

describe('D. The standoff reaches the Doctore House hub, not the Merchant House', () => {
  test('the standoff is inside the Doctore House interaction radius', () => {
    const dist = Math.hypot(
      approachEnd[0] - DOCTORE_HUB!.position[0],
      approachEnd[2] - DOCTORE_HUB!.position[2],
    );
    expect(dist).toBeLessThanOrEqual(DOCTORE_HUB!.radius);
    expect(dist).toBeGreaterThan(3.3);
    expect(dist).toBeLessThan(3.5);
  });

  test('the Doctore House is the ONLY hub covering the standoff', () => {
    const covering = HUB_LOCATIONS.filter(
      (l) =>
        Math.hypot(approachEnd[0] - l.position[0], approachEnd[2] - l.position[2]) <=
        l.radius,
    ).map((l) => l.id);
    expect(covering).toEqual(['doctore_house']);
    expect(getNearbyHubLocation([approachEnd[0], 0, approachEnd[2]])?.id).toBe(
      'doctore_house',
    );
  });

  test('the Merchant House hub is out of range and is not selected', () => {
    const dist = Math.hypot(
      approachEnd[0] - MERCHANT_HUB!.position[0],
      approachEnd[2] - MERCHANT_HUB!.position[2],
    );
    expect(dist).toBeGreaterThan(MERCHANT_HUB!.radius);
    expect(getNearbyHubLocation([approachEnd[0], 0, approachEnd[2]])?.id).not.toBe(
      'merchant_house',
    );
  });

  test('the legacy south approach still resolves to the Merchant House (the C-8.15 defect)', () => {
    // 0.5 in front of the old south doorway's face — and inside the Merchant
    // House collider, so unreachable in play. Documented here so the reason
    // for the move cannot silently regress.
    expect(getNearbyHubLocation([28, 0, -15])?.id).toBe('merchant_house');
    expect(collidesWith(28, -15, R, CITY_COLLIDERS)).toBe(true);
  });
});

// ── E. Collider / foundation invariants unchanged ────────────────────────

describe('E. Existing Doctore House and Merchant House invariants are unchanged', () => {
  test('rendered root is still [28, 0, -18] and the collider still matches it', () => {
    expect(ROOT).toEqual([28, 0, -18]);
    expect(doctore.cx).toBe(28);
    expect(doctore.cz).toBe(-18);
    expect(doctore.hw).toBe(3.0);
    expect(doctore.hd).toBe(2.75);
    expect(doctore.cx - doctore.hw).toBeCloseTo(25, 10);
    expect(doctore.cx + doctore.hw).toBeCloseTo(31, 10);
    expect(doctore.cz - doctore.hd).toBeCloseTo(-20.75, 10);
    expect(doctore.cz + doctore.hd).toBeCloseTo(-15.25, 10);
  });

  test('collider half-extents still derive from the rendered foundation', () => {
    const [fw, fd] = foundationMatch!.slice(1, 3).map(Number);
    const proj = Number(foundationMatch![3]);
    expect([fw, fd, proj]).toEqual([5.5, 5.0, 0.25]);
    expect(doctore.hw * 2).toBeCloseTo(fw + 2 * proj, 10); // 6.0
    expect(doctore.hd * 2).toBeCloseTo(fd + 2 * proj, 10); // 5.5
  });

  test('the Merchant House is untouched', () => {
    expect(merchantHouse.cx).toBe(26);
    expect(merchantHouse.cz).toBe(-13);
    expect(merchantHouse.hw).toBe(3.85);
    expect(merchantHouse.hd).toBe(3.5);
    expect(MERCHANT_ARRIVAL).toEqual([21, -13]);
  });

  test('the documented interpenetration is preserved, not narrowed away', () => {
    const o = overlap(merchantHouse, doctore);
    expect(o.overlapX).toBeCloseTo(4.85, 10);
    expect(o.overlapZ).toBeCloseTo(1.25, 10);
    expect(o.overlapX).toBeGreaterThan(0);
    expect(o.overlapZ).toBeGreaterThan(0);
  });

  test('still only the Merchant House overlaps the Doctore House footprint', () => {
    const overlapping = CITY_COLLIDERS.filter(
      (c): c is RectCollider => c.type === 'rect' && c.id !== 'doctore-house',
    )
      .filter((c) => {
        const o = overlap(doctore, c);
        return o.overlapX > 0 && o.overlapZ > 0;
      })
      .map((c) => c.id);
    expect(overlapping).toEqual(['merchant-house']);
  });

  test('hub position, radius and fast-travel arrival are unchanged', () => {
    expect(DOCTORE_HUB?.position).toEqual([28, 0, -18]);
    expect(DOCTORE_HUB?.radius).toBe(4.5);
    expect(DOCTORE_ARRIVAL).toEqual([23.5, -18]);
    expect(doctore.cx - doctore.hw - DOCTORE_ARRIVAL[0]).toBeCloseTo(1.5, 10);
    expect(nearestColliderDistance(DOCTORE_ARRIVAL[0], DOCTORE_ARRIVAL[1])).toBeCloseTo(1.5, 10);
  });

  test('the nearest other rect footprint is still 2.6 clear', () => {
    const gaps = CITY_COLLIDERS.filter(
      (c): c is RectCollider =>
        c.type === 'rect' && c.id !== 'doctore-house' && c.id !== 'merchant-house',
    ).map((c) => ({ id: c.id, gap: rectGap(doctore, c) }));
    const nearest = gaps.reduce((m, g) => (g.gap < m.gap ? g : m));
    expect(nearest.id).toBe('gladiator-academy');
    expect(nearest.gap).toBeCloseTo(2.6, 10);
  });

  test('the Via Mercatoria paving footprint is unchanged', () => {
    expect(VIA_MERCATORIA_PATH).toEqual({
      id: 'via-mercatoria-path',
      cx: 20.5,
      cz: -11.1,
      w: 3,
      d: 5.8,
    });
  });

  test('no doorway or window collider was introduced', () => {
    // The entrance must not add collision of its own: swept across the whole
    // assembly, the only collider containing any of it is the building's own
    // foundation rect (the outward lip is outside every footprint, by B).
    const { min, max } = doorPlacement!.bounds!;
    const covering = new Set<string>();
    for (let x = min.x; x <= max.x; x += 0.05) {
      for (let z = min.z; z <= max.z; z += 0.1) {
        for (const id of containingFootprints(x, z)) covering.add(id);
      }
    }
    expect([...covering]).toEqual(['doctore-house']);
  });
});

// ── F. Previously tested passages remain intact ──────────────────────────

describe('F. Via Mercatoria and prior-phase passages still work', () => {
  const alleyWest = VIA_MERCATORIA_PATH.cx - VIA_MERCATORIA_PATH.w / 2; // 19
  const alleyEast = VIA_MERCATORIA_PATH.cx + VIA_MERCATORIA_PATH.w / 2; // 22
  const alleySouth = VIA_MERCATORIA_PATH.cz - VIA_MERCATORIA_PATH.d / 2; // -14
  const alleyNorth = VIA_MERCATORIA_PATH.cz + VIA_MERCATORIA_PATH.d / 2; // -8.2
  const LANE_X = (alleyWest + alleyEast) / 2; // 20.5

  function staysInPavedCorridor(traj: Array<[number, number, number]>): boolean {
    return traj.every(
      (p) =>
        p[0] >= alleyWest &&
        p[0] <= alleyEast &&
        p[2] >= alleySouth &&
        p[2] <= alleyNorth,
    );
  }

  test('southbound: descends the corridor on the paving, penetrating nothing', () => {
    const traj = walk([LANE_X, 0, -8.6], 0, -1, 80);
    const end = traj[traj.length - 1];
    expect(end[2]).toBeLessThan(-13.4);
    expect(end[2]).toBeGreaterThan(alleySouth);
    expect(end[0]).toBeCloseTo(LANE_X, 10);
    expect(staysInPavedCorridor(traj)).toBe(true);
    expect(everInside(traj, [generalStore, merchantHouse, doctore])).toBe(false);
  });

  test('northbound: climbs the corridor to the General Store south face', () => {
    const traj = walk([LANE_X, 0, -13.6], 0, 1, 80);
    const end = traj[traj.length - 1];
    expect(end[2]).toBeGreaterThan(-8.7);
    expect(end[2]).toBeLessThan(-8.4);
    expect(staysInPavedCorridor(traj)).toBe(true);
    expect(everInside(traj, [generalStore, merchantHouse, doctore])).toBe(false);
  });

  test('C-8.10: the Forge–Workshop passage is still walkable', () => {
    const gapCenter = (forge.cx + forge.hw + R + (workshop.cx - workshop.hw - R)) / 2;
    const traj = walk([gapCenter, 0, -1.0], 0, 1, 500);
    expect(traj[traj.length - 1][2]).toBeGreaterThan(forge.cz + forge.hd);
    expect(everInside(traj, [forge, workshop])).toBe(false);
  });

  test('C-8.12: the General Store → Merchant House route still completes', () => {
    const south = walk([GS_ARRIVAL[0], 0, GS_ARRIVAL[1]], 0, -1, 140);
    const east = walk(south[south.length - 1], 1, 0, 200);
    const end = east[east.length - 1];
    expect(end[0]).toBeGreaterThan(21.6);
    expect(collidesWith(end[0], end[2], R, [merchantHouse])).toBe(false);
    expect(everInside(south, [generalStore, merchantHouse, doctore])).toBe(false);
    expect(everInside(east, [generalStore, merchantHouse, doctore])).toBe(false);
  });

  test('C-8.12: the Merchant House → General Store route still completes', () => {
    const west = walk([21.7, 0, -13], -1, 0, 90);
    const north = walk(west[west.length - 1], 0, 1, 140);
    expect(west[west.length - 1][0]).toBeLessThan(17.5);
    expect(north[north.length - 1][2]).toBeGreaterThan(-5.5);
    expect(everInside(west, [generalStore, merchantHouse, doctore])).toBe(false);
    expect(everInside(north, [generalStore, merchantHouse, doctore])).toBe(false);
  });
});

// ── G. Threshold-step overlap: harmless lip, not movement blockage ───────

describe('G. Threshold step at the final approach position', () => {
  test('the resolver stop is set by the collider alone, not by the doorway mesh', () => {
    // Analytic bound from the registry: collider west face 25.0 − player
    // radius 0.4 = 24.6. The measured stop is one movement step west of it,
    // which is exactly what a collider-only stop looks like — the threshold
    // mesh contributes no collision and cannot block movement.
    const analyticBound = doctore.cx - doctore.hw - R;
    expect(approachEnd[0]).toBeLessThanOrEqual(analyticBound + 1e-9);
    expect(approachEnd[0]).toBeGreaterThan(analyticBound - STEP);
    expect(STANDOFF_TO_COLLIDER).toBeGreaterThanOrEqual(R);
  });

  test('the radius does graze the low threshold lip — a step, not a wall', () => {
    // The 0.04-high contact step reaches x = 24.81, i.e. 0.19 west of the
    // collider face, so the player's collision circle stops over its outer
    // edge. Since the lip is under the player's feet and is absent from the
    // collision registry, this is the same harmless ground-level overlap the
    // original south doorway had (its step also protruded 0.19).
    const lipOuterX = doorPlacement!.bounds!.min.x;
    const colliderFaceX = doctore.cx - doctore.hw;
    expect(colliderFaceX - lipOuterX).toBeCloseTo(0.19, 10);
    const overlapDepth = approachEnd[0] + R - lipOuterX;
    expect(overlapDepth).toBeGreaterThan(0);
    expect(overlapDepth).toBeLessThan(0.2);
    expect(THRESHOLD_LIP_TOP).toBeLessThanOrEqual(0.06);
    // No collider covers the lip: nothing there can block the player.
    expect(containingFootprints(lipOuterX, -18)).toEqual([]);
    expect(containingFootprints(25.0 - 0.001, -18)).toEqual([]);
  });
});
