/**
 * Phase C-8.57 — Veteran Gladiator Hall: the entrance portico under its eave.
 *
 * ── THE DEFECT (re-derived here from the shipped formulas, not restated) ───
 * The hall is a 5.7 × 5.2 stucco box under a terracotta gable whose eave plate
 * (`RomanGabledRoof`'s "bearing cornice", `[width + 1.2·ov] × 0.16 × [depth + 1.2·ov]`)
 * covered the WHOLE footprint at Y 2.64 … 2.80, while the two-column portico stood at
 * Z 2.7 — only 0.10 in front of the wall — with an order 2.5 tall (`ClassicalColumn`
 * puts its capital and abacus ON `height`, so its top was 2.82), and its pediment sat
 * with the architrave's underside at 2.77. Measured, the shipped arrangement had:
 *
 *   • capital ∩ fascia  0.39   × 0.16   × 0.305   (the capital's Z back 2.505, the
 *   • abacus  ∩ fascia  0.375  × 0.06   × 0.2975   fascia's front 2.81)
 *   • architrave ∩ fascia    4.6 × 0.03 × 0.61
 *   • architrave ∩ cornice   4.6 × 0.06 × 0.12
 *
 * and the capital's back face (2.505) sat INSIDE the wall (front 2.60), so no eave of
 * any depth could clear it: with the order at Z 2.7 its capital always crossed the
 * fascia's vertical band. The order had to either move clear of the eave's front edge
 * (which needs Z ≥ 3.00, and the columns' 0.39-wide plinths would then hang 0.145 past
 * the lower step at 3.05 — over the street) or end BELOW the eave's underside (2.64).
 *
 * ── THE CORRECTION (six coordinated values, all inside the hall) ───────────
 *   | quantity | before | after |
 *   |---|---|---|
 *   | roof `eaveOverhang` | 0.35 | **0.20** |
 *   | portico group Z | 2.7 | **2.82** |
 *   | column `height` | 2.5 | **2.30** |
 *   | banner groups Z | 2.85 | **2.97** |
 *   | pediment `height` | 0.85 | **1.05** |
 *   | pediment `position` | [0, 2.45, 0] | **[0, 2.25, 0.58]** |
 *   | upper plinth step | 5.6 deep at Z 0 | **5.72 deep at Z 0.06** |
 *
 * The order now tops out at 2.62 — 0.02 (the project's own seating tolerance) under the
 * fascia's underside at 2.64 — so the capitals and abaci clear the plate by height. The
 * pediment's base drops with it to 2.57, keeping the 0.05 seat exactly, and the taller
 * gable holds the acroterion's top at 4.24, still 0.045 below the ridge cap. The 0.58
 * forward shift puts the architrave's back face (2.90) and both raking cornices' (2.825)
 * clear of the fascia (front 2.72) and of the roof's front slope (2.80); the eave comes
 * in from 0.35 to 0.20 so those two planes stand where the pediment needs them. The
 * order moves 0.12 forward onto its own extended upper step, and its 0.39-wide plinths
 * land 0.035 INSIDE the lower step's front edge (3.05) — the collider's own edge — with
 * the same 0.095 cantilever the shipped plinth had.
 *
 * ── HOW THIS SUITE MEASURES IT ────────────────────────────────────────────
 * Nothing here is a copied constant. The hall's transforms and props are parsed from its
 * source; the shared primitives' coefficients are parsed from `ClassicalArchitecture.tsx`
 * and applied as the real formulas; every seat, clearance and intersection is then
 * DERIVED from those parsed values. §H replays the pre-fix values through the identical
 * predicates, so the four reported intersections are shown to fail the shipped
 * geometry's own checks rather than merely to differ from it.
 *
 * ASSUMPTIONS, stated: the rotated boxes (the roof's two slopes and the pediment's two
 * raking cornices) and the columns' frusta are compared as axis-aligned bounds of their
 * own boxes — the same convention the C-8.54 audit used, and therefore the convention
 * its four reported volumes are expressed in. This pins source-derived geometry, not
 * rendered appearance: the Android look remains a device question.
 *
 * Run with: bun test src/utils/phaseC8_57.test.ts
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

type Vec3 = [number, number, number];

/** The project's seating/clearance tolerance — the architrave, C-8.52, C-8.53, C-8.55. */
const TOL = 0.02;
/** The eave fascia's own thickness (RomanGabledRoof's bearing cornice). */
const FASCIA_H = 0.16;

// ── Tiny parsers (the style of the C-8.18 … C-8.55 suites) ────────────────

function nums(src: string, re: RegExp): number[] {
  const m = re.exec(src);
  if (!m) throw new Error(`not found: ${re}`);
  return m.slice(1).map(Number);
}
const num = (src: string, re: RegExp): number => nums(src, re)[0];
function triple(src: string, re: RegExp): Vec3 {
  const n = nums(src, re);
  return [n[0], n[1], n[2]];
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Bounds helpers (boxes and frusta; the audit's axis-aligned convention) ─

interface Box {
  min: Vec3;
  max: Vec3;
}
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Axis-aligned bounds of a box of `size` centred at `c`, rotated about Z by `rz`. */
function boxAt(c: Vec3, size: Vec3, rz = 0): Box {
  const co = Math.abs(Math.cos(rz));
  const si = Math.abs(Math.sin(rz));
  const hx = size[0] / 2;
  const hy = size[1] / 2;
  const hz = size[2] / 2;
  return {
    min: [c[0] - (hx * co + hy * si), c[1] - (hx * si + hy * co), c[2] - hz],
    max: [c[0] + (hx * co + hy * si), c[1] + (hx * si + hy * co), c[2] + hz],
  };
}
/** Axis-aligned bounds of a vertical cylinder/frustum of radius `r` and height `h`. */
const cylAt = (c: Vec3, r: number, h: number): Box => boxAt(c, [2 * r, h, 2 * r]);
/** Overlap of two bounds, or null when they are disjoint on any axis. */
function overlap(a: Box, b: Box): Vec3 | null {
  const d = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const e = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const f = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  return d > 0 && e > 0 && f > 0 ? [d, e, f] : null;
}
const overlaps = (a: Box, b: Box) => overlap(a, b) !== null;

// ── The hall's own frame (parsed from its source) ─────────────────────────

const HALL_ROOT = triple(hallSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 1\. TRAVERTINE/);

const STEP1_N = nums(hallSrc, /position=\{\[0, 0\.08, 0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const STEP2_N = nums(hallSrc, /position=\{\[0, 0\.24, ([\d.]+)\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const STEP2 = { pos: [0, 0.24, STEP2_N[0]] as Vec3, size: [STEP2_N[1], STEP2_N[2], STEP2_N[3]] as Vec3 };

const WALL_N = nums(hallSrc, /position=\{\[0, 1\.6, 0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const WALL = { pos: [0, 1.6, 0] as Vec3, size: [WALL_N[0], WALL_N[1], WALL_N[2]] as Vec3 };

/** `<WallCornice size={[5.7, 5.2]} y={2.75} … height={0.16} projection={0.12} />` */
const CORN = {
  size: nums(hallSrc, /<WallCornice size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\} y=\{([\d.]+)\}[\s\S]*?height=\{([\d.]+)\} projection=\{([\d.]+)\}/),
};

/** `<RomanGabledRoof … eaveOverhang={ov} ridgeAlong="z" position={[0, 2.8, 0]}` */
const ROOF = {
  width: num(hallSrc, /<RomanGabledRoof\s*width=\{([\d.]+)\}/),
  depth: num(hallSrc, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
  height: num(hallSrc, /<RomanGabledRoof[\s\S]*?height=\{([\d.]+)\}/),
  eave: num(hallSrc, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
  pos: triple(hallSrc, /<RomanGabledRoof[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/),
};

/** The entrance portico group the columns and pediment live in. */
const PORTICO = triple(hallSrc, /4\. ENTRANCE PORTICO FACADE[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);

/** The two column X offsets, read from the component's own map array. */
const COL_X = nums(hallSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(x, i\)/);
const COL = {
  y: num(hallSrc, /<ClassicalColumn[\s\S]*?position=\{\[x,\s*(-?[\d.]+),/),
  z: num(hallSrc, /<ClassicalColumn[\s\S]*?position=\{\[x,\s*-?[\d.]+,\s*(-?[\d.]+)\s*\]\}/),
  height: num(hallSrc, /<ClassicalColumn[\s\S]*?height=\{([\d.]+)\}/),
  radius: num(hallSrc, /<ClassicalColumn[\s\S]*?radius=\{([\d.]+)\}/),
};

/** `<ClassicalPediment width depth height position />` */
const PED_N = nums(hallSrc, /<ClassicalPediment\s*width=\{([\d.]+)\}\s*depth=\{([\d.]+)\}\s*height=\{([\d.]+)\}\s*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/);
const PED = {
  width: PED_N[0],
  depth: PED_N[1],
  height: PED_N[2],
  pos: [PED_N[3], PED_N[4], PED_N[5]] as Vec3,
};

/** The two banner groups (they hang on the columns, so they must ride with them). */
const BANNER_L = triple(hallSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} ref=\{bannerLeftRef\}/);
const BANNER_R = triple(hallSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} ref=\{bannerRightRef\}/);
const BANNER_FABRIC = nums(hallSrc, /ref=\{bannerLeftRef\}>[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);

// ── The shared primitives' own formulas (parsed, then applied) ────────────

const TILE_T = num(colSrc, /const tileThickness = ([\d.]+);/);
/** RomanGabledRoof: the span/length split for `ridgeAlong="z"`. */
const ROOF_F = {
  fasciaX: num(colSrc, /<boxGeometry args=\{\[width \+ eaveOverhang \* ([\d.]+), 0\.16, depth \+ eaveOverhang \* 1\.2\]\}/),
  fasciaZ: num(colSrc, /<boxGeometry args=\{\[width \+ eaveOverhang \* 1\.2, 0\.16, depth \+ eaveOverhang \* ([\d.]+)\]\}/),
  fasciaPos: num(colSrc, /<mesh castShadow receiveShadow position=\{\[0, (-?[\d.]+), 0\]\}>\s*<boxGeometry args=\{\[width \+ eaveOverhang/),
  ridgeDrop: nums(colSrc, /<mesh castShadow position=\{\[0, height \+ tileThickness \/ 2 \+ ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[([\d.]+),\s*([\d.]+),\s*fullLength \+ ([\d.]+)\]/),
  planeDrop: num(colSrc, /position=\{\[-halfSpan \/ 2, height \/ 2 \+ ([\d.]+), 0\]\}/),
};
/** ClassicalColumn's coefficients. */
const COL_F = {
  plinthCap: num(colSrc, /const plinthHeight = Math\.min\(([\d.]+), height \* 0\.07\);/),
  plinthRatio: num(colSrc, /const plinthHeight = Math\.min\([\d.]+, height \* ([\d.]+)\);/),
  capitalCap: num(colSrc, /const capitalHeight = Math\.min\(([\d.]+), height \* 0\.09\);/),
  capitalRatio: num(colSrc, /const capitalHeight = Math\.min\([\d.]+, height \* ([\d.]+)\);/),
  shaftTaper: num(colSrc, /const shaftRadiusTop = radius \* ([\d.]+);/),
  baseDrop: num(colSrc, /<mesh position=\{\[0, plinthHeight \+ ([\d.]+), 0\]\}>/),
  baseTopScale: num(colSrc, /<cylinderGeometry args=\{\[radius \* ([\d.]+), radius \* 1\.35, 0\.08, 12\]\}/),
  baseBotScale: num(colSrc, /<cylinderGeometry args=\{\[radius \* 1\.25, radius \* ([\d.]+), 0\.08, 12\]\}/),
  shaftDrop: num(colSrc, /position=\{\[0, plinthHeight \+ ([\d.]+) \+ shaftHeight \/ 2, 0\]\}/),
  neckDrop: num(colSrc, /<mesh position=\{\[0, height - capitalHeight - ([\d.]+), 0\]\}>/),
  neckScale: num(colSrc, /<cylinderGeometry args=\{\[shaftRadiusTop \* ([\d.]+),/),
  neckH: num(colSrc, /shaftRadiusTop \* [\d.]+, ([\d.]+), 12\]\}/),
  // the DORIC branch — the hall's columns are `order="doric"`, and the primitive's
  // ternary puts the Corinthian 1.5·r scale first
  capitalTopScale: num(colSrc, /\) : \(\s*<cylinderGeometry args=\{\[radius \* ([\d.]+), shaftRadiusTop, capitalHeight, 12\]\}/),
  abacus: nums(colSrc, /<mesh castShadow position=\{\[0, height - ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[radius \* ([\d.]+), ([\d.]+), radius \* 2\.5\]\}/),
};
/**
 * ClassicalPediment's own arrangement.
 *
 * **Rebased by C-8.62.** The primitive's raking cornices are rotated `+slopeAngle` (left) and
 * `−slopeAngle` (right) — each bar rising from its own eave corner to the apex instead of sweeping
 * down to the axis as a V — over a run of `rafterLen` with no extra length, at the primitive's own
 * `rakeThickness`, and the acroterion is lifted by the derived `crownLift` so its underside seats
 * on the two crowns where they meet. All of it is parsed here, so this suite keeps building the
 * geometry the primitive actually writes; the two §E pins below are the only assertions whose
 * expected values moved, and they moved because the acroterion rose with the crowns.
 */
const PED_F = {
  entab: nums(colSrc, /<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[width \+ ([\d.]+), ([\d.]+), depth \+ ([\d.]+)\]\}/),
  rakeDrop: num(colSrc, /position=\{\[-halfBase \/ 2, ([\d.]+) \+ height \/ 2, 0\]\}/),
  rakeSignL: /position=\{\[-halfBase \/ 2, [\d.]+ \+ height \/ 2, 0\]\}\s*rotation=\{\[0, 0, (-?)slopeAngle\]\}/.exec(colSrc)?.[1] === '-' ? -1 : 1,
  rakeSignR: /position=\{\[halfBase \/ 2, [\d.]+ \+ height \/ 2, 0\]\}\s*rotation=\{\[0, 0, (-?)slopeAngle\]\}/.exec(colSrc)?.[1] === '-' ? -1 : 1,
  rakeThickness: num(colSrc, /const rakeThickness = ([\d.]+);/),
  /** `crownLift = Math.cos(slopeAngle) * (rakeThickness / <divisor>)` — the seating offset. */
  crownDivisor: num(colSrc, /const crownLift = Math\.cos\(slopeAngle\) \* \(rakeThickness \/ ([\d.]+)\);/),
  rakeDepth: num(colSrc, /<boxGeometry args=\{\[rafterLen, rakeThickness, depth \+ ([\d.]+)\]\}/),
  acro: nums(colSrc, /position=\{\[0, ([\d.]+) \+ height \+ ([\d.]+) \+ crownLift, depth \/ 2 \+ ([\d.]+)\]\}>\s*<boxGeometry args=\{\[([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/),
};

// ── Derived world geometry ────────────────────────────────────────────────

/** Every derived element this phase's assertions speak about. */
interface Built {
  fascia: Box;
  planeL: Box;
  planeR: Box;
  ridge: Box;
  wall: Box;
  cornF: Box;
  cornB: Box;
  cornL: Box;
  cornR: Box;
  step1: Box;
  step2: Box;
  cols: { plinth: Box; basering: Box; shaft: Box; neck: Box; capital: Box; abacus: Box; x: number }[];
  architrave: Box;
  frieze: Box;
  tympanum: Box;
  rakeL: Box;
  rakeR: Box;
  acro: Box;
  /** pediment world origin */ ped: Vec3;
  /** portico world origin */ port: Vec3;
  roofMeta: { halfSpan: number; fullLength: number; slope: number; rafter: number; fascia: Vec3 };
}

/**
 * Build the hall's portico + eave from a set of parameters. Defaults are the shipped
 * values; §H passes the pre-fix ones through the identical formulas.
 */
function build(P: {
  eave?: number;
  porticoZ?: number;
  colH?: number;
  pedY?: number;
  pedZ?: number;
  pedH?: number;
  step2?: { pos: Vec3; size: Vec3 };
} = {}): Built {
  const eave = P.eave ?? ROOF.eave;
  const porticoZ = P.porticoZ ?? PORTICO[2];
  const colH = P.colH ?? COL.height;
  const pedY = P.pedY ?? PED.pos[1];
  const pedZ = P.pedZ ?? PED.pos[2];
  const pedH = P.pedH ?? PED.height;
  const step2 = P.step2 ?? STEP2;

  const port: Vec3 = [PORTICO[0], PORTICO[1], porticoZ];
  const ped: Vec3 = add(port, [PED.pos[0], pedY, pedZ]);
  const roofG = ROOF.pos;

  // RomanGabledRoof: ridgeAlong 'z' → span = width, length = depth
  const halfSpan = ROOF.width / 2 + eave;
  const fullLength = ROOF.depth + eave * 2;
  const slope = Math.atan2(ROOF.height, halfSpan);
  const rafter = Math.hypot(halfSpan, ROOF.height);

  const fasciaSize: Vec3 = [
    ROOF.width + eave * ROOF_F.fasciaX,
    FASCIA_H,
    ROOF.depth + eave * ROOF_F.fasciaZ,
  ];
  const fascia = boxAt(add([0, ROOF_F.fasciaPos, 0], roofG), fasciaSize);
  const planeL = boxAt(add([-halfSpan / 2, ROOF.height / 2 + ROOF_F.planeDrop, 0], roofG), [rafter, TILE_T, fullLength], slope);
  const planeR = boxAt(add([halfSpan / 2, ROOF.height / 2 + ROOF_F.planeDrop, 0], roofG), [rafter, TILE_T, fullLength], -slope);
  const ridge = boxAt(
    add([0, ROOF.height + TILE_T / 2 + ROOF_F.ridgeDrop[0], 0], roofG),
    [ROOF_F.ridgeDrop[1], ROOF_F.ridgeDrop[2], fullLength + ROOF_F.ridgeDrop[3]],
  );

  const wall = boxAt(WALL.pos, WALL.size);
  const [cw, cd, cy, ch, cp] = CORN.size;
  const cornF = boxAt([0, cy, cd / 2 + cp / 2], [cw + cp * 2, ch, cp]);
  const cornB = boxAt([0, cy, -cd / 2 - cp / 2], [cw + cp * 2, ch, cp]);
  const cornL = boxAt([-cw / 2 - cp / 2, cy, 0], [cp, ch, cd]);
  const cornR = boxAt([cw / 2 + cp / 2, cy, 0], [cp, ch, cd]);

  const step1 = boxAt([0, 0.08, 0], [6.6, 0.16, 6.1]);
  const step2Box = boxAt(step2.pos, step2.size);

  // ClassicalColumn
  const r = COL.radius;
  const plinthHeight = Math.min(COL_F.plinthCap, colH * COL_F.plinthRatio);
  const capitalHeight = Math.min(COL_F.capitalCap, colH * COL_F.capitalRatio);
  const shaftHeight = colH - plinthHeight - capitalHeight;
  const shaftTop = r * COL_F.shaftTaper;
  const cols = COL_X.map((x) => {
    const c = (y: number): Vec3 => add([x, y, COL.z], port);
    return {
      x,
      plinth: boxAt(c(plinthHeight / 2), [r * 2.6, plinthHeight, r * 2.6]),
      basering: cylAt(c(plinthHeight + COL_F.baseDrop), r * COL_F.baseBotScale, 0.08),
      shaft: cylAt(c(plinthHeight + COL_F.shaftDrop + shaftHeight / 2), r, shaftHeight),
      neck: cylAt(c(colH - capitalHeight - COL_F.neckDrop), shaftTop * COL_F.neckScale, COL_F.neckH),
      capital: cylAt(c(colH - capitalHeight / 2), r * COL_F.capitalTopScale, capitalHeight),
      abacus: boxAt(c(colH - COL_F.abacus[0]), [r * COL_F.abacus[1], COL_F.abacus[2], r * COL_F.abacus[1]]),
    };
  });

  // ClassicalPediment
  const halfBase = PED.width / 2;
  const pSlope = Math.atan2(pedH, halfBase);
  const pRafter = Math.hypot(halfBase, pedH);
  const p = (v: Vec3): Vec3 => add(v, ped);
  const architrave = boxAt(p([0, PED_F.entab[0], 0]), [
    PED.width + PED_F.entab[1],
    PED_F.entab[2],
    PED.depth + PED_F.entab[3],
  ]);
  const frieze = boxAt(p([0, -0.15, PED.depth / 2 + 0.02]), [PED.width + 0.2, 0.25, 0.15]);
  const tympanum = boxAt(p([0, 0.3, PED.depth / 2 - 0.05]), [PED.width - 0.3, pedH - 0.1, 0]);
  // Phase C-8.62: the two rakes rise to the apex over `rafterLen`, and the acroterion is lifted by
  // `crownLift` so its underside seats on the crowns that meet there.
  const crownLift = Math.cos(pSlope) * (PED_F.rakeThickness / PED_F.crownDivisor);
  const rakeL = boxAt(p([-halfBase / 2, PED_F.rakeDrop + pedH / 2, 0]), [pRafter, PED_F.rakeThickness, PED.depth + PED_F.rakeDepth], PED_F.rakeSignL * pSlope);
  const rakeR = boxAt(p([halfBase / 2, PED_F.rakeDrop + pedH / 2, 0]), [pRafter, PED_F.rakeThickness, PED.depth + PED_F.rakeDepth], PED_F.rakeSignR * pSlope);
  const acro = boxAt(p([0, PED_F.acro[0] + pedH + PED_F.acro[1] + crownLift, PED.depth / 2 + PED_F.acro[2]]), [PED_F.acro[3], PED_F.acro[4], PED_F.acro[5]]);

  return {
    fascia, planeL, planeR, ridge, wall, cornF, cornB, cornL, cornR, step1, step2: step2Box,
    cols, architrave, frieze, tympanum, rakeL, rakeR, acro, ped, port,
    roofMeta: { halfSpan, fullLength, slope, rafter, fascia: fasciaSize },
  };
}

const SHIPPED = build();
/** The pre-fix frame, through the identical formulas. */
const PREFIX = build({ eave: 0.35, porticoZ: 2.7, colH: 2.5, pedY: 2.45, pedZ: 0, pedH: 0.85, step2: { pos: [0, 0.24, 0], size: [6.1, 0.32, 5.6] } });

const vetRect = (): RectCollider =>
  CITY_COLLIDERS.find((c) => c.id === 'veteran-hall') as RectCollider;

// ── §A · The frame this phase had to work in ──────────────────────────────

describe('C-8.57 §A — the hall and its portico, parsed from source', () => {
  test('the hall root and its stepped plinth are the ones they were', () => {
    expect(HALL_ROOT).toEqual([-24, 0, -25]);
    expect(STEP1_N).toEqual([6.6, 0.16, 6.1]);
    expect(STEP2.size[0]).toBe(6.1);
    expect(STEP2.size[1]).toBe(0.32);
    expect(STEP2.size[2]).toBe(5.72);
  });

  test('the upper step grew forward only: same centre Y, same back edge', () => {
    // 5.72 deep centred at 0.06 spans Z −2.80 … 2.92 — the back edge of the shipped
    // 5.6-at-0 step, extended 0.12 at the front.
    expect(STEP2.pos[1]).toBe(0.24);
    expect(near(-STEP2.size[2] / 2 + STEP2.pos[2], -2.8)).toBe(true);
    expect(near(STEP2.size[2] / 2 + STEP2.pos[2], 2.92)).toBe(true);
  });

  test('the roof, cornice and wall props are the live ones', () => {
    expect([ROOF.width, ROOF.depth, ROOF.height]).toEqual([5.7, 5.2, 1.3]);
    expect(ROOF.eave).toBe(0.2);
    expect(ROOF.pos).toEqual([0, 2.8, 0]);
    expect(CORN.size).toEqual([5.7, 5.2, 2.75, 0.16, 0.12]);
    expect(WALL.size).toEqual([5.7, 2.4, 5.2]);
  });

  test('the portico group and the two column offsets are the shipped ones', () => {
    expect(PORTICO).toEqual([0, 0.32, 2.82]);
    expect(COL_X).toEqual([-1.8, 1.8]);
    expect(COL.y).toBe(0);
    expect(COL.z).toBe(0);
    expect(COL.radius).toBe(0.15);
  });

  test('the order and the pediment carry this phase\'s values', () => {
    expect(COL.height).toBe(2.3);
    expect(PED.width).toBe(4.2);
    expect(PED.depth).toBe(0.8);
    expect(PED.height).toBe(1.05);
    expect(PED.pos).toEqual([0, 2.25, 0.58]);
  });

  test('the banners ride with the columns, keeping their stand-off', () => {
    // They hang on the two columns: shipped at Z 2.85 against a shaft front of 2.85,
    // now at 2.97 against a shaft front of 2.97 — the same contact, moved with the order.
    expect(BANNER_L).toEqual([-1.8, 1.0, 2.97]);
    expect(BANNER_R).toEqual([1.8, 1.0, 2.97]);
    const shaftFront = PORTICO[2] + COL.z + COL.radius;
    expect(near(BANNER_L[2], shaftFront, 1e-9)).toBe(true);
    // and the fabric is still 0.02 thick, so it clears rather than sinks in
    expect(BANNER_FABRIC[2]).toBe(0.02);
  });
});

// ── §B · The primitive's own formulas, and the derived elements ───────────

describe('C-8.57 §B — the shared primitives, applied as formulas', () => {
  test('the eave plate is the primitive\'s own bearing cornice', () => {
    expect(SHIPPED.roofMeta.fascia).toEqual([5.7 + 0.2 * 1.2, 0.16, 5.2 + 0.2 * 1.2]);
    expect(SHIPPED.roofMeta.halfSpan).toBe(5.7 / 2 + 0.2);
    expect(SHIPPED.roofMeta.fullLength).toBe(5.2 + 0.4);
  });

  test('the fascia, the slopes and the ridge land where the formulas put them', () => {
    // bearing cornice: Y −0.16 … 0 relative to the roof group at 2.8
    expect(SHIPPED.fascia.min[1]).toBeCloseTo(2.8 - 0.16, 9);
    expect(SHIPPED.fascia.max[1]).toBeCloseTo(2.8, 9);
    // its +Z face is the eave's front edge
    expect(SHIPPED.fascia.max[2]).toBeCloseTo(5.44 / 2, 9);
    // the roof's own slope reaches 0.20 further out than the plate
    expect(SHIPPED.planeL.max[2]).toBeCloseTo(0.0 + SHIPPED.roofMeta.fullLength / 2, 9);
    // the ridge cap's band
    expect(SHIPPED.ridge.min[1]).toBeCloseTo(2.8 + 1.3 + 0.075 + 0.02 - 0.09, 9);
    expect(SHIPPED.ridge.max[1]).toBeCloseTo(2.8 + 1.3 + 0.075 + 0.02 + 0.09, 9);
  });

  test('the order tops out on `height`, as the primitive defines it', () => {
    for (const c of SHIPPED.cols) {
      const top = PORTICO[1] + COL.height;
      expect(near(c.capital.max[1], top, 1e-9)).toBe(true);
      expect(near(c.abacus.max[1], top, 1e-9)).toBe(true);
    }
  });

  test('the pediment sits on the portico, its architrave under its gable', () => {
    expect(SHIPPED.ped).toEqual([0, 0.32 + 2.25, 2.82 + 0.58]);
    expect(SHIPPED.architrave.min[1]).toBeCloseTo(SHIPPED.ped[1], 9);
    expect(SHIPPED.architrave.max[1] - SHIPPED.architrave.min[1]).toBeCloseTo(0.3, 9);
    expect(SHIPPED.architrave.max[2] - SHIPPED.architrave.min[2]).toBeCloseTo(PED.depth + 0.2, 9);
  });
});

// ── §C · The four intersections the phase exists to clear ─────────────────

describe('C-8.57 §C — capitals, abaci and architrave clear the eave and the cornice', () => {
  test('no column capital intersects the roof fascia', () => {
    for (const c of SHIPPED.cols) {
      expect(overlap(c.capital, SHIPPED.fascia)).toBeNull();
      // and it clears by the project's own tolerance, by height not by luck
      expect(SHIPPED.fascia.min[1] - c.capital.max[1]).toBeGreaterThanOrEqual(TOL - 1e-9);
    }
  });

  test('no column abacus intersects the roof fascia', () => {
    for (const c of SHIPPED.cols) {
      expect(overlap(c.abacus, SHIPPED.fascia)).toBeNull();
      expect(SHIPPED.fascia.min[1] - c.abacus.max[1]).toBeGreaterThanOrEqual(TOL - 1e-9);
    }
  });

  test('the whole order — shaft, necking ring and plinth included — is clear of the eave', () => {
    const eaveBoxes = [SHIPPED.fascia, SHIPPED.planeL, SHIPPED.planeR, SHIPPED.ridge];
    for (const c of SHIPPED.cols) {
      for (const e of eaveBoxes) {
        expect(overlap(c.plinth, e)).toBeNull();
        expect(overlap(c.basering, e)).toBeNull();
        expect(overlap(c.shaft, e)).toBeNull();
        expect(overlap(c.neck, e)).toBeNull();
        expect(overlap(c.capital, e)).toBeNull();
        expect(overlap(c.abacus, e)).toBeNull();
      }
    }
  });

  test('the order is clear of the wall cornice too', () => {
    for (const c of SHIPPED.cols) {
      expect(overlap(c.capital, SHIPPED.cornF)).toBeNull();
      expect(overlap(c.abacus, SHIPPED.cornF)).toBeNull();
      expect(overlap(c.shaft, SHIPPED.cornF)).toBeNull();
      expect(overlap(c.neck, SHIPPED.cornF)).toBeNull();
    }
  });

  test('the pediment architrave clears the roof fascia', () => {
    expect(overlap(SHIPPED.architrave, SHIPPED.fascia)).toBeNull();
    expect(SHIPPED.architrave.min[2] - SHIPPED.fascia.max[2]).toBeGreaterThanOrEqual(TOL - 1e-9);
  });

  test('the pediment architrave clears the wall cornice', () => {
    expect(overlap(SHIPPED.architrave, SHIPPED.cornF)).toBeNull();
    expect(SHIPPED.architrave.min[2] - SHIPPED.cornF.max[2]).toBeGreaterThanOrEqual(TOL - 1e-9);
  });

  test('and nothing else in the pediment reaches the eave, the cornice or the wall', () => {
    const eaveBoxes = [SHIPPED.fascia, SHIPPED.planeL, SHIPPED.planeR, SHIPPED.ridge];
    for (const part of [SHIPPED.architrave, SHIPPED.frieze, SHIPPED.tympanum, SHIPPED.rakeL, SHIPPED.rakeR]) {
      for (const e of eaveBoxes) expect(overlap(part, e)).toBeNull();
      expect(overlap(part, SHIPPED.cornF)).toBeNull();
      expect(overlap(part, SHIPPED.wall)).toBeNull();
    }
    // the acroterion is forward of the ridge cap in Z, so the two cannot meet
    expect(SHIPPED.acro.min[2]).toBeGreaterThan(SHIPPED.ridge.max[2]);
  });

  test('the pediment is still centred on the entrance axis', () => {
    expect(PED.pos[0]).toBe(0);
    expect(SHIPPED.architrave.min[0]).toBeCloseTo(-(PED.width + 0.4) / 2, 9);
    expect(SHIPPED.architrave.max[0]).toBeCloseTo((PED.width + 0.4) / 2, 9);
  });
});

// ── §D · The seat ─────────────────────────────────────────────────────────

describe('C-8.57 §D — the column-to-architrave seat is preserved at 0.05', () => {
  test('the order\'s top still penetrates the architrave\'s underside by 0.05', () => {
    for (const c of SHIPPED.cols) {
      const seat = c.abacus.max[1] - SHIPPED.architrave.min[1];
      expect(seat).toBeCloseTo(0.05, 9);
      expect(Math.abs(seat - 0.05)).toBeLessThanOrEqual(TOL);
    }
  });

  test('the seat is a bearing, not a knife edge: the two overlap in Z and in X', () => {
    for (const c of SHIPPED.cols) {
      const o = overlap(c.abacus, SHIPPED.architrave);
      expect(o).not.toBeNull();
      expect(o![2]).toBeGreaterThan(0.1); // 0.1075 of the abacus's 0.375 depth sits under it
      expect(overlap(c.capital, SHIPPED.architrave)).not.toBeNull();
    }
  });

  test('the order\'s top is below the eave by exactly the tolerance it was set to', () => {
    const top = PORTICO[1] + COL.height;
    expect(SHIPPED.fascia.min[1] - top).toBeCloseTo(TOL, 9);
  });
});

// ── §E · The acroterion and the ridge cap ─────────────────────────────────

describe('C-8.57 §E — the acroterion keeps its relationship with the ridge cap', () => {
  // **Rebased by C-8.62** — the one assertion in this suite whose expected value moved. The finial
  // now seats on the two raking cornices' crowns where they meet at the apex, so it rides
  // `crownLift` = (rakeThickness / 2) · cos(slopeAngle) = 0.0715542 higher: its top goes 4.24 →
  // **4.3115542**, i.e. 0.0265542 ABOVE the ridge cap's own top plane (4.285) instead of 0.045
  // below it. The relationship this test exists to pin — the finial held at a fixed elevation by
  // the gable, and clear of the ridge cap — is re-stated against the measured value and the
  // no-intersection check below is unchanged (the two solids stay 0.835 apart in Z, so the 0.0266
  // of overlap in Y costs nothing). The lift is the primitive's own derived quantity, not a guess.
  test('the acroterion seats on the rake crowns, and clears the ridge cap', () => {
    const crownLift = Math.cos(Math.atan2(PED.height, PED.width / 2)) * (PED_F.rakeThickness / PED_F.crownDivisor);
    const gap = SHIPPED.ridge.max[1] - SHIPPED.acro.max[1];
    expect(gap).toBeCloseTo(0.045 - crownLift, 9);
    expect(gap).toBeCloseTo(-0.026554175279993, 9);
  });

  test('and it does not intersect the ridge cap', () => {
    expect(overlap(SHIPPED.acro, SHIPPED.ridge)).toBeNull();
  });

  test('the taller gable is what keeps the acroterion\'s elevation', () => {
    // base 2.57 + 0.30 + height + 0.16 + half the finial = the shipped absolute top
    const shippedTop = 2.77 + 0.3 + 0.85 + 0.16 + PED_F.acro[4] / 2;
    expect(SHIPPED.acro.max[1]).toBeCloseTo(shippedTop, 9);
    expect(SHIPPED.ped[1] - (PREFIX.ped[1])).toBeCloseTo(-0.2, 9);
    expect(PED.height - 0.85).toBeCloseTo(0.2, 9);
  });
});

// ── §F · Symmetry ─────────────────────────────────────────────────────────

describe('C-8.57 §F — the portico stays symmetrical about the entrance axis', () => {
  test('the two columns mirror about X = 0', () => {
    const [l, r] = SHIPPED.cols;
    expect(l.x).toBe(-r.x);
    expect(near(l.capital.min[0], -r.capital.max[0], 1e-9)).toBe(true);
    expect(near(l.plinth.max[0], -r.plinth.min[0], 1e-9)).toBe(true);
  });

  test('every pediment part is centred on X = 0', () => {
    for (const part of [SHIPPED.architrave, SHIPPED.frieze, SHIPPED.tympanum, SHIPPED.acro]) {
      expect(near(part.min[0], -part.max[0], 1e-9)).toBe(true);
    }
    expect(near(SHIPPED.rakeL.min[2], SHIPPED.rakeR.min[2], 1e-9)).toBe(true);
    expect(near(SHIPPED.rakeL.max[1], SHIPPED.rakeR.max[1], 1e-9)).toBe(true);
  });

  test('the pediment is aligned with the doorway\'s own axis', () => {
    const doorX = num(hallSrc, /<ClassicalDoorway\s*position=\{\[\s*(-?[\d.]+),/);
    expect(doorX).toBe(0);
    expect(PED.pos[0]).toBe(doorX);
    expect(near(SHIPPED.ped[0], doorX, 1e-9)).toBe(true);
  });
});

// ── §G · Gameplay and unrelated geometry ──────────────────────────────────

describe('C-8.57 §G — the collider, hub and fast travel are untouched', () => {
  test('the registry still holds the same colliders and the same hall rectangle', () => {
    expect(CITY_COLLIDERS.length).toBe(110);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(31);
    expect(vetRect()).toMatchObject({ type: 'rect', id: 'veteran-hall', cx: -24, cz: -25, hw: 3.3, hd: 3.05 });
    expect(shapesSrc.includes("RECT('veteran-hall', -24, -25, 6.6, 6.1)")).toBe(true);
  });

  test('the rendered lower step still IS the collider (the registry/render invariant)', () => {
    const rect = vetRect();
    expect(HALL_ROOT[0] + SHIPPED.step1.min[0]).toBeCloseTo(rect.cx - rect.hw, 9);
    expect(HALL_ROOT[0] + SHIPPED.step1.max[0]).toBeCloseTo(rect.cx + rect.hw, 9);
    expect(HALL_ROOT[2] + SHIPPED.step1.min[2]).toBeCloseTo(rect.cz - rect.hd, 9);
    expect(HALL_ROOT[2] + SHIPPED.step1.max[2]).toBeCloseTo(rect.cz + rect.hd, 9);
  });

  test('the moved order still stands entirely inside that lower step', () => {
    const rect = vetRect();
    const front = rect.cz + rect.hd - HALL_ROOT[2]; // 3.05 in the hall's own frame
    for (const c of SHIPPED.cols) {
      expect(c.plinth.max[2]).toBeLessThanOrEqual(front + 1e-9);
      expect(c.basering.max[2]).toBeLessThanOrEqual(front + 1e-9);
    }
    // and the upper step it stands on is inside the lower step too
    expect(SHIPPED.step2.max[2]).toBeLessThanOrEqual(front + 1e-9);
    expect(SHIPPED.step2.max[0]).toBeLessThanOrEqual(SHIPPED.step1.max[0] + 1e-9);
  });

  test('the order keeps the same plinth cantilever the shipped plinth had', () => {
    const shippedCant = PREFIX.cols[0].plinth.max[2] - PREFIX.step2.max[2];
    const nowCant = SHIPPED.cols[0].plinth.max[2] - SHIPPED.step2.max[2];
    expect(shippedCant).toBeCloseTo(0.095, 9);
    expect(nowCant).toBeCloseTo(0.095, 9);
  });

  test('the hub and the fast-travel arrival are unchanged', () => {
    const hub = HUB_LOCATIONS.find((h) => h.id === 'veteran_gladiator_hall')!;
    expect(hub.position).toEqual([-24, 0, -25]);
    expect(hub.radius).toBe(4.5);
    expect(FAST_TRAVEL_ARRIVALS.veteran_gladiator_hall).toEqual([-24, -29]);
    expect(citySrc.includes('veteran_gladiator_hall')).toBe(true);
  });

  test('the doorway still raises its own prompt, and the arrival is collision-free', () => {
    const stand = [-24, 0, vetRect().cz + vetRect().hd + PLAYER_RADIUS + 0.05];
    expect(collidesWith(stand[0], stand[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(getNearbyHubLocation(stand as [number, number, number])?.id).toBe('veteran_gladiator_hall');
    const arrival = FAST_TRAVEL_ARRIVALS.veteran_gladiator_hall;
    expect(collidesWith(arrival[0], arrival[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('nothing else in the hall component moved', () => {
    // the doorway, the window and the wall trophies are the ones they were
    // (Phase C-8.60 moved the doorway's group 0.08 back, 2.58 → 2.50, to clear its projecting
    // cornice cap from the pediment's raking cornices; its Y and its own 1.6 × 2.2 × 0.35 box,
    // and the window and trophy group below, are exactly what this phase left them)
    expect(nums(hallSrc, /<ClassicalDoorway\s*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/)).toEqual([0, 0.32, 2.50]);
    expect(nums(hallSrc, /<ClassicalWindow\s*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/)).toEqual([-2.86, 1.7, 0]);
    expect(nums(hallSrc, /6\. SIMPLE TROPHY SHIELDS[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/)).toEqual([0, 1.6, 2.62]);
    // the shared primitive was not edited by this phase
    expect(colSrc.includes('const plinthHeight = Math.min(0.25, height * 0.07);')).toBe(true);
    expect(colSrc.includes('const halfSpan = span / 2 + eaveOverhang;')).toBe(true);
    expect(colSrc.includes('<boxGeometry args={[width + 0.4, 0.3, depth + 0.2]} />')).toBe(true);
  });
});

// ── §H · The control ──────────────────────────────────────────────────────

describe('C-8.57 §H — the control: the shipped geometry fails these same checks', () => {
  test('the control frame is the pre-fix one', () => {
    expect(PREFIX.ped[1]).toBeCloseTo(2.77, 9);
    expect(PREFIX.roofMeta.fascia).toEqual([5.7 + 0.35 * 1.2, 0.16, 5.2 + 0.35 * 1.2]);
    expect(PREFIX.port[2]).toBeCloseTo(2.7, 9);
  });

  test('all four reported intersections reproduce exactly', () => {
    const c = PREFIX.cols[0];
    const cap = overlap(c.capital, PREFIX.fascia)!;
    const aba = overlap(c.abacus, PREFIX.fascia)!;
    const archF = overlap(PREFIX.architrave, PREFIX.fascia)!;
    const archC = overlap(PREFIX.architrave, PREFIX.cornF)!;
    expect(cap.map((v) => Number(v.toFixed(4)))).toEqual([0.39, 0.16, 0.305]);
    expect(aba.map((v) => Number(v.toFixed(4)))).toEqual([0.375, 0.06, 0.2975]);
    expect(archF.map((v) => Number(v.toFixed(4)))).toEqual([4.6, 0.03, 0.61]);
    expect(archC.map((v) => Number(v.toFixed(4)))).toEqual([4.6, 0.06, 0.12]);
  });

  test('the pre-fix capital/abacus reach the fascia, and the architrave both bands', () => {
    for (const c of PREFIX.cols) {
      expect(overlaps(c.capital, PREFIX.fascia)).toBe(true);
      expect(overlaps(c.abacus, PREFIX.fascia)).toBe(true);
    }
    expect(overlaps(PREFIX.architrave, PREFIX.fascia)).toBe(true);
    expect(overlaps(PREFIX.architrave, PREFIX.cornF)).toBe(true);
  });

  test('the shipped geometry passes the identical predicates', () => {
    for (const c of SHIPPED.cols) {
      expect(overlaps(c.capital, SHIPPED.fascia)).toBe(false);
      expect(overlaps(c.abacus, SHIPPED.fascia)).toBe(false);
    }
    expect(overlaps(SHIPPED.architrave, SHIPPED.fascia)).toBe(false);
    expect(overlaps(SHIPPED.architrave, SHIPPED.cornF)).toBe(false);
  });

  test('the pre-fix capital is buried in the wall, which is why it could not clear any eave', () => {
    const capital = PREFIX.cols[0].capital;
    expect(overlap(capital, PREFIX.wall)).not.toBeNull();
    expect(PREFIX.wall.max[2] - capital.min[2]).toBeCloseTo(0.095, 9);
    // the shipped one is clear of the wall: the order moved forward with the portico
    expect(overlap(SHIPPED.cols[0].capital, SHIPPED.wall)).toBeNull();
  });

  test('the pre-fix pediment\'s raking cornices were buried in the roof slope', () => {
    expect(overlaps(PREFIX.rakeL, PREFIX.planeL) || overlaps(PREFIX.rakeR, PREFIX.planeR)).toBe(true);
    expect(overlaps(SHIPPED.rakeL, SHIPPED.planeL)).toBe(false);
    expect(overlaps(SHIPPED.rakeR, SHIPPED.planeR)).toBe(false);
  });

  test('the pre-fix acroterion clipped the ridge cap', () => {
    expect(overlaps(PREFIX.acro, PREFIX.ridge)).toBe(true);
    // the pre-fix finial's Z back face (2.975) sat 0.015 inside the ridge cap's front (2.99)
    expect(PREFIX.acro.min[2]).toBeCloseTo(2.975, 9);
    expect(PREFIX.ridge.max[2] - PREFIX.acro.min[2]).toBeCloseTo(0.015, 9);
    expect(overlaps(SHIPPED.acro, SHIPPED.ridge)).toBe(false);
  });

  test('the pre-fix seat was 0.05 too, so the seat itself was never the defect', () => {
    for (const c of PREFIX.cols) {
      expect(c.abacus.max[1] - PREFIX.architrave.min[1]).toBeCloseTo(0.05, 9);
    }
  });
});
