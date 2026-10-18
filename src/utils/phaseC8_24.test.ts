/**
 * Phase C-8.24 — City Tavern patio re-seat (closes the C-8.23 follow-up).
 *
 * C-8.23 measured the Tavern's built-in patio group (CityTavern.tsx, section 3) and
 * left it in place: its anchor [3.6, 0, 2.2] sat *inside* the solid 8.4 × 6.4 × 7.2
 * wall box, so the table, both cups and the barrel stack were buried in a solid —
 * the table's east face 0.10 through the façade, above the plinth — while the two
 * amphorae stood against the stepped base.  The C-8.23 suite compared the jars with
 * the wall *face* alone, so it did not report that their bellies also reached 0.055
 * (0.8-scale) and 0.144 (0.75-scale) inside plinth.upper.  No group shift fixed that
 * state: 0.10 west hid the table but drove the 0.75-scale jar into the façade.
 *
 * This phase re-seats the group instead, onto the Tavern's north terrace — the
 * Golden Palm's outside seating/storage strip that C-8.22 already established along
 * the north frontage — in the pocket bounded by the Tavern's north plinth face
 * (world Z = 10.15), the Training Yard's enclosure wall (a ring whose widest,
 * coping surface is radius 7.205 about world [-18, 0]), the C-8.21 cypress to the
 * east and the C-8.22 forecourt props beyond it.
 *
 * ── The model, and why it is trustworthy ─────────────────────────────────────
 *
 *  • Parent transforms.  The Tavern root `<group position={[-16, 0, 14]}>` and the
 *    patio group carry **no** rotation and **no** scale, so a prop's world
 *    transform is root + anchor + its own local offset, and every solid here stays
 *    axis-aligned.
 *  • Props are rebuilt from the primitives that render them, at the real size,
 *    scale and rotation — the table's 1.4 × 0.9 × 1.2 box; a cup = cylinder
 *    r 0.08 × 0.15 (the 0.06 bottom radius lies inside it); an amphora = belly
 *    radius 0.26 × scale and rim-top height 0.935 × scale, a *superset* of the
 *    lathe; a WineBarrel = r 0.38 × 0.9 with the source's own yOffset (0.45
 *    upright, 0.38 lying).  A lying barrel is modelled as its true horizontal
 *    axis: `rotation=[0, yaw, π/2]` sends the cylinder's local +Y to
 *    (−cos yaw, 0, sin yaw).
 *  • Architecture is the *rendered* geometry: the wall box, and BuildingFoundation's
 *    own two steps (lower step = footprint + 2·projection over y 0–0.135, upper
 *    step = footprint + 1.2·projection over y 0.135–0.3) — never a single
 *    conservative envelope, because the wall face stands 0.25 behind the lower
 *    step's and which of the three a prop must clear depends on its own Y band.
 *  • Separations are exact Euclidean distances whenever a pair is apart: box↔box
 *    from the per-axis gaps; cylinder↔box from the circle↔rectangle plan distance
 *    combined with the Y-band gap; capsule↔box and capsule↔cylinder by sampling the
 *    capsule's axis against the exact point↔box / point↔finite-cylinder distance
 *    (the sphere-swept model bounds the barrel's rounded ends); capsule↔capsule from
 *    the segment↔segment distance minus the radii.  An overlapping pair reports the
 *    least-negative axis gap, i.e. a depth that is never overstated.
 *  • The Training Yard's ring is represented by its widest element alone — the
 *    coping's outer radius 7.205 over y 0–0.58, a superset of the 7.175 body — and
 *    its four piers / two gateposts by their circumscribed cylinders (half-diagonal
 *    for the 0.5 / 0.6 squares, so no rotation-dependent AABB error).  Both are
 *    conservative: a reported gap can only be an understatement.
 *  • The cypress contributes its planter (r 0.85 × 1.05) and trunk (0.28 × 1.05)
 *    over the height band the patio props occupy; its crown starts at world
 *    Y 1.89, above every patio prop's 1.66 top — asserted, not assumed.
 *  • The two stacked barrels are one composite prop (the `stack.` prefix), the
 *    convention C-8.22 uses, so the ≥ 0.2 floor is asserted between distinct props
 *    while the stack's own tangency is asserted separately.
 *
 * Measured before → after (world): the props leave the wall box for the terrace, the
 * group's plan moving from X[-13.58,-11.29] Z[13.95,16.81] to X[-20.00,-17.91]
 * Z[7.77,9.95].  Every patio prop now clears the façade, both plinth steps, the yard
 * wall, the cypress and the C-8.22 neighbours; the tightest architecture pair is the
 * table against the lower plinth step at 0.20, and the barrel stack is repaired so
 * the lying barrel rests *on* the upright one's rim (0.72 → 0.90) instead of 0.18
 * inside it.
 *
 * Run with: bun test src/utils/phaseC8_24.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PLAYER_RADIUS, CITY_COLLIDERS, type RectCollider } from './collisionShapes';
import { FAST_TRAVEL_ARRIVALS } from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const tavernSrc = load('../components/3d/city/CityTavern.tsx');
const civicSrc = load('../components/3d/city/CivicFurnishingProps.tsx');
const yardSrc = load('../components/3d/city/TrainingYard.tsx');
const streetsSrc = load('../components/3d/city/CityStreets.tsx');
const foliageSrc = load('../components/3d/city/MediterraneanFoliage.tsx');
const avenueSrc = load('../components/3d/city/ProcessionAvenue.tsx');
const c21 = load('./phaseC8_21.test.ts');
const c22 = load('./phaseC8_22.test.ts');
const c23 = load('./phaseC8_23.test.ts');

// ── Tiny parsers (same style as the C-8.18 / 19 / 21 / 22 / 23 suites) ────

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
function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ── Solids and the signed clearance between them ──────────────────────────

interface V3 {
  x: number;
  y: number;
  z: number;
}
interface Box3 {
  kind: 'box';
  n: string;
  x: [number, number];
  y: [number, number];
  z: [number, number];
}
interface Cyl {
  kind: 'cyl';
  n: string;
  x: number;
  z: number;
  r: number;
  y: [number, number];
}
interface Cap {
  kind: 'cap';
  n: string;
  p0: V3;
  p1: V3;
  r: number;
}
type Solid = Box3 | Cyl | Cap;

const bandGap = (a: [number, number], b: [number, number]) => Math.max(b[0] - a[1], a[0] - b[1]);

/** Axis-aligned box pair: exact when apart, otherwise the least-negative axis gap. */
function boxBox(a: Box3, b: Box3): number {
  const dx = bandGap(a.x, b.x);
  const dy = bandGap(a.y, b.y);
  const dz = bandGap(a.z, b.z);
  if (dx >= 0 || dy >= 0 || dz >= 0) return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0));
  return Math.max(dx, dy, dz);
}

/** Vertical cylinder vs box (see the header note). */
function cylBox(c: Cyl, b: Box3): number {
  const dx = Math.max(b.x[0] - c.x, c.x - b.x[1], 0);
  const dz = Math.max(b.z[0] - c.z, c.z - b.z[1], 0);
  const dy = bandGap(c.y, b.y);
  const plan = Math.hypot(dx, dz) - c.r;
  if (plan >= 0 && dy >= 0) return Math.hypot(plan, dy);
  return Math.max(plan, dy);
}

/** Two finite vertical cylinders. */
function cylCyl(a: Cyl, b: Cyl): number {
  const dy = bandGap(a.y, b.y);
  const plan = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  if (plan >= 0 && dy >= 0) return Math.hypot(plan, dy);
  return Math.max(plan, dy);
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Distance from a point to an axis-aligned box (0 inside). */
function pointBox(p: V3, b: Box3): number {
  return Math.hypot(
    Math.max(b.x[0] - p.x, p.x - b.x[1], 0),
    Math.max(b.y[0] - p.y, p.y - b.y[1], 0),
    Math.max(b.z[0] - p.z, p.z - b.z[1], 0),
  );
}

/** Distance from a point to a finite vertical cylinder (0 inside). */
function pointCyl(p: V3, c: Cyl): number {
  return Math.hypot(
    Math.max(Math.hypot(p.x - c.x, p.z - c.z) - c.r, 0),
    Math.max(c.y[0] - p.y, p.y - c.y[1], 0),
  );
}

const along = (c: Cap, t: number): V3 => ({
  x: c.p0.x + (c.p1.x - c.p0.x) * t,
  y: c.p0.y + (c.p1.y - c.p0.y) * t,
  z: c.p0.z + (c.p1.z - c.p0.z) * t,
});

/** Capsule vs box: the axis samples against the exact point↔box distance. */
function capBox(c: Cap, b: Box3, N = 4000): number {
  let best = Infinity;
  for (let i = 0; i <= N; i++) {
    const d = pointBox(along(c, i / N), b);
    if (d < best) best = d;
  }
  return best - c.r;
}

/** Capsule vs finite cylinder — the sphere-swept capsule against the exact cylinder. */
function capCyl(c: Cap, k: Cyl, N = 4000): number {
  let best = Infinity;
  for (let i = 0; i <= N; i++) {
    const d = pointCyl(along(c, i / N), k);
    if (d < best) best = d;
  }
  return best - c.r;
}

/** Shortest distance between two segments (the capsule-axis comparison). */
function segSeg(p1: V3, q1: V3, p2: V3, q2: V3): number {
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
      t = Math.max(0, Math.min(1, (b * s + f) / e));
    }
  }
  const c1: V3 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s };
  const c2: V3 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t };
  return Math.hypot(c1.x - c2.x, c1.y - c2.y, c1.z - c2.z);
}

/** Capsule vs capsule — exact for two sphere-swept segments. */
function capCap(a: Cap, b: Cap): number {
  return segSeg(a.p0, a.p1, b.p0, b.p1) - a.r - b.r;
}

function clearance(a: Solid, b: Solid): number {
  if (a.kind === 'box' && b.kind === 'box') return boxBox(a, b);
  if (a.kind === 'cyl' && b.kind === 'box') return cylBox(a, b);
  if (a.kind === 'box' && b.kind === 'cyl') return cylBox(b, a);
  if (a.kind === 'cyl' && b.kind === 'cyl') return cylCyl(a, b);
  if (a.kind === 'cap' && b.kind === 'box') return capBox(a, b);
  if (a.kind === 'box' && b.kind === 'cap') return capBox(b, a);
  if (a.kind === 'cap' && b.kind === 'cyl') return capCyl(a, b);
  if (a.kind === 'cyl' && b.kind === 'cap') return capCyl(b, a);
  return capCap(a as Cap, b as Cap);
}

const planX = (s: Solid): [number, number] =>
  s.kind === 'box' ? s.x : s.kind === 'cyl' ? [s.x - s.r, s.x + s.r] : [Math.min(s.p0.x, s.p1.x) - s.r, Math.max(s.p0.x, s.p1.x) + s.r];
const planZ = (s: Solid): [number, number] =>
  s.kind === 'box' ? s.z : s.kind === 'cyl' ? [s.z - s.r, s.z + s.r] : [Math.min(s.p0.z, s.p1.z) - s.r, Math.max(s.p0.z, s.p1.z) + s.r];
const topY = (s: Solid): number => (s.kind === 'box' ? s.y[1] : s.kind === 'cyl' ? s.y[1] : s.p0.y + s.r);
const bottomY = (s: Solid): number => (s.kind === 'box' ? s.y[0] : s.kind === 'cyl' ? s.y[0] : s.p0.y - s.r);

// ── The patio group as the source declares it ─────────────────────────────

/** The Tavern's own root, anchored on the comment that follows it. */
const TAVERN_ROOT = triple(
  tavernSrc,
  /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED TRAVERTINE/,
);
/** The re-seated patio group's anchor (local to the Tavern root). */
const PATIO = triple(
  tavernSrc,
  /OUTDOOR PATIO TAVERN BENCHES & WINE BARRELS[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/,
);
/** The group's full opening tag — a rotation or scale here would break the model. */
const PATIO_TAG = /OUTDOOR PATIO TAVERN BENCHES & WINE BARRELS[\s\S]*?(<group position=\{\[[^\]]*\]\}>)/.exec(tavernSrc)![1];
const TAVERN_TAG = /<group position=\{\[\s*-?[\d.]+,\s*-?[\d.]+,\s*-?[\d.]+\s*\]\}>/.exec(tavernSrc)![0];

const TABLE_SRC = /Rustic Oak Table[\s\S]*?<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*([\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/.exec(tavernSrc)!;
const TABLE_LP: [number, number, number] = [Number(TABLE_SRC[1]), Number(TABLE_SRC[2]), Number(TABLE_SRC[3])];
const TABLE_SIZE: [number, number, number] = [Number(TABLE_SRC[4]), Number(TABLE_SRC[5]), Number(TABLE_SRC[6])];

const CUPS = all(
  tavernSrc,
  /<mesh position=\{\[\s*(-?[\d.]+),\s*([\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\}/g,
).map((m) => ({
  lp: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
  rTop: Number(m[4]),
  rBottom: Number(m[5]),
  h: Number(m[6]),
}));

const AMPHORAE = all(
  tavernSrc,
  /<RomanAmphora position=\{\[\s*(-?[\d.]+),\s*0,\s*(-?[\d.]+)\s*\]\} scale=\{([\d.]+)\} tone="(\w+)" \/>/g,
).map((m) => ({ lx: Number(m[1]), lz: Number(m[2]), scale: Number(m[3]), tone: m[4] }));

const BARRELS = all(
  tavernSrc,
  /<WineBarrel position=\{\[\s*(-?[\d.]+),\s*([\d.]+),\s*(-?[\d.]+)\s*\]\}( isLyingDown=\{true\})? rotationY=\{(-?[\d.]+)\} \/>/g,
).map((m) => ({
  lp: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
  lying: Boolean(m[4]),
  yaw: Number(m[5]),
}));

// ── Primitive dimensions (CivicFurnishingProps) ───────────────────────────

const AMPHORA_BELLY_R = num(civicSrc, /export const RomanAmphora[\s\S]*?<sphereGeometry args=\{\[\s*([\d.]+),/);
const AMPHORA_BELLY_Y = num(civicSrc, /Main Ovoid Amphora Belly[\s\S]*?<mesh castShadow position=\{\[0,\s*([\d.]+),\s*0\]\}>/);
const AMPHORA_RIM = pair(civicSrc, /position=\{\[0,\s*([\d.]+),\s*0\]\}>\s*<torusGeometry args=\{\[\s*[\d.]+,\s*([\d.]+)/);
const AMPHORA_TOP = AMPHORA_RIM[0] + AMPHORA_RIM[1];
const BARREL_BODY = triple(civicSrc, /Bulged Stave Oak Barrel Body[\s\S]*?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\} \/>/);
const BARREL_R = Math.max(BARREL_BODY[0], BARREL_BODY[1]);
const BARREL_H = BARREL_BODY[2];
const BARREL_YOFFSET = pair(civicSrc, /const yOffset = isLyingDown \? ([\d.]+) : ([\d.]+);/);
const BARREL_Y_LYING = BARREL_YOFFSET[0];
const BARREL_Y_UP = BARREL_YOFFSET[1];

// ── The same props in world space ─────────────────────────────────────────

const worldX = (lx: number) => TAVERN_ROOT[0] + PATIO[0] + lx;
const worldY = (ly: number) => TAVERN_ROOT[1] + PATIO[1] + ly;
const worldZ = (lz: number) => TAVERN_ROOT[2] + PATIO[2] + lz;

const TABLE: Box3 = {
  kind: 'box',
  n: 'table',
  x: [worldX(TABLE_LP[0]) - TABLE_SIZE[0] / 2, worldX(TABLE_LP[0]) + TABLE_SIZE[0] / 2],
  y: [worldY(TABLE_LP[1]) - TABLE_SIZE[1] / 2, worldY(TABLE_LP[1]) + TABLE_SIZE[1] / 2],
  z: [worldZ(TABLE_LP[2]) - TABLE_SIZE[2] / 2, worldZ(TABLE_LP[2]) + TABLE_SIZE[2] / 2],
};

/** A WineBarrel as its true horizontal axis (`rotation=[0, yaw, π/2]`). */
function lyingAxis(pos: [number, number, number], yaw: number, name: string): Cap {
  const u: V3 = { x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) };
  const half = BARREL_H / 2;
  const c: V3 = { x: pos[0], y: pos[1] + BARREL_Y_LYING, z: pos[2] };
  return {
    kind: 'cap',
    n: name,
    p0: { x: c.x - u.x * half, y: c.y, z: c.z - u.z * half },
    p1: { x: c.x + u.x * half, y: c.y, z: c.z + u.z * half },
    r: BARREL_R,
  };
}

const CUPS_SOLID: Cyl[] = CUPS.map((c, i) => ({
  kind: 'cyl',
  n: `cup${i}`,
  x: worldX(c.lp[0]),
  z: worldZ(c.lp[2]),
  r: Math.max(c.rTop, c.rBottom),
  y: [worldY(c.lp[1]) - c.h / 2, worldY(c.lp[1]) + c.h / 2],
}));

/** A RomanAmphora as the cylinder of its widest belly (a superset of the lathe). */
const AMPHORA_SOLID: Cyl[] = AMPHORAE.map((a, i) => ({
  kind: 'cyl',
  n: `amphora${'AB'[i]}`,
  x: worldX(a.lx),
  z: worldZ(a.lz),
  r: AMPHORA_BELLY_R * a.scale,
  y: [0, AMPHORA_TOP * a.scale],
}));

const UPRIGHT = BARRELS.find((b) => !b.lying)!;
const LYING = BARRELS.find((b) => b.lying)!;
/** The two barrels are one composite stack — hence the shared `stack.` prefix. */
const BARREL_UPRIGHT: Cyl = {
  kind: 'cyl',
  n: 'stack.upright',
  x: worldX(UPRIGHT.lp[0]),
  z: worldZ(UPRIGHT.lp[2]),
  r: BARREL_R,
  y: [UPRIGHT.lp[1], UPRIGHT.lp[1] + BARREL_H],
};
const BARREL_LYING: Cap = lyingAxis([worldX(LYING.lp[0]), LYING.lp[1], worldZ(LYING.lp[2])], LYING.yaw, 'stack.lying');

const PROPS: Solid[] = [TABLE, ...CUPS_SOLID, ...AMPHORA_SOLID, BARREL_UPRIGHT, BARREL_LYING];

// ── The rendered Tavern the props must clear ──────────────────────────────

const FOUNDATION = pair(tavernSrc, /<BuildingFoundation size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const FOUNDATION_PROJECTION = num(tavernSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
const FOUNDATION_HEIGHT = num(tavernSrc, /<BuildingFoundation[\s\S]*?height=\{([\d.]+)\}/);
const WALL_Y = num(tavernSrc, /<mesh castShadow receiveShadow position=\{\[\s*0,\s*([\d.]+),\s*0\s*\]\}>/);
const WALL_SIZE = triple(tavernSrc, /<mesh castShadow receiveShadow position=\{\[\s*0,\s*[\d.]+,\s*0\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);

const TAVERN_PIECES: Box3[] = (() => {
  const [rx, , rz] = TAVERN_ROOT;
  const [fw, fd] = FOUNDATION;
  const proj = FOUNDATION_PROJECTION;
  const lowerH = FOUNDATION_HEIGHT * 0.45;
  const lowerW = fw + proj * 2;
  const lowerD = fd + proj * 2;
  const upperW = fw + proj * 1.2;
  const upperD = fd + proj * 1.2;
  return [
    {
      kind: 'box',
      n: 'plinth.lower',
      x: [rx - lowerW / 2, rx + lowerW / 2],
      y: [0, lowerH],
      z: [rz - lowerD / 2, rz + lowerD / 2],
    },
    {
      kind: 'box',
      n: 'plinth.upper',
      x: [rx - upperW / 2, rx + upperW / 2],
      y: [lowerH, FOUNDATION_HEIGHT],
      z: [rz - upperD / 2, rz + upperD / 2],
    },
    {
      kind: 'box',
      n: 'wall',
      x: [rx - WALL_SIZE[0] / 2, rx + WALL_SIZE[0] / 2],
      y: [WALL_Y - WALL_SIZE[1] / 2, WALL_Y + WALL_SIZE[1] / 2],
      z: [rz - WALL_SIZE[2] / 2, rz + WALL_SIZE[2] / 2],
    },
  ];
})();

// ── The Training Yard enclosure (TrainingYard.tsx) ────────────────────────

const YARD_ROOT = triple(yardSrc, /export const TrainingYard[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
const YARD_R = num(yardSrc, /const WALL_RADIUS = ([\d.]+);/);
const YARD_H = num(yardSrc, /const WALL_HEIGHT = ([\d.]+);/);
const YARD_T = num(yardSrc, /const WALL_THICKNESS = ([\d.]+);/);
const YARD_CHORD = num(yardSrc, /const ENTRANCE_CHORD = ([\d.]+);/);
const YARD_SEGMENTS = num(yardSrc, /const NUM_SEGMENTS = ([\d.]+);/);
/** The coping's own pads and thickness, and how far it stands above the wall body. */
const YARD_COPING = triple(yardSrc, /<boxGeometry args=\{\[SEGMENT_WIDTH \+ ([\d.]+),\s*([\d.]+),\s*WALL_THICKNESS \+ ([\d.]+)\]\} \/>/);
const YARD_COPING_LIFT = num(yardSrc, /<mesh castShadow position=\{\[0, WALL_HEIGHT \+ ([\d.]+), 0\]\}>/);
/** StonePier's own defaults, and the cap's own thickness / stand-off. */
const PIER_DEFAULTS = triple(yardSrc, /height = ([\d.]+), width = ([\d.]+), capWidth = ([\d.]+)/);
/** StonePier's cap: its own thickness, and how far it stands above the pier body. */
const PIER_CAP: [number, number] = [
  num(yardSrc, /<boxGeometry args=\{\[capWidth, ([\d.]+), capWidth\]\} \/>/),
  num(yardSrc, /<mesh castShadow position=\{\[0, height \+ ([\d.]+), 0\]\}/),
];
const PIER_HEIGHT = num(yardSrc, /<StonePier key=\{`pier-\$\{k\}`\} angle=\{angle\} height=\{([\d.]+)\} \/>/);
const GATEPOST = triple(yardSrc, /<StonePier angle=\{ENTRANCE_HALF_ANGLE\} height=\{([\d.]+)\} width=\{([\d.]+)\} capWidth=\{([\d.]+)\} \/>/);

/**
 * The enclosure obstacle: the coping's outer surface (the widest element, a
 * superset of the 7.175 body) over its own Y band, plus every pier / gatepost as
 * its circumscribed cylinder so the result cannot depend on the pier's own
 * rotation about Y.
 */
const YARD: Cyl[] = (() => {
  const [yx, , yz] = YARD_ROOT;
  const half = Math.asin(YARD_CHORD / (2 * YARD_R));
  const arc = Math.PI * 2 - 2 * half;
  const segAngle = arc / YARD_SEGMENTS;
  const circum = (square: number) => (square * Math.SQRT2) / 2;
  const out: Cyl[] = [
    {
      kind: 'cyl',
      n: 'yard.wall',
      x: yx,
      z: yz,
      r: YARD_R + (YARD_T + YARD_COPING[2]) / 2,
      y: [0, YARD_H + YARD_COPING_LIFT + YARD_COPING[1] / 2],
    },
  ];
  for (const k of [3, 6, 9, 12]) {
    const angle = half + k * segAngle;
    out.push({
      kind: 'cyl',
      n: `yard.pier${k}`,
      x: yx + Math.cos(angle) * YARD_R,
      z: yz + Math.sin(angle) * YARD_R,
      r: circum(PIER_DEFAULTS[2]),
      y: [0, PIER_HEIGHT + PIER_CAP[1] + PIER_CAP[0]],
    });
  }
  for (const s of [-1, 1]) {
    out.push({
      kind: 'cyl',
      n: `yard.gate${s < 0 ? 'W' : 'E'}`,
      x: yx + Math.cos(s * half) * YARD_R,
      z: yz + Math.sin(s * half) * YARD_R,
      r: circum(GATEPOST[2]),
      y: [0, GATEPOST[0] + PIER_CAP[1] + PIER_CAP[0]],
    });
  }
  return out;
})();

// ── The C-8.21 cypress and the C-8.22 forecourt props ─────────────────────

const CYP_X = pair(avenueSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(px, pi\)/);
const CYP_Z = triple(avenueSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(pz, zi\)/);
const CYP_SCALE = num(avenueSrc, /scale=\{([\d.]+)\} seed=\{pi \* 3 \+ zi \+ 1\}/);
const CYP_PLANTER = triple(foliageSrc, /Stone Planter Base[\s\S]*?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\} \/>/);
const CYP_PLANTER_Y = num(foliageSrc, /Stone Planter Base[\s\S]*?<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>/);
const CYP_TRUNK = triple(foliageSrc, /Trunk[\s\S]*?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\} \/>/);
const CYP_TRUNK_Y = num(foliageSrc, /Trunk[\s\S]*?<mesh castShadow position=\{\[0, ([\d.]+), 0\]\}>/);
const CYP_FOLIAGE_Y = num(foliageSrc, /<mesh castShadow geometry=\{foliageGeo\} position=\{\[0, ([\d.]+), 0\]\}/);

/** The Tavern-side cypress (x = −11.5, z = 8.55 → px 0, zi 1). */
const CYPRESS: Cyl[] = [
  {
    kind: 'cyl',
    n: 'cypress.planter',
    x: CYP_X[0],
    z: CYP_Z[1],
    r: CYP_PLANTER[1] * CYP_SCALE,
    y: [0, (CYP_PLANTER_Y + CYP_PLANTER[2] / 2) * CYP_SCALE],
  },
  {
    kind: 'cyl',
    n: 'cypress.trunk',
    x: CYP_X[0],
    z: CYP_Z[1],
    r: CYP_TRUNK[1] * CYP_SCALE,
    y: [(CYP_TRUNK_Y - CYP_TRUNK[2] / 2) * CYP_SCALE, (CYP_TRUNK_Y + CYP_TRUNK[2] / 2) * CYP_SCALE],
  },
];
/** The crown's lowest world Y — asserted to sit above every patio prop (section D). */
const CYP_CROWN_BASE_Y = CYP_FOLIAGE_Y * CYP_SCALE;

const TAVERN_BENCH = triple(streetsSrc, /<RomanBench position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotationY=\{Math\.PI \/ 4\} \/>/);
/** CityStreets' barrels, picked the way C-8.22 picks the Tavern forecourt pair. */
const STREET_BARRELS = all(
  streetsSrc,
  /<WineBarrel position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}( isLyingDown=\{true\})? rotationY=\{([\d.]+)\} \/>/g,
).map((m) => ({
  pos: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
  lying: Boolean(m[4]),
  yaw: Number(m[5]),
}));
const FORECOURT_BARRELS = [
  STREET_BARRELS.find((b) => !b.lying)!,
  STREET_BARRELS.find((b) => b.lying && b.pos[0] < -10)!,
];

const BENCH_SRC = /export const RomanBench[\s\S]*?export const RomanAmphora/.exec(civicSrc)![0];
const BENCH_SEAT = triple(BENCH_SRC, /Polished Travertine \/ Marble Seat Slab[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const BENCH_SEAT_Y = num(BENCH_SRC, /Polished Travertine \/ Marble Seat Slab[\s\S]*?<mesh castShadow receiveShadow position=\{\[\s*0,\s*([\d.]+),\s*0\]\}>/);
const BENCH_LEG_X = pair(BENCH_SRC, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(lx, li\)/);
const BENCH_FOOT = triple(BENCH_SRC, /Base foot plinth[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);

/**
 * The C-8.22 neighbours as conservative plan circumferences: the 45°-rotated bench
 * by its widest part's half-diagonal (seat slab, then the leg feet), and the two
 * barrels exactly — the upright by its radius, the lying one by its true axis.
 */
const NEIGHBOURS: Solid[] = (() => {
  const out: Solid[] = [];
  const [bx, by, bz] = TAVERN_BENCH;
  const legReach = Math.max(
    ...BENCH_LEG_X.map((lx) => Math.hypot(Math.abs(lx) + BENCH_FOOT[0] / 2, BENCH_FOOT[2] / 2)),
  );
  const seatReach = Math.hypot(BENCH_SEAT[0] / 2, BENCH_SEAT[2] / 2);
  out.push({
    kind: 'cyl',
    n: 'c822.bench',
    x: bx,
    z: bz,
    r: Math.max(legReach, seatReach),
    y: [by, by + BENCH_SEAT_Y + BENCH_SEAT[1] / 2],
  });
  for (const b of FORECOURT_BARRELS) {
    if (b.lying) out.push(lyingAxis(b.pos, b.yaw, 'c822.barrelLying'));
    else
      out.push({
        kind: 'cyl',
        n: 'c822.barrelUpright',
        x: b.pos[0],
        z: b.pos[2],
        r: BARREL_R,
        y: [b.pos[1], b.pos[1] + BARREL_H],
      });
  }
  return out;
})();

// ── The paved streets, so "not in the street" is checked rather than assumed ──

interface StreetRect {
  id: string;
  cx: number;
  cz: number;
  w: number;
  l: number;
  yaw: number;
}
const STREETS: StreetRect[] = (() => {
  const out: StreetRect[] = [];
  const via = /<RomanPavedStreet\s+position=\{\[\s*(-?[\d.]+),\s*[\d.]+,\s*(-?[\d.]+)\s*\]\}\s+rotation=\{\[\s*0,\s*(-?)\s*Math\.PI \/ (\d+),\s*0\s*\]\}\s+length=\{([\d.]+)\}\s+width=\{([\d.]+)\}/.exec(streetsSrc);
  if (via) {
    out.push({
      id: 'via-tabernaria',
      cx: Number(via[1]),
      cz: Number(via[2]),
      yaw: (via[3] === '-' ? -1 : 1) * (Math.PI / Number(via[4])),
      l: Number(via[5]),
      w: Number(via[6]),
    });
  }
  for (const m of all(streetsSrc, /<RomanPavedStreet\s+position=\{\[\s*(-?[\d.]+),\s*[\d.]+,\s*(-?[\d.]+)\s*\]\}\s+axis="x"\s+length=\{([\d.]+)\}\s+width=\{([\d.]+)\}/g)) {
    out.push({ id: `x-street@${m[1]}`, cx: Number(m[1]), cz: Number(m[2]), yaw: 0, l: Number(m[3]), w: Number(m[4]) });
  }
  for (const m of all(streetsSrc, /<RomanPavedStreet\s+position=\{\[\s*(-?[\d.]+),\s*[\d.]+,\s*(-?[\d.]+)\s*\]\}\s+axis="z"\s+length=\{([\d.]+)\}\s+width=\{([\d.]+)\}/g)) {
    out.push({ id: `z-street@${m[1]}`, cx: Number(m[1]), cz: Number(m[2]), yaw: Math.PI / 2, l: Number(m[3]), w: Number(m[4]) });
  }
  return out;
})();

/** True when the prop's plan box shares ground with the street's paved rectangle. */
function overlapsStreet(s: Solid, street: StreetRect): boolean {
  const c = Math.cos(street.yaw);
  const sn = Math.sin(street.yaw);
  const xs = planX(s);
  const zs = planZ(s);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const x of xs) {
    for (const z of zs) {
      const lx = (x - street.cx) * c - (z - street.cz) * sn;
      const lz = (x - street.cx) * sn + (z - street.cz) * c;
      minX = Math.min(minX, lx);
      maxX = Math.max(maxX, lx);
      minZ = Math.min(minZ, lz);
      maxZ = Math.max(maxZ, lz);
    }
  }
  return maxX > -street.w / 2 && minX < street.w / 2 && maxZ > -street.l / 2 && minZ < street.l / 2;
}

// ── Pair helpers ──────────────────────────────────────────────────────────

type Row = { pair: string; c: number };
/** Every prop against every target (composite parts — one `stack.` prefix — stay internal). */
function pairs(props: Solid[], targets: Solid[]): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < props.length; i++) {
    for (let j = i + 1; j < props.length; j++) {
      if (props[i].n.split('.')[0] === props[j].n.split('.')[0]) continue;
      out.push({ pair: `${props[i].n} ↔ ${props[j].n}`, c: clearance(props[i], props[j]) });
    }
    for (const t of targets) out.push({ pair: `${props[i].n} ↔ ${t.n}`, c: clearance(props[i], t) });
  }
  return out.sort((a, b) => a.c - b.c);
}
/**
 * The two seats that are contacts by construction rather than gaps to hold — a cup
 * seats 0.005 into the table top and the lying barrel rests on the upright one's rim
 * (that pair is internal to the `stack.` composite and is asserted on its own).  They
 * are excluded from the "no intersection" filters and from the worst-gap rolls.
 */
const isContact = (r: Row) => /table ↔ cup/.test(r.pair);
const gapsOnly = (rows: Row[]) => rows.filter((r) => !isContact(r));
const worst = (rows: Row[]) => gapsOnly(rows).reduce((a, b) => (b.c < a.c ? b : a), { pair: '', c: Infinity });
const at = (rows: Row[], name: string) => {
  const row = rows.find((r) => r.pair === name);
  if (!row) throw new Error(`pair not evaluated: ${name}`);
  return row.c;
};

const ARCHITECTURE: Solid[] = [...TAVERN_PIECES, ...YARD];
const ARCH_ROWS = pairs(PROPS, ARCHITECTURE);
const PROP_ROWS = pairs(PROPS, []);
const NEIGHBOUR_ROWS = pairs(PROPS, [...NEIGHBOURS, ...CYPRESS]);

// ══════════════════════════════════════════════════════════════════════════
// A. The source declares the re-seated group
// ══════════════════════════════════════════════════════════════════════════

describe('A. The source declares the re-seated group', () => {
  test('the anchor left the C-8.23 baseline, and neither group carries rotation or scale', () => {
    expect(tavernSrc).not.toContain('<group position={[3.6, 0, 2.2]}>');
    expect(TAVERN_TAG).toBe('<group position={[-16, 0, 14]}>');
    expect(PATIO_TAG).toBe('<group position={[-2.8, 0, -5.4]}>');
    expect(PATIO).toEqual([-2.8, 0, -5.4]);
    expect(TAVERN_ROOT).toEqual([-16, 0, 14]);
  });

  test('the table, cups, amphorae and barrels keep their primitive forms', () => {
    expect(TABLE_LP).toEqual([-0.47, 0.5, 0.75]);
    expect(TABLE_SIZE).toEqual([1.4, 0.9, 1.2]);
    expect(CUPS.map((c) => [c.rTop, c.rBottom, c.h])).toEqual([
      [0.08, 0.06, 0.15],
      [0.08, 0.06, 0.15],
    ]);
    expect(AMPHORAE.map((a) => [a.lx, a.lz, a.scale, a.tone])).toEqual([
      [0.7, 0.35, 0.8, 'terracotta'],
      [0.7, 1.1, 0.75, 'dark'],
    ]);
    expect(BARRELS.map((b) => [b.lp[0], b.lp[1], b.lp[2], b.lying, b.yaw])).toEqual([
      [-0.37, 0, -0.45, false, 0],
      [-0.37, 0.9, -0.45, true, 0],
    ]);
    // The stack is repaired: the lying barrel used to sit 0.18 inside the upright one.
    expect(BARRELS[1].lp[1]).toBeCloseTo(BARREL_Y_UP + BARREL_H / 2, 10);
    expect(tavernSrc).not.toContain('position={[-0.8, 0.72, -1.8]}');
  });

  test('the primitives still carry the dimensions the world footprints assume', () => {
    expect(AMPHORA_BELLY_R).toBe(0.26);
    expect(AMPHORA_TOP).toBeCloseTo(0.935, 10);
    expect([BARREL_BODY[0], BARREL_BODY[1], BARREL_H]).toEqual([0.34, 0.38, 0.9]);
    expect(BARREL_R).toBe(0.38);
    expect([BARREL_Y_LYING, BARREL_Y_UP]).toEqual([0.38, 0.45]);
    expect(CYP_SCALE).toBe(1.05);
    expect(CYP_PLANTER[1] * CYP_SCALE).toBeCloseTo(0.8925, 10);
  });

  test('the props land on the terrace, north of every façade face', () => {
    expect(TABLE.x[0]).toBeCloseTo(-19.97, 6);
    expect(TABLE.x[1]).toBeCloseTo(-18.57, 6);
    expect(TABLE.z[0]).toBeCloseTo(8.75, 6);
    expect(TABLE.z[1]).toBeCloseTo(9.95, 6);
    expect(BARREL_UPRIGHT.x).toBeCloseTo(-19.17, 6);
    expect(BARREL_UPRIGHT.z).toBeCloseTo(8.15, 6);
    expect(BARREL_LYING.p0.y).toBeCloseTo(1.28, 6);
    // Axis along ±X, so the stack spans X[-20.0, -18.34] Z[7.77, 8.53].
    expect(BARREL_LYING.p0.x).toBeCloseTo(-18.72, 6);
    expect(BARREL_LYING.p1.x).toBeCloseTo(-19.62, 6);
    for (const p of PROPS) {
      expect(planZ(p)[1], `${p.n} is south of the façade`).toBeLessThan(TAVERN_PIECES[2].z[0]);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. Every prop clears the façade and both plinth steps
// ══════════════════════════════════════════════════════════════════════════

describe('B. Every patio prop clears the rendered façade and both plinth steps', () => {
  test("the wall and both steps are the source's own boxes, not one envelope", () => {
    expect(WALL_Y).toBe(3.2);
    expect(WALL_SIZE).toEqual([8.4, 6.4, 7.2]);
    expect(FOUNDATION).toEqual([8.4, 7.2]);
    expect(FOUNDATION_PROJECTION).toBe(0.25);
    expect(TAVERN_PIECES[0].x[0]).toBeCloseTo(-20.45, 10);
    expect(TAVERN_PIECES[0].x[1]).toBeCloseTo(-11.55, 10);
    expect(TAVERN_PIECES[0].z[0]).toBeCloseTo(10.15, 10);
    expect(TAVERN_PIECES[0].z[1]).toBeCloseTo(17.85, 10);
    expect(TAVERN_PIECES[1].x[0]).toBeCloseTo(-20.35, 10);
    expect(TAVERN_PIECES[1].z[0]).toBeCloseTo(10.25, 10);
    expect(TAVERN_PIECES[2].z[0]).toBeCloseTo(10.4, 10);
    // The three north faces step outward as they descend: -0.25, -0.15, then the wall.
    expect(TAVERN_PIECES[0].z[0]).toBeLessThan(TAVERN_PIECES[1].z[0]);
    expect(TAVERN_PIECES[1].z[0]).toBeLessThan(TAVERN_PIECES[2].z[0]);
  });

  test('the C-8.23 baseline really did reach into the steps — the defect this closes', () => {
    // Recomputed from the baseline's own transforms (frozen in phaseC8_23.test.ts) plus
    // the belly's radius/height and the parsed steps.  C-8.23 checked the wall *face*
    // only, so this step penetration was never reported before this phase.
    const [rx, , rz] = TAVERN_ROOT;
    const BASELINE_ANCHOR = [3.6, 0, 2.2];
    expect([rx + BASELINE_ANCHOR[0], rz + BASELINE_ANCHOR[2]]).toEqual([-12.4, 16.2]);
    const upperEast = rx + (FOUNDATION[0] + FOUNDATION_PROJECTION * 1.2) / 2;
    expect(upperEast).toBeCloseTo(-11.65, 10);
    const upperTop = FOUNDATION_HEIGHT;
    /**
     * How far a jar's belly crossed the upper step's east face.  Each belly centre
     * (0.42 × scale) sits just above the step's top plane (0.3), so the widest point
     * *inside* the step's Y band is at that plane — the sphere's radius there, not
     * the belly's full radius, is what reaches the face.
     */
    const intoUpperStep = (jarWorldX: number, scale: number) => {
      const r = AMPHORA_BELLY_R * scale;
      const dy = upperTop - AMPHORA_BELLY_Y * scale;
      const rAtTop = Math.sqrt(Math.max(r * r - dy * dy, 0));
      return upperEast - (jarWorldX - rAtTop);
    };
    expect(intoUpperStep(-12.4 + 0.9, 0.8)).toBeCloseTo(0.0549, 3);
    expect(intoUpperStep(-12.4 + 0.8, 0.75)).toBeCloseTo(0.1444, 3);
  });

  test('nothing intersects the wall, the plinth or a step', () => {
    expect(gapsOnly(ARCH_ROWS).filter((r) => r.c < 0)).toEqual([]);
  });

  test('the measured gaps, prop by prop', () => {
    expect(at(ARCH_ROWS, 'table ↔ plinth.lower')).toBeCloseTo(0.2, 4);
    expect(at(ARCH_ROWS, 'table ↔ plinth.upper')).toBeCloseTo(0.3, 4);
    expect(at(ARCH_ROWS, 'table ↔ wall')).toBeCloseTo(0.45, 4);
    expect(at(ARCH_ROWS, 'cup0 ↔ plinth.lower')).toBeCloseTo(1.0837, 3);
    expect(at(ARCH_ROWS, 'cup1 ↔ plinth.lower')).toBeCloseTo(0.9905, 3);
    expect(at(ARCH_ROWS, 'amphoraA ↔ plinth.lower')).toBeCloseTo(0.992, 3);
    expect(at(ARCH_ROWS, 'amphoraB ↔ plinth.lower')).toBeCloseTo(0.255, 4);
    expect(at(ARCH_ROWS, 'amphoraB ↔ plinth.upper')).toBeCloseTo(0.355, 4);
    expect(at(ARCH_ROWS, 'amphoraB ↔ wall')).toBeCloseTo(0.505, 4);
    expect(at(ARCH_ROWS, 'stack.upright ↔ plinth.lower')).toBeCloseTo(1.62, 4);
    expect(at(ARCH_ROWS, 'stack.lying ↔ plinth.lower')).toBeCloseTo(1.9246, 3);
  });

  test('the whole group keeps the 0.2 floor the neighbouring phases hold', () => {
    const w = worst(ARCH_ROWS);
    expect(w.c, w.pair).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(w.pair).toBe('table ↔ plinth.lower');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The Training Yard enclosure and the props' own clearances
// ══════════════════════════════════════════════════════════════════════════

describe('C. The props clear the Training Yard enclosure and each other', () => {
  test("the yard ring is the source's own shape, taken at its widest element", () => {
    expect(YARD_ROOT).toEqual([-18, 0, 0]);
    expect([YARD_R, YARD_H, YARD_T]).toEqual([7.0, 0.5, 0.35]);
    expect(YARD_CHORD).toBe(2.5);
    expect(YARD_SEGMENTS).toBe(14);
    expect(YARD_COPING).toEqual([0.04, 0.08, 0.06]);
    expect(YARD_COPING_LIFT).toBe(0.04);
    expect(PIER_DEFAULTS).toEqual([1.1, 0.5, 0.56]);
    expect(PIER_HEIGHT).toBe(0.65);
    expect(GATEPOST).toEqual([1.0, 0.6, 0.66]);
    expect(YARD[0].r).toBeCloseTo(7.205, 10);
    expect(YARD[0].y[0]).toBe(0);
    expect(YARD[0].y[1]).toBeCloseTo(0.58, 10);
    expect(YARD.map((p) => p.n)).toEqual([
      'yard.wall',
      'yard.pier3',
      'yard.pier6',
      'yard.pier9',
      'yard.pier12',
      'yard.gateW',
      'yard.gateE',
    ]);
  });

  test('every prop clears the wall ring and every pier', () => {
    const rows = ARCH_ROWS.filter((r) => /yard\./.test(r.pair));
    expect(rows.filter((r) => r.c < 0)).toEqual([]);
    expect(at(rows, 'stack.upright ↔ yard.wall')).toBeCloseTo(0.6486, 3);
    expect(at(rows, 'stack.lying ↔ yard.wall')).toBeCloseTo(0.8218, 3);
    expect(at(rows, 'table ↔ yard.wall')).toBeCloseTo(1.5636, 3);
    expect(at(rows, 'amphoraA ↔ yard.wall')).toBeCloseTo(1.5376, 3);
    expect(at(rows, 'amphoraB ↔ yard.wall')).toBeCloseTo(2.3005, 3);
    expect(worst(rows).c, worst(rows).pair).toBeGreaterThan(0.15);
  });

  test('the props clear one another — the stack, the table, the amphorae and the cups', () => {
    expect(gapsOnly(PROP_ROWS).filter((r) => r.c < -1e-9)).toEqual([]);
    // The cups seat by construction — the same 0.005 the original group shipped.
    expect(at(PROP_ROWS, 'table ↔ cup0')).toBeCloseTo(-0.005, 10);
    expect(at(PROP_ROWS, 'table ↔ cup1')).toBeCloseTo(-0.005, 10);
    expect(at(PROP_ROWS, 'table ↔ stack.upright')).toBeCloseTo(0.22, 4);
    expect(at(PROP_ROWS, 'table ↔ stack.lying')).toBeCloseTo(0.3048, 3);
    expect(at(PROP_ROWS, 'table ↔ amphoraA')).toBeCloseTo(0.262, 4);
    expect(at(PROP_ROWS, 'table ↔ amphoraB')).toBeCloseTo(0.275, 4);
    expect(at(PROP_ROWS, 'amphoraA ↔ amphoraB')).toBeCloseTo(0.347, 4);
    expect(at(PROP_ROWS, 'amphoraA ↔ stack.upright')).toBeCloseTo(0.748, 3);
    expect(at(PROP_ROWS, 'amphoraA ↔ stack.lying')).toBeCloseTo(0.5842, 3);
    expect(at(PROP_ROWS, 'cup0 ↔ cup1')).toBeCloseTo(0.2672, 4);
    expect(worst(PROP_ROWS).c, worst(PROP_ROWS).pair).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(worst(PROP_ROWS).pair).toBe('table ↔ stack.upright');
  });

  test('the stack is a resting contact, not an intersection', () => {
    // The two barrels share their axis, so their separation is purely vertical: the
    // lying barrel's underside meets the upright one's rim plane at exactly 0.90.
    expect(clearance(BARREL_UPRIGHT, BARREL_LYING)).toBeCloseTo(0, 10);
    expect(bottomY(BARREL_LYING)).toBeCloseTo(BARREL_UPRIGHT.y[1], 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. Ground contact and vertical separation
// ══════════════════════════════════════════════════════════════════════════

describe('D. Ground contact and vertical separation', () => {
  test('the floor-standing props rest on the terrace and the cups on the table', () => {
    for (const a of AMPHORA_SOLID) expect(a.y[0], `${a.n} floats`).toBe(0);
    expect(BARREL_UPRIGHT.y[0]).toBe(0);
    // Unchanged from the original group: the table block clears the ground by 0.05
    // and each cup seats 0.005 into the table top.
    expect(TABLE.y[0]).toBeCloseTo(0.05, 10);
    for (const c of CUPS_SOLID) expect(c.y[0] - TABLE.y[1]).toBeCloseTo(-0.005, 10);
  });

  test('the lying barrel rests on the upright one and every top stays below the crown', () => {
    expect(bottomY(BARREL_LYING)).toBeCloseTo(0.9, 10);
    expect(topY(BARREL_LYING)).toBeCloseTo(1.66, 10);
    // The cypress crown starts at world Y 1.89, above the tallest patio prop, so it
    // shares no height band with anything in the group.
    expect(CYP_CROWN_BASE_Y).toBeCloseTo(1.89, 10);
    for (const p of PROPS) {
      expect(topY(p), `${p.n} reaches the crown band`).toBeLessThan(CYP_CROWN_BASE_Y);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The terrace's other occupants, the vegetation and the street
// ══════════════════════════════════════════════════════════════════════════

describe('E. The group stays clear of the terrace, the vegetation and the street', () => {
  test('the C-8.21 cypress and both C-8.22 forecourt barrels are untouched and clear', () => {
    expect(CYP_X).toEqual([-11.5, 11.5]);
    expect(CYP_Z).toEqual([-7.5, 8.55, 20]);
    expect(TAVERN_BENCH).toEqual([-13.8, 0, 8.4]);
    expect(FORECOURT_BARRELS.map((b) => [b.pos, b.lying])).toEqual([
      [[-15.5, 0, 9.1], false],
      [[-16.9, 0, 9.1], true],
    ]);
    expect(gapsOnly(NEIGHBOUR_ROWS).filter((r) => r.c < 0)).toEqual([]);
    expect(at(NEIGHBOUR_ROWS, 'table ↔ c822.barrelLying')).toBeCloseTo(0.895, 3);
    expect(at(NEIGHBOUR_ROWS, 'amphoraA ↔ c822.barrelLying')).toBeCloseTo(0.2963, 3);
    expect(at(NEIGHBOUR_ROWS, 'amphoraB ↔ c822.barrelLying')).toBeCloseTo(0.3169, 3);
    expect(at(NEIGHBOUR_ROWS, 'stack.lying ↔ c822.barrelLying')).toBeCloseTo(1.2894, 3);
    // The bench is modelled conservatively (a 45°-rotated 2.0 × 0.65 seat becomes its
    // circumscribed circle), so this floor is not the exact gap.
    const toNeighbours = NEIGHBOUR_ROWS.filter((r) => /c822\.|cypress\./.test(r.pair));
    expect(worst(toNeighbours).c, worst(toNeighbours).pair).toBeCloseTo(0.2963, 3);
    const cypress = NEIGHBOUR_ROWS.filter((r) => /cypress/.test(r.pair));
    expect(cypress.length).toBe(2 * PROPS.length);
    expect(cypress.every((r) => r.c > 5)).toBe(true);
  });

  test('no patio prop stands on any paved carriageway', () => {
    expect(STREETS.length).toBeGreaterThanOrEqual(4);
    const via = STREETS.find((s) => s.id === 'via-tabernaria')!;
    expect([via.cx, via.cz, via.l, via.w]).toEqual([-11, 8, 12, 7]);
    for (const p of PROPS) {
      for (const s of STREETS) {
        expect(overlapsStreet(p, s), `${p.n} stands on ${s.id}`).toBe(false);
      }
    }
  });

  test("the Tavern's fast-travel arrival stays clear of the group", () => {
    expect(FAST_TRAVEL_ARRIVALS.tavern).toEqual([-10, 14]);
    const [ax, az] = FAST_TRAVEL_ARRIVALS.tavern;
    for (const p of PROPS) {
      const x = planX(p);
      const z = planZ(p);
      const dx = Math.max(x[0] - ax, ax - x[1], 0);
      const dz = Math.max(z[0] - az, az - z[1], 0);
      expect(Math.hypot(dx, dz), `${p.n} crowds the tavern arrival`).toBeGreaterThan(2 * PLAYER_RADIUS);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Scope — the Tavern and every prior phase are untouched
// ══════════════════════════════════════════════════════════════════════════

describe('F. The phase re-seats the patio group and changes nothing else', () => {
  test('the Tavern keeps its entrance, openings, lighting and collider', () => {
    expect(TAVERN_ROOT).toEqual([-16, 0, 14]);
    expect(findRect('city-tavern')).toMatchObject({ cx: -16, cz: 14, hw: 9.4 / 2, hd: 7.7 / 2 });
    for (const preserved of [
      '<ClassicalDoorway\n        position={[4.22, 0, 0]}\n        rotation={[0, Math.PI / 2, 0]}\n        width={2.2}\n        height={3.0}\n        depth={0.45}',
      'position={[4.22, 4.8, -2.0]}',
      'position={[4.22, 4.8, 2.0]}',
      '<group position={[4.4, 4.2, 0]}>',
      '<WallCornice size={[8.4, 7.2]} y={3.2}',
      '<WallCornice size={[8.4, 7.2]} y={6.35}',
      'ridgeAlong="z"',
      'position={[4.4, 3.6, lz]}',
      '<CornerQuoins height={6.4} buildingSize={[8.4, 7.2]}',
    ]) {
      expect(tavernSrc).toContain(preserved);
    }
  });

  test('no patio prop gained a collider — the registry holds buildings and walls only', () => {
    expect(CITY_COLLIDERS.filter((c) => /patio|amphora|barrel|^table|cup|stack/.test(c.id))).toEqual([]);
  });

  test('the C-8.18, C-8.19, C-8.21, C-8.22 and C-8.23 corrections are preserved', () => {
    expect(findRect('records-library')).toMatchObject({ cx: 23.1, cz: -30, hw: 3.25, hd: 2.85 });
    expect(avenueSrc).toContain('[-7.5, 8.55, 20].map((pz, zi)');
    expect(streetsSrc).toContain('<MerchantCart position={[10.8, 0, -1.7]} rotationY={Math.PI / 4} />');
    expect(streetsSrc).toContain('<MerchantPropsCluster position={[11.9, 0, 5.2]} />');
    expect(streetsSrc).toContain('<RomanBench position={[-13.8, 0, 8.4]} rotationY={Math.PI / 4} />');
    expect(streetsSrc).toContain('<WineBarrel position={[-15.5, 0, 9.1]} rotationY={0.3} />');
    expect(streetsSrc).toContain('<WineBarrel position={[-16.9, 0, 9.1]} isLyingDown={true} rotationY={0.5} />');
    expect(streetsSrc).toContain('<RomanBench position={[27.5, 0, -22.0]} rotationY={-Math.PI / 2}');
    expect(streetsSrc).toContain('<group position={[24.9, 0, -21.6]}>');
    expect(streetsSrc).toContain('<torusGeometry args={[3.0, 0.08, 6, 24, 5.106]} />');
    expect(streetsSrc).toContain('rotation={[-Math.PI / 2, 0, 2.8619]}');
    expect(FAST_TRAVEL_ARRIVALS.tavern).toEqual([-10, 14]);
  });

  test('the earlier suites are neither deleted nor relaxed', () => {
    for (const preserved of [
      'expect(CYPRESS_Z).toEqual([-7.5, 8.55, 20]);',
      'expect(CART_POS).toEqual([10.8, 0, -1.7]);',
      'expect(rows[0].clearance).toBeCloseTo(0.4909, 4);',
      'expect(worst.clearance).toBeCloseTo(0.7901, 3);',
    ]) {
      expect(c21).toContain(preserved);
    }
    for (const preserved of [
      'expect(TAVERN_BENCH).toEqual([-13.8, 0, 8.4]);',
      "expect(at(rows, 'crate ↔ plinth.lower')).toBeCloseTo(0.4, 4);",
      "expect(at(inner, 'barrelUpright ↔ barrelLying')).toBeCloseTo(0.268, 4);",
      'expect(OBELISK_POS).toEqual([24.9, 0, -21.6]);',
    ]) {
      expect(c22).toContain(preserved);
    }
    // C-8.23's section E was superseded here: its baseline is kept as frozen
    // literals — nothing deleted, nothing relaxed — and its defect arithmetic is
    // exactly as that phase wrote it.
    for (const preserved of [
      'const PATIO_C823 = [3.6, 0, 2.2] as const;',
      'expect(tableEast - TAVERN_WALL_HALF_X).toBeCloseTo(0.1, 10);',
      'expect(shifted + PATIO_AMPHORAE_C823[1].x - AMPHORA_BELLY_R * PATIO_AMPHORAE_C823[1].scale).toBeLessThan(TAVERN_WALL_HALF_X);',
      'expect(patio).toEqual([-2.8, 0, -5.4]);',
    ]) {
      expect(c23).toContain(preserved);
    }
  });
});
