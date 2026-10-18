/**
 * Phase C-8.19 — Doctore House depth reduction (Merchant House interpenetration).
 *
 * The C-8.18 audit's consistent shallower variant was applied: the north
 * foundation face stays pinned at Z = -20.75 while the footprint depth is cut
 * 5.0 → 3.25 (plinth 5.5 → 3.75).  The root therefore moves from Z = -18 to
 * Z = -18.875, the south plinth face lands at Z = -17.0, and the 1.25-unit
 * Z interpenetration with the Merchant House (north plinth face Z = -16.5)
 * becomes a 0.50-unit gap — 0.30 narrower than the 0.80 player diameter, so no
 * walkable route opens between the two buildings.
 *
 * The rendered geometry is read from the component sources and evaluated with
 * the primitives' documented formulas (cross-checked against
 * ClassicalArchitecture.tsx in section C), so every clearance below is derived
 * from the real numbers rather than restated.  The collider, hub and arrival
 * come from the real registry and tables, and every traversal case drives the
 * real movement resolver.
 *
 * Run with: bun test src/utils/phaseC8_19.test.ts
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
} from './cityCollisions';
import { VIA_MERCATORIA_PATH } from './streetGeometry';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), 'utf8');

const houseSrc = load('../components/3d/city/DoctoreHouse.tsx');
const merchantSrc = load('../components/3d/city/MerchantHouse.tsx');
const archSrc = load('../components/3d/city/ClassicalArchitecture.tsx');

const R = PLAYER_RADIUS;
/** Documented Phase 31D arrival invariant: player radius + 0.5 safety margin. */
const ARRIVAL_CLEARANCE = R + 0.5; // 0.9

/** First `[a, b]` captured by `re`. */
function pair(src: string, re: RegExp): [number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`pair not found: ${re}`);
  return [Number(m[1]), Number(m[2])];
}

/** First `[a, b, c]` captured by `re`. */
function triple(src: string, re: RegExp): [number, number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`triple not found: ${re}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** First single number captured by `re`. */
function num(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m) throw new Error(`number not found: ${re}`);
  return Number(m[1]);
}

/** The last `<group position={[...]}>` that appears before `marker`. */
function groupPositionBefore(marker: string): [number, number, number] {
  const idx = houseSrc.indexOf(marker);
  if (idx < 0) throw new Error(`marker not found: ${marker}`);
  const re = /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/g;
  let last: [number, number, number] | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(houseSrc)) !== null) {
    if (m.index > idx) break;
    last = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (!last) throw new Error('no group before marker');
  return last;
}

function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

function overlap(a: RectCollider, b: RectCollider) {
  return {
    overlapX: Math.min(a.cx + a.hw, b.cx + b.hw) - Math.max(a.cx - a.hw, b.cx - b.hw),
    overlapZ: Math.min(a.cz + a.hd, b.cz + b.hd) - Math.max(a.cz - a.hd, b.cz - b.hd),
  };
}

function rectGap(a: RectCollider, b: RectCollider): number {
  const { overlapX, overlapZ } = overlap(a, b);
  return Math.hypot(Math.max(0, -overlapX), Math.max(0, -overlapZ));
}

function distanceTo(c: Collider, x: number, z: number): number {
  if (c.type === 'rect') {
    const dx = Math.max(c.cx - c.hw - x, 0, x - (c.cx + c.hw));
    const dz = Math.max(c.cz - c.hd - z, 0, z - (c.cz + c.hd));
    return Math.hypot(dx, dz);
  }
  if (c.type === 'circle') return Math.max(0, Math.hypot(x - c.cx, z - c.cz) - c.r);
  const vx = c.x2 - c.x1;
  const vz = c.z2 - c.z1;
  const t = Math.max(0, Math.min(1, ((x - c.x1) * vx + (z - c.z1) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - (c.x1 + t * vx), z - (c.z1 + t * vz));
}

function nearestColliderDistance(x: number, z: number): number {
  let best = Infinity;
  for (const c of CITY_COLLIDERS) best = Math.min(best, distanceTo(c, x, z));
  return best;
}

const SPEED = 3.8;
const DT = 1 / 60;

function walk(
  start: [number, number, number],
  dx: number,
  dz: number,
  steps: number,
): Array<[number, number, number]> {
  const traj: Array<[number, number, number]> = [start];
  let p = start;
  for (let i = 0; i < steps; i++) {
    p = resolveCityMovement(p, dx, dz, SPEED, DT);
    traj.push(p);
  }
  return traj;
}

const everInside = (traj: Array<[number, number, number]>): boolean =>
  traj.some((p) => collidesWith(p[0], p[2], R, CITY_COLLIDERS));

// ── Rendered geometry (Doctore House, from its own source) ───────────────

const ROOT = triple(
  houseSrc,
  /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);
const FOUNDATION = pair(
  houseSrc,
  /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const PROJECTION = num(houseSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
/** The first boxGeometry in the file is the solid wall block. */
const WALL_BOX = triple(
  houseSrc,
  /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}\s*\/>/,
);
const QUOINS = pair(
  houseSrc,
  /<CornerQuoins\s+height=\{[\d.]+\}\s+buildingSize=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const CORNICE = pair(houseSrc, /<WallCornice\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const CORNICE_PROJECTION = num(houseSrc, /<WallCornice[\s\S]*?projection=\{([\d.]+)\}/);
const ROOF = {
  width: num(houseSrc, /<RomanGabledRoof[\s\S]*?width=\{([\d.]+)\}/),
  depth: num(houseSrc, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
  height: num(houseSrc, /<RomanGabledRoof[\s\S]*?height=\{([\d.]+)\}/),
  overhang: num(houseSrc, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
};

// Merchant House reference geometry — untouched by this phase, parsed here so
// the clearance maths is derived rather than restated from memory.
const M_ROOT = triple(
  merchantSrc,
  /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);
const M_FOUNDATION = pair(
  merchantSrc,
  /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const M_PROJECTION = num(merchantSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
const M_GROUND_WALL = pair(
  merchantSrc,
  /position=\{\[0, 1\.6, 0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*[\d.]+,\s*([\d.]+)\s*\]\}/,
);
const M_UPPER_WALL = pair(
  merchantSrc,
  /position=\{\[0, 4\.3, 0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*[\d.]+,\s*([\d.]+)\s*\]\}/,
);
const M_BELT_CORNICE = pair(
  merchantSrc,
  /<WallCornice\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}\s+y=\{3\.2\}/,
);
const M_EAVE_CORNICE = pair(
  merchantSrc,
  /<WallCornice\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}\s+y=\{5\.38\}/,
);
const M_ROOF = {
  depth: num(merchantSrc, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
  overhang: num(merchantSrc, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
};

const doctore = findRect('doctore-house');
const merchantHouse = findRect('merchant-house');
const academy = findRect('gladiator-academy');

// Primitive-derived half-depths (formulas verified in section C).
const halfPlinthDepth = (FOUNDATION[1] + 2 * PROJECTION) / 2;   // 1.875
const halfWallDepth = WALL_BOX[2] / 2;                          // 1.625
const halfFasciaDepth = (ROOF.depth + ROOF.overhang * 1.2) / 2; // 1.835
const halfRoofDepth = ROOF.depth / 2 + ROOF.overhang;           // 1.975

// Doctore House world-space south faces (more negative Z = further north).
const dPlinthSouth = ROOT[2] + halfPlinthDepth;                        // -17.00
const dWallSouth = ROOT[2] + halfWallDepth;                            // -17.25
const dQuoinSouth = dWallSouth + 0.35 / 2;                             // -17.075
const dCorniceSouth = ROOT[2] + CORNICE[1] / 2 + CORNICE_PROJECTION;   // -17.13
const dFasciaSouth = ROOT[2] + halfFasciaDepth;                        // -17.04
const dTympanumSouth = ROOT[2] + ROOF.depth / 2 + 0.02;                // -17.23
const dRoofPlaneSouth = ROOT[2] + halfRoofDepth;                       // -16.90

// Merchant House world-space south faces.  The Merchant House stands NORTH of
// the Doctore House, so its south (facing) faces are on the −Z side of its root.
const mPlinthSouth = M_ROOT[2] - (M_FOUNDATION[1] + 2 * M_PROJECTION) / 2; // -16.50
const mGroundWallSouth = M_ROOT[2] - M_GROUND_WALL[1] / 2;                 // -16.25
const mUpperWallSouth = M_ROOT[2] - M_UPPER_WALL[1] / 2;                   // -16.05
const mBeltCorniceSouth = M_ROOT[2] - M_BELT_CORNICE[1] / 2 - 0.12;        // -16.37
const mEaveCorniceSouth = M_ROOT[2] - M_EAVE_CORNICE[1] / 2 - 0.12;        // -16.17
const mFasciaSouth = M_ROOT[2] - (M_ROOF.depth + M_ROOF.overhang * 1.2) / 2; // -16.26
const mRoofPlaneSouth = M_ROOT[2] - (M_ROOF.depth / 2 + M_ROOF.overhang);    // -16.40

const DOCTORE_HUB = HUB_LOCATIONS.find((l) => l.id === 'doctore_house');
const DOCTORE_ARRIVAL = FAST_TRAVEL_ARRIVALS.doctore_house;

// ── A. Footprint, collider, hub and arrival ──────────────────────────────

describe('A. Rendered footprint, collider, hub and arrival agree', () => {
  test('the shallower C-8.18 variant is the one implemented (depth 5.0 → 3.25)', () => {
    expect(ROOT).toEqual([28, 0, -18.875]);
    expect(FOUNDATION).toEqual([5.5, 3.25]);
    expect(PROJECTION).toBe(0.25);
    expect(WALL_BOX).toEqual([5.5, 3.6, 3.25]);
    expect(QUOINS).toEqual([5.5, 3.25]);
    expect(CORNICE).toEqual([5.5, 3.25]);
    // Roof span, ridge height and eave overhang are the C-8.13 values, so the
    // pitch (atan2(1.2, 2.75 + 0.35) ≈ 21.2°), the gable triangle (base 5.5,
    // apex 1.2) and every material/colour prop stay as they were; only the
    // ridge length follows the new depth.
    expect(ROOF).toEqual({ width: 5.5, depth: 3.25, height: 1.2, overhang: 0.35 });
  });

  test('the collider equals the rendered plinth footprint', () => {
    expect(doctore.cx).toBe(ROOT[0]);
    expect(doctore.cz).toBe(ROOT[2]);
    expect(doctore.hw * 2).toBeCloseTo(FOUNDATION[0] + 2 * PROJECTION, 10); // 6.0
    expect(doctore.hd * 2).toBeCloseTo(FOUNDATION[1] + 2 * PROJECTION, 10); // 3.75
    expect(doctore.cz - doctore.hd).toBeCloseTo(-20.75, 10);
    expect(doctore.cz + doctore.hd).toBeCloseTo(-17.0, 10);
  });

  test('the north foundation boundary is still Z = -20.75', () => {
    expect(ROOT[2] - halfPlinthDepth).toBeCloseTo(-20.75, 10);
    expect(ROOT[2] - halfWallDepth).toBeCloseTo(-20.5, 10);
  });

  test('hub and fast-travel arrival follow the root, keeping the west offset', () => {
    expect(DOCTORE_HUB?.position).toEqual([28, 0, -18.875]);
    expect(DOCTORE_HUB?.radius).toBe(4.5);
    expect(DOCTORE_ARRIVAL).toEqual([23.5, -18.875]);
    expect(doctore.cx - doctore.hw - DOCTORE_ARRIVAL[0]).toBeCloseTo(1.5, 10);
    // The arrival sits on the west doorway's centre line (the doorway is at
    // local Z 0), so the walk-in approach to the entrance is straight on.
    expect(DOCTORE_ARRIVAL[1]).toBe(DOCTORE_HUB!.position[2]);
  });

  test('the building stays inside the world movement boundary', () => {
    expect(doctore.cx - doctore.hw).toBeGreaterThanOrEqual(-35);
    expect(doctore.cx + doctore.hw).toBeLessThanOrEqual(35);
    expect(doctore.cz - doctore.hd).toBeGreaterThanOrEqual(-91);
    expect(doctore.cz + doctore.hd).toBeLessThanOrEqual(35);
  });
});

// ── B. Interpenetration removed, and no route opens ──────────────────────

describe('B. Doctore House ↔ Merchant House no longer interpenetrate', () => {
  test('no collider footprint overlaps the Doctore House any more', () => {
    for (const c of CITY_COLLIDERS) {
      if (c.type !== 'rect' || c.id === 'doctore-house') continue;
      const o = overlap(doctore, c);
      expect(o.overlapX > 0 && o.overlapZ > 0, `${c.id} still overlaps`).toBe(false);
    }
    expect(overlap(doctore, merchantHouse).overlapX).toBeCloseTo(4.85, 10);
    expect(overlap(doctore, merchantHouse).overlapZ).toBeCloseTo(-0.5, 10);
  });

  test('the plinth gap is 0.50 — at the audited minimum', () => {
    const gap = mPlinthSouth - dPlinthSouth;
    expect(gap).toBeCloseTo(0.5, 10);
    expect(gap).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });

  test('the gap is narrower than the player, so it is still not a passage', () => {
    const gap = mPlinthSouth - dPlinthSouth;
    expect(gap).toBeLessThan(2 * R);
    for (let z = dPlinthSouth; z <= mPlinthSouth + 1e-9; z += 0.05) {
      expect(collidesWith(27, z, R, CITY_COLLIDERS), `gap point z=${z.toFixed(2)}`).toBe(true);
    }
    const traj = walk([32, 0, -16.75], -1, 0, 60);
    const end = traj[traj.length - 1];
    expect(end[0]).toBeGreaterThan(31.0);
    expect(end[0]).toBeLessThan(31.5);
    expect(everInside(traj)).toBe(false);
  });

  test('the Academy keeps its 2.60 clearance', () => {
    expect(academy.cx).toBe(30.5);
    expect(academy.cz).toBe(-27);
    expect(rectGap(doctore, academy)).toBeCloseTo(2.6, 10);
    expect(rectGap(doctore, academy)).toBeGreaterThan(ARRIVAL_CLEARANCE);
  });
});

// ── C. Rendered-mesh clearances ──────────────────────────────────────────

describe('C. Rendered walls, foundations, roofs and fascia do not interpenetrate', () => {
  test('the primitives apply the formulas used below', () => {
    // Fascia half-depth = (depth + overhang * 1.2) / 2
    expect(archSrc).toContain(
      '<boxGeometry args={[width + eaveOverhang * 1.2, 0.16, depth + eaveOverhang * 1.2]} />',
    );
    // Roof planes reach one eave overhang beyond the wall footprint.
    expect(archSrc).toContain('const halfSpan = span / 2 + eaveOverhang;');
    expect(archSrc).toContain('const fullLength = length + eaveOverhang * 2;');
    // Gable tympanums sit 0.02 outside the wall footprint.
    expect(archSrc).toContain('position={[0, 0, depth / 2 + 0.02]}');
    // Quoin blocks project 0.175 (0.35 / 2) beyond the corner on the long axis.
    expect(archSrc).toContain('const qx = isLong ? 0.35 : 0.22;');
  });

  test('plinth-to-plinth gap is 0.50 (the expected minimum)', () => {
    expect(mPlinthSouth - dPlinthSouth).toBeCloseTo(0.5, 10);
  });

  test('rendered walls clear each other by 1.00', () => {
    expect(mGroundWallSouth - dWallSouth).toBeCloseTo(1.0, 10);
  });

  test('corner quoins clear the Merchant House wall by 0.825', () => {
    expect(mGroundWallSouth - dQuoinSouth).toBeCloseTo(0.825, 10);
  });

  test('eave cornice clears the Merchant House cornices by 0.76 and 0.96', () => {
    expect(mBeltCorniceSouth - dCorniceSouth).toBeCloseTo(0.76, 10);
    expect(mEaveCorniceSouth - dCorniceSouth).toBeCloseTo(0.96, 10);
  });

  test('roof fascia clears the Merchant House fascia by 0.78', () => {
    expect(mFasciaSouth - dFasciaSouth).toBeCloseTo(0.78, 10);
  });

  test('roof planes (eave overhang) clear each other by 0.50', () => {
    expect(dRoofPlaneSouth).toBeCloseTo(-16.9, 10);
    expect(mRoofPlaneSouth - dRoofPlaneSouth).toBeCloseTo(0.5, 10);
  });

  test('the gable tympanum clears the Merchant House upper floor by 1.18', () => {
    expect(mUpperWallSouth - dTympanumSouth).toBeCloseTo(1.18, 10);
  });

  test('every measured mesh clearance is strictly positive', () => {
    const gaps = {
      plinth: mPlinthSouth - dPlinthSouth,
      wall: mGroundWallSouth - dWallSouth,
      quoin: mGroundWallSouth - dQuoinSouth,
      beltCornice: mBeltCorniceSouth - dCorniceSouth,
      eaveCornice: mEaveCorniceSouth - dCorniceSouth,
      fascia: mFasciaSouth - dFasciaSouth,
      roofPlane: mRoofPlaneSouth - dRoofPlaneSouth,
      tympanumToUpperFloor: mUpperWallSouth - dTympanumSouth,
    };
    for (const [name, gap] of Object.entries(gaps)) {
      expect(gap, `${name} gap must be positive`).toBeGreaterThan(0);
    }
    // Tightest pairs are the plinth and the roof eave overhang, both at 0.50.
    expect(Math.min(...Object.values(gaps))).toBeCloseTo(0.5, 10);
  });
});

// ── D. Props: re-seated, neither buried nor detached ─────────────────────

describe('D. Rack, dummy and banner are re-seated against the new walls', () => {
  // Markers sit INSIDE each prop group, so the "last group before the marker"
  // is the group itself (the rack's JSX comment precedes its own group).
  const rackPos = groupPositionBefore('5c3f1f');
  const dummyPos = groupPositionBefore('451a03');
  const bannerPos = groupPositionBefore('Wooden vertical banner pole');

  const BENCH = triple(
    houseSrc,
    /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}\s*\/>\s*<meshStandardMaterial color="#5c3f1f"/,
  );
  const POST = triple(
    houseSrc,
    /<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*8\s*\]\}\s*\/>\s*<meshStandardMaterial color="#451a03"/,
  );
  const DISC = triple(houseSrc, /<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*10\s*\]\}/);
  const POLE = triple(
    houseSrc,
    /<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*8\s*\]\}\s*\/>\s*<meshStandardMaterial color="#451a03" roughness=\{0\.9\} \/>\s*<\/mesh>\s*\{\/\* Crimson flag cloth \*\/\}/,
  );
  const FLAG = triple(
    houseSrc,
    /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}\s*\/>\s*<meshStandardMaterial color="#991b1b"/,
  );

  const wallNorth = ROOT[2] - halfWallDepth;     // -20.50
  const plinthNorth = ROOT[2] - halfPlinthDepth; // -20.75
  const wallSouth = ROOT[2] + halfWallDepth;     // -17.25
  const plinthSouth = ROOT[2] + halfPlinthDepth; // -17.00
  /** A prop is "against" the building when its near edge is under 0.5 away. */
  const ANCHOR_LIMIT = 0.5;

  test('the three prop groups are the ones the component renders', () => {
    expect(rackPos).toEqual([-1.9, 0, -2.7]);
    expect(dummyPos).toEqual([1.5, 0, -2.5]);
    expect(bannerPos).toEqual([2.1, 0, 2.3]);
  });

  test('the practice rack stands in the north lane, clear of wall and plinth', () => {
    const rackZ: [number, number] = [
      ROOT[2] + rackPos[2] - BENCH[2] / 2,
      ROOT[2] + rackPos[2] + BENCH[2] / 2,
    ];
    expect(rackZ[1]).toBeLessThan(wallNorth);   // never buried in the wall
    expect(rackZ[1]).toBeLessThan(plinthNorth); // nor in the plinth
    const gap = plinthNorth - rackZ[1];
    expect(gap).toBeCloseTo(0.225, 10);
    expect(gap).toBeLessThan(ANCHOR_LIMIT);     // still reads as the house's rack
    // West of the dummy, inside the building's own X band.
    const rackX = ROOT[0] + rackPos[0];
    expect(rackX).toBeGreaterThan(doctore.cx - doctore.hw);
    expect(rackX).toBeLessThan(doctore.cx + doctore.hw);
  });

  test('the straw dummy stands in the same lane, clear of wall and plinth', () => {
    const postZ: [number, number] = [
      ROOT[2] + dummyPos[2] - POST[1],
      ROOT[2] + dummyPos[2] + POST[1],
    ];
    // The straw disc is rotated [π/2, 0, 0], so its Z extent is the cylinder
    // thickness (0.22), not its 0.45 radius.
    const discCentreZ = ROOT[2] + dummyPos[2] + 0.1;
    const discZ: [number, number] = [discCentreZ - DISC[2] / 2, discCentreZ + DISC[2] / 2];
    expect(postZ[1]).toBeLessThan(wallNorth);
    expect(discZ[1]).toBeLessThan(plinthNorth);
    const gap = plinthNorth - discZ[1];
    expect(gap).toBeCloseTo(0.415, 10);
    expect(gap).toBeLessThan(ANCHOR_LIMIT);
    // Thin post: no part of it reaches the plinth either.
    expect(POST[1]).toBeLessThan(gap);
    // East of the rack, inside the building's X band.
    const dummyX = ROOT[0] + dummyPos[0];
    expect(dummyX).toBeGreaterThan(ROOT[0] + rackPos[0]);
    expect(dummyX + DISC[0]).toBeLessThan(doctore.cx + doctore.hw);
  });

  test('the banner stands against the south wall, clear of the Merchant House', () => {
    const poleX = ROOT[0] + bannerPos[0];
    const poleZ = ROOT[2] + bannerPos[2];
    const poleR = POLE[1]; // base radius from the source cylinder
    expect(poleZ - poleR).toBeGreaterThan(wallSouth);   // outside the wall face
    expect(poleZ - poleR).toBeGreaterThan(plinthSouth); // and the plinth
    const gap = poleZ - poleR - plinthSouth;
    expect(gap).toBeCloseTo(0.345, 10);
    expect(gap).toBeLessThan(ANCHOR_LIMIT);
    // West of the Merchant House plinth's east corner (X = 29.85): no overlap.
    expect(poleX - poleR).toBeGreaterThan(merchantHouse.cx + merchantHouse.hw);
    // The flag flies east over open ground, entirely east of that corner too.
    const flagMinX = poleX + 0.4 - FLAG[0] / 2 - (FLAG[1] / 2) * Math.sin(0.1);
    expect(flagMinX).toBeGreaterThan(merchantHouse.cx + merchantHouse.hw);
    // The flag hangs south of the roof eave, below the fascia.
    const flagCentreZ = poleZ + 0.02;
    expect(flagCentreZ - FLAG[2] / 2).toBeGreaterThan(dRoofPlaneSouth);
    expect(2.8 + FLAG[1] / 2).toBeLessThan(3.44);
  });

  test('the banner pole top clears the south roof eave', () => {
    const poleR = POLE[1];
    const poleZNear = ROOT[2] + bannerPos[2] - poleR; // southernmost pole surface
    expect(poleZNear - dRoofPlaneSouth).toBeCloseTo(0.245, 10);
    // Pole top (3.6) is level with the wall top, i.e. under the eave line.
    expect(POLE[2]).toBeCloseTo(3.6, 10);
  });

  test('no prop sits inside the wall or plinth boxes', () => {
    const inside = (x: number, z: number): boolean =>
      x > doctore.cx - doctore.hw &&
      x < doctore.cx + doctore.hw &&
      z > plinthNorth &&
      z < plinthSouth;
    for (const [name, p] of [
      ['rack', rackPos],
      ['dummy', dummyPos],
      ['banner', bannerPos],
    ] as const) {
      expect(inside(ROOT[0] + p[0], ROOT[2] + p[2]), `${name} inside the footprint`).toBe(
        false,
      );
    }
  });
});

// ── E. Doorway reachability and hub resolution ──────────────────────────

describe('E. West doorway stays reachable from the fast-travel arrival', () => {
  const approach = walk([DOCTORE_ARRIVAL[0], 0, DOCTORE_ARRIVAL[1]], 1, 0, 60);
  const standoff = approach[approach.length - 1];
  /** Doorway plane: west wall face (root − 2.75) plus its 0.02 outward offset. */
  const DOOR_PLANE_X = ROOT[0] - 2.75 - 0.02;

  test('the arrival is collision-free with the documented clearance', () => {
    const best = nearestColliderDistance(DOCTORE_ARRIVAL[0], DOCTORE_ARRIVAL[1]);
    expect(best).toBeCloseTo(1.5, 10);
    expect(best).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
    expect(collidesWith(DOCTORE_ARRIVAL[0], DOCTORE_ARRIVAL[1], R, CITY_COLLIDERS)).toBe(false);
  });

  test('walking east stops on the west wall without penetrating anything', () => {
    expect(standoff[0]).toBeGreaterThan(24.5);
    expect(standoff[0]).toBeLessThan(24.61);
    expect(standoff[2]).toBeCloseTo(DOCTORE_ARRIVAL[1], 10);
    expect(everInside(approach)).toBe(false);
    expect(DOOR_PLANE_X - standoff[0]).toBeCloseTo(0.6533, 3);
    expect(DOOR_PLANE_X - standoff[0]).toBeGreaterThan(R);
  });

  test('the standoff resolves to the Doctore House hub and to no other', () => {
    const covering = HUB_LOCATIONS.filter(
      (l) => Math.hypot(standoff[0] - l.position[0], standoff[2] - l.position[2]) <= l.radius,
    ).map((l) => l.id);
    expect(covering).toEqual(['doctore_house']);
    expect(getNearbyHubLocation([standoff[0], 0, standoff[2]])?.id).toBe('doctore_house');
  });

  test('lateral walk-ins along the door band reach the same standoff', () => {
    for (const z of [-19.7, -18.875, -18.1]) {
      const traj = walk([DOCTORE_ARRIVAL[0], 0, z], 1, 0, 60);
      const end = traj[traj.length - 1];
      expect(end[0]).toBeCloseTo(standoff[0], 6);
      expect(end[2]).toBeCloseTo(z, 10);
      expect(everInside(traj)).toBe(false);
    }
  });

  test('the arrival is not a movement trap', () => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const moved = resolveCityMovement(
        [DOCTORE_ARRIVAL[0], 0, DOCTORE_ARRIVAL[1]],
        dx,
        dz,
        SPEED,
        DT,
      );
      expect(
        Math.hypot(moved[0] - DOCTORE_ARRIVAL[0], moved[2] - DOCTORE_ARRIVAL[1]),
        `stuck pushing [${dx}, ${dz}]`,
      ).toBeGreaterThan(SPEED * DT * 0.9);
    }
  });
});

// ── F. Registry-wide arrival invariants and untouched neighbours ─────────

describe('F. Every arrival is safe, Via Mercatoria works, neighbours untouched', () => {
  test('all arrivals are collision-free, in bounds and ≥ 0.9 clear', () => {
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      expect(
        nearestColliderDistance(ax, az),
        `${loc.id} arrival clearance`,
      ).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
      expect(collidesWith(ax, az, R, CITY_COLLIDERS), `${loc.id} arrival collision`).toBe(false);
      expect(Math.abs(ax)).toBeLessThanOrEqual(35);
      expect(az).toBeGreaterThanOrEqual(-91);
      expect(az).toBeLessThanOrEqual(35);
    }
  });

  test('the Via Mercatoria corridor is traversable in both directions', () => {
    const west = VIA_MERCATORIA_PATH.cx - VIA_MERCATORIA_PATH.w / 2;
    const east = VIA_MERCATORIA_PATH.cx + VIA_MERCATORIA_PATH.w / 2;
    const south = VIA_MERCATORIA_PATH.cz - VIA_MERCATORIA_PATH.d / 2;
    const north = VIA_MERCATORIA_PATH.cz + VIA_MERCATORIA_PATH.d / 2;
    const laneX = (west + east) / 2;
    const inCorridor = (t: Array<[number, number, number]>): boolean =>
      t.every((p) => p[0] >= west && p[0] <= east && p[2] >= south && p[2] <= north);
    const down = walk([laneX, 0, -8.6], 0, -1, 80);
    const up = walk([laneX, 0, -13.6], 0, 1, 80);
    expect(down[down.length - 1][2]).toBeLessThan(-13.4);
    expect(up[up.length - 1][2]).toBeGreaterThan(-8.7);
    expect(inCorridor(down)).toBe(true);
    expect(inCorridor(up)).toBe(true);
    expect(everInside(down)).toBe(false);
    expect(everInside(up)).toBe(false);
    // The Doctore House still stops short of the corridor's south edge.
    expect(doctore.cz + doctore.hd).toBeLessThanOrEqual(south);
  });

  test('unrelated city geometry is unchanged (collider + table pins)', () => {
    expect(findRect('merchant-house')).toMatchObject({ cx: 26, cz: -13, hw: 3.85, hd: 3.5 });
    expect(findRect('gladiator-academy')).toMatchObject({ cx: 30.5, cz: -27, hw: 3.85, hd: 3.65 });
    expect(findRect('general-store')).toMatchObject({ cx: 22, cz: -5, hw: 3.85, hd: 3.15 });
    expect(findRect('smithing-forge')).toMatchObject({ cx: 18, cz: 2, hw: 4.75, hd: 4.0 });
    expect(findRect('armor-workshop')).toMatchObject({ cx: 28.2, cz: 1.15, hw: 4.45, hd: 2.85 });
    // Phase C-8.18 moved the Records Library 0.90 west (X 24 → 23.10); its
    // footprint dimensions are unchanged.
    expect(findRect('records-library')).toMatchObject({ cx: 23.1, cz: -30, hw: 3.25, hd: 2.85 });
    expect(FAST_TRAVEL_ARRIVALS.merchant_house).toEqual([21, -13]);
    expect(FAST_TRAVEL_ARRIVALS.gladiator_academy).toEqual([25.5, -23]);
    expect(VIA_MERCATORIA_PATH).toEqual({
      id: 'via-mercatoria-path',
      cx: 20.5,
      cz: -11.1,
      w: 3,
      d: 5.8,
    });
  });

  test('the Forge–Workshop passage still opens northwards', () => {
    const forge = findRect('smithing-forge');
    const workshop = findRect('armor-workshop');
    const gapCenter = (forge.cx + forge.hw + R + (workshop.cx - workshop.hw - R)) / 2;
    const traj = walk([gapCenter, 0, -1.0], 0, 1, 500);
    expect(traj[traj.length - 1][2]).toBeGreaterThan(forge.cz + forge.hd);
    expect(traj.some((p) => collidesWith(p[0], p[2], R, [forge, workshop]))).toBe(false);
  });
});
