/**
 * Phase C-8.21 — street-prop ↔ building clearance (cypress row, merchant handcart).
 *
 * The C-8.20 city-wide audit left three street props interpenetrating buildings.
 * This phase moves exactly two things, and this suite verifies the moves and the
 * geometry behind them:
 *
 *   1. The mid-row Italian cypresses at [±11.5, 0, 10] stood on the north side of
 *      the Caravanserai Inn [16, 0, 14] and of the City Tavern [-16, 0, 14]: at
 *      the Inn (whose tree is west of its axis) the planter (0.8925 ground radius)
 *      cut 0.94 into the plinth and the widest crown band (r 0.9841) cut 0.96 into
 *      the north-west quoin corner; at the Tavern (tree east of its axis) the crown
 *      cut 0.77 into the north-east quoin corner and the planter 0.74 into the
 *      plinth. Both trees move 1.45 north along Z (10 → 8.55) with X, scale and
 *      seed untouched, which leaves the Inn's tightest pair at +0.49 and the
 *      Tavern's at +0.68.
 *   2. The merchant handcart at [18, 0, -2] (yaw 45°) sat inside the General
 *      Store's plinth, quoins, wall, counter and goods stack (worst 0.59) and the
 *      Smithing Forge's wall (0.36). It is re-parked at [10.8, 0, -1.7] on the Via
 *      Decumanus carriageway, rotation and cargo unchanged.
 *
 * Every number below is derived from the components' own sources and the shared
 * primitives' documented formulas — the cypress crown is rebuilt from the lathe
 * profile, its per-band multipliers and its deterministic per-vertex radial
 * displacement, so each crown band carries a real radius rather than the whole
 * tree's bounding box; the handcart is modelled part by part (axle, wheels, bed,
 * slats, rest prop, cargo) rather than as one padded envelope.  Each building
 * contributes both north-side quoin corner stacks and both rafter planes, because the
 * Inn's tree approaches from the west and the Tavern's from the east; a piece the
 * tree's X band never reaches is dropped rather than counted as clearance.  No
 * building root, collider, arrival or street route is touched by this phase.
 *
 * Run with: bun test src/utils/phaseC8_21.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PLAYER_RADIUS, CITY_COLLIDERS, type RectCollider } from './collisionShapes';
import { FAST_TRAVEL_ARRIVALS } from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const processionSrc = load('../components/3d/city/ProcessionAvenue.tsx');
const foliageSrc = load('../components/3d/city/MediterraneanFoliage.tsx');
const streetsSrc = load('../components/3d/city/CityStreets.tsx');
const civicSrc = load('../components/3d/city/CivicFurnishingProps.tsx');
const storeSrc = load('../components/3d/city/GeneralStore.tsx');
const forgeSrc = load('../components/3d/city/SmithingForge.tsx');
const innSrc = load('../components/3d/city/CaravanseraiInn.tsx');
const tavernSrc = load('../components/3d/city/CityTavern.tsx');
const archSrc = load('../components/3d/city/ClassicalArchitecture.tsx');

// ── Tiny parsers (same style as phaseC8_18 / phaseC8_19 / phaseC8_19b) ────

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
function nums(src: string, re: RegExp): number[] {
  const m = re.exec(src);
  if (!m) throw new Error(`numbers not found: ${re}`);
  return m[1].split(',').map((v) => Number(v.trim()));
}
function all(src: string, re: RegExp): RegExpExecArray[] {
  return [...src.matchAll(re)];
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
// A. The two moved props, as the sources declare them
// ══════════════════════════════════════════════════════════════════════════

/** Procession avenue cypress row: X pair, Z row, scale, seed formula. */
const CYPRESS_X = pair(processionSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(px, pi\)/);
const CYPRESS_Z = triple(processionSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(pz, zi\)/);
const CYPRESS_SCALE = num(processionSrc, /scale=\{([\d.]+)\} seed=\{pi \* 3 \+ zi \+ 1\}/);

/** Seed formula `pi * 3 + zi + 1` → the two mid-row trees are seeds 2 and 5. */
const cypressSeed = (pi: number, zi: number) => pi * 3 + zi + 1;
const SEED_TAVERN_SIDE = cypressSeed(0, 1); // 2, x = −11.5
const SEED_INN_SIDE = cypressSeed(1, 1); // 5, x = +11.5

/** MerchantCart placement in the street layout (yaw written as `Math.PI / 4`). */
const CART_POS = triple(
  streetsSrc,
  /<MerchantCart position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotationY=\{Math\.PI \/ \d+\} \/>/,
);
const CART_YAW = Math.PI / num(streetsSrc, /<MerchantCart position=\{\[[^\]]+\]\} rotationY=\{Math\.PI \/ (\d+)\} \/>/);

describe('A. The sources declare the planned transforms', () => {
  test('the cypress row keeps ±11.5, scale 1.05 and its three Z stations', () => {
    expect(CYPRESS_X).toEqual([-11.5, 11.5]);
    // Phase 29.4A's -7.5 and 20 are untouched; the mid row is the corrected 8.55.
    expect(CYPRESS_Z).toEqual([-7.5, 8.55, 20]);
    expect(CYPRESS_SCALE).toBe(1.05);
    expect(processionSrc).not.toContain('[-7.5, 10, 20]');
  });

  test('both cypresses move the same 1.45 north — the avenue stays symmetric', () => {
    // One array drives both sides, so a single Z station cannot be asymmetric.
    expect(CYPRESS_X[1]).toBe(-CYPRESS_X[0]);
    expect(CYPRESS_Z[1] - 10).toBeCloseTo(-1.45, 10);
    expect(processionSrc).toContain('<ItalianCypress key={`cypress-${pi}-${zi}`} position={[px, 0, pz]} scale={1.05} seed={pi * 3 + zi + 1} />');
  });

  test('the handcart is re-parked on the Via Decumanus at its recorded yaw', () => {
    expect(CART_POS).toEqual([10.8, 0, -1.7]);
    expect(CART_YAW).toBeCloseTo(Math.PI / 4, 10);
    expect(streetsSrc).not.toContain('<MerchantCart position={[18, 0, -2]}');
    // The cart's own parts and cargo are untouched by the phase.
    for (const snippet of [
      '<boxGeometry args={[1.7, 0.1, 0.1]} />', // axle
      '<boxGeometry args={[1.4, 0.1, 1.8]} />', // bed
      '<RomanAmphora position={[-0.3, 0.58, 0.2]} scale={0.7} tone="terracotta" />',
      '<TimberCrate position={[0.25, 0.58, -0.1]} size={[0.55, 0.45, 0.55]} />',
    ]) {
      expect(civicSrc).toContain(snippet);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The cypress model is built from the foliage component's own formulas
// ══════════════════════════════════════════════════════════════════════════

/** Lathe profile radii (normalised height → radius). */
const CROWN_PROFILE = nums(foliageSrc, /const CYPRESS_PROFILE: readonly number\[\] = \[([\s\S]*?)\];/);

/** Planter / cap / trunk: [mesh y, radiusTop, radiusBottom, height, segments]. */
const CYLINDERS = all(
  foliageSrc,
  /position=\{\[0, ([\d.]+), 0\]\}>\s*<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*(\d+)\s*\]\} \/>/g,
).map((m) => m.slice(1).map(Number));
const PLANTER = CYLINDERS[0];
const CAP = CYLINDERS[1];
const TRUNK = CYLINDERS[2];

/** Crown mesh y offset, crown height factor, radial segments, displacement. */
const CROWN_Y = num(foliageSrc, /<mesh castShadow geometry=\{foliageGeo\} position=\{\[0, ([\d.]+), 0\]\}>/);
const CROWN_HEIGHT_FACTOR = num(foliageSrc, /const foliageHeight = ([\d.]+) \* h;/);
const [CROWN_SEGMENTS, CROWN_DISPLACEMENT] = pair(
  foliageSrc,
  /buildFoliageGeometry\(profile, foliageHeight, w, (\d+), seed, ([\d.]+)\);/,
);

/** Per-tree variation formulas (band multipliers 0.92–1.08, tilt ±0.025 rad). */
const HEIGHT_MUL = pair(foliageSrc, /heightMul: ([\d.]+) \+ \(v1 - Math\.floor\(v1\)\) \* ([\d.]+)/);
const WIDTH_MUL = pair(foliageSrc, /widthMul: ([\d.]+) \+ \(v2 - Math\.floor\(v2\)\) \* ([\d.]+)/);
const TILT_RANGE = pair(foliageSrc, /tilt: \(\(v3 - Math\.floor\(v3\)\) - ([\d.]+)\) \* ([\d.]+)/);
const BAND_MUL = pair(foliageSrc, /bandMuls: \[\s*([\d.]+) \+ \(r1 - Math\.floor\(r1\)\) \* ([\d.]+)/);
const VAR_KEYS = [
  num(foliageSrc, /const v1 = Math\.sin\(seed \* ([\d.]+)\) \* [\d.]+;/),
  num(foliageSrc, /const v2 = Math\.sin\(seed \* ([\d.]+)\) \* [\d.]+;/),
  num(foliageSrc, /const v3 = Math\.sin\(seed \* ([\d.]+)\) \* [\d.]+;/),
];
const HASH = num(foliageSrc, /const v1 = Math\.sin\(seed \* [\d.]+\) \* ([\d.]+);/);
/** The four per-height-band keys: `const r1 = Math.sin(seed * 53.121 + 1.7) …`. */
const BAND_KEYS = all(foliageSrc, /const r\d = Math\.sin\(seed \* ([\d.]+) \+ ([\d.]+)\)/g).map((m) => ({
  k: Number(m[1]),
  c: Number(m[2]),
}));

const frac = (v: number) => v - Math.floor(v);
const hash1 = (seed: number, key: number, c = 0) => frac(Math.sin(seed * key + c) * HASH);
/** Deterministic per-vertex radial displacement (buildFoliageGeometry). */
const displaced = (seed: number, vertexIndex: number) =>
  1 + (frac(Math.sin(seed * 12.9898 + vertexIndex * 78.233) * 43758.5453) - 0.5) * 2 * CROWN_DISPLACEMENT;

interface Band {
  n: string;
  /** world Y band */
  y: [number, number];
  /** maximum horizontal radius of this band, world scale */
  R: number;
}

/**
 * The Italian cypress as stacked solids, world scale.
 *
 * The crown is a lathe over CROWN_PROFILE with CROWN_SEGMENTS radial faces.  A
 * profile ring's +Z extreme is its azimuth-0 vertex (`z = r · cos 0`), and the
 * lathe's seam duplicates that azimuth as the final ring, so a ring's radius is
 * its profile radius times the larger of the two displacement factors.  The
 * surface between two rings is a frustum no wider than the larger of them, so a
 * band's bounding radius is exact rather than the whole tree's AABB.
 */
function cypressBands(seed: number, scale = CYPRESS_SCALE): Band[] {
  const h = HEIGHT_MUL[0] + hash1(seed, VAR_KEYS[0]) * HEIGHT_MUL[1];
  const w = WIDTH_MUL[0] + hash1(seed, VAR_KEYS[1]) * WIDTH_MUL[1];
  const bandMuls = BAND_KEYS.map((b) => BAND_MUL[0] + hash1(seed, b.k, b.c) * BAND_MUL[1]);

  // Band multipliers interpolate smoothly over the profile, then the profile is
  // forced monotonically tapering (the source's own clamp loop).
  const profile = CROWN_PROFILE.map((baseR, i) => {
    const t = i / (CROWN_PROFILE.length - 1);
    let m: number;
    if (t < 0.25) m = bandMuls[0] + (bandMuls[1] - bandMuls[0]) * (t / 0.25);
    else if (t < 0.5) m = bandMuls[1] + (bandMuls[2] - bandMuls[1]) * ((t - 0.25) / 0.25);
    else if (t < 0.75) m = bandMuls[2] + (bandMuls[3] - bandMuls[2]) * ((t - 0.5) / 0.25);
    else m = bandMuls[3];
    return baseR * m;
  });
  let maxR = 0;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] > maxR) maxR = profile[i];
    else profile[i] = Math.min(profile[i], maxR);
  }

  const n = profile.length;
  const rings = profile.map((pr, j) => {
    const seam = CROWN_SEGMENTS * n + j; // the lathe's duplicated azimuth-0 ring
    const r = Math.max(0.02, pr * w) * Math.max(displaced(seed, j), displaced(seed, seam)) * scale;
    const y = (CROWN_Y + (j / (n - 1)) * CROWN_HEIGHT_FACTOR * h) * scale;
    return { y, r };
  });

  const bands: Band[] = [
    { n: 'planter', y: [0, PLANTER[3] * scale], R: PLANTER[2] * scale },
    { n: 'planter.cap', y: [(CAP[0] - CAP[3] / 2) * scale, (CAP[0] + CAP[3] / 2) * scale], R: CAP[2] * scale },
    { n: 'trunk', y: [(TRUNK[0] - TRUNK[3] / 2) * scale, (TRUNK[0] + TRUNK[3] / 2) * scale], R: TRUNK[2] * scale },
  ];
  for (let j = 0; j < rings.length - 1; j++) {
    bands.push({ n: `crown[${j}]`, y: [rings[j].y, rings[j + 1].y], R: Math.max(rings[j].r, rings[j + 1].r) });
  }
  return bands;
}

/**
 * Conservative allowance for the group's ±TILT_RANGE Z-tilt: it shifts the crown
 * axis in X by up to `topY · sin(tilt)` ≈ 0.2, so the crown is treated as if it
 * could reach 0.2 further toward a building's X band than its axis says.
 */
const TILT_ALLOWANCE = 0.2;

interface Piece {
  n: string;
  x: [number, number];
  y: [number, number];
  z: [number, number];
}

/**
 * Clearance between a cypress band and a building piece, measured along −Z (the
 * direction the tree approaches a building's north face).  Negative means the
 * band reaches into the piece; `null` means the two never share a height, or the
 * band's reach misses the piece's X band, i.e. they are separated in X.
 */
function cypressClearance(px: number, pz: number, b: Band, p: Piece): number | null {
  if (Math.min(b.y[1], p.y[1]) - Math.max(b.y[0], p.y[0]) <= 0) return null;
  const dx = px >= p.x[0] && px <= p.x[1] ? 0 : Math.min(Math.abs(px - p.x[0]), Math.abs(px - p.x[1]));
  const reach = Math.max(0, dx - TILT_ALLOWANCE);
  if (reach >= b.R) return null;
  return p.z[0] - (pz + Math.sqrt(b.R * b.R - reach * reach));
}

function cypressReport(px: number, pz: number, seed: number, pieces: Piece[]) {
  const rows: Array<{ pair: string; clearance: number }> = [];
  for (const b of cypressBands(seed)) {
    for (const p of pieces) {
      const c = cypressClearance(px, pz, b, p);
      if (c !== null) rows.push({ pair: `${b.n} ↔ ${p.n}`, clearance: c });
    }
  }
  rows.sort((a, b) => a.clearance - b.clearance);
  return rows;
}

// ── Building pieces, from the shared primitives' documented formulas ──────

const QUOIN_QX = pair(archSrc, /const qx = isLong \? ([\d.]+) : ([\d.]+);/);
const QUOIN_QZ = pair(archSrc, /const qz = isLong \? ([\d.]+) : ([\d.]+);/);
const TILE_THICKNESS = num(archSrc, /const tileThickness = ([\d.]+);/);

interface RoofSpec {
  width: number;
  depth: number;
  height: number;
  overhang: number;
  pos: [number, number, number];
}
interface BuildingSpec {
  root: [number, number, number];
  foundation: [number, number];
  projection: number;
  wall: { y: number; args: [number, number, number] };
  cornices: Array<{ size: [number, number]; y: number; height: number; projection: number }>;
  quoin: { buildingSize: [number, number]; height: number };
  roof: RoofSpec;
}

function specOf(src: string): BuildingSpec {
  return {
    root: triple(src, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED TRAVERTINE/),
    foundation: pair(src, /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/),
    projection: num(src, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/),
    wall: {
      y: num(src, /<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>/),
      args: triple(
        src,
        /<mesh castShadow receiveShadow position=\{\[\s*0,\s*[\d.]+,\s*0\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
      ),
    },
    cornices: all(
      src,
      /<WallCornice\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}\s+y=\{([\d.]+)\}[\s\S]*?height=\{([\d.]+)\}[\s\S]*?projection=\{([\d.]+)\}/g,
    ).map((m) => ({
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

/** Every rendered box of a building, in world AABB space (all building yaws are 0). */
function buildingPieces(spec: BuildingSpec): Piece[] {
  const [rx, , rz] = spec.root;
  const [fw, fd] = spec.foundation;
  const proj = spec.projection;
  const [ww, wh, wd] = spec.wall.args;
  const out: Piece[] = [];

  const lowerH = 0.3 * 0.45;
  out.push({
    n: 'plinth.lower',
    x: [rx - fw / 2 - proj, rx + fw / 2 + proj],
    y: [0, lowerH],
    z: [rz - fd / 2 - proj, rz + fd / 2 + proj],
  });
  out.push({
    n: 'plinth.upper',
    x: [rx - fw / 2 - proj * 0.6, rx + fw / 2 + proj * 0.6],
    y: [lowerH, 0.3],
    z: [rz - fd / 2 - proj * 0.6, rz + fd / 2 + proj * 0.6],
  });
  out.push({
    n: 'wall',
    x: [rx - ww / 2, rx + ww / 2],
    y: [spec.wall.y - wh / 2, spec.wall.y + wh / 2],
    z: [rz - wd / 2, rz + wd / 2],
  });

  // CornerQuoins: both corners of the north face (the side the avenue approaches,
  // −Z), each block stack taken as its widest cross-section max(qx, qz), as in the
  // primitive.  A tree west of the building axis faces the north-west stack and one
  // east of it the north-east stack — the Inn's tree is west, the Tavern's is east
  // — so both are modelled and cypressClearance() skips the one it never reaches.
  const qHalf = Math.max(...QUOIN_QX, ...QUOIN_QZ) / 2;
  const quoinZ: [number, number] = [
    rz - spec.quoin.buildingSize[1] / 2 - qHalf,
    rz - spec.quoin.buildingSize[1] / 2 + qHalf,
  ];
  const quoinXs: Array<[string, number]> = [
    ['quoins.west', rx - spec.quoin.buildingSize[0] / 2],
    ['quoins.east', rx + spec.quoin.buildingSize[0] / 2],
  ];
  for (const [n, qcx] of quoinXs) {
    out.push({ n, x: [qcx - qHalf, qcx + qHalf], y: [0, spec.quoin.height], z: quoinZ });
  }

  // WallCornice: four strips, each `projection` deep beyond the wall face.
  for (const c of spec.cornices) {
    const [cw, cd] = c.size;
    const p = c.projection;
    const yb: [number, number] = [c.y - c.height / 2, c.y + c.height / 2];
    out.push({ n: `cornice.y${c.y}.front`, x: [rx - cw / 2 - p, rx + cw / 2 + p], y: yb, z: [rz + cd / 2, rz + cd / 2 + p] });
    out.push({ n: `cornice.y${c.y}.rear`, x: [rx - cw / 2 - p, rx + cw / 2 + p], y: yb, z: [rz - cd / 2 - p, rz - cd / 2] });
    out.push({ n: `cornice.y${c.y}.left`, x: [rx - cw / 2 - p, rx - cw / 2], y: yb, z: [rz - cd / 2, rz + cd / 2] });
    out.push({ n: `cornice.y${c.y}.right`, x: [rx + cw / 2, rx + cw / 2 + p], y: yb, z: [rz - cd / 2, rz + cd / 2] });
  }

  // RomanGabledRoof, ridgeAlong "z": every rotation is about Z, so each piece's
  // Z extent is exactly its own box Z dimension (X/Y use the rotated half-widths)
  // — the reported Z clearances are exact rather than AABB bounds.
  const r = spec.roof;
  const halfSpan = r.width / 2 + r.overhang;
  const fullLength = r.depth + r.overhang * 2;
  const slope = Math.atan2(r.height, halfSpan);
  const rafter = Math.hypot(halfSpan, r.height);
  const baseY = r.pos[1];
  out.push({
    n: 'roof.fascia',
    x: [rx - (r.width + r.overhang * 1.2) / 2, rx + (r.width + r.overhang * 1.2) / 2],
    y: [baseY - 0.16, baseY],
    z: [rz - (r.depth + r.overhang * 1.2) / 2, rz + (r.depth + r.overhang * 1.2) / 2],
  });
  const slabAlong = (rafter / 2) * Math.cos(slope) + (TILE_THICKNESS / 2) * Math.sin(slope);
  const slabAcross = (rafter / 2) * Math.sin(slope) + (TILE_THICKNESS / 2) * Math.cos(slope);
  const tileY = baseY + r.height / 2 + 0.04;
  // The two rafter planes are separate boxes with no tile above the ridge, so each
  // carries its own X band: the west plane over the west eave (the one the Inn's
  // tree sees) and the east plane over the east eave (the Tavern's tree).
  const tileYBand: [number, number] = [tileY - slabAcross, tileY + slabAcross];
  const tileZ: [number, number] = [rz - fullLength / 2, rz + fullLength / 2];
  const tileXs: Array<[string, number]> = [
    ['roof.tile.west', rx - halfSpan / 2],
    ['roof.tile.east', rx + halfSpan / 2],
  ];
  for (const [n, tx] of tileXs) {
    out.push({ n, x: [tx - slabAlong, tx + slabAlong], y: tileYBand, z: tileZ });
  }
  out.push({
    n: 'roof.ridge',
    x: [rx - 0.16, rx + 0.16],
    y: [baseY + r.height + 0.02, baseY + r.height + TILE_THICKNESS + 0.11],
    z: [rz - fullLength / 2 - 0.04, rz + fullLength / 2 + 0.04],
  });
  out.push({
    n: 'roof.tympanum',
    x: [rx - r.width / 2, rx + r.width / 2],
    y: [baseY, baseY + r.height],
    z: [rz - r.depth / 2 - 0.02, rz - r.depth / 2 + 0.02],
  });
  return out;
}

/** General Store street furniture the cart shares a height with. */
function storeExtras(): Piece[] {
  const out: Piece[] = [];
  // Counter group [-3.6, 0, 0] holding a 1.2 × 1.3 × 4.2 timber table at y 0.65.
  const counterGroup = groupAfter(storeSrc, 'MERCHANT DISPLAY COUNTERS');
  const counterPos = triple(storeSrc, /MERCHANT DISPLAY COUNTERS[\s\S]*?<mesh castShadow receiveShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
  const counterSize = triple(storeSrc, /MERCHANT DISPLAY COUNTERS[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>/);
  out.push({
    n: 'counter',
    x: [22 + counterGroup[0] + counterPos[0] - counterSize[0] / 2, 22 + counterGroup[0] + counterPos[0] + counterSize[0] / 2],
    y: [counterPos[1] - counterSize[1] / 2, counterPos[1] + counterSize[1] / 2],
    z: [-5 + counterGroup[2] + counterPos[2] - counterSize[2] / 2, -5 + counterGroup[2] + counterPos[2] + counterSize[2] / 2],
  });

  // Storefront shipping goods: the goods group inside the counter group, holding
  // two timber crates and one upright wine barrel.
  const goods = groupAfter(storeSrc, 'Storefront shipping goods stack');
  const gx = 22 + counterGroup[0] + goods[0];
  const gz = -5 + counterGroup[2] + goods[2];
  for (const m of all(storeSrc, /<TimberCrate position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} size=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}(?: rotationY=\{(-?[\d.]+)\})? \/>/g)) {
    const [, px, py, pz, sx, sy, sz, ry] = m.map(Number);
    const yaw = Number.isNaN(ry) ? 0 : ry;
    // A yawed box's AABB half-width is |h·cos| + |h·sin| on both X and Z.
    const hx = sx / 2;
    const hz = sz / 2;
    const ex = Math.abs(hx * Math.cos(yaw)) + Math.abs(hz * Math.sin(yaw));
    const ez = Math.abs(hx * Math.sin(yaw)) + Math.abs(hz * Math.cos(yaw));
    out.push({ n: `goods.crate${m.index}`, x: [gx + px - ex, gx + px + ex], y: [py, py + sy], z: [gz + pz - ez, gz + pz + ez] });
  }
  const barrel = triple(storeSrc, /<WineBarrel position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotationY=\{([-\d.]+)\} \/>/);
  const barrelYaw = num(storeSrc, /<WineBarrel position=\{\[[^\]]+\]\} rotationY=\{([-\d.]+)\} \/>/);
  // WineBarrel: 0.38 max radius, 0.9 tall, upright yOffset 0.45.
  const bh = 0.38;
  const bex = Math.abs(bh * Math.cos(barrelYaw)) + Math.abs(bh * Math.sin(barrelYaw));
  out.push({
    n: 'goods.barrel',
    x: [gx + barrel[0] - bex, gx + barrel[0] + bex],
    y: [barrel[1], barrel[1] + 0.9],
    z: [gz + barrel[2] - bex, gz + barrel[2] + bex],
  });

  // Timber support posts [-4.0, 1.4, ±2.4] (tapered cylinder, max radius 0.14).
  for (const [i, pz] of [-2.4, 2.4].entries()) {
    out.push({ n: `post${i}`, x: [22 - 4.0 - 0.14, 22 - 4.0 + 0.14], y: [0, 2.8], z: [-5 + pz - 0.14, -5 + pz + 0.14] });
  }
  // Striped canvas awning [-2.8, 2.6, 0], 2.8 × 0.08 × 5.2, tilted 0.2 rad about Z.
  const awning = groupAfter(storeSrc, 'STRIPED ROMAN CRIMSON');
  const awX = Math.abs(1.4 * Math.cos(0.2)) + Math.abs(0.04 * Math.sin(0.2));
  const awY = Math.abs(1.4 * Math.sin(0.2)) + Math.abs(0.04 * Math.cos(0.2));
  out.push({
    n: 'awning',
    x: [22 + awning[0] - awX, 22 + awning[0] + awX],
    y: [awning[1] - awY, awning[1] + awY],
    z: [-5 + awning[2] - 2.6, -5 + awning[2] + 2.6],
  });
  return out;
}

const INN_PIECES = buildingPieces(specOf(innSrc));
const TAVERN_PIECES = buildingPieces(specOf(tavernSrc));
const STORE_PIECES = [...buildingPieces(specOf(storeSrc)), ...storeExtras()];
const FORGE_PIECES = buildingPieces(specOf(forgeSrc));

const at = (rows: Array<{ pair: string; clearance: number }>, pairName: string) => {
  const row = rows.find((r) => r.pair === pairName);
  if (!row) throw new Error(`pair not evaluated: ${pairName}`);
  return row.clearance;
};

// ══════════════════════════════════════════════════════════════════════════
// B/C/D. The cypresses
// ══════════════════════════════════════════════════════════════════════════

describe('B. The cypress model reproduces the foliage component', () => {
  test('planter and crown radii follow the primitive at scale 1.05', () => {
    expect(PLANTER[2]).toBe(0.85);
    expect(PLANTER[2] * CYPRESS_SCALE).toBeCloseTo(0.8925, 10);
    expect(CROWN_PROFILE[4]).toBe(0.94);
    expect(CROWN_SEGMENTS).toBe(8);
    expect(CROWN_DISPLACEMENT).toBe(0.07);
    const bands = cypressBands(SEED_INN_SIDE);
    const planter = bands.find((b) => b.n === 'planter')!;
    expect(planter.R).toBeCloseTo(0.8925, 10);
    expect(planter.y[1]).toBeCloseTo(0.525, 10);
    // The crown can never exceed the widest profile radius, even at maximum
    // displacement and scale, and it is a real (non-AABB) radius per band.
    const crownMax = Math.max(...bands.filter((b) => b.n.startsWith('crown')).map((b) => b.R));
    expect(crownMax).toBeLessThanOrEqual(0.94 * (WIDTH_MUL[0] + WIDTH_MUL[1]) * (1 + CROWN_DISPLACEMENT) * CYPRESS_SCALE);
    expect(crownMax).toBeGreaterThan(0.8);
    expect(bands.filter((b) => b.n.startsWith('crown')).length).toBe(CROWN_PROFILE.length - 1);
  });

  test('the source keeps the formulas the model re-derives', () => {
    expect(foliageSrc).toContain('else profile[i] = Math.min(profile[i], maxR);');
    expect(foliageSrc).toContain('return baseR * bandMul;');
    expect(TILT_RANGE[1]).toBe(0.05);
    expect(BAND_KEYS.length).toBe(4);
  });

  test('the two mid-row trees are the seeds the row formula assigns', () => {
    expect(SEED_TAVERN_SIDE).toBe(2);
    expect(SEED_INN_SIDE).toBe(5);
    expect(processionSrc).toContain('seed={pi * 3 + zi + 1}');
  });
});

describe('C. The audited cypress intersections are reproduced at z = 10', () => {
  test('the Inn-side tree cuts its north-west quoin corner and its plinth', () => {
    const rows = cypressReport(CYPRESS_X[1], 10, SEED_INN_SIDE, INN_PIECES);
    // Tightest is the widest crown band (r 0.9841) reaching the quoin block face at
    // z 10.025 = 14 − 7.6/2 − 0.175: 10.025 − (10 + 0.9841).  Next comes the planter
    // against the plinth face at z 9.95 = 14 − 7.6/2 − 0.25: 9.95 − (10 + 0.8925).
    expect(rows[0].pair).toBe('crown[3] ↔ quoins.west');
    expect(rows[0].clearance).toBeCloseTo(-0.9591, 4);
    expect(at(rows, 'planter ↔ plinth.lower')).toBeCloseTo(-0.9425, 4);
    expect(at(rows, 'crown[2] ↔ quoins.west')).toBeCloseTo(-0.9385, 4);
    expect(at(rows, 'crown[8] ↔ roof.tile.west')).toBeLessThan(-0.7);
    expect(rows.filter((r) => r.clearance < 0).length).toBeGreaterThanOrEqual(10);
  });

  test('the Tavern-side tree cuts its north-east quoin corner, plinth and east rafter plane', () => {
    // The Tavern's tree stands east of the building axis (x −11.5 vs −16), so the
    // corner and rafter plane it meets are the east ones.
    const rows = cypressReport(CYPRESS_X[0], 10, SEED_TAVERN_SIDE, TAVERN_PIECES);
    expect(rows[0].pair).toBe('crown[3] ↔ quoins.east');
    expect(rows[0].clearance).toBeCloseTo(-0.7703, 4); // 10.225 − (10 + 0.9953)
    expect(at(rows, 'planter ↔ plinth.lower')).toBeCloseTo(-0.7425, 4); // 10.15 − (10 + 0.8925)
    expect(at(rows, 'crown[9] ↔ roof.tile.east')).toBeCloseTo(-0.3939, 4); // 10 − (10 + 0.3939)
    expect(rows.filter((r) => r.clearance < 0).length).toBeGreaterThanOrEqual(8);
  });
});

describe('D. Both cypresses clear their building and the avenue benches after the move', () => {
  test('the Inn-side tree clears every piece it shares a height with', () => {
    const rows = cypressReport(CYPRESS_X[1], CYPRESS_Z[1], SEED_INN_SIDE, INN_PIECES);
    expect(rows.filter((r) => r.clearance <= 0)).toEqual([]);
    // Tightest is the widest crown band against the north-west quoin corner, at
    // 0.49: 10.025 − (8.55 + 0.9841).  The planter beside the plinth is next, at
    // 0.51: 9.95 − (8.55 + 0.8925).
    expect(rows[0].pair).toBe('crown[3] ↔ quoins.west');
    expect(rows[0].clearance).toBeCloseTo(0.4909, 4);
    expect(at(rows, 'planter ↔ plinth.lower')).toBeCloseTo(0.5075, 4);
    expect(at(rows, 'crown[2] ↔ quoins.west')).toBeCloseTo(0.5115, 4);
    expect(at(rows, 'crown[8] ↔ roof.tile.west')).toBeGreaterThan(0.6);
  });

  test('the Tavern-side tree clears its north-east quoin corner with 0.68 to spare', () => {
    const rows = cypressReport(CYPRESS_X[0], CYPRESS_Z[1], SEED_TAVERN_SIDE, TAVERN_PIECES);
    expect(rows.filter((r) => r.clearance <= 0)).toEqual([]);
    expect(rows[0].pair).toBe('crown[3] ↔ quoins.east');
    expect(rows[0].clearance).toBeCloseTo(0.6797, 4); // 10.225 − (8.55 + 0.9953)
    expect(at(rows, 'planter ↔ plinth.lower')).toBeCloseTo(0.7075, 4); // 10.15 − (8.55 + 0.8925)
    expect(at(rows, 'crown[9] ↔ roof.tile.east')).toBeCloseTo(1.0561, 4); // 10 − (8.55 + 0.3939)
    expect(at(rows, 'crown[9] ↔ cornice.y6.35.rear')).toBeCloseTo(1.3161, 4);
  });

  test('the move is exactly the Z displacement — X, scale and seed are untouched', () => {
    const before = cypressReport(CYPRESS_X[1], 10, SEED_INN_SIDE, INN_PIECES);
    const after = cypressReport(CYPRESS_X[1], CYPRESS_Z[1], SEED_INN_SIDE, INN_PIECES);
    expect(before.map((r) => r.pair)).toEqual(after.map((r) => r.pair)); // same pairs evaluated
    for (const a of after) {
      const b = before.find((r) => r.pair === a.pair)!;
      expect(a.clearance - b.clearance).toBeCloseTo(1.45, 6);
    }
  });

  test('the avenue bench at [±13, 0, 11.2] no longer overlaps the planters', () => {
    // RomanBench seat slab 2.0 × 0.65 yawed ∓π/4 → AABB half 0.9369 on both axes.
    const benchHalf = 1.0 * Math.cos(Math.PI / 4) + 0.325 * Math.sin(Math.PI / 4);
    expect(benchHalf).toBeCloseTo(0.9369, 4);
    const planterR = 0.85 * CYPRESS_SCALE;
    for (const px of [CYPRESS_X[1], CYPRESS_X[0]]) {
      const benchCx = px > 0 ? 13.0 : -13.0;
      // The X bands still overlap, so separation must come from Z.
      expect(Math.abs(px - benchCx) - (planterR + benchHalf)).toBeCloseTo(-0.329, 3);
      expect(11.2 - benchHalf - (10 + planterR)).toBeLessThan(0); // old Z intersected
      expect(11.2 - benchHalf - (CYPRESS_Z[1] + planterR)).toBeGreaterThan(0.8); // new Z does not
    }
  });

  test('the smallest safe Z for a 0.20 margin is documented, and 8.55 is north of it', () => {
    // Moving north by Δ raises every shared-height clearance by exactly Δ, so the
    // largest Z that still reaches a 0.20 margin is 10 − (0.20 + worst penetration),
    // where each side's worst pair is its quoin corner (see sections C/D).
    expect(10 - (0.2 + 0.9591)).toBeCloseTo(8.8409, 4); // Inn: crown[3] ↔ quoins.west
    expect(10 - (0.2 + 0.7703)).toBeCloseTo(9.0297, 4); // Tavern: crown[3] ↔ quoins.east
    // The shipped 8.55 lies north of both, i.e. strictly safer than the margin.
    expect(CYPRESS_Z[1]).toBeLessThan(8.8409);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The handcart: a part-by-part rotated model against the buildings + props
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

const rotY = (a: number) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
};
const rotZ = (a: number) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
};
const matMul = (A: number[][], B: number[][]) => {
  const o = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j];
      o[i][j] = s;
    }
  }
  return o;
};
const column = (M: number[][], i: number): Vec => ({ x: M[0][i], y: M[1][i], z: M[2][i] });

/** A box placed at `lp` inside a group rooted at (x, z) and yawed about Y. */
function obb(
  rootX: number,
  rootZ: number,
  yaw: number,
  n: string,
  lp: [number, number, number],
  size: [number, number, number],
  zTilt = 0,
): Obb {
  const R = matMul(rotY(yaw), rotZ(zTilt));
  return {
    n,
    c: {
      x: rootX + R[0][0] * lp[0] + R[0][2] * lp[2],
      y: lp[1],
      z: rootZ + R[2][0] * lp[0] + R[2][2] * lp[2],
    },
    ax: [column(R, 0), column(R, 1), column(R, 2)],
    h: [size[0] / 2, size[1] / 2, size[2] / 2],
  };
}

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Separating-axis test: ≥ 0 = gap (a lower bound), < 0 = penetration depth. */
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
 * World half-extent of an OBB's bounding box along a world axis — the local
 * half-extents projected onto it.  The cart is yawed 45°, so a part's world X or
 * Z reach is `(h_x + h_z) / √2`, not its local `h[0]` / `h[2]`.
 */
const halfAlong = (o: Obb, axis: 'x' | 'y' | 'z') =>
  Math.abs(o.h[0] * o.ax[0][axis]) + Math.abs(o.h[1] * o.ax[1][axis]) + Math.abs(o.h[2] * o.ax[2][axis]);

/** A building AABB as an OBB (its own axes are the world axes). */
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

// ── The cart's own parts (CivicFurnishingProps.MerchantCart) ─────────────

/** [local x, y, z, sizeX, sizeY, sizeZ] of the first box after a part comment. */
function cartBox(comment: string): number[] {
  const re = new RegExp(
    `${comment}[\\s\\S]*?position=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\}>[\\s\\S]*?<boxGeometry args=\\{\\[\\s*([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)\\s*\\]\\} \\/>`,
  );
  const m = re.exec(civicSrc);
  if (!m) throw new Error(`cart part not found: ${comment}`);
  return m.slice(1).map(Number);
}
const AXLE = cartBox('Central Axle');
const BED = cartBox('Wooden Cart Bed Frame');
const REST = cartBox('Front Rest Props');

const WHEEL_X = pair(civicSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(wx, wi\)/);
const WHEEL_Y = num(civicSrc, /<group key=\{`wheel-\$\{wi\}`\} position=\{\[wx, ([\d.]+), [\d.]+\]\}/);
/** Iron tyre (torus) outer radius and the axle hub's length, both along ±X. */
const TYRE = pair(civicSrc, /<torusGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*\d+,\s*\d+\s*\]\} \/>/);
const WHEEL_RIM = triple(civicSrc, /rotation=\{\[0, 0, Math\.PI \/ 2\]\}>[\s\S]{0,200}?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\} \/>/);
const HUB = triple(civicSrc, /<torusGeometry[\s\S]*?<mesh position=\{\[0, 0, 0\]\}>\s*<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\s*\]\} \/>/);
/** Side slats: `map((sx, si)` row with its own y/z and box size. */
const SLAT_X = pair(civicSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(sx, si\)/);
const SLAT_YZ = pair(civicSrc, /<mesh key=\{`slat-\$\{si\}`\} castShadow position=\{\[sx, ([\d.]+), ([\d.]+)\]\}>/);
const SLAT_SIZE = triple(civicSrc, /<mesh key=\{`slat-\$\{si\}`\}[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>/);
/** Cargo: the amphora (belly radius / full height) and the timber crate. */
const AMPHORA_BELLY = triple(civicSrc, /<sphereGeometry args=\{\[\s*([\d.]+),\s*\d+,\s*\d+\s*\]\} \/>/);
const AMPHORA_BASE = triple(civicSrc, /<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*10\s*\]\} \/>/);
const CART_AMPHORA = triple(civicSrc, /<RomanAmphora position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} scale=\{([\d.]+)\} tone="terracotta" \/>/);
const CART_AMPHORA_SCALE = num(civicSrc, /<RomanAmphora position=\{\[[^\]]+\]\} scale=\{([\d.]+)\} tone="terracotta" \/>/);
const CART_CRATE = triple(civicSrc, /<TimberCrate position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} size=\{\[[^\]]+\]\} \/>/);
const CART_CRATE_SIZE = triple(civicSrc, /<TimberCrate position=\{\[[^\]]+\]\} size=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>/);

/**
 * The handcart in world space: every part as its own rotated box, so the 45° yaw
 * applies to the real geometry rather than to one padded envelope.  The wheels
 * use the tyre's outer radius and the axle hub's length along ±X.
 */
function cartParts(position: [number, number, number]): Obb[] {
  const [px, , pz] = position;
  const yaw = CART_YAW;
  const wheelR = Math.max(WHEEL_RIM[0], TYRE[0] + TYRE[1]);
  const wheelHalf = Math.max(WHEEL_RIM[2] / 2, HUB[2] / 2);
  const parts: Obb[] = [
    obb(px, pz, yaw, 'axle', [AXLE[0], AXLE[1], AXLE[2]], [AXLE[3], AXLE[4], AXLE[5]]),
    obb(px, pz, yaw, 'bed', [BED[0], BED[1], BED[2]], [BED[3], BED[4], BED[5]]),
    obb(px, pz, yaw, 'restProp', [REST[0], REST[1], REST[2]], [REST[3], REST[4], REST[5]]),
  ];
  for (const [i, wx] of WHEEL_X.entries()) {
    parts.push(obb(px, pz, yaw, `wheel${i}`, [wx, WHEEL_Y, 0], [wheelHalf * 2, wheelR * 2, wheelR * 2]));
  }
  for (const [i, sx] of SLAT_X.entries()) {
    parts.push(obb(px, pz, yaw, `slat${i}`, [sx, SLAT_YZ[0], SLAT_YZ[1]], [SLAT_SIZE[0], SLAT_SIZE[1], SLAT_SIZE[2]]));
  }
  const aScale = CART_AMPHORA_SCALE;
  const aRadius = AMPHORA_BELLY[0] * aScale;
  const aHeight = (AMPHORA_BASE[1] + AMPHORA_BELLY[0]) * 2 * aScale;
  parts.push(
    obb(px, pz, yaw, 'cargoAmphora', [CART_AMPHORA[0], CART_AMPHORA[1] + aHeight / 2, CART_AMPHORA[2]], [
      aRadius * 2,
      aHeight,
      aRadius * 2,
    ]),
  );
  parts.push(
    obb(px, pz, yaw, 'cargoCrate', [CART_CRATE[0], CART_CRATE[1] + CART_CRATE_SIZE[1] / 2, CART_CRATE[2]], [
      CART_CRATE_SIZE[0],
      CART_CRATE_SIZE[1],
      CART_CRATE_SIZE[2],
    ]),
  );
  return parts;
}

// ── Street props around the handcart (CityStreets + the prop primitives) ──

/** Benches placed in CityStreets, with their yaw. */
const STREET_BENCHES = all(
  streetsSrc,
  /<RomanBench position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotationY=\{(-?)Math\.PI \/ (\d+)\} \/>/g,
).map((m) => ({
  pos: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
  yaw: (m[4] === '-' ? -1 : 1) * (Math.PI / Number(m[5])),
}));

function benchParts(b: { pos: [number, number, number]; yaw: number }): Obb[] {
  const [x, , z] = b.pos;
  const yaw = b.yaw;
  const parts: Obb[] = [obb(x, z, yaw, 'bench.seat', [0, 0.52, 0], [2.0, 0.1, 0.65])];
  for (const [i, lx] of [-0.8, 0.8].entries()) {
    parts.push(obb(x, z, yaw, `bench.foot${i}`, [lx, 0.08, 0], [0.34, 0.16, 0.58]));
    parts.push(obb(x, z, yaw, `bench.leg${i}`, [lx, 0.28, 0], [0.24, 0.26, 0.44]));
    parts.push(obb(x, z, yaw, `bench.capital${i}`, [lx, 0.44, 0], [0.3, 0.08, 0.52]));
  }
  return parts;
}

/** Cross-street curbs: `[14, 0.16, 0.4]` boxes at z = ±4.1, centred on x = ±11. */
const CURB_Z = pair(streetsSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(cz, ci\)/);
const CURB_SIZE = triple(streetsSrc, /<boxGeometry args=\{\[\s*14,\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>[\s\S]*?meshStandardMaterial color=\{ROMAN_PALETTE\.roadKerb/);
const CURBS: Obb[] = [
  ...CURB_Z.map((cz, i) => obb(-11, cz, 0, `curb.west${i}`, [0, 0.08, 0], [14, CURB_SIZE[0], CURB_SIZE[1]])),
  ...CURB_Z.map((cz, i) => obb(11, cz, 0, `curb.east${i}`, [0, 0.08, 0], [14, CURB_SIZE[0], CURB_SIZE[1]])),
];

/** Other street furniture near the cart: market cluster, crate, amphora, lamps. */
const MARKET_CLUSTER = groupAfter(streetsSrc, 'NORTHEAST: General Store Market Table');
const STORE_CRATE = triple(streetsSrc, /<TimberCrate position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} size=\{\[[^\]]+\]\} \/>/);
const STORE_CRATE_SIZE = triple(streetsSrc, /<TimberCrate position=\{\[[^\]]+\]\} size=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>/);
const STORE_AMPHORA = triple(streetsSrc, /<RomanAmphora position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} scale=\{([\d.]+)\} tone="sand" \/>/);
const STORE_AMPHORA_SCALE = num(streetsSrc, /<RomanAmphora position=\{\[[^\]]+\]\} scale=\{([\d.]+)\} tone="sand" \/>/);
const STREET_LAMPS = all(streetsSrc, /<StreetLamp position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} \/>/g).map(
  (m) => [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
);

const FURNITURE: Obb[] = [
  ...STREET_BENCHES.flatMap(benchParts),
  ...CURBS,
  // MerchantPropsCluster: three props inside a 1.1-wide cluster (envelope).
  obb(MARKET_CLUSTER[0], MARKET_CLUSTER[2], 0, 'marketCluster', [0, 0.45, 0], [1.1, 0.9, 1.1]),
  obb(STORE_CRATE[0], STORE_CRATE[2], 0, 'storeCrate', [0, STORE_CRATE_SIZE[1] / 2, 0], [
    STORE_CRATE_SIZE[0],
    STORE_CRATE_SIZE[1],
    STORE_CRATE_SIZE[2],
  ]),
  obb(STORE_AMPHORA[0], STORE_AMPHORA[2], 0, 'storeAmphora', [0, 0.52 * STORE_AMPHORA_SCALE, 0], [
    AMPHORA_BELLY[0] * 2 * STORE_AMPHORA_SCALE,
    1.03 * STORE_AMPHORA_SCALE,
    AMPHORA_BELLY[0] * 2 * STORE_AMPHORA_SCALE,
  ]),
  ...STREET_LAMPS.map((p, i) => obb(p[0], p[2], 0, `lamp${i}`, [0, 1.3, 0], [0.84, 2.6, 0.84])),
];

/** Worst clearance between the cart and a set of world OBBs. */
function worstClearance(parts: Obb[], others: Obb[]): { pair: string; clearance: number } {
  let worst = { pair: '', clearance: Infinity };
  for (const c of parts) {
    for (const o of others) {
      const v = sat(c, o);
      if (v < worst.clearance) worst = { pair: `${c.n} ↔ ${o.n}`, clearance: v };
    }
  }
  return worst;
}

// ── The Via Decumanus east carriageway + the two approach corridors ──────

/** `RomanPavedStreet` at [11, 0, 0], axis x, length 14, width 8 → X[4,18] Z[−4,4]. */
const STREET_RECT = { x: [4, 18], z: [-4, 4] } as const;
/** The forge portal faces west at X = 13.25, doorway width 3.4 about Z = 2.6. */
const FORGE_DOOR_ZONE = { x: [11.0, 13.5], z: [0.9, 4.3] } as const;
/** The store's west frontage corridor: plinth west face X = 18.15, counter Z span. */
const STORE_FRONT_ZONE = { x: [16.0, 18.15], z: [-7.1, -2.9] } as const;
const CART_OLD: [number, number, number] = [18, 0, -2];

describe('E. The handcart clears the General Store, the Forge and the street props', () => {
  test('at [18, 0, -2] the rotated cart sits inside the Store and the Forge', () => {
    const store = worstClearance(cartParts(CART_OLD), STORE_PIECES.map(asObb));
    const forge = worstClearance(cartParts(CART_OLD), FORGE_PIECES.map(asObb));
    expect(store.pair).toBe('wheel1 ↔ wall');
    expect(store.clearance).toBeCloseTo(-0.5758, 4);
    expect(forge.clearance).toBeCloseTo(-0.3592, 4);
    expect(forge.pair).toBe('slat0 ↔ wall');
    expect(worstClearance(cartParts(CART_OLD), [asObb(STORE_PIECES.find((p) => p.n === 'plinth.lower')!)])).toMatchObject({
      pair: 'wheel1 ↔ plinth.lower',
      clearance: -0.135,
    });
    // It was inside the Store's counter band, too — one of the audited elements.
    expect(sat(cartParts(CART_OLD).find((p) => p.n === 'slat1')!, asObb(STORE_PIECES.find((p) => p.n === 'counter')!))).toBeLessThan(0);
  });

  test('at [10.8, 0, -1.7] every cart part clears the Store and the Forge', () => {
    const parts = cartParts(CART_POS);
    const store = worstClearance(parts, STORE_PIECES.map(asObb));
    const forge = worstClearance(parts, FORGE_PIECES.map(asObb));
    expect(store.pair).toBe('slat1 ↔ goods.barrel');
    expect(store.clearance).toBeGreaterThan(2.7);
    expect(forge.pair).toBe('slat1 ↔ plinth.lower');
    // The plinth's west face is at x 13 = 18 − 9.5/2 − 0.25, and the slat's east
    // edge at 10.8 + (0.68 + 0.1) / √2 + 0.06 / √2 = 12.0092.
    expect(forge.clearance).toBeCloseTo(0.9908, 3);
    for (const p of [...STORE_PIECES, ...FORGE_PIECES]) {
      expect(parts.every((c) => sat(c, asObb(p)) > 0), `${p.n} overlaps the cart`).toBe(true);
    }
  });

  test('the nearest street prop is the courtyard bench, still 0.79 clear', () => {
    const worst = worstClearance(cartParts(CART_POS), FURNITURE);
    expect(worst.pair).toBe('wheel1 ↔ bench.seat');
    expect(worst.clearance).toBeCloseTo(0.7901, 3);
    expect(worst.clearance).toBeGreaterThan(0.5);
  });

  test('the cart stands wholly on the Via Decumanus carriageway', () => {
    const parts = cartParts(CART_POS);
    for (const part of parts) {
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          const cornerX = part.c.x + sx * halfAlong(part, 'x');
          const cornerZ = part.c.z + sz * halfAlong(part, 'z');
          expect(cornerX).toBeGreaterThanOrEqual(STREET_RECT.x[0]);
          expect(cornerX).toBeLessThanOrEqual(STREET_RECT.x[1]);
          expect(cornerZ).toBeGreaterThanOrEqual(STREET_RECT.z[0]);
          expect(cornerZ).toBeLessThanOrEqual(STREET_RECT.z[1]);
        }
      }
    }
    // The 45° yaw turns every part's local (h_x, h_z) into a world reach of
    // (h_x + h_z) / √2, so the cart's true footprint spans 2.2769 across the
    // 8-wide carriageway, leaving 1.2323 to the north kerb (z −4) and 4.4908 to
    // the south kerb (z +4).
    const span = parts.reduce(
      (a, p) => [Math.min(a[0], p.c.z - halfAlong(p, 'z')), Math.max(a[1], p.c.z + halfAlong(p, 'z'))] as [number, number],
      [Infinity, -Infinity] as [number, number],
    );
    expect(span[1] - span[0]).toBeCloseTo(2.277, 3);
    expect(span[0] - STREET_RECT.z[0]).toBeCloseTo(1.2323, 3);
    expect(STREET_RECT.z[1] - span[1]).toBeCloseTo(4.4908, 3);
  });

  test('neither the forge doorway nor the store frontage is obstructed', () => {
    const inside = (o: Obb, r: { x: readonly [number, number]; z: readonly [number, number] }) =>
      o.c.x + halfAlong(o, 'x') > r.x[0] &&
      o.c.x - halfAlong(o, 'x') < r.x[1] &&
      o.c.z + halfAlong(o, 'z') > r.z[0] &&
      o.c.z - halfAlong(o, 'z') < r.z[1];
    for (const part of cartParts(CART_POS)) {
      expect(inside(part, FORGE_DOOR_ZONE)).toBe(false);
      expect(inside(part, STORE_FRONT_ZONE)).toBe(false);
    }
    // Both arrivals keep more than a player diameter of room from the cart.
    const storeArrival = FAST_TRAVEL_ARRIVALS.general_store;
    const forgeArrival = FAST_TRAVEL_ARRIVALS.smithing_forge;
    for (const [ax, az] of [storeArrival, forgeArrival]) {
      for (const part of cartParts(CART_POS)) {
        const dx = Math.max(0, Math.abs(ax - part.c.x) - halfAlong(part, 'x'));
        const dz = Math.max(0, Math.abs(az - part.c.z) - halfAlong(part, 'z'));
        expect(Math.hypot(dx, dz)).toBeGreaterThan(2 * PLAYER_RADIUS);
      }
    }
  });

  test('the cart is not left straddling the procession avenue kerbs', () => {
    // Avenue kerbs sit at x = ±7.2, Z[−0.5, 20.5]; the cart is far east of them.
    const parts = cartParts(CART_POS);
    const minX = Math.min(...parts.map((p) => p.c.x - halfAlong(p, 'x')));
    expect(minX).toBeGreaterThan(7.5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Phase scope — no building, collider, arrival or route moved
// ══════════════════════════════════════════════════════════════════════════

describe('F. The phase moves two props and nothing else', () => {
  test('the four neighbouring buildings keep their roots and colliders', () => {
    expect(specOf(innSrc).root).toEqual([16, 0, 14]);
    expect(specOf(tavernSrc).root).toEqual([-16, 0, 14]);
    expect(specOf(storeSrc).root).toEqual([22, 0, -5]);
    expect(specOf(forgeSrc).root).toEqual([18, 0, 2.6]);
    // Phase C-8.43: widths corrected to the rendered lower-step footprints
    // (caravanserai 9.6 → 9.1, city-tavern 9.4 → 8.9); both depths unchanged.
    expect(findRect('caravanserai')).toMatchObject({ cx: 16, cz: 14, hw: 9.1 / 2, hd: 8.1 / 2 });
    expect(findRect('city-tavern')).toMatchObject({ cx: -16, cz: 14, hw: 8.9 / 2, hd: 7.7 / 2 });
    expect(findRect('general-store')).toMatchObject({ cx: 22, cz: -5, hw: 7.7 / 2, hd: 6.3 / 2 });
    expect(findRect('smithing-forge')).toMatchObject({ cx: 18, cz: 2.6, hw: 9.5 / 2, hd: 8.0 / 2 });
  });

  test('no prop gained a collider — the registry holds buildings and walls only', () => {
    expect(CITY_COLLIDERS.filter((c) => /cart|cypress|bench|crate|amphora|prop|barrel/.test(c.id))).toEqual([]);
  });

  test('fast-travel arrivals around the two props are untouched', () => {
    expect(FAST_TRAVEL_ARRIVALS.general_store).toEqual([17, -5]);
    expect(FAST_TRAVEL_ARRIVALS.smithing_forge).toEqual([11.5, 2.6]);
    expect(FAST_TRAVEL_ARRIVALS.caravanserai).toEqual([10, 14]);
    expect(FAST_TRAVEL_ARRIVALS.tavern).toEqual([-10, 14]);
  });

  test('the C-8.18 and C-8.19 corrections are preserved', () => {
    expect(findRect('records-library')).toMatchObject({ cx: 23.1, cz: -30, hw: 3.25, hd: 2.85 });
    expect(forgeSrc).toContain('<group position={[18, 0, 2.6]}>');
    expect(storeSrc).toContain('<group position={[22, 0, -5]}>');
  });

  test('the avenue’s other two cypress stations are untouched', () => {
    expect(CYPRESS_Z[0]).toBe(-7.5);
    expect(CYPRESS_Z[2]).toBe(20);
    expect(processionSrc).toContain('[-7.5, 8.55, 20].map((pz, zi)');
  });
});
