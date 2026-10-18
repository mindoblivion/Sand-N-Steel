/**
 * Phase C-8.12 — Merchant House Route Clearance tests.
 *
 * Verifies the Via Mercatoria route fix: the Merchant House moved south by 1.0
 * unit (root Z: -12 → -13) and the Via Mercatoria alley was re-laid entirely
 * west of the Merchant House foundation, opening the General Store ↔ Merchant
 * House route on foot.
 *
 * Tests exercise the real collision registry (CITY_COLLIDERS), the real movement
 * resolver (resolveCityMovement), the hub-location table and the street footprint
 * module — no mocks, no arithmetic-only assertions for the traversal cases.
 *
 * Run with: bun test src/utils/phaseC8_12.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type RectCollider,
} from './collisionShapes';
import {
  resolveCityMovement,
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  getNearbyHubLocation,
} from './cityCollisions';
import { VIA_MERCATORIA_PATH } from './streetGeometry';

// ── Helpers ────────────────────────────────────────────────────────────────

const R = PLAYER_RADIUS;

/** Find a rect collider by ID from the live CITY_COLLIDERS registry. */
function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

const merchantHouse = findRect('merchant-house');
const generalStore = findRect('general-store');
const forge = findRect('smithing-forge');
const workshop = findRect('armor-workshop');

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

/** True if any position in the trajectory overlaps `rect`. */
function everInside(
  traj: Array<[number, number, number]>,
  rect: RectCollider,
): boolean {
  return traj.some((p) => collidesWith(p[0], p[2], R, [rect]));
}

// The route's north anchor is the General Store's own fast-travel arrival, on
// the store's west (market) side; the south anchor is the Merchant House door.
const GS_ARRIVAL = FAST_TRAVEL_ARRIVALS.general_store; // [17, -5]

// ── A. Merchant House collider moved, dimensions preserved ────────────────

describe('A. Merchant House collider', () => {
  test('center moved to (26, -13)', () => {
    expect(merchantHouse.cx).toBe(26);
    expect(merchantHouse.cz).toBe(-13);
  });

  test('half-width unchanged at 3.85 (width 7.7)', () => {
    expect(merchantHouse.hw).toBe(3.85);
  });

  test('half-depth unchanged at 3.5 (depth 7.0)', () => {
    expect(merchantHouse.hd).toBe(3.5);
  });

  test('edges: X[22.15, 29.85] Z[-16.5, -9.5]', () => {
    expect(merchantHouse.cx - merchantHouse.hw).toBeCloseTo(22.15, 10);
    expect(merchantHouse.cx + merchantHouse.hw).toBeCloseTo(29.85, 10);
    expect(merchantHouse.cz - merchantHouse.hd).toBeCloseTo(-16.5, 10);
    expect(merchantHouse.cz + merchantHouse.hd).toBeCloseTo(-9.5, 10);
  });
});

// ── B. General Store collider untouched ───────────────────────────────────

describe('B. General Store collider is unchanged', () => {
  test('center (22, -5), size 7.7 × 6.3', () => {
    expect(generalStore.cx).toBe(22);
    expect(generalStore.cz).toBe(-5);
    expect(generalStore.hw).toBe(3.85);
    expect(generalStore.hd).toBe(3.15);
  });

  test('south edge remains at Z = -8.15', () => {
    expect(generalStore.cz - generalStore.hd).toBeCloseTo(-8.15, 10);
  });

  test('General Store hub position and arrival are unchanged', () => {
    const gs = HUB_LOCATIONS.find((l) => l.id === 'general_store');
    expect(gs?.position).toEqual([22, 0, -5]);
    expect(FAST_TRAVEL_ARRIVALS.general_store).toEqual([17, -5]);
  });
});

// ── C. Corridor geometry ──────────────────────────────────────────────────

describe('C. Corridor between the two buildings', () => {
  const gap = (generalStore.cz - generalStore.hd) - (merchantHouse.cz + merchantHouse.hd);

  test('building edge gap is 1.35 units', () => {
    expect(gap).toBeCloseTo(1.35, 10);
  });

  test('player-center corridor is 0.55 units wide', () => {
    expect(gap - 2 * R).toBeCloseTo(0.55, 10);
  });

  test('corridor is wider than one movement step (no stuck-at-wall)', () => {
    expect(gap - 2 * R).toBeGreaterThan(STEP);
  });

  test('a mid-corridor point is collision-free', () => {
    expect(collidesWith(22, -8.8, R, [generalStore, merchantHouse])).toBe(false);
    expect(collidesWith(22, -8.8, R, CITY_COLLIDERS)).toBe(false);
  });
});

// ── D. Forward traversal: General Store → Merchant House entrance ─────────

describe('D. Traversal north → south (General Store → Merchant House)', () => {
  // Leg 1: south along the store's west side to the entrance latitude.
  const southTraj = walk([GS_ARRIVAL[0], 0, GS_ARRIVAL[1]], 0, -1, 140);
  const southEnd = southTraj[southTraj.length - 1];
  // Leg 2: east across the entrance front towards the Merchant House door.
  const eastTraj = walk(southEnd, 1, 0, 200);
  const eastEnd = eastTraj[eastTraj.length - 1];

  test('reaches the Merchant House entrance latitude', () => {
    expect(southEnd[2]).toBeLessThan(-13.5);
    expect(southEnd[2]).toBeGreaterThan(-14.5);
  });

  test('approaches the Merchant House door from the west', () => {
    expect(eastEnd[0]).toBeGreaterThan(21.6);
    expect(collidesWith(eastEnd[0], eastEnd[2], R, [merchantHouse])).toBe(false);
  });

  test('never penetrates the General Store', () => {
    expect(everInside(southTraj, generalStore)).toBe(false);
    expect(everInside(eastTraj, generalStore)).toBe(false);
  });

  test('never penetrates the Merchant House', () => {
    expect(everInside(southTraj, merchantHouse)).toBe(false);
    expect(everInside(eastTraj, merchantHouse)).toBe(false);
  });
});

// ── E. Reverse traversal: Merchant House entrance → General Store ─────────

describe('E. Traversal south → north (Merchant House → General Store)', () => {
  // 21.7 — deliberately not the exact MH-edge-minus-radius value (21.75), which
  // lands on the colliding side of the 22.15 binary representation.
  const start: [number, number, number] = [21.7, 0, -13];
  // Leg 1: west, away from the Merchant House.
  const westTraj = walk(start, -1, 0, 90);
  const westEnd = westTraj[westTraj.length - 1];
  // Leg 2: north back up the General Store's west side.
  const northTraj = walk(westEnd, 0, 1, 140);
  const northEnd = northTraj[northTraj.length - 1];

  test('clears the Merchant House to the west', () => {
    expect(westEnd[0]).toBeLessThan(17.5);
  });

  test('walks back up to the General Store latitude', () => {
    expect(northEnd[2]).toBeGreaterThan(-5.5);
  });

  test('never penetrates the Merchant House', () => {
    expect(everInside(westTraj, merchantHouse)).toBe(false);
    expect(everInside(northTraj, merchantHouse)).toBe(false);
  });

  test('never penetrates the General Store', () => {
    expect(everInside(westTraj, generalStore)).toBe(false);
    expect(everInside(northTraj, generalStore)).toBe(false);
  });
});

// ── F. No unintended collision bypass ─────────────────────────────────────

describe('F. No collision bypass around either building', () => {
  test('General Store south face blocks a direct southbound push at X = 22', () => {
    const traj = walk([22, 0, -0.5], 0, -1, 150);
    const end = traj[traj.length - 1];
    // North face collision begins at Z = -1.45 (edge -1.85 + radius 0.4).
    expect(end[2]).toBeLessThan(-1.44);
    expect(end[2]).toBeGreaterThan(-1.47);
    expect(everInside(traj, generalStore)).toBe(false);
  });

  test('Merchant House north face caps the corridor pocket at X = 23', () => {
    const traj = walk([23, 0, -8.8], 0, -1, 150);
    const end = traj[traj.length - 1];
    // MH north face collision begins at Z = -9.1 (edge -9.5 + radius 0.4).
    expect(end[2]).toBeGreaterThan(-9.1);
    expect(end[2]).toBeLessThan(-9.0);
    expect(everInside(traj, merchantHouse)).toBe(false);
  });

  test('Merchant House west face blocks an eastbound push at Z = -13', () => {
    const traj = walk([18, 0, -13], 1, 0, 200);
    const end = traj[traj.length - 1];
    // West face collision begins at X = 21.75 (edge 22.15 - radius 0.4).
    expect(end[0]).toBeLessThanOrEqual(21.75);
    expect(everInside(traj, merchantHouse)).toBe(false);
  });
});

// ── G. Fast-travel arrival ────────────────────────────────────────────────

describe('G. merchant_house fast-travel arrival', () => {
  test('moved to [21, -13]', () => {
    expect(FAST_TRAVEL_ARRIVALS.merchant_house).toEqual([21, -13]);
  });

  test('is collision-free against every collider', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.merchant_house;
    expect(collidesWith(ax, az, R, CITY_COLLIDERS)).toBe(false);
  });

  test('is inside the world boundary', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.merchant_house;
    expect(Math.abs(ax)).toBeLessThanOrEqual(35);
    expect(az).toBeGreaterThanOrEqual(-91);
    expect(az).toBeLessThanOrEqual(35);
  });
});

// ── H. Interaction-zone reachability ──────────────────────────────────────

describe('H. Merchant House interaction zone', () => {
  const mhHub = HUB_LOCATIONS.find((l) => l.id === 'merchant_house');

  test('hub location moved to [26, 0, -13] with radius 4.5', () => {
    expect(mhHub?.position).toEqual([26, 0, -13]);
    expect(mhHub?.radius).toBe(4.5);
  });

  test('is reachable on foot from the fast-travel arrival', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.merchant_house;
    const traj = walk([ax, 0, az], 1, 0, 200);
    const end = traj[traj.length - 1];
    const dist = Math.hypot(
      end[0] - mhHub!.position[0],
      end[2] - mhHub!.position[2],
    );
    expect(dist).toBeLessThanOrEqual(mhHub!.radius);
    expect(getNearbyHubLocation([end[0], 0, end[2]])?.id).toBe('merchant_house');
    expect(everInside(traj, merchantHouse)).toBe(false);
  });
});

// ── I. Via Mercatoria alley footprint ─────────────────────────────────────

describe('I. Via Mercatoria alley footprint', () => {
  const west = VIA_MERCATORIA_PATH.cx - VIA_MERCATORIA_PATH.w / 2;
  const east = VIA_MERCATORIA_PATH.cx + VIA_MERCATORIA_PATH.w / 2;
  const south = VIA_MERCATORIA_PATH.cz - VIA_MERCATORIA_PATH.d / 2;
  const north = VIA_MERCATORIA_PATH.cz + VIA_MERCATORIA_PATH.d / 2;

  test('intended bounds X[19, 22] Z[-14, -8.2]', () => {
    expect(west).toBeCloseTo(19, 10);
    expect(east).toBeCloseTo(22, 10);
    expect(south).toBeCloseTo(-14, 10);
    expect(north).toBeCloseTo(-8.2, 10);
  });

  test('east edge stays west of the Merchant House foundation edge', () => {
    expect(east).toBeLessThanOrEqual(merchantHouse.cx - merchantHouse.hw); // 22.15
  });

  test('north edge sits just south of the General Store foundation edge', () => {
    const gsSouth = generalStore.cz - generalStore.hd; // -8.15
    expect(north).toBeLessThan(gsSouth); // strictly clear — no exact-edge contact
    expect(gsSouth - north).toBeCloseTo(0.05, 10); // ...but visually adjoins it
  });

  test('footprint overlaps no building collider (terminates at the approach)', () => {
    const overlapping = CITY_COLLIDERS.filter(
      (c): c is RectCollider => c.type === 'rect',
    )
      .filter((c) => {
        const overlapX = Math.min(east, c.cx + c.hw) - Math.max(west, c.cx - c.hw);
        const overlapZ = Math.min(north, c.cz + c.hd) - Math.max(south, c.cz - c.hd);
        return overlapX > 0 && overlapZ > 0;
      })
      .map((c) => c.id);
    expect(overlapping).toEqual([]);
  });

  test('covers the merchant_house fast-travel arrival', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.merchant_house;
    expect(ax).toBeGreaterThanOrEqual(west);
    expect(ax).toBeLessThanOrEqual(east);
    expect(az).toBeGreaterThanOrEqual(south);
    expect(az).toBeLessThanOrEqual(north);
  });
});

// ── J. Phase C-8.10 regression: Forge–Workshop passage still navigable ────

describe('J. Phase C-8.10 Forge–Workshop passage regression', () => {
  test('SmithingForge collider is still narrowed to width 9.5', () => {
    expect(forge.cx).toBe(18);
    // Phase C-8.19 moved the forge Z centre 2 → 2.6; width/depth unchanged.
    expect(forge.cz).toBe(2.6);
    expect(forge.hw).toBe(4.75);
    expect(forge.hd).toBe(4.0);
  });

  test('Armor & Leather Workshop collider is unchanged', () => {
    expect(workshop.cx).toBe(28.2);
    expect(workshop.cz).toBe(1.15);
    expect(workshop.hw).toBe(4.45);
    expect(workshop.hd).toBe(2.85);
  });

  test('player still walks north through the Forge–Workshop gap', () => {
    const gapCenter =
      (forge.cx + forge.hw + R + (workshop.cx - workshop.hw - R)) / 2; // ≈ 23.25
    const traj = walk([gapCenter, 0, -1.0], 0, 1, 500);
    const end = traj[traj.length - 1];
    expect(end[2]).toBeGreaterThan(forge.cz + forge.hd); // north of the Forge
    expect(everInside(traj, forge)).toBe(false);
    expect(everInside(traj, workshop)).toBe(false);
  });
});

// ── K. Side effects of the Merchant House shift ──────────────────────────

describe('K. Merchant House shift side effects', () => {
  const overlaps = (a: RectCollider, b: RectCollider) => ({
    overlapX: Math.min(a.cx + a.hw, b.cx + b.hw) - Math.max(a.cx - a.hw, b.cx - b.hw),
    overlapZ: Math.min(a.cz + a.hd, b.cz + b.hd) - Math.max(a.cz - a.hd, b.cz - b.hd),
  });

  test('no walkable gap opens between the Merchant House and Doctore House', () => {
    const doctore = findRect('doctore-house');
    const { overlapX, overlapZ } = overlaps(merchantHouse, doctore);
    // The two footprints used to overlap on Z (1.25 before C-8.12, 2.25 during
    // C-8.12, restored to 1.25 by C-8.13), which made a passage impossible.
    // Phase C-8.19 removed the interpenetration by cutting the Doctore House
    // depth (root Z = -18.875, south face Z = -17.0), leaving a 0.50-unit
    // plinth gap. 0.50 is still narrower than the 0.80 player diameter, so the
    // invariant this test guards — no walkable route between the two buildings
    // — holds in the new layout too.
    expect(overlapX).toBeCloseTo(4.85, 10);
    expect(overlapZ).toBeCloseTo(-0.5, 10);
    const gap = -overlapZ;
    expect(gap).toBeCloseTo(0.5, 10);
    expect(gap).toBeLessThan(2 * R);
  });

  test('the shifted Merchant House newly overlaps no other building footprint', () => {
    const newlyOverlapping = ['general-store', 'smithing-forge', 'armor-workshop']
      .map(findRect)
      .filter((c) => {
        const { overlapX, overlapZ } = overlaps(merchantHouse, c);
        return overlapX > 0 && overlapZ > 0;
      })
      .map((c) => c.id);
    expect(newlyOverlapping).toEqual([]);
  });
});
