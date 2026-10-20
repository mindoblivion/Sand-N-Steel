/**
 * Phase C-8.35 — Northern motte flat ground apron.
 *
 * ── THE REPORTED DEFECT ────────────────────────────────────────────────────
 * The Android preview showed an oversized, flat, sage-green surface across the
 * northern fortress approach, with abrupt horizontal colour bands, on the route
 * the player walks up to the fortress gate.
 *
 * It is not the mound.  It is the shipping asset's own outer flange: trimesh
 * generated `Motte_Grass` as a family of scaled superellipse rings (exponent 6,
 * cardinal radius 40 model units at the summit edge) that keeps going past the
 * mound's foot, and the flange rings oscillate around the city ground plane
 * (ProcessionAvenue, Y = -0.05).  Crest rings sit at exactly Y = 0 — 0.05 ABOVE
 * the sand — while trough rings sink below it, where the opaque ground plane
 * hides them.  One flat, untextured sage-green material therefore renders as
 * concentric ground-level green bands out to a 63.4-unit width, with sand
 * showing through between them.  §A measures that in the asset itself.
 *
 * ── THE CORRECTION ─────────────────────────────────────────────────────────
 * `utils/motteSurface.ts` sinks every flange vertex (level past the visible
 * foot) below the ground plane.  §B drives that real function on the asset's
 * real position buffer and shows the flat bands are gone; §C shows the mound's
 * own geometry, the terrain-height contract and every pinned gameplay constant
 * are untouched, so the traversable route is exactly the one C-8.31 and C-8.33
 * verified.
 *
 * Run with: bun test src/utils/phaseC8_35.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  buryMotteFlange,
  isMotteFlangeVertex,
  MOTTE_FLANGE_LEVEL,
  MOTTE_FLANGE_BURIED_MODEL_Z,
  MOTTE_FLANGE_BURIED_WORLD_Y,
} from './motteSurface';
import {
  MOTTE_SCALE,
  MOTTE_CENTER_Z,
  SUMMIT_Y,
  SUMMIT_CARDINAL_RADIUS,
  SUMMIT_SLOPE_FOOT_SCALE,
  SUMMIT_SLOPE_FOOT_RADIUS,
  MOTTE_PERIMETER_RADIUS,
  summitLevel,
  getTerrainY,
  isOnBridge,
  BRIDGE_Z_INNER,
  BRIDGE_Z_OUTER,
  BRIDGE_HALF_WIDTH,
} from './terrainHeight';
import { GROUND_PLANE_ELEVATION_Y } from '../components/3d/city/ProcessionAvenue';
import { CITY_COLLIDERS } from './collisionShapes';
import { DECK_TOP_Y, DECK_THICKNESS, DECK_Z_INNER, DECK_Z_OUTER } from '../components/3d/city/Drawbridge';

// ── The shipping asset, loaded once ────────────────────────────────────────

const GLB_PATH = new URL('../../public/_workspace_motte_normals.glb', import.meta.url);
const GLB_BYTES = readFileSync(GLB_PATH);

const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(GLB_BYTES));
const grassMesh = doc.getRoot().listMeshes().find((m) => m.getName() === 'Motte_Grass');
if (!grassMesh) throw new Error('Motte_Grass mesh missing from the shipping asset');
const grassPrim = grassMesh.listPrimitives()[0];
const positionAccessor = grassPrim.getAttribute('POSITION');
if (!positionAccessor) throw new Error('Motte_Grass has no POSITION attribute');

/** Model space, Z-up: X and Y span the ground plane, Z is height. */
const MODEL = positionAccessor.getArray() as Float32Array;
const VERTEX_COUNT = positionAccessor.getCount();

const modelX = (i: number) => MODEL[i * 3];
const modelY = (i: number) => MODEL[i * 3 + 1];
const modelZ = (i: number) => MODEL[i * 3 + 2];
/** The node matrix maps model Z to world Y through the group's 0.3145 scale. */
const toWorldY = (z: number) => z * MOTTE_SCALE;
/** Model Y maps to world −Z about the motte centre [0, 0, -71.5]. */
const toWorldZ = (y: number) => MOTTE_CENTER_Z - y * MOTTE_SCALE;
/** Horizontal world distance from the motte centre. */
const worldRadius = (i: number) => Math.hypot(modelX(i), modelY(i)) * MOTTE_SCALE;
const levelAt = (i: number) => summitLevel(modelX(i) * MOTTE_SCALE, modelY(i) * MOTTE_SCALE);
/**
 * Vertices on the mound itself: the rings up to the visible foot.
 *
 * The foot ring's own level is 1.55, but its model coordinates reach ±85 in
 * float32, so the computed level spreads by ~4e-8 either side and 68 of its
 * 128 vertices land fractionally ABOVE 1.55.  The tolerance is far smaller
 * than the gap to the next ring (1.625).
 */
const FOOT_LEVEL_EPS = 1e-3;
const onMound = (i: number) => levelAt(i) <= SUMMIT_SLOPE_FOOT_SCALE + FOOT_LEVEL_EPS;

const MOUND_INDICES = [...Array(VERTEX_COUNT).keys()].filter(onMound);
const FLANGE_INDICES = [...Array(VERTEX_COUNT).keys()].filter((i) => !onMound(i));

/** The corrected buffer, produced by the shipped function. */
const CORRECTED = new Float32Array(MODEL);
const FLANGE_VERTICES_MOVED = buryMotteFlange(CORRECTED);
const correctedWorldY = (i: number) => toWorldY(CORRECTED[i * 3 + 2]);

/** The glTF JSON chunk, for the accessor-layout invariant. */
function glbJson(): any {
  const jsonLength = GLB_BYTES.readUInt32LE(12);
  return JSON.parse(GLB_BYTES.subarray(20, 20 + jsonLength).toString('utf8'));
}

// ══════════════════════════════════════════════════════════════════════════
// A. The shipped asset carries a flat, ground-level flange (the defect)
// ══════════════════════════════════════════════════════════════════════════

describe('A. The asset really carries a flat ground-level flange', () => {
  test('the mesh splits into the recorded mound and flange vertex counts', () => {
    expect(VERTEX_COUNT).toBe(1410);
    expect(MOUND_INDICES.length).toBe(642);
    expect(FLANGE_INDICES.length).toBe(768);
    expect(MOUND_INDICES.length + FLANGE_INDICES.length).toBe(VERTEX_COUNT);
  });

  test('the flange crests stand 0.05 ABOVE the city ground plane', () => {
    const aboveGround = FLANGE_INDICES.filter((i) => toWorldY(modelZ(i)) > GROUND_PLANE_ELEVATION_Y);
    expect(aboveGround.length).toBeGreaterThan(100);
    // The crest rings sit at exactly Y = 0 …
    const highest = Math.max(...FLANGE_INDICES.map((i) => toWorldY(modelZ(i))));
    expect(highest).toBeCloseTo(0, 6);
    // … while the sand ground plane is below them, so the green stands proud.
    expect(GROUND_PLANE_ELEVATION_Y).toBeLessThan(0);
    expect(highest - GROUND_PLANE_ELEVATION_Y).toBeCloseTo(0.05, 6);
  });

  test('the flange troughs sink below the ground plane — hence the bands', () => {
    const belowGround = FLANGE_INDICES.filter((i) => toWorldY(modelZ(i)) < GROUND_PLANE_ELEVATION_Y);
    expect(belowGround.length).toBeGreaterThan(100);
    const lowest = Math.min(...FLANGE_INDICES.map((i) => toWorldY(modelZ(i))));
    expect(lowest).toBeCloseTo(-0.881, 2);
    // Crest above, trough hidden: what renders is a set of separate flat bands
    // rather than one continuous surface.
    expect(lowest).toBeLessThan(GROUND_PLANE_ELEVATION_Y);
    expect(highestOf(FLANGE_INDICES)).toBeGreaterThan(GROUND_PLANE_ELEVATION_Y);
  });

  test('the flange reaches far outside the mound\'s own visible foot', () => {
    const flangeMax = Math.max(...FLANGE_INDICES.map(worldRadius));
    const moundMax = Math.max(...MOUND_INDICES.map(worldRadius));
    expect(flangeMax).toBeCloseTo(31.7, 1);
    // The diagonal foot of the mound is 24.55; the flange adds ~7 more.
    expect(moundMax).toBeCloseTo(24.55, 1);
    expect(flangeMax).toBeGreaterThan(moundMax + 6);
    expect(flangeMax).toBeGreaterThan(SUMMIT_SLOPE_FOOT_RADIUS * 1.5);
  });

  test('the mound itself is a real slope rising to the summit, not a plate', () => {
    const moundTop = Math.max(...MOUND_INDICES.map((i) => toWorldY(modelZ(i))));
    expect(moundTop).toBeCloseTo(SUMMIT_Y, 4);
    const foot = MOUND_INDICES.filter((i) => Math.abs(levelAt(i) - SUMMIT_SLOPE_FOOT_SCALE) < FOOT_LEVEL_EPS);
    expect(foot.length).toBe(128);
    for (const i of foot) expect(toWorldY(modelZ(i))).toBeCloseTo(0, 6);
  });
});

function highestOf(indices: number[]): number {
  return Math.max(...indices.map((i) => toWorldY(modelZ(i))));
}

// ══════════════════════════════════════════════════════════════════════════
// B. The correction removes the flat bands
// ══════════════════════════════════════════════════════════════════════════

describe('B. buryMotteFlange sinks the flange below the ground plane', () => {
  test('every flange vertex ends up at least 0.55 below the sand', () => {
    for (const i of FLANGE_INDICES) {
      expect(correctedWorldY(i)).toBeLessThanOrEqual(MOTTE_FLANGE_BURIED_WORLD_Y + 1e-4);
      expect(correctedWorldY(i)).toBeLessThan(GROUND_PLANE_ELEVATION_Y - 0.5);
    }
    // The crest rings land exactly on the buried depth; deeper troughs stay put.
    const crests = FLANGE_INDICES.filter((i) => Math.abs(modelZ(i)) < 1e-6);
    expect(crests.length).toBeGreaterThan(100);
    for (const i of crests) expect(correctedWorldY(i)).toBeCloseTo(MOTTE_FLANGE_BURIED_WORLD_Y, 4);
  });

  test('nothing of the corrected mesh stands above the ground plane except the mound', () => {
    // This is the assertion that the flat ground-level apron is gone: every
    // vertex still above the sand belongs to the mound's own slope.
    const above = [...Array(VERTEX_COUNT).keys()].filter((i) => correctedWorldY(i) > GROUND_PLANE_ELEVATION_Y);
    for (const i of above) expect(onMound(i)).toBe(true);
    // …and the whole mound survives the correction.  The asset's one interior
    // apex vertex (model (0, 0, -1), under the summit) was already below the
    // sand before this phase and is the only mound vertex not above it.
    const buriedMound = MOUND_INDICES.filter((i) => correctedWorldY(i) <= GROUND_PLANE_ELEVATION_Y);
    expect(buriedMound.length).toBe(1);
    expect(modelX(buriedMound[0])).toBe(0);
    expect(modelY(buriedMound[0])).toBe(0);
    expect(above.length).toBe(MOUND_INDICES.length - buriedMound.length);
  });

  test('every mound vertex is byte-identical, and the foot keeps its Y = 0', () => {
    for (const i of MOUND_INDICES) {
      expect(CORRECTED[i * 3]).toBe(MODEL[i * 3]);
      expect(CORRECTED[i * 3 + 1]).toBe(MODEL[i * 3 + 1]);
      expect(CORRECTED[i * 3 + 2]).toBe(MODEL[i * 3 + 2]);
    }
    const foot = MOUND_INDICES.filter((i) => Math.abs(levelAt(i) - SUMMIT_SLOPE_FOOT_SCALE) < 1e-6);
    for (const i of foot) expect(correctedWorldY(i)).toBe(0);
  });

  test('the reported count is the flange vertex count', () => {
    expect(FLANGE_VERTICES_MOVED).toBe(FLANGE_INDICES.length);
  });

  test('the threshold slack is what keeps the float-sloppy foot ring on the mound', () => {
    // A strict `level > 1.55` test misfiles 68 of the foot ring's 128 vertices
    // as flange, because the ring's own level spreads by ~4e-8 either side of
    // 1.55 once its ±85 model coordinates are stored as float32.  The shipped
    // threshold sits midway to the next ring (1.625), so it never buries the
    // mound's own foot.
    const foot = MOUND_INDICES.filter((i) => Math.abs(levelAt(i) - SUMMIT_SLOPE_FOOT_SCALE) < FOOT_LEVEL_EPS);
    expect(foot.filter((i) => levelAt(i) > SUMMIT_SLOPE_FOOT_SCALE).length).toBeGreaterThan(0);
    expect(MOTTE_FLANGE_LEVEL).toBeGreaterThan(SUMMIT_SLOPE_FOOT_SCALE + FOOT_LEVEL_EPS);
    expect(MOTTE_FLANGE_LEVEL).toBeLessThan(1.625);
    // The shipped predicate agrees with the rings the mesh actually draws.
    for (let i = 0; i < VERTEX_COUNT; i++) {
      expect(isMotteFlangeVertex(modelX(i), modelY(i))).toBe(!onMound(i));
    }
  });

  test('the correction is idempotent', () => {
    const twice = new Float32Array(CORRECTED);
    expect(buryMotteFlange(twice)).toBe(FLANGE_INDICES.length);
    expect(Array.from(twice)).toEqual(Array.from(CORRECTED));
    expect(MOTTE_FLANGE_BURIED_MODEL_Z).toBeLessThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. Nothing else about the motte or the route changed
// ══════════════════════════════════════════════════════════════════════════

describe('C. The mound, the terrain contract and the route are untouched', () => {
  test('the south approach profile the player walks up is byte-identical', () => {
    // The cardinal-south line of the mesh, before and after, unchanged: summit
    // edge 12.58 out from the motte centre (Y 4.7175) and the visible foot at
    // 19.499 out (Y 0).  Keyed by the mesh's own cardinal-south vertices (model
    // X ≈ 0, model Y < 0): summit edge, a mid-slope ring and the visible foot,
    // with the world Z / world Y pairs measured from the shipping asset — the
    // world Z is the centre plus that radius, so it follows MOTTE_CENTER_Z
    // (Phase C-8.37 moved the whole group 5.0 north; the mesh itself, and every
    // byte of it, is unchanged).
    const cardinal = MOUND_INDICES.filter((i) => Math.abs(modelX(i)) < 0.6 && modelY(i) < 0);
    for (const [my, wZ, wY] of [
      [-40, MOTTE_CENTER_Z + 12.58, 4.7175],
      [-51, MOTTE_CENTER_Z + 16.04, 2.3588],
      [-62, MOTTE_CENTER_Z + 19.499, 0],
    ] as const) {
      const verts = cardinal.filter((i) => Math.abs(modelY(i) - my) < 1e-3);
      expect(verts.length).toBeGreaterThan(0);
      for (const i of verts) {
        expect(toWorldZ(modelY(i))).toBeCloseTo(wZ, 2);
        expect(toWorldY(modelZ(i))).toBeCloseTo(wY, 3);
      }
    }
    // …and every one of them is byte-identical after the correction.
    for (const i of cardinal) {
      expect(CORRECTED[i * 3 + 2]).toBe(MODEL[i * 3 + 2]);
    }
  });

  test('getTerrainY still mirrors the rendered mound at the foot and the summit', () => {
    expect(getTerrainY(0, MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS)).toBe(0); // visible slope foot
    expect(getTerrainY(0, MOTTE_CENTER_Z + SUMMIT_CARDINAL_RADIUS)).toBeCloseTo(SUMMIT_Y, 10);
    expect(getTerrainY(0, BRIDGE_Z_INNER)).toBe(0);       // drawbridge inner end
    expect(isOnBridge(0, BRIDGE_Z_INNER)).toBe(true);
  });

  test('nothing of the corrected motte rises into the drawbridge corridor', () => {
    const deckUnderY = DECK_TOP_Y - DECK_THICKNESS;
    const inCorridor = [...Array(VERTEX_COUNT).keys()].filter((i) => {
      const x = modelX(i) * MOTTE_SCALE;
      const z = toWorldZ(modelY(i));
      return Math.abs(x) <= BRIDGE_HALF_WIDTH && z >= DECK_Z_INNER && z <= DECK_Z_OUTER;
    });
    expect(inCorridor.length).toBeGreaterThan(0);
    const highest = Math.max(...inCorridor.map(correctedWorldY));
    expect(highest).toBeLessThanOrEqual(0);
    expect(highest).toBeLessThan(deckUnderY);
  });

  test('the correction changes no material, no topology and no other mesh', () => {
    const grass = doc.getRoot().listMaterials().find((m) => m.getName() === 'Grass');
    const [r, g, b] = grass!.getBaseColorFactor();
    // The sage green the report saw (#A2B386 after the linear→sRGB conversion),
    // deliberately left alone: this phase is a geometry correction.
    expect(r).toBeCloseTo(0.3608, 3);
    expect(g).toBeCloseTo(0.4510, 3);
    expect(b).toBeCloseTo(0.2392, 3);
    expect(grass!.getRoughnessFactor()).toBe(1);
    expect(grass!.getBaseColorTexture()).toBeNull();
    // Topology is preserved: the triangle count is unchanged and the correction
    // only moves vertices — nothing is added, removed or re-indexed.
    expect(grassPrim.getIndices()!.getCount()).toBe(2816 * 3);
    expect(CORRECTED.length).toBe(MODEL.length);
    // … and the asset's other two meshes are still there.
    expect(doc.getRoot().listMeshes().map((m) => m.getName()).sort())
      .toEqual(['Moat_Water', 'Motte_Grass', 'Ramp_Dirt']);
  });

  test('POSITION is FLOAT and interleaved with NORMAL — hence the component owns a copy', () => {
    const json = glbJson();
    const mesh = json.meshes.find((m: any) => m.name === 'Motte_Grass');
    const attributes = mesh.primitives[0].attributes;
    const accessor = json.accessors[attributes.POSITION];
    expect(accessor.componentType).toBe(5126);            // FLOAT
    expect(accessor.count).toBe(VERTEX_COUNT);
    // 24-byte records shared with NORMAL: three hands back an
    // InterleavedBufferAttribute, so the flange cannot be sunk in place —
    // which is why NorthernMotte copies the positions out first.
    expect(json.bufferViews[accessor.bufferView].byteStride).toBe(24);
    expect(json.accessors[attributes.NORMAL].bufferView).toBe(accessor.bufferView);
  });

  test('every pinned gameplay constant and the collision registry are untouched', () => {
    expect(GROUND_PLANE_ELEVATION_Y).toBe(-0.05);
    expect(SUMMIT_Y).toBeCloseTo(4.7175, 6);
    expect(SUMMIT_SLOPE_FOOT_SCALE).toBeCloseTo(1.55, 6);
    expect(SUMMIT_SLOPE_FOOT_RADIUS).toBeCloseTo(19.499, 3);
    expect(MOTTE_PERIMETER_RADIUS).toBe(22.0);            // collision only
    expect(MOTTE_SCALE).toBe(0.3145);
    // Phase C-8.37 moved the northern group 5.0 north; the bridge kept its
    // offsets from the motte centre (+25.5 / +31.0).
    expect(BRIDGE_Z_INNER).toBe(MOTTE_CENTER_Z + 25.5);   // -51.0
    expect(BRIDGE_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0);   // -50.5
    expect(DECK_TOP_Y).toBeCloseTo(0.16, 6);
    // The C-8.33 rear-gate seals are still in the registry, and the northern
    // structures it depends on are unchanged.
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-gateseal')).map((c) => c.id).sort())
      .toEqual(['colo-gateseal-l', 'colo-gateseal-r']);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length).toBe(46);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-')).length).toBe(5);
  });
});
