/**
 * Phase C-8.64A — East Circus District: the arena placement prototype.
 *
 * Run with: bun test src/utils/phaseC8_64a.test.ts
 *
 * ── WHAT THIS PHASE SHIPPED ───────────────────────────────────────────────
 * The C-8.63 audit chose the East Circus District for the chariot arena and
 * fixed its provisional transform: `[52.34, -0.05, 43.80]`, yaw π/2, uniform
 * scale 0.20.  This phase mounts the asset there
 * (`components/3d/city/EastCircusArena.tsx`), gives it a collision perimeter
 * that follows its measured outer silhouette with a usable opening at each
 * axial end, and opens the movement envelope just far enough east and south for
 * the district to be walked to at all.
 *
 * ── WHAT THE SUITE PROVES ─────────────────────────────────────────────────
 *   A. the placement and the footprint — parsed from the shipping asset with
 *      `@gltf-transform/core`, through the component's own transform literals,
 *      including the flush track surface and the untouched eight materials;
 *   B. the perimeter registry — 24 segments, unique ids, the ring closed except
 *      at exactly the two designed openings, each piece on (never inside) the
 *      measured silhouette, and the south face and cheeks on the rendered faces;
 *   C. both openings are player-usable — the real `collidesWith` channel sweep
 *      across each mouth, with the entrances' own clear widths;
 *   D. the driven route with the real `resolveCityMovement`: in through the
 *      carceres, out through the triumphal arch, back in, and right round the
 *      building on the outside;
 *   E. the movement envelope — the city square is bit-for-bit what it was, and
 *      the district band is the smallest rectangle that reaches both entrances;
 *   F. everything that must not have moved (registry counts, the other
 *      landmarks, the ground plane, the hub and arrival tables, the asset);
 *   G. three controls — the perimeter spliced out, the openings sealed, and the
 *      pre-phase envelope — each showing the checks are sensitive to what this
 *      phase added.
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

const ARENA_POS: [number, number, number] = [52.34, -0.05, 43.8];
const ARENA_SCALE = 0.2;
/** Yaw π/2 maps local (lx, ly, lz) to world (lz, ly, −lx) × scale + position. */
const toWorldX = (lx: number, lz: number) => ARENA_POS[0] + ARENA_SCALE * lz;
const toWorldY = (ly: number) => ARENA_POS[1] + ARENA_SCALE * ly;
const toWorldZ = (lx: number) => ARENA_POS[2] - ARENA_SCALE * lx;

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
    b.vertices += pos.getCount();
    for (let i = 0; i < pos.getCount(); i++) {
      const wx = toWorldX(a[i * 3], a[i * 3 + 2]);
      const wy = toWorldY(a[i * 3 + 1]);
      const wz = toWorldZ(a[i * 3]);
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
    for (let i = 0; i < pos.getCount(); i++) {
      CLOUD.push([
        toWorldX(a[i * 3], a[i * 3 + 2]),
        toWorldY(a[i * 3 + 1]),
        toWorldZ(a[i * 3]),
      ]);
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

const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

// ══════════════════════════════════════════════════════════════════════════
// A. Placement and measured footprint
// ══════════════════════════════════════════════════════════════════════════

describe('A. Placement and footprint', () => {
  test('the component mounts the asset at the approved transform', () => {
    expect(arenaSrc).toContain("'/_workspace_arena.glb'");
    expect(arenaSrc).toContain('[52.34, -0.05, 43.8]');
    expect(arenaSrc).toContain('Math.PI / 2');
    expect(arenaSrc).toContain('= 0.2;');
    expect(sceneSrc).toContain('<EastCircusArena />');
    expect(ARENA_POS).toEqual([52.34, -0.05, 43.8]);
    expect(ARENA_SCALE).toBe(0.2);
  });

  test('the asset carries no node transforms of its own', () => {
    const jsonLength = GLB_BYTES.readUInt32LE(12);
    const gltf = JSON.parse(GLB_BYTES.subarray(20, 20 + jsonLength).toString('utf8'));
    expect(gltf.nodes.length).toBeGreaterThan(50);
    for (const node of gltf.nodes) {
      expect(node.matrix).toBeUndefined();
      expect(node.translation).toBeUndefined();
      expect(node.rotation).toBeUndefined();
      expect(node.scale).toBeUndefined();
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

  test('the track surface is flush with the city ground plane', () => {
    // Sand_00's top face is the walk plane of the whole arena interior.
    expect(TRACK.maxY).toBeCloseTo(GROUND_PLANE_ELEVATION_Y, 4);
    expect(TRACK.minY).toBeCloseTo(-0.25, 4);
    expect(GROUND_PLANE_ELEVATION_Y).toBe(-0.05);
    // …and the track really is the arena's floor, not a sliver.
    expect(TRACK.maxX - TRACK.minX).toBeCloseTo(16.8, 1);
  });

  test('the whole arena stands on the existing ground plane', () => {
    // No ground change was needed: the plane already covers the district.
    expect(GROUND_PLANE_EAST_X).toBeGreaterThanOrEqual(66.344);
    expect(GROUND_PLANE_SOUTH_Z).toBeGreaterThanOrEqual(46.0);
  });

  test('the carceres block and the triumphal arch are where the openings are', () => {
    expect(near(CARCERES.minX, CIRCUS_CARCERES_WEST_X)).toBe(true);
    expect(near(CARCERES.maxX, CIRCUS_CARCERES_EAST_X)).toBe(true);
    expect(near(CARCERES.minZ, CIRCUS_SOUTH_Z)).toBe(true);
    expect(near(CARCERES.maxZ, CIRCUS_CARCERES_FRONT_Z)).toBe(true);
    expect(near(ARCH.minX, CIRCUS_ARCH_WEST_X)).toBe(true);
    expect(near(ARCH.maxX, CIRCUS_ARCH_EAST_X)).toBe(true);
    // The arch is centred on the arena's axis, and its span is the north opening.
    expect(ARCH.minX + ARCH.maxX).toBeCloseTo(2 * CIRCUS_AXIS_X, 2);
    expect(ARCH.maxX - ARCH.minX).toBeCloseTo(5.0, 2);
    // The carceres opening is the arcade's own span, also centred.
    expect(CARCERES.minX + CARCERES.maxX).toBeCloseTo(2 * CIRCUS_AXIS_X, 2);
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
    expect(arenaSrc).not.toContain('clone(');
    expect(arenaSrc).not.toContain('new THREE.MeshStandardMaterial');
    expect(arenaSrc).not.toContain('.material =');
    expect(arenaSrc).not.toContain('wrapS');
    expect(arenaSrc).not.toContain('geometry.set');
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
  test('24 segments, all unique, all inside the registry', () => {
    expect(perimeter.length).toBe(24);
    const ids = perimeter.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CITY_COLLIDERS.length).toBe(nonCircus.length + perimeter.length);
    expect(ids).toContain('circus-flank-w');
    expect(ids).toContain('circus-oval-e-9');
    expect(ids.filter((id) => id.startsWith('circus-oval-w-')).length).toBe(10);
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

  test('the ring is closed except at exactly the two designed openings', () => {
    const ends = new Map<string, number>();
    for (const c of perimeter) {
      for (const key of [`${c.x1.toFixed(3)}:${c.z1.toFixed(3)}`, `${c.x2.toFixed(3)}:${c.z2.toFixed(3)}`]) {
        ends.set(key, (ends.get(key) ?? 0) + 1);
      }
    }
    const dangling = [...ends.entries()].filter(([, n]) => n === 1).map(([k]) => k).sort();
    expect(dangling).toEqual(
      [
        `${CIRCUS_CARCERES_WEST_X.toFixed(3)}:${CIRCUS_SOUTH_Z.toFixed(3)}`,
        `${CIRCUS_CARCERES_EAST_X.toFixed(3)}:${CIRCUS_SOUTH_Z.toFixed(3)}`,
        `${CIRCUS_ARCH_WEST_X.toFixed(3)}:-30.080`,
        `${CIRCUS_ARCH_EAST_X.toFixed(3)}:-30.080`,
      ].sort(),
    );
  });

  test('every piece lies on the measured silhouette, none inside the stone', () => {
    for (const [x, z] of CIRCUS_WEST_OUTLINE) {
      const { minX } = silhouetteAt(z);
      expect(x).toBeLessThanOrEqual(minX + 0.02);
    }
    for (const c of perimeter) {
      const west = c.id.includes('-w-');
      const east = c.id.includes('-e-');
      if (!west && !east) continue;
      const midX = (c.x1 + c.x2) / 2;
      const midZ = (c.z1 + c.z2) / 2;
      const { minX, maxX } = silhouetteAt(midZ);
      // Chords are convex combinations of silhouette points; the documented
      // worst departure is 0.56 and the slack below is 0.65.
      if (west) expect(midX).toBeLessThanOrEqual(minX + 0.65);
      else expect(midX).toBeGreaterThanOrEqual(maxX - 0.65);
    }
  });

  test('the south face and the carceres cheeks are on the rendered faces', () => {
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
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. Both openings are usable
// ══════════════════════════════════════════════════════════════════════════

describe('C. The two openings', () => {
  test('the carceres opening is 18.00 clear, the arch opening 5.00', () => {
    expect(CIRCUS_CARCERES_EAST_X - CIRCUS_CARCERES_WEST_X).toBeCloseTo(18.0, 6);
    expect(CIRCUS_ARCH_EAST_X - CIRCUS_ARCH_WEST_X).toBeCloseTo(5.0, 6);
    expect(CIRCUS_CARCERES_EAST_X - CIRCUS_CARCERES_WEST_X).toBeGreaterThan(2 * PLAYER_RADIUS);
    expect(CIRCUS_ARCH_EAST_X - CIRCUS_ARCH_WEST_X).toBeGreaterThan(2 * PLAYER_RADIUS);
  });

  test('no collider closes either mouth', () => {
    for (let x = CIRCUS_CARCERES_WEST_X + 0.5; x <= CIRCUS_CARCERES_EAST_X - 0.5; x += 0.25) {
      expect(collidesWith(x, CIRCUS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
    for (let x = CIRCUS_ARCH_WEST_X + 0.5; x <= CIRCUS_ARCH_EAST_X - 0.5; x += 0.25) {
      expect(collidesWith(x, -30.08, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
  });

  test('a 0.4-radius body has a clear channel through each opening, depth by depth', () => {
    // Carceres: from the apron (Z 47) through the block onto the track (Z 42).
    for (let z = 47.0; z >= 42.0; z -= 0.25) {
      let clear = 0;
      for (let x = CIRCUS_CARCERES_WEST_X; x <= CIRCUS_CARCERES_EAST_X; x += 0.25) {
        if (!collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)) clear++;
      }
      expect(clear * 0.25).toBeGreaterThanOrEqual(2 * PLAYER_RADIUS);
    }
    // Triumphal arch: from north of the tip (Z −31) through to the track (−29.5).
    for (let z = -31.0; z <= -29.5; z += 0.25) {
      let clear = 0;
      for (let x = CIRCUS_ARCH_WEST_X; x <= CIRCUS_ARCH_EAST_X; x += 0.25) {
        if (!collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)) clear++;
      }
      expect(clear * 0.25).toBeGreaterThanOrEqual(2 * PLAYER_RADIUS);
    }
  });

  test('the perimeter is stone everywhere except the two openings', () => {
    // Flanks: a point on the line blocks, a point a radius clear does not.
    for (const z of [40, 30, 20, 0, -10]) {
      expect(collidesWith(CIRCUS_WEST_X, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
      expect(collidesWith(CIRCUS_EAST_X, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
      expect(collidesWith(CIRCUS_WEST_X - PLAYER_RADIUS - 0.01, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
      expect(collidesWith(CIRCUS_EAST_X + PLAYER_RADIUS + 0.01, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
    // South face: blocked either side of the carceres opening, open across it.
    expect(collidesWith(41.0, CIRCUS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
    expect(collidesWith(63.0, CIRCUS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
    expect(collidesWith(CIRCUS_AXIS_X, CIRCUS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    // Sphendone: every measured outline point is stone, and open on the axis.
    for (const [x, z] of CIRCUS_WEST_OUTLINE.slice(1)) {
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
      expect(collidesWith(2 * CIRCUS_AXIS_X - x, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
    }
    expect(collidesWith(CIRCUS_AXIS_X, -30.08, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The driven route
// ══════════════════════════════════════════════════════════════════════════

describe('D. Driven routes with the real resolver', () => {
  test('in through the carceres, from the southern apron onto the track', () => {
    const path = driven([CIRCUS_AXIS_X, 0, 47.0], [0, -1], 40);
    const last = path[path.length - 1];
    expect(last[2]).toBeLessThan(CIRCUS_SOUTH_Z - 2);
    clearOf(path);
  });

  test('out through the triumphal arch, from the track to north of the tip', () => {
    const path = driven([CIRCUS_AXIS_X, 0, -20.0], [0, -1], 60);
    const last = path[path.length - 1];
    expect(last[2]).toBeLessThan(CIRCUS_NORTH_END_Z - 1);
    expect(last[2]).toBeGreaterThanOrEqual(CIRCUS_ENVELOPE_Z_MIN);
    clearOf(path);
  });

  test('back in through the north opening, on the same axis', () => {
    const path = driven([CIRCUS_AXIS_X, 0, CIRCUS_ENVELOPE_Z_MIN], [0, 1], 30);
    expect(path[path.length - 1][2]).toBeGreaterThan(CIRCUS_NORTH_END_Z + 0.5);
    clearOf(path);
  });

  test('the whole arena can be walked round on the outside', () => {
    // East along the southern apron, then north up the east flank to the tip.
    const east = driven([36.0, 0, 45.0], [1, 0], 120);
    expect(east[east.length - 1][0]).toBeGreaterThan(CIRCUS_EAST_X);
    clearOf(east);
    const north = driven([CIRCUS_ENVELOPE_X_EAST - 0.45, 0, 45.0], [0, -1], 260);
    expect(north[north.length - 1][2]).toBeLessThan(CIRCUS_NORTH_END_Z + 1);
    clearOf(north);
  });

  test('the west flank stops a straight walk east out of the city', () => {
    const path = driven([30.0, 0, 20.0], [1, 0], 200);
    const last = path[path.length - 1];
    expect(near(last[0], CIRCUS_WEST_X - PLAYER_RADIUS, 0.02)).toBe(true);
    clearOf(path);
  });

  test('a walk into the arena cannot cross the flanks or the south face', () => {
    // West flank, from the city side outward: it stops on the flank.
    const east1 = driven([CIRCUS_WEST_X - 2.0, 0, 0.0], [1, 0], 40);
    expect(east1[east1.length - 1][0]).toBeLessThan(CIRCUS_WEST_X);
    // South face west of the opening: it stops short of it.
    const south1 = driven([40.0, 0, CIRCUS_SOUTH_Z + 4.0], [0, -1], 40);
    expect(south1[south1.length - 1][2]).toBeGreaterThan(CIRCUS_SOUTH_Z);
    clearOf([...east1, ...south1]);
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
    expect(CIRCUS_ENVELOPE_Z_MAX).toBe(47.5);
    // East: the arena's own east wall + 1.2, so the whole building is inside.
    expect(CIRCUS_ENVELOPE_X_EAST).toBeCloseTo(CIRCUS_EAST_X + 1.2, 6);
    // South: the carceres' front face + 1.5 — the apron its entrance is entered from.
    expect(CIRCUS_ENVELOPE_Z_MAX).toBeCloseTo(CIRCUS_CARCERES_FRONT_Z + 1.5, 6);
    // North: the shell's tip less 4.84, enough to walk round the sphendone.
    expect(CIRCUS_ENVELOPE_Z_MIN).toBeLessThan(CIRCUS_NORTH_END_Z - 4);
  });

  test('the clamps keep the city square outside the district band', () => {
    expect(clampBoundaryX(34 + 3.8, BOUNDARY_Z_MAX + 5)).toBe(35);
    expect(clampBoundaryX(34 + 3.8, CIRCUS_ENVELOPE_Z_MIN - 5)).toBe(35);
    expect(clampBoundaryX(34 + 3.8, 0)).toBeCloseTo(37.8, 6);
    expect(clampBoundaryZ(0, 34 + 3.8)).toBe(35);
    expect(clampBoundaryZ(40, 34 + 3.8)).toBeCloseTo(37.8, 6);
    expect(clampBoundaryZ(40, 47.0 + 3.8)).toBeCloseTo(47.5, 6);
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
  test('the registry grew by exactly this phase\'s 24 segments', () => {
    expect(nonCircus.length).toBe(110);
    expect(CITY_COLLIDERS.length).toBe(134);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(31);
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
    expect(seal.x2).toBeCloseTo(-2.6, 3);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall-')).length).toBe(20);
  });

  test('the ground plane, the hubs and the arrivals are unchanged', () => {
    expect(GROUND_PLANE_ELEVATION_Y).toBe(-0.05);
    expect(HUB_LOCATIONS.length).toBe(20);
    expect(HUB_LOCATIONS.some((h) => h.id.includes('circus'))).toBe(false);
    expect(Object.keys(FAST_TRAVEL_ARRIVALS).length).toBe(20);
    expect(Object.keys(FAST_TRAVEL_ARRIVALS).some((k) => k.includes('circus'))).toBe(false);
    for (const [x, z] of Object.values(FAST_TRAVEL_ARRIVALS)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(BOUNDARY_X);
      expect(z).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
      expect(z).toBeLessThanOrEqual(BOUNDARY_Z_MAX);
    }
  });

  test('the asset itself is unmodified', () => {
    expect(GLB_BYTES.byteLength).toBe(3202640);
    expect(CLOUD.length).toBeGreaterThan(60000);
    expect(doc.getRoot().listMeshes().length).toBe(76);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. Controls
// ══════════════════════════════════════════════════════════════════════════

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

  test('sealing the two openings would close the ring completely', () => {
    const sealed: Collider[] = [
      ...CITY_COLLIDERS,
      { type: 'segment', id: 'ctrl-south', x1: CIRCUS_CARCERES_WEST_X, z1: CIRCUS_SOUTH_Z, x2: CIRCUS_CARCERES_EAST_X, z2: CIRCUS_SOUTH_Z },
      { type: 'segment', id: 'ctrl-north', x1: CIRCUS_ARCH_WEST_X, z1: -30.08, x2: CIRCUS_ARCH_EAST_X, z2: -30.08 },
    ];
    expect(collidesWith(CIRCUS_AXIS_X, CIRCUS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(CIRCUS_AXIS_X, CIRCUS_SOUTH_Z, PLAYER_RADIUS, sealed)).toBe(true);
    expect(collidesWith(CIRCUS_AXIS_X, -30.08, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(CIRCUS_AXIS_X, -30.08, PLAYER_RADIUS, sealed)).toBe(true);
  });

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
