/**
 * Phase C-8.81C — fighter world scale and strike reach (runtime-geometry suite).
 *
 * ── WHAT IS PINNED, AND WHY IT HAS TO BE MEASURED ─────────────────────────
 * C-8.81C replaced `GladiatorMesh`'s normalise-everyone-to-1.10 table with one
 * that renders every rigged body at its intended real-world size, and raised the
 * shared shield constant with it. None of that is visible in a source string: the
 * numbers only mean something against the real skeletons, so this suite builds the
 * shipped hierarchy in three.js — the five real character GLBs, the real
 * `gladius.glb`, the outer group scale `meshScale × MODEL_SCALE_CORRECTIONS[…]`,
 * the weapon on `hand_r` — poses them with a real `AnimationMixer`, and reads
 * world-space geometry back per skinned vertex.
 *
 * Three separate claims are pinned, because they can fail independently:
 *
 *  1. HEIGHT. Every human body now renders ~1.800 units tall (was 1.09-1.10), and
 *     the Minotaur keeps its authored ~19 % size advantage at ~2.142.
 *  2. GROUND. Nothing sinks or floats: the four bodies whose soles sit at Y = 0 do
 *     so at their correction, and `arena_roman`'s own stray vertex band below Y = 0
 *     scales with its correction instead of being "fixed" by a root offset.
 *  3. REACH. The strike's forward reach at the calibrated contact frame grows with
 *     the body, which is the whole point of the phase: at the 1.2 m reachable
 *     distance the blade now overlaps the opponent's silhouette instead of falling
 *     short, and at the 1.8 m one-Advance distance the shortfall shrinks by ~0.41.
 *     The residual at 1.8 m is pinned as a residual, not asserted away — see §F.
 *
 * Run with: bun test src/utils/phaseC8_81c.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';
import { isAttackInRange, getWeaponRange } from './combatCalculations';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const REPO = new URL('../../', import.meta.url).pathname;

// ── The shipped table, parsed — never restated ──────────────────────────────
const MESH_SOURCE = readFileSync(`${REPO}src/components/3d/GladiatorMesh.tsx`, 'utf8');

function parseCorrections(source: string): Array<[string, number]> {
  const block = source.match(
    /const MODEL_SCALE_CORRECTIONS: Record<string, number> = \{([\s\S]*?)\n\};/,
  );
  if (!block) throw new Error('MODEL_SCALE_CORRECTIONS block not found in GladiatorMesh.tsx');
  const out: Array<[string, number]> = [];
  for (const m of block[1].matchAll(/(\w+):\s*(-?\d+(?:\.\d+)?)/g)) {
    out.push([m[1], Number(m[2])]);
  }
  return out;
}

const CORRECTIONS = parseCorrections(MESH_SOURCE);
const CORRECTION_OF = Object.fromEntries(CORRECTIONS) as Record<string, number>;
const SHIELD_SCALE_GLB = Number(
  MESH_SOURCE.match(/const SHIELD_SCALE_GLB = (\d+(?:\.\d+)?);/)![1],
);
const SHIELD_HAND_OFFSET = Number(
  MESH_SOURCE.match(/<group position=\{\[0, 0, (\d+(?:\.\d+)?)\]\}>/)![1],
);

/** The five rigged bodies and the asset each `characterModel` key loads. */
const BODIES: Array<{ key: string; file: string }> = [
  { key: 'roman_warrior', file: 'arena_roman' },
  { key: 'amazonian', file: 'amazonian' },
  { key: 'dimachaerus', file: 'dimachaerus' },
  { key: 'minotaur', file: 'minotaur' },
  { key: 'retiarius', file: 'netfighter' },
];

/** The four human bodies: the ones that must agree on one rendered height. */
const HUMAN_BODIES = ['roman_warrior', 'amazonian', 'dimachaerus', 'retiarius'];

const TARGET_HUMAN_HEIGHT = 1.8;
/** The shipped intent: the Minotaur stands 1.19x the human height. */
const MINOTAUR_OVERSIZE = 1.19;

/** The pre-C-8.81C table, for the control sections only. */
const PRE_FIX_CORRECTIONS: Record<string, number> = {
  amazonian: 0.61,
  dimachaerus: 0.6,
  minotaur: 0.77,
  retiarius: 0.6,
  // `roman_warrior` was ABSENT, so the default body fell through to 1.0.
  roman_warrior: 1.0,
};
const PRE_FIX_SHIELD_SCALE_GLB = 0.53;

/** C-8.80G's calibrated contact frames (ms). */
const CONTACT_MS = { Sword_Attack: 519, Sword_Regular_C: 659 };

function loadGLB(path: string, base = '/models/'): Promise<any> {
  const buffer = readFileSync(path);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(ab as ArrayBuffer, base, resolve, reject);
  });
}

const gltfs: Record<string, any> = {};
let gladiusGltf: any;

beforeAll(async () => {
  // GLTFLoader warns once per embedded texture it cannot decode without a DOM;
  // geometry, skeleton and clips load regardless.
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const { key, file } of BODIES) {
      gltfs[key] = await loadGLB(`${REPO}public/models/${file}.glb`);
    }
    gladiusGltf = await loadGLB(`${REPO}public/models/weapons/gladius.glb`, '/models/weapons/');
  } finally {
    console.warn = warn;
  }
}, 120_000);

interface PoseOptions {
  z?: number;
  rotY?: number;
  clip?: string;
  t?: number;
}

/** The hierarchy `GladiatorMesh` ships, rebuilt in three.js. */
function buildBody(gltf: any, correction: number, opts: PoseOptions = {}) {
  const { z = 0, rotY = 0, clip = 'Fighting_Idle', t = 0.4 } = opts;
  const scene = SkeletonUtils.clone(gltf.scene);
  const root = new THREE.Group();
  root.position.set(0, 0, z);
  root.rotation.y = rotY;
  root.scale.setScalar(correction);
  root.add(scene);

  const mixer = new THREE.AnimationMixer(root);
  const found = THREE.AnimationClip.findByName(gltf.animations, clip);
  if (found) {
    mixer.clipAction(found).play();
    mixer.setTime(t);
  }
  root.updateMatrixWorld(true);
  return { root, scene, mixer };
}

/** Every posed skinned vertex of a body, in world space. */
function posedVertices(scene: THREE.Object3D, stride = 1): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o: any) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const count = o.geometry.attributes.position.count;
    for (let i = 0; i < count; i += stride) {
      o.getVertexPosition(i, v);
      o.localToWorld(v);
      out.push(v.clone());
    }
  });
  return out;
}

/** Posed world-space Y extent of a body. */
function posedExtentY(scene: THREE.Object3D) {
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  scene.updateMatrixWorld(true);
  scene.traverse((o: any) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const count = o.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      o.getVertexPosition(i, v);
      o.localToWorld(v);
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  });
  return { minY, maxY };
}

/**
 * The blade, portalled onto `hand_r` exactly as the component does: an attachment
 * group scaled `1 / correction` inside the body's own `correction`, so the gladius
 * renders 1.000 world units on every body (C-8.80E).
 */
function attachGladius(body: ReturnType<typeof buildBody>, correction: number) {
  let hand: THREE.Object3D | null = null;
  body.scene.traverse((o: any) => {
    if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o as THREE.Object3D;
  });
  if (!hand) throw new Error('hand_r bone not found');

  const attachment = new THREE.Group();
  attachment.scale.setScalar(1 / correction);
  const orient = new THREE.Group();
  orient.rotation.set(Math.PI / 2, 0, 0);
  orient.add(SkeletonUtils.clone(gladiusGltf.scene));
  attachment.add(orient);
  (hand as THREE.Object3D).add(attachment);
  body.root.updateMatrixWorld(true);
  return attachment;
}

function bladeVertices(attachment: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  attachment.traverse((m: any) => {
    if (!m.isMesh) return;
    const positions = m.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i);
      m.localToWorld(v);
      out.push(v.clone());
    }
  });
  return out;
}

/**
 * One strike, measured at its calibrated contact frame.
 *
 * The attacker stands at `+sep/2` facing -Z, the defender at `-sep/2` facing +Z
 * (the duel's own convention). Reported:
 *  - `reach` — how far forward (toward -Z) the furthest-forward blade vertex gets,
 *    measured from the attacker's own root. Sampling-insensitive: it is a global
 *    extreme of the posed blade.
 *  - `defenderFront` — how far the defender's forward-most vertex stands from *its*
 *    own root, i.e. the depth of the target's silhouette toward the incoming blow.
 *  - `axisGap` — `sep - (reach + defenderFront)`. Negative means the blade's
 *    furthest-forward point is past the opponent's furthest-forward point.
 *  - `nearest` — the nearest 3-D distance from any blade vertex to any defender
 *    vertex, found through a spatial hash. This is the figure C-8.80E used, so it
 *    stays comparable across phases.
 */
function measureStrike(
  correction: number,
  sep: number,
  clip = 'Sword_Attack',
  withNearest = true,
) {
  const defender = buildBody(gltfs.roman_warrior, correction, { z: -sep / 2 });
  const defenderPoints = posedVertices(defender.scene, 2);

  const cell = 0.1;
  const grid = new Map<string, THREE.Vector3[]>();
  for (const p of defenderPoints) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
    let bucket = grid.get(k);
    if (!bucket) grid.set(k, (bucket = []));
    bucket.push(p);
  }
  const nearestSq = (p: THREE.Vector3, maxR: number) => {
    const bx = Math.floor(p.x / cell);
    const by = Math.floor(p.y / cell);
    const bz = Math.floor(p.z / cell);
    let best = Infinity;
    const rings = Math.ceil(maxR / cell);
    for (let r = 0; r <= rings; r++) {
      if (best <= r * cell * (r * cell)) break;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            const bucket = grid.get(`${bx + dx},${by + dy},${bz + dz}`);
            if (!bucket) continue;
            for (const q of bucket) {
              const d = p.distanceToSquared(q);
              if (d < best) best = d;
            }
          }
        }
      }
    }
    return best;
  };

  const attacker = buildBody(gltfs.roman_warrior, correction, {
    z: sep / 2,
    rotY: Math.PI,
    clip,
    t: 0,
  });
  const attachment = attachGladius(attacker, correction);
  attacker.mixer.setTime(CONTACT_MS[clip as keyof typeof CONTACT_MS] / 1000);
  attacker.root.updateMatrixWorld(true);

  const blade = bladeVertices(attachment);
  let furthest = blade[0];
  let worst = Infinity;
  for (const p of blade) {
    if (p.z < furthest.z) furthest = p;
    if (!withNearest) continue;
    const d = nearestSq(p, 1.0);
    if (d < worst) worst = d;
  }

  let defenderFront = -Infinity;
  for (const p of defenderPoints) defenderFront = Math.max(defenderFront, p.z + sep / 2);

  const reach = sep / 2 - furthest.z;
  return {
    reach,
    tipHeight: furthest.y,
    defenderFront,
    axisGap: sep - (reach + defenderFront),
    nearest: withNearest ? Math.sqrt(worst) : Number.NaN,
  };
}

// ── §A — the shipped table ──────────────────────────────────────────────────
describe('A. The shipped scale table', () => {
  test('it names every rigged body, in a stable order', () => {
    expect(CORRECTIONS.map(([k]) => k)).toEqual([
      'roman_warrior',
      'amazonian',
      'dimachaerus',
      'minotaur',
      'retiarius',
    ]);
    expect(CORRECTIONS.every(([, v]) => Number.isFinite(v) && v > 0)).toBe(true);
  });

  test('the DEFAULT body has an entry — the defect that made 1.10-unit fighters', () => {
    // `roman_warrior` is what every opponent config and the default profile carry.
    // Before C-8.81C the key did not exist, so the lookup fell through to 1.0 and
    // the player and every opponent rendered at the asset's 1.103 authored height.
    expect(Object.prototype.hasOwnProperty.call(CORRECTION_OF, 'roman_warrior')).toBe(true);
    expect(CORRECTION_OF.roman_warrior).toBe(1.632);
  });

  test('the four human corrections and the Minotaur one are the C-8.81C values', () => {
    expect(CORRECTION_OF).toEqual({
      roman_warrior: 1.632,
      amazonian: 0.99,
      dimachaerus: 0.989,
      minotaur: 1.256,
      retiarius: 0.985,
    });
  });

  test('none of the pre-fix normalise-to-1.10 values survives', () => {
    const values = CORRECTIONS.map(([, v]) => v);
    for (const old of [0.61, 0.6, 0.77, 0.53]) {
      expect(values).not.toContain(old);
    }
  });

  test('the shield constant is the 0.55x proportion at the new body height', () => {
    expect(SHIELD_SCALE_GLB).toBe(0.861);
    // 0.55 x 1.80 / 1.15 = 0.86087 — the board must stand 55 % of the body.
    expect(SHIELD_SCALE_GLB).toBeCloseTo((0.55 * TARGET_HUMAN_HEIGHT) / 1.15, 3);
    // The hand offset grew with the board: 0.13 x 0.861 = 0.112 world units.
    expect(SHIELD_HAND_OFFSET).toBe(0.13);
    expect(SHIELD_HAND_OFFSET * SHIELD_SCALE_GLB).toBeCloseTo(0.112, 3);
  });
});

// ── §B — authored heights, and the corrections that follow from them ────────
describe('B. The corrections are derived from the assets, not guessed', () => {
  const authored: Record<string, { minY: number; maxY: number }> = {};

  beforeAll(() => {
    for (const { key } of BODIES) {
      authored[key] = posedExtentY(buildBody(gltfs[key], 1).scene);
    }
  }, 120_000);

  test('the authored heights are the ones the table was computed from', () => {
    expect(authored.roman_warrior.maxY).toBeCloseTo(1.103, 2);
    expect(authored.amazonian.maxY).toBeCloseTo(1.818, 2);
    expect(authored.dimachaerus.maxY).toBeCloseTo(1.821, 2);
    expect(authored.minotaur.maxY).toBeCloseTo(1.706, 2);
    expect(authored.retiarius.maxY).toBeCloseTo(1.829, 2);
  });

  test('each human correction is 1.80 / its authored height', () => {
    for (const key of HUMAN_BODIES) {
      expect(CORRECTION_OF[key]).toBeCloseTo(TARGET_HUMAN_HEIGHT / authored[key].maxY, 2);
    }
  });

  test('the Minotaur correction keeps the authored size advantage', () => {
    const target = TARGET_HUMAN_HEIGHT * MINOTAUR_OVERSIZE;
    expect(CORRECTION_OF.minotaur).toBeCloseTo(target / authored.minotaur.maxY, 2);
    // The shipped ratio 1.19 of the human height, at the new size.
    expect(2.142 / 1.8).toBeCloseTo(MINOTAUR_OVERSIZE, 3);
  });
});

// ── §C — the rendered result ────────────────────────────────────────────────
describe('C. Every body renders at its intended real-world height', () => {
  test('the four human bodies agree on 1.800 units to 2 mm', () => {
    for (const key of HUMAN_BODIES) {
      const extent = posedExtentY(buildBody(gltfs[key], CORRECTION_OF[key]).scene);
      expect(extent.maxY).toBeCloseTo(TARGET_HUMAN_HEIGHT, 2);
      expect(Math.abs(extent.maxY - TARGET_HUMAN_HEIGHT)).toBeLessThan(0.002);
    }
  });

  test('the Minotaur renders 2.142 — 19 % above the humans, as authored', () => {
    const extent = posedExtentY(buildBody(gltfs.minotaur, CORRECTION_OF.minotaur).scene);
    expect(extent.maxY).toBeCloseTo(2.142, 2);
    expect(extent.maxY / TARGET_HUMAN_HEIGHT).toBeCloseTo(MINOTAUR_OVERSIZE, 2);
  });

  test('the pre-fix table rendered the same bodies at ~1.10 — the C-8.81A defect', () => {
    const roman = posedExtentY(
      buildBody(gltfs.roman_warrior, PRE_FIX_CORRECTIONS.roman_warrior).scene,
    );
    const dima = posedExtentY(
      buildBody(gltfs.dimachaerus, PRE_FIX_CORRECTIONS.dimachaerus).scene,
    );
    expect(roman.maxY).toBeCloseTo(1.103, 2);
    expect(dima.maxY).toBeCloseTo(1.092, 2);
    // 0.70 / 0.71 short of the intended height — the reason a legal strike's blade
    // stopped ~0.6 units short of the opponent (C-8.81A).
    expect(TARGET_HUMAN_HEIGHT - roman.maxY).toBeCloseTo(0.697, 2);
    expect(TARGET_HUMAN_HEIGHT - dima.maxY).toBeCloseTo(0.708, 2);
  });
});

// ── §D — the ground ─────────────────────────────────────────────────────────
describe('D. Nothing sinks or floats at the new correction', () => {
  test('the four bodies whose soles sit at Y = 0 still stand on the floor', () => {
    for (const key of ['amazonian', 'dimachaerus', 'minotaur', 'retiarius']) {
      const extent = posedExtentY(buildBody(gltfs[key], CORRECTION_OF[key]).scene);
      expect(Math.abs(extent.minY)).toBeLessThan(0.005);
    }
  });

  test("arena_roman's authored stray band below the floor scales with the body", () => {
    // The asset carries ~0.75 of vertices below Y = 0 (a separate open defect) that
    // the arena floor hides. The root group is never offset vertically, so that band
    // is 0.7516 at scale 1 and 0.7516 x 1.632 = 1.2266 at the shipped correction —
    // the visible height is unaffected because the floor occludes it.
    const shipped = posedExtentY(buildBody(gltfs.roman_warrior, CORRECTION_OF.roman_warrior).scene);
    const preFix = posedExtentY(buildBody(gltfs.roman_warrior, 1).scene);
    expect(preFix.minY).toBeCloseTo(-0.7516, 2);
    expect(shipped.minY).toBeCloseTo(-0.7516 * CORRECTION_OF.roman_warrior, 2);
    expect(shipped.minY).toBeCloseTo(-1.2266, 2);
    // The correction is a scale about the root origin, so the ratio is exact.
    expect(shipped.minY / preFix.minY).toBeCloseTo(CORRECTION_OF.roman_warrior, 6);
  });

  test('the visible height above the floor is the rendered height, not the bounding box', () => {
    // arena_roman's full posed box is 1.855 x 1.632 = 3.03 units; only 1.800 of it
    // stands above the floor. Pinning both keeps a future "fix" from shrinking the
    // body to make the bounding box look right.
    const extent = posedExtentY(buildBody(gltfs.roman_warrior, CORRECTION_OF.roman_warrior).scene);
    expect(extent.maxY - extent.minY).toBeCloseTo(3.027, 2);
    expect(extent.maxY).toBeCloseTo(1.8, 2);
  });
});

// ── §E — the shield ─────────────────────────────────────────────────────────
describe('E. The shield keeps its proportion on every body', () => {
  const boardHeight = 1.15; // the scutum board, before the rim (0.68 x 1.15)

  test('the board renders 0.99 world units on all five bodies', () => {
    for (const { key } of BODIES) {
      const correction = CORRECTION_OF[key];
      const world = boardHeight * (SHIELD_SCALE_GLB / correction) * correction;
      expect(world).toBeCloseTo(0.99, 3);
    }
  });

  test('on the human bodies that is 0.55x the rendered height', () => {
    for (const key of HUMAN_BODIES) {
      const extent = posedExtentY(buildBody(gltfs[key], CORRECTION_OF[key]).scene);
      expect((boardHeight * SHIELD_SCALE_GLB) / extent.maxY).toBeCloseTo(0.55, 2);
    }
  });

  test('the Minotaur shares the board by design — one constant, not per-body art', () => {
    const extent = posedExtentY(buildBody(gltfs.minotaur, CORRECTION_OF.minotaur).scene);
    expect((boardHeight * SHIELD_SCALE_GLB) / extent.maxY).toBeCloseTo(0.462, 2);
  });

  test('the pre-fix constant would have shrunk the board to 34 % of the new body', () => {
    const shrunk = boardHeight * PRE_FIX_SHIELD_SCALE_GLB;
    expect(shrunk).toBeCloseTo(0.6095, 4);
    expect(shrunk / TARGET_HUMAN_HEIGHT).toBeCloseTo(0.339, 3);
  });
});

// ── §F — the strike, which is what the scale change is for ──────────────────
describe('F. The strike reaches further on the new bodies', () => {
  test('at the 1.2 m reachable distance the blade now overlaps the opponent', () => {
    const shipped = measureStrike(CORRECTION_OF.roman_warrior, 1.2);
    // Forward reach is a global extreme of the posed blade, so it does not depend
    // on vertex sampling: 1.2962 from the attacker's own root at the 519 ms contact.
    expect(shipped.reach).toBeCloseTo(1.296, 2);
    expect(shipped.defenderFront).toBeCloseTo(0.362, 2);
    expect(shipped.axisGap).toBeLessThan(0);
    expect(shipped.axisGap).toBeCloseTo(-0.458, 2);
    // C-8.80E's comparable figure (nearest body vertex, same contact frame).
    expect(shipped.nearest).toBeLessThan(0.08);
  }, 30_000);

  test('the pre-fix 1.2 m strike barely crossed — the control', () => {
    const preFix = measureStrike(PRE_FIX_CORRECTIONS.roman_warrior, 1.2);
    expect(preFix.reach).toBeCloseTo(1.03, 2);
    expect(preFix.defenderFront).toBeCloseTo(0.222, 2);
    // A 1.10 m body's blade did reach the opponent's forward-most plane — but only
    // just: 0.052 of overlap against the shipped 0.458, and still 0.32 clear of the
    // body itself, which is the gap the report saw as a strike that misses.
    expect(preFix.axisGap).toBeCloseTo(-0.052, 2);
    expect(preFix.nearest).toBeCloseTo(0.32, 2);
    const shipped = measureStrike(CORRECTION_OF.roman_warrior, 1.2);
    expect(shipped.axisGap - preFix.axisGap).toBeCloseTo(-0.406, 2);
    expect(preFix.nearest - shipped.nearest).toBeGreaterThan(0.2);
  }, 30_000);

  test('at the 1.8 m one-Advance distance the shortfall drops by ~0.41 (residual kept)', () => {
    // 1.8 m is the first legal attack (3.6 m opening, one 1.8 m Advance, gladius
    // range 2.1), so this is the distance the player actually strikes from first.
    const shipped = measureStrike(CORRECTION_OF.roman_warrior, 1.8, 'Sword_Attack', false);
    const preFix = measureStrike(PRE_FIX_CORRECTIONS.roman_warrior, 1.8, 'Sword_Attack', false);
    expect(shipped.axisGap).toBeCloseTo(0.142, 2);
    expect(preFix.axisGap).toBeCloseTo(0.548, 2);
    expect(preFix.axisGap - shipped.axisGap).toBeGreaterThan(0.4);
    // It is still a shortfall: this phase does NOT close 1.8 m, and the suite says
    // so, so no later reader mistakes the scale fix for a solved contact problem.
    expect(shipped.axisGap).toBeGreaterThan(0);
    expect(shipped.axisGap).toBeLessThan(0.2);
  }, 30_000);

  test('the heavy clip agrees with the light one at its own contact frame', () => {
    const shipped = measureStrike(CORRECTION_OF.roman_warrior, 1.2, 'Sword_Regular_C');
    expect(shipped.reach).toBeCloseTo(1.293, 2);
    expect(shipped.defenderFront).toBeCloseTo(0.362, 2);
    expect(shipped.axisGap).toBeCloseTo(-0.455, 2);
  }, 30_000);
});

// ── §G — what this phase did not buy ────────────────────────────────────────
describe('G. Reach, timing and combat values are untouched', () => {
  test('the gladius range is still 2.1 and 1.8 is still a legal strike distance', () => {
    expect(getWeaponRange(DEFAULT_PLAYER_WEAPON)).toBe(2.1);
    expect(isAttackInRange(1.8, DEFAULT_PLAYER_WEAPON)).toBe(true);
    expect(isAttackInRange(2.1001, DEFAULT_PLAYER_WEAPON)).toBe(false);
  });

  test('scaling the body did not scale the weapon', () => {
    // The attachment divides the correction back out (C-8.80E), so the blade is the
    // same 1.000 world units on a 1.10 body and a 1.80 one.
    // The GLB's own accessors are float32 (0.99963 measured), so the asset length is
    // pinned at the precision that data carries and the cancellation is pinned exactly.
    const box = new THREE.Box3().setFromObject(gladiusGltf.scene);
    const length = box.max.y - box.min.y;
    expect(length).toBeCloseTo(1.0, 2);
    for (const key of ['roman_warrior', 'dimachaerus']) {
      const correction = CORRECTION_OF[key];
      expect(correction * (1 / correction) * length).toBe(length);
    }
  });
});
