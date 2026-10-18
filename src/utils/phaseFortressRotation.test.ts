/**
 * Phase 35G — Northern Fortress duplicate-rotation regression tests.
 *
 * Run with: bun test src/utils/phaseFortressRotation.test.ts
 *
 * Background: the northern fortress GLB rendered ~90° past vertical because
 * the Z-up → Y-up conversion (a -90° rotation about X) is baked into every
 * GLB node matrix, AND the component applied [-π/2, 0, 0] a second time on
 * its outer <group>.
 *
 * This suite composes the REAL asset transforms (node matrices + POSITION
 * accessor bounds read from the shipped .glb) with the REAL component
 * transform (parsed from NorthernFortress.tsx) and checks the resulting
 * world-space bounds against the collision registry.  Either half of the
 * defect therefore fails the suite:
 *   - a rotation reintroduced on the component <group> ⇒ section B fails and
 *     the composed bounds in section C drift away from the collision facts;
 *   - an asset regenerated without the node conversion ⇒ section A fails.
 *
 * The GLB is not mocked: its JSON chunk is parsed straight from disk.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CITY_COLLIDERS, type RectCollider } from './collisionShapes';
import { SUMMIT_Y, MOTTE_CENTER_X, MOTTE_CENTER_Z, MOTTE_SCALE } from './terrainHeight';

// ── Asset + component loading ───────────────────────────────────────────────

const GLB_REL = '../../public/_workspace_roman_fortress_normals_candidate.glb';
const SRC_REL = '../components/3d/city/NorthernFortress.tsx';

interface GltfNode { name?: string; mesh?: number; matrix?: number[] }
interface GltfMesh { primitives: { attributes: { POSITION: number } }[] }
interface GltfAccessor { min?: number[]; max?: number[] }
interface GltfJson { nodes: GltfNode[]; meshes: GltfMesh[]; accessors: GltfAccessor[] }

/** Parse the JSON chunk out of a binary glTF (.glb) container. */
function parseGlb(buf: Buffer): GltfJson {
  const GLB_MAGIC = 0x46546c67; // 'glTF'
  const JSON_CHUNK = 0x4e4f534a; // 'JSON'
  if (buf.length < 20 || buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('not a binary glTF (.glb) file');
  }
  if (buf.readUInt32LE(4) !== 2) throw new Error('unsupported glTF container version');
  const chunkLength = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== JSON_CHUNK) throw new Error('first GLB chunk is not JSON');
  return JSON.parse(buf.subarray(20, 20 + chunkLength).toString('utf8'));
}

const gltf = parseGlb(readFileSync(new URL(GLB_REL, import.meta.url)));
const componentSrc = readFileSync(new URL(SRC_REL, import.meta.url), 'utf8');

// The single outer fortress <group ...> open tag.
const groupTag = /<group\s([^>]*?)>/.exec(componentSrc)?.[1] ?? '';
const positionAttr = /position=\{\[([^\]]*)\]\}/.exec(groupTag);
const rotationAttr = /rotation=\{\[([^\]]*)\]\}/.exec(groupTag);
const scaleAttr = /scale=\{([^}]*)\}/.exec(groupTag);

/**
 * The shared terrain constants the fortress component's transform is built
 * from.  Since Phase C-8.37 the outer group's position is no longer a literal
 * trio — it reads `[0, SUMMIT_Y, MOTTE_CENTER_Z]` straight out of
 * terrainHeight, exactly as the motte and the drawbridge do — so the parser
 * resolves those identifiers instead of failing on them.  A numeric literal or
 * a `Math.PI` term still evaluates exactly as before.
 */
const SHARED_TRANSFORM_CONSTANTS: Record<string, number> = {
  SUMMIT_Y,
  MOTTE_CENTER_X,
  MOTTE_CENTER_Z,
  MOTTE_SCALE,
};

/** Evaluate one component expression against the shared constants. */
function evalComponent(expr: string): number {
  const trimmed = expr.trim();
  const names = Object.keys(SHARED_TRANSFORM_CONSTANTS);
  const values = names.map((name) => SHARED_TRANSFORM_CONSTANTS[name]);
  try {
    return Number(new Function(...names, `"use strict"; return (${trimmed});`)(...values));
  } catch (cause) {
    throw new Error(
      `unresolved component expression "${trimmed}" ` +
        `(known constants: ${names.join(', ')}): ${(cause as Error).message}`,
    );
  }
}

/** Evaluate a `[a, b, c]`-style attribute body into `size` numbers. */
function evalVec(expr: string, size: number): number[] {
  const parts = expr.split(',').map((s) => s.trim());
  if (parts.length !== size) throw new Error(`expected ${size} components in "${expr}"`);
  return parts.map(evalComponent);
}

const parentPosition = positionAttr ? evalVec(positionAttr[1], 3) : [0, 0, 0];
const parentRotation = rotationAttr ? evalVec(rotationAttr[1], 3) : [0, 0, 0];
const parentScale = scaleAttr ? evalComponent(scaleAttr[1]) : 1;

/** The component's outer <group> transform, built from the parsed attributes. */
function parentMatrix(rotation: number[]): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(parentPosition[0], parentPosition[1], parentPosition[2]),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2]),
    ),
    new THREE.Vector3(parentScale, parentScale, parentScale),
  );
}

/** World-space AABB of every fortress mesh under the given parent transform. */
function fortressWorldBounds(parent: THREE.Matrix4): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const node of gltf.nodes) {
    if (typeof node.mesh !== 'number' || !node.matrix || node.matrix.length !== 16) continue;
    const world = parent.clone().multiply(new THREE.Matrix4().fromArray(node.matrix));
    for (const prim of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[prim.attributes.POSITION];
      if (!accessor?.min || !accessor?.max) continue;
      const [minX, minY, minZ] = accessor.min;
      const [maxX, maxY, maxZ] = accessor.max;
      for (const x of [minX, maxX]) {
        for (const y of [minY, maxY]) {
          for (const z of [minZ, maxZ]) {
            bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(world));
          }
        }
      }
    }
  }
  return bounds;
}

// Composed exactly as the shipped source declares it.
const bounds = fortressWorldBounds(parentMatrix(parentRotation));

const fortressRects = CITY_COLLIDERS.filter(
  (c): c is RectCollider => c.type === 'rect' && c.id.startsWith('fortress-'),
);

function fortressRect(id: string): RectCollider {
  const found = fortressRects.find((r) => r.id === id);
  if (!found) throw new Error(`fortress collider not registered: ${id}`);
  return found;
}

// ═══════════════════════════════════════════════════════════════════════════
// A. The asset already carries the Z-up → Y-up conversion
// ═══════════════════════════════════════════════════════════════════════════

describe('A. Fortress GLB nodes already carry the Z-up → Y-up conversion', () => {
  test('every node uses an explicit 4×4 matrix', () => {
    expect(gltf.nodes.length).toBeGreaterThan(0);
    for (const node of gltf.nodes) {
      expect(node.matrix?.length).toBe(16);
    }
  });

  test('each node matrix equals a -90° rotation about X', () => {
    const expected = new THREE.Matrix4().makeRotationX(-Math.PI / 2).elements;
    for (const node of gltf.nodes) {
      const actual = new THREE.Matrix4().fromArray(node.matrix!).elements;
      for (let i = 0; i < 16; i++) {
        expect(actual[i]).toBeCloseTo(expected[i], 9);
      }
    }
  });

  test('each node maps model +Z (up) → world +Y and model +Y → world −Z', () => {
    for (const node of gltf.nodes) {
      const m = new THREE.Matrix4().fromArray(node.matrix!);
      const up = new THREE.Vector3(0, 0, 1).applyMatrix4(m);
      const towardCity = new THREE.Vector3(0, 1, 0).applyMatrix4(m);
      expect([up.x, up.y, up.z].map((v) => Math.round(v))).toEqual([0, 1, 0]);
      expect([towardCity.x, towardCity.y, towardCity.z].map((v) => Math.round(v))).toEqual([0, 0, -1]);
    }
  });

  test('mesh bounds are Z-up: the stone footprint spans X/Y and rises from Z=0', () => {
    const stone = gltf.nodes.find((n) => n.name === 'Fortress_Stone');
    expect(stone).toBeDefined();
    const accessor = gltf.accessors[gltf.meshes[stone!.mesh!].primitives[0].attributes.POSITION];
    expect(accessor.min![2]).toBeCloseTo(0, 6);                 // base sits on Z=0 (up axis)
    expect(accessor.max![2]).toBeGreaterThan(20);               // tower height on +Z
    expect(accessor.max![0]).toBeCloseTo(-accessor.min![0], 6); // 70 units wide
    expect(accessor.max![1]).toBeCloseTo(-accessor.min![1], 6); // 70 units deep
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. The component applies no duplicate rotation
// ═══════════════════════════════════════════════════════════════════════════

describe('B. NorthernFortress applies no duplicate rotation', () => {
  test('the outer <group> exposes a position and a scale', () => {
    expect(positionAttr).not.toBeNull();
    expect(scaleAttr).not.toBeNull();
  });

  test('the outer <group> declares NO rotation prop (regression guard)', () => {
    // The conversion is already in the GLB nodes; a rotation={[-Math.PI/2,0,0]}
    // here re-applies it and renders the fortress a further 90° past vertical.
    expect(rotationAttr).toBeNull();
  });

  test('the outer <group> transform is position [0, SUMMIT_Y, MOTTE_CENTER_Z] at scale 0.30', () => {
    // The group stands on the motte summit, at the motte centre — both read
    // from terrainHeight (Phase C-8.37), so the fortress can never separate
    // from the mound it stands on.
    expect(parentPosition).toEqual([0, SUMMIT_Y, MOTTE_CENTER_Z]);
    expect(parentPosition[0]).toBe(0);
    expect(parentPosition[1]).toBeCloseTo(4.7175, 6);
    expect(parentPosition[2]).toBe(-76.5);
    expect(parentScale).toBe(0.3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. Composed world-space bounds match the collision assumptions
// ═══════════════════════════════════════════════════════════════════════════

describe('C. Composed world-space bounds match the collision assumptions', () => {
  test('X span is [-10.5, 10.5] (21-unit footprint)', () => {
    expect(bounds.min.x).toBeCloseTo(-10.5, 6);
    expect(bounds.max.x).toBeCloseTo(10.5, 6);
  });

  test('the base sits on the motte summit (Y = 4.7175) and the top is Y ≈ 12.64', () => {
    // The group's Y is resolved from terrainHeight's SUMMIT_Y (4.7175) rather
    // than the rounded 4.72 literal this suite was written against, so the
    // composed base is now exactly the summit height.
    expect(bounds.min.y).toBeCloseTo(SUMMIT_Y, 6);
    expect(bounds.max.y).toBeCloseTo(SUMMIT_Y + 7.92, 6); // 26.4 model × 0.30
    expect(bounds.max.y).toBeCloseTo(12.6375, 6);
    // Cross-check against the terrain module rather than a second literal.
    expect(Math.abs(bounds.min.y - SUMMIT_Y)).toBeLessThan(0.005);
  });

  test('Z span is [-87.0, -66.0] (south face toward the city)', () => {
    // The fortress's own ∓10.5 world half-footprint about the motte centre the
    // group transform now resolves to; C-8.37 moved the whole group 5.0 north.
    expect(bounds.min.z).toBeCloseTo(MOTTE_CENTER_Z - 10.5, 6); // -87.0
    expect(bounds.max.z).toBeCloseTo(MOTTE_CENTER_Z + 10.5, 6); // -66.0
    expect(bounds.min.z).toBeCloseTo(-87.0, 6);
    expect(bounds.max.z).toBeCloseTo(-66.0, 6);
  });

  test('wall collider centerlines sit on the visual faces', () => {
    expect(fortressRect('fortress-east').cx).toBeCloseTo(bounds.max.x, 6);
    expect(fortressRect('fortress-west').cx).toBeCloseTo(bounds.min.x, 6);
    expect(fortressRect('fortress-south-l').cz).toBeCloseTo(bounds.max.z, 6);
    expect(fortressRect('fortress-south-r').cz).toBeCloseTo(bounds.max.z, 6);
    expect(fortressRect('fortress-north').cz).toBeCloseTo(bounds.min.z, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. The guard is sensitive to a reintroduced rotation
// ═══════════════════════════════════════════════════════════════════════════

describe('D. The guard detects a reintroduced parent rotation', () => {
  test('re-applying [-π/2, 0, 0] on the group tips the bounds off the collision facts', () => {
    const duplicated = fortressWorldBounds(parentMatrix([-Math.PI / 2, 0, 0]));
    // The double conversion collapses the vertical span (26.4 → 0 in world Y)
    // and drops the base below the summit, so section C's assertions would fail.
    expect(Math.abs(duplicated.min.y - 4.72)).toBeGreaterThan(1);
    expect(Math.abs(duplicated.max.y - 12.64)).toBeGreaterThan(1);
    expect(duplicated.max.z - duplicated.min.z).toBeLessThan(15);
  });
});
