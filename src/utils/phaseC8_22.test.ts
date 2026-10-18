/**
 * Phase C-8.22 — the remaining street-prop ↔ building collisions.
 *
 * The C-8.20 city-wide audit left two forecourts, one forge cluster and the
 * Doctore House frontage interpenetrating their buildings.  This phase moves
 * exactly seven street props (`RomanBench` ×2, `WineBarrel` ×2, `TimberCrate`,
 * `RomanAmphora`, `MerchantPropsCluster`, plus the courtyard obelisk group) and
 * no architecture at all:
 *
 *   1. City Tavern [-16, 0, 14] forecourt — the bench at [-13.0, 0, 11.2] and the
 *      two barrels at [-13.8, 0, 10.2] / [-14.4, 0, 10.5] stood *inside* the
 *      Tavern: the wall box (Z 10.4–17.6, Y 0–6.4) reached 0.57 into the bench seat
 *      and 0.70 into the lying barrel, plinth.lower (Z = 10.15) 0.43 into the
 *      upright barrel, and the two barrels also interpenetrated each other by 0.54.
 *      The audit's suggested Z = 9.2 does not work here: the C-8.21 cypress at
 *      [-11.5, 0, 8.55] has a 0.8925 planter, and the bench's diagonal footprint
 *      overlaps it by 0.30 at Z 9.2 and — measured corner-to-axis, as corrected
 *      in Phase C-8.27 — by 0.05 at Z 8.4.  Each prop
 *      therefore also steps outward in X: bench → [-13.8, 0, 8.4], barrels →
 *      [-15.5, 0, 9.1] (upright) and [-16.9, 0, 9.1] (lying).  Yaw, parts and cargo
 *      unchanged.
 *   2. Caravanserai Inn [16, 0, 14] forecourt — the mirrored finding: the crate at
 *      [14.0, 0, 12.0] was buried 0.80 deep in the wall, the bench at
 *      [13.0, 0, 11.2] reached 0.57 into it, the amphora at [13.6, 0, 10.2] reached
 *      0.30 into the plinth step, and the bench and crate interpenetrated by 0.33.
 *      The Inn's north plinth face is Z = 9.95 (0.20 closer than the Tavern's) and
 *      its cypress is the mirror at [+11.5, 0, 8.55], so the mirrored move applies:
 *      bench → [13.8, 0, 8.4], crate → [15.5, 0, 9.1], amphora → [16.9, 0, 9.1].
 *   3. Smithing Forge [18, 0, 2.6] — the MerchantPropsCluster at [13.2, 0, 3.8]
 *      reached 0.57 into the forge wall (X = 13.25) / plinth (X = 13.0), 0.40 into
 *      the north kerb of the Via Decumanus (Z 3.9–4.3) and 0.42 into the west
 *      doorway's approach corridor (Z 0.9–4.3).  The audit's [11.9, 0, 4.8] still
 *      clips that kerb/doorway edge by 0.02, so the cluster ships at [11.9, 0, 5.2].
 *      Forge root and collider untouched.
 *   4. Doctore House [28, 0, -18.875] frontage — the stone bench at
 *      [27.5, 0, -21.0] reached 0.50 into the house's north wall and 0.14 into the
 *      plinth, and the courtyard obelisk group at [25, 0, -21] put its base 0.135
 *      into plinth.lower and 0.125 into the north-west quoin stack.  Bench →
 *      [27.5, 0, -22.0] (0.28 clear of the plinth step), obelisk group →
 *      [25, 0, -21.6] (0.40 clear).
 *
 * Every clearance below is derived from the components' own sources: the buildings
 * from the shared primitives' documented geometry (BuildingFoundation, CornerQuoins,
 * WallCornice, RomanGabledRoof — parsed by regex, as in the C-8.18/19/21 suites),
 * the bench part-by-part from CivicFurnishingProps.RomanBench, the barrels from
 * WineBarrel (including the lying barrel's real horizontal axis), the crate /
 * amphora / cluster / obelisk from their own primitives, and the cypress planter and
 * trunk from MediterraneanFoliage at the avenue's scale 1.05.  Rotated boxes are
 * compared with exact separating-axis tests; cylinders (planter, trunk, barrels,
 * pots) by the distance between their axis segments and the box, minus the radius,
 * measured in the box's own frame (`segObbClearance`).
 *
 * ── Phase C-8.27 — test-model correction only; no shipped transform changed ──
 * That cylinder-vs-box measurement used to reuse the box's *local* half-extents
 * as world-axis extents (the former `asBox`), which is only right for an
 * axis-aligned box — and three of the seven props are yawed benches.  It now
 * runs in the box's own frame, so a rotated seat is measured as the rotated box
 * it is; the full rationale is on `segObbClearance`.
 *
 * Ten rotation-sensitive figures moved (four in the Tavern forecourt test, two
 * in the Inn's, four in the section-F probes), plus that section's
 * smallest-safe-X bound (−13.6 → −13.33) and the one figure quoted in the
 * header above.  Changes run from +0.0008 to +0.34 upward and −0.0073 downward
 * — the largest is the section-F Z-8.4 probe, a 0.3925 overlap that is really
 * 0.0508.  Every building-pair number is bit-for-bit unchanged, no assertion
 * was dropped, relaxed or reworded in intent, and no shipped prop transform was
 * touched to accommodate the corrected model.  The moved figures are called out
 * at their own assertions.
 *
 * Superseded since (Phase C-8.23): the obelisk group's X was stepped 0.10 west
 * (25 → 24.9) to lift the practice-rack gap from 0.15 to 0.25, and the west combat
 * courtyard's stone border ring — out of scope in this phase — was trimmed where it
 * crossed the Gladiator Barracks plinth.  This suite now asserts the current
 * transforms, keeping the C-8.22 values as historical coverage; the ring and the new
 * obelisk clearances are covered by src/utils/phaseC8_23.test.ts.
 *
 * Run with: bun test src/utils/phaseC8_22.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PLAYER_RADIUS, CITY_COLLIDERS, type RectCollider } from './collisionShapes';
import { FAST_TRAVEL_ARRIVALS } from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const streetsSrc = load('../components/3d/city/CityStreets.tsx');
const civicSrc = load('../components/3d/city/CivicFurnishingProps.tsx');
const tavernSrc = load('../components/3d/city/CityTavern.tsx');
const innSrc = load('../components/3d/city/CaravanseraiInn.tsx');
const forgeSrc = load('../components/3d/city/SmithingForge.tsx');
const doctoreSrc = load('../components/3d/city/DoctoreHouse.tsx');
const academySrc = load('../components/3d/city/GladiatorAcademy.tsx');
const archSrc = load('../components/3d/city/ClassicalArchitecture.tsx');
const foliageSrc = load('../components/3d/city/MediterraneanFoliage.tsx');
const avenueSrc = load('../components/3d/city/ProcessionAvenue.tsx');

// ── Tiny parsers (same style as phaseC8_18 / C-8.19 / C-8.21) ─────────────

function pair(src: string, re: RegExp): [number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`pair not found: ${re}`);
  return [Number(m[1]), Number(m[2])];
}
function triple(src: string, re: RegExp): [number, number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`triple not found: ${re}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function num(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m) throw new Error(`number not found: ${re}`);
  return Number(m[1]);
}
function all(src: string, re: RegExp): RegExpExecArray[] {
  return [...src.matchAll(re)];
}
/** The slice of a source between two anchors (component bodies, in order). */
function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  const j = src.indexOf(end);
  if (i < 0 || j < 0 || j <= i) throw new Error(`block not found: ${start} … ${end}`);
  return src.slice(i, j);
}
/** Numeric triple from the first `<group position={[ … ]}>` after `anchor`. */
function groupAfter(src: string, anchor: string): [number, number, number] {
  return triple(src, new RegExp(`${anchor}[\\s\\S]*?<group position=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\}>`));
}
function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ══════════════════════════════════════════════════════════════════════════
// A. The seven props, as the street layout declares them now
// ══════════════════════════════════════════════════════════════════════════

/** RomanBench placements in CityStreets, keyed by their yaw literal. */
const benchAt = (yaw: string, extra = '') =>
  triple(
    streetsSrc,
    new RegExp(`<RomanBench position=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\} rotationY=\\{${yaw}\\}${extra}`),
  );

const TAVERN_BENCH = benchAt('Math\\.PI \\/ 4');
const INN_BENCH = benchAt('-Math\\.PI \\/ 4');
const DOCTORE_BENCH = benchAt('-Math\\.PI \\/ 2', ' stoneColor=\\{ROMAN_PALETTE\\.travertine\\.color\\}');
const TAVERN_BENCH_YAW = Math.PI / 4;
const INN_BENCH_YAW = -Math.PI / 4;
const DOCTORE_BENCH_YAW = -Math.PI / 2;

/** WineBarrel placements in CityStreets: position, yaw and lying flag. */
const BARRELS = all(
  streetsSrc,
  /<WineBarrel position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}( isLyingDown=\{true\})? rotationY=\{([\d.]+)\} \/>/g,
).map((m) => ({
  pos: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
  lying: Boolean(m[4]),
  yaw: Number(m[5]),
}));
const TAVERN_BARREL_UPRIGHT = BARRELS.find((b) => !b.lying)!;
const TAVERN_BARREL_LYING = BARRELS.find((b) => b.lying && b.pos[0] < -10)!;

/** The Inn's 0.9-cube crate (the store's crate is 0.8). */
const INN_CRATE = all(
  streetsSrc,
  /<TimberCrate position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} size=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/g,
).find((m) => Number(m[4]) === 0.9)!;
const INN_CRATE_POS = [Number(INN_CRATE[1]), Number(INN_CRATE[2]), Number(INN_CRATE[3])] as [number, number, number];
const INN_CRATE_SIZE = [Number(INN_CRATE[4]), Number(INN_CRATE[5]), Number(INN_CRATE[6])] as [number, number, number];

const INN_AMPHORA_POS = triple(streetsSrc, /<RomanAmphora position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} scale=\{0\.85\} tone="terracotta"/);
const AMPHORA_SCALE = num(streetsSrc, /<RomanAmphora position=\{\[\s*[\d.]+,\s*[\d.]+,\s*[\d.]+\s*\]\} scale=\{([\d.]+)\} tone="terracotta"/);
const CLUSTER_POS = triple(streetsSrc, /<MerchantPropsCluster position=\{\[\s*([\d.]+),\s*(-?[\d.]+),\s*([\d.]+)\s*\]\} \/>/);
const OBELISK_POS = groupAfter(streetsSrc, 'Center Academy Monumental Obelisk');
const OBELISK_BASE_BOX = triple(streetsSrc, /Center Academy Monumental Obelisk[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const OBELISK_BASE_Y = num(streetsSrc, /Square Marble base plinth[\s\S]*?<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>/);
const OBELISK_SPIRE = triple(streetsSrc, /Tapered Obelisk Spire[\s\S]*?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*4\s*\]\}/);

/** The C-8.22 source comments (four: cluster, both forecourts, Doctore frontage). */
const c822Comments = all(streetsSrc, /Phase C-8\.22[\s\S]*?phaseC8_22\.test\.ts\. \*\//g).map((m) => m[0]);

describe('A. The layout declares the seven moved props', () => {
  test('the Tavern forecourt takes the outward, northward step', () => {
    expect(TAVERN_BENCH).toEqual([-13.8, 0, 8.4]);
    expect(TAVERN_BENCH_YAW).toBeCloseTo(Math.PI / 4, 10);
    expect(TAVERN_BARREL_UPRIGHT.pos).toEqual([-15.5, 0, 9.1]);
    expect(TAVERN_BARREL_UPRIGHT.yaw).toBe(0.3);
    expect(TAVERN_BARREL_LYING.pos).toEqual([-16.9, 0, 9.1]);
    expect(TAVERN_BARREL_LYING.yaw).toBe(0.5);
    for (const gone of [
      '<RomanBench position={[-13.0, 0, 11.2]}',
      '<WineBarrel position={[-13.8, 0, 10.2]}',
      '<WineBarrel position={[-14.4, 0, 10.5]}',
    ]) {
      expect(streetsSrc).not.toContain(gone);
    }
  });

  test('the Inn forecourt takes the mirrored step', () => {
    expect(INN_BENCH).toEqual([13.8, 0, 8.4]);
    expect(INN_BENCH_YAW).toBeCloseTo(-Math.PI / 4, 10);
    expect(INN_CRATE_POS).toEqual([15.5, 0, 9.1]);
    expect(INN_CRATE_SIZE).toEqual([0.9, 0.8, 0.9]);
    expect(INN_AMPHORA_POS).toEqual([16.9, 0, 9.1]);
    for (const gone of [
      '<RomanBench position={[13.0, 0, 11.2]}',
      '<TimberCrate position={[14.0, 0, 12.0]}',
      '<RomanAmphora position={[13.6, 0, 10.2]}',
    ]) {
      expect(streetsSrc).not.toContain(gone);
    }
  });

  test('the two forecourts stay mirrored, prop for prop', () => {
    expect(TAVERN_BENCH[0]).toBe(-INN_BENCH[0]);
    expect(TAVERN_BENCH[2]).toBe(INN_BENCH[2]);
    expect(TAVERN_BARREL_UPRIGHT.pos[0]).toBe(-INN_CRATE_POS[0]);
    expect(TAVERN_BARREL_UPRIGHT.pos[2]).toBe(INN_CRATE_POS[2]);
    expect(TAVERN_BARREL_LYING.pos[0]).toBe(-INN_AMPHORA_POS[0]);
    expect(TAVERN_BARREL_LYING.pos[2]).toBe(INN_AMPHORA_POS[2]);
    expect(TAVERN_BENCH_YAW).toBeCloseTo(-INN_BENCH_YAW, 10);
  });

  test('the forge cluster, the Doctore bench and the obelisk group move too', () => {
    expect(CLUSTER_POS).toEqual([11.9, 0, 5.2]);
    expect(DOCTORE_BENCH).toEqual([27.5, 0, -22]);
    expect(DOCTORE_BENCH_YAW).toBeCloseTo(-Math.PI / 2, 10);
    // Phase C-8.23: X stepped a further 0.10 west (25 → 24.9); the Z of the C-8.22
    // move is unchanged.
    expect(OBELISK_POS).toEqual([24.9, 0, -21.6]);
    expect(streetsSrc).not.toContain('<MerchantPropsCluster position={[13.2, 0, 3.8]} />');
    expect(streetsSrc).not.toContain('<RomanBench position={[27.5, 0, -21.0]}');
    expect(streetsSrc).not.toContain('<group position={[25, 0, -21]}>');
  });

  test('every move is documented in the source it changes', () => {
    expect(c822Comments.length).toBe(5);
    for (const c of c822Comments) expect(c).toContain('phaseC8_22.test.ts');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The props, rebuilt from the primitives that render them
// ══════════════════════════════════════════════════════════════════════════

interface Vec {
  x: number;
  y: number;
  z: number;
}
interface Obb {
  n: string;
  c: Vec;
  ax: [Vec, Vec, Vec];
  h: [number, number, number];
}
type Obj =
  | { kind: 'obb'; o: Obb }
  | { kind: 'cyl'; c: Vec; r: number; h: number }
  | { kind: 'bar'; p0: Vec; p1: Vec; r: number };
interface Piece {
  n: string;
  x: [number, number];
  y: [number, number];
  z: [number, number];
}

const rotY = (a: number) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
};
const column = (M: number[][], i: number): Vec => ({ x: M[0][i], y: M[1][i], z: M[2][i] });

/** A box at `lp` inside a group rooted at (x, z) and yawed about Y. */
function obb(rootX: number, rootZ: number, yaw: number, n: string, lp: [number, number, number], size: [number, number, number]): Obb {
  const R = rotY(yaw);
  return {
    n,
    c: { x: rootX + R[0][0] * lp[0] + R[0][2] * lp[2], y: lp[1], z: rootZ + R[2][0] * lp[0] + R[2][2] * lp[2] },
    ax: [column(R, 0), column(R, 1), column(R, 2)],
    h: [size[0] / 2, size[1] / 2, size[2] / 2],
  };
}
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Separating-axis test: ≥ 0 = separation, < 0 = penetration depth. */
function sat(A: Obb, B: Obb): number {
  const axes: Vec[] = [...A.ax, ...B.ax];
  for (const a of A.ax) {
    for (const b of B.ax) {
      const c = cross(a, b);
      const l = Math.hypot(c.x, c.y, c.z);
      if (l > 1e-6) axes.push({ x: c.x / l, y: c.y / l, z: c.z / l });
    }
  }
  const t = { x: B.c.x - A.c.x, y: B.c.y - A.c.y, z: B.c.z - A.c.z };
  let gap = -Infinity;
  let overlap = Infinity;
  for (const L of axes) {
    const ra = Math.abs(A.h[0] * dot(A.ax[0], L)) + Math.abs(A.h[1] * dot(A.ax[1], L)) + Math.abs(A.h[2] * dot(A.ax[2], L));
    const rb = Math.abs(B.h[0] * dot(B.ax[0], L)) + Math.abs(B.h[1] * dot(B.ax[1], L)) + Math.abs(B.h[2] * dot(B.ax[2], L));
    const ov = ra + rb - Math.abs(dot(t, L));
    if (ov <= 0) gap = Math.max(gap, -ov);
    else overlap = Math.min(overlap, ov);
  }
  return gap > -Infinity ? gap : -overlap;
}

/**
 * Distance between an OBB and a cylinder axis segment, minus the radius.
 *
 * Phase C-8.27 correction.  The previous version took the OBB's *local*
 * half-extents and used them as world-axis half-extents (via `asBox`), which
 * is only valid for an axis-aligned box.  The yawed benches are not
 * axis-aligned: `RomanBench` yawed ±π/4 turns its 2.0 × 0.65 seat into a
 * 1.873 × 1.873 world footprint, and the Doctore bench's −π/2 yaw swaps the
 * extents outright (2.0 along Z, 0.65 along X).  The stand-in was therefore
 * neither the true clearance nor a consistent bound of it — it understated
 * the X-extent clearance and, where the nearest feature lies along local Z,
 * could overstate it (exactly the direction that must never happen in a
 * collision audit).
 *
 * Measuring the segment in the OBB's own frame fixes that: there the box is
 * axis-aligned, and because a rigid transform preserves distances the same
 * point-to-box test is exact.  For an axis-aligned OBB the local frame *is*
 * the world frame, so every building-pair result below is bit-for-bit
 * unchanged; only the rotated-bench pairs move.
 *
 * The cylinder is a world-vertical axis segment, so the value returned is
 * `distance(segment, box) − r`.  Every point of the solid cylinder lies
 * within `r` of some axis point, hence
 * `distance(cylinder, box) ≥ distance(segment, box) − r`: this figure can
 * understate a real gap but can never overstate one, and the sampling
 * (N = 400 along the segment) is the same discretisation the original used.
 */
function segObbClearance(p0: Vec, p1: Vec, r: number, o: Obb): number {
  // World point → the OBB's local frame (the box's own axes, centred on c).
  const toLocal = (p: Vec): Vec => {
    const d = { x: p.x - o.c.x, y: p.y - o.c.y, z: p.z - o.c.z };
    return { x: dot(d, o.ax[0]), y: dot(d, o.ax[1]), z: dot(d, o.ax[2]) };
  };
  const a = toLocal(p0);
  const b = toLocal(p1);
  let best = Infinity;
  const N = 400;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    const pz = a.z + (b.z - a.z) * t;
    const inside = Math.abs(px) <= o.h[0] && Math.abs(py) <= o.h[1] && Math.abs(pz) <= o.h[2];
    const d = inside
      ? -Math.min(o.h[0] - Math.abs(px), o.h[1] - Math.abs(py), o.h[2] - Math.abs(pz))
      : Math.hypot(
          Math.max(Math.abs(px) - o.h[0], 0),
          Math.max(Math.abs(py) - o.h[1], 0),
          Math.max(Math.abs(pz) - o.h[2], 0),
        );
    if (d < best) best = d;
  }
  return best - r;
}

/** Shortest distance between two segments (the cylinder-axis comparison). */
function segSegDist(p1: Vec, q1: Vec, p2: Vec, q2: Vec): number {
  const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const EPS = 1e-9;
  let s = 0;
  let t = 0;
  if (a <= EPS && e <= EPS) return Math.hypot(r.x, r.y, r.z);
  if (a <= EPS) t = Math.max(0, Math.min(1, f / e));
  else {
    const c = dot(d1, r);
    if (e <= EPS) s = Math.max(0, Math.min(1, -c / a));
    else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }
  const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s };
  const c2 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t };
  return Math.hypot(c1.x - c2.x, c1.y - c2.y, c1.z - c2.z);
}

/** A world-AABB piece as an OBB (its own axes are the world axes). */
const asObb = (p: Piece): Obb => ({
  n: p.n,
  c: { x: (p.x[0] + p.x[1]) / 2, y: (p.y[0] + p.y[1]) / 2, z: (p.z[0] + p.z[1]) / 2 },
  ax: [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ],
  h: [(p.x[1] - p.x[0]) / 2, (p.y[1] - p.y[0]) / 2, (p.z[1] - p.z[0]) / 2],
});
function clearance(a: Obj, b: Obj): number {
  if (a.kind === 'obb' && b.kind === 'obb') return sat(a.o, b.o);
  if (a.kind === 'cyl' && b.kind === 'obb') {
    return segObbClearance({ x: a.c.x, y: a.c.y - a.h / 2, z: a.c.z }, { x: a.c.x, y: a.c.y + a.h / 2, z: a.c.z }, a.r, b.o);
  }
  if (a.kind === 'obb' && b.kind === 'cyl') return clearance(b, a);
  if (a.kind === 'cyl' && b.kind === 'cyl') return Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y, a.c.z - b.c.z) - a.r - b.r;
  if (a.kind === 'bar' && b.kind === 'obb') return segObbClearance(a.p0, a.p1, a.r, b.o);
  if (a.kind === 'bar' && b.kind === 'cyl') {
    const d = segSegDist(a.p0, a.p1, { x: b.c.x, y: b.c.y - b.h / 2, z: b.c.z }, { x: b.c.x, y: b.c.y + b.h / 2, z: b.c.z });
    return d - a.r - b.r;
  }
  if (a.kind === 'bar' && b.kind === 'bar') return segSegDist(a.p0, a.p1, b.p0, b.p1) - a.r - b.r;
  if (a.kind === 'cyl' && b.kind === 'bar') return clearance(b, a);
  if (a.kind === 'obb' && b.kind === 'bar') return clearance(b, a);
  throw new Error('unhandled pair');
}

type Prop = { n: string; o: Obj };

/** Clearance between every prop and every target; composite parts stay internal. */
function pairs(props: Prop[], targets: Prop[]): Array<{ pair: string; c: number }> {
  const same = targets === props;
  const rows: Array<{ pair: string; c: number }> = [];
  for (let i = 0; i < props.length; i++) {
    for (let j = i + 1; j < props.length; j++) {
      if (props[i].n.split('.')[0] === props[j].n.split('.')[0]) continue; // one composite prop
      rows.push({ pair: `${props[i].n} ↔ ${props[j].n}`, c: clearance(props[i].o, props[j].o) });
    }
    if (same) continue;
    for (const t of targets) {
      if (props.some((p) => p.o === t.o)) continue; // a target that is also a prop
      rows.push({ pair: `${props[i].n} ↔ ${t.n}`, c: clearance(props[i].o, t.o) });
    }
  }
  return rows.sort((a, b) => a.c - b.c);
}
const worst = (rows: Array<{ pair: string; c: number }>) =>
  rows.reduce((a, b) => (b.c < a.c ? b : a), { pair: '', c: Infinity });
const at = (rows: Array<{ pair: string; c: number }>, name: string) => {
  const row = rows.find((r) => r.pair === name);
  if (!row) throw new Error(`pair not evaluated: ${name}`);
  return row.c;
};

// ── CivicFurnishingProps.RomanBench, part by part ─────────────────────────

const BENCH_SRC = block(civicSrc, 'export const RomanBench', 'export const RomanAmphora');
const BENCH_LEG_X = pair(BENCH_SRC, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(lx, li\)/);
/** The leg's three stacked boxes, then the seat slab: `[y, w, h, d]`. */
const BENCH_BOXES = all(
  BENCH_SRC,
  /<mesh castShadow receiveShadow position=\{\[\s*0,\s*([\d.]+),\s*0\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/g,
).map((m) => m.slice(1).map(Number));
const BENCH_FOOT = BENCH_BOXES[0];
const BENCH_STANCHION = BENCH_BOXES[1];
const BENCH_CAPITAL = BENCH_BOXES[2];
const BENCH_SEAT = BENCH_BOXES[3];

function benchParts(n: string, x: number, z: number, yaw: number): Prop[] {
  const out: Prop[] = [];
  for (const [i, lx] of BENCH_LEG_X.entries()) {
    for (const [what, box] of [['foot', BENCH_FOOT], ['stanchion', BENCH_STANCHION], ['capital', BENCH_CAPITAL]] as Array<[string, number[]]>) {
      out.push({ n: `${n}.${what}${i}`, o: { kind: 'obb', o: obb(x, z, yaw, `${n}.${what}${i}`, [lx, box[0], 0], [box[1], box[2], box[3]]) } });
    }
  }
  out.push({ n: `${n}.seat`, o: { kind: 'obb', o: obb(x, z, yaw, `${n}.seat`, [0, BENCH_SEAT[0], 0], [BENCH_SEAT[1], BENCH_SEAT[2], BENCH_SEAT[3]]) } });
  return out;
}

// ── WineBarrel, crate, amphora, cluster, obelisk ─────────────────────────

const BARREL_SRC = block(civicSrc, 'export const WineBarrel', 'export const TabulaNoticeBoard');
const CRATE_SRC = block(civicSrc, 'export const TimberCrate', 'export const WineBarrel');
const AMPHORA_SRC = block(civicSrc, 'export const RomanAmphora', 'export const TimberCrate');

const BARREL_BODY = triple(BARREL_SRC, /<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\} \/>/);
const BARREL_R = Math.max(BARREL_BODY[0], BARREL_BODY[1]);
const BARREL_H = BARREL_BODY[2];
const BARREL_Y = pair(BARREL_SRC, /const yOffset = isLyingDown \? ([\d.]+) : ([\d.]+);/);
const BARREL_Y_LYING = BARREL_Y[0];
const BARREL_Y_UP = BARREL_Y[1];

const AMPHORA_BELLY_R = num(AMPHORA_SRC, /<sphereGeometry args=\{\[\s*([\d.]+),\s*\d+,\s*\d+\s*\]\} \/>/);
const AMPHORA_RIM = pair(AMPHORA_SRC, /position=\{\[0,\s*([\d.]+),\s*0\]\}>\s*<torusGeometry args=\{\[\s*[\d.]+,\s*([\d.]+)/);
const AMPHORA_TOP = AMPHORA_RIM[0] + AMPHORA_RIM[1];

/** CityStreets' own MerchantPropsCluster: three pots in one group. */
const CLUSTER_SRC = block(streetsSrc, 'const MerchantPropsCluster', 'export const CityStreets');
const CLUSTER_POTS = all(
  CLUSTER_SRC,
  /<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*([\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\} \/>/g,
).map((m) => ({
  lp: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
  r: Math.max(Number(m[4]), Number(m[5])),
  h: Number(m[6]),
}));
const CLUSTER_LABELS = ['barrelA', 'barrelB', 'amphora'];
const clusterPots = (x: number, z: number): Prop[] =>
  CLUSTER_POTS.map((p, i) => ({
    n: `cluster.${CLUSTER_LABELS[i]}`,
    o: { kind: 'cyl', c: { x: x + p.lp[0], y: p.lp[1], z: z + p.lp[2] }, r: p.r, h: p.h },
  }));

/**
 * A lying WineBarrel as its true horizontal axis: `rotation=[0, yaw, π/2]` maps
 * the cylinder's local +Y onto `(−cos yaw, 0, sin yaw)`, and the body spans half
 * its height along that direction at `yOffset` (0.38).
 */
function lyingBarrel(pos: [number, number, number], yaw: number): Obj {
  const u = { x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) };
  const half = BARREL_H / 2;
  const cy = pos[1] + BARREL_Y_LYING;
  return {
    kind: 'bar',
    p0: { x: pos[0] - u.x * half, y: cy, z: pos[2] - u.z * half },
    p1: { x: pos[0] + u.x * half, y: cy, z: pos[2] + u.z * half },
    r: BARREL_R,
  };
}
const uprightBarrel = (pos: [number, number, number]): Obj => ({
  kind: 'cyl',
  c: { x: pos[0], y: pos[1] + BARREL_Y_UP, z: pos[2] },
  r: BARREL_R,
  h: BARREL_H,
});
const amphoraObj = (pos: [number, number, number], scale: number): Obj => ({
  kind: 'cyl',
  c: { x: pos[0], y: (pos[1] + AMPHORA_TOP / 2) * scale, z: pos[2] },
  r: AMPHORA_BELLY_R * scale,
  h: AMPHORA_TOP * scale,
});
const crateObj = (pos: [number, number, number], size: [number, number, number]): Obj => ({
  kind: 'obb',
  o: obb(pos[0], pos[2], 0, 'crate', [0, size[1] / 2, 0], size),
});

const OBELISK_BASE = (x: number, z: number): Piece => ({
  n: 'obelisk.base',
  x: [x - OBELISK_BASE_BOX[0] / 2, x + OBELISK_BASE_BOX[0] / 2],
  y: [0, OBELISK_BASE_Y * 2],
  z: [z - OBELISK_BASE_BOX[2] / 2, z + OBELISK_BASE_BOX[2] / 2],
});
/** The 4-sided spire is yawed π/4, which puts its vertices on ±X/±Z: half = 0.28. */
const OBELISK_SPIRE_PIECE = (x: number, z: number, y: number): Piece => ({
  n: 'obelisk.spire',
  x: [x - OBELISK_SPIRE[1], x + OBELISK_SPIRE[1]],
  y: [y - OBELISK_SPIRE[2] / 2, y + OBELISK_SPIRE[2] / 2],
  z: [z - OBELISK_SPIRE[1], z + OBELISK_SPIRE[1]],
});
const OBELISK_SPIRE_Y = num(streetsSrc, /Tapered Obelisk Spire[\s\S]*?<mesh castShadow position=\{\[0, ([\d.]+), 0\]\}/);

// ── Buildings (the shared primitives' documented geometry) ───────────────

interface BuildingSpec {
  root: [number, number, number];
  foundation: [number, number];
  projection: number;
  wall: { y: number; args: [number, number, number] };
  cornices: Array<{ size: [number, number]; y: number; height: number; projection: number }>;
  quoin: { buildingSize: [number, number]; height: number };
  roof: { width: number; depth: number; height: number; overhang: number; pos: [number, number, number] };
}

function specOf(src: string): BuildingSpec {
  return {
    root: triple(src, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED TRAVERTINE/),
    foundation: pair(src, /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/),
    projection: num(src, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/),
    wall: {
      y: num(src, /<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>/),
      args: triple(src, /<mesh castShadow receiveShadow position=\{\[\s*0,\s*[\d.]+,\s*0\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/),
    },
    cornices: all(src, /<WallCornice\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}\s+y=\{([\d.]+)\}[\s\S]*?height=\{([\d.]+)\}[\s\S]*?projection=\{([\d.]+)\}/g).map((m) => ({
      size: [Number(m[1]), Number(m[2])] as [number, number],
      y: Number(m[3]),
      height: Number(m[4]),
      projection: Number(m[5]),
    })),
    quoin: {
      buildingSize: pair(src, /<CornerQuoins\s+height=\{[\d.]+\}\s+buildingSize=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/),
      height: num(src, /<CornerQuoins\s+height=\{([\d.]+)\}/),
    },
    roof: {
      width: num(src, /<RomanGabledRoof[\s\S]*?width=\{([\d.]+)\}/),
      depth: num(src, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
      height: num(src, /<RomanGabledRoof[\s\S]*?height=\{([\d.]+)\}/),
      overhang: num(src, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
      pos: triple(src, /<RomanGabledRoof[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/),
    },
  };
}

const QUOIN_QX = pair(archSrc, /const qx = isLong \? ([\d.]+) : ([\d.]+);/);
const QUOIN_QZ = pair(archSrc, /const qz = isLong \? ([\d.]+) : ([\d.]+);/);
const TILE_THICKNESS = num(archSrc, /const tileThickness = ([\d.]+);/);

/** Every rendered box of a building, world AABB (all five building yaws are 0). */
function buildingPieces(spec: BuildingSpec): Piece[] {
  const [rx, , rz] = spec.root;
  const [fw, fd] = spec.foundation;
  const proj = spec.projection;
  const [ww, wh, wd] = spec.wall.args;
  const out: Piece[] = [];
  const lowerH = 0.3 * 0.45;
  out.push({ n: 'plinth.lower', x: [rx - fw / 2 - proj, rx + fw / 2 + proj], y: [0, lowerH], z: [rz - fd / 2 - proj, rz + fd / 2 + proj] });
  out.push({ n: 'plinth.upper', x: [rx - fw / 2 - proj * 0.6, rx + fw / 2 + proj * 0.6], y: [lowerH, 0.3], z: [rz - fd / 2 - proj * 0.6, rz + fd / 2 + proj * 0.6] });
  out.push({ n: 'wall', x: [rx - ww / 2, rx + ww / 2], y: [spec.wall.y - wh / 2, spec.wall.y + wh / 2], z: [rz - wd / 2, rz + wd / 2] });
  const qHalf = Math.max(...QUOIN_QX, ...QUOIN_QZ) / 2;
  const quoinZ: [number, number] = [rz - spec.quoin.buildingSize[1] / 2 - qHalf, rz - spec.quoin.buildingSize[1] / 2 + qHalf];
  for (const [n, qcx] of [['quoins.west', rx - spec.quoin.buildingSize[0] / 2], ['quoins.east', rx + spec.quoin.buildingSize[0] / 2]] as Array<[string, number]>) {
    out.push({ n, x: [qcx - qHalf, qcx + qHalf], y: [0, spec.quoin.height], z: quoinZ });
  }
  for (const c of spec.cornices) {
    const [cw, cd] = c.size;
    const p = c.projection;
    const yb: [number, number] = [c.y - c.height / 2, c.y + c.height / 2];
    out.push({ n: `cornice.y${c.y}.front`, x: [rx - cw / 2 - p, rx + cw / 2 + p], y: yb, z: [rz + cd / 2, rz + cd / 2 + p] });
    out.push({ n: `cornice.y${c.y}.rear`, x: [rx - cw / 2 - p, rx + cw / 2 + p], y: yb, z: [rz - cd / 2 - p, rz - cd / 2] });
    out.push({ n: `cornice.y${c.y}.left`, x: [rx - cw / 2 - p, rx - cw / 2], y: yb, z: [rz - cd / 2, rz + cd / 2] });
    out.push({ n: `cornice.y${c.y}.right`, x: [rx + cw / 2, rx + cw / 2 + p], y: yb, z: [rz - cd / 2, rz + cd / 2] });
  }
  const r = spec.roof;
  const halfSpan = r.width / 2 + r.overhang;
  const fullLength = r.depth + r.overhang * 2;
  const slope = Math.atan2(r.height, halfSpan);
  const rafter = Math.hypot(halfSpan, r.height);
  const baseY = r.pos[1];
  out.push({ n: 'roof.fascia', x: [rx - (r.width + r.overhang * 1.2) / 2, rx + (r.width + r.overhang * 1.2) / 2], y: [baseY - 0.16, baseY], z: [rz - (r.depth + r.overhang * 1.2) / 2, rz + (r.depth + r.overhang * 1.2) / 2] });
  const slabAlong = (rafter / 2) * Math.cos(slope) + (TILE_THICKNESS / 2) * Math.sin(slope);
  const slabAcross = (rafter / 2) * Math.sin(slope) + (TILE_THICKNESS / 2) * Math.cos(slope);
  const tileY = baseY + r.height / 2 + 0.04;
  const tileYBand: [number, number] = [tileY - slabAcross, tileY + slabAcross];
  const tileZ: [number, number] = [rz - fullLength / 2, rz + fullLength / 2];
  for (const [n, tx] of [['roof.tile.west', rx - halfSpan / 2], ['roof.tile.east', rx + halfSpan / 2]] as Array<[string, number]>) {
    out.push({ n, x: [tx - slabAlong, tx + slabAlong], y: tileYBand, z: tileZ });
  }
  out.push({ n: 'roof.ridge', x: [rx - 0.16, rx + 0.16], y: [baseY + r.height + 0.02, baseY + r.height + TILE_THICKNESS + 0.11], z: [rz - fullLength / 2 - 0.04, rz + fullLength / 2 + 0.04] });
  out.push({ n: 'roof.tympanum', x: [rx - r.width / 2, rx + r.width / 2], y: [baseY, baseY + r.height], z: [rz - r.depth / 2 - 0.02, rz - r.depth / 2 + 0.02] });
  return out;
}
const asObjs = (ps: Piece[], prefix = ''): Prop[] => ps.map((p) => ({ n: prefix + p.n, o: { kind: 'obb', o: asObb({ ...p, n: prefix + p.n }) } }));

const TAVERN_PIECES = asObjs(buildingPieces(specOf(tavernSrc)));
const INN_PIECES = asObjs(buildingPieces(specOf(innSrc)));
const FORGE_PIECES = asObjs(buildingPieces(specOf(forgeSrc)));
const DOCTORE_PIECES = asObjs(buildingPieces(specOf(doctoreSrc)));
const ACADEMY_PIECES = asObjs(buildingPieces(specOf(academySrc)), 'academy.');

// ── The C-8.21 cypress (planter + trunk; every moved prop is below the crown) ─

const CYP_SCALE = num(avenueSrc, /ItalianCypress[\s\S]*?scale=\{([\d.]+)\}/);
const CYP_X = pair(avenueSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(px, pi\)/);
const CYP_Z = triple(avenueSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(pz, zi\)/);
const CYP_CYLS = all(foliageSrc, /position=\{\[0,\s*([\d.]+),\s*0\]\}>\s*<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\} \/>/g).map((m) => ({
  y: Number(m[1]),
  rTop: Number(m[2]),
  rBottom: Number(m[3]),
  h: Number(m[4]),
}));
const CYP_PLANTER = CYP_CYLS[0];
const CYP_TRUNK = CYP_CYLS[2];
const cypress = (pi: number) => ({
  planter: { n: 'cypress.planter', o: { kind: 'cyl', c: { x: CYP_X[pi], y: (CYP_PLANTER.y) * CYP_SCALE, z: CYP_Z[1] }, r: CYP_PLANTER.rBottom * CYP_SCALE, h: CYP_PLANTER.h * CYP_SCALE } as Obj },
  trunk: { n: 'cypress.trunk', o: { kind: 'cyl', c: { x: CYP_X[pi], y: CYP_TRUNK.y * CYP_SCALE, z: CYP_Z[1] }, r: CYP_TRUNK.rBottom * CYP_SCALE, h: CYP_TRUNK.h * CYP_SCALE } as Obj },
});

// ── Street furniture the props share the ground with ─────────────────────

const CURB_Z = pair(streetsSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(cz, ci\)/);
const CURB_SIZE = pair(streetsSrc, /<boxGeometry args=\{\[\s*14,\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>/);
const CURBS: Prop[] = CURB_Z.map((cz, i) => ({ n: `curb${i}`, o: { kind: 'obb', o: obb(11, cz, 0, `curb${i}`, [0, 0.08, 0], [14, CURB_SIZE[0], CURB_SIZE[1]]) } }));
const AVENUE_KERBS: Prop[] = pair(avenueSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(cx, ci\)/).map((cx, i) => ({
  n: `avenueKerb${i}`,
  o: { kind: 'obb', o: obb(cx, 10, 0, `avenueKerb${i}`, [0, 0.1, 0], [0.6, 0.2, 21]) },
}));
const EAST_FURNITURE: Prop[] = [
  { n: 'bench.east', o: { kind: 'obb', o: obb(12.5, -3.8, -Math.PI / 2, 'bench.east', [0, BENCH_SEAT[0], 0], [BENCH_SEAT[1], BENCH_SEAT[2], BENCH_SEAT[3]]) } },
  { n: 'storeCrate', o: crateObj([17.5, 0, -6], [0.8, 0.7, 0.8]) },
  { n: 'storeAmphora', o: amphoraObj([18, 0, -3.5], 0.8) },
  ...all(streetsSrc, /<StreetLamp position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} \/>/g).map((m, i) => ({
    n: `lamp${i}`,
    o: { kind: 'obb', o: obb(Number(m[1]), Number(m[3]), 0, `lamp${i}`, [0, 1.3, 0], [0.84, 2.6, 0.84]) } as Obj,
  })),
];

/** The Inn's own frontage furniture (chest, brazier, entrance columns). */
const INN_FRONTAGE: Prop[] = (() => {
  const chestGroup = groupAfter(innSrc, 'ENTRANCE RESTING BENCH & LUGGAGE CHEST');
  const chestY = num(innSrc, /ENTRANCE RESTING BENCH & LUGGAGE CHEST[\s\S]*?<mesh castShadow position=\{\[0, ([\d.]+), 0\]\}>/);
  const chestBox = triple(innSrc, /ENTRANCE RESTING BENCH & LUGGAGE CHEST[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
  const brazierGroup = groupAfter(innSrc, 'WELCOMING INN BRAZIER');
  const brazierCyl = triple(innSrc, /WELCOMING INN BRAZIER[\s\S]*?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\}/);
  const brazierY = num(innSrc, /WELCOMING INN BRAZIER[\s\S]*?<mesh castShadow position=\{\[0, ([\d.]+), 0\]\}>/);
  const portico = groupAfter(innSrc, 'Colonnade Arched Portico');
  const colX = num(innSrc, /<ClassicalColumn[\s\S]*?position=\{\[(-?[\d.]+),\s*0,\s*cz\]\}/);
  const colCz = pair(innSrc, /Flanking Entrance Columns[\s\S]*?\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(cz, ci\)/);
  const colR = num(innSrc, /<ClassicalColumn[\s\S]*?radius=\{([\d.]+)\}/);
  const colH = num(innSrc, /<ClassicalColumn[\s\S]*?height=\{([\d.]+)\}/);
  const root = specOf(innSrc).root;
  return [
    {
      n: 'inn.chest',
      o: { kind: 'obb', o: obb(root[0] + chestGroup[0], root[2] + chestGroup[2], 0, 'inn.chest', [0, chestY, 0], chestBox) },
    },
    {
      n: 'inn.brazier',
      o: { kind: 'cyl', c: { x: root[0] + brazierGroup[0], y: brazierY, z: root[2] + brazierGroup[2] }, r: brazierCyl[0], h: brazierCyl[2] },
    },
    ...colCz.map((cz, i) => ({
      n: `inn.column${i}`,
      o: { kind: 'obb', o: obb(root[0] + portico[0] + colX, root[2] + cz, 0, `inn.column${i}`, [0, colH / 2, 0], [colR * 2.6, colH, colR * 2.6]) } as Obj,
    })),
  ];
})();

/** The Doctore House's own practice-lane props plus the Academy envelope. */
const DOCTORE_NEIGHBOURS: Prop[] = (() => {
  const root = specOf(doctoreSrc).root;
  const rackGroup = groupAfter(doctoreSrc, 'Wooden Rack Bench');
  const rackBox = triple(doctoreSrc, /Wooden Rack Bench[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
  const rackY = num(doctoreSrc, /Wooden Rack Bench[\s\S]*?<mesh castShadow position=\{\[0, ([\d.]+), 0\]\}>/);
  const dummyGroup = groupAfter(doctoreSrc, 'STRAW PRACTICE TARGET');
  const dummyR = num(doctoreSrc, /STRAW PRACTICE TARGET[\s\S]*?<cylinderGeometry args=\{\[\s*([\d.]+),/);
  return [
    { n: 'rack', o: { kind: 'obb', o: obb(root[0] + rackGroup[0], root[2] + rackGroup[2], 0, 'rack', [0, rackY, 0], rackBox) } },
    { n: 'dummy', o: { kind: 'obb', o: obb(root[0] + dummyGroup[0], root[2] + dummyGroup[2], 0, 'dummy', [0, 0.8, 0], [dummyR * 2, 1.6, dummyR * 2]) } },
    ...ACADEMY_PIECES,
  ];
})();

// ── The moved props, at the positions the sources declare ────────────────

const tavernProps = (): Prop[] => [
  ...benchParts('bench', TAVERN_BENCH[0], TAVERN_BENCH[2], TAVERN_BENCH_YAW),
  { n: 'barrelUpright', o: uprightBarrel(TAVERN_BARREL_UPRIGHT.pos) },
  { n: 'barrelLying', o: lyingBarrel(TAVERN_BARREL_LYING.pos, TAVERN_BARREL_LYING.yaw) },
];
const innProps = (): Prop[] => [
  ...benchParts('bench', INN_BENCH[0], INN_BENCH[2], INN_BENCH_YAW),
  { n: 'crate', o: crateObj(INN_CRATE_POS, INN_CRATE_SIZE) },
  { n: 'amphora', o: amphoraObj(INN_AMPHORA_POS, AMPHORA_SCALE) },
];
const forgeCluster = (): Prop[] => clusterPots(CLUSTER_POS[0], CLUSTER_POS[2]);
const doctoreProps = (): Prop[] => [
  ...benchParts('bench', DOCTORE_BENCH[0], DOCTORE_BENCH[2], DOCTORE_BENCH_YAW),
  { n: 'obelisk.base', o: { kind: 'obb', o: asObb(OBELISK_BASE(OBELISK_POS[0], OBELISK_POS[2])) } },
  { n: 'obelisk.spire', o: { kind: 'obb', o: asObb(OBELISK_SPIRE_PIECE(OBELISK_POS[0], OBELISK_POS[2], OBELISK_SPIRE_Y)) } },
];

// ══════════════════════════════════════════════════════════════════════════
// C. The props and the model reproduce their sources
// ══════════════════════════════════════════════════════════════════════════

describe('B. The props are re-derived from their primitives', () => {
  test('RomanBench is a 2.0 × 0.65 seat on two profiled legs at ±0.8', () => {
    expect(BENCH_LEG_X).toEqual([-0.8, 0.8]);
    expect(BENCH_FOOT).toEqual([0.08, 0.34, 0.16, 0.58]);
    expect(BENCH_STANCHION).toEqual([0.28, 0.24, 0.26, 0.44]);
    expect(BENCH_CAPITAL).toEqual([0.44, 0.3, 0.08, 0.52]);
    expect(BENCH_SEAT).toEqual([0.52, 2.0, 0.1, 0.65]);
    // Yawed ±45°, the seat's local (1.0, 0.325) half-extents project to 0.9369 on
    // both world axes — the footprint the audit's AABB was based on.
    expect(1.0 * Math.cos(Math.PI / 4) + 0.325 * Math.sin(Math.PI / 4)).toBeCloseTo(0.9369, 4);
    const seat = benchParts('bench', 0, 0, Math.PI / 4).find((p) => p.n === 'bench.seat')!.o;
    expect(seat.kind === 'obb' && seat.o.h[0]).toBeCloseTo(1.0, 10);
    expect(seat.kind === 'obb' && seat.o.h[2]).toBeCloseTo(0.325, 10);
  });

  test('WineBarrel is r 0.38 × 0.9, at yOffset 0.45 or 0.38 lying', () => {
    expect(BARREL_R).toBe(0.38);
    expect(BARREL_H).toBe(0.9);
    expect(BARREL_Y_UP).toBe(0.45);
    expect(BARREL_Y_LYING).toBe(0.38);
    expect(BARREL_SRC).toContain('? [0, rotationY, Math.PI / 2]');
  });

  test('RomanAmphora, TimberCrate and the obelisk carry their stated sizes', () => {
    expect(AMPHORA_BELLY_R).toBe(0.26);
    expect(AMPHORA_TOP).toBeCloseTo(0.935, 10);
    expect(AMPHORA_SCALE).toBe(0.85);
    expect(INN_CRATE_SIZE).toEqual([0.9, 0.8, 0.9]);
    expect(CRATE_SRC).toContain('<mesh castShadow receiveShadow position={[0, h / 2, 0]}>');
    expect(OBELISK_BASE_BOX).toEqual([0.9, 0.4, 0.9]);
    expect(OBELISK_SPIRE).toEqual([0.15, 0.28, 2.0]);
    expect(streetsSrc).toContain('rotation={[0, Math.PI / 4, 0]}');
  });

  test('the cluster is three pots spanning 1.40 × 1.04 and 0.9 tall', () => {
    expect(CLUSTER_POTS.map((p) => [p.r, p.h])).toEqual([
      [0.38, 0.9],
      [0.32, 0.8],
      [0.22, 0.7],
    ]);
    const pots = CLUSTER_POTS;
    expect(Math.min(...pots.map((p) => p.lp[0] - p.r))).toBeCloseTo(-0.78, 10);
    expect(Math.max(...pots.map((p) => p.lp[0] + p.r))).toBeCloseTo(0.62, 10);
    expect(Math.min(...pots.map((p) => p.lp[2] - p.r))).toBeCloseTo(-0.52, 10);
    expect(Math.max(...pots.map((p) => p.lp[2] + p.r))).toBeCloseTo(0.52, 10);
  });

  test('the cypress planter and trunk come from the foliage primitive', () => {
    expect(CYP_X).toEqual([-11.5, 11.5]);
    expect(CYP_Z).toEqual([-7.5, 8.55, 20]);
    expect(CYP_SCALE).toBe(1.05);
    expect(CYP_PLANTER.rBottom * CYP_SCALE).toBeCloseTo(0.8925, 10);
    expect(CYP_TRUNK.rBottom * CYP_SCALE).toBeCloseTo(0.294, 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The audited intersections reproduce at the pre-C-8.22 transforms
// ══════════════════════════════════════════════════════════════════════════

describe('C. The audited intersections reproduce at the old transforms', () => {
  const oldTavern = (): Prop[] => [
    ...benchParts('bench', -13.0, 11.2, Math.PI / 4),
    { n: 'barrelUpright', o: uprightBarrel([-13.8, 0, 10.2]) },
    { n: 'barrelLying', o: lyingBarrel([-14.4, 0, 10.5], 0.5) },
  ];
  const oldInn = (): Prop[] => [
    ...benchParts('bench', 13.0, 11.2, -Math.PI / 4),
    { n: 'crate', o: crateObj([14.0, 0, 12.0], [0.9, 0.8, 0.9]) },
    { n: 'amphora', o: amphoraObj([13.6, 0, 10.2], 0.85) },
  ];
  const oldDoctore = (): Prop[] => [
    ...benchParts('bench', 27.5, -21.0, -Math.PI / 2),
    { n: 'obelisk.base', o: { kind: 'obb', o: asObb(OBELISK_BASE(25, -21)) } },
    { n: 'obelisk.spire', o: { kind: 'obb', o: asObb(OBELISK_SPIRE_PIECE(25, -21, OBELISK_SPIRE_Y)) } },
  ];

  test('the Tavern bench and both barrels sat inside the Tavern', () => {
    const props = oldTavern();
    const rows = pairs(props, TAVERN_PIECES);
    expect(at(rows, 'barrelLying ↔ wall')).toBeCloseTo(-0.6957, 4);
    expect(at(rows, 'bench.seat ↔ wall')).toBeCloseTo(-0.57, 4);
    expect(at(rows, 'bench.capital0 ↔ wall')).toBeCloseTo(-0.48, 4);
    expect(at(rows, 'barrelUpright ↔ plinth.lower')).toBeCloseTo(-0.43, 4);
    expect(at(rows, 'barrelUpright ↔ plinth.upper')).toBeCloseTo(-0.33, 4);
    expect(at(rows, 'barrelLying ↔ plinth.upper')).toBeCloseTo(-0.3, 4);
    expect(rows.filter((r) => r.c < 0).length).toBeGreaterThanOrEqual(14);
    // …and the two barrels interpenetrated each other.
    expect(at(pairs(props, props), 'barrelUpright ↔ barrelLying')).toBeCloseTo(-0.5383, 4);
  });

  test('the Inn crate was buried 0.80 in the wall and the bench/crate overlapped', () => {
    const props = oldInn();
    const rows = pairs(props, INN_PIECES);
    expect(at(rows, 'crate ↔ wall')).toBeCloseTo(-0.8, 4);
    expect(at(rows, 'bench.seat ↔ wall')).toBeCloseTo(-0.57, 4);
    expect(at(rows, 'amphora ↔ plinth.upper')).toBeCloseTo(-0.3026, 3);
    expect(at(rows, 'crate ↔ plinth.upper')).toBeCloseTo(-0.3, 4);
    expect(at(rows, 'bench.capital0 ↔ wall')).toBeCloseTo(-0.48, 4);
    expect(rows.filter((r) => r.c < 0).length).toBeGreaterThanOrEqual(16);
    expect(at(pairs(props, props), 'bench.seat ↔ crate')).toBeCloseTo(-0.33, 4);
  });

  test('the forge cluster reached into the wall, the plinth and the north kerb', () => {
    const rows = pairs(clusterPots(13.2, 3.8), [...FORGE_PIECES, ...CURBS]);
    expect(at(rows, 'cluster.barrelB ↔ wall')).toBeCloseTo(-0.57, 4);
    expect(at(rows, 'cluster.barrelB ↔ plinth.upper')).toBeCloseTo(-0.402, 4);
    expect(at(rows, 'cluster.barrelB ↔ plinth.lower')).toBeCloseTo(-0.387, 4);
    expect(at(rows, 'cluster.amphora ↔ wall')).toBeCloseTo(-0.27, 4);
    expect(at(rows, 'cluster.barrelB ↔ curb1')).toBeCloseTo(-0.4, 4);
    expect(at(rows, 'cluster.barrelA ↔ curb1')).toBeCloseTo(-0.28, 4);
    expect(rows.filter((r) => r.c < 0).length).toBeGreaterThanOrEqual(9);
  });

  test('the Doctore bench and the obelisk base reached into the house', () => {
    const rows = pairs(oldDoctore(), [...DOCTORE_PIECES, ...DOCTORE_NEIGHBOURS]);
    expect(at(rows, 'bench.seat ↔ wall')).toBeCloseTo(-0.5, 4);
    expect(at(rows, 'bench.capital1 ↔ wall')).toBeCloseTo(-0.45, 4);
    expect(at(rows, 'bench.foot1 ↔ plinth.lower')).toBeCloseTo(-0.135, 4);
    expect(at(rows, 'obelisk.base ↔ plinth.lower')).toBeCloseTo(-0.135, 4);
    expect(at(rows, 'obelisk.base ↔ quoins.west')).toBeCloseTo(-0.125, 4);
    expect(at(rows, 'obelisk.base ↔ plinth.upper')).toBeCloseTo(-0.1, 4);
    expect(rows.filter((r) => r.c < 0).length).toBeGreaterThanOrEqual(9);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. After the move every prop clears building, tree and neighbours
// ══════════════════════════════════════════════════════════════════════════

describe('D. Every moved prop now clears building, cypress and neighbours', () => {
  test('the Tavern forecourt: bench 0.61 from the planter, barrels 0.49 from the plinth', () => {
    const props = tavernProps();
    const rows = pairs(props, [...TAVERN_PIECES, cypress(0).planter, cypress(0).trunk]);
    const all = [...rows, ...pairs(props, props)];
    expect(rows.filter((r) => r.c < 0)).toEqual([]);
    // The four bench↔cylinder figures below are corner-to-axis under the C-8.27
    // model.  The former world-AABB stand-in reported 0.4075 / 1.006 / 0.4141 /
    // 1.3349 for them: it treated the 2.0 × 0.65 seat as axis-aligned, which
    // understated all four.  The building pairs are exact either way.
    expect(at(rows, 'bench.seat ↔ cypress.planter')).toBeCloseTo(0.6080, 4);
    expect(at(rows, 'bench.seat ↔ cypress.trunk')).toBeCloseTo(1.2065, 4);
    expect(at(rows, 'bench.seat ↔ plinth.lower')).toBeCloseTo(0.8131, 4);
    expect(at(rows, 'bench.seat ↔ wall')).toBeCloseTo(1.0631, 4);
    expect(at(rows, 'barrelUpright ↔ plinth.lower')).toBeCloseTo(0.67, 4);
    expect(at(rows, 'barrelLying ↔ plinth.lower')).toBeCloseTo(0.4895, 4);
    expect(at(rows, 'barrelLying ↔ plinth.upper')).toBeCloseTo(0.5577, 4);
    expect(at(rows, 'barrelLying ↔ wall')).toBeCloseTo(0.7043, 4);
    const inner = pairs(props, props);
    expect(at(inner, 'bench.seat ↔ barrelUpright')).toBeCloseTo(0.4149, 4);
    expect(at(inner, 'bench.seat ↔ barrelLying')).toBeCloseTo(1.3905, 4);
    // The two barrels interpenetrated by 0.54 before; they are now the group's worst.
    expect(at(inner, 'barrelUpright ↔ barrelLying')).toBeCloseTo(0.268, 4);
    expect(worst(all).c).toBeGreaterThanOrEqual(0.25);
  });

  test('the Inn forecourt: crate 0.40 from the plinth, amphora 0.63, bench 0.61', () => {
    const props = innProps();
    const rows = pairs(props, [...INN_PIECES, ...INN_FRONTAGE, cypress(1).planter, cypress(1).trunk]);
    expect(rows.filter((r) => r.c < 0)).toEqual([]);
    expect(at(rows, 'crate ↔ plinth.lower')).toBeCloseTo(0.4, 4);
    expect(at(rows, 'crate ↔ plinth.upper')).toBeCloseTo(0.5, 4);
    expect(at(rows, 'crate ↔ wall')).toBeCloseTo(0.65, 4);
    expect(at(rows, 'amphora ↔ plinth.lower')).toBeCloseTo(0.629, 4);
    expect(at(rows, 'bench.seat ↔ plinth.lower')).toBeCloseTo(0.6131, 4);
    // C-8.27 model: 0.4075 → 0.6080 (the rotated seat's nearest corner).
    expect(at(rows, 'bench.seat ↔ cypress.planter')).toBeCloseTo(0.6080, 4);
    const inner = pairs(props, props);
    expect(at(inner, 'bench.seat ↔ crate')).toBeCloseTo(0.3131, 4);
    expect(at(inner, 'crate ↔ amphora')).toBeCloseTo(0.729, 4);
    // C-8.27 model: 1.9122 → 1.9535 (bench↔cylinder, corner-to-axis).
    expect(at(inner, 'bench.seat ↔ amphora')).toBeCloseTo(1.9535, 4);
    expect(worst(inner).c).toBeGreaterThanOrEqual(0.3);
  });

  test('the forge cluster clears plinth 0.48, kerb 0.38 and the west doorway', () => {
    const props = forgeCluster();
    const rows = pairs(props, [...FORGE_PIECES, ...CURBS, ...AVENUE_KERBS, ...EAST_FURNITURE]);
    expect(rows.filter((r) => r.c < 0)).toEqual([]);
    expect(at(rows, 'cluster.barrelB ↔ plinth.lower')).toBeCloseTo(0.48, 4);
    expect(at(rows, 'cluster.barrelB ↔ plinth.upper')).toBeCloseTo(0.58, 4);
    expect(at(rows, 'cluster.barrelB ↔ wall')).toBeCloseTo(0.73, 4);
    expect(at(rows, 'cluster.barrelA ↔ plinth.lower')).toBeCloseTo(1.12, 4);
    expect(at(rows, 'cluster.amphora ↔ plinth.lower')).toBeCloseTo(0.78, 4);
    expect(at(rows, 'cluster.amphora ↔ curb1')).toBeCloseTo(0.38, 4);
    expect(at(rows, 'cluster.barrelA ↔ curb1')).toBeCloseTo(0.52, 4);
    expect(worst(pairs(props, props)).c).toBeGreaterThanOrEqual(0.3);
    // The rest of the east street's furniture is nowhere near the cluster.
    expect(worst(rows.filter((r) => /lamp|store|bench\.east|avenueKerb/.test(r.pair))).c).toBeGreaterThan(2);
    expect(worst(rows).c).toBeCloseTo(0.38, 4);
  });

  test('the Doctore frontage: bench 0.28 and obelisk base 0.40 clear of the house', () => {
    const props = doctoreProps();
    const rows = pairs(props, [...DOCTORE_PIECES, ...DOCTORE_NEIGHBOURS]);
    expect(rows.filter((r) => r.c < 0)).toEqual([]);
    expect(at(rows, 'bench.foot1 ↔ plinth.lower')).toBeCloseTo(0.28, 4);
    expect(at(rows, 'bench.capital1 ↔ plinth.lower')).toBeCloseTo(0.3, 4);
    expect(at(rows, 'bench.seat ↔ wall')).toBeCloseTo(0.5, 4);
    expect(at(rows, 'bench.seat ↔ academy.plinth.lower')).toBeCloseTo(0.35, 4);
    expect(at(rows, 'bench.seat ↔ academy.wall')).toBeCloseTo(0.6, 4);
    expect(at(rows, 'obelisk.base ↔ plinth.lower')).toBeCloseTo(0.4, 4);
    expect(at(rows, 'obelisk.base ↔ plinth.upper')).toBeCloseTo(0.5, 4);
    expect(at(rows, 'obelisk.base ↔ quoins.west')).toBeCloseTo(0.475, 4);
    expect(at(rows, 'obelisk.base ↔ wall')).toBeCloseTo(0.65, 4);
    expect(at(rows, 'obelisk.spire ↔ plinth.lower')).toBeCloseTo(0.57, 4);
    expect(worst(pairs(props, props)).c).toBeGreaterThan(1);
  });

  test('the obelisk ↔ practice-rack gap: 0.15 at the C-8.22 X, 0.25 shipped since C-8.23', () => {
    // The rack's X band starts at 25.6, so this pair is X-governed and the C-8.22 Z
    // move left it exactly as it was.  Phase C-8.23 then stepped the group 0.10 west,
    // which is the shipped X read back from the source by the third assertion.
    const base = (x: number, z: number): Prop => ({ n: 'obelisk.base', o: { kind: 'obb', o: asObb(OBELISK_BASE(x, z)) } });
    expect(at(pairs([base(25, -21)], DOCTORE_NEIGHBOURS), 'obelisk.base ↔ rack')).toBeCloseTo(0.15, 4);
    expect(at(pairs([base(25, OBELISK_POS[2])], DOCTORE_NEIGHBOURS), 'obelisk.base ↔ rack')).toBeCloseTo(0.15, 4);
    expect(at(pairs([base(OBELISK_POS[0], OBELISK_POS[2])], DOCTORE_NEIGHBOURS), 'obelisk.base ↔ rack')).toBeCloseTo(0.25, 4);
  });

  test('every moved prop keeps ≥ 0.2 from everything it shares a height with', () => {
    const groups: Array<{ what: string; props: Prop[]; targets: Prop[] }> = [
      { what: 'Tavern', props: tavernProps(), targets: [...TAVERN_PIECES, cypress(0).planter, cypress(0).trunk] },
      { what: 'Inn', props: innProps(), targets: [...INN_PIECES, ...INN_FRONTAGE, cypress(1).planter, cypress(1).trunk] },
      { what: 'Forge', props: forgeCluster(), targets: [...FORGE_PIECES, ...CURBS, ...AVENUE_KERBS] },
      { what: 'Doctore', props: doctoreProps(), targets: [...DOCTORE_PIECES, ...DOCTORE_NEIGHBOURS] },
    ];
    for (const g of groups) {
      // Since C-8.23 stepped the obelisk group 0.10 west, every pair clears 0.2 —
      // including the obelisk ↔ practice-rack pair (0.25) that used to be excepted.
      const rows = pairs(g.props, g.targets);
      expect(worst(rows).c, `${g.what}: ${worst(rows).pair}`).toBeGreaterThanOrEqual(0.2);
      expect(worst(pairs(g.props, g.props)).c, `${g.what} self-pairs`).toBeGreaterThanOrEqual(0.2);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Navigation: kerbs, doorways, arrivals and walking corridors
// ══════════════════════════════════════════════════════════════════════════

const xzBox = (o: Obj) => {
  if (o.kind === 'obb') {
    return {
      x: [o.o.c.x - o.o.h[0], o.o.c.x + o.o.h[0]] as [number, number],
      z: [o.o.c.z - o.o.h[2], o.o.c.z + o.o.h[2]] as [number, number],
    };
  }
  if (o.kind === 'cyl') {
    return { x: [o.c.x - o.r, o.c.x + o.r] as [number, number], z: [o.c.z - o.r, o.c.z + o.r] as [number, number] };
  }
  return {
    x: [Math.min(o.p0.x, o.p1.x) - o.r, Math.max(o.p0.x, o.p1.x) + o.r] as [number, number],
    z: [Math.min(o.p0.z, o.p1.z) - o.r, Math.max(o.p0.z, o.p1.z) + o.r] as [number, number],
  };
};
const insideXZ = (o: Obj, r: { x: [number, number]; z: [number, number] }) => {
  const b = xzBox(o);
  return b.x[1] > r.x[0] && b.x[0] < r.x[1] && b.z[1] > r.z[0] && b.z[0] < r.z[1];
};
const planDistance = (o: Obj, x: number, z: number) => {
  const b = xzBox(o);
  const dx = Math.max(b.x[0] - x, x - b.x[1], 0);
  const dz = Math.max(b.z[0] - z, z - b.z[1], 0);
  return Math.hypot(dx, dz);
};

describe('E. Nothing blocks a kerb, a doorway or an arrival', () => {
  test('the forge west doorway corridor (Z 0.9–4.3, X 11.0–13.5) is clear', () => {
    const zone = { x: [11.0, 13.5] as [number, number], z: [0.9, 4.3] as [number, number] };
    for (const p of forgeCluster()) {
      expect(insideXZ(p.o, zone), `${p.n} inside the doorway corridor`).toBe(false);
      const b = xzBox(p.o);
      expect(Math.max(b.z[0] - zone.z[1], b.x[0] - zone.x[1]), `${p.n} too close to the doorway corridor`).toBeGreaterThanOrEqual(0.2);
    }
  });

  test('the Tavern and Inn doorways and footprints are entirely clear', () => {
    // Tavern door: east face X = −11.78, Z 12.9–15.1.  Inn door: west face
    // X = 11.68, Z 12.9–15.1.  Both forecourts sit 3.8+ north of them.
    for (const p of tavernProps()) {
      expect(insideXZ(p.o, { x: [-13.0, -11.78], z: [12.9, 15.1] }), `${p.n} in the Tavern doorway`).toBe(false);
      expect(insideXZ(p.o, { x: [-20.7, -11.55], z: [10.15, 17.85] }), `${p.n} in the Tavern`).toBe(false);
    }
    for (const p of innProps()) {
      expect(insideXZ(p.o, { x: [11.68, 13.0], z: [12.9, 15.1] }), `${p.n} in the Inn doorway`).toBe(false);
      expect(insideXZ(p.o, { x: [11.45, 20.55], z: [9.95, 18.05] }), `${p.n} in the Inn`).toBe(false);
    }
    for (const p of doctoreProps()) {
      expect(insideXZ(p.o, { x: [25.0, 31.0], z: [-20.75, -17.0] }), `${p.n} in the Doctore House`).toBe(false);
    }
  });

  test('every fast-travel arrival keeps more than a player diameter of room', () => {
    const props: Prop[] = [...tavernProps(), ...innProps(), ...forgeCluster(), ...doctoreProps()];
    const arrivals: Array<[string, [number, number]]> = [
      ['tavern', FAST_TRAVEL_ARRIVALS.tavern],
      ['caravanserai', FAST_TRAVEL_ARRIVALS.caravanserai],
      ['smithing_forge', FAST_TRAVEL_ARRIVALS.smithing_forge],
      ['doctore_house', FAST_TRAVEL_ARRIVALS.doctore_house],
      ['gladiator_academy', FAST_TRAVEL_ARRIVALS.gladiator_academy],
      ['records_house', FAST_TRAVEL_ARRIVALS.records_house],
      ['general_store', FAST_TRAVEL_ARRIVALS.general_store],
      ['merchant_house', FAST_TRAVEL_ARRIVALS.merchant_house],
      ['armor_workshop', FAST_TRAVEL_ARRIVALS.armor_workshop],
      ['stable', FAST_TRAVEL_ARRIVALS.stable],
    ];
    for (const [name, [ax, az]] of arrivals) {
      for (const p of props) {
        expect(planDistance(p.o, ax, az), `${p.n} crowds the ${name} arrival`).toBeGreaterThan(2 * PLAYER_RADIUS);
      }
    }
  });

  test('the forecourt props stay clear of the avenue kerbs and inside the world', () => {
    for (const p of [...tavernProps(), ...innProps()]) {
      const b = xzBox(p.o);
      const minAbsX = Math.min(Math.abs(b.x[0]), Math.abs(b.x[1]));
      expect(minAbsX).toBeGreaterThan(7.5); // avenue kerbs sit at ±7.2
    }
    for (const p of [...tavernProps(), ...innProps(), ...forgeCluster(), ...doctoreProps()]) {
      const b = xzBox(p.o);
      expect(Math.abs(b.x[0])).toBeLessThan(35);
      expect(Math.abs(b.z[0])).toBeLessThan(35);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. Why these numbers — the audit's candidates were checked, not assumed
// ══════════════════════════════════════════════════════════════════════════

describe('F. The audit candidates were verified against the real geometry', () => {
  test('the suggested bench Z = 9.2 would have collided with the C-8.21 cypress', () => {
    const probe = (bx: number, bz: number) =>
      at(pairs(benchParts('bench', bx, bz, Math.PI / 4), [cypress(0).planter]), 'bench.seat ↔ cypress.planter');
    // Phase C-8.27: these four are now corner-to-axis figures.  The former
    // world-AABB stand-in reported −0.2962 / −0.3925 / 0.2075 / 0.4075 for the
    // same probes; the audit's conclusions are unchanged (the candidate still
    // overlaps, moving north alone still does not clear the planter, and the
    // shipped X still sits past the smallest safe one).
    expect(probe(-13.0, 9.2)).toBeCloseTo(-0.3035, 4); // the audit's candidate overlaps
    expect(probe(-13.0, 8.4)).toBeCloseTo(-0.0508, 4); // moving north alone still overlaps
    expect(probe(-13.6, 8.4)).toBeCloseTo(0.4290, 4);
    expect(probe(-13.8, 8.4)).toBeCloseTo(0.6080, 4); // shipped, 0.61 to spare
    // The smallest X that keeps the 0.20 planter margin, scanned rather than
    // assumed: the seat's nearest corner reaches the planter's axis at
    // X = −13.3314.  (The uncorrected model put this bound at −13.6.)
    let minSafeX = -13.0;
    for (let bx = -13.0; bx >= -14.5; bx -= 0.001) {
      if (probe(bx, 8.4) >= 0.2) { minSafeX = bx; break; }
    }
    expect(minSafeX).toBeCloseTo(-13.331, 2);
    expect(probe(minSafeX, 8.4)).toBeGreaterThanOrEqual(0.2);
    expect(probe(minSafeX + 0.002, 8.4)).toBeLessThan(0.2);
    expect(TAVERN_BENCH[0]).toBeLessThan(minSafeX);
  });

  test('the suggested forge Z = 4.8 still clipped the kerb/doorway edge by 0.02', () => {
    const amp = (z: number) =>
      at(pairs([clusterPots(11.9, z).find((p) => p.n === 'cluster.amphora')!], CURBS), 'cluster.amphora ↔ curb1');
    expect(amp(4.8)).toBeCloseTo(-0.02, 4);
    expect(amp(5.2)).toBeCloseTo(0.38, 4);
    expect(CLUSTER_POS[2]).toBe(5.2);
  });

  test('the obelisk and bench Z values sit just past their 0.20 minimum', () => {
    const obeliskGap = (z: number) =>
      at(pairs([{ n: 'obelisk.base', o: { kind: 'obb', o: asObb(OBELISK_BASE(25, z)) } }], DOCTORE_PIECES), 'obelisk.base ↔ plinth.lower');
    expect(obeliskGap(-21.0)).toBeCloseTo(-0.135, 4);
    expect(obeliskGap(-21.4)).toBeCloseTo(0.2, 4);
    expect(obeliskGap(OBELISK_POS[2])).toBeCloseTo(0.4, 4);
    // The smallest safe Z for a 0.20 Z-gap is plinthFace − 0.20 − halfBase.
    const obeliskMinZ = -20.75 - 0.2 - OBELISK_BASE_BOX[2] / 2;
    expect(obeliskMinZ).toBeCloseTo(-21.4, 4);
    expect(OBELISK_POS[2]).toBeLessThan(obeliskMinZ);

    // The Doctore bench: the −π/2 yaw maps the legs' local X onto world Z, so the
    // inner foot's face reaches bz + 0.8 + footWidth/2 and the plinth face is at
    // −20.75 (the plinth step's 0.135 depth is what SAT reports while overlapping).
    const footReach = 0.8 + BENCH_FOOT[1] / 2;
    const benchFoot = (z: number) =>
      at(
        pairs([...benchParts('bench', 27.5, z, -Math.PI / 2)], DOCTORE_PIECES).filter((r) => r.pair === 'bench.foot1 ↔ plinth.lower'),
        'bench.foot1 ↔ plinth.lower',
      );
    expect(benchFoot(-21.0)).toBeCloseTo(-0.135, 4);
    expect(-20.75 - (DOCTORE_BENCH[2] + footReach)).toBeCloseTo(0.28, 4);
    // Smallest safe Z for a 0.20 gap, and the shipped value sits just past it.
    expect(-20.75 - 0.2 - footReach).toBeCloseTo(-21.92, 4);
    expect(DOCTORE_BENCH[2]).toBeLessThan(-21.92);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// H. Phase scope — props only
// ══════════════════════════════════════════════════════════════════════════

describe('G. The phase moves props and nothing else', () => {
  test('the five buildings keep their roots and the four colliders their sizes', () => {
    expect(specOf(tavernSrc).root).toEqual([-16, 0, 14]);
    expect(specOf(innSrc).root).toEqual([16, 0, 14]);
    expect(specOf(forgeSrc).root).toEqual([18, 0, 2.6]);
    expect(specOf(doctoreSrc).root).toEqual([28, 0, -18.875]);
    expect(findRect('city-tavern')).toMatchObject({ cx: -16, cz: 14, hw: 9.4 / 2, hd: 7.7 / 2 });
    expect(findRect('caravanserai')).toMatchObject({ cx: 16, cz: 14, hw: 9.6 / 2, hd: 8.1 / 2 });
    expect(findRect('smithing-forge')).toMatchObject({ cx: 18, cz: 2.6, hw: 9.5 / 2, hd: 8.0 / 2 });
    expect(findRect('doctore-house')).toMatchObject({ cx: 28, cz: -18.875, hw: 6.0 / 2, hd: 3.75 / 2 });
  });

  test('no prop gained a collider — the registry holds buildings and walls only', () => {
    expect(CITY_COLLIDERS.filter((c) => /bench|barrel|crate|amphora|prop|cluster|cart|cypress|obelisk/.test(c.id))).toEqual([]);
  });

  test('fast-travel arrivals are untouched', () => {
    expect(FAST_TRAVEL_ARRIVALS.tavern).toEqual([-10, 14]);
    expect(FAST_TRAVEL_ARRIVALS.caravanserai).toEqual([10, 14]);
    expect(FAST_TRAVEL_ARRIVALS.smithing_forge).toEqual([11.5, 2.6]);
    expect(FAST_TRAVEL_ARRIVALS.doctore_house).toEqual([23.5, -18.875]);
    expect(FAST_TRAVEL_ARRIVALS.gladiator_academy).toEqual([25.5, -23]);
  });

  test('the C-8.18, C-8.19 and C-8.21 corrections are preserved', () => {
    expect(findRect('records-library')).toMatchObject({ cx: 23.1, cz: -30, hw: 3.25, hd: 2.85 });
    expect(forgeSrc).toContain('<group position={[18, 0, 2.6]}>');
    expect(streetsSrc).toContain('<MerchantCart position={[10.8, 0, -1.7]} rotationY={Math.PI / 4} />');
    expect(avenueSrc).toContain('[-7.5, 8.55, 20].map((pz, zi)');
    expect(CYP_X).toEqual([-11.5, 11.5]);
    expect(CYP_Z).toEqual([-7.5, 8.55, 20]);
  });

  test('the street routes and the Via Mercatoria / Via Decumanus layout are untouched', () => {
    expect(streetsSrc).toContain('position={[11, 0, 0]}\n        axis="x"\n        length={14}\n        width={8}');
    expect(streetsSrc).toContain('VIA_MERCATORIA_PATH.cx');
    expect(streetsSrc).toContain('<MerchantPropsCluster position={[17, 0, -4]} />');
    // The west combat courtyard's stone border ring was out of scope in this phase;
    // C-8.23 has since trimmed its barracks-crossing arc (src/utils/phaseC8_23.test.ts),
    // so this assertion follows the ring's current geometry rather than the pre-C-8.23
    // full torus.  Its centre, radius and tube are still the ones asserted below.
    expect(streetsSrc).toContain('<torusGeometry args={[3.0, 0.08, 6, 24, 5.106]} />');
    expect(streetsSrc).toContain('rotation={[-Math.PI / 2, 0, 2.8619]}');
  });

  test('the C-8.21 suite is neither edited nor relaxed', () => {
    const c21 = load('./phaseC8_21.test.ts');
    for (const preserved of [
      'expect(CYPRESS_Z).toEqual([-7.5, 8.55, 20]);',
      'expect(CART_POS).toEqual([10.8, 0, -1.7]);',
      'expect(rows[0].clearance).toBeCloseTo(0.4909, 4);',
      'expect(worst.clearance).toBeCloseTo(0.7901, 3);',
    ]) {
      expect(c21).toContain(preserved);
    }
  });
});
