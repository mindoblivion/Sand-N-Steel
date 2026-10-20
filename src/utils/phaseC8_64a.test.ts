/**
 * Phase C-8.64A — East Circus District: the arena placement prototype.
 *
 * Run with: bun test src/utils/phaseC8_64a.test.ts
 *
 * ── WHAT THIS PHASE SHIPPED ───────────────────────────────────────────────
 * The C-8.63 audit chose the East Circus District for the chariot arena and
 * fixed its provisional transform: `[52.34, -0.05, 43.80]`, yaw π/2, uniform
 * scale 0.20.  `44721b9` mounted the asset there
 * (`components/3d/city/EastCircusArena.tsx`), gave it a 26-segment collision
 * perimeter that left a mouth at each axial end, and opened the movement
 * envelope just far enough east and south for the district to be walked to.
 *
 * **The entrance/collision alignment correction (this suite's subject).**  Both
 * mouths were then re-measured against the shipping asset, and neither
 * corresponds to a rendered opening a player can enter:
 *
 *   • carceres (south).  The arcade is TWELVE through-openings of 0.49–0.51
 *     (pitch 1.35, the first on X ≈ 44.66, the last ending X ≈ 60.02) pierced
 *     through the 1.85-high block, and each narrows with height — every one far
 *     below the 0.80 player diameter.
 *   • north tip.  The sphendone is solid stone at ground level from the shell's
 *     north extreme (Z −30.157) south to Z ≈ −27.8 across the whole 7.92 mouth;
 *     its only voids there are sub-0.5 slivers that do not pass through.
 *
 * So the perimeter is now a CLOSED ring: the 18.00 mouth is shut by a segment
 * across the carceres' own front face (Z 46.00), and the 7.92 mouth is shut by a
 * two-chord cap traced in open air north of the tip (through X 50.0 / Z −30.5 to
 * the axis apex at Z −30.65).  The GLB is untouched — the arena simply cannot be
 * entered until an approved art change widens a gate.
 *
 * ── HOW THE RENDERED MEASUREMENTS ARE MADE ────────────────────────────────
 * Two independent probes, because they answer two different questions:
 *
 *   1. **Where is the stone?** — the even-odd parity of a horizontal ray, at a
 *      single height, against every triangle.  This gives the STONE intervals at
 *      a row, and therefore the rendered openings between them.  It is exact for
 *      a closed mesh; the rows used here are the two entrance rows, whose
 *      crossing counts are clean (26 at the carceres, matching the twelve
 *      openings of the audit).
 *   2. **Can a player stand or pass?** — the player is a 0.4-radius, 1.70-tall
 *      CYLINDER, and a point admits the body when no rendered triangle comes
 *      within that radius of the cylinder's axis at any height in the body's
 *      band (12 heights).  Sweeping that along a row is the player-sized sweep.
 *      Note this probe is only read at rows next to a surface and for bodies no
 *      wider than the opening; at a row well inside a solid mass it would report
 *      the mass's interior, which is why the two probes are never mixed.
 * ─────────────────────────────────────────────────────────────────────────
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  CIRCUS_AXIS_X,
  CIRCUS_WEST_X,
  CIRCUS_EAST_X,
  CIRCUS_SOUTH_Z,
  CIRCUS_CARCERES_WEST_X,
  CIRCUS_CARCERES_EAST_X,
  CIRCUS_CARCERES_FRONT_Z,
  CIRCUS_ARCH_WEST_X,
  CIRCUS_ARCH_EAST_X,
  CIRCUS_OVAL_START_Z,
  CIRCUS_NORTH_END_Z,
  CIRCUS_WEST_OUTLINE,
  type Collider,
  type SegmentCollider,
} from './collisionShapes';
import {
  resolveCityMovement,
  BOUNDARY_X,
  BOUNDARY_Z_MIN,
  BOUNDARY_Z_MAX,
  CIRCUS_ENVELOPE_X_EAST,
  CIRCUS_ENVELOPE_Z_MIN,
  CIRCUS_ENVELOPE_Z_MAX,
  clampBoundaryX,
  clampBoundaryZ,
  HUB_LOCATIONS,
  FAST_TRAVEL_ARRIVALS,
} from './cityCollisions';
import {
  GROUND_PLANE_ELEVATION_Y,
  GROUND_PLANE_EAST_X,
  GROUND_PLANE_SOUTH_Z,
} from '../components/3d/city/ProcessionAvenue';

// ── Sources ────────────────────────────────────────────────────────────────
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const arenaSrc = load('../components/3d/city/EastCircusArena.tsx');
const sceneSrc = load('../components/3d/city/CityHubScene.tsx');

// ── The shipping asset, under the component's own transform ────────────────
const GLB_BYTES = readFileSync(new URL('../../public/_workspace_arena.glb', import.meta.url));
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(GLB_BYTES));

// C-8.69B: the Y is the ground plane plus the arena's 0.05 ground clearance, so
// this suite's own transform follows the component's derivation (the assertions on
// it below are what pin the value).
const ARENA_POS: [number, number, number] = [52.34, 0, 43.8];
const ARENA_SCALE = 0.2;
/**
 * Yaw π/2 maps an ASSET-space point (lx, ly, lz) — i.e. one already carried
 * through the node matrices below — to world (lz, ly, −lx) × scale + position.
 */
const toWorldX = (lx: number, lz: number) => ARENA_POS[0] + ARENA_SCALE * lz;
const toWorldY = (ly: number) => ARENA_POS[1] + ARENA_SCALE * ly;
const toWorldZ = (lx: number) => ARENA_POS[2] - ARENA_SCALE * lx;

/**
 * Node matrices, one per mesh.  This asset's 76 nodes EACH carry the same
 * Z-up → Y-up matrix (see §A), and both three's GLTFLoader and gltf-transform
 * resolve it into the mesh's world matrix — so a primitive's own POSITION
 * attribute is in the authored Z-up frame and is NOT asset space.  Every
 * measurement below multiplies this in first; skipping it silently reports the
 * model in the wrong frame (the mistake this suite was committed with).
 */
const NODE_MATRIX = new Map<string, ArrayLike<number>>();
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (mesh) NODE_MATRIX.set(mesh.getName(), node.getWorldMatrix());
}

/** Apply one node's column-major 4×4 to a point. */
function applyNode(name: string, x: number, y: number, z: number): [number, number, number] {
  const m = NODE_MATRIX.get(name)!;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

interface Bounds {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
  vertices: number;
}

/** World-space bounds of one named mesh, from its primitives' own positions. */
function meshBounds(name: string): Bounds {
  const mesh = doc.getRoot().listMeshes().find((m) => m.getName() === name);
  if (!mesh) throw new Error(`mesh ${name} not found`);
  const b: Bounds = {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity,
    vertices: 0,
  };
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const a = pos.getArray();
    if (!a) continue;
    b.vertices += pos.getCount();
    for (let i = 0; i < pos.getCount(); i++) {
      const [qx, qy, qz] = applyNode(name, a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
      const wx = toWorldX(qx, qz);
      const wy = toWorldY(qy);
      const wz = toWorldZ(qx);
      if (wx < b.minX) b.minX = wx;
      if (wx > b.maxX) b.maxX = wx;
      if (wy < b.minY) b.minY = wy;
      if (wy > b.maxY) b.maxY = wy;
      if (wz < b.minZ) b.minZ = wz;
      if (wz > b.maxZ) b.maxZ = wz;
    }
  }
  return b;
}

const SHELL = meshBounds('Marble_01');
const TRACK = meshBounds('Sand_00');
const CARCERES = meshBounds('Travertine_25');
const ARCH = meshBounds('Travertine_30');

/** Every vertex of the whole asset, in world space. */
const CLOUD: number[][] = [];
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const a = pos.getArray();
    if (!a) continue;
    for (let i = 0; i < pos.getCount(); i++) {
      const [qx, qy, qz] = applyNode(mesh.getName(), a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
      CLOUD.push([toWorldX(qx, qz), toWorldY(qy), toWorldZ(qx)]);
    }
  }
}
const SILHOUETTE = CLOUD.filter((p) => p[1] <= 4.5);

/** Measured silhouette extremes in a ±window about a Z value. */
function silhouetteAt(z: number, window = 0.6): { minX: number; maxX: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of SILHOUETTE) {
    if (p[2] < z - window || p[2] > z + window) continue;
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
  }
  return { minX, maxX };
}

// ─────────────────────────────────────────────────────────────────────────
// Every triangle of the shipping asset, in world space.
// ─────────────────────────────────────────────────────────────────────────

interface Tri {
  a: number[]; b: number[]; c: number[];
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

const TRI: Tri[] = [];
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const a = pos.getArray();
    if (!a) continue;
    const n = pos.getCount();
    const idx = prim.getIndices();
    const ia = idx ? idx.getArray() : null;
    const W: number[][] = [];
    for (let i = 0; i < n; i++) {
      const [qx, qy, qz] = applyNode(mesh.getName(), a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
      W.push([toWorldX(qx, qz), toWorldY(qy), toWorldZ(qx)]);
    }
    const triCount = (ia ? ia.length : n) / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = ia ? ia[t * 3] : t * 3;
      const i1 = ia ? ia[t * 3 + 1] : t * 3 + 1;
      const i2 = ia ? ia[t * 3 + 2] : t * 3 + 2;
      const A = W[i0];
      const B = W[i1];
      const C = W[i2];
      if (!A || !B || !C) continue;
      TRI.push({
        a: A, b: B, c: C,
        minY: Math.min(A[1], B[1], C[1]),
        maxY: Math.max(A[1], B[1], C[1]),
        minZ: Math.min(A[2], B[2], C[2]),
        maxZ: Math.max(A[2], B[2], C[2]),
      });
    }
  }
}

/** Exact 3-D distance from a point to a triangle (Ericson's region method). */
function pointTriDist(px: number, py: number, pz: number, t: Tri): number {
  const [ax, ay, az] = t.a;
  const [bx, by, bz] = t.b;
  const [cx, cy, cz] = t.c;
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx = ax, qy = ay, qz = az;
  if (d1 > 0 || d2 > 0) {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v;
      } else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz;
        const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
              qx = bx + (cx - bx) * w; qy = by + (cy - by) * w; qz = bz + (cz - bz) * w;
            } else {
              const den = 1 / (va + vb + vc);
              const v = vb * den;
              const w = vc * den;
              qx = ax + abx * v + acx * w;
              qy = ay + aby * v + acy * w;
              qz = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── Probe 1: where the stone is (horizontal-ray even-odd parity) ───────────

/**
 * STONE intervals along a row, from the parity of a +X ray at height `y`.
 * Crossings closer together than 1e-3 are merged first: this asset carries
 * coincident faces (the shell's arc bands share their radii), and two surfaces
 * occupying the same plane are one boundary, not two.
 */
function stoneIntervals(z: number, y: number, x0: number, x1: number): Array<[number, number]> {
  const xs: number[] = [];
  for (const t of TRI) {
    if (z < t.minZ - 1e-9 || z > t.maxZ + 1e-9) continue;
    if (y < t.minY - 1e-9 || y > t.maxY + 1e-9) continue;
    const [ax, ay, az] = t.a;
    const [bx, by, bz] = t.b;
    const [cx, cy, cz] = t.c;
    const d1 = (y - by) * (az - bz) - (ay - by) * (z - bz);
    const d2 = (y - cy) * (bz - cz) - (by - cy) * (z - cz);
    const d3 = (y - ay) * (cz - az) - (cy - ay) * (z - az);
    if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    if (Math.abs(nx) < 1e-12) continue;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    xs.push((nx * ax + ny * ay + nz * az - ny * y - nz * z) / nx);
  }
  xs.sort((p, q) => p - q);
  const c: number[] = [];
  for (const v of xs) if (!c.length || Math.abs(v - c[c.length - 1]) > 1e-3) c.push(v);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < c.length; i += 2) {
    const a = Math.max(c[i], x0);
    const b = Math.min(c[i + 1], x1);
    if (b > a + 1e-9) out.push([a, b]);
  }
  return out;
}

/** RENDERED OPENINGS — the free X-intervals between the stone of a row. */
function openings(z: number, y: number, x0: number, x1: number): Array<[number, number]> {
  const stone = stoneIntervals(z, y, x0 - 1, x1 + 1);
  const out: Array<[number, number]> = [];
  let prev = x0;
  for (const [a, b] of stone) {
    if (a - prev > 0.001) out.push([Math.max(prev, x0), Math.min(a, x1)]);
    prev = b;
  }
  if (x1 - prev > 0.001) out.push([Math.max(prev, x0), x1]);
  return out.filter(([a, b]) => b > a);
}

/**
 * How deep inside rendered stone a point sits, in X, at any height in the
 * player's band — 0 when the point is standing free or lying on a surface.
 * This is the exact test for "the perimeter is never inside the stone": a
 * distance cannot separate the two sides of a face, the parity can.
 */
const BURIAL_HEIGHTS = [0.05, 0.85, 1.7];
function buriedDepth(x: number, z: number): number {
  let worst = 0;
  for (const y of BURIAL_HEIGHTS) {
    for (const [a, b] of stoneIntervals(z, y, x - 1, x + 1)) {
      if (x > a && x < b) worst = Math.max(worst, Math.min(x - a, b - x));
    }
  }
  return worst;
}

// ── Probe 2: whether the player's own body fits ────────────────────────────

/** Body-sample heights: the player's own 0.05 … 1.70 band. */
const BODY_HEIGHTS: number[] = [];
for (let y = 0.05; y <= 1.71; y += 0.15) BODY_HEIGHTS.push(y);

/** Triangles that can possibly reach a body at row z: cheap pre-filter. */
function candidatesAt(z: number, pad = 0.6): Tri[] {
  return TRI.filter((t) => t.maxY >= -0.2 && t.minY <= 2.2 && t.minZ < z + pad && t.maxZ > z - pad);
}

/** Does an `r`-radius, 1.70-tall body stand clear of all rendered stone here? */
function bodyFits(cands: Tri[], x: number, z: number, r = PLAYER_RADIUS): boolean {
  for (const y of BODY_HEIGHTS) {
    for (const t of cands) {
      if (pointTriDist(x, y, z, t) < r) return false;
    }
  }
  return true;
}

/** The player-sized sweep along one row: X-intervals a 0.4-radius body can hold. */
function bodyRuns(z: number, x0: number, x1: number, step: number, r = PLAYER_RADIUS): Array<[number, number]> {
  const cands = candidatesAt(z);
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  for (let x = x0; x <= x1 + 1e-9; x += step) {
    const free = bodyFits(cands, x, z, r);
    if (free && start === null) start = x;
    if (!free && start !== null) { out.push([start, x - step]); start = null; }
  }
  if (start !== null) out.push([start, x1]);
  return out;
}

/** Rows the player must cross to enter; used for the "whole cross-section" sweeps. */
const PLAYER_SWEEP_STEP = 0.05;

/** Distance from the nearest rendered triangle to a standing body's axis. */
function nearestStone(x: number, z: number): number {
  const cands = candidatesAt(z, 0.9);
  let best = Infinity;
  for (const y of BODY_HEIGHTS) {
    for (const t of cands) {
      const d = pointTriDist(x, y, z, t);
      if (d < best) best = d;
    }
  }
  return best;
}

// ── The perimeter, and the rest of the registry ────────────────────────────
const isCircus = (c: Collider): boolean => c.id.startsWith('circus-');
const perimeter = CITY_COLLIDERS.filter(isCircus) as SegmentCollider[];
const nonCircus = CITY_COLLIDERS.filter((c) => !isCircus(c));

const driven = (
  start: [number, number, number],
  dir: [number, number],
  steps: number,
): [number, number, number][] => {
  const path: [number, number, number][] = [start];
  let pos = start;
  let blocked = 0;
  for (let i = 0; i < steps; i++) {
    const next = resolveCityMovement(pos, dir[0], dir[1], 3.8, 0.1);
    blocked = next[0] === pos[0] && next[2] === pos[2] ? blocked + 1 : 0;
    pos = next;
    path.push(pos);
    if (blocked > 5) break;
  }
  return path;
};

const clearOf = (path: [number, number, number][]) => {
  for (const p of path) {
    expect(collidesWith(p[0], p[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  }
};

/** The arena floor: the sand slab's own footprint, shrunk by the player radius. */
const reachesInterior = (x: number, z: number) =>
  x > 44.2 && x < 60.5 && z > -24.5 && z < 43.6;

/**
 * The carceres apron: the band immediately south of the ring's closed front
 * face, from which that entrance is approached.  C-8.64A wrote these drives as
 * `CARCERES_APRON_Z`, because the district band's own south limit
 * then WAS the apron (46.00 + 1.5 = 47.5).  C-8.64B extended the band south to
 * the forecourt parapet's outer face (55.0), so the apron is stated here from
 * the geometry it is named after — the carceres' front face plus the same 1.5
 * the C-8.64A record measured it at — rather than from a boundary the district
 * has since moved past.
 */
const CARCERES_APRON_Z = CIRCUS_CARCERES_FRONT_Z + 1.5; // 47.5

const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

// ══════════════════════════════════════════════════════════════════════════
// A. Placement and measured footprint
// ══════════════════════════════════════════════════════════════════════════

describe('A. Placement and footprint', () => {
  test('the component mounts the asset at the approved transform', () => {
    expect(arenaSrc).toContain("'/_workspace_arena.glb'");
    // C-8.69B: the Y is no longer a literal — it is the ground plane plus the phase's
    // clearance — so the pin is the derivation, its operands, and the X/Z literals.
    expect(arenaSrc).toContain('export const CIRCUS_ARENA_GROUND_CLEARANCE = 0.05;');
    expect(arenaSrc).toContain('GROUND_PLANE_ELEVATION_Y + CIRCUS_ARENA_GROUND_CLEARANCE');
    expect(arenaSrc).toContain('52.34,');
    expect(arenaSrc).toContain('43.8,');
    expect(arenaSrc).toContain('Math.PI / 2');
    expect(arenaSrc).toContain('= 0.2;');
    expect(sceneSrc).toContain('<EastCircusArena />');
    expect(ARENA_POS).toEqual([52.34, 0, 43.8]);
    // …and that Y really is the ground plane lifted by the phase's 0.05 clearance.
    expect(ARENA_POS[1] - GROUND_PLANE_ELEVATION_Y).toBe(0.05);
    expect(ARENA_SCALE).toBe(0.2);
  });

  test('every node carries the asset\u2019s own Z-up \u2192 Y-up matrix, which the loader applies', () => {
    const jsonLength = GLB_BYTES.readUInt32LE(12);
    const gltf = JSON.parse(GLB_BYTES.subarray(20, 20 + jsonLength).toString('utf8'));
    expect(gltf.nodes.length).toBe(76);
    // ONE matrix, carried identically by all 76 nodes — the Z-up → Y-up
    // correction, column-major [1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1], which
    // maps authored (x, y, z) to asset (x, z, −y).  It is NOT identity, so the
    // POSITION attribute is not asset space and §A's figures are only reachable
    // with it multiplied in.  (The suite was committed asserting the opposite —
    // that every node was untransformed — and every measurement it made was
    // consequently in the wrong frame.)
    const expected = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
    const round = (v: number) => Number(v.toFixed(9));
    for (const node of gltf.nodes) {
      expect(node.translation).toBeUndefined();
      expect(node.rotation).toBeUndefined();
      expect(node.scale).toBeUndefined();
      expect(node.matrix.map(round)).toEqual(expected);
    }
    // …and gltf-transform, like three, resolves it into each mesh's world matrix.
    expect(NODE_MATRIX.size).toBe(76);
    for (const mesh of doc.getRoot().listMeshes()) {
      expect(Array.from(NODE_MATRIX.get(mesh.getName())!).map(round)).toEqual(expected);
    }
  });

  test('the shell is the recorded 27.92 × 73.96 footprint', () => {
    expect(near(SHELL.minX, CIRCUS_WEST_X)).toBe(true);
    expect(near(SHELL.maxX, CIRCUS_EAST_X)).toBe(true);
    expect(near(SHELL.maxZ, CIRCUS_SOUTH_Z)).toBe(true);
    expect(near(SHELL.minZ, CIRCUS_NORTH_END_Z, 0.01)).toBe(true);
    expect(SHELL.maxX - SHELL.minX).toBeCloseTo(27.92, 1);
    expect(SHELL.maxZ - SHELL.minZ).toBeCloseTo(73.957, 2);
  });

  test('the track surface clears the city ground plane by the C-8.69B clearance', () => {
    // Sand_00's top face is the walk plane of the whole arena interior.  C-8.63/
    // C-8.64A placed it exactly ON the ground plane, which made the arena's floor
    // coplanar with the ground plane that also runs underneath the arena; C-8.69B
    // lifts the whole arena by the 0.05 clearance this project gives a
    // ground-contact surface, so the two can no longer be resolved against each
    // other.
    expect(TRACK.maxY).toBeCloseTo(GROUND_PLANE_ELEVATION_Y + 0.05, 4);
    expect(TRACK.maxY - GROUND_PLANE_ELEVATION_Y).toBeCloseTo(0.05, 4);
    expect(TRACK.minY).toBeCloseTo(-0.2, 4);
    expect(GROUND_PLANE_ELEVATION_Y).toBe(-0.05);
    // …and the track really is the arena's floor, not a sliver.
    expect(TRACK.maxX - TRACK.minX).toBeCloseTo(16.8, 1);
  });

  test('the whole arena stands on the existing ground plane', () => {
    // No ground change was needed: the plane already covers the district.
    expect(GROUND_PLANE_EAST_X).toBeGreaterThanOrEqual(66.344);
    expect(GROUND_PLANE_SOUTH_Z).toBeGreaterThanOrEqual(46.0);
  });

  test('the carceres block and the triumphal arch are where the measurements put them', () => {
    expect(near(CARCERES.minX, CIRCUS_CARCERES_WEST_X)).toBe(true);
    expect(near(CARCERES.maxX, CIRCUS_CARCERES_EAST_X)).toBe(true);
    expect(near(CARCERES.minZ, CIRCUS_SOUTH_Z)).toBe(true);
    expect(near(CARCERES.maxZ, CIRCUS_CARCERES_FRONT_Z)).toBe(true);
    expect(near(ARCH.minX, CIRCUS_ARCH_WEST_X)).toBe(true);
    expect(near(ARCH.maxX, CIRCUS_ARCH_EAST_X)).toBe(true);
    // The arch is centred on the arena's axis, and it is an INTERIOR monument:
    // its own north face stands 4.6 south of the outline's shoulder, well inside
    // the closed ring.
    expect(ARCH.minX + ARCH.maxX).toBeCloseTo(2 * CIRCUS_AXIS_X, 2);
    expect(ARCH.maxX - ARCH.minX).toBeCloseTo(5.0, 2);
    expect(CARCERES.minX + CARCERES.maxX).toBeCloseTo(2 * CIRCUS_AXIS_X, 2);
    expect(ARCH.maxZ).toBeLessThan(CIRCUS_NORTH_END_Z + 8);
  });

  test('the asset keeps its eight materials and its one UV set', () => {
    expect(doc.getRoot().listMaterials().length).toBe(8);
    expect(doc.getRoot().listTextures().length).toBe(8);
    const names = doc.getRoot().listMaterials().map((m) => m.getName()).sort();
    expect(names).toEqual(['Awning', 'Bronze', 'Granite', 'Marble', 'Sand', 'Travertine', 'Water', 'Wood']);
    const uvSets = new Set<string>();
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        uvSets.add(prim.listSemantics().filter((s) => s.startsWith('TEXCOORD')).join('+'));
      }
    }
    expect([...uvSets]).toEqual(['TEXCOORD_0']);
  });

  test('the component preserves the asset (no geometry, material or clone surgery)', () => {
    // Comments are stripped first: the component's docstring discusses
    // `clone()` and texture wrapping in prose, and a negative assertion has to
    // be about the code rather than the words explaining it.
    const code = arenaSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('clone(');
    expect(code).not.toContain('new THREE.MeshStandardMaterial');
    expect(code).not.toContain('.material =');
    expect(code).not.toContain('wrapS');
    expect(code).not.toContain('geometry.set');
    // …and it documents why the authored UV tiling survives the loader: the GLB
    // carries no samplers, so GLTFLoader's own RepeatWrapping default applies.
    expect(arenaSrc).toContain('RepeatWrapping');
    const jsonLength = GLB_BYTES.readUInt32LE(12);
    const gltf = JSON.parse(GLB_BYTES.subarray(20, 20 + jsonLength).toString('utf8'));
    expect(gltf.samplers ?? []).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The perimeter registry
// ══════════════════════════════════════════════════════════════════════════

describe('B. The perimeter registry', () => {
  test('31 segments, all unique, all inside the registry', () => {
    // Six straights (the two south-face halves, the two carceres cheeks, the
    // two flanks) + the carceres' front face + one chord per gap of the
    // 13-point west outline, mirrored onto the east: 7 + 2 × 12 = 31.
    expect(perimeter.length).toBe(31);
    const ids = perimeter.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CITY_COLLIDERS.length).toBe(nonCircus.length + perimeter.length);
    expect(ids).toContain('circus-flank-w');
    expect(ids).toContain('circus-oval-e-11');
    expect(ids).toContain('circus-carceres-front');
    expect(ids.filter((id) => id.startsWith('circus-oval-w-')).length).toBe(12);
  });

  test('the ring is CLOSED — not one dangling end', () => {
    const ends = new Map<string, number>();
    for (const c of perimeter) {
      for (const key of [`${c.x1.toFixed(3)}:${c.z1.toFixed(3)}`, `${c.x2.toFixed(3)}:${c.z2.toFixed(3)}`]) {
        ends.set(key, (ends.get(key) ?? 0) + 1);
      }
    }
    // Every endpoint is shared by exactly two segments — the two cap chords meet
    // on the arena's axis at their apex, so the mirror is exact and no opening
    // remains.  That is the whole point of the entrance correction.
    const dangling = [...ends.entries()].filter(([, n]) => n === 1).map(([k]) => k);
    expect(dangling).toEqual([]);
    for (const [, n] of ends) expect(n).toBe(2);

    // …and the closure really is the cap: exactly two chords end on the axis,
    // one from each side, meeting at the same apex point.
    const [apexX, apexZ] = CIRCUS_WEST_OUTLINE[CIRCUS_WEST_OUTLINE.length - 1];
    expect(near(apexX, CIRCUS_AXIS_X, 1e-9)).toBe(true);
    let atApex = 0;
    for (const c of perimeter) {
      if (near(c.x1, apexX, 1e-9) && near(c.z1, apexZ, 1e-9)) atApex++;
      if (near(c.x2, apexX, 1e-9) && near(c.z2, apexZ, 1e-9)) atApex++;
    }
    expect(atApex).toBe(2);
  });

  test('the two flanks sit exactly on the shell\'s rendered radii', () => {
    const west = perimeter.find((c) => c.id === 'circus-flank-w')!;
    const east = perimeter.find((c) => c.id === 'circus-flank-e')!;
    expect([west.x1, west.x2]).toEqual([CIRCUS_WEST_X, CIRCUS_WEST_X]);
    expect([east.x1, east.x2]).toEqual([CIRCUS_EAST_X, CIRCUS_EAST_X]);
    expect(west.z1).toBe(CIRCUS_SOUTH_Z);
    expect(west.z2).toBe(CIRCUS_OVAL_START_Z);
    expect(near(west.x1, SHELL.minX)).toBe(true);
    expect(near(east.x1, SHELL.maxX)).toBe(true);
  });

  test('every west-profile point stands on or outside the measured silhouette', () => {
    // The silhouette rule is about the west PROFILE — the cap's two points are
    // on the tip's own curve, where the west boundary at a given Z is far to the
    // west, and they are checked against the ground stone in their own test.
    for (const [x, z] of CIRCUS_WEST_OUTLINE.slice(0, -2)) {
      const { minX } = silhouetteAt(z);
      expect(x).toBeLessThanOrEqual(minX + 0.02);
    }
    for (const c of perimeter) {
      const west = c.id.includes('-w-');
      const east = c.id.includes('-e-');
      if (!west && !east) continue;
      // The cap chords are the two the outline's last point closes: they run
      // across the tip's own curve, where the west boundary at their Z is far
      // west, so the west-profile rule does not apply to them.
      if (c.id.endsWith('-11')) continue;
      const midX = (c.x1 + c.x2) / 2;
      const midZ = (c.z1 + c.z2) / 2;
      const { minX, maxX } = silhouetteAt(midZ);
      // Chords are convex combinations of silhouette points; the documented
      // worst departure is 0.56 and the slack below is 0.65.
      if (west) expect(midX).toBeLessThanOrEqual(minX + 0.65);
      else expect(midX).toBeGreaterThanOrEqual(maxX - 0.65);
    }
  });

  test('no perimeter point is inside rendered stone', () => {
    // "On or outside, never inside": every sampled point of every perimeter
    // segment lies on a rendered surface or in the open, measured by the parity
    // probe (a distance cannot tell the two sides of a face apart).  This is the
    // rule that keeps the player from being stopped inside the stone — the
    // straight pieces are additionally pinned to the measured faces themselves,
    // exact to the mesh bounds, in the test below.
    // The chord run is the one the parity can judge: the straight pieces lie in
    // the exact planes of the rendered faces (the south face, the flanks, the
    // carceres' own front and cheeks), where a row ON the face is degenerate for
    // any ray test — they are pinned to those faces themselves, exactly, in the
    // test below.
    let checked = 0;
    for (const c of perimeter.filter((s) => s.id.includes('-w-') || s.id.includes('-e-'))) {
      const len = Math.hypot(c.x2 - c.x1, c.z2 - c.z1);
      const steps = Math.max(2, Math.ceil(len / 1.0));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = c.x1 + (c.x2 - c.x1) * t;
        const z = c.z1 + (c.z2 - c.z1) * t;
        const depth = buriedDepth(x, z);
        expect({ id: c.id, x: +x.toFixed(2), z: +z.toFixed(2), depth: +depth.toFixed(3) })
          .toMatchObject({ depth: expect.any(Number) });
        expect(depth).toBeLessThanOrEqual(0.02);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  }, 30000);

  test('the south face and the carceres block are on the rendered faces', () => {
    const southW = perimeter.find((c) => c.id === 'circus-south-w')!;
    const southE = perimeter.find((c) => c.id === 'circus-south-e')!;
    for (const c of [southW, southE]) {
      expect(c.z1).toBe(CIRCUS_SOUTH_Z);
      expect(c.z2).toBe(CIRCUS_SOUTH_Z);
    }
    expect(near(southW.x2, CARCERES.minX)).toBe(true);
    expect(near(southE.x2, CARCERES.maxX)).toBe(true);
    for (const id of ['circus-carceres-w', 'circus-carceres-e']) {
      const c = perimeter.find((s) => s.id === id)!;
      expect(c.x1).toBe(c.x2);
      expect(near(c.z1, CARCERES.minZ)).toBe(true);
      expect(near(c.z2, CARCERES.maxZ)).toBe(true);
    }
    // The front segment lies ON the block's own face plane (Travertine_25's
    // Z 46.00) and spans exactly the arcade's width.
    const front = perimeter.find((c) => c.id === 'circus-carceres-front')!;
    expect(front.z1).toBe(CIRCUS_CARCERES_FRONT_Z);
    expect(front.z2).toBe(CIRCUS_CARCERES_FRONT_Z);
    expect(near(front.z1, CARCERES.maxZ)).toBe(true);
    expect(near(front.x1, CARCERES.minX)).toBe(true);
    expect(near(front.x2, CARCERES.maxX)).toBe(true);
  });

  test('the north cap is laid in open air NORTH of the tip', () => {
    const capIds = ['circus-oval-w-11', 'circus-oval-e-11'];
    for (const id of capIds) {
      const c = perimeter.find((s) => s.id === id)!;
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = c.x1 + (c.x2 - c.x1) * t;
        const z = c.z1 + (c.z2 - c.z1) * t;
        // Every sample is a full player radius clear of the rendered stone…
        expect({ id, x: +x.toFixed(2), z: +z.toFixed(2), fits: bodyFits(candidatesAt(z), x, z) })
          .toMatchObject({ fits: true });
        // …and north of the shell's own north extreme.
        expect(z).toBeLessThan(CIRCUS_NORTH_END_Z);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. What the rendered geometry actually offers at each end
// ══════════════════════════════════════════════════════════════════════════

describe('C. The rendered entrances, measured', () => {
  test('the carceres arcade is twelve through-openings of ~0.50, none player-sized', () => {
    // Probe 1: the stone intervals at the arcade's own mid-line, and the
    // openings between them.
    const stone = stoneIntervals(45.5, 0.5, CIRCUS_CARCERES_WEST_X, CIRCUS_CARCERES_EAST_X);
    expect(near(stone[0][0], CARCERES.minX)).toBe(true);
    expect(near(stone[stone.length - 1][1], CARCERES.maxX)).toBe(true);
    const gaps = openings(45.5, 0.5, CIRCUS_CARCERES_WEST_X, CIRCUS_CARCERES_EAST_X);
    expect(gaps.length).toBe(12);
    for (const [a, b] of gaps) {
      expect(b - a).toBeGreaterThan(0.44);
      expect(b - a).toBeLessThan(0.56);
      // …every one narrower than the player's own diameter.
      expect(b - a).toBeLessThan(2 * PLAYER_RADIUS);
    }
    // The audited pitch 1.35 and first opening: the first starts at 44.66.
    expect(near(gaps[0][0], 44.66, 0.03)).toBe(true);
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i][0] - gaps[i - 1][0]).toBeCloseTo(1.35, 1);
    }
  });

  test('the whole carceres cross-section blocks a player-sized sweep', () => {
    // Probe 2, every row the player must cross to get through the block — from
    // its front face (Z 46.00) to its back (Z 43.80), over the arcade's full
    // width.  Not one row admits a 0.4-radius body anywhere.
    for (const z of [45.98, 45.9, 45.5, 45.0, 44.5, 44.0]) {
      expect({
        z,
        runs: bodyRuns(z, CIRCUS_CARCERES_WEST_X, CIRCUS_CARCERES_EAST_X, PLAYER_SWEEP_STEP),
      }).toMatchObject({ runs: [] });
    }
    // …and the same sweep is FREE on the apron half a unit south of the face, so
    // the blocking is the block's own stone and not a broad-brush sweep.
    expect(bodyRuns(46.5, CIRCUS_CARCERES_WEST_X, CIRCUS_CARCERES_EAST_X, PLAYER_SWEEP_STEP).length)
      .toBeGreaterThan(0);
  }, 30000);

  test('the openings close up with height, so even a half-size body is refused', () => {
    // The sweep rejects the twelve openings for their WIDTH (0.49 against the
    // player's 0.80).  They are narrower still higher up: at the top of the
    // player's own band the spandrel leaves only the audited 0.280, below even
    // half the player's diameter — the rendered gaps are real, and they are
    // real everywhere too small.
    const high = openings(45.5, 1.3, CIRCUS_CARCERES_WEST_X, CIRCUS_CARCERES_EAST_X);
    expect(high.length).toBe(12);
    for (const [a, b] of high) {
      expect(b - a).toBeLessThan(0.4);
      expect(b - a).toBeLessThan(2 * PLAYER_RADIUS);
    }
    // …and they are the same twelve openings, not a different set higher up:
    // each one's centre falls inside a low opening, and each low opening's
    // centre falls inside one of them.
    const low = openings(45.5, 0.5, CIRCUS_CARCERES_WEST_X, CIRCUS_CARCERES_EAST_X);
    expect(low.length).toBe(12);
    const covers = (set: Array<[number, number]>, v: number) =>
      set.some(([a, b]) => v > a - 0.06 && v < b + 0.06);
    for (const [a, b] of high) expect(covers(low, (a + b) / 2)).toBe(true);
    for (const [a, b] of low) expect(covers(high, (a + b) / 2)).toBe(true);
  }, 30000);

  test('the sphendone\'s north mouth is stone, not a passage', () => {
    // Probe 1: at the tip's own shoulder the mass is continuous across the whole
    // mouth — one interval, more than seven and a half units wide.
    const mid = stoneIntervals(-29.5, 0.5, 48.0, 56.7);
    expect(mid.length).toBe(1);
    expect(mid[0][1] - mid[0][0]).toBeGreaterThan(7.5);
    // Where the tip tapers, its outer span is still one mass and every void
    // inside it is sealed by that mass on both sides — a chamber, not a way
    // through.  The mouth's outermost stone runs at that row:
    const taper = stoneIntervals(-29.7, 0.5, 48.0, 56.7);
    const outerStart = taper[0][0];
    const outerEnd = taper[taper.length - 1][1];
    expect(outerEnd - outerStart).toBeGreaterThan(6.5);
    for (const [a, b] of openings(-29.7, 0.5, 48.38, 56.3)) {
      // Either a sub-player sliver, or a void walled in by the tip's own stone
      // on both sides — a chamber, which is not a way through.
      const sealedByStone =
        taper.some(([, s2]) => Math.abs(s2 - a) < 0.01) &&
        taper.some(([s1]) => Math.abs(s1 - b) < 0.01);
      expect(b - a < 2 * PLAYER_RADIUS || sealedByStone).toBe(true);
    }
    // …and the player-sized sweep across the whole mouth band finds nothing.
    for (const z of [-29.7, -29.5, -29.0, -28.5, -28.0]) {
      expect({
        z,
        runs: bodyRuns(z, 48.38, 56.3, PLAYER_SWEEP_STEP),
      }).toMatchObject({ runs: [] });
    }
    // The row is genuinely free outside the mouth, so the sweep is not simply
    // empty for want of geometry.
    expect(bodyRuns(-30.4, 44.0, 48.0, PLAYER_SWEEP_STEP).length).toBeGreaterThan(0);
  }, 30000);

  test('the flank and south-face stone blocks the same sweep', () => {
    for (const z of [40, 30, 20, 10, 0, -10, -16]) {
      // On the face, and a third of a unit inside it: blocked.
      expect({ z, w: bodyFits(candidatesAt(z), CIRCUS_WEST_X, z) }).toMatchObject({ w: false });
      expect({ z, w: bodyFits(candidatesAt(z), CIRCUS_WEST_X + 0.3, z) }).toMatchObject({ w: false });
      expect({ z, w: bodyFits(candidatesAt(z), CIRCUS_EAST_X, z) }).toMatchObject({ w: false });
      expect({ z, w: bodyFits(candidatesAt(z), CIRCUS_EAST_X - 0.3, z) }).toMatchObject({ w: false });
      // …and free half a unit outside it, which is where the player walks.
      expect({ z, w: bodyFits(candidatesAt(z), CIRCUS_WEST_X - 0.6, z) }).toMatchObject({ w: true });
      expect({ z, w: bodyFits(candidatesAt(z), CIRCUS_EAST_X + 0.6, z) }).toMatchObject({ w: true });
    }
    // The south face is stone between the carceres cheeks and the corners.
    for (const x of [40, 42.5, 63.5, 65]) {
      expect({ x, w: bodyFits(candidatesAt(CIRCUS_SOUTH_Z), x, CIRCUS_SOUTH_Z) })
        .toMatchObject({ w: false });
    }
  }, 30000);
});

// ══════════════════════════════════════════════════════════════════════════
// D. The driven route
// ══════════════════════════════════════════════════════════════════════════

describe('D. Driven routes with the real resolver', () => {
  test('from the southern apron the walk is stopped outside the block', () => {
    const path = driven([CIRCUS_AXIS_X, 0, CARCERES_APRON_Z], [0, -1], 40);
    const last = path[path.length - 1];
    expect(last[2]).toBeGreaterThanOrEqual(CIRCUS_CARCERES_FRONT_Z);
    expect(last[2]).toBeLessThan(CIRCUS_ENVELOPE_Z_MAX);
    clearOf(path);
  });

  test('from the north the walk is stopped outside the cap', () => {
    const path = driven([CIRCUS_AXIS_X, 0, CIRCUS_ENVELOPE_Z_MIN + 0.5], [0, 1], 40);
    const last = path[path.length - 1];
    expect(last[2]).toBeLessThan(CIRCUS_NORTH_END_Z);
    expect(last[2]).toBeGreaterThan(CIRCUS_ENVELOPE_Z_MIN);
    clearOf(path);
  });

  test('every approach is stopped outside the ring and never inside rendered stone', () => {
    const starts: Array<[string, number, number, number, number]> = [
      ['apron S', CIRCUS_AXIS_X, CARCERES_APRON_Z, 0, -1],
      ['apron S west', 41.0, CARCERES_APRON_Z, 0, -1],
      ['apron S east', 64.0, CARCERES_APRON_Z, 0, -1],
      ['west flank', CIRCUS_ENVELOPE_Z_MIN + 3, 20.0, 1, 0],
      ['west flank N', 31.5, -10.0, 1, 0],
      ['east flank', CIRCUS_ENVELOPE_X_EAST - 0.5, 20.0, -1, 0],
      ['east flank N', CIRCUS_ENVELOPE_X_EAST - 0.5, -10.0, -1, 0],
      ['north tip', CIRCUS_AXIS_X, CIRCUS_ENVELOPE_Z_MIN + 0.5, 0, 1],
      ['NE diagonal', 65.0, CIRCUS_ENVELOPE_Z_MIN + 2, -0.6, 0.8],
      ['NW diagonal', 40.0, CIRCUS_ENVELOPE_Z_MIN + 2, 0.6, 0.8],
    ];
    for (const [name, sx, sz, dx, dz] of starts) {
      expect({ name, collidesAtStart: collidesWith(sx, sz, PLAYER_RADIUS, CITY_COLLIDERS) })
        .toMatchObject({ collidesAtStart: false });
      const path = driven([sx, 0, sz], [dx, dz], 260);
      for (const [x, , z] of path) {
        // Never inside rendered stone…
        expect({ name, x: +x.toFixed(2), z: +z.toFixed(2), insideStone: !bodyFits(candidatesAt(z), x, z) })
          .toMatchObject({ insideStone: false });
        // …and never on the arena floor, which is what the closed ring buys.
        expect({ name, x: +x.toFixed(2), z: +z.toFixed(2), interior: reachesInterior(x, z) })
          .toMatchObject({ interior: false });
      }
      clearOf(path);
    }
  }, 30000);

  test('the whole arena can still be walked round on the outside', () => {
    // East along the southern apron, then north up the east flank to the tip.
    const east = driven([36.0, 0, CARCERES_APRON_Z], [1, 0], 120);
    expect(east[east.length - 1][0]).toBeGreaterThan(CIRCUS_EAST_X);
    clearOf(east);
    const north = driven(
      [CIRCUS_ENVELOPE_X_EAST - 0.45, 0, CARCERES_APRON_Z], [0, -1], 300);
    expect(north[north.length - 1][2]).toBeLessThan(CIRCUS_NORTH_END_Z + 1);
    clearOf(north);
  }, 30000);

  test('the west flank stops a straight walk east out of the city', () => {
    const path = driven([30.0, 0, 20.0], [1, 0], 200);
    const last = path[path.length - 1];
    // Z 20 is inside the district band, so the city's own +X clamp no longer
    // applies on this line: the walk runs past BOUNDARY_X and is stopped by the
    // flank itself.  The resolver accepts a step only where its landing point is
    // a full radius clear, so a walk blocked by a wall stops within one 0.38
    // step of the contact distance — never past it.
    const contact = CIRCUS_WEST_X - PLAYER_RADIUS;
    expect(last[0]).toBeGreaterThan(BOUNDARY_X);
    expect(last[0]).toBeLessThan(CIRCUS_WEST_X);
    expect(last[0]).toBeGreaterThan(contact - 0.38);
    expect(collidesWith(CIRCUS_WEST_X, 20, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
    clearOf(path);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The movement envelope
// ══════════════════════════════════════════════════════════════════════════

describe('E. The movement envelope', () => {
  test('the city square is bit-for-bit what it was', () => {
    expect(BOUNDARY_X).toBe(35);
    expect(BOUNDARY_Z_MAX).toBe(35);
    expect(BOUNDARY_Z_MIN).toBe(-101);
  });

  test('the district band is the smallest rectangle the district needs', () => {
    expect(CIRCUS_ENVELOPE_X_EAST).toBe(67.5);
    expect(CIRCUS_ENVELOPE_Z_MIN).toBe(-35.0);
    // South: C-8.64A set this limit to the carceres apron (46.00 + 1.5 = 47.5);
    // C-8.64B extended the band south to the forecourt parapet's outer face
    // (55.0), which now IS the district's own southern limit.  The city square's
    // own Z band is untouched by either.
    expect(CIRCUS_ENVELOPE_Z_MAX).toBe(55.0);
    expect(CIRCUS_ENVELOPE_Z_MAX).toBeGreaterThan(CARCERES_APRON_Z);
    // East: the arena's own east wall + 1.2, so the whole building is inside.
    expect(CIRCUS_ENVELOPE_X_EAST).toBeCloseTo(CIRCUS_EAST_X + 1.2, 6);
    // North: the shell's tip less 4.84, which also clears the cap's apex.
    expect(CIRCUS_ENVELOPE_Z_MIN).toBeLessThan(CIRCUS_NORTH_END_Z - 4);
    expect(CIRCUS_ENVELOPE_Z_MIN).toBeLessThan(-30.65);
  });

  test('the clamps keep the city square outside the district band', () => {
    // Outside the band means Z < −35.0 or Z > the band's own south edge; 40.0
    // sits INSIDE it (the band contains the city's whole +Z extent), so the
    // boundary to test the city square against is the band's own south edge.
    expect(clampBoundaryX(34 + 3.8, CIRCUS_ENVELOPE_Z_MAX + 5)).toBe(35);
    expect(clampBoundaryX(34 + 3.8, CIRCUS_ENVELOPE_Z_MIN - 5)).toBe(35);
    expect(clampBoundaryX(34 + 3.8, 0)).toBeCloseTo(37.8, 6);
    expect(clampBoundaryZ(0, 34 + 3.8)).toBe(35);
    expect(clampBoundaryZ(40, 34 + 3.8)).toBeCloseTo(37.8, 6);
    // Inside the band the district's own limit applies (a point short of it is
    // untouched)…
    expect(clampBoundaryZ(40, CIRCUS_ENVELOPE_Z_MAX - 3.8))
      .toBeCloseTo(CIRCUS_ENVELOPE_Z_MAX - 3.8, 6);
    // …and past it the same point is clamped onto the band's south edge, which
    // is what the pre-C-8.64B assertion at 47.0 + 3.8 measured for that band.
    expect(clampBoundaryZ(40, CIRCUS_ENVELOPE_Z_MAX + 3.8))
      .toBeCloseTo(CIRCUS_ENVELOPE_Z_MAX, 6);
    expect(clampBoundaryZ(40, CIRCUS_ENVELOPE_Z_MIN - 3.8)).toBeCloseTo(CIRCUS_ENVELOPE_Z_MIN, 6);
  });

  test('the district is reachable from the city and keeps its own limits', () => {
    const east = driven([30.0, 0, 0.0], [1, 0], 20);
    expect(east[east.length - 1][0]).toBeGreaterThan(BOUNDARY_X + 1);
    // The city's own southern limit holds west of it…
    const citySouth = driven([20.0, 0, 30.0], [0, 1], 30);
    expect(citySouth[citySouth.length - 1][2]).toBeCloseTo(BOUNDARY_Z_MAX, 6);
    // …and east of it the apron only reaches the district's own limit.
    const districtNorth = driven([CIRCUS_ENVELOPE_X_EAST - 0.45, 0, -30.0], [0, -1], 30);
    expect(districtNorth[districtNorth.length - 1][2]).toBeCloseTo(CIRCUS_ENVELOPE_Z_MIN, 6);
  });

  test('both entrances and their approaches are inside the envelope', () => {
    for (const [x, z] of [
      [CIRCUS_AXIS_X, CIRCUS_SOUTH_Z],
      [CIRCUS_AXIS_X, CIRCUS_CARCERES_FRONT_Z + 1.0],
      [CIRCUS_AXIS_X, -30.08],
      [CIRCUS_AXIS_X, CIRCUS_NORTH_END_Z - 3.0],
      [CIRCUS_AXIS_X, -30.65],
    ] as Array<[number, number]>) {
      expect(clampBoundaryX(x, z)).toBeCloseTo(x, 6);
      expect(clampBoundaryZ(x, z)).toBeCloseTo(z, 6);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. What did not move
// ══════════════════════════════════════════════════════════════════════════

describe('F. Scope guard', () => {
  test('the registry grew by exactly this phase\'s 31 segments', () => {
    // The 110 pre-existing colliders are byte-identical and this phase owns the
    // 31 `circus-*` perimeter segments; the one extra collider and rectangle are
    // Phase C-8.64B's `forecourt-parapet`, the district's only solid structure.
    expect(nonCircus.length).toBe(111); // 110 + C-8.64B's parapet
    expect(CITY_COLLIDERS.length).toBe(142); // C-8.64A's 141 + 1
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(32); // 31 + 1
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length).toBe(46);
    const ids = CITY_COLLIDERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('the other landmarks are untouched', () => {
    const byId = new Map(CITY_COLLIDERS.map((c) => [c.id, c]));
    expect(byId.get('training-hall')).toMatchObject({ cx: -30.35, cz: 3.0, hw: 1.35, hd: 3.75 });
    expect(byId.get('city-tavern')).toMatchObject({ cx: -16, cz: 14, hw: 4.45, hd: 3.85 });
    expect(byId.get('caravanserai')).toMatchObject({ cx: 16, cz: 14, hw: 4.55, hd: 4.05 });
    expect(byId.get('smithing-forge')).toMatchObject({ cx: 18, cz: 2.6, hw: 4.75, hd: 4.0 });
    expect(byId.get('fortress-south-l')).toMatchObject({ cx: -5.75, hw: 4.75, hd: 0.6 });
    const seal = byId.get('colo-gateseal-r') as SegmentCollider;
    expect(seal.x1).toBeCloseTo(2.7, 3);
    expect(seal.x2).toBeCloseTo(2.6, 3);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall-')).length).toBe(20);
  });

  test('the ground plane, the hubs and the arrivals are unchanged', () => {
    expect(GROUND_PLANE_ELEVATION_Y).toBe(-0.05);
    // C-8.64A left 20 hubs; Phase C-8.70B added the East Circus District's race
    // entry — the only circus hub, and the only circus arrival.
    expect(HUB_LOCATIONS.length).toBe(21);
    expect(HUB_LOCATIONS.filter((h) => h.id.includes('circus')).map((h) => h.id)).toEqual([
      'east_circus_arena',
    ]);
    expect(Object.keys(FAST_TRAVEL_ARRIVALS).length).toBe(21);
    expect(Object.keys(FAST_TRAVEL_ARRIVALS).filter((k) => k.includes('circus'))).toEqual([
      'east_circus_arena',
    ]);
    // Every arrival is inside the walkable envelope — the union of the city
    // square and the district band — so the shipped clamps leave it untouched
    // (the same ±BOUNDARY_X semantics for every city hub as before).
    for (const [x, z] of Object.values(FAST_TRAVEL_ARRIVALS)) {
      expect(clampBoundaryX(x, z), `x=${x} in bounds`).toBe(x);
      expect(clampBoundaryZ(x, z), `z=${z} in bounds`).toBe(z);
    }
  });

  test('the asset itself is unmodified', () => {
    expect(GLB_BYTES.byteLength).toBe(3202640);
    expect(CLOUD.length).toBeGreaterThan(60000);
    expect(doc.getRoot().listMeshes().length).toBe(76);
  });

  test('no collider was added for the seating banks, the piers or the spina', () => {
    // The interior is unreachable now, so it stays uncollided: the correction
    // closed the ring and added only the two straights that do the closing.
    const ids = perimeter.map((c) => c.id);
    expect(ids).not.toContain('circus-seating');
    expect(ids).not.toContain('circus-spina');
    expect(ids.every((id) =>
      id.startsWith('circus-south-') ||
      id.startsWith('circus-carceres-') ||
      id.startsWith('circus-flank-') ||
      id.startsWith('circus-oval-'))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. Controls
// ══════════════════════════════════════════════════════════════════════════

/** The perimeter exactly as C-8.64A's first ship left it: two open mouths. */
function preCorrectionPerimeter(): SegmentCollider[] {
  const outline = CIRCUS_WEST_OUTLINE.slice(0, CIRCUS_WEST_OUTLINE.length - 2);
  const seg = (
    id: string, x1: number, z1: number, x2: number, z2: number,
  ): SegmentCollider => ({ type: 'segment', id, x1, z1, x2, z2 });
  const mirror = (x: number) => 2 * CIRCUS_AXIS_X - x;
  return [
    seg('pre-south-w', CIRCUS_WEST_X, CIRCUS_SOUTH_Z, CIRCUS_CARCERES_WEST_X, CIRCUS_SOUTH_Z),
    seg('pre-south-e', CIRCUS_EAST_X, CIRCUS_SOUTH_Z, CIRCUS_CARCERES_EAST_X, CIRCUS_SOUTH_Z),
    seg('pre-carceres-w', CIRCUS_CARCERES_WEST_X, CIRCUS_SOUTH_Z, CIRCUS_CARCERES_WEST_X, CIRCUS_CARCERES_FRONT_Z),
    seg('pre-carceres-e', CIRCUS_CARCERES_EAST_X, CIRCUS_SOUTH_Z, CIRCUS_CARCERES_EAST_X, CIRCUS_CARCERES_FRONT_Z),
    seg('pre-flank-w', CIRCUS_WEST_X, CIRCUS_SOUTH_Z, CIRCUS_WEST_X, CIRCUS_OVAL_START_Z),
    seg('pre-flank-e', CIRCUS_EAST_X, CIRCUS_SOUTH_Z, CIRCUS_EAST_X, CIRCUS_OVAL_START_Z),
    ...outline.slice(0, -1).flatMap(([x1, z1], i) => {
      const [x2, z2] = outline[i + 1];
      return [
        seg(`pre-oval-w-${i}`, x1, z1, x2, z2),
        seg(`pre-oval-e-${i}`, mirror(x1), z1, mirror(x2), z2),
      ];
    }),
  ];
}

describe('G. Controls', () => {
  test('without the perimeter the flanks are open ground', () => {
    for (const z of [40, 20, 0, -15]) {
      expect(collidesWith(CIRCUS_WEST_X, z, PLAYER_RADIUS, nonCircus)).toBe(false);
      expect(collidesWith(CIRCUS_EAST_X, z, PLAYER_RADIUS, nonCircus)).toBe(false);
    }
    // …while the shipped registry blocks every one of them.
    for (const z of [40, 20, 0, -15]) {
      expect(collidesWith(CIRCUS_WEST_X, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
      expect(collidesWith(CIRCUS_EAST_X, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
    }
    // A wall that is genuinely elsewhere keeps blocking after the splice.
    expect(collidesWith(-30.35, 3, PLAYER_RADIUS, nonCircus)).toBe(true);
  });

  test('the pre-correction ring had two mouths, and the player walked through stone', () => {
    const old = preCorrectionPerimeter();
    expect(old.length).toBe(26);
    const ends = new Map<string, number>();
    for (const c of old) {
      for (const key of [`${c.x1.toFixed(3)}:${c.z1.toFixed(3)}`, `${c.x2.toFixed(3)}:${c.z2.toFixed(3)}`]) {
        ends.set(key, (ends.get(key) ?? 0) + 1);
      }
    }
    expect([...ends.values()].filter((n) => n === 1).length).toBe(4);

    // The defect, replayed: on the old ring the collider admitted the player
    // across the whole 18.00 carceres mouth — more than sixty collider-free
    // positions on the block's own front line — while the rendered geometry
    // offers none.  The shipped ring admits zero; not one of those positions
    // admits a body either.
    const oldRegistry: Collider[] = [...nonCircus, ...old];
    let oldFree = 0;
    let shippedFree = 0;
    let renderedFree = 0;
    for (let x = CIRCUS_CARCERES_WEST_X; x <= CIRCUS_CARCERES_EAST_X; x += 0.25) {
      if (!collidesWith(x, CIRCUS_CARCERES_FRONT_Z, PLAYER_RADIUS, oldRegistry)) oldFree++;
      if (!collidesWith(x, CIRCUS_CARCERES_FRONT_Z, PLAYER_RADIUS, CITY_COLLIDERS)) shippedFree++;
      if (bodyFits(candidatesAt(CIRCUS_CARCERES_FRONT_Z), x, CIRCUS_CARCERES_FRONT_Z)) renderedFree++;
    }
    expect(oldFree).toBeGreaterThan(60);
    expect(shippedFree).toBe(0);
    expect(renderedFree).toBe(0);
  }, 30000);

  test('with the pre-phase envelope neither entrance would be reachable', () => {
    const oldClampX = (x: number) => Math.max(-BOUNDARY_X, Math.min(BOUNDARY_X, x));
    const oldClampZ = (z: number) => Math.max(BOUNDARY_Z_MIN, Math.min(BOUNDARY_Z_MAX, z));
    // Both mouths are outside the old square, and so is the whole arena.
    expect(oldClampX(CIRCUS_AXIS_X)).toBe(BOUNDARY_X);
    expect(oldClampZ(CIRCUS_CARCERES_FRONT_Z + 1)).toBe(BOUNDARY_Z_MAX);
    expect(oldClampX(CIRCUS_ARCH_WEST_X)).toBe(BOUNDARY_X);
    expect(oldClampX(SHELL.maxX)).toBe(BOUNDARY_X);
    // The shipped clamps accept the same points.
    expect(clampBoundaryX(CIRCUS_AXIS_X, CIRCUS_SOUTH_Z)).toBeCloseTo(CIRCUS_AXIS_X, 6);
    expect(clampBoundaryZ(CIRCUS_AXIS_X, CIRCUS_CARCERES_FRONT_Z + 1)).toBeCloseTo(CIRCUS_CARCERES_FRONT_Z + 1, 6);
  });
});
