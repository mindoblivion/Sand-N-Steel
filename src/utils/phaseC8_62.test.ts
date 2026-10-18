/**
 * Phase C-8.62 — `ClassicalPediment`: the raking cornices follow the gable's own edges.
 *
 * ── THE DEFECT (re-derived here from the shipped formulas, not restated) ───
 * The shared pediment primitive rotated its LEFT raking cornice by `−slopeAngle` and its RIGHT by
 * `+slopeAngle` about centres at `∓halfBase / 2`, so BOTH bars descended from their own eave corner
 * TOWARD the axis and met low over the pediment's centre as a V — the opposite of the gable they
 * exist to trace. Each bar was also `rafterLen + 0.2`, i.e. 0.2 longer than the corner-to-apex run,
 * which pushed it 0.1 past its own eave corner and 0.1 past the apex, and its section was 0.22.
 * Measured at the four call sites (below), the V's own bars crossed the axis far below the gable's
 * apex and left the gable's upper triangle as the only free area a decoration could use, which is
 * what bounded the Veteran Hall wreath in C-8.60 (that phase recorded the V and deferred it).
 *
 * ── THE CORRECTION (the primitive's own construction, nothing else) ───────
 *   | quantity | before | after |
 *   |---|---|---|
 *   | LEFT / RIGHT rake rotation | `−slopeAngle` / `+slopeAngle` | **`+slopeAngle` / `−slopeAngle`** |
 *   | rake run (box X) | `rafterLen + 0.2` | **`rafterLen`** |
 *   | rake section (box Y) | 0.22 | **`rakeThickness` = 0.16** |
 *   | apex acroterion | `0.3 + height + 0.16` | **`0.3 + height + 0.16 + crownLift`** |
 *
 * With the signs corrected, each bar's own axis runs exactly from its eave corner `(∓halfBase, 0.3)`
 * to the apex `(0, 0.3 + height)`; with the length reduced to that run, the two bars MEET at the
 * apex instead of crossing through it; and the thinner section keeps the bar clear of the tympanum
 * panel's edges and of the roof behind the gable. `crownLift` — `cos(slopeAngle) · (rakeThickness /
 * 2)` — is the one derived quantity the correction needs: where the two bars meet on the axis their
 * crowns stand that far above the apex, so the acroterion is lifted by exactly that much and its
 * underside seats on the joint instead of sinking into it. **No call site changed**: the four
 * pediments keep their own widths, depths, heights and positions, and no collider, hub or movement
 * constant moved.
 *
 * ── WHAT THIS SUITE PINS, AND HOW ─────────────────────────────────────────
 * Nothing here is a copied constant: the primitive's coefficients are parsed out of
 * `ClassicalArchitecture.tsx` and applied as the real formulas; each of the four call sites' props
 * and its ancestor-group offsets are parsed out of its own component source (with an explicit
 * assertion that every ancestor literal is present, so the frame cannot silently go stale); and the
 * solids are the real ones — Z-rotated boxes tested with a separating-axis test, and the wreath's
 * torus folded against a box's own radial reach about the ring's axis, the same predicate C-8.60
 * uses. The four sites are the Veteran Gladiator Hall, the Roman Shrine, the Records Library and the
 * Grand Colosseum's portal gable, and a repo sweep asserts no other component mounts the pediment.
 *
 * §A the primitive as source · §B gable-edge alignment at all four sites · §C left/right symmetry ·
 * §D finial seating on the crowns · §E the real solids (the apex joint, the bearing on the
 * entablature, the finial in contact but not sunk) · §F the Veteran Hall wreath's clearance ·
 * §G the Records Library's residual cella-roof intersection, measured and left alone ·
 * §H the controls — the old signs, the `+0.2` run, the 0.22 section and a mis-set finial each fail
 * the predicate the shipped frame passes · §I the scope guard.
 *
 * ASSUMPTIONS, stated: the primitive's four call sites are all under `src/components` and all are
 * parsed here; the tympanum panel and the roofs are NOT modelled as solids by this suite (the panel
 * is a zero-thickness `shapeGeometry`, and the roofs are site-specific), so the only roof-related
 * claim it makes is the Records Library's, measured against the real eave-plate box; and no
 * assertion here speaks about rendered appearance — a source-geometry suite pins transforms, and the
 * Android look remains a device question.
 *
 * Run with: bun test src/utils/phaseC8_62.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { PLAYER_RADIUS, CITY_COLLIDERS } from './collisionShapes';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const colSrc = load('../components/3d/city/ClassicalArchitecture.tsx');
const hallSrc = load('../components/3d/city/VeteranGladiatorHall.tsx');
const shrineSrc = load('../components/3d/city/RomanShrine.tsx');
const libSrc = load('../components/3d/city/RecordsLibrary.tsx');
const coloSrc = load('../components/3d/city/GrandColosseum.tsx');

type V3 = [number, number, number];

/** The project's seating/clearance tolerance — the architrave, C-8.52, C-8.53, C-8.55, C-8.57. */
const TOL = 0.02;

// ── Tiny parsers (the style of the C-8.18 … C-8.60 suites) ────────────────

function nums(src: string, re: RegExp): number[] {
  const m = re.exec(src);
  if (!m) throw new Error(`not found: ${re}`);
  return m.slice(1).map(Number);
}
const num = (src: string, re: RegExp): number => nums(src, re)[0];
const triple = (src: string, re: RegExp): V3 => {
  const n = nums(src, re);
  return [n[0], n[1], n[2]];
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Vectors, oriented boxes and the ring (C-8.60's helpers, reused) ───────

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

/** A box of `size` centred at `c`, rotated `rz` about Z — the only rotation this primitive uses. */
interface OBB {
  c: V3;
  h: V3;
  u: [V3, V3, V3];
}
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

/** Boxes sharing volume? Separating-axis test over the 6 face normals plus all edge cross products. */
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

/**
 * Separation of two boxes along the best of the 15 separating-axis candidates: negative when they
 * really share volume, and its magnitude then IS the penetration depth. Used where an axis-aligned
 * interval overlap is not the same thing as a conflict — two rotated bars crossing above an
 * axis-aligned box overlap on all three world axes while never touching.
 */
function satGap(a: OBB, b: OBB): number {
  const axes: V3[] = [...a.u, ...b.u];
  for (const x of a.u) {
    for (const y of b.u) {
      const c = cross(x, y);
      if (norm(c) > 1e-9) axes.push(c);
    }
  }
  const d = sub(b.c, a.c);
  let g = -Infinity;
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
    g = Math.max(g, Math.abs(dot(d, ax)) - ra - rb);
  }
  return g;
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

/** Is the point inside the box (boundary included)? */
function inside(p: V3, b: OBB): boolean {
  const d = sub(p, b.c);
  return (
    Math.abs(dot(d, b.u[0])) <= b.h[0] + 1e-9 &&
    Math.abs(dot(d, b.u[1])) <= b.h[1] + 1e-9 &&
    Math.abs(dot(d, b.u[2])) <= b.h[2] + 1e-9
  );
}

const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];

/**
 * The volume two boxes REALLY share, sampled inside their common bounds — the only way to state the
 * apex joint as a measurement rather than as an axis-aligned interval, which for two crossing bars
 * would span the whole of both. Returns null when they do not meet.
 */
interface Joint {
  count: number;
  centroid: V3;
  yBand: [number, number];
  xBand: [number, number];
}
function sharedVolume(a: OBB, b: OBB, n = 80): Joint | null {
  const xa = intervalOn(a, X);
  const xb = intervalOn(b, X);
  const ya = intervalOn(a, Y);
  const yb = intervalOn(b, Y);
  const za = intervalOn(a, Z);
  const zb = intervalOn(b, Z);
  const lo: V3 = [Math.max(xa[0], xb[0]), Math.max(ya[0], yb[0]), Math.max(za[0], zb[0])];
  const hi: V3 = [Math.min(xa[1], xb[1]), Math.min(ya[1], yb[1]), Math.min(za[1], zb[1])];
  if (lo[0] > hi[0] || lo[1] > hi[1] || lo[2] > hi[2]) return null;
  const c: V3 = [0, 0, 0];
  let count = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n; j += 1) {
      for (let k = 0; k <= n; k += 1) {
        const p: V3 = [
          lo[0] + ((hi[0] - lo[0]) * i) / n,
          lo[1] + ((hi[1] - lo[1]) * j) / n,
          lo[2] + ((hi[2] - lo[2]) * k) / n,
        ];
        if (!inside(p, a) || !inside(p, b)) continue;
        count += 1;
        c[0] += p[0];
        c[1] += p[1];
        c[2] += p[2];
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
      }
    }
  }
  if (!count) return null;
  return {
    count,
    centroid: [c[0] / count, c[1] / count, c[2] / count],
    yBand: [minY, maxY],
    xBand: [minX, maxX],
  };
}

/** Distance from a point to the rectangle it is the centre of (`A`, `B` are the half-vectors). */
function rectDist(p: [number, number], A: [number, number], B: [number, number]): number {
  const d2 = (u: [number, number], v: [number, number]): number => u[0] * v[0] + u[1] * v[1];
  const q: [number, number] = [-p[0], -p[1]];
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

/** A torus lying in the XY plane: centre, major radius, tube radius. */
interface Ring {
  c: V3;
  R: number;
  r: number;
}
/** Exact minimum distance between a box and a ring, minus the tube — negative when buried. */
function ringGap(b: OBB, t: Ring): number {
  const ctr: [number, number] = [b.c[0] - t.c[0], b.c[1] - t.c[1]];
  const A: [number, number] = [b.u[0][0] * b.h[0], b.u[0][1] * b.h[0]];
  const B: [number, number] = [b.u[1][0] * b.h[1], b.u[1][1] * b.h[1]];
  const rmin = rectDist(ctr, A, B);
  const far = Math.max(
    Math.hypot(ctr[0] + A[0] + B[0], ctr[1] + A[1] + B[1]),
    Math.hypot(ctr[0] + A[0] - B[0], ctr[1] + A[1] - B[1]),
    Math.hypot(ctr[0] - A[0] + B[0], ctr[1] - A[1] + B[1]),
    Math.hypot(ctr[0] - A[0] - B[0], ctr[1] - A[1] - B[1]),
  );
  const dR = t.R >= rmin && t.R <= far ? 0 : Math.min(Math.abs(t.R - rmin), Math.abs(t.R - far));
  const [a0, a1] = intervalOn(b, Z);
  const dA = Math.max(0, Math.max(a0 - t.c[2], t.c[2] - a1));
  return Math.hypot(dR, dA) - t.r;
}

// ── The primitive's own construction (parsed, then applied) ──────────────

/** The corrected raking-cornice section. */
const RAKE_T = num(colSrc, /const rakeThickness = ([\d.]+);/);
/** `crownLift = Math.cos(slopeAngle) * (rakeThickness / <divisor>)` — the seating offset. */
const CROWN_DIV = num(colSrc, /const crownLift = Math\.cos\(slopeAngle\) \* \(rakeThickness \/ ([\d.]+)\);/);
/** The rakes' own Z overhang past the entablature. */
const RAKE_Z_EXTRA = num(colSrc, /<boxGeometry args=\{\[rafterLen, rakeThickness, depth \+ ([\d.]+)\]\}/);
/** The horizontal entablature: `position={[0, y, 0]}`, `[width + a, h, depth + b]`. */
const ENTAB = nums(
  colSrc,
  /<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>\s*<boxGeometry args=\{\[width \+ ([\d.]+), ([\d.]+), depth \+ ([\d.]+)\]\}/,
);
/** The apex acroterion: `[0, a + height + b + crownLift, depth / 2 + c]`, `[sx, sy, sz]`. */
const ACRO = nums(
  colSrc,
  /position=\{\[0, ([\d.]+) \+ height \+ ([\d.]+) \+ crownLift, depth \/ 2 \+ ([\d.]+)\]\}>\s*<boxGeometry args=\{\[([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/,
);
/** `RomanGabledRoof`'s bearing cornice (the eave plate): `[0, drop, 0]`, `[w + ov·k, h, d + ov·k]`. */
const FASCIA = nums(
  colSrc,
  /position=\{\[0, (-?[\d.]+), 0\]\}>\s*<boxGeometry args=\{\[width \+ eaveOverhang \* ([\d.]+), ([\d.]+), depth \+ eaveOverhang \* ([\d.]+)\]\}/,
);
/** The gable base inside the primitive: the entablature's own top plane. */
const BASE = ENTAB[0] + ENTAB[2] / 2;
/** The pediment's own section of the shared file, so section/rotation claims read only its own code. */
const PED_SECTION = colSrc.slice(
  colSrc.indexOf('export const ClassicalPediment'),
  colSrc.indexOf('export const ClassicalColumn'),
);

/** `+slopeAngle` on the left and `−slopeAngle` on the right is the C-8.62 orientation. */
const rakeSign = (which: 'L' | 'R'): number => {
  const at = which === 'L' ? '\\[-halfBase \\/ 2' : '\\[halfBase \\/ 2';
  const re = new RegExp(
    `position=\\{${at}, [\\d.]+ \\+ height \\/ 2, 0\\]\\}\\s*rotation=\\{\\[0, 0, (-?)slopeAngle\\]\\}`,
  );
  const m = re.exec(colSrc);
  if (!m) throw new Error(`no rake rotation for ${which}`);
  return m[1] === '-' ? -1 : 1;
};

// ── The four call sites (props + ancestor chain, parsed from each source) ─

interface SiteDef {
  id: string;
  name: string;
  src: string;
  /** The ancestor `<group position={[…]} />` literals, outermost first — asserted present below. */
  ancestors: string[];
}
const SITE_DEFS: SiteDef[] = [
  {
    id: 'vet',
    name: 'Veteran Gladiator Hall',
    src: hallSrc,
    ancestors: ['<group position={[-24, 0, -25]}>', '<group position={[0, 0.32, 2.82]}>'],
  },
  { id: 'shrine', name: 'Roman Shrine', src: shrineSrc, ancestors: ['<group position={[-27, 0, 11]}>'] },
  {
    id: 'lib',
    name: 'Records Library',
    src: libSrc,
    ancestors: ['<group position={[23.10, 0, -30]}>', '<group position={[0, 0.5, 1.6]}>'],
  },
  {
    id: 'colo',
    name: 'Grand Colosseum',
    src: coloSrc,
    ancestors: ['<group position={[0, 0, 15.2]}>', '<group position={[0, 0, 2.2]}>'],
  },
];

const PED_RE =
  /<ClassicalPediment\s*width=\{([\d.]+)\}\s*depth=\{([\d.]+)\}\s*height=\{([\d.]+)\}\s*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/;

const PED_PROPS = new Map(SITE_DEFS.map((s) => [s.id, nums(s.src, PED_RE)]));
const sumChain = (s: SiteDef, from: number): V3 =>
  s.ancestors
    .slice(from)
    .reduce<V3>((a, lit) => add(a, triple(lit, /\[(-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\]/)), [0, 0, 0]);
const PED_WORLD = new Map(
  SITE_DEFS.map((s) => {
    const p = PED_PROPS.get(s.id) as number[];
    return [s.id, add(sumChain(s, 0), [p[3], p[4], p[5]])];
  }),
);
/** The pediment's own frame inside its component (root dropped) — where the wreath and roof live. */
const PED_LOCAL = new Map(
  SITE_DEFS.map((s) => {
    const p = PED_PROPS.get(s.id) as number[];
    return [s.id, add(sumChain(s, 1), [p[3], p[4], p[5]])];
  }),
);

interface Site {
  def: SiteDef;
  width: number;
  depth: number;
  height: number;
  halfBase: number;
  slope: number;
  rafterLen: number;
}
const siteOf = (def: SiteDef): Site => {
  const p = PED_PROPS.get(def.id) as number[];
  const width = p[0];
  const depth = p[1];
  const height = p[2];
  const halfBase = width / 2;
  const slope = Math.atan2(height, halfBase);
  return { def, width, depth, height, halfBase, slope, rafterLen: Math.hypot(halfBase, height) };
};
const crownLiftOf = (site: Site, thick = RAKE_T): number => Math.cos(site.slope) * (thick / CROWN_DIV);
const orgOf = (def: SiteDef, local: boolean): V3 =>
  (local ? PED_LOCAL.get(def.id) : PED_WORLD.get(def.id)) as V3;

interface Built {
  site: Site;
  org: V3;
  apex: V3;
  crownPlane: number;
  rakeL: OBB;
  rakeR: OBB;
  acro: OBB;
  entab: OBB;
  lift: number;
  thick: number;
  rakeLen: number;
}

interface Mutations {
  /** The pre-C-8.62 orientation: each bar descends toward the axis as a V. */
  vSigns?: boolean;
  thick?: number;
  /** Extra length past `rafterLen` — the old `+ 0.2`. */
  lenExtra?: number;
  /** `null` removes the lift; a number replaces it (a mis-set finial). */
  lift?: number | null;
}

function build(def: SiteDef, opts: Mutations = {}, local = false): Built {
  const site = siteOf(def);
  const org = orgOf(def, local);
  const thick = opts.thick ?? RAKE_T;
  const lift = opts.lift === null ? 0 : opts.lift ?? crownLiftOf(site, thick);
  const rakeLen = site.rafterLen + (opts.lenExtra ?? 0);
  const signL = opts.vSigns ? -1 : rakeSign('L');
  const signR = opts.vSigns ? 1 : rakeSign('R');
  const rake = (sign: number, pos: number) =>
    box(
      add(org, [pos, BASE + site.height / 2, 0]),
      [rakeLen, thick, site.depth + RAKE_Z_EXTRA],
      sign * site.slope,
    );
  return {
    site,
    org,
    apex: add(org, [0, BASE + site.height, 0]),
    crownPlane: org[1] + BASE + site.height + lift,
    rakeL: rake(signL, -site.halfBase / 2),
    rakeR: rake(signR, site.halfBase / 2),
    acro: box(
      add(org, [0, ACRO[0] + site.height + ACRO[1] + lift, site.depth / 2 + ACRO[2]]),
      [ACRO[3], ACRO[4], ACRO[5]],
    ),
    entab: box(add(org, [0, ENTAB[0], 0]), [site.width + ENTAB[1], ENTAB[2], site.depth + ENTAB[3]]),
    lift,
    thick,
    rakeLen,
  };
}
/** The bar's own axis unit vector — pointing from its eave corner up to the apex. */
const rakeDir = (which: 'L' | 'R', slope: number): V3 =>
  which === 'L' ? [Math.cos(slope), Math.sin(slope), 0] : [-Math.cos(slope), Math.sin(slope), 0];
/** The centre of a bar's own end face, at either its apex end or its eave end. */
const rakeEnd = (b: OBB, which: 'L' | 'R', slope: number, len: number, end: 'apex' | 'eave'): V3 => {
  const u = rakeDir(which, slope);
  const k = (end === 'apex' ? 1 : -1) * (len / 2);
  return add(b.c, [u[0] * k, u[1] * k, 0]);
};

/** A site's own `RomanGabledRoof` eave plate, in that component's own frame. */
function fasciaOf(src: string): OBB | null {
  const m =
    /<RomanGabledRoof[\s\S]*?width=\{([\d.]+)\}[\s\S]*?depth=\{([\d.]+)\}[\s\S]*?eaveOverhang=\{([\d.]+)\}[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/.exec(
      src,
    );
  if (!m) return null;
  const w = Number(m[1]);
  const d = Number(m[2]);
  const ov = Number(m[3]);
  const py = Number(m[5]);
  const pz = Number(m[6]);
  return box([0, py + FASCIA[0], pz], [w + ov * FASCIA[1], FASCIA[2], d + ov * FASCIA[3]]);
}

// ── §A · The primitive as the source declares it ─────────────────────────

describe('C-8.62 §A — the shared primitive carries the corrected construction', () => {
  test('the section is 0.16 and the crown lift is the section over two', () => {
    expect(RAKE_T).toBe(0.16);
    expect(CROWN_DIV).toBe(2);
    expect(colSrc.includes('const rakeThickness = 0.16;')).toBe(true);
    expect(colSrc.includes('const crownLift = Math.cos(slopeAngle) * (rakeThickness / 2);')).toBe(true);
  });

  test('the two rakes rise to the apex: `+slopeAngle` left, `−slopeAngle` right', () => {
    expect(rakeSign('L')).toBe(1);
    expect(rakeSign('R')).toBe(-1);
    // the exact source forms, so a re-sign is a visible change
    expect(PED_SECTION.includes('rotation={[0, 0, slopeAngle]}')).toBe(true);
    expect(PED_SECTION.includes('rotation={[0, 0, -slopeAngle]}')).toBe(true);
    expect(PED_SECTION.includes('position={[-halfBase / 2, 0.3 + height / 2, 0]}')).toBe(true);
    expect(PED_SECTION.includes('position={[halfBase / 2, 0.3 + height / 2, 0]}')).toBe(true);
  });

  test('the run is `rafterLen` with no extension — the old `+ 0.2` and the 0.22 section are gone', () => {
    expect(RAKE_Z_EXTRA).toBeCloseTo(0.35, 9);
    // the executable forms (the phase's own comment quotes `rafterLen + 0.2`, so scan the args)
    expect(/args=\{\[rafterLen \+ /.test(PED_SECTION)).toBe(false);
    expect(/0\.22,/.test(PED_SECTION)).toBe(false);
    expect(PED_SECTION.includes('args={[rafterLen, rakeThickness, depth + 0.35]}')).toBe(true);
  });

  test('the finial rides the derived lift', () => {
    expect(PED_SECTION.includes('0.3 + height + 0.16 + crownLift')).toBe(true);
    expect(ACRO[3]).toBeCloseTo(0.35, 9);
    expect(ACRO[4]).toBeCloseTo(0.32, 9);
    expect(ACRO[5]).toBeCloseTo(0.35, 9);
  });

  test('the base the whole correction is stated against is the entablature\'s own top plane', () => {
    expect(ENTAB[0]).toBeCloseTo(0.15, 9);
    expect(ENTAB[2]).toBeCloseTo(0.3, 9);
    expect(BASE).toBeCloseTo(0.3, 9);
  });
});

// ── §B · Gable-edge alignment at all four call sites ─────────────────────

describe('C-8.62 §B — every rake\'s own axis is the gable\'s own edge', () => {
  for (const def of SITE_DEFS) {
    test(`${def.name}: the bar runs from its eave corner to the apex over \`rafterLen\``, () => {
      const b = build(def);
      const apexEnd = rakeEnd(b.rakeL, 'L', b.site.slope, b.rakeLen, 'apex');
      const eaveEnd = rakeEnd(b.rakeL, 'L', b.site.slope, b.rakeLen, 'eave');
      const eaveCorner: V3 = add(b.org, [-b.site.halfBase, BASE, 0]);
      expect(near(apexEnd[0], b.apex[0])).toBe(true);
      expect(near(apexEnd[1], b.apex[1])).toBe(true);
      expect(near(apexEnd[2], b.apex[2])).toBe(true);
      expect(near(eaveEnd[0], eaveCorner[0])).toBe(true);
      expect(near(eaveEnd[1], eaveCorner[1])).toBe(true);
      expect(b.rakeLen).toBeCloseTo(Math.hypot(b.site.halfBase, b.site.height), 12);
      expect(b.rakeLen - Math.hypot(b.site.halfBase, b.site.height)).toBe(0);
    });

    test(`${def.name}: both bars reach the apex, so the apex lies inside both`, () => {
      const b = build(def);
      expect(inside(b.apex, b.rakeL)).toBe(true);
      expect(inside(b.apex, b.rakeR)).toBe(true);
    });

    test(`${def.name}: each bar reaches exactly its own corner and no further`, () => {
      const b = build(def);
      const reach = (b.thick / 2) * Math.abs(Math.sin(b.site.slope));
      expect(intervalOn(b.rakeL, X)[0]).toBeCloseTo(b.org[0] - b.site.halfBase - reach, 9);
      expect(intervalOn(b.rakeR, X)[1]).toBeCloseTo(b.org[0] + b.site.halfBase + reach, 9);
    });

    test(`${def.name}: the two bars meet only at the apex joint, not on the axis below it`, () => {
      const b = build(def);
      const joint = sharedVolume(b.rakeL, b.rakeR);
      expect(joint).not.toBeNull();
      const j = joint as Joint;
      expect(j.yBand[0]).toBeGreaterThanOrEqual(b.apex[1] - 0.15);
      expect(j.yBand[0]).toBeLessThan(b.apex[1]);
      expect(j.xBand[0]).toBeLessThanOrEqual(b.org[0]);
      expect(j.xBand[1]).toBeGreaterThanOrEqual(b.org[0]);
    });
  }
});

// ── §C · Left/right symmetry about the pediment's own axis ───────────────

describe('C-8.62 §C — the two rakes mirror about the pediment axis', () => {
  for (const def of SITE_DEFS) {
    test(`${def.name}: the rakes are mirror images`, () => {
      const b = build(def);
      const lX = intervalOn(b.rakeL, X);
      const rX = intervalOn(b.rakeR, X);
      expect(lX[0] - b.org[0]).toBeCloseTo(-(rX[1] - b.org[0]), 9);
      expect(lX[1] - b.org[0]).toBeCloseTo(-(rX[0] - b.org[0]), 9);
      const lY = intervalOn(b.rakeL, Y);
      const rY = intervalOn(b.rakeR, Y);
      expect(lY[0]).toBeCloseTo(rY[0], 9);
      expect(lY[1]).toBeCloseTo(rY[1], 9);
      const lZ = intervalOn(b.rakeL, Z);
      const rZ = intervalOn(b.rakeR, Z);
      expect(lZ[0]).toBeCloseTo(rZ[0], 9);
      expect(lZ[1]).toBeCloseTo(rZ[1], 9);
    });

    test(`${def.name}: the apex, the finial and the entablature are all centred on the axis`, () => {
      const b = build(def);
      expect(b.apex[0]).toBeCloseTo(b.org[0], 12);
      expect(b.acro.c[0]).toBeCloseTo(b.org[0], 12);
      expect(b.entab.c[0]).toBeCloseTo(b.org[0], 12);
      expect(b.rakeL.c[0] - b.org[0]).toBeCloseTo(-(b.rakeR.c[0] - b.org[0]), 12);
    });

    test(`${def.name}: the slope is the gable's own rise over run`, () => {
      const b = build(def);
      expect(b.site.slope).toBeCloseTo(Math.atan2(b.site.height, b.site.halfBase), 12);
      expect(b.site.rafterLen).toBeCloseTo(Math.hypot(b.site.halfBase, b.site.height), 12);
      expect(b.site.halfBase).toBeCloseTo(b.site.width / 2, 12);
    });
  }
});

// ── §D · Finial seating on the crowns ────────────────────────────────────

describe('C-8.62 §D — the acroterion seats on the two rake crowns', () => {
  for (const def of SITE_DEFS) {
    test(`${def.name}: the finial's underside lands exactly on the crown plane`, () => {
      const b = build(def);
      const rakeTop = Math.max(intervalOn(b.rakeL, Y)[1], intervalOn(b.rakeR, Y)[1]);
      expect(intervalOn(b.acro, Y)[0]).toBeCloseTo(rakeTop, 9);
      expect(b.crownPlane).toBeCloseTo(rakeTop, 9);
      expect(b.crownPlane - b.apex[1]).toBeCloseTo(crownLiftOf(b.site), 12);
    });

    test(`${def.name}: it touches both rakes — seated, not floating`, () => {
      const b = build(def);
      expect(boxesIntersect(b.acro, b.rakeL)).toBe(true);
      expect(boxesIntersect(b.acro, b.rakeR)).toBe(true);
      // ...but nothing of the finial is buried: the contact is a plane, not a volume
      expect(Math.abs(intervalOn(b.acro, Y)[0] - intervalOn(b.rakeL, Y)[1])).toBeLessThan(1e-9);
    });

    test(`${def.name}: the finial stands clear of the entablature below it`, () => {
      const b = build(def);
      expect(boxesIntersect(b.acro, b.entab)).toBe(false);
      expect(intervalOn(b.acro, Y)[0]).toBeGreaterThan(intervalOn(b.entab, Y)[1]);
    });
  }

  test('the lift the finial rides is derived at every site — the same formula, four slopes', () => {
    expect(crownLiftOf(siteOf(SITE_DEFS[0]))).toBeCloseTo(0.0715541753, 8); // Veteran Hall, 26.5651°
    expect(crownLiftOf(siteOf(SITE_DEFS[1]))).toBeCloseTo(0.0739409138, 8); // Shrine, 22.4428°
    expect(crownLiftOf(siteOf(SITE_DEFS[2]))).toBeCloseTo(0.0744601195, 8); // Library, 21.4477°
    expect(crownLiftOf(siteOf(SITE_DEFS[3]))).toBeCloseTo(0.0742781352, 8); // Colosseum, 21.8014°
  });
});

// ── §E · The real solids ─────────────────────────────────────────────────

describe('C-8.62 §E — the real solids, not their bounds', () => {
  for (const def of SITE_DEFS) {
    test(`${def.name}: each rake bears on the entablature at its own eave corner`, () => {
      const b = build(def);
      expect(boxesIntersect(b.rakeL, b.entab)).toBe(true);
      expect(boxesIntersect(b.rakeR, b.entab)).toBe(true);
      // the bearing is the eave corner only: the bar's apex end stands clear above the entablature
      expect(rakeEnd(b.rakeL, 'L', b.site.slope, b.rakeLen, 'apex')[1]).toBeGreaterThan(
        intervalOn(b.entab, Y)[1],
      );
    });

    test(`${def.name}: the rakes alone carry the gable up from the base plane`, () => {
      const b = build(def);
      const rakeTop = Math.max(intervalOn(b.rakeL, Y)[1], intervalOn(b.rakeR, Y)[1]);
      expect(intervalOn(b.entab, Y)[1]).toBeCloseTo(b.org[1] + BASE, 9);
      expect(rakeTop).toBeCloseTo(b.crownPlane, 9);
      expect(rakeTop - intervalOn(b.entab, Y)[1]).toBeCloseTo(b.site.height + b.lift, 9);
      expect(intervalOn(b.acro, Y)[0]).toBeGreaterThan(intervalOn(b.entab, Y)[1]);
    });

    test(`${def.name}: the sections are the primitive's own three`, () => {
      const b = build(def);
      expect(b.rakeL.h[1] * 2).toBeCloseTo(RAKE_T, 9);
      expect(b.rakeR.h[1] * 2).toBeCloseTo(RAKE_T, 9);
      expect(b.entab.h[1] * 2).toBeCloseTo(ENTAB[2], 9);
      expect(b.acro.h[1] * 2).toBeCloseTo(ACRO[4], 9);
      expect(RAKE_T).toBeLessThan(b.entab.h[1] * 2);
    });

    test(`${def.name}: each bar's depth is the entablature's plus the rakes' own overhang`, () => {
      const b = build(def);
      expect(b.rakeL.h[2] * 2).toBeCloseTo(b.site.depth + RAKE_Z_EXTRA, 9);
      expect(b.rakeR.h[2] * 2).toBeCloseTo(b.site.depth + RAKE_Z_EXTRA, 9);
      expect(b.rakeL.c[2]).toBeCloseTo(b.org[2], 12);
    });
  }
});

// ── §F · The Veteran Gladiator Hall wreath ───────────────────────────────

/** The hall's laurel wreath, parsed from its own source (C-8.60's re-hung ring). */
const TROPHY = triple(
  hallSrc,
  /6\. SIMPLE TROPHY SHIELDS[\s\S]*?<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/,
);
const WREATH_POS = triple(
  hallSrc,
  /Golden Bronze Laurel Wreath[\s\S]*?<mesh position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);
const WREATH_TORUS = nums(
  hallSrc,
  /<torusGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const WREATH_ROT = triple(
  hallSrc,
  /Golden Bronze Laurel Wreath[\s\S]*?<mesh position=\{\[[^\]]*\]\} rotation=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);
const WREATH: Ring = { c: add(TROPHY, WREATH_POS), R: WREATH_TORUS[0], r: WREATH_TORUS[1] };
const VET = SITE_DEFS[0];

/** The hall's doorway, and `ClassicalDoorway`'s own projecting cornice cap, as a real box. */
const DOOR = triple(
  hallSrc,
  /<ClassicalDoorway\s*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);
const DOOR_N = nums(
  hallSrc,
  /<ClassicalDoorway\s*position=\{\[[^\]]*\]\}\s*width=\{([\d.]+)\}\s*height=\{([\d.]+)\}\s*depth=\{([\d.]+)\}/,
);
const JAMB_W = num(colSrc, /const jambWidth = ([\d.]+);/);
const LINTEL_H = num(colSrc, /const lintelHeight = ([\d.]+);/);
const DOOR_CAP = nums(
  colSrc,
  /<mesh castShadow position=\{\[0, height \+ lintelHeight \+ ([\d.]+), ([\d.]+)\]\}>\s*<boxGeometry args=\{\[width \+ jambWidth \* 2 \+ ([\d.]+), ([\d.]+), depth \+ ([\d.]+)\]/,
);
/** The doorway's cap in the hall's own frame, at a given doorway-group Z. */
const capBox = (doorZ: number): OBB =>
  box(
    [DOOR[0], DOOR[1] + DOOR_N[1] + LINTEL_H + DOOR_CAP[0], doorZ + DOOR_CAP[1]],
    [DOOR_N[0] + JAMB_W * 2 + DOOR_CAP[2], DOOR_CAP[3], DOOR_N[2] + DOOR_CAP[4]],
  );
/** C-8.60's own pre-fix doorway Z — the frame that control replays. */
const PREFIX_DOOR_Z = 2.58;

describe('C-8.62 §F — the Veteran Hall wreath keeps its clearance from the corrected rakes', () => {
  test('it is the C-8.60 ring, hung face-on in the tympanum', () => {
    expect(WREATH_ROT).toEqual([0, 0, 0]);
    expect(WREATH_TORUS[0]).toBe(0.28);
    expect(WREATH_TORUS[1]).toBe(0.06);
    expect(WREATH.c[0]).toBe(0);
  });

  test('it clears BOTH corrected rakes by the project\'s tolerance', () => {
    const b = build(VET, {}, true); // the hall's own frame — the wreath's own frame
    const gapL = ringGap(b.rakeL, WREATH);
    const gapR = ringGap(b.rakeR, WREATH);
    expect(gapL).toBeGreaterThanOrEqual(TOL - 1e-9);
    expect(gapR).toBeGreaterThanOrEqual(TOL - 1e-9);
    expect(gapL).toBeCloseTo(gapR, 12);
    // measured on the corrected solid: 0.0361578674 to each — up from the 0.033 the V left
    expect(gapL).toBeCloseTo(0.0361578674, 6);
    expect(gapL).toBeGreaterThan(0.033);
  });

  test('the ring shares the rakes\' own depth, so that margin is a real 3-D clearance', () => {
    const b = build(VET, {}, true);
    const rakeZ = intervalOn(b.rakeL, Z);
    expect(WREATH.c[2] - WREATH.r).toBeGreaterThan(rakeZ[0]);
    expect(WREATH.c[2] + WREATH.r).toBeLessThan(rakeZ[1]);
  });

  test('it is centred on the entrance axis and lower than the crown it hangs under', () => {
    const b = build(VET, {}, true);
    expect(WREATH.c[0]).toBeCloseTo(b.org[0], 12);
    expect(WREATH.c[1] + WREATH.R + WREATH.r).toBeLessThan(b.crownPlane);
    expect(WREATH.c[1]).toBeGreaterThan(b.org[1] + BASE);
  });

  test('the C-8.60 doorway setback still holds — the group is at Z 2.50', () => {
    const doorway = triple(
      hallSrc,
      /<ClassicalDoorway\s*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
    );
    expect(doorway[2]).toBe(2.5);
  });
});

// ── §G · The Records Library's residual roof intersection ────────────────

describe('C-8.62 §G — the Records Library\'s separate cella-roof intersection, measured and left alone', () => {
  test('the Library\'s rake still passes clean through the cella roof\'s eave plate', () => {
    const b = build(SITE_DEFS[2], {}, true);
    const fascia = fasciaOf(libSrc) as OBB;
    expect(fascia).not.toBeNull();
    expect(boxesIntersect(b.rakeL, fascia)).toBe(true);
    const overlap = (ax: V3) => {
      const a = intervalOn(b.rakeL, ax);
      const f = intervalOn(fascia, ax);
      return Math.min(a[1], f[1]) - Math.max(a[0], f[0]);
    };
    expect(overlap(X)).toBeCloseTo(2.8092522, 6);
    expect(overlap(Y)).toBeCloseTo(0.16, 9); // the plate's full thickness — a complete penetration
    expect(overlap(Z)).toBeCloseTo(0.655, 9);
    expect(overlap(Y)).toBeCloseTo(FASCIA[2], 9);
  });

  test('the bar\'s own Y band contains the plate\'s, so nothing separates them', () => {
    const b = build(SITE_DEFS[2], {}, true);
    const fascia = fasciaOf(libSrc) as OBB;
    const rakeY = intervalOn(b.rakeL, Y);
    const plateY = intervalOn(fascia, Y);
    expect(rakeY[0]).toBeLessThan(plateY[0]);
    expect(rakeY[1]).toBeGreaterThan(plateY[1]);
    expect(rakeY[1] - plateY[1]).toBeCloseTo(0.3744601, 6);
    expect(plateY[0] - rakeY[0]).toBeCloseTo(0.7144601, 6);
  });

  test('it is Library-specific: the Hall and the Shrine rakes stand clear of their own roofs', () => {
    const hall = build(VET, {}, true);
    const hallPlate = fasciaOf(hallSrc) as OBB;
    expect(hallPlate).not.toBeNull();
    expect(boxesIntersect(hall.rakeL, hallPlate)).toBe(false);
    expect(intervalOn(hall.rakeL, Z)[0] - intervalOn(hallPlate, Z)[1]).toBeCloseTo(0.105, 9);

    const shrine = build(SITE_DEFS[1], {}, true);
    const shrinePlate = fasciaOf(shrineSrc) as OBB;
    expect(shrinePlate).not.toBeNull();
    expect(boxesIntersect(shrine.rakeL, shrinePlate)).toBe(false);
    expect(intervalOn(shrine.rakeL, Z)[0] - intervalOn(shrinePlate, Z)[1]).toBeCloseTo(0.575, 9);
  });

  test('the Colosseum\'s portal pediment stands alone — no roof on its axis to reach', () => {
    expect(/RomanGabledRoof/.test(coloSrc)).toBe(false);
    expect(/export const RomanGabledRoof/.test(colSrc)).toBe(true); // the primitive exists; this site has none
  });

  test('the residual is a Library layout question, not a rake-orientation one', () => {
    const b = build(SITE_DEFS[2], {}, true);
    const fascia = fasciaOf(libSrc) as OBB;
    // the plate's near face reaches 1.38, the rake's own band starts at 0.725 — they overlap 0.655
    expect(intervalOn(fascia, Z)[1]).toBeCloseTo(1.38, 9);
    expect(intervalOn(b.rakeL, Z)[0]).toBeCloseTo(0.725, 9);
    expect(intervalOn(fascia, Z)[1] - intervalOn(b.rakeL, Z)[0]).toBeCloseTo(0.655, 9);
    expect(b.site.depth).toBe(1.4);
  });
});

// ── §H · The controls: the four mutations this phase replaced ────────────

describe('C-8.62 §H — the control: each mutation fails the predicate the shipped frame passes', () => {
  for (const def of SITE_DEFS) {
    test(`${def.name}: reverting the signs puts the bars back on the axis as a V`, () => {
      const bad = build(def, { vSigns: true });
      expect(inside(bad.apex, bad.rakeL)).toBe(false);
      expect(inside(bad.apex, bad.rakeR)).toBe(false);
      const joint = sharedVolume(bad.rakeL, bad.rakeR) as Joint;
      expect(joint).not.toBeNull();
      expect(bad.apex[1] - joint.yBand[0]).toBeGreaterThan(0.8);
      // the shipped frame, by contrast, keeps its joint within 0.15 of the apex
      const good = build(def);
      const goodJoint = sharedVolume(good.rakeL, good.rakeR) as Joint;
      expect(good.apex[1] - goodJoint.yBand[0]).toBeLessThan(0.15);
    });

    test(`${def.name}: restoring the \`+0.2\` run overshoots the apex by exactly 0.1`, () => {
      const bad = build(def, { lenExtra: 0.2 });
      const over = rakeEnd(bad.rakeL, 'L', bad.site.slope, bad.rakeLen, 'apex');
      expect(norm(sub(over, bad.apex))).toBeCloseTo(0.1, 12);
      expect(norm(sub(over, bad.apex))).toBeGreaterThan(1e-9);
      const cornerOver = norm(
        sub(
          rakeEnd(bad.rakeL, 'L', bad.site.slope, bad.rakeLen, 'eave'),
          add(bad.org, [-bad.site.halfBase, BASE, 0]),
        ),
      );
      expect(cornerOver).toBeCloseTo(0.1, 12);
      // the shipped run lands on the apex exactly
      const good = build(def);
      const on = rakeEnd(good.rakeL, 'L', good.site.slope, good.rakeLen, 'apex');
      expect(norm(sub(on, good.apex))).toBeLessThan(1e-12);
    });
  }

  test('the old rake really did reach the doorway cap — the corrected one does not', () => {
    const old = build(VET, { vSigns: true, lenExtra: 0.2, thick: 0.22 }, true);
    const good = build(VET, {}, true);
    const preCap = capBox(PREFIX_DOOR_Z);
    const shipCap = capBox(DOOR[2]);
    // under the pre-C-8.62 primitive the pre-fix cap was 0.05 INSIDE both rakes
    expect(boxesIntersect(old.rakeL, preCap)).toBe(true);
    expect(satGap(old.rakeL, preCap)).toBeCloseTo(-0.05, 9);
    // and C-8.60's 0.08 setback answered it on that primitive, with 0.03 of clearance in Z
    expect(boxesIntersect(old.rakeL, shipCap)).toBe(false);
    expect(satGap(old.rakeL, shipCap)).toBeCloseTo(0.03, 9);
    // on the corrected rake the same pre-fix cap is clear by 0.297895488 — the rake now traces the
    // gable's edge and stands away from the cap's own Y band, so the pair no longer meets at all
    expect(boxesIntersect(good.rakeL, preCap)).toBe(false);
    expect(satGap(good.rakeL, preCap)).toBeCloseTo(0.297895488, 9);
    expect(satGap(good.rakeR, preCap)).toBeCloseTo(0.297895488, 9);
  });

  test('changing the section back to 0.22 costs the wreath its tolerance', () => {
    const bad = build(VET, { thick: 0.22 }, true);
    const badGap = ringGap(bad.rakeL, WREATH);
    expect(badGap).toBeCloseTo(0.0061578674, 6);
    expect(badGap).toBeLessThan(TOL);
    expect(bad.thick / 2).toBeCloseTo(0.11, 9);
    const good = build(VET, {}, true);
    expect(ringGap(good.rakeL, WREATH) - badGap).toBeCloseTo(0.03, 9);
  });

  for (const def of SITE_DEFS) {
    test(`${def.name}: a mis-set finial no longer seats — removed and doubled lift both fail`, () => {
      const good = build(def);
      const rakeTop = Math.max(intervalOn(good.rakeL, Y)[1], intervalOn(good.rakeR, Y)[1]);

      const sunk = build(def, { lift: null });
      expect(intervalOn(sunk.acro, Y)[0] - rakeTop).toBeCloseTo(-good.lift, 9);
      expect(intervalOn(sunk.acro, Y)[0]).toBeLessThan(rakeTop - TOL);

      const floated = build(def, { lift: good.lift * 2 });
      expect(intervalOn(floated.acro, Y)[0] - rakeTop).toBeCloseTo(good.lift, 9);
      expect(intervalOn(floated.acro, Y)[0]).toBeGreaterThan(rakeTop + TOL);

      // the shipped frame is exactly on the joint
      expect(Math.abs(intervalOn(good.acro, Y)[0] - rakeTop)).toBeLessThan(1e-12);
    });
  }

  test('the corrected frame passes every predicate the four mutations fail', () => {
    for (const def of SITE_DEFS) {
      const good = build(def);
      expect(inside(good.apex, good.rakeL)).toBe(true);
      expect(inside(good.apex, good.rakeR)).toBe(true);
      const on = rakeEnd(good.rakeL, 'L', good.site.slope, good.rakeLen, 'apex');
      expect(norm(sub(on, good.apex))).toBeLessThan(1e-12);
      const rakeTop = Math.max(intervalOn(good.rakeL, Y)[1], intervalOn(good.rakeR, Y)[1]);
      expect(Math.abs(intervalOn(good.acro, Y)[0] - rakeTop)).toBeLessThan(1e-9);
    }
  });
});

// ── §I · The scope guard ─────────────────────────────────────────────────

describe('C-8.62 §I — what did not move', () => {
  test('the four call sites keep their own widths, depths, heights and positions', () => {
    expect(PED_PROPS.get('vet')).toEqual([4.2, 0.8, 1.05, 0, 2.25, 0.58]);
    expect(PED_PROPS.get('shrine')).toEqual([4.6, 1.2, 0.95, 0, 2.85, 1.4]);
    expect(PED_PROPS.get('lib')).toEqual([5.6, 1.4, 1.1, 0, 2.2, 0]);
    expect(PED_PROPS.get('colo')).toEqual([11.0, 3.8, 2.2, 0, 8.8, 0]);
  });

  test('every ancestor frame this suite parses is really in its source', () => {
    for (const s of SITE_DEFS) {
      for (const lit of s.ancestors) expect(s.src.includes(lit)).toBe(true);
      expect((s.src.match(/<ClassicalPediment/g) ?? []).length).toBe(1);
    }
  });

  test('the four sites are every place the primitive is mounted', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (
          full.endsWith('.tsx') &&
          // the mount itself, not the `ClassicalPedimentProps` interface the primitive declares
          /<ClassicalPediment(?=[\s/>])/.test(readFileSync(full, 'utf8'))
        ) {
          hits.push(entry);
        }
      }
    };
    walk(new URL('../components', import.meta.url).pathname);
    expect(hits.sort()).toEqual([
      'GrandColosseum.tsx',
      'RecordsLibrary.tsx',
      'RomanShrine.tsx',
      'VeteranGladiatorHall.tsx',
    ]);
  });

  test('no collider, hub or movement constant is touched by a mesh correction', () => {
    // 110 stood until Phase C-8.64A appended its 31 `circus-*` perimeter
    // segments (141); the 31 rectangles, the 46 `colo-*` ids and the movement
    // constants are this phase's own scope guard and are unchanged.
    expect(CITY_COLLIDERS.length).toBe(141);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(31);
    expect(PLAYER_RADIUS).toBe(0.4);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length).toBe(46);
  });

  test('the pediment carries no collider of its own — it is decoration above the player plane', () => {
    const b = build(SITE_DEFS[3]);
    expect(b.apex[1]).toBeCloseTo(11.3, 9);
    expect(intervalOn(b.entab, Y)[0]).toBeGreaterThan(PLAYER_RADIUS);
  });

  test('the primitive still exports the components it did before the correction', () => {
    expect(colSrc.includes('export const ClassicalPediment')).toBe(true);
    expect(colSrc.includes('export const ClassicalColumn')).toBe(true);
    expect(colSrc.includes('export const RomanGabledRoof')).toBe(true);
  });
});
