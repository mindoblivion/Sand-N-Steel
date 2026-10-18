/**
 * Phase C-8.60 — Veteran Gladiator Hall: the wreath and the doorway head, clear of the pediment.
 *
 * ── THE DEFECT (re-derived here from the shipped transforms, not restated) ──
 * C-8.57 moved the hall's portico 0.12 forward and 0.20 up, and left the entrance's two
 * decorations where they had been: the doorway group at local Z 2.58, and the laurel wreath at
 * `[0, 1.1, 0.1]` inside the trophy group at `[0, 1.6, 2.62]` — i.e. at local (0, 2.70, 2.72) —
 * with `rotation={[Math.PI / 2, 0, 0]}`. Measured against the real solids (§H replays every
 * figure through the identical predicates):
 *
 *   • the wreath ∩ the pediment's architrave        the ring's front arc reaches Z 3.13; the
 *   • the wreath ∩ the LEFT raking cornice           architrave's band is Z 2.90 … 3.90 and
 *   • the wreath ∩ the RIGHT raking cornice          both rakes' bands start at Z 2.825
 *   • the doorway's projecting cornice cap ∩ BOTH raking cornices — 0.05 deep in Z
 *
 * and, in the same frame, four more solids the audit did not name: because
 * `[Math.PI / 2, 0, 0]` turns a torus's own XY plane through a right angle, the ring lies FLAT in
 * the ground plane, and its 0.06 tube passes through the doorway's lintel, the wall cornice, the
 * roof's eave plate and the wall box itself. The decoration read edge-on and was buried in seven
 * solids, not three.
 *
 * ── THE CORRECTION (one transform and one literal, both inside the hall) ──
 *   | quantity | before | after |
 *   |---|---|---|
 *   | doorway group Z | 2.58 | **2.50** |
 *   | wreath position (in the trophy group) | `[0, 1.1, 0.1]` | **`[0, 1.81, 1.19]`** |
 *   | wreath rotation | `[Math.PI / 2, 0, 0]` | **`[0, 0, 0]`** |
 *   | wreath torus | `[0.35, 0.06, 6, 12]` | **`[0.28, 0.06, 6, 12]`** |
 *
 * The doorway steps 0.08 back: its cap is `depth + 0.12` (0.47) deep about local Z 0.06, so its
 * front face moves 2.875 → 2.795 and clears the rakes' 2.825 by 0.03 where it used to reach 0.05
 * into them; the lintel clears by 0.08 and the jambs follow the group back, still proud of the
 * wall's 2.60 face. The wreath is re-hung: with no rotation a torus lies in the plane it is drawn
 * in, so the ring faces the street and its back face seats on the pediment's tympanum panel at
 * Z 3.75 — the panel's own plane plus the 0.06 tube — reading as a wreath hung in the gable.
 * 0.28 is the largest major radius that held the project's 0.02 tolerance against the rakes of the
 * day, the V they then described on the axis (§H's control shows why the audit's 0.35 → 0.10
 * candidate and a kept 0.35 both fail). **Phase C-8.62 has since corrected the shared primitive** —
 * each rake now follows its own gable edge to the apex — and the ring it left keeps a LARGER margin
 * (rake clearance 0.0330 → 0.0361578674), so 0.28 is no longer the binding choice here even though
 * nothing in this phase moved. The band keeps the weight it had: the tube is still 0.06, only the
 * diameter comes in, 0.70 → 0.56.
 *
 * ── HOW THIS SUITE MEASURES IT ────────────────────────────────────────────
 * Nothing here is a copied constant. The hall's transforms and props are parsed from its source,
 * the shared primitives' coefficients from `ClassicalArchitecture.tsx` and applied as the real
 * formulas, and every clearance is then DERIVED from those parsed values. The solids are the real
 * ones, not axis-aligned bounds: the two raking cornices are boxes rotated about Z and are tested
 * with a separating-axis test, and the wreath is a torus whose distance to a box is computed
 * exactly (the box's radial reach about the ring's centre, folded with its offset along the ring's
 * axis). §G sweeps every solid in the building against the re-hung wreath, and §H replays the
 * pre-fix transforms — and the audit's own candidate — through the identical predicates.
 *
 * ASSUMPTIONS, stated: `ClassicalPediment`'s rake orientation was NOT touched by this phase — its
 * rakes still swept down to the axis as a V rather than following the gable's edges, which is why
 * the wreath's usable area on the tympanum was the band above that V. **Phase C-8.62 has since
 * corrected the shared primitive** (each rake follows its own gable edge, the run is the
 * corner-to-apex `rafterLen` with no extra length, the section is 0.16, and the acroterion rides the
 * derived `crownLift`); every figure this suite measures on the primitive is therefore re-derived
 * from the corrected source, and the pins the correction moved are marked "Rebased by C-8.62" in
 * place — the two rake clearances 0.0330 → 0.0361578674, the finial gap 0.17 → 0.2415541753, the
 * finial-vs-ridge-cap relationship 0.045 → −0.0265541753, and the pre-fix control's flat ring, which
 * no longer reaches the corrected rakes. The doorway's optional arched
 * lunette is compared as its own bounding box, which is conservative for the half-cylinder it
 * draws; and no assertion here speaks about rendered appearance — a source-geometry suite pins
 * transforms, and the Android look remains a device question.
 *
 * Run with: bun test src/utils/phaseC8_60.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type RectCollider,
} from './collisionShapes';
import {
  HUB_LOCATIONS,
  FAST_TRAVEL_ARRIVALS,
  getNearbyHubLocation,
} from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const hallSrc = load('../components/3d/city/VeteranGladiatorHall.tsx');
const colSrc = load('../components/3d/city/ClassicalArchitecture.tsx');
const shapesSrc = load('./collisionShapes.ts');
const citySrc = load('./cityCollisions.ts');

type V3 = [number, number, number];

/** The project's seating/clearance tolerance — the architrave, C-8.52, C-8.53, C-8.55, C-8.57. */
const TOL = 0.02;
/** `RomanGabledRoof`'s bearing cornice thickness (the eave plate). */
const FASCIA_H = 0.16;

// ── Tiny parsers (the style of the C-8.18 … C-8.57 suites) ────────────────

function nums(src: string, re: RegExp): number[] {
  const m = re.exec(src);
  if (!m) throw new Error(`not found: ${re}`);
  return m.slice(1).map(Number);
}
const num = (src: string, re: RegExp): number => nums(src, re)[0];
function triple(src: string, re: RegExp): V3 {
  const n = nums(src, re);
  return [n[0], n[1], n[2]];
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const halfPi = (t: string): number =>
  t.includes('-Math.PI / 2') ? -Math.PI / 2 : t.includes('Math.PI / 2') ? Math.PI / 2 : Number(t.trim());
/** A `[a, b, c]` rotation literal, with `Math.PI / 2` terms resolved. */
const rot3 = (m: RegExpExecArray | null, what: string): V3 => {
  if (!m) throw new Error(`not found: ${what}`);
  return [halfPi(m[1]), halfPi(m[2]), halfPi(m[3])];
};
/** Both bounds of an interval, to the suite's own precision. */
const expectInterval = (actual: [number, number], lo: number, hi: number) => {
  expect(actual[0]).toBeCloseTo(lo, 9);
  expect(actual[1]).toBeCloseTo(hi, 9);
};

// ── Real solids: oriented boxes, and the torus ────────────────────────────
// Everything in this building rotates about Z only, so an OBB is a centre, three half-extents
// along its own unit axes, the third of which is the world Z axis.

interface OBB {
  c: V3;
  h: V3;
  u: [V3, V3, V3];
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

/** A box of `size` centred at `c`, rotated `rz` about Z. */
function box(c: V3, size: V3, rz = 0): OBB {
  const s = Math.sin(rz);
  const co = Math.cos(rz);
  return {
    c,
    h: [size[0] / 2, size[1] / 2, size[2] / 2],
    u: [
      [co, s, 0],
      [-s, co, 0],
      [0, 0, 1],
    ],
  };
}
/** A vertical cylinder/frustum of radius `r` and height `h`, bounded as its own box. */
const cyl = (c: V3, r: number, h: number): OBB => box(c, [2 * r, h, 2 * r]);

/** Boxes share volume? Separating-axis test over the 6 face normals plus all edge cross products. */
function boxesIntersect(a: OBB, b: OBB): boolean {
  const axes: V3[] = [...a.u, ...b.u];
  for (const x of a.u) {
    for (const y of b.u) {
      const c = cross(x, y);
      if (norm(c) > 1e-9) axes.push(c);
    }
  }
  const d = sub(b.c, a.c);
  for (const raw of axes) {
    const ax: V3 = [raw[0] / norm(raw), raw[1] / norm(raw), raw[2] / norm(raw)];
    const ra =
      a.h[0] * Math.abs(dot(ax, a.u[0])) +
      a.h[1] * Math.abs(dot(ax, a.u[1])) +
      a.h[2] * Math.abs(dot(ax, a.u[2]));
    const rb =
      b.h[0] * Math.abs(dot(ax, b.u[0])) +
      b.h[1] * Math.abs(dot(ax, b.u[1])) +
      b.h[2] * Math.abs(dot(ax, b.u[2]));
    if (Math.abs(dot(d, ax)) > ra + rb + 1e-12) return false;
  }
  return true;
}

/** The box's own interval along a unit axis. */
function intervalOn(b: OBB, ax: V3): [number, number] {
  const r =
    b.h[0] * Math.abs(dot(ax, b.u[0])) +
    b.h[1] * Math.abs(dot(ax, b.u[1])) +
    b.h[2] * Math.abs(dot(ax, b.u[2]));
  const p = dot(b.c, ax);
  return [p - r, p + r];
}
/** Separation of two boxes along an axis — negative when they overlap along it. */
function gapOn(a: OBB, b: OBB, ax: V3): number {
  const [a0, a1] = intervalOn(a, ax);
  const [b0, b1] = intervalOn(b, ax);
  return Math.max(b0 - a1, a0 - b1);
}
const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];

interface Ring {
  c: V3;
  R: number;
  r: number;
}
/** The ring's centre, `R` the major radius, `r` the tube. */
const ring = (c: V3, R: number, r: number): Ring => ({ c, R, r });

/**
 * Distance from a point to the rectangle it is the centre of: `A` and `B` are the rectangle's
 * half-vectors, so the rectangle is `{p + s·A + t·B : s, t ∈ [−1, 1]}`. Zero when the point is
 * inside — which is what the ring's own radial reach needs, since a box that holds the ring's axis
 * also holds every radius.
 */
function rectDist(p: [number, number], A: [number, number], B: [number, number]): number {
  const d2 = (u: [number, number], v: [number, number]): number => u[0] * v[0] + u[1] * v[1];
  const q: [number, number] = [-p[0], -p[1]]; // from the rectangle's centre to the point
  const aa = d2(A, A);
  const bb = d2(B, B);
  const ab = d2(A, B);
  let s = 0;
  let t = 0;
  const det = aa * bb - ab * ab;
  if (det > 1e-12) {
    s = (d2(q, A) * bb - d2(q, B) * ab) / det;
    t = (d2(q, B) * aa - d2(q, A) * ab) / det;
  } else if (aa > 1e-12) {
    s = d2(q, A) / aa;
  } else if (bb > 1e-12) {
    t = d2(q, B) / bb;
  }
  s = Math.max(-1, Math.min(1, s));
  t = Math.max(-1, Math.min(1, t));
  return Math.hypot(p[0] + s * A[0] + t * B[0], p[1] + s * A[1] + t * B[1]);
}
/**
 * Exact minimum distance between a box and a ring, minus the tube radius — negative when the box
 * holds ring material. The ring's radial coordinate over the box's own footprint is the interval
 * [nearest, farthest] (the footprint is convex, and a Z-rotated box's footprint is its rectangle),
 * and the box's offset along the ring's axis is independent of it, so the two fold together.
 */
function ringGap(b: OBB, t: Ring, axis: 'z' | 'y'): number {
  const flat = axis === 'y';
  let ctr: [number, number];
  let A: [number, number];
  let B: [number, number];
  if (!flat) {
    // the ring lies in the box's own XY plane
    ctr = [b.c[0] - t.c[0], b.c[1] - t.c[1]];
    A = [b.u[0][0] * b.h[0], b.u[0][1] * b.h[0]];
    B = [b.u[1][0] * b.h[1], b.u[1][1] * b.h[1]];
  } else {
    // the ring lies in the XZ plane: the footprint is the axis-aligned rectangle the box projects
    ctr = [b.c[0] - t.c[0], b.c[2] - t.c[2]];
    A = [Math.abs(b.u[0][0]) * b.h[0] + Math.abs(b.u[1][0]) * b.h[1], 0];
    B = [0, b.h[2]];
  }
  const rmin = rectDist(ctr, A, B);
  const rmax = Math.hypot(Math.abs(A[0]) + Math.abs(B[0]), Math.abs(A[1]) + Math.abs(B[1])) + 0;
  const far = Math.max(
    Math.hypot(ctr[0] + A[0] + B[0], ctr[1] + A[1] + B[1]),
    Math.hypot(ctr[0] + A[0] - B[0], ctr[1] + A[1] - B[1]),
    Math.hypot(ctr[0] - A[0] + B[0], ctr[1] - A[1] + B[1]),
    Math.hypot(ctr[0] - A[0] - B[0], ctr[1] - A[1] - B[1]),
  );
  const dR = t.R >= rmin && t.R <= Math.max(far, rmax) ? 0 : Math.min(Math.abs(t.R - rmin), Math.abs(t.R - Math.max(far, rmax)));
  const [a0, a1] = intervalOn(b, flat ? Y : Z);
  const centre = flat ? t.c[1] : t.c[2];
  const dA = Math.max(0, Math.max(a0 - centre, centre - a1));
  return Math.hypot(dR, dA) - t.r;
}
const wreathGapTo = (w: Wreath, b: OBB): number => ringGap(b, w.ring, w.flat ? 'y' : 'z');

interface Wreath {
  /** world (hall-local) centre */ c: V3;
  ring: Ring;
  /** true when the ring lies in the ground plane — the pre-fix orientation */ flat: boolean;
  rot: V3;
}
/**
 * A torus's own normal is +Z; a rotation maps it. With no rotation it still points at the viewer
 * (a face-on wreath); the pre-fix `[π/2, 0, 0]` sends it to −Y, i.e. the ring lies in the ground
 * plane and reads edge-on. Only the X term is non-zero in either frame, asserted where this is used.
 */
const ringNormal = (rot: V3): V3 => [0, -Math.sin(rot[0]), Math.cos(rot[0])];

// ── The hall's own frame (parsed from its source) ─────────────────────────

const HALL_ROOT = triple(
  hallSrc,
  /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 1\. TRAVERTINE/,
);
const STEP1_N = nums(
  hallSrc,
  /position=\{\[0, 0\.08, 0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const STEP2_N = nums(
  hallSrc,
  /position=\{\[0, 0\.24, ([\d.]+)\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const STEP2 = { pos: [0, 0.24, STEP2_N[0]] as V3, size: [STEP2_N[1], STEP2_N[2], STEP2_N[3]] as V3 };

const WALL_N = nums(
  hallSrc,
  /position=\{\[0, 1\.6, 0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const WALL = { pos: [0, 1.6, 0] as V3, size: [WALL_N[0], WALL_N[1], WALL_N[2]] as V3 };

/** `<WallCornice size={[5.7, 5.2]} y={2.75} … height={0.16} projection={0.12} />` */
const CORN = nums(
  hallSrc,
  /<WallCornice size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\} y=\{([\d.]+)\}[\s\S]*?height=\{([\d.]+)\} projection=\{([\d.]+)\}/,
);

/** `<RomanGabledRoof … eaveOverhang={ov} ridgeAlong="z" position={[0, 2.8, 0]}` */
const ROOF = {
  width: num(hallSrc, /<RomanGabledRoof\s*width=\{([\d.]+)\}/),
  depth: num(hallSrc, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
  height: num(hallSrc, /<RomanGabledRoof[\s\S]*?height=\{([\d.]+)\}/),
  eave: num(hallSrc, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
  pos: triple(hallSrc, /<RomanGabledRoof[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/),
};

const PORTICO = triple(
  hallSrc,
  /4\. ENTRANCE PORTICO FACADE[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/,
);
const COL_X = nums(hallSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(x, i\)/);
const COL = {
  y: num(hallSrc, /<ClassicalColumn[\s\S]*?position=\{\[x,\s*(-?[\d.]+),/),
  z: num(hallSrc, /<ClassicalColumn[\s\S]*?position=\{\[x,\s*-?[\d.]+,\s*(-?[\d.]+)\s*\]\}/),
  height: num(hallSrc, /<ClassicalColumn[\s\S]*?height=\{([\d.]+)\}/),
  radius: num(hallSrc, /<ClassicalColumn[\s\S]*?radius=\{([\d.]+)\}/),
};

const PED_N = nums(
  hallSrc,
  /<ClassicalPediment\s*width=\{([\d.]+)\}\s*depth=\{([\d.]+)\}\s*height=\{([\d.]+)\}\s*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);
const PED = {
  width: PED_N[0],
  depth: PED_N[1],
  height: PED_N[2],
  pos: [PED_N[3], PED_N[4], PED_N[5]] as V3,
};

const BANNER_L = triple(hallSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} ref=\{bannerLeftRef\}/);
const BANNER_R = triple(hallSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} ref=\{bannerRightRef\}/);

/** This phase's two changed transforms. */
const DOOR = triple(hallSrc, /<ClassicalDoorway\s*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/);
const DOOR_N = nums(
  hallSrc,
  /<ClassicalDoorway\s*position=\{\[[^\]]*\]\}\s*width=\{([\d.]+)\}\s*height=\{([\d.]+)\}\s*depth=\{([\d.]+)\}/,
);
const TROPHY = triple(
  hallSrc,
  /6\. SIMPLE TROPHY SHIELDS[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);
const WREATH_POS = triple(
  hallSrc,
  /Golden Bronze Laurel Wreath[\s\S]*?<mesh position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);
const WREATH_ROT: V3 = rot3(
  /Golden Bronze Laurel Wreath[\s\S]*?<mesh position=\{\[[^\]]*\]\} rotation=\{\[\s*([^,\]]+),\s*([^,\]]+),\s*([^\]]+)\s*\]\}/.exec(hallSrc),
  'wreath rotation',
);
const WREATH_TORUS = nums(
  hallSrc,
  /<torusGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const WINDOW = triple(
  hallSrc,
  /<ClassicalWindow\s*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);

// ── The shared primitives' own coefficients (parsed, then applied) ────────

const DOOR_F = {
  jambW: num(colSrc, /const jambWidth = ([\d.]+);/),
  lintelH: num(colSrc, /const lintelHeight = ([\d.]+);/),
  /** the optional arched lunette: `<group position={[0, height + lintelHeight + 0.45, 0.02]}>` */
  archDrop: nums(colSrc, /<group position=\{\[0, height \+ lintelHeight \+ ([\d.]+), ([\d.]+)\]\}>/),
  archScale: num(colSrc, /<cylinderGeometry\s*args=\{\[width \* ([\d.]+), width \* [\d.]+, depth, 14, 1, false, 0, Math\.PI\]\}/),
  /** the keystone block: `position={[0, width * 0.52, 0.04]}`, `[0.26, 0.35, depth + 0.08]` */
  key: nums(colSrc, /<mesh castShadow position=\{\[0, width \* ([\d.]+), ([\d.]+)\]\}>\s*<boxGeometry args=\{\[([\d.]+),\s*([\d.]+),\s*depth \+ ([\d.]+)\]/),
  /** the projecting cornice cap's own box and drop */
  cap: nums(colSrc, /<mesh castShadow position=\{\[0, height \+ lintelHeight \+ ([\d.]+), ([\d.]+)\]\}>\s*<boxGeometry args=\{\[width \+ jambWidth \* 2 \+ ([\d.]+), ([\d.]+), depth \+ ([\d.]+)\]/),
  lintel: nums(colSrc, /<mesh castShadow position=\{\[0, height \+ lintelHeight \/ 2, ([\d.]+)\]\}>\s*<boxGeometry args=\{\[width \+ jambWidth \* 2 \+ ([\d.]+), lintelHeight, depth \+ ([\d.]+)\]/),
};
const ROOF_F = {
  fasciaX: num(colSrc, /<boxGeometry args=\{\[width \+ eaveOverhang \* ([\d.]+), 0\.16, depth \+ eaveOverhang \* 1\.2\]\}/),
  fasciaY: num(colSrc, /<mesh castShadow receiveShadow position=\{\[0, (-?[\d.]+), 0\]\}>\s*<boxGeometry args=\{\[width \+ eaveOverhang/),
  tileT: num(colSrc, /const tileThickness = ([\d.]+);/),
  slopeDrop: num(colSrc, /position=\{\[-halfSpan \/ 2, height \/ 2 \+ ([\d.]+), 0\]\}/),
  ridgeDrop: nums(
    colSrc,
    /<mesh castShadow position=\{\[0, height \+ tileThickness \/ 2 \+ ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[([\d.]+),\s*([\d.]+),\s*fullLength \+ ([\d.]+)\]/,
  ),
};
const PED_F = {
  entab: nums(colSrc, /<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[width \+ ([\d.]+), ([\d.]+), depth \+ ([\d.]+)\]\}/),
  frieze: nums(colSrc, /<mesh position=\{\[0, (-?[\d.]+), depth \/ 2 \+ ([\d.]+)\]\}>\s*<boxGeometry args=\{\[width \+ ([\d.]+), ([\d.]+), ([\d.]+)\]/),
  tymp: nums(colSrc, /<mesh position=\{\[0, ([\d.]+), depth \/ 2 - ([\d.]+)\]\}>\s*<shapeGeometry/),
  // Phase C-8.62 corrected the rakes: `+slopeAngle` (left) / `−slopeAngle` (right), a run of
  // `rafterLen` with no extra, the primitive's own `rakeThickness`, and the derived `crownLift`
  // under the acroterion. All of it is parsed, so this suite builds what the primitive writes.
  rakeDrop: num(colSrc, /position=\{\[-halfBase \/ 2, ([\d.]+) \+ height \/ 2, 0\]\}/),
  rakeSignL: /position=\{\[-halfBase \/ 2, [\d.]+ \+ height \/ 2, 0\]\}\s*rotation=\{\[0, 0, (-?)slopeAngle\]\}/.exec(colSrc)?.[1] === '-' ? -1 : 1,
  rakeSignR: /position=\{\[halfBase \/ 2, [\d.]+ \+ height \/ 2, 0\]\}\s*rotation=\{\[0, 0, (-?)slopeAngle\]\}/.exec(colSrc)?.[1] === '-' ? -1 : 1,
  rakeThickness: num(colSrc, /const rakeThickness = ([\d.]+);/),
  crownDivisor: num(colSrc, /const crownLift = Math\.cos\(slopeAngle\) \* \(rakeThickness \/ ([\d.]+)\);/),
  rakeDepth: num(colSrc, /<boxGeometry args=\{\[rafterLen, rakeThickness, depth \+ ([\d.]+)\]\}/),
  acro: nums(colSrc, /position=\{\[0, ([\d.]+) \+ height \+ ([\d.]+) \+ crownLift, depth \/ 2 \+ ([\d.]+)\]\}>\s*<boxGeometry args=\{\[([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/),
};
const COL_F = {
  plinthCap: num(colSrc, /const plinthHeight = Math\.min\(([\d.]+), height \* 0\.07\);/),
  plinthRatio: num(colSrc, /const plinthHeight = Math\.min\([\d.]+, height \* ([\d.]+)\);/),
  capitalCap: num(colSrc, /const capitalHeight = Math\.min\(([\d.]+), height \* 0\.09\);/),
  capitalRatio: num(colSrc, /const capitalHeight = Math\.min\([\d.]+, height \* ([\d.]+)\);/),
  shaftTaper: num(colSrc, /const shaftRadiusTop = radius \* ([\d.]+);/),
  baseDrop: num(colSrc, /<mesh position=\{\[0, plinthHeight \+ ([\d.]+), 0\]\}>/),
  baseBotScale: num(colSrc, /<cylinderGeometry args=\{\[radius \* 1\.25, radius \* ([\d.]+), 0\.08, 12\]\}/),
  shaftDrop: num(colSrc, /position=\{\[0, plinthHeight \+ ([\d.]+) \+ shaftHeight \/ 2, 0\]\}/),
  neckDrop: num(colSrc, /<mesh position=\{\[0, height - capitalHeight - ([\d.]+), 0\]\}>/),
  neckScale: num(colSrc, /<cylinderGeometry args=\{\[shaftRadiusTop \* ([\d.]+),/),
  neckH: num(colSrc, /shaftRadiusTop \* [\d.]+, ([\d.]+), 12\]\}/),
  capitalTopScale: num(colSrc, /\) : \(\s*<cylinderGeometry args=\{\[radius \* ([\d.]+), shaftRadiusTop, capitalHeight, 12\]\}/),
  abacus: nums(colSrc, /<mesh castShadow position=\{\[0, height - ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[radius \* ([\d.]+), ([\d.]+), radius \* 2\.5\]\}/),
};

// ── Derived geometry (hall-local; the hall's root is added only where world matters) ──

interface Built {
  door: V3;
  port: V3;
  ped: V3;
  trophy: V3;
  wreath: Wreath;
  /** every solid in the entrance's own neighbourhood, by name */
  solids: Record<string, OBB>;
  roofMeta: { halfSpan: number; fullLength: number; slope: number; rafter: number; fascia: V3 };
}

/** Build the hall's entrance from a set of parameters; defaults are the shipped values. */
function build(P: { doorZ?: number; wreathPos?: V3; wreathRot?: V3; wreathR?: number; wreathTube?: number } = {}): Built {
  const doorZ = P.doorZ ?? DOOR[2];
  const wreathPos = P.wreathPos ?? WREATH_POS;
  const wreathRot = P.wreathRot ?? WREATH_ROT;
  const wreathR = P.wreathR ?? WREATH_TORUS[0];
  const wreathTube = P.wreathTube ?? WREATH_TORUS[1];
  const o: Record<string, OBB> = {};

  // the wall, its cornice and the roof's envelope
  o.wall = box(WALL.pos, WALL.size);
  const [cw, cd, cy, ch, cp] = CORN;
  o.cornF = box([0, cy, cd / 2 + cp / 2], [cw + cp * 2, ch, cp]);
  o.cornB = box([0, cy, -cd / 2 - cp / 2], [cw + cp * 2, ch, cp]);
  o.cornL = box([-cw / 2 - cp / 2, cy, 0], [cp, ch, cd]);
  o.cornR = box([cw / 2 + cp / 2, cy, 0], [cp, ch, cd]);
  const halfSpan = ROOF.width / 2 + ROOF.eave;
  const fullLength = ROOF.depth + ROOF.eave * 2;
  const slope = Math.atan2(ROOF.height, halfSpan);
  const rafter = Math.hypot(halfSpan, ROOF.height);
  const fasciaSize: V3 = [ROOF.width + ROOF.eave * ROOF_F.fasciaX, FASCIA_H, ROOF.depth + ROOF.eave * ROOF_F.fasciaX];
  o.fascia = box(add([0, ROOF_F.fasciaY, 0], ROOF.pos), fasciaSize);
  o.planeL = box(add([-halfSpan / 2, ROOF.height / 2 + ROOF_F.slopeDrop, 0], ROOF.pos), [rafter, ROOF_F.tileT, fullLength], slope);
  o.planeR = box(add([halfSpan / 2, ROOF.height / 2 + ROOF_F.slopeDrop, 0], ROOF.pos), [rafter, ROOF_F.tileT, fullLength], -slope);
  o.ridge = box(
    add([0, ROOF.height + ROOF_F.tileT / 2 + ROOF_F.ridgeDrop[0], 0], ROOF.pos),
    [ROOF_F.ridgeDrop[1], ROOF_F.ridgeDrop[2], fullLength + ROOF_F.ridgeDrop[3]],
  );

  // the stepped plinth
  o.step1 = box([0, 0.08, 0], [STEP1_N[0], STEP1_N[1], STEP1_N[2]]);
  o.step2 = box(STEP2.pos, STEP2.size);

  // the doorway group (this phase's 0.08 setback)
  const d = (v: V3): V3 => add([DOOR[0], DOOR[1], doorZ], v);
  const doorW = DOOR_N[0];
  const doorH = DOOR_N[1];
  const doorD = DOOR_N[2];
  o.doorRecess = box(d([0, doorH / 2, -doorD / 4]), [doorW, doorH, doorD / 2]);
  o.doorJambL = box(d([-(doorW / 2 + DOOR_F.jambW / 2), doorH / 2, 0.02]), [DOOR_F.jambW, doorH, doorD]);
  o.doorJambR = box(d([doorW / 2 + DOOR_F.jambW / 2, doorH / 2, 0.02]), [DOOR_F.jambW, doorH, doorD]);
  o.doorLintel = box(d([0, doorH + DOOR_F.lintelH / 2, DOOR_F.lintel[0]]), [doorW + DOOR_F.jambW * 2 + DOOR_F.lintel[1], DOOR_F.lintelH, doorD + DOOR_F.lintel[2]]);
  o.doorCap = box(d([0, doorH + DOOR_F.lintelH + DOOR_F.cap[0], DOOR_F.cap[1]]), [doorW + DOOR_F.jambW * 2 + DOOR_F.cap[2], DOOR_F.cap[3], doorD + DOOR_F.cap[4]]);
  o.doorThreshold = box(d([0, 0.06, 0.05]), [doorW + DOOR_F.jambW * 2 + 0.1, 0.12, doorD + 0.15]);
  // the lunette and its keystone, as their own bounding boxes (the lunette is a half-cylinder)
  const archR = doorW * DOOR_F.archScale;
  o.doorArch = box(d([archR / 2, doorH + DOOR_F.lintelH + DOOR_F.archDrop[0], DOOR_F.archDrop[1]]), [archR, doorD, archR * 2]);
  o.doorKeystone = box(
    d([0, doorH + DOOR_F.lintelH + DOOR_F.archDrop[0] + doorW * DOOR_F.key[0], DOOR_F.archDrop[1] + DOOR_F.key[1]]),
    [DOOR_F.key[2], DOOR_F.key[3], doorD + DOOR_F.key[4]],
  );

  // the portico: columns and pediment
  const port: V3 = [PORTICO[0], PORTICO[1], PORTICO[2]];
  const ped = add(port, PED.pos);
  const p = (v: V3): V3 => add(ped, v);
  const halfBase = PED.width / 2;
  const pSlope = Math.atan2(PED.height, halfBase);
  const pRafter = Math.hypot(halfBase, PED.height);
  o.architrave = box(p([0, PED_F.entab[0], 0]), [PED.width + PED_F.entab[1], PED_F.entab[2], PED.depth + PED_F.entab[3]]);
  o.frieze = box(p([0, PED_F.frieze[0], PED.depth / 2 + PED_F.frieze[1]]), [PED.width + PED_F.frieze[2], PED_F.frieze[3], PED_F.frieze[4]]);
  o.tympanumPlane = box(p([0, PED_F.tymp[0], PED.depth / 2 - PED_F.tymp[1]]), [PED.width - 0.3, PED.height - 0.1, 0]);
  // Phase C-8.62: the rakes rise to the apex over `rafterLen` and the acroterion seats on the
  // crowns that meet there, lifted by the primitive's derived `crownLift`.
  const crownLift = Math.cos(pSlope) * (PED_F.rakeThickness / PED_F.crownDivisor);
  o.rakeL = box(p([-halfBase / 2, PED_F.rakeDrop + PED.height / 2, 0]), [pRafter, PED_F.rakeThickness, PED.depth + PED_F.rakeDepth], PED_F.rakeSignL * pSlope);
  o.rakeR = box(p([halfBase / 2, PED_F.rakeDrop + PED.height / 2, 0]), [pRafter, PED_F.rakeThickness, PED.depth + PED_F.rakeDepth], PED_F.rakeSignR * pSlope);
  o.acro = box(p([0, PED_F.acro[0] + PED.height + PED_F.acro[1] + crownLift, PED.depth / 2 + PED_F.acro[2]]), [PED_F.acro[3], PED_F.acro[4], PED_F.acro[5]]);

  const colR = COL.radius;
  const colH = COL.height;
  const plinthH = Math.min(COL_F.plinthCap, colH * COL_F.plinthRatio);
  const capH = Math.min(COL_F.capitalCap, colH * COL_F.capitalRatio);
  const shaftH = colH - plinthH - capH;
  const shaftTop = colR * COL_F.shaftTaper;
  for (const x of COL_X) {
    const c = (y: number): V3 => add([x, y, COL.z], port);
    const t = x < 0 ? 'colL' : 'colR';
    o[`${t}Plinth`] = box(c(plinthH / 2), [colR * 2.6, plinthH, colR * 2.6]);
    o[`${t}Basering`] = cyl(c(plinthH + COL_F.baseDrop), colR * COL_F.baseBotScale, 0.08);
    o[`${t}Shaft`] = cyl(c(plinthH + COL_F.shaftDrop + shaftH / 2), colR, shaftH);
    o[`${t}Neck`] = cyl(c(colH - capH - COL_F.neckDrop), shaftTop * COL_F.neckScale, COL_F.neckH);
    o[`${t}Capital`] = cyl(c(colH - capH / 2), colR * COL_F.capitalTopScale, capH);
    o[`${t}Abacus`] = box(c(colH - COL_F.abacus[0]), [colR * COL_F.abacus[1], COL_F.abacus[2], colR * COL_F.abacus[1]]);
  }

  // the banners on the columns, and the trophies beside the wreath
  o.bannerFabricL = box(add(BANNER_L, [0, 0, 0]), [0.5, 1.2, 0.02]);
  o.bannerFabricR = box(add(BANNER_R, [0, 0, 0]), [0.5, 1.2, 0.02]);
  for (const sx of [-1.2, 1.2]) {
    const g = add(TROPHY, [sx, 0, 0]);
    const t = sx < 0 ? 'shieldL' : 'shieldR';
    o[t] = box(g, [0.8, 0.8, 0.04]);
    o[`${t}WeaponA`] = box(add(g, [0, 0, -0.02]), [0.04, 1.1, 0.02], Math.PI / 4);
    o[`${t}WeaponB`] = box(add(g, [0, 0, -0.02]), [0.04, 1.1, 0.02], -Math.PI / 4);
  }
  // the window on the −X wall, as its own bounding box (it is rotated a quarter turn about Y)
  o.window = box(WINDOW, [0.8, 1.0, 0.4]);

  const wreathCentre = add(TROPHY, wreathPos);
  return {
    door: [DOOR[0], DOOR[1], doorZ],
    port,
    ped,
    trophy: TROPHY,
    wreath: { c: wreathCentre, ring: ring(wreathCentre, wreathR, wreathTube), flat: near(wreathRot[0], Math.PI / 2), rot: wreathRot },
    solids: o,
    roofMeta: { halfSpan, fullLength, slope, rafter, fascia: fasciaSize },
  };
}

const SHIPPED = build();
/** The frame C-8.60 found: the doorway at 2.58 and the wreath flat at (0, 2.70, 2.72). */
const PREFIX = build({ doorZ: 2.58, wreathPos: [0, 1.1, 0.1], wreathRot: [Math.PI / 2, 0, 0], wreathR: 0.35 });
/** The C-8.59 audit's own candidate: radius 0.10 at Y 1.047, still flat and still at Z 0.1. */
const CANDIDATE = build({ doorZ: 2.58, wreathPos: [0, 1.047, 0.1], wreathRot: [Math.PI / 2, 0, 0], wreathR: 0.1 });

const vetRect = (): RectCollider => CITY_COLLIDERS.find((c) => c.id === 'veteran-hall') as RectCollider;
/** The tympanum panel's own triangle, in the hall's frame. */
const tympTriangle = () => ({
  base: PED.pos[1] + PORTICO[1] + PED_F.tymp[0],
  apexY: PED.pos[1] + PORTICO[1] + PED_F.tymp[0] + PED.height - 0.1,
  halfBase: PED.width / 2 - 0.15,
  planeZ: PED.pos[2] + PORTICO[2] + PED.depth / 2 - PED_F.tymp[1],
});

// ── §A · The frame this phase had to work in ──────────────────────────────

describe('C-8.60 §A — the hall, the doorway and the wreath, parsed from source', () => {
  test('the hall root and its stepped plinth are the ones C-8.57 left', () => {
    expect(HALL_ROOT).toEqual([-24, 0, -25]);
    expect(STEP1_N).toEqual([6.6, 0.16, 6.1]);
    expect(STEP2.size).toEqual([6.1, 0.32, 5.72]);
    expect(STEP2.pos[2]).toBe(0.06);
  });

  test('the doorway stands 0.08 further back, and nothing else about it moved', () => {
    expect(DOOR).toEqual([0, 0.32, 2.5]);
    expect(DOOR_N).toEqual([1.6, 2.2, 0.35]);
  });

  test('the wreath is re-hung face-on in the tympanum, with the band it always had', () => {
    expect(TROPHY).toEqual([0, 1.6, 2.62]);
    expect(WREATH_POS).toEqual([0, 1.81, 1.19]);
    expect(WREATH_ROT).toEqual([0, 0, 0]);
    expect(WREATH_TORUS).toEqual([0.28, 0.06, 6, 12]);
    // the tube is exactly what it was: the ring's diameter came in, its band did not
    expect(WREATH_TORUS[1]).toBe(0.06);
    expect(WREATH_TORUS[2]).toBe(6);
    expect(WREATH_TORUS[3]).toBe(12);
  });

  test('the portico and the pediment are exactly as C-8.57 left them', () => {
    expect(PORTICO).toEqual([0, 0.32, 2.82]);
    expect(PED.width).toBe(4.2);
    expect(PED.depth).toBe(0.8);
    expect(PED.height).toBe(1.05);
    expect(PED.pos).toEqual([0, 2.25, 0.58]);
    expect([ROOF.width, ROOF.depth, ROOF.height, ROOF.eave]).toEqual([5.7, 5.2, 1.3, 0.2]);
    expect(COL.height).toBe(2.3);
    expect(COL.radius).toBe(0.15);
    expect(COL_X).toEqual([-1.8, 1.8]);
  });
});

// ── §B · The primitives applied as formulas ───────────────────────────────

describe('C-8.60 §B — the shared primitives, applied as formulas', () => {
  test('the doorway\'s cap and lintel land where the primitive puts them', () => {
    // cap: `[0, height + lintelHeight + 0.05, 0.06]`, `[width + 2·jamb + 0.35, 0.10, depth + 0.12]`
    const cap = SHIPPED.solids.doorCap;
    // the group at 2.50, the cap at local Z 0.06 and `depth + 0.12` (0.47) deep
    expectInterval(intervalOn(cap, Z), 2.5 + 0.06 - 0.235, 2.5 + 0.06 + 0.235);
    expectInterval(intervalOn(cap, Z), 2.325, 2.795);
    // its own drop and thickness: local Y `height + lintelHeight + 0.05`, 0.1 tall
    const capY = DOOR[1] + DOOR_N[1] + DOOR_F.lintelH + DOOR_F.cap[0];
    expectInterval(intervalOn(cap, Y), capY - DOOR_F.cap[3] / 2, capY + DOOR_F.cap[3] / 2);
    expectInterval(intervalOn(cap, Y), 2.8, 2.9);
    expect(cap.h[0] * 2).toBeCloseTo(1.6 + 0.44 + 0.35, 9);
    // lintel: `[0, height + lintelHeight / 2, 0.04]`, `[width + 2·jamb + 0.2, 0.28, depth + 0.06]`
    expectInterval(intervalOn(SHIPPED.solids.doorLintel, Z), 2.335, 2.745);
  });

  test('the wreath\'s centre is where the trophy group and its local offset put it', () => {
    expect(SHIPPED.wreath.c[0]).toBe(0);
    expect(SHIPPED.wreath.c[1]).toBeCloseTo(3.41, 9);
    expect(SHIPPED.wreath.c[2]).toBeCloseTo(3.81, 9);
    // …and that is 1.81 above, 1.19 forward of, the group that carries it
    expect(SHIPPED.wreath.c[1] - TROPHY[1]).toBeCloseTo(1.81, 9);
    expect(SHIPPED.wreath.c[2] - TROPHY[2]).toBeCloseTo(1.19, 9);
  });

  test('its back face seats exactly on the tympanum panel\'s own plane', () => {
    const t = tympTriangle();
    expect(t.planeZ).toBeCloseTo(3.75, 9);
    expect(SHIPPED.wreath.c[2] - WREATH_TORUS[1]).toBeCloseTo(t.planeZ, 9);
    // the whole ring is in front of the panel, not sunk behind it
    expect(SHIPPED.wreath.c[2] - SHIPPED.wreath.ring.r).toBeGreaterThanOrEqual(t.planeZ - 1e-9);
  });

  test('the rakes, the architrave and the tympanum are the primitive\'s own boxes', () => {
    // the rakes' Z band is `depth + 0.35` deep about the pediment's centre — the face the
    // doorway's cap must stay behind
    expectInterval(intervalOn(SHIPPED.solids.rakeL, Z), 2.825, 3.975);
    expectInterval(intervalOn(SHIPPED.solids.rakeR, Z), 2.825, 3.975);
    // the architrave: `[0, 0.15, 0]`, `[width + 0.4, 0.3, depth + 0.2]`
    expectInterval(intervalOn(SHIPPED.solids.architrave, Y), 2.57, 2.87);
    expectInterval(intervalOn(SHIPPED.solids.architrave, Z), 2.9, 3.9);
    // the two rakes mirror, and both sweep DOWN toward the axis (the primitive's V)
    expect(intervalOn(SHIPPED.solids.rakeL, X)[1]).toBeCloseTo(-intervalOn(SHIPPED.solids.rakeR, X)[0], 9);
    expect(intervalOn(SHIPPED.solids.rakeL, Y)[0]).toBeCloseTo(intervalOn(SHIPPED.solids.rakeR, Y)[0], 9);
  });
});

// ── §C · The three conflicts this phase exists to clear ───────────────────

describe('C-8.60 §C — the wreath and the doorway head are clear of the pediment', () => {
  test('the wreath does not reach the pediment architrave', () => {
    const g = wreathGapTo(SHIPPED.wreath, SHIPPED.solids.architrave);
    expect(g).toBeGreaterThanOrEqual(TOL - 1e-9);
    // it clears by the architrave's own top plane, vertically: the ring's lowest material sits
    // above it, which is the relationship the architrave can be checked against exactly
    const lowest = SHIPPED.wreath.c[1] - (WREATH_TORUS[0] + WREATH_TORUS[1]);
    expect(lowest - intervalOn(SHIPPED.solids.architrave, Y)[1]).toBeCloseTo(0.2, 9);
  });

  // **Rebased by C-8.62** — the one figure in this section that moved. The shared primitive's rakes
  // no longer sweep down to the axis as a V (that is what this phase's record deferred); each bar now
  // follows its own gable edge from its eave corner to the apex. The ring is the one C-8.60 hung, so
  // the clearance is re-measured on the corrected solid: 0.0330 → **0.0361578674**, a larger margin,
  // because a rake that traces the gable stands further from a ring hung inside the tympanum than the
  // V's arms did. The requirement (a real margin at or above the project's 0.02) is unchanged.
  test('the wreath does not reach the LEFT raking cornice, on the corrected rake', () => {
    const g = wreathGapTo(SHIPPED.wreath, SHIPPED.solids.rakeL);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeGreaterThanOrEqual(TOL - 1e-9);
    expect(g).toBeCloseTo(0.0361578674, 6);
  });

  test('the wreath does not reach the RIGHT raking cornice, on the corrected rake', () => {
    const g = wreathGapTo(SHIPPED.wreath, SHIPPED.solids.rakeR);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeGreaterThanOrEqual(TOL - 1e-9);
    expect(g).toBeCloseTo(0.0361578674, 6);
  });

  test('the two rakes are mirror-symmetric about the axis, so one clearance pins both', () => {
    expect(wreathGapTo(SHIPPED.wreath, SHIPPED.solids.rakeL)).toBeCloseTo(
      wreathGapTo(SHIPPED.wreath, SHIPPED.solids.rakeR),
      12,
    );
    expect(SHIPPED.wreath.c[0]).toBe(0);
  });

  test('the doorway\'s projecting cornice cap clears BOTH raking cornices', () => {
    for (const rake of ['rakeL', 'rakeR'] as const) {
      const b = SHIPPED.solids[rake];
      expect(boxesIntersect(SHIPPED.solids.doorCap, b)).toBe(false);
      const g = gapOn(SHIPPED.solids.doorCap, b, Z);
      expect(g).toBeGreaterThan(0);
      expect(g).toBeGreaterThanOrEqual(TOL - 1e-9);
      expect(g).toBeCloseTo(0.03, 9);
    }
  });

  test('the lintel behind it clears them too, by more', () => {
    for (const rake of ['rakeL', 'rakeR'] as const) {
      expect(boxesIntersect(SHIPPED.solids.doorLintel, SHIPPED.solids[rake])).toBe(false);
      expect(gapOn(SHIPPED.solids.doorLintel, SHIPPED.solids[rake], Z)).toBeCloseTo(0.08, 9);
    }
  });

  test('and the cap stays clear of the architrave it used to be measured against', () => {
    expect(boxesIntersect(SHIPPED.solids.doorCap, SHIPPED.solids.architrave)).toBe(false);
    expect(gapOn(SHIPPED.solids.doorCap, SHIPPED.solids.architrave, Z)).toBeCloseTo(0.105, 9);
  });

  test('the doorway is still inside the wall it is framed into, and proud of its face', () => {
    const wallFront = intervalOn(SHIPPED.solids.wall, Z)[1];
    expect(wallFront).toBeCloseTo(2.6, 9);
    // the jambs the player sees still stand proud of the stucco…
    expect(intervalOn(SHIPPED.solids.doorJambL, Z)[1] - wallFront).toBeGreaterThan(0.05);
    // …and the group's own recess stays inside the wall
    expect(intervalOn(SHIPPED.solids.doorRecess, Z)[1]).toBeLessThanOrEqual(wallFront);
  });
});

// ── §D · The wreath's appearance: orientation, size and where it reads ────

describe('C-8.60 §D — the wreath reads as a wreath, and hangs inside the gable', () => {
  test('its orientation is the facade plane, not the ground plane', () => {
    // A torus is drawn in its own XY plane, so its normal is +Z and it faces the street.
    expect(WREATH_ROT).toEqual([0, 0, 0]);
    expect(SHIPPED.wreath.flat).toBe(false);
    // the pre-fix rotation is a quarter turn about X, which sends that normal to −Y: flat/edge-on
    const pre = ringNormal([Math.PI / 2, 0, 0]);
    expect(pre[0]).toBe(0);
    expect(pre[1]).toBeCloseTo(-1, 12);
    expect(pre[2]).toBeCloseTo(0, 12);
    expect(ringNormal([0, 0, 0])[2]).toBe(1);
    // only the X term is non-zero in either frame, which is what makes that mapping the whole story
    expect(WREATH_ROT[1]).toBe(0);
    expect(WREATH_ROT[2]).toBe(0);
    expect(PREFIX.wreath.flat).toBe(true);
  });

  test('its silhouette stays inside the tympanum triangle, with margin on every edge', () => {
    const t = tympTriangle();
    const outer = WREATH_TORUS[0] + WREATH_TORUS[1];
    expect(outer).toBe(0.34);
    const { c } = SHIPPED.wreath;
    expect(t.planeZ).toBe(3.75);
    // distance from the ring's centre to each edge of the triangle
    const edgeDist = (x0: number, y0: number, x1: number, y1: number): number =>
      Math.abs((x1 - x0) * (y0 - c[1]) - (y1 - y0) * (x0 - c[0])) / Math.hypot(x1 - x0, y1 - y0);
    expect(edgeDist(-t.halfBase, t.base, 0, t.apexY) - outer).toBeCloseTo(0.0286, 3);
    expect(edgeDist(t.halfBase, t.base, 0, t.apexY) - outer).toBeCloseTo(0.0286, 3);
    expect(c[1] - outer - t.base).toBeCloseTo(0.2, 9);
    expect(t.apexY - (c[1] + outer)).toBeCloseTo(0.07, 9);
  });

  test('it is centred on the entrance axis and clear of the finial, the lunette and its keystone', () => {
    expect(SHIPPED.wreath.c[0]).toBe(0);
    // **Rebased by C-8.62**: the finial rides the primitive's derived `crownLift` (0.0715541753), so
    // the gap this phase pinned at 0.17 is that 0.17 plus the lift — measured 0.2415541753.
    const crownLift =
      Math.cos(Math.atan2(PED.height, PED.width / 2)) * (PED_F.rakeThickness / PED_F.crownDivisor);
    expect(wreathGapTo(SHIPPED.wreath, SHIPPED.solids.acro)).toBeCloseTo(0.17 + crownLift, 9);
    expect(wreathGapTo(SHIPPED.wreath, SHIPPED.solids.acro)).toBeCloseTo(0.2415541753, 9);
    // the lunette is drawn as a half-cylinder; its own bounding box is conservative, and clear
    expect(wreathGapTo(SHIPPED.wreath, SHIPPED.solids.doorArch)).toBeGreaterThanOrEqual(0.3);
    expect(wreathGapTo(SHIPPED.wreath, SHIPPED.solids.doorKeystone)).toBeGreaterThanOrEqual(0.9);
  });

  test('the two rakes are what bounds it: a ring with the old diameter would not fit', () => {
    // The free band inside the gable is bounded below by the rakes' own clearance line and above by
    // the apex — and the apex is only 0.95 above the base. (C-8.62 later made the rakes follow the
    // gable's edges instead of the V they then described, which lifts the lower bound and loosens the
    // margin; the bound above is the apex either way.) Keeping 0.35 (outer 0.41) and holding the same
    // 0.02 against the rakes needs the centre at Y 3.4714, whose top then stands 0.0614 PROUD of the
    // gable's apex: measured, not guessed, and unchanged by the correction.
    const kept = build({ wreathR: 0.35, wreathPos: [0, 3.4714 - TROPHY[1], 3.81 - TROPHY[2]] });
    const t = tympTriangle();
    const outerKept = 0.35 + WREATH_TORUS[1];
    expect(kept.wreath.c[1] + outerKept - t.apexY).toBeCloseTo(0.0614, 3);
    expect(wreathGapTo(kept.wreath, kept.solids.rakeL)).toBeLessThan(TOL);
    // the shipped 0.28 holds both ends of the window with room
    expect(wreathGapTo(SHIPPED.wreath, SHIPPED.solids.rakeL)).toBeGreaterThan(0.03);
    expect(tympTriangle().apexY - (SHIPPED.wreath.c[1] + 0.34)).toBeGreaterThan(0.05);
  });
});

// ── §E · The C-8.57 portico correction, still intact ──────────────────────

describe('C-8.60 §E — the C-8.57 portico and eave arrangement is untouched', () => {
  test('the order still tops out 0.02 under the eave plate', () => {
    const top = PORTICO[1] + COL.height;
    expect(intervalOn(SHIPPED.solids.fascia, Y)[0] - top).toBeCloseTo(TOL, 9);
  });

  test('the column-to-architrave seat is still exactly 0.05', () => {
    const top = PORTICO[1] + COL.height;
    expect(top - intervalOn(SHIPPED.solids.architrave, Y)[0]).toBeCloseTo(0.05, 9);
  });

  // **Rebased by C-8.62** — the finial now seats on the two raking cornices' crowns, `crownLift` =
  // 0.0715541753 above where it sat, so the ridge cap's top stands 0.0265541753 BELOW the finial's
  // top instead of 0.045 above it. The pair remains disjoint — they are 0.835 apart in Z — and that
  // check is unchanged; only the vertical relationship moved, and it moved with the shared primitive.
  test('the acroterion seats on the rake crowns, and is still clear of the ridge cap', () => {
    const ridge = SHIPPED.solids.ridge;
    const acro = SHIPPED.solids.acro;
    const crownLift =
      Math.cos(Math.atan2(PED.height, PED.width / 2)) * (PED_F.rakeThickness / PED_F.crownDivisor);
    expect(intervalOn(ridge, Y)[1] - intervalOn(acro, Y)[1]).toBeCloseTo(0.045 - crownLift, 9);
    expect(intervalOn(ridge, Y)[1] - intervalOn(acro, Y)[1]).toBeCloseTo(-0.0265541753, 9);
    expect(boxesIntersect(acro, ridge)).toBe(false);
  });

  test('the rakes and the architrave are still clear of the roof and the eave', () => {
    expect(intervalOn(SHIPPED.solids.rakeL, Z)[0] - intervalOn(SHIPPED.solids.planeL, Z)[1]).toBeCloseTo(0.025, 9);
    expect(intervalOn(SHIPPED.solids.rakeR, Z)[0] - intervalOn(SHIPPED.solids.planeR, Z)[1]).toBeCloseTo(0.025, 9);
    expect(intervalOn(SHIPPED.solids.architrave, Z)[0] - intervalOn(SHIPPED.solids.fascia, Z)[1]).toBeCloseTo(0.18, 9);
    expect(intervalOn(SHIPPED.solids.architrave, Z)[0] - intervalOn(SHIPPED.solids.cornF, Z)[1]).toBeCloseTo(0.18, 9);
  });

  test('every part of the order is still clear of the eave and the wall cornice', () => {
    const eave = [SHIPPED.solids.fascia, SHIPPED.solids.planeL, SHIPPED.solids.planeR, SHIPPED.solids.ridge];
    for (const k of Object.keys(SHIPPED.solids)) {
      if (!k.startsWith('col')) continue;
      for (const e of eave) expect(boxesIntersect(SHIPPED.solids[k], e)).toBe(false);
      expect(boxesIntersect(SHIPPED.solids[k], SHIPPED.solids.cornF)).toBe(false);
    }
  });

  test('the order still stands inside the lower step, the collider\'s own line', () => {
    const rect = vetRect();
    const front = rect.cz + rect.hd - HALL_ROOT[2];
    expect(front).toBeCloseTo(3.05, 9);
    expect(intervalOn(SHIPPED.solids.colLPlinth, Z)[1]).toBeLessThanOrEqual(front + 1e-9);
    expect(intervalOn(SHIPPED.solids.colRBasering, Z)[1]).toBeLessThanOrEqual(front + 1e-9);
    expect(intervalOn(SHIPPED.solids.step2, Z)[1]).toBeLessThanOrEqual(front + 1e-9);
  });
});

// ── §F · Collider, hub, arrival and the world position ────────────────────

describe('C-8.60 §F — no collider, hub or arrival moved', () => {
  test('the registry is the one C-8.57 left, plus C-8.64A\'s segments', () => {
    // 110 was the C-8.57 count; Phase C-8.64A appended its 26 `circus-*`
    // perimeter segments.
    expect(CITY_COLLIDERS.length).toBe(136);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(31);
    expect(vetRect()).toMatchObject({ type: 'rect', id: 'veteran-hall', cx: -24, cz: -25, hw: 3.3, hd: 3.05 });
    expect(shapesSrc.includes("RECT('veteran-hall', -24, -25, 6.6, 6.1)")).toBe(true);
  });

  test('the rendered lower step still IS the collider', () => {
    const rect = vetRect();
    expect(HALL_ROOT[0] + intervalOn(SHIPPED.solids.step1, X)[0]).toBeCloseTo(rect.cx - rect.hw, 9);
    expect(HALL_ROOT[0] + intervalOn(SHIPPED.solids.step1, X)[1]).toBeCloseTo(rect.cx + rect.hw, 9);
    expect(HALL_ROOT[2] + intervalOn(SHIPPED.solids.step1, Z)[0]).toBeCloseTo(rect.cz - rect.hd, 9);
    expect(HALL_ROOT[2] + intervalOn(SHIPPED.solids.step1, Z)[1]).toBeCloseTo(rect.cz + rect.hd, 9);
  });

  test('the hub, the arrival and the prompt are unchanged, and the wreath is above them all', () => {
    const hub = HUB_LOCATIONS.find((h) => h.id === 'veteran_gladiator_hall')!;
    expect(hub.position).toEqual([-24, 0, -25]);
    expect(hub.radius).toBe(4.5);
    expect(FAST_TRAVEL_ARRIVALS.veteran_gladiator_hall).toEqual([-24, -29]);
    expect(citySrc.includes('veteran_gladiator_hall')).toBe(true);
    const stand: V3 = [-24, 0, vetRect().cz + vetRect().hd + PLAYER_RADIUS + 0.05];
    expect(collidesWith(stand[0], stand[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(getNearbyHubLocation(stand)?.id).toBe('veteran_gladiator_hall');
    const arrival = FAST_TRAVEL_ARRIVALS.veteran_gladiator_hall;
    expect(collidesWith(arrival[0], arrival[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    // the decoration sits 3.41 up on a building the player walks under: it adds no collision
    expect(SHIPPED.wreath.c[1]).toBeGreaterThan(PLAYER_RADIUS);
  });
});

// ── §G · Scope guard: what did not move, and no new local conflict ────────

describe('C-8.60 §G — everything else in the hall, and the whole sweep', () => {
  test('nothing but the two transforms this phase changed moved', () => {
    expect(WINDOW).toEqual([-2.86, 1.7, 0]);
    expect(TROPHY).toEqual([0, 1.6, 2.62]);
    expect(BANNER_L).toEqual([-1.8, 1.0, 2.97]);
    expect(BANNER_R).toEqual([1.8, 1.0, 2.97]);
    expect(CORN).toEqual([5.7, 5.2, 2.75, 0.16, 0.12]);
    expect(WALL.size).toEqual([5.7, 2.4, 5.2]);
    // the threshold and the doorway's own box are its own; only its group moved
    expect(DOOR_F.jambW).toBe(0.22);
    expect(DOOR_F.lintelH).toBe(0.28);
    expect(intervalOn(SHIPPED.solids.doorThreshold, Y)[0]).toBeCloseTo(0.32, 9);
  });

  test('the shared primitive was not edited by this phase', () => {
    expect(colSrc.includes('const jambWidth = 0.22;')).toBe(true);
    expect(colSrc.includes('const lintelHeight = 0.28;')).toBe(true);
    expect(colSrc.includes('const slopeAngle = Math.atan2(height, halfBase);')).toBe(true);
    expect(colSrc.includes('<boxGeometry args={[width + 0.4, 0.3, depth + 0.2]} />')).toBe(true);
    expect(colSrc.includes('position={[-halfBase / 2, 0.3 + height / 2, 0]}')).toBe(true);
  });

  test('THE SWEEP: nothing else in the hall holds wreath material — only the panel it seats on', () => {
    const offenders: string[] = [];
    for (const k of Object.keys(SHIPPED.solids)) {
      if (k === 'tympanumPlane') continue; // the mounting face: the ring seats ON it
      if (wreathGapTo(SHIPPED.wreath, SHIPPED.solids[k]) < -1e-9) offenders.push(k);
    }
    expect(offenders).toEqual([]);
  });

  test('THE SWEEP: every remaining solid is clear by a real margin, and the seats are exact', () => {
    const g = (k: string) => wreathGapTo(SHIPPED.wreath, SHIPPED.solids[k]);
    // the two nearest solids are the rakes, and the margin above them is the tightest figure here
    const sorted = Object.keys(SHIPPED.solids)
      .filter((k) => k !== 'tympanumPlane')
      .map((k) => [k, g(k)] as [string, number])
      .sort((a, b) => a[1] - b[1]);
    expect(sorted[0][0]).toBe('rakeL');
    expect(sorted[1][0]).toBe('rakeR');
    // **Rebased by C-8.62**: the corrected rake is still the nearest solid to the ring, by a larger
    // margin — 0.0330 → 0.0361578674 (see §C).
    expect(sorted[0][1]).toBeCloseTo(0.0361578674, 6);
    expect(sorted[2][1]).toBeGreaterThanOrEqual(0.16);
    // the seats: on the tympanum panel, and 0.20 above the architrave's top
    expect(g('tympanumPlane')).toBeCloseTo(0, 9);
    expect(g('architrave')).toBeCloseTo(0.2, 9);
  });
});

// ── §H · The control ──────────────────────────────────────────────────────

describe('C-8.60 §H — the control: the pre-fix frame fails these same predicates', () => {
  test('the control frame is the pre-fix one', () => {
    expect(PREFIX.door[2]).toBe(2.58);
    expect(PREFIX.wreath.c[0]).toBe(0);
    expect(PREFIX.wreath.c[1]).toBeCloseTo(2.7, 9);
    expect(PREFIX.wreath.c[2]).toBeCloseTo(2.72, 9);
    expect(PREFIX.wreath.ring.R).toBe(0.35);
    expect(PREFIX.wreath.flat).toBe(true);
  });

  // **Rebased by C-8.62.** Of the four pairs the audit named, the ring's burial in the architrave
  // still reproduces exactly. The two WREATH↔RAKE pairs no longer do: the primitive's rakes used to
  // descend to the axis as a V and pass through this flat ring's band, and C-8.62 made each rake
  // follow its own gable edge, so in this pre-fix frame the ring is now CLEAR of them by a measured
  // 0.0384458247 each — the correction showing up in the control, pinned as clear rather than
  // weakened. The cap↔rake pairs are the same story in two parts: their world Z bands still overlap
  // by the 0.05 the audit measured (`gapOn` below), but the corrected rake stands clear of the cap's
  // own Y band, so the real solids no longer meet — `phaseC8_62.test.ts` §H measures that separation
  // (0.297895488) and reproduces the pre-C-8.62 intersection (−0.05) on the old rake, which is what
  // C-8.60's 0.08 setback answered under the primitive of the day.
  test('the intersections the audit named still reproduce — except the ones the rake correction cleared', () => {
    expect(wreathGapTo(PREFIX.wreath, PREFIX.solids.architrave)).toBeLessThan(0);
    expect(wreathGapTo(PREFIX.wreath, PREFIX.solids.rakeL)).toBeGreaterThan(0);
    expect(wreathGapTo(PREFIX.wreath, PREFIX.solids.rakeR)).toBeGreaterThan(0);
    expect(wreathGapTo(PREFIX.wreath, PREFIX.solids.rakeL)).toBeCloseTo(0.0384458247, 6);
    expect(wreathGapTo(PREFIX.wreath, PREFIX.solids.rakeR)).toBeCloseTo(0.0384458247, 6);
    for (const rake of ['rakeL', 'rakeR'] as const) {
      // the interval share the audit measured is intact...
      expect(gapOn(PREFIX.solids.doorCap, PREFIX.solids[rake], Z)).toBeCloseTo(-0.05, 9);
      // ...but the real solids do not meet on the corrected rake
      expect(boxesIntersect(PREFIX.solids.doorCap, PREFIX.solids[rake])).toBe(false);
    }
  });

  // **Rebased by C-8.62** — the share below is an INTERVAL measurement along the three world axes,
  // which is exactly what the audit reported, and it is unchanged: 0.05 in Z, 0.10 in Y, over a metre
  // in X. It is no longer a volume the two solids really share, though: the corrected rake traces the
  // gable's edge and stands away from the cap's own Y band, so the separating-axis test reports them
  // clear (measured 0.297895488 in `phaseC8_62.test.ts` §H). The intervals are kept because they are
  // this phase's own evidence for the C-8.60 fix — under the pre-C-8.62 V rake the same pair really
  // did intersect, by 0.05, which is the conflict the 0.08 doorway setback answered.
  test('the cap\'s share with each rake is the interval the audit measured', () => {
    for (const rake of ['rakeL', 'rakeR'] as const) {
      const b = PREFIX.solids[rake];
      const ov = [X, Y, Z].map((ax) => Math.min(intervalOn(PREFIX.solids.doorCap, ax)[1], intervalOn(b, ax)[1])
        - Math.max(intervalOn(PREFIX.solids.doorCap, ax)[0], intervalOn(b, ax)[0]));
      expect(ov[2]).toBeCloseTo(0.05, 9);
      expect(ov[1]).toBeCloseTo(0.1, 9);
      expect(ov[0]).toBeGreaterThan(1.0);
      expect(boxesIntersect(PREFIX.solids.doorCap, b)).toBe(false);
    }
  });

  test('and the flat ring was buried in four more solids than the audit named', () => {
    for (const k of ['doorLintel', 'cornF', 'fascia', 'wall'] as const) {
      expect(wreathGapTo(PREFIX.wreath, PREFIX.solids[k])).toBeLessThan(0);
    }
    // the same sweep that returns [] for the shipped frame finds five offenders here. **Rebased by
    // C-8.62**: the two rakes are no longer among them — a rake that follows the gable's edge does
    // not descend to the axis through this ring's own band — so the flat ring's burial is the four
    // solids below plus the architrave, which is what the audit's own finding named.
    const offenders = Object.keys(PREFIX.solids).filter(
      (k) => k !== 'tympanumPlane' && wreathGapTo(PREFIX.wreath, PREFIX.solids[k]) < -1e-9,
    );
    expect(offenders).toEqual(['wall', 'cornF', 'fascia', 'doorLintel', 'architrave']);
  });

  test('the audit\'s own candidate fails too — which is why it was not adopted', () => {
    // radius 0.10 at local Y 1.047, still flat at Z 0.1: it clears the architrave and the rakes
    // by sitting in the narrow gap between the lintel's face plane and the wall, but it stays
    // inside the doorway's lintel and the wall's cornice band
    expect(CANDIDATE.wreath.c[0]).toBe(0);
    expect(CANDIDATE.wreath.c[1]).toBeCloseTo(2.647, 9);
    expect(CANDIDATE.wreath.c[2]).toBeCloseTo(2.72, 9);
    expect(wreathGapTo(CANDIDATE.wreath, CANDIDATE.solids.architrave)).toBeGreaterThan(0);
    expect(wreathGapTo(CANDIDATE.wreath, CANDIDATE.solids.rakeL)).toBeGreaterThan(0);
    expect(wreathGapTo(CANDIDATE.wreath, CANDIDATE.solids.doorLintel)).toBeLessThan(0);
    expect(wreathGapTo(CANDIDATE.wreath, CANDIDATE.solids.cornF)).toBeLessThan(0);
    // and it would still read edge-on, which is the appearance the audit itself flagged
    expect(CANDIDATE.wreath.flat).toBe(true);
  });

  test('the shipped frame passes every check the control fails', () => {
    for (const k of Object.keys(SHIPPED.solids)) {
      if (k === 'tympanumPlane') continue;
      expect(wreathGapTo(SHIPPED.wreath, SHIPPED.solids[k])).toBeGreaterThanOrEqual(-1e-9);
    }
    for (const rake of ['rakeL', 'rakeR'] as const) {
      expect(boxesIntersect(SHIPPED.solids.doorCap, SHIPPED.solids[rake])).toBe(false);
      expect(gapOn(SHIPPED.solids.doorCap, SHIPPED.solids[rake], Z)).toBeGreaterThanOrEqual(TOL - 1e-9);
    }
  });
});
