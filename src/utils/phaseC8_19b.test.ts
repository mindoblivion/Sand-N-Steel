/**
 * Phase C-8.19 (b) — Smithing Forge ↔ General Store intersection correction.
 *
 * NAMING: the repository's `phaseC8_19.test.ts` is already the Doctore House
 * depth reduction (that label was reused by two workstreams), so this file takes
 * the letter suffix the repo already uses for split phases (cf. phase39b /
 * phase39c) and carries ONLY the Forge–General Store coverage.  No existing
 * suite was overwritten, weakened or duplicated.
 *
 * THE DEFECT (reproduced in section D): with the Forge root at Z = 2, nine
 * band-sharing pairs of the two buildings' boxes sat inside each other, in five
 * vertical bands at once — the worst being the Forge's sloping roof slabs
 * against the Store's ridge cap at −0.44, the tile planes against each other at
 * −0.40, the eave/plinth bands at −0.15 to −0.24.
 *
 * THE FIX: the Forge root moved +0.60 in Z ([18, 0, 2] → [18, 0, 2.6]).  X, the
 * footprint dimensions, the architecture, the props, the entrance face and the
 * collision width are untouched, so the C-8.10 Forge–Armor Workshop passage
 * keeps its 1.0-unit collider gap.  The General Store did not move at all.
 * All nine pairs clear; the tightest becomes +0.16 (Forge roof slabs against
 * the Store's ridge cap), then +0.20 between the two roof tile planes.
 *
 * Every clearance below is re-derived from the two components' own sources and
 * the primitives' documented formulas (cross-checked against BuildingFoundation
 * .tsx and ClassicalArchitecture.tsx in section B), not restated from the audit.
 * The collider, hub and arrival come from the live registry and tables, and the
 * traversal cases drive the real movement resolver.
 *
 * Run with: bun test src/utils/phaseC8_19b.test.ts
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

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const forgeSrc = load('../components/3d/city/SmithingForge.tsx');
const storeSrc = load('../components/3d/city/GeneralStore.tsx');
const foundSrc = load('../components/3d/city/BuildingFoundation.tsx');
const archSrc = load('../components/3d/city/ClassicalArchitecture.tsx');
const acadSrc = load('../components/3d/city/GladiatorAcademy.tsx');

const R = PLAYER_RADIUS;
/** Documented Phase 31D arrival invariant: player radius + 0.5 safety margin. */
const ARRIVAL_CLEARANCE = R + 0.5; // 0.9

/** Movement step used by the production resolver defaults. */
const SPEED = 3.8;
const DT = 1 / 60;

// ── Tiny parsers (same style as phaseC8_18 / phaseC8_19) ──────────────────

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

function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ── Movement / distance helpers (drive the real resolver and registry) ────

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

function walk(
  start: [number, number, number],
  dx: number,
  dz: number,
  steps: number,
  done?: (p: [number, number, number]) => boolean,
): Array<[number, number, number]> {
  const traj: Array<[number, number, number]> = [start];
  let p = start;
  for (let i = 0; i < steps; i++) {
    p = resolveCityMovement(p, dx, dz, SPEED, DT);
    traj.push(p);
    if (done && done(p)) break;
  }
  return traj;
}

function everInside(
  traj: Array<[number, number, number]>,
  colliders: Collider[] = CITY_COLLIDERS,
): boolean {
  return traj.some((p) => collidesWith(p[0], p[2], R, colliders));
}

// ── Rendered geometry parsed from the two component sources ───────────────

const FORGE_ROOT = triple(
  forgeSrc,
  /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED TRAVERTINE/,
);
const FORGE_FOUNDATION = pair(
  forgeSrc,
  /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const FORGE_PROJECTION = num(forgeSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
const FORGE_WALL = {
  posY: num(forgeSrc, /<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>/),
  args: triple(
    forgeSrc,
    /<mesh castShadow receiveShadow position=\{\[0, [\d.]+, 0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
  ),
};
const FORGE_CORNICE = {
  size: pair(forgeSrc, /<WallCornice\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/),
  y: num(forgeSrc, /<WallCornice\s+size=\{\[\s*[\d.]+,\s*[\d.]+\s*\]\}\s+y=\{([\d.]+)\}/),
  height: num(forgeSrc, /<WallCornice[\s\S]*?height=\{([\d.]+)\}/),
  projection: num(forgeSrc, /<WallCornice[\s\S]*?projection=\{([\d.]+)\}/),
};
const FORGE_QUOIN = {
  buildingSize: pair(
    forgeSrc,
    /<CornerQuoins\s+height=\{[\d.]+\}\s+buildingSize=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
  ),
  height: num(forgeSrc, /<CornerQuoins\s+height=\{([\d.]+)\}/),
};
const FORGE_ROOF = {
  width: num(forgeSrc, /<RomanGabledRoof[\s\S]*?width=\{([\d.]+)\}/),
  depth: num(forgeSrc, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
  height: num(forgeSrc, /<RomanGabledRoof[\s\S]*?height=\{([\d.]+)\}/),
  overhang: num(forgeSrc, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
  pos: triple(
    forgeSrc,
    /<RomanGabledRoof[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
  ),
};

const STORE_ROOT = triple(
  storeSrc,
  /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED TRAVERTINE/,
);
const STORE_FOUNDATION = pair(
  storeSrc,
  /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const STORE_PROJECTION = num(storeSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
const STORE_WALL = {
  posY: num(storeSrc, /<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>/),
  args: triple(
    storeSrc,
    /<mesh castShadow receiveShadow position=\{\[0, [\d.]+, 0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
  ),
};
const STORE_CORNICE = {
  size: pair(storeSrc, /<WallCornice\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/),
  y: num(storeSrc, /<WallCornice\s+size=\{\[\s*[\d.]+,\s*[\d.]+\s*\]\}\s+y=\{([\d.]+)\}/),
  height: num(storeSrc, /<WallCornice[\s\S]*?height=\{([\d.]+)\}/),
  projection: num(storeSrc, /<WallCornice[\s\S]*?projection=\{([\d.]+)\}/),
};
const STORE_QUOIN = {
  buildingSize: pair(
    storeSrc,
    /<CornerQuoins\s+height=\{[\d.]+\}\s+buildingSize=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
  ),
  height: num(storeSrc, /<CornerQuoins\s+height=\{([\d.]+)\}/),
};
const STORE_ROOF = {
  width: num(storeSrc, /<RomanGabledRoof[\s\S]*?width=\{([\d.]+)\}/),
  depth: num(storeSrc, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
  height: num(storeSrc, /<RomanGabledRoof[\s\S]*?height=\{([\d.]+)\}/),
  overhang: num(storeSrc, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
  pos: triple(
    storeSrc,
    /<RomanGabledRoof[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
  ),
};
/** Striped canvas awning: Z-axis rotation only, so its Z extent is unrotated. */
const STORE_AWNING = {
  pos: triple(
    storeSrc,
    /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotation=\{\[0, 0, [\d.]+\]\} ref=\{canopyRef\}>/,
  ),
  rot: num(storeSrc, /rotation=\{\[0, 0, ([\d.]+)\]\} ref=\{canopyRef\}>/),
  box: triple(
    storeSrc,
    /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}\s*\/>\s*<meshStandardMaterial color="#991b1b"/,
  ),
};
/** Timber support posts: single X row, two Z positions, tapered cylinder. */
const STORE_POST = {
  x: num(storeSrc, /\[\s*(-?[\d.]+)\s*\]\.map\(\(px, pi\)/),
  z: pair(storeSrc, /\[(-?[\d.]+),\s*(-?[\d.]+)\]\.map\(\(pz, zi\)/),
  radius: pair(storeSrc, /<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),/),
};

/** Corner-quoin block cross-sections (hardcoded in the primitive). */
const QUOIN_QX = pair(archSrc, /const qx = isLong \? ([\d.]+) : ([\d.]+);/);
const QUOIN_QZ = pair(archSrc, /const qz = isLong \? ([\d.]+) : ([\d.]+);/);
/** Roof tile slab thickness (hardcoded in the primitive). */
const TILE_THICKNESS = num(archSrc, /const tileThickness = ([\d.]+);/);

// ── Axis-aligned piece model ──────────────────────────────────────────────

interface Piece {
  name: string;
  x: [number, number];
  y: [number, number];
  z: [number, number];
}

interface BuildingSpec {
  root: [number, number, number];
  foundation: [number, number];
  projection: number;
  wall: { posY: number; args: [number, number, number] };
  cornice: { size: [number, number]; y: number; height: number; projection: number };
  quoin: { buildingSize: [number, number]; height: number };
  roof: {
    width: number;
    depth: number;
    height: number;
    overhang: number;
    pos: [number, number, number];
  };
}

/** Every box the two buildings render, with world AABB extents. */
function pieces(spec: BuildingSpec, rootZ = spec.root[2]): Piece[] {
  const [rx, , rz] = [spec.root[0], spec.root[1], rootZ];
  const [fw, fd] = spec.foundation;
  const proj = spec.projection;
  const [ww, wh, wd] = spec.wall.args;
  const out: Piece[] = [];

  // BuildingFoundation: lower step w + 2*proj, upper step w + 1.2*proj.
  const lowerH = 0.3 * 0.45;
  out.push({
    name: 'lower plinth step',
    x: [rx - fw / 2 - proj, rx + fw / 2 + proj],
    y: [0, lowerH],
    z: [rz - fd / 2 - proj, rz + fd / 2 + proj],
  });
  out.push({
    name: 'upper plinth body',
    x: [rx - fw / 2 - proj * 0.6, rx + fw / 2 + proj * 0.6],
    y: [lowerH, 0.3],
    z: [rz - fd / 2 - proj * 0.6, rz + fd / 2 + proj * 0.6],
  });

  // Main wall block.
  out.push({
    name: 'wall block',
    x: [rx - ww / 2, rx + ww / 2],
    y: [spec.wall.posY - wh / 2, spec.wall.posY + wh / 2],
    z: [rz - wd / 2, rz + wd / 2],
  });

  // WallCornice: four strips, each `projection` deep beyond the wall face.
  const c = spec.cornice;
  out.push({
    name: 'eave cornice',
    x: [rx - c.size[0] / 2 - c.projection, rx + c.size[0] / 2 + c.projection],
    y: [c.y - c.height / 2, c.y + c.height / 2],
    z: [rz - c.size[1] / 2 - c.projection, rz + c.size[1] / 2 + c.projection],
  });

  // CornerQuoins: blocks centred on each corner, max cross-section max(qx, qz).
  const q = spec.quoin;
  const qHalf = Math.max(...QUOIN_QX, ...QUOIN_QZ) / 2;
  out.push({
    name: 'corner quoins',
    x: [rx - q.buildingSize[0] / 2 - qHalf, rx + q.buildingSize[0] / 2 + qHalf],
    y: [0, q.height],
    z: [rz - q.buildingSize[1] / 2 - qHalf, rz + q.buildingSize[1] / 2 + qHalf],
  });

  // RomanGabledRoof (ridgeAlong "z"): fascia, the two sloping tile slabs, ridge.
  const r = spec.roof;
  const halfSpan = r.width / 2 + r.overhang;
  const fullLength = r.depth + r.overhang * 2;
  const slope = Math.atan2(r.height, halfSpan);
  const rafter = Math.hypot(halfSpan, r.height);
  const baseY = r.pos[1];
  out.push({
    name: 'roof fascia',
    x: [rx - (r.width + r.overhang * 1.2) / 2, rx + (r.width + r.overhang * 1.2) / 2],
    y: [baseY - 0.16, baseY],
    z: [rz - (r.depth + r.overhang * 1.2) / 2, rz + (r.depth + r.overhang * 1.2) / 2],
  });
  // The slabs and the ridge are rotated about Z only, so each piece's Z extent is
  // exactly its own box Z dimension — the Z clearances below are exact, not an
  // AABB approximation.  X/Y use the rotated (still exact) half-widths.
  const slabAlong = (rafter / 2) * Math.cos(slope) + (TILE_THICKNESS / 2) * Math.sin(slope);
  const slabAcross = (rafter / 2) * Math.sin(slope) + (TILE_THICKNESS / 2) * Math.cos(slope);
  const tileCentreY = baseY + r.height / 2 + 0.04;
  out.push({
    name: 'roof tile planes',
    x: [rx - halfSpan / 2 - slabAlong, rx + halfSpan / 2 + slabAlong],
    y: [tileCentreY - slabAcross, tileCentreY + slabAcross],
    z: [rz - fullLength / 2, rz + fullLength / 2],
  });
  const ridgeCentreY = baseY + r.height + TILE_THICKNESS / 2 + 0.02;
  out.push({
    name: 'roof ridge',
    x: [rx - 0.16, rx + 0.16],
    y: [ridgeCentreY - 0.09, ridgeCentreY + 0.09],
    z: [rz - fullLength / 2 - 0.04, rz + fullLength / 2 + 0.04],
  });
  return out;
}

/** Store-only street furniture: the awning slab and the support posts. */
function storeExtras(rootZ = STORE_ROOT[2]): Piece[] {
  const rx = STORE_ROOT[0];
  const cos = Math.cos(STORE_AWNING.rot);
  const sin = Math.sin(STORE_AWNING.rot);
  const hx = STORE_AWNING.box[0] / 2;
  const hy = STORE_AWNING.box[1] / 2;
  const hz = STORE_AWNING.box[2] / 2;
  const ax = rx + STORE_AWNING.pos[0];
  const ay = STORE_AWNING.pos[1];
  const az = rootZ + STORE_AWNING.pos[2];
  return [
    {
      name: 'canvas awning',
      x: [ax - (hx * cos + hy * sin), ax + (hx * cos + hy * sin)],
      y: [ay - (hx * sin + hy * cos), ay + (hx * sin + hy * cos)],
      z: [az - hz, az + hz],
    },
    {
      name: 'support posts',
      x: [rx + STORE_POST.x - STORE_POST.radius[1], rx + STORE_POST.x + STORE_POST.radius[1]],
      y: [0, 2.8],
      z: [
        rootZ + Math.min(...STORE_POST.z) - STORE_POST.radius[1],
        rootZ + Math.max(...STORE_POST.z) + STORE_POST.radius[1],
      ],
    },
  ];
}

const FORGE_SPEC: BuildingSpec = {
  root: FORGE_ROOT,
  foundation: FORGE_FOUNDATION,
  projection: FORGE_PROJECTION,
  wall: FORGE_WALL,
  cornice: FORGE_CORNICE,
  quoin: FORGE_QUOIN,
  roof: FORGE_ROOF,
};
const STORE_SPEC: BuildingSpec = {
  root: STORE_ROOT,
  foundation: STORE_FOUNDATION,
  projection: STORE_PROJECTION,
  wall: STORE_WALL,
  cornice: STORE_CORNICE,
  quoin: STORE_QUOIN,
  roof: STORE_ROOF,
};

const bandsOverlap = (a: [number, number], b: [number, number]) =>
  Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0;

interface PairClearance {
  pair: string;
  clearance: number;
}

/**
 * Z clearance for every forge/store structural pair that genuinely shares an X
 * and a Y band (i.e. every pair that would clash if the Z bands met).  A pair
 * from a different transform plane — the store's rotated awning is only rotated
 * about Z, which leaves its Z extent unchanged — is included on the same basis.
 */
function pairClearances(forgeRootZ: number): PairClearance[] {
  const out: PairClearance[] = [];
  const forge = pieces(FORGE_SPEC, forgeRootZ);
  const store = [...pieces(STORE_SPEC, STORE_ROOT[2]), ...storeExtras(STORE_ROOT[2])];
  for (const f of forge) {
    for (const s of store) {
      if (!bandsOverlap(f.x, s.x) || !bandsOverlap(f.y, s.y)) continue;
      out.push({ pair: `${f.name} ↔ ${s.name}`, clearance: f.z[0] - s.z[1] });
    }
  }
  return out;
}

function worstPair(forgeRootZ: number): PairClearance {
  return pairClearances(forgeRootZ).reduce((a, b) => (b.clearance < a.clearance ? b : a));
}

const clearanceOf = (name: string): number => {
  const found = pairClearances(FORGE_ROOT[2]).find((p) => p.pair === name);
  if (!found) throw new Error(`pair not evaluated: ${name}`);
  return found.clearance;
};

// Registry / table fixtures
const forge = findRect('smithing-forge');
const store = findRect('general-store');
const workshop = findRect('armor-workshop');
const academy = findRect('gladiator-academy');
const library = findRect('records-library');
const merchant = findRect('merchant-house');

const FORGE_HUB = HUB_LOCATIONS.find((l) => l.id === 'smithing_forge')!;
const FORGE_ARRIVAL = FAST_TRAVEL_ARRIVALS.smithing_forge;

const rectSeparation = (a: RectCollider, b: RectCollider) => ({
  x: Math.max(b.cx - b.hw, a.cx - a.hw) - Math.min(b.cx + b.hw, a.cx + a.hw),
  z: Math.max(b.cz - b.hd, a.cz - a.hd) - Math.min(b.cz + b.hd, a.cz + a.hd),
});

// ══════════════════════════════════════════════════════════════════════════
// A. Rendered root, collider, hub and arrival stay synchronised
// ══════════════════════════════════════════════════════════════════════════

describe('A. Forge root, collider, hub and arrival agree after the relocation', () => {
  test('the rendered root is the planned C-8.19 position, on the source of truth', () => {
    expect(FORGE_ROOT).toEqual([18, 0, 2.6]);
    // No rotation was introduced: the workshop portal still faces −X (west).
    expect(forgeSrc).toContain('<group position={[18, 0, 2.6]}>');
  });

  test('the collider follows the rendered footprint centre, dimensions unchanged', () => {
    expect(forge.cx).toBe(FORGE_ROOT[0]);
    expect(forge.cz).toBe(FORGE_ROOT[2]);
    expect(forge.cz).toBe(2.6);
    // C-8.10 narrowed the collider X width to the wall face (9.5 / 2).
    expect(forge.hw).toBeCloseTo(9.5 / 2, 10);
    // Z depth still tracks the full rendered plinth: depth + 2 * projection.
    expect(forge.hd).toBeCloseTo(FORGE_FOUNDATION[1] / 2 + FORGE_PROJECTION, 10);
    expect(forge.hw).toBe(4.75);
    expect(forge.hd).toBe(4.0);
  });

  test('the hub sits on the new root and the arrival keeps its (−6.5, 0) offset', () => {
    expect(FORGE_HUB.position).toEqual([18, 0, 2.6]);
    expect(FORGE_ARRIVAL).toEqual([11.5, 2.6]);
    // Phase 31D documented the arrival as "1.5 W of the forge west edge (x=13.0)".
    expect(FORGE_ARRIVAL[0] - FORGE_ROOT[0]).toBeCloseTo(-6.5, 10);
    expect(FORGE_ARRIVAL[1] - FORGE_ROOT[2]).toBeCloseTo(0, 10);
    expect(FORGE_ROOT[0] - (FORGE_FOUNDATION[0] / 2 + FORGE_PROJECTION)).toBeCloseTo(13.0, 10);
    expect(FORGE_ROOT[0] - FORGE_FOUNDATION[0] / 2 - FORGE_PROJECTION - FORGE_ARRIVAL[0]).toBeCloseTo(1.5, 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The derived model is pinned to the primitives' own formulas
// ══════════════════════════════════════════════════════════════════════════

describe('B. Piece model cross-checks the shared primitives', () => {
  test('BuildingFoundation derives the plinth bands the model uses', () => {
    expect(foundSrc).toMatch(/const lowerDepth = d \+ projection \* 2;/);
    expect(foundSrc).toMatch(/const upperDepth = d \+ projection \* 1\.2;/);
    expect(FORGE_PROJECTION).toBe(0.25);
    expect(STORE_PROJECTION).toBe(0.25);
  });

  test('RomanGabledRoof derives the fascia and tile extents the model uses', () => {
    expect(archSrc).toMatch(/const halfSpan = span \/ 2 \+ eaveOverhang;/);
    expect(archSrc).toMatch(/const fullLength = length \+ eaveOverhang \* 2;/);
    expect(archSrc).toMatch(
      /boxGeometry args=\{\[width \+ eaveOverhang \* 1\.2, 0\.16, depth \+ eaveOverhang \* 1\.2\]\}/,
    );
    expect(TILE_THICKNESS).toBe(0.15);
    expect(FORGE_ROOF.pos[1]).toBe(5.6);
    expect(STORE_ROOF.pos[1]).toBe(4.8);
  });

  test('WallCornice strips project `projection` beyond the wall face', () => {
    expect(archSrc).toMatch(/position=\{\[0, 0, d \/ 2 \+ projection \/ 2\]\}/);
    expect(FORGE_CORNICE.projection).toBe(0.16);
    expect(STORE_CORNICE.projection).toBe(0.14);
  });

  test('the store-only street furniture is parsed with its real transform', () => {
    expect(STORE_AWNING.pos).toEqual([-2.8, 2.6, 0]);
    expect(STORE_AWNING.rot).toBe(0.2);
    expect(STORE_AWNING.box).toEqual([2.8, 0.08, 5.2]);
    // Rotation is about Z, so it changes the X and Y extents only.
    expect(STORE_POST.x).toBe(-4.0);
    expect(STORE_POST.z).toEqual([-2.4, 2.4]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. Forge ↔ General Store: no interpenetration anywhere
// ══════════════════════════════════════════════════════════════════════════

describe('C. The two buildings no longer interpenetrate', () => {
  test('every band-sharing forge/store pair is strictly Z-separated', () => {
    const pairs = pairClearances(FORGE_ROOT[2]);
    expect(pairs.length).toBeGreaterThan(5);
    expect(pairs.filter((p) => p.clearance <= 0)).toEqual([]);
    // The tightest pair is the store's ridge cap against the forge's sloping
    // roof tiles — marginally tighter than the tile-plane-to-tile-plane pair.
    const sorted = [...pairs].sort((a, b) => a.clearance - b.clearance);
    expect(sorted[0].pair).toBe('roof tile planes ↔ roof ridge');
    expect(sorted[0].clearance).toBeCloseTo(0.16, 10);
    expect(sorted[1].pair).toBe('roof tile planes ↔ roof tile planes');
    expect(sorted[1].clearance).toBeCloseTo(0.2, 10);
  });

  test('measured clearances: plinth 0.45, wall 0.95, fascia 0.50, tiles 0.20', () => {
    // Same-band pairs first (these are the ones that would clash).
    expect(clearanceOf('lower plinth step ↔ lower plinth step')).toBeCloseTo(0.45, 10);
    expect(clearanceOf('upper plinth body ↔ upper plinth body')).toBeCloseTo(0.65, 10);
    expect(clearanceOf('wall block ↔ wall block')).toBeCloseTo(0.95, 10);
    expect(clearanceOf('corner quoins ↔ corner quoins')).toBeCloseTo(0.6, 10);
    // The two cornices sit at different heights (forge 5.55, store 4.75), so the
    // forge cornice and fascia pair with the store's wall band and eave instead.
    expect(clearanceOf('wall block ↔ eave cornice')).toBeCloseTo(0.81, 10);
    expect(clearanceOf('eave cornice ↔ roof tile planes')).toBeCloseTo(0.44, 10);
    expect(clearanceOf('roof fascia ↔ roof tile planes')).toBeCloseTo(0.36, 10);
    expect(clearanceOf('roof tile planes ↔ roof tile planes')).toBeCloseTo(0.2, 10);
    expect(clearanceOf('roof tile planes ↔ roof ridge')).toBeCloseTo(0.16, 10);
    // The store's north-most element is its ridge cap (0.04 beyond the tiles),
    // which is what makes it the binding half of the tightest pair.
    const store = [...pieces(STORE_SPEC), ...storeExtras()];
    const northMost = store.reduce((a, b) => (b.z[1] > a.z[1] ? b : a));
    expect(northMost.name).toBe('roof ridge');
    expect(northMost.z[1]).toBeCloseTo(-1.71, 10);
    // The awning and posts sit well south of that band.
    expect(clearanceOf('wall block ↔ canvas awning')).toBeCloseTo(1.25, 10);
    expect(clearanceOf('wall block ↔ support posts')).toBeCloseTo(1.31, 10);
  });

  test('the binding pair is a genuine 3-D clash zone, not a phantom', () => {
    const forgeTiles = pieces(FORGE_SPEC).find((p) => p.name === 'roof tile planes')!;
    const storeRidge = pieces(STORE_SPEC).find((p) => p.name === 'roof ridge')!;
    // They share an X band …
    expect(bandsOverlap(forgeTiles.x, storeRidge.x)).toBe(true);
    expect(Math.min(forgeTiles.x[1], storeRidge.x[1]) - Math.max(forgeTiles.x[0], storeRidge.x[0]))
      .toBeCloseTo(0.32, 10);
    // … and a real vertical band, so the Z separation is what keeps them apart.
    expect(bandsOverlap(forgeTiles.y, storeRidge.y)).toBe(true);
    expect(Math.min(forgeTiles.y[1], storeRidge.y[1]) - Math.max(forgeTiles.y[0], storeRidge.y[0]))
      .toBeCloseTo(0.18, 10);
    // The eave-to-eave pair overlaps far more broadly in X.
    const storeTiles = pieces(STORE_SPEC).find((p) => p.name === 'roof tile planes')!;
    expect(Math.min(forgeTiles.x[1], storeTiles.x[1]) - Math.max(forgeTiles.x[0], storeTiles.x[0]))
      .toBeCloseTo(5.15, 2);
  });

  test('the forged collider footprints no longer overlap, unlike the old layout', () => {
    const atOld = rectSeparation({ ...forge, cz: 2 }, store);
    expect(atOld.x).toBeLessThan(0); // shared X frontage
    expect(atOld.z).toBeCloseTo(-0.15, 10); // the former 0.15 overlap
    const now = rectSeparation(forge, store);
    expect(now.x).toBeCloseTo(-4.6, 10);
    expect(now.z).toBeCloseTo(0.45, 10);
    expect(now.z).toBeGreaterThan(0);
    // Still narrower than the player diameter: no walkable route opens up.
    expect(now.z).toBeLessThan(2 * R);
  });

  test('the forge collider overlaps no other building footprint', () => {
    const overlapping: string[] = [];
    for (const c of CITY_COLLIDERS) {
      if (c.type !== 'rect' || c.id === forge.id) continue;
      const s = rectSeparation(forge, c);
      if (s.x < 0 && s.z < 0) overlapping.push(c.id);
    }
    expect(overlapping).toEqual([]);
    // The gatehouse and fortress parts are deliberately overlapping composites;
    // only the forge ↔ store pair was an unintended building-to-building clash.
  });

  test('the general store and its street frontage did not move', () => {
    expect(store).toMatchObject({ cx: 22, cz: -5, hw: 3.85, hd: 3.15 });
    expect(STORE_ROOT).toEqual([22, 0, -5]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The audited defect is reproduced at the old Z
// ══════════════════════════════════════════════════════════════════════════

describe('D. The pre-move geometry reproduces the audited intersection', () => {
  test('the old forge root put many structural pairs into each other', () => {
    const atOld = pairClearances(2);
    const negatives = atOld.filter((p) => p.clearance < 0);
    // A wide interpenetration: eight band-sharing pairs, across four vertical
    // bands at once (plinth, cornice, fascia/eave and the roof slabs).
    // Nine band-sharing pairs interpenetrated, across five vertical bands
    // (plinth step, quoins, eave cornice, fascia/eave and the roof slabs).
    expect(negatives.length).toBe(9);
    expect(negatives.map((p) => p.pair).sort()).toEqual([
      'corner quoins ↔ lower plinth step',
      'corner quoins ↔ roof fascia',
      'corner quoins ↔ roof tile planes',
      'eave cornice ↔ roof tile planes',
      'lower plinth step ↔ corner quoins',
      'lower plinth step ↔ lower plinth step',
      'roof fascia ↔ roof tile planes',
      'roof tile planes ↔ roof ridge',
      'roof tile planes ↔ roof tile planes',
    ]);
    const named = (a: string, b: string) =>
      negatives.find((p) => p.pair === `${a} ↔ ${b}`)?.clearance;
    expect(named('lower plinth step', 'lower plinth step')).toBeCloseTo(-0.15, 10);
    expect(named('eave cornice', 'roof tile planes')).toBeCloseTo(-0.16, 10);
    expect(named('roof fascia', 'roof tile planes')).toBeCloseTo(-0.24, 10);
    expect(named('roof tile planes', 'roof tile planes')).toBeCloseTo(-0.4, 10);
    expect(named('corner quoins', 'roof fascia')).toBeCloseTo(-0.035, 10);
    expect(worstPair(2).pair).toBe('roof tile planes ↔ roof ridge');
    expect(worstPair(2).clearance).toBeCloseTo(-0.44, 10);
  });

  test('the +0.60 shift turns the worst pair into positive clearance', () => {
    const before = worstPair(2).clearance;
    const after = worstPair(2.6).clearance;
    expect(before).toBeLessThan(0);
    expect(after).toBeGreaterThan(0);
    // The move is exactly the audited +0.60, leaving 0.16 at the tightest pair.
    expect(after - before).toBeCloseTo(0.6, 10);
    expect(after).toBeCloseTo(0.16, 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. Forge–Armor Workshop passage preserved (X-based, Z-independent)
// ══════════════════════════════════════════════════════════════════════════

describe('E. The C-8.10 Forge–Armor Workshop passage is preserved', () => {
  test('the 1.0-unit collider gap and its X faces are unchanged', () => {
    expect(workshop).toMatchObject({ cx: 28.2, cz: 1.15, hw: 4.45, hd: 2.85 });
    expect(workshop.cx - workshop.hw - (forge.cx + forge.hw)).toBeCloseTo(1.0, 10);
    expect(forge.cx - forge.hw).toBeCloseTo(13.25, 10);
    expect(forge.cx + forge.hw).toBeCloseTo(22.75, 10);
  });

  test('the corridor is walkable north past the relocated forge', () => {
    const corridorX = (forge.cx + forge.hw + R + (workshop.cx - workshop.hw - R)) / 2; // 23.25
    const traj = walk([corridorX, 0, -1.0], 0, 1, 500);
    expect(traj[traj.length - 1][2]).toBeGreaterThan(forge.cz + forge.hd); // > 6.6
    expect(traj[traj.length - 1][2]).toBeGreaterThan(6.6);
    expect(everInside(traj, [forge, workshop])).toBe(false);
    // The corridor is collision-free for its whole length.
    expect(collidesWith(corridorX, 1, R, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(corridorX, forge.cz + forge.hd + 0.2, R, CITY_COLLIDERS)).toBe(false);
  });

  test('the passage still blocks into either building', () => {
    // The fixture sits inside the workshop's west overlap, never inside the forge.
    expect(collidesWith(23.375, 1, R, [workshop])).toBe(true);
    expect(collidesWith(23.375, 1, R, [forge])).toBe(false);

    // A +X step must not advance into the workshop.
    const intoWorkshop = resolveCityMovement([23.375, 0, 1], 1, 0, SPEED, DT);
    expect(intoWorkshop[0]).toBeLessThanOrEqual(23.375 + 0.01);

    // Walking −X down the corridor never enters the forge, and stops on the
    // corridor's west boundary (forge east face 22.75 + player radius).
    let p: [number, number, number] = [23.375, 0, 1];
    for (let i = 0; i < 40; i++) {
      p = resolveCityMovement(p, -1, 0, SPEED, DT);
      expect(collidesWith(p[0], p[2], R, [forge])).toBe(false);
    }
    expect(p[0]).toBeGreaterThanOrEqual(forge.cx + forge.hw + R - 1e-9);
    expect(p[0]).toBeLessThanOrEqual(23.375);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Hub and arrival resolution
// ══════════════════════════════════════════════════════════════════════════

describe('F. Hub resolution and the fast-travel arrival stay usable', () => {
  test('the arrival is collision-free with the documented 1.5-unit standoff', () => {
    expect(collidesWith(FORGE_ARRIVAL[0], FORGE_ARRIVAL[1], R, CITY_COLLIDERS)).toBe(false);
    const clearance = nearestColliderDistance(FORGE_ARRIVAL[0], FORGE_ARRIVAL[1]);
    expect(clearance).toBeCloseTo(1.75, 10); // forge west collider face 13.25 − 11.5
    expect(clearance).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
  });

  test('hub resolution at the forge selects smithing_forge and nothing else', () => {
    expect(getNearbyHubLocation([18, 0, 2.6])?.id).toBe('smithing_forge');
    // The pre-move hub centre now sits 0.6 from the new one — still inside radius.
    expect(getNearbyHubLocation([18, 0, 2])?.id).toBe('smithing_forge');
    const covering = HUB_LOCATIONS.filter(
      (l) => Math.hypot(18 - l.position[0], 2.6 - l.position[2]) <= l.radius,
    ).map((l) => l.id);
    expect(covering).toEqual(['smithing_forge']);
  });

  test('the arrival itself is a standoff — resolution is unchanged by the move', () => {
    // 6.5 units from the hub, outside the 4.5 interaction radius, exactly as
    // before the relocation: the player walks up to the forge to interact.
    const dist = Math.hypot(FORGE_ARRIVAL[0] - FORGE_HUB.position[0], FORGE_ARRIVAL[1] - FORGE_HUB.position[2]);
    expect(dist).toBeCloseTo(6.5, 10);
    expect(dist).toBeGreaterThan(FORGE_HUB.radius);
    expect(getNearbyHubLocation([FORGE_ARRIVAL[0], 0, FORGE_ARRIVAL[1]])).toBeNull();
  });

  test('walking from the arrival reaches the forge interaction radius', () => {
    // North out of the store/forge frontage, then east along the forge north face.
    const leg1 = walk([FORGE_ARRIVAL[0], 0, FORGE_ARRIVAL[1]], 0, 1, 200, (p) => p[2] > 7.0);
    const turn = leg1[leg1.length - 1];
    expect(everInside(leg1)).toBe(false);
    const leg2 = walk(turn, 1, 0, 300, (p) => p[0] > 18.0);
    const end = leg2[leg2.length - 1];
    expect(everInside(leg2)).toBe(false);
    expect(Math.hypot(end[0] - FORGE_HUB.position[0], end[2] - FORGE_HUB.position[2]))
      .toBeLessThanOrEqual(FORGE_HUB.radius);
    expect(getNearbyHubLocation([end[0], 0, end[2]])?.id).toBe('smithing_forge');
    // Nothing else ever claims the player on the way there.
    for (const p of [...leg1, ...leg2]) {
      const hub = getNearbyHubLocation([p[0], 0, p[2]]);
      if (hub) expect(hub.id).toBe('smithing_forge');
    }
  });

  test('the arrival is not a movement trap', () => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const moved = resolveCityMovement([FORGE_ARRIVAL[0], 0, FORGE_ARRIVAL[1]], dx, dz, SPEED, DT);
      expect(
        Math.hypot(moved[0] - FORGE_ARRIVAL[0], moved[2] - FORGE_ARRIVAL[1]),
        `stuck pushing [${dx}, ${dz}]`,
      ).toBeGreaterThan(SPEED * DT * 0.9);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. Via Mercatoria, General Store and Merchant House relationships
// ══════════════════════════════════════════════════════════════════════════

describe('G. Via Mercatoria and the Merchant House are unaffected', () => {
  test('the alley footprint is unchanged and still overlaps no collider', () => {
    expect(VIA_MERCATORIA_PATH).toEqual({
      id: 'via-mercatoria-path',
      cx: 20.5,
      cz: -11.1,
      w: 3,
      d: 5.8,
    });
    const path: RectCollider = {
      type: 'rect',
      id: VIA_MERCATORIA_PATH.id,
      cx: VIA_MERCATORIA_PATH.cx,
      cz: VIA_MERCATORIA_PATH.cz,
      hw: VIA_MERCATORIA_PATH.w / 2,
      hd: VIA_MERCATORIA_PATH.d / 2,
    };
    const clashes: string[] = [];
    for (const c of CITY_COLLIDERS) {
      if (c.type !== 'rect' || c.id === forge.id) continue;
      const s = rectSeparation(path, c);
      if (s.x < 0 && s.z < 0) clashes.push(c.id);
    }
    expect(clashes).toEqual([]);
    // Documented 0.05 clearance to the store's foundation edge is preserved.
    const pathNorth = path.cz + path.hd; // -8.2
    expect(store.cz - store.hd - pathNorth).toBeCloseTo(0.05, 10);
  });

  test('the Merchant House corridor between the two buildings is intact', () => {
    expect(merchant).toMatchObject({ cx: 26, cz: -13, hw: 3.85, hd: 3.5 });
    expect(merchant.cz + merchant.hd).toBeCloseTo(-9.5, 10);
    expect(store.cz - store.hd - (merchant.cz + merchant.hd)).toBeCloseTo(1.35, 10);
    // Walking north up the alley from the merchant arrival stops on the store face.
    const traj = walk([21, 0, -13], 0, 1, 60);
    const end = traj[traj.length - 1];
    expect(everInside(traj, [store, merchant])).toBe(false);
    expect(end[2]).toBeLessThan(store.cz - store.hd); // never crosses the store's south face
    expect(collidesWith(end[0], end[2], R, CITY_COLLIDERS)).toBe(false);
  });

  test('the forge is far clear of the alley and the merchant arrival', () => {
    expect(rectSeparation(forge, merchant).z).toBeGreaterThan(5);
    expect(collidesWith(21, -13, R, [forge])).toBe(false);
    expect(collidesWith(20.5, -11.1, R, [forge])).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// H. Phase C-8.18 Records Library / Academy invariants remain intact
// ══════════════════════════════════════════════════════════════════════════

describe('H. The C-8.18 Records Library corrections are untouched', () => {
  test('the library and academy colliders are exactly as C-8.18 recorded', () => {
    expect(library).toMatchObject({ cx: 23.1, cz: -30, hw: 3.25, hd: 2.85 });
    expect(academy).toMatchObject({ cx: 30.5, cz: -27, hw: 3.85, hd: 3.65 });
  });

  test('the plinth-to-plinth gap stays the planned 0.30', () => {
    const gap = academy.cx - academy.hw - (library.cx + library.hw);
    expect(gap).toBeCloseTo(0.3, 10);
    expect(gap).toBeGreaterThan(0);
  });

  test('the academy doorway plane keeps ≥ 0.50 from the library plinth', () => {
    const acadRoot = triple(acadSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
    const portalGroup = triple(acadSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* Recessed Framed Portal \*\//);
    const doorPos = triple(acadSrc, /<ClassicalDoorway\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/);
    const planeX = acadRoot[0] + portalGroup[0] + doorPos[0];
    expect(planeX).toBeCloseTo(26.88, 10);
    const gap = planeX - (library.cx + library.hw);
    expect(gap).toBeCloseTo(0.53, 10);
    expect(gap).toBeGreaterThanOrEqual(0.5);
  });

  test('the records_house arrival still resolves to the library hub', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.records_house;
    expect([ax, az]).toEqual([23.1, -26]);
    expect(nearestColliderDistance(ax, az)).toBeCloseTo(1.15, 10);
    expect(getNearbyHubLocation([ax, 0, az])?.id).toBe('records_house');
  });

  test('the library keeps its Colosseum clearance above the C-8.18 threshold', () => {
    let ringGap = Infinity;
    for (const c of CITY_COLLIDERS) {
      if (!c.id.startsWith('colo-wall')) continue;
      for (const [x, z] of [
        [library.cx - library.hw, library.cz - library.hd],
        [library.cx - library.hw, library.cz + library.hd],
      ] as const) {
        ringGap = Math.min(ringGap, distanceTo(c, x, z));
      }
    }
    expect(ringGap).toBeGreaterThan(0.8);
    expect(ringGap).toBeLessThan(0.9);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I. Phase scope: nothing else moved, nothing else changed
// ══════════════════════════════════════════════════════════════════════════

describe('I. Phase scope — only the forge root Z changed', () => {
  test('the forge keeps its X centre, footprint, architecture and props', () => {
    expect(forge.cx).toBe(18);
    expect(forge.hw).toBe(4.75);
    expect(forge.hd).toBe(4.0);
    // The relocation touched the root Z only: every other local transform and
    // dimension in the component is unchanged, so its props ride along with it.
    for (const snippet of [
      '<BuildingFoundation size={[9.5, 7.5]}',
      '<boxGeometry args={[9.5, 5.6, 7.5]} />',
      '<RomanGabledRoof',
      '<group position={[-2.5, 0, -2.2]}>', // smelting furnace + chimney
      '<group position={[-3.6, 0, 1.2]}>', // stump and anvil
      '<group position={[-2.4, 0, 2.5]}>', // quenching barrel
      '<group position={[-4.5, 0, -1.8]} rotation={[0, Math.PI / 2, 0]}>', // weapon rack
      '<ClassicalDoorway',
      'position={[-4.75, 0, 0]}',
    ]) {
      expect(forgeSrc).toContain(snippet);
    }
    expect(FORGE_WALL.args).toEqual([9.5, 5.6, 7.5]);
    expect(FORGE_ROOF.width).toBe(9.5);
    expect(FORGE_ROOF.depth).toBe(7.5);
  });

  test('the neighbouring structures this phase must not touch are unchanged', () => {
    expect(findRect('caravanserai')).toMatchObject({ cx: 16, cz: 14, hw: 4.8, hd: 4.05 });
    expect(findRect('armor-workshop')).toMatchObject({ cx: 28.2, cz: 1.15, hw: 4.45, hd: 2.85 });
    expect(findRect('city-tavern')).toMatchObject({ cx: -16, cz: 14 });
    expect(FAST_TRAVEL_ARRIVALS.armor_workshop).toEqual([28.2, 5.5]);
    expect(FAST_TRAVEL_ARRIVALS.general_store).toEqual([17, -5]);
    expect(FAST_TRAVEL_ARRIVALS.merchant_house).toEqual([21, -13]);
  });

  test('the forge north face still clears the caravanserai to the north', () => {
    const caravanserai = findRect('caravanserai');
    const forgeNorth = FORGE_ROOT[2] + FORGE_FOUNDATION[1] / 2 + FORGE_PROJECTION;
    expect(caravanserai.cz - caravanserai.hd - forgeNorth).toBeCloseTo(3.35, 10);
    expect(caravanserai.cz - caravanserai.hd - forgeNorth).toBeGreaterThan(2 * R);
  });
});
