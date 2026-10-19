/**
 * Phase C-8.13 — Doctore House clearance restored after the C-8.12 Merchant
 * House relocation.  (Geometry values re-based on Phase C-8.19.)
 *
 * Phase C-8.12 moved the Merchant House south (Z: -12 → -13) to open the Via
 * Mercatoria route. That shift had two unintended side effects on the Doctore
 * House (which stayed at Z = -17):
 *   • the two building footprints' Z overlap doubled from 1.25 to 2.25, and
 *   • the Doctore House fast-travel arrival [23.5, -17] was left only 0.5 from
 *     the Merchant House south edge (z = -16.5), below the documented
 *     0.9-unit arrival-clearance invariant (player radius 0.4 + 0.5 safety).
 *
 * Phase C-8.13 moved the Doctore House south by 1.0 (root / collider / hub Z:
 * -17 → -18) and its arrival to [23.5, -18], leaving the C-8.12 Merchant House
 * position, the Via Mercatoria alley and the C-8.10 Forge–Workshop fix in place.
 *
 * Phase C-8.19 then removed the 1.25-unit footprint interpenetration itself:
 * the house depth was cut 5.0 → 3.25 (plinth 5.5 → 3.75) with the north
 * foundation face pinned at Z = -20.75, moving the root to Z = -18.875 and its
 * arrival to [23.5, -18.875].  Section B therefore now proves the *absence* of
 * the old overlap: a 0.50-unit plinth gap, narrower than the 0.80 player
 * diameter, so the two buildings still cannot be walked between.
 *
 * Every case below runs against the real registry (CITY_COLLIDERS), the real
 * movement resolver (resolveCityMovement), the real hub table and the real
 * street footprint module — no mocks, no arithmetic-only stand-ins.
 *
 * Run with: bun test src/utils/phaseC8_13.test.ts
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
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  getNearbyHubLocation,
  // Phase C-8.70B — the walkable envelope's own clamps: the district's race
  // entry added the first arrival east of the city square.
  clampBoundaryX,
  clampBoundaryZ,
} from './cityCollisions';
import { VIA_MERCATORIA_PATH } from './streetGeometry';

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

/** Shortest distance between two rect footprints (0 when they overlap). */
function rectGap(a: RectCollider, b: RectCollider): number {
  const { overlapX, overlapZ } = overlap(a, b);
  return Math.hypot(
    Math.max(0, -overlapX),
    Math.max(0, -overlapZ),
  );
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

/** Nearest collider to a point, with its surface distance. */
function nearestCollider(x: number, z: number) {
  let best: { distance: number; id: string } = { distance: Infinity, id: '' };
  for (const c of CITY_COLLIDERS) {
    const d = distanceTo(c, x, z);
    // Strict `<` keeps the first registry entry on exact ties, so the result is
    // deterministic and identical on every run.
    if (d < best.distance) best = { distance: d, id: c.id };
  }
  return best;
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

const DOCTORE_HUB = HUB_LOCATIONS.find((l) => l.id === 'doctore_house');
const DOCTORE_ARRIVAL = FAST_TRAVEL_ARRIVALS.doctore_house;
const MERCHANT_ARRIVAL = FAST_TRAVEL_ARRIVALS.merchant_house;
const GS_ARRIVAL = FAST_TRAVEL_ARRIVALS.general_store;

// ── A. Doctore House transform ↔ collision registry alignment ─────────────

describe('A. Doctore House transform matches the collision registry', () => {
  // The rendered root transform lives in the component source; the collider is
  // hand-derived from it. Reading the source here is what catches the real
  // failure mode of this phase: one of the two moving without the other.
  const src = readFileSync(
    new URL('../components/3d/city/DoctoreHouse.tsx', import.meta.url),
    'utf8',
  );

  const rootMatch =
    /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/.exec(
      src,
    );
  const foundationMatch =
    /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}[\s\S]*?projection=\{([\d.]+)\}/.exec(
      src,
    );

  test('component source exposes a root <group> transform and a foundation', () => {
    expect(rootMatch).not.toBeNull();
    expect(foundationMatch).not.toBeNull();
  });

  test('rendered root position is [28, 0, -18.875]', () => {
    const [x, y, z] = rootMatch!.slice(1, 4).map(Number);
    expect(x).toBe(28);
    expect(y).toBe(0);
    expect(z).toBe(-18.875);
  });

  test('collider centre equals the rendered root position', () => {
    const [x, , z] = rootMatch!.slice(1, 4).map(Number);
    expect(doctore.cx).toBe(x);
    expect(doctore.cz).toBe(z);
  });

  test('collider half-extents equal the rendered foundation footprint', () => {
    const [fw, fd] = foundationMatch!.slice(1, 3).map(Number);
    const proj = Number(foundationMatch![3]);
    // BuildingFoundation lower step = size + 2 × projection.
    expect([fw, fd]).toEqual([5.5, 3.25]);
    expect(doctore.hw * 2).toBeCloseTo(fw + 2 * proj, 10); // 5.5 + 0.5 = 6.0
    expect(doctore.hd * 2).toBeCloseTo(fd + 2 * proj, 10); // 3.25 + 0.5 = 3.75
  });

  test('footprint edges are X[25, 31] Z[-20.75, -17.00] (C-8.19 depth)', () => {
    expect(doctore.cx - doctore.hw).toBeCloseTo(25, 10);
    expect(doctore.cx + doctore.hw).toBeCloseTo(31, 10);
    expect(doctore.cz - doctore.hd).toBeCloseTo(-20.75, 10);
    expect(doctore.cz + doctore.hd).toBeCloseTo(-17.0, 10);
  });

  test('hub interaction position tracks the same root Z', () => {
    expect(DOCTORE_HUB?.position).toEqual([28, 0, -18.875]);
    expect(DOCTORE_HUB?.radius).toBe(4.5);
    expect(DOCTORE_HUB!.position[0]).toBeCloseTo(doctore.cx, 10);
    expect(DOCTORE_HUB!.position[2]).toBeCloseTo(doctore.cz, 10);
  });

  test('fast-travel arrival moved with the house and keeps its west offset', () => {
    expect(DOCTORE_ARRIVAL).toEqual([23.5, -18.875]);
    expect(doctore.cx - doctore.hw - DOCTORE_ARRIVAL[0]).toBeCloseTo(1.5, 10);
    expect(DOCTORE_ARRIVAL[1]).toBe(doctore.cz);
  });
});

// ── B. Merchant House ↔ Doctore House interpenetration removed (C-8.19) ──

describe('B. Merchant House / Doctore House no longer interpenetrate', () => {
  const { overlapX, overlapZ } = overlap(merchantHouse, doctore);

  test('the Z overlap is gone (was 1.25 before Phase C-8.19)', () => {
    // The two houses still share the same X band (overlapX 4.85); the depth cut
    // pulls the Doctore House plinth 0.50 clear on Z, so the signed overlap is
    // -0.50, i.e. a gap rather than a penetration.
    expect(overlapX).toBeCloseTo(4.85, 10);
    expect(overlapZ).toBeCloseTo(-0.5, 10);
    expect(overlapZ).toBeLessThan(0);
  });

  test('the plinth-to-plinth gap is 0.50 units', () => {
    const gap = (merchantHouse.cz - merchantHouse.hd) - (doctore.cz + doctore.hd);
    expect(gap).toBeCloseTo(0.5, 10);
  });

  test('the 0.50 gap is narrower than the player diameter, so no passage opens', () => {
    const gap = (merchantHouse.cz - merchantHouse.hd) - (doctore.cz + doctore.hd);
    expect(gap).toBeLessThan(2 * R);
    expect(2 * R - gap).toBeCloseTo(0.3, 10);
    // Every point on the gap's centre line is blocked at player radius.
    for (let z = -17.0; z <= -16.5 + 1e-9; z += 0.05) {
      expect(
        collidesWith(27, z, R, CITY_COLLIDERS),
        `gap point (27, ${z.toFixed(2)}) should be blocked`,
      ).toBe(true);
    }
  });

  test('the real resolver still cannot walk between the two buildings', () => {
    // The strip between the plinths is only clear of both buildings east of
    // X = 31.4, so push west into it from there: the Doctore House's east face
    // stops the player and nothing is ever penetrated.
    const traj = walk([32, 0, -16.75], -1, 0, 60);
    const end = traj[traj.length - 1];
    expect(end[0]).toBeGreaterThan(31.0);
    expect(end[0]).toBeLessThan(31.5);
    expect(end[2]).toBeCloseTo(-16.75, 10);
    expect(everInside(traj, [merchantHouse, doctore])).toBe(false);
    expect(collidesWith(end[0], end[2], R, CITY_COLLIDERS)).toBe(false);
  });
});

// ── C. The move introduces no overlap with any other collider ─────────────

describe('C. No new overlap with other colliders', () => {
  test('no building footprint overlaps the Doctore House any more', () => {
    const overlapping = CITY_COLLIDERS.filter(
      (c): c is RectCollider => c.type === 'rect' && c.id !== 'doctore-house',
    )
      .filter((c) => {
        const o = overlap(doctore, c);
        return o.overlapX > 0 && o.overlapZ > 0;
      })
      .map((c) => c.id);
    expect(overlapping).toEqual([]);
  });

  test('nearest neighbour: Merchant House 0.50 gap, Gladiator Academy still 2.60', () => {
    const gaps = CITY_COLLIDERS.filter(
      (c): c is RectCollider => c.type === 'rect' && c.id !== 'doctore-house',
    ).map((c) => ({ id: c.id, gap: rectGap(doctore, c) }));
    const nearest = gaps.reduce((m, g) => (g.gap < m.gap ? g : m));
    expect(nearest.id).toBe('merchant-house');
    expect(nearest.gap).toBeCloseTo(0.5, 10);
    const academy = gaps.find((g) => g.id === 'gladiator-academy');
    expect(academy!.gap).toBeCloseTo(2.6, 10);
    expect(academy!.gap).toBeGreaterThan(ARRIVAL_CLEARANCE);
  });

  test('no curved wall or segment collider reaches the moved house', () => {
    // Cheapest sufficient test: the house centre must stay further from every
    // segment collider than the footprint's own half-diagonal.
    const halfDiagonal = Math.hypot(doctore.hw, doctore.hd);
    for (const c of CITY_COLLIDERS) {
      if (c.type === 'rect') continue;
      const d = distanceTo(c, doctore.cx, doctore.cz);
      expect(d).toBeGreaterThan(halfDiagonal + ARRIVAL_CLEARANCE);
    }
  });

  test('the house stays inside the world movement boundary', () => {
    const BOUNDARY_X = 35;
    const BOUNDARY_Z_MIN = -91;
    expect(doctore.cx - doctore.hw).toBeGreaterThanOrEqual(-BOUNDARY_X);
    expect(doctore.cx + doctore.hw).toBeLessThanOrEqual(BOUNDARY_X);
    expect(doctore.cz - doctore.hd).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
    expect(doctore.cz + doctore.hd).toBeLessThanOrEqual(35);
  });
});

// ── D. Fast-travel arrival clearance invariant, registry-wide ─────────────

describe('D. Arrival clearance invariant (every fast-travel arrival)', () => {
  test('every hub location has exactly one arrival', () => {
    for (const loc of HUB_LOCATIONS) {
      expect(FAST_TRAVEL_ARRIVALS[loc.id]).toBeDefined();
    }
    expect(Object.keys(FAST_TRAVEL_ARRIVALS).length).toBe(HUB_LOCATIONS.length);
  });

  test('every arrival clears all colliders by at least 0.9 units', () => {
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      const { distance, id } = nearestCollider(ax, az);
      expect(
        distance,
        `${loc.id} arrival [${ax}, ${az}] is only ${distance.toFixed(3)} from ${id} (needs ≥ ${ARRIVAL_CLEARANCE})`,
      ).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
      expect(collidesWith(ax, az, ARRIVAL_CLEARANCE, CITY_COLLIDERS)).toBe(false);
    }
  });

  test('every arrival is collision-free at player radius and in bounds', () => {
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      expect(collidesWith(ax, az, R, CITY_COLLIDERS)).toBe(false);
      // Phase C-8.70B: the walkable world is the city square UNION the East
      // Circus District band (C-8.64A/B), so the literal ±35 square is replaced
      // by the movement envelope's own clamp — the same invariant ("the arrival
      // is inside the walkable world"), stated against the envelope that now
      // actually bounds movement.  Every city arrival still satisfies the old
      // numbers; only the district entry sits outside them.
      expect(clampBoundaryX(ax, az)).toBe(ax);
      expect(clampBoundaryZ(ax, az)).toBe(az);
    }
  });

  test('the Doctore House arrival itself clears by 1.5 (was 0.5 under C-8.12)', () => {
    const [ax, az] = DOCTORE_ARRIVAL;
    const { distance, id } = nearestCollider(ax, az);
    // Since C-8.19 the nearest feature is the house it serves — the west plinth
    // face at X = 25.0, on the west doorway's centre line.
    expect(distance).toBeCloseTo(1.5, 10);
    expect(id).toBe('doctore-house');
    expect(distance).toBeGreaterThan(ARRIVAL_CLEARANCE);
    expect(distanceTo(doctore, ax, az)).toBeCloseTo(1.5, 10);
    // The Merchant House south edge that the C-8.12 shift crowded is now
    // 2.375 away (it was 0.5, then exactly 1.5 under C-8.13).
    expect(distanceTo(merchantHouse, ax, az)).toBeCloseTo(2.375, 10);
  });
});

// ── E. Arrival is collision-free and the interaction is reachable ─────────

describe('E. Doctore House arrival and interaction reachability', () => {
  test('the arrival point is collision-free', () => {
    const [ax, az] = DOCTORE_ARRIVAL;
    expect(collidesWith(ax, az, R, CITY_COLLIDERS)).toBe(false);
  });

  test('the arrival already sits inside the interaction radius', () => {
    const [ax, az] = DOCTORE_ARRIVAL;
    const dist = Math.hypot(ax - DOCTORE_HUB!.position[0], az - DOCTORE_HUB!.position[2]);
    expect(dist).toBeCloseTo(4.5, 9);
    expect(dist).toBeLessThanOrEqual(DOCTORE_HUB!.radius);
    expect(getNearbyHubLocation([ax, 0, az])?.id).toBe('doctore_house');
  });

  test('walking east from the arrival approaches the house and stays outside it', () => {
    const [ax, az] = DOCTORE_ARRIVAL;
    const traj = walk([ax, 0, az], 1, 0, 60);
    const end = traj[traj.length - 1];

    // Stops against the west wall (collision begins at x = 25 - 0.4 = 24.6).
    expect(end[0]).toBeGreaterThan(24.5);
    expect(end[0]).toBeLessThan(24.61);
    expect(end[2]).toBeCloseTo(az, 10);

    // Intermediate positions count too: a mid-walk position is clear, east of
    // the arrival, short of the wall stop, and inside no collider.
    const mid = traj.find((p) => p[0] > ax && p[0] < end[0] - 1e-6);
    expect(mid).toBeDefined();
    expect(mid![2]).toBeCloseTo(az, 10);
    expect(collidesWith(mid![0], mid![2], R, CITY_COLLIDERS)).toBe(false);
    expect(everInside(traj, CITY_COLLIDERS)).toBe(false);

    // ...and the stop position is comfortably within the interaction zone.
    const dist = Math.hypot(end[0] - DOCTORE_HUB!.position[0], end[2] - DOCTORE_HUB!.position[2]);
    expect(dist).toBeLessThan(DOCTORE_HUB!.radius);
    expect(dist).toBeGreaterThan(3.3);
    expect(dist).toBeLessThan(3.5);
    expect(getNearbyHubLocation([end[0], 0, end[2]])?.id).toBe('doctore_house');
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
});

// ── F. Via Mercatoria corridor traversal, both directions ────────────────

describe('F. Merchant House alley traversal through the paved corridor', () => {
  const alleyWest = VIA_MERCATORIA_PATH.cx - VIA_MERCATORIA_PATH.w / 2; // 19
  const alleyEast = VIA_MERCATORIA_PATH.cx + VIA_MERCATORIA_PATH.w / 2; // 22
  const alleySouth = VIA_MERCATORIA_PATH.cz - VIA_MERCATORIA_PATH.d / 2; // -14
  const alleyNorth = VIA_MERCATORIA_PATH.cz + VIA_MERCATORIA_PATH.d / 2; // -8.2

  /** Every step must sit inside the paved corridor band (X and Z). */
  function staysInPavedCorridor(traj: Array<[number, number, number]>): boolean {
    return traj.every(
      (p) => p[0] >= alleyWest && p[0] <= alleyEast && p[2] >= alleySouth && p[2] <= alleyNorth,
    );
  }

  const LANE_X = (alleyWest + alleyEast) / 2; // 20.5 — centre of the paving

  test('corridor lane is well west of the Merchant House west edge', () => {
    expect(alleyEast).toBeLessThanOrEqual(merchantHouse.cx - merchantHouse.hw); // 22.15
    expect(LANE_X).toBeGreaterThan(alleyWest);
    expect(LANE_X).toBeLessThan(alleyEast);
  });

  // Southbound: 0.4 south of the General Store south edge (-8.15) down to the
  // south end of the paving; neither end is an exact boundary value.
  const southTraj = walk([LANE_X, 0, -8.6], 0, -1, 80);
  const southEnd = southTraj[southTraj.length - 1];
  const southMid = southTraj[Math.floor(southTraj.length / 2)];

  test('southbound: descends the full corridor on the paving', () => {
    expect(southEnd[2]).toBeLessThan(-13.4);
    expect(southEnd[2]).toBeGreaterThan(alleySouth);
    expect(southEnd[0]).toBeCloseTo(LANE_X, 10);
  });

  test('southbound: intermediate + final positions stay inside the paved corridor', () => {
    expect(staysInPavedCorridor(southTraj)).toBe(true);
    expect(southMid[2]).toBeLessThan(-8.6);
    expect(southMid[2]).toBeGreaterThan(southEnd[2]);
  });

  test('southbound: never penetrates either building', () => {
    expect(everInside(southTraj, [generalStore, merchantHouse, doctore])).toBe(false);
    expect(
      southTraj.every((p) => !collidesWith(p[0], p[2], R, CITY_COLLIDERS)),
    ).toBe(true);
  });

  // Northbound: back up the same lane to the General Store's south face.
  const northTraj = walk([LANE_X, 0, -13.6], 0, 1, 80);
  const northEnd = northTraj[northTraj.length - 1];
  const northMid = northTraj[Math.floor(northTraj.length / 2)];

  test('northbound: climbs the corridor to the General Store south face', () => {
    expect(northEnd[2]).toBeGreaterThan(-8.7);
    expect(northEnd[2]).toBeLessThan(-8.4);
    expect(northEnd[0]).toBeCloseTo(LANE_X, 10);
  });

  test('northbound: intermediate + final positions stay inside the paved corridor', () => {
    // The stop position is 0.1 short of the corridor's north edge, so allow the
    // trajectory band check to cover the paving while asserting the end point
    // separately above.
    expect(staysInPavedCorridor(northTraj)).toBe(true);
    expect(northMid[2]).toBeGreaterThan(-13.6);
    expect(northMid[2]).toBeLessThan(northEnd[2]);
  });

  test('northbound: never penetrates either building', () => {
    expect(everInside(northTraj, [generalStore, merchantHouse, doctore])).toBe(false);
    expect(
      northTraj.every((p) => !collidesWith(p[0], p[2], R, CITY_COLLIDERS)),
    ).toBe(true);
  });

  test('the moved Doctore House does not intrude into the corridor', () => {
    const o = overlap(doctore, {
      ...merchantHouse,
      id: 'via-mercatoria-corridor',
      cx: VIA_MERCATORIA_PATH.cx,
      cz: VIA_MERCATORIA_PATH.cz,
      hw: VIA_MERCATORIA_PATH.w / 2,
      hd: VIA_MERCATORIA_PATH.d / 2,
    } as RectCollider);
    expect(o.overlapX > 0 && o.overlapZ > 0).toBe(false);
    // The house's north edge is still south of the corridor's south edge.
    expect(doctore.cz + doctore.hd).toBeLessThanOrEqual(alleySouth);
  });
});

// ── G. Prior-phase regressions that must survive C-8.13 ──────────────────

describe('G. C-8.10 and C-8.12 regressions', () => {
  test('C-8.10: Smithing Forge is still narrowed to width 9.5 and the workshop untouched', () => {
    expect(forge.cx).toBe(18);
    // Phase C-8.19 moved the forge Z centre 2 → 2.6; width/depth unchanged.
    expect(forge.cz).toBe(2.6);
    expect(forge.hw).toBe(4.75);
    expect(forge.hd).toBe(4.0);
    expect(workshop.cx).toBe(28.2);
    expect(workshop.cz).toBe(1.15);
    expect(workshop.hw).toBe(4.45);
    expect(workshop.hd).toBe(2.85);
  });

  test('C-8.10: the Forge–Workshop passage is still walkable', () => {
    const gapCenter =
      (forge.cx + forge.hw + R + (workshop.cx - workshop.hw - R)) / 2; // ≈ 23.25
    const traj = walk([gapCenter, 0, -1.0], 0, 1, 500);
    const end = traj[traj.length - 1];
    expect(end[2]).toBeGreaterThan(forge.cz + forge.hd);
    expect(everInside(traj, [forge, workshop])).toBe(false);
  });

  test('C-8.12: Merchant House geometry and arrival are unchanged', () => {
    expect(merchantHouse.cx).toBe(26);
    expect(merchantHouse.cz).toBe(-13);
    expect(MERCHANT_ARRIVAL).toEqual([21, -13]);
    const gap = (generalStore.cz - generalStore.hd) - (merchantHouse.cz + merchantHouse.hd);
    expect(gap).toBeCloseTo(1.35, 10);
    expect(gap - 2 * R).toBeCloseTo(0.55, 10);
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
