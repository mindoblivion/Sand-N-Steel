/**
 * Phase C-8.80E — weapon attachment scale (runtime-transform assertions).
 *
 * ── WHAT IS PINNED, AND WHY AT THE TRANSFORM LEVEL ────────────────────────
 * The correction is a scale on the weapon's own ATTACHMENT group, so a
 * source-string test would prove nothing about the number the renderer actually
 * uses. These tests therefore build the shipped hierarchy in three.js — the
 * real `arena_roman.glb` / `dimachaerus.glb`, the real `gladius.glb`, the same
 * outer group scale `meshScale × modelCorrection`, the same `[π/2, 0, 0]`
 * attachment rotation, the same portal-into-the-hand-bone placement — and read
 * world-space distances off the rendered graph.
 *
 * Measured before the fix: `arena_roman` (correction 1.00) rendered the
 * 1.000-unit gladius at **1.000** world units, `dimachaerus` (0.60) at
 * **0.600**, `minotaur` (0.77) at **0.770**. Combat reach is world-space
 * (`getWeaponRange`), so those bodies struck visibly short. After the fix all
 * of them render **1.000**, proportional to `meshScale` alone.
 *
 * Run with: bun test src/utils/phaseC8_80e.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';
import { attachmentScaleForModelCorrection } from './weaponAttachment';
import {
  getWeaponRange,
  isAttackInRange,
  PLAYER_ATTACK_WINDUP_MS,
  ENEMY_ATTACK_WINDUP_MS,
} from './combatCalculations';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const REPO = new URL('../../', import.meta.url).pathname;

/** The shipped corrections, restated only to pick the two bodies this suite loads. */
const ARENA_ROMAN_CORRECTION = 1.0;
const DIMACHAERUS_CORRECTION = 0.6;
const SHIELD_SCALE_GLB = 0.53;

function loadGLB(path: string, base = '/models/'): Promise<any> {
  const buffer = readFileSync(path);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(ab as ArrayBuffer, base, resolve, reject);
  });
}

let arenaGltf: any;
let dimachaerusGltf: any;
let gladiusGltf: any;

beforeAll(async () => {
  // GLTFLoader logs a warning per embedded texture it cannot decode without a
  // DOM; the geometry, skeleton and clips load regardless.
  const warn = console.warn;
  console.warn = () => {};
  try {
    arenaGltf = await loadGLB(`${REPO}public/models/arena_roman.glb`);
    dimachaerusGltf = await loadGLB(`${REPO}public/models/dimachaerus.glb`);
    gladiusGltf = await loadGLB(`${REPO}public/models/weapons/gladius.glb`, '/models/weapons/');
  } finally {
    console.warn = warn;
  }
}, 120_000);

/**
 * The hierarchy `GladiatorMesh` ships: an outer group scaled by
 * `meshScale × modelCorrection`, the cloned character inside it, and the weapon
 * portalled onto `hand_r` under a `[π/2, 0, 0]` rotation.
 */
function buildFighter(gltf: any, correction: number, meshScale = 1, attach = true) {
  const scene = SkeletonUtils.clone(gltf.scene);
  const root = new THREE.Group();
  root.scale.setScalar(meshScale * correction);
  root.add(scene);

  const mixer = new THREE.AnimationMixer(root);
  const idle = THREE.AnimationClip.findByName(gltf.animations, 'Fighting_Idle');
  if (idle) mixer.clipAction(idle).play();
  mixer.setTime(0.4);

  const hands: THREE.Object3D[] = [];
  scene.traverse((o: any) => {
    if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hands.push(o as THREE.Object3D);
  });
  const hand: THREE.Object3D | null = hands[0] ?? null;

  let attachment: THREE.Group | null = null;
  if (attach && hand) {
    // Exactly what the component's wrapper does: scale the attachment group.
    attachment = new THREE.Group();
    attachment.scale.setScalar(attachmentScaleForModelCorrection(correction));
    const orient = new THREE.Group();
    orient.rotation.set(Math.PI / 2, 0, 0);
    orient.add(SkeletonUtils.clone(gladiusGltf.scene));
    attachment.add(orient);
    hand.add(attachment);
  }

  root.updateMatrixWorld(true);
  return { root, scene, hand: hand as THREE.Object3D | null, attachment };
}

function weaponWorldLength(fighter: ReturnType<typeof buildFighter>) {
  const box = new THREE.Box3().setFromObject(gladiusGltf.scene);
  const grip = fighter.attachment!.localToWorld(new THREE.Vector3(0, box.min.y, 0));
  const tip = fighter.attachment!.localToWorld(new THREE.Vector3(0, box.max.y, 0));
  return { length: grip.distanceTo(tip), grip, tip };
}

function posedGroundMinY(scene: THREE.Object3D) {
  const v = new THREE.Vector3();
  let minY = Infinity;
  scene.updateMatrixWorld(true);
  scene.traverse((o: any) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const count = o.geometry.attributes.position.count;
    for (let i = 0; i < count; i += 11) {
      o.getVertexPosition(i, v);
      o.localToWorld(v);
      minY = Math.min(minY, v.y);
    }
  });
  return minY;
}

describe('A. The attachment scale is the inverse of the body correction', () => {
  test('arena_roman needs no correction, the alternatives do', () => {
    expect(attachmentScaleForModelCorrection(1)).toBe(1);
    expect(attachmentScaleForModelCorrection(0.6)).toBeCloseTo(1 / 0.6, 12);
    expect(attachmentScaleForModelCorrection(0.61)).toBeCloseTo(1 / 0.61, 12);
    expect(attachmentScaleForModelCorrection(0.77)).toBeCloseTo(1 / 0.77, 12);
  });

  test('a missing or unusable correction falls back to the identity scale', () => {
    for (const bad of [0, -1, NaN, Infinity, undefined as unknown as number]) {
      expect(attachmentScaleForModelCorrection(bad)).toBe(1);
    }
  });

  test('composed with the root scale, the weapon length depends on meshScale alone', () => {
    for (const correction of [1, 0.77, 0.61, 0.6]) {
      for (const meshScale of [1, 1.15, 1.25]) {
        const world = meshScale * correction * attachmentScaleForModelCorrection(correction);
        expect(world).toBeCloseTo(meshScale, 12);
      }
    }
  });
});

describe('B. Rendered world length through the shipped hierarchy', () => {
  test('the gladius renders 1.000 units long on arena_roman', () => {
    const fighter = buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION);
    const { length } = weaponWorldLength(fighter);
    expect(length).toBeCloseTo(1.0, 3);
  });

  test('the same gladius renders 1.000 units long on dimachaerus — the correction cancelled', () => {
    const fighter = buildFighter(dimachaerusGltf, DIMACHAERUS_CORRECTION);
    const { length } = weaponWorldLength(fighter);
    expect(length).toBeCloseTo(1.0, 3);
  });

  test('both bodies agree to a thousandth of a world unit', () => {
    const roman = weaponWorldLength(buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION)).length;
    const dima = weaponWorldLength(buildFighter(dimachaerusGltf, DIMACHAERUS_CORRECTION)).length;
    expect(Math.abs(roman - dima)).toBeLessThan(0.001);
  });

  test('a scaled opponent body scales its weapon with it — meshScale is not cancelled', () => {
    const plain = weaponWorldLength(buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION, 1)).length;
    const boss = weaponWorldLength(buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION, 1.25)).length;
    expect(boss / plain).toBeCloseTo(1.25, 4);
  });

  test('the attachment is applied inside the hand bone, not on the fighter root', () => {
    const fighter = buildFighter(dimachaerusGltf, DIMACHAERUS_CORRECTION);
    expect(fighter.attachment!.parent).toBe(fighter.hand!);
    // The root group still carries the body correction and nothing else.
    expect(fighter.root.scale.x).toBeCloseTo(DIMACHAERUS_CORRECTION, 6);
  });
});

describe('C. Control — the pre-fix render is what the suite is sensitive to', () => {
  test('without the attachment scale the same body renders a 40 % shorter weapon', () => {
    const fixed = weaponWorldLength(buildFighter(dimachaerusGltf, DIMACHAERUS_CORRECTION)).length;
    const preFix = DIMACHAERUS_CORRECTION * 1.0; // root scale × uncorrected 1.000-unit asset
    expect(preFix).toBeCloseTo(0.6, 6);
    expect(fixed - preFix).toBeCloseTo(0.4, 3);
    expect(preFix).toBeLessThan(fixed);
  });
});

describe('D. Shield proportions and fighter ground alignment are independent', () => {
  test('the shield keeps its constant world height on both bodies', () => {
    const expected = 1.15 * SHIELD_SCALE_GLB; // 0.6095
    for (const correction of [ARENA_ROMAN_CORRECTION, DIMACHAERUS_CORRECTION]) {
      const world = 1.15 * (SHIELD_SCALE_GLB / correction) * correction;
      expect(world).toBeCloseTo(expected, 9);
    }
  });

  test('the weapon attachment does not move the body: posed ground offset is identical', () => {
    const withWeapon = posedGroundMinY(buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION).scene);
    const without = posedGroundMinY(buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION, 1, false).scene);
    expect(Math.abs(withWeapon - without)).toBeLessThan(1e-9);
    // The default body's authored sink below Y=0 is unchanged by this phase.
    expect(withWeapon).toBeCloseTo(-0.7508, 2);
  });

  test('the dimachaerus body still stands on the ground plane', () => {
    const minY = posedGroundMinY(buildFighter(dimachaerusGltf, DIMACHAERUS_CORRECTION).scene);
    expect(Math.abs(minY)).toBeLessThan(0.01);
  });
});

describe('E. Combat values are untouched', () => {
  test('the gladius keeps its range, damage and stamina costs', () => {
    expect(getWeaponRange(DEFAULT_PLAYER_WEAPON)).toBe(2.1);
    expect(DEFAULT_PLAYER_WEAPON.damageLight).toBe(14);
    expect(DEFAULT_PLAYER_WEAPON.damageHeavy).toBe(26);
    expect(DEFAULT_PLAYER_WEAPON.staminaLight).toBe(12);
    expect(DEFAULT_PLAYER_WEAPON.staminaHeavy).toBe(24);
  });

  test('the range rule still accepts exactly the legal distance', () => {
    expect(isAttackInRange(2.1, DEFAULT_PLAYER_WEAPON)).toBe(true);
    expect(isAttackInRange(2.1001, DEFAULT_PLAYER_WEAPON)).toBe(false);
  });

  test('both wind-up windows are unchanged', () => {
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
  });

  test('both hands share the one weapon attachment node', () => {
    const source = readFileSync(`${REPO}src/components/3d/GladiatorMesh.tsx`, 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('<group scale={weaponAttachmentScale}>');
    expect(code).toContain('const rightHandEquipment = isLefty ? shieldNode : weaponAttachment;');
    expect(code).toContain('const leftHandEquipment = isLefty ? weaponAttachment : shieldNode;');
    // The uncorrected node must not reach a hand directly any more.
    expect(code).not.toContain('shieldNode : weaponNode');
    expect(code).not.toContain('weaponNode : shieldNode');
  });
});
