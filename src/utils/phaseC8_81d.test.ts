/**
 * Phase C-8.81D — true blade-tip impact timing (runtime-geometry suite).
 *
 * ── WHAT THIS PINS, AND WHY IT HAS TO BE MEASURED ─────────────────────────
 * C-8.80G calibrated each attack clip's contact frame against a point it called
 * the blade tip: `attachment.localToWorld((0, box.max.y, 0))`. That point is not
 * the sword's point. `box.max.y` is a length in the gladius SCENE's space and the
 * call reads it in the ATTACHMENT group's space, whose `orient` child is rotated
 * +90° about X (C-8.80E) — so the blade leaves the grip along that group's +Z.
 * Measured on the shipped assets, the proxy sits **1.4132** world units from the
 * real tip at the fighting idle.
 *
 * These tests therefore (a) re-derive the tip's coordinate contract from the real
 * `gladius.glb` and the real `arena_roman.glb` / `minotaur.glb` rigs, (b) check
 * that the sampler follows the COMPLETE animated world transform (attachment scale,
 * orientation group, animated `hand_r`, the attacker's root), (c) pin the
 * recalibrated impact frames (546 ms / 698 ms) against a fresh measurement of the
 * tip's closest approach to the defender, and (d) record the pose-quality limits
 * this phase cannot fix by timing: the heavy chop's contact is low, and at the
 * 1.2 m minimum legal gap both cuts pass through the body.
 *
 * Run with: bun test src/utils/phaseC8_81d.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';
import { BLADE_AXIS_LOCAL, bladeHiltWorld, bladeLengthWorld, bladeTipWorld } from './bladeTip';
import {
  ATTACK_CLIP_CONTACT_MS,
  ATTACK_CLIP_START_LAG_MS,
  HIT_STOP_SAMPLE_LAG_MS,
  attackContactWindowMs,
  attackPlaybackRateForClip,
} from './attackContact';
import {
  ENEMY_ATTACK_WINDUP_MS,
  PLAYER_ATTACK_WINDUP_MS,
  chooseAIOutOfRangeAction,
  getStaminaCost,
  getWeaponRange,
  isAttackInRange,
} from './combatCalculations';
import {
  DUEL_MIN_GAP_M,
  DUEL_MOVE_STEP_M,
  DUEL_OPENING_SEPARATION_M,
} from './duelGeometry';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const REPO = new URL('../../', import.meta.url).pathname;

/** The shipped body corrections (GladiatorMesh's `MODEL_SCALE_CORRECTIONS`). */
const ARENA_ROMAN_CORRECTION = 1.632;
const MINOTAUR_CORRECTION = 1.256;

/** The legal engagement distance a first attack is thrown from: 3.6 − 1.8. */
const LEGAL_SEPARATION_M = DUEL_OPENING_SEPARATION_M - DUEL_MOVE_STEP_M;

/** One 60 Hz frame — the precision a clip-time measurement can honestly claim. */
const FRAME_MS = 1000 / 60;

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const meshSource = readFileSync(
  new URL('../components/3d/GladiatorMesh.tsx', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../components/ui/TurnActionPanel.tsx', import.meta.url),
  'utf8',
);

function loadGLB(path: string, base = '/models/'): Promise<any> {
  const buffer = readFileSync(path);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(ab as ArrayBuffer, base, resolve, reject);
  });
}

let arenaGltf: any;
let minotaurGltf: any;
let gladiusGltf: any;

beforeAll(async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    arenaGltf = await loadGLB(`${REPO}public/models/arena_roman.glb`);
    minotaurGltf = await loadGLB(`${REPO}public/models/minotaur.glb`);
    gladiusGltf = await loadGLB(`${REPO}public/models/weapons/gladius.glb`, '/models/weapons/');
  } finally {
    console.warn = warn;
  }
}, 180_000);

/** What `GladiatorMesh` composes: outer group `meshScale × correction`, one clip. */
function buildFighter(
  gltf: any,
  correction: number,
  z: number,
  rotationY: number,
  clipName: string,
  clipTime = 0,
) {
  const scene = SkeletonUtils.clone(gltf.scene);
  const root = new THREE.Group();
  root.position.set(0, 0, z);
  root.rotation.y = rotationY;
  root.scale.setScalar(correction);
  root.add(scene);
  const mixer = new THREE.AnimationMixer(root);
  const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
  const action = mixer.clipAction(clip);
  action.play();
  mixer.setTime(clipTime);
  root.updateMatrixWorld(true);
  return { root, scene, mixer, clip, action };
}

function findRightHand(scene: THREE.Object3D): THREE.Object3D {
  let hand: THREE.Object3D | null = null;
  scene.traverse((o: any) => {
    if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o;
  });
  if (!hand) throw new Error('hand_r bone not found');
  return hand;
}

/** The C-8.80E attachment: `1 / correction` inside the hand, `[π/2, 0, 0]`. */
function attachGladius(hand: THREE.Object3D, correction: number) {
  const attachment = new THREE.Group();
  attachment.scale.setScalar(1 / correction);
  const orient = new THREE.Group();
  orient.rotation.set(Math.PI / 2, 0, 0);
  const bladeScene = SkeletonUtils.clone(gladiusGltf.scene);
  orient.add(bladeScene);
  attachment.add(orient);
  hand.add(attachment);
  return { attachment, orient, bladeScene };
}

function bladeMeshOf(root: THREE.Object3D): THREE.Mesh {
  let mesh: THREE.Mesh | null = null;
  root.traverse((o: any) => {
    if (o.isMesh && !mesh) mesh = o;
  });
  if (!mesh) throw new Error('gladius mesh not found');
  return mesh;
}

/** Every posed skinned vertex of a body, in world space. */
function skinnedVertices(scene: THREE.Object3D, stride = 2): THREE.Vector3[] {
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

interface Strike {
  ms: number;
  distance: number;
  nearestY: number;
  tipDistanceToTorso: number;
}

/**
 * The tip's distance to the defender at `ms`, with the defender holding
 * `Fighting_Idle` — and, separately, its distance to the defender's TORSO
 * (vertices above y 0.9), which is what distinguishes a chest strike from a
 * front-leg clip.
 */
function tipAt(
  gltf: any,
  correction: number,
  clipName: string,
  separation: number,
  ms: number,
): Strike {
  const defender = buildFighter(gltf, correction, -separation / 2, 0, 'Fighting_Idle', 0.4);
  const all = skinnedVertices(defender.scene);
  const torso = all.filter((p) => p.y > 0.9);

  const player = buildFighter(gltf, correction, separation / 2, Math.PI, clipName, 0);
  const hand = findRightHand(player.scene);
  const { attachment } = attachGladius(hand, correction);
  const blade = bladeMeshOf(attachment);

  player.mixer.setTime(ms / 1000);
  player.root.updateMatrixWorld(true);
  const tip = bladeTipWorld(blade);

  let best = Infinity;
  let nearestY = 0;
  for (const p of all) {
    const d = tip.distanceToSquared(p);
    if (d < best) {
      best = d;
      nearestY = p.y;
    }
  }
  let bestTorso = Infinity;
  for (const p of torso) bestTorso = Math.min(bestTorso, tip.distanceToSquared(p));

  return {
    ms,
    distance: Math.sqrt(best),
    nearestY,
    tipDistanceToTorso: Math.sqrt(bestTorso),
  };
}

/** The clip time whose tip is closest to the defender, sampled every millisecond. */
function closestApproach(
  gltf: any,
  correction: number,
  clipName: string,
  separation: number,
  from = 400,
  to = 800,
) {
  let best: Strike | null = null;
  for (let ms = from; ms <= to; ms++) {
    const s = tipAt(gltf, correction, clipName, separation, ms);
    if (!best || s.distance < best.distance) best = s;
  }
  return best!;
}

// ── §A  The sampler's coordinate contract ──────────────────────────────────
describe('A. The tip is sampled in geometry space and carried through the real chain', () => {
  test('the gladius blade runs along its own +Y, and the tip is that vertex', () => {
    expect(BLADE_AXIS_LOCAL.x).toBe(0);
    expect(BLADE_AXIS_LOCAL.y).toBe(1);
    expect(BLADE_AXIS_LOCAL.z).toBe(0);

    const scene = SkeletonUtils.clone(gladiusGltf.scene);
    scene.updateMatrixWorld(true);
    const mesh = bladeMeshOf(scene);
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    let maxY = -Infinity;
    let argMax = 0;
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) > maxY) {
        maxY = position.getY(i);
        argMax = i;
      }
    }
    // The blade spans ±1.0 in its own space; the point is on the centreline.
    expect(maxY).toBeCloseTo(1.0, 3);
    expect(Math.abs(position.getX(argMax))).toBeLessThan(0.01);
    expect(Math.abs(position.getZ(argMax))).toBeLessThan(0.01);
  });

  test('the rendered blade is 1.000 world units on the shipped body (C-8.80E)', () => {
    const f = buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION, 0, 0, 'Fighting_Idle', 0.4);
    const hand = findRightHand(f.scene);
    const { attachment } = attachGladius(hand, ARENA_ROMAN_CORRECTION);
    f.root.updateMatrixWorld(true);
    const blade = bladeMeshOf(attachment);

    // The attachment's 1 / correction cancels the root's correction.
    expect(bladeLengthWorld(blade)).toBeCloseTo(1.0, 2);
    // …and the grip is IN the hand: the pommel sits on the hand bone's origin.
    const handWorld = hand.getWorldPosition(new THREE.Vector3());
    expect(handWorld.distanceTo(bladeHiltWorld(blade))).toBeLessThan(0.01);
    expect(handWorld.distanceTo(bladeTipWorld(blade))).toBeCloseTo(1.0, 2);
  });

  test('the C-8.80G proxy point is 1.41 units from the real tip — the defect', () => {
    const f = buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION, 0, 0, 'Fighting_Idle', 0.4);
    const hand = findRightHand(f.scene);
    const { attachment } = attachGladius(hand, ARENA_ROMAN_CORRECTION);
    f.root.updateMatrixWorld(true);
    const blade = bladeMeshOf(attachment);

    const box = new THREE.Box3().setFromObject(gladiusGltf.scene);
    const proxy = attachment.localToWorld(new THREE.Vector3(0, box.max.y, 0));
    const real = bladeTipWorld(blade);
    expect(proxy.distanceTo(real)).toBeCloseTo(1.4132, 3);
    // The proxy is not even near the blade's own axis.
    expect(proxy.distanceTo(real)).toBeGreaterThan(1);
  });

  test('the tip follows the animated hand bone through the whole clip', () => {
    const f = buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION, 0.9, Math.PI, 'Sword_Attack', 0);
    const hand = findRightHand(f.scene);
    const { attachment } = attachGladius(hand, ARENA_ROMAN_CORRECTION);
    const blade = bladeMeshOf(attachment);

    const seen: number[] = [];
    for (const ms of [0, 200, 400, 546, 700]) {
      f.mixer.setTime(ms / 1000);
      f.root.updateMatrixWorld(true);
      const handWorld = hand.getWorldPosition(new THREE.Vector3());
      const tip = bladeTipWorld(blade);
      // Rigid weapon: the point stays one blade-length from the grip at every pose.
      expect(handWorld.distanceTo(tip)).toBeCloseTo(1.0, 3);
      seen.push(tip.y);
    }
    // …and the poses really differ, so the reading is animated, not a rest pose.
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.8);
  });

  test('the attacker root transform is applied — translate the root, the tip moves with it', () => {
    const a = buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION, 0.9, Math.PI, 'Sword_Attack', 0.546);
    const bladeA = bladeMeshOf(attachGladius(findRightHand(a.scene), ARENA_ROMAN_CORRECTION).attachment);
    const b = buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION, 1.9, Math.PI, 'Sword_Attack', 0.546);
    const bladeB = bladeMeshOf(attachGladius(findRightHand(b.scene), ARENA_ROMAN_CORRECTION).attachment);

    a.root.updateMatrixWorld(true);
    b.root.updateMatrixWorld(true);
    expect(bladeTipWorld(bladeB).z - bladeTipWorld(bladeA).z).toBeCloseTo(1.0, 4);
    expect(bladeTipWorld(bladeB).y).toBeCloseTo(bladeTipWorld(bladeA).y, 6);
  });

  test('it refreshes the ancestor chain itself, so a stale matrix cannot be read', () => {
    const f = buildFighter(arenaGltf, ARENA_ROMAN_CORRECTION, 0.9, Math.PI, 'Sword_Attack', 0);
    const blade = bladeMeshOf(attachGladius(findRightHand(f.scene), ARENA_ROMAN_CORRECTION).attachment);

    f.mixer.setTime(0.546);
    const withoutRefresh = bladeTipWorld(blade); // no explicit updateMatrixWorld call
    f.root.updateMatrixWorld(true);
    const withRefresh = bladeTipWorld(blade);
    expect(withoutRefresh.distanceTo(withRefresh)).toBeLessThan(1e-9);
  });
});

// ── §B  The recalibrated impact frames ─────────────────────────────────────
describe('B. The impact frames are the true tip’s contact, not the proxy’s tail', () => {
  test('the shipped constants are the real-tip contact frames', () => {
    expect(ATTACK_CLIP_CONTACT_MS.Sword_Attack).toBe(546);
    expect(ATTACK_CLIP_CONTACT_MS.Sword_Regular_C).toBe(698);
    // Both inside the 700 ms wind-up, so no other timer had to move.
    expect(ATTACK_CLIP_CONTACT_MS.Sword_Attack).toBeLessThan(PLAYER_ATTACK_WINDUP_MS);
    expect(ATTACK_CLIP_CONTACT_MS.Sword_Regular_C).toBeLessThan(PLAYER_ATTACK_WINDUP_MS);
  });

  test('Sword_Attack’s constant is its measured closest approach at the legal 1.8 m', () => {
    expect(LEGAL_SEPARATION_M).toBe(1.8);
    const m = closestApproach(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Attack', LEGAL_SEPARATION_M);
    expect(Math.abs(m.ms - ATTACK_CLIP_CONTACT_MS.Sword_Attack)).toBeLessThanOrEqual(FRAME_MS);
    // It is a real contact: the tip is on the body, not a near miss.
    expect(m.distance).toBeLessThan(0.02);
    expect(m.nearestY).toBeGreaterThan(1.15);
  }, 180_000);

  test('Sword_Regular_C’s constant is its measured closest approach at the legal 1.8 m', () => {
    const m = closestApproach(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Regular_C', LEGAL_SEPARATION_M);
    expect(Math.abs(m.ms - ATTACK_CLIP_CONTACT_MS.Sword_Regular_C)).toBeLessThanOrEqual(FRAME_MS);
    expect(m.distance).toBeLessThan(0.02);
  }, 180_000);

  test('a second body agrees within one frame — the phase belongs to the clip', () => {
    const light = closestApproach(minotaurGltf, MINOTAUR_CORRECTION, 'Sword_Attack', LEGAL_SEPARATION_M);
    const heavy = closestApproach(minotaurGltf, MINOTAUR_CORRECTION, 'Sword_Regular_C', LEGAL_SEPARATION_M);
    expect(Math.abs(light.ms - ATTACK_CLIP_CONTACT_MS.Sword_Attack)).toBeLessThanOrEqual(FRAME_MS);
    expect(Math.abs(heavy.ms - ATTACK_CLIP_CONTACT_MS.Sword_Regular_C)).toBeLessThanOrEqual(FRAME_MS);
  }, 240_000);

  test('the old constants land while the blade is still well short', () => {
    const atOldLight = tipAt(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Attack', LEGAL_SEPARATION_M, 519);
    const atOldHeavy = tipAt(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Regular_C', LEGAL_SEPARATION_M, 659);
    // The C-8.80G frames were 0.52 / 0.83 clear of the target at the first legal distance.
    expect(atOldLight.distance).toBeGreaterThan(0.4);
    expect(atOldHeavy.distance).toBeGreaterThan(0.6);
  }, 180_000);
});

// ── §C  The impact frame and the target contact ────────────────────────────
describe('C. At the impact the blade is where the clip says it is', () => {
  test('the calibrated rate puts the action exactly on the contact frame at 700 ms', () => {
    expect(attackContactWindowMs()).toBe(700);
    expect(attackContactWindowMs()).toBe(
      PLAYER_ATTACK_WINDUP_MS - ATTACK_CLIP_START_LAG_MS + HIT_STOP_SAMPLE_LAG_MS,
    );
    for (const clip of ['Sword_Attack', 'Sword_Regular_C'] as const) {
      const rate = attackPlaybackRateForClip(clip);
      expect(rate).toBeLessThan(1);
      expect(rate * 700).toBeCloseTo(ATTACK_CLIP_CONTACT_MS[clip], 9);
    }
    expect(attackPlaybackRateForClip('Sword_Attack')).toBeCloseTo(0.78, 9);
    expect(attackPlaybackRateForClip('Sword_Regular_C')).toBeCloseTo(0.9971428571, 9);
  });

  test('at the rate 1 the tip has moved on — badly for the light cut, a nudge for the heavy', () => {
    // The two clips need the calibration for very different reasons, and the
    // measurement says so: the light cut's contact is 154 ms before the impact, so
    // at rate 1 the blade is already recovering (0.519 clear); the heavy smash's
    // contact is 2 ms before it, so its own correction is a 2 ms nudge (0.9971 rate)
    // and its rate-1 pose is only 0.054 clear. Both figures are asserted so neither
    // is mistaken for the other.
    const lightImpact = tipAt(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Attack', LEGAL_SEPARATION_M, 700);
    const lightContact = tipAt(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Attack', LEGAL_SEPARATION_M, 546);
    expect(lightContact.distance).toBeLessThan(0.02);
    expect(lightImpact.distance).toBeGreaterThan(0.4);
    expect(lightImpact.distance / lightContact.distance).toBeGreaterThan(20);

    const heavyImpact = tipAt(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Regular_C', LEGAL_SEPARATION_M, 700);
    const heavyContact = tipAt(
      arenaGltf,
      ARENA_ROMAN_CORRECTION,
      'Sword_Regular_C',
      LEGAL_SEPARATION_M,
      698,
    );
    expect(heavyContact.distance).toBeLessThan(0.02);
    expect(heavyImpact.distance).toBeGreaterThan(heavyContact.distance * 3);
    expect(heavyImpact.distance).toBeLessThan(0.1);
  }, 180_000);

  test('the tip is not overhead at either impact frame', () => {
    // A damage frame while the blade is still raised would be the C-8.80F defect
    // in reverse: the light cut lands at chest height, the heavy smash at its lowest.
    const light = tipAt(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Attack', LEGAL_SEPARATION_M, 546);
    const heavy = tipAt(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Regular_C', LEGAL_SEPARATION_M, 698);
    expect(light.nearestY).toBeGreaterThan(1.15);
    expect(light.nearestY).toBeLessThan(1.45);
    expect(heavy.nearestY).toBeLessThan(0.8);
  }, 180_000);
});

// ── §D  Pose-quality limits this phase cannot fix by timing ────────────────
describe('D. What the measurement shows, including what timing cannot repair', () => {
  test('the heavy chop descends THROUGH the legal distance and lands low', () => {
    // The tip's closest approach is 0.007 from the defender, but at knee height: the
    // overhead arc passes in front of the torso and its contact is the leading leg.
    // Measured, the torso never comes closer than 0.22, so there is no earlier frame
    // at torso height that actually touches — an impact there would resolve damage
    // with the blade visibly short. Fixing this needs a clip or attachment change,
    // not a timestamp, and is out of this phase's scope.
    const m = tipAt(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Regular_C', LEGAL_SEPARATION_M, 698);
    expect(m.distance).toBeLessThan(0.02);
    expect(m.nearestY).toBeLessThan(0.75);
    expect(m.tipDistanceToTorso).toBeGreaterThan(0.15);
  }, 180_000);

  test('the light cut lands on the torso, not a limb', () => {
    const m = tipAt(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Attack', LEGAL_SEPARATION_M, 546);
    expect(m.nearestY).toBeGreaterThan(1.15);
    expect(m.tipDistanceToTorso).toBeLessThan(0.02);
  }, 180_000);

  test('at the 1.2 m minimum gap both cuts pass through the body — recorded, not cured', () => {
    // 1.2 m (DUEL_MIN_GAP_M) is legal and close: the tip's closest approach is no
    // longer a surface contact because the blade is already inside the silhouette.
    // This is a property of a 1.0 m blade at that gap, unchanged in kind by timing.
    expect(DUEL_MIN_GAP_M).toBe(1.2);
    for (const clip of ['Sword_Attack', 'Sword_Regular_C'] as const) {
      const m = closestApproach(arenaGltf, ARENA_ROMAN_CORRECTION, clip, 1.2);
      expect(m.distance).toBeGreaterThan(0.1); // the tip is past the near surface
      expect(m.distance).toBeLessThan(0.25); // …and still inside the body's depth
    }
  }, 240_000);

  test('at the 2.1 m maximum the tip never reaches the body at all', () => {
    // The range guard permits an attack at 2.1 m; the blade is short there on every
    // frame, which is a reach question this timing phase does not touch.
    for (const clip of ['Sword_Attack', 'Sword_Regular_C'] as const) {
      const m = closestApproach(arenaGltf, ARENA_ROMAN_CORRECTION, clip, 2.1);
      expect(m.distance).toBeGreaterThan(0.2);
    }
  }, 240_000);
});

// ── §E  The invariants this phase must leave exactly as they were ───────────
describe('E. Nothing but the two contact frames moved', () => {
  test('the wind-ups, the turn window and the hit-stops are unchanged', () => {
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(duelSource).toContain('}, 1100);');
    const table = duelSource.match(/const HIT_STOP_MS = \{([\s\S]*?)\} as const;/);
    expect(table).not.toBeNull();
    const read = (name: string) => Number(table![1].match(new RegExp(`${name}:\\s*(\\d+)`))![1]);
    expect(read('quick')).toBe(60);
    expect(read('power')).toBe(110);
    expect(read('crit')).toBe(170);
    expect(read('blocked')).toBe(40);
    expect(read('telegraphedHeavy')).toBe(200);
  });

  test('damage, stamina and range are untouched', () => {
    expect(getWeaponRange(DEFAULT_PLAYER_WEAPON)).toBe(2.1);
    expect(DEFAULT_PLAYER_WEAPON.damageLight).toBe(14);
    expect(DEFAULT_PLAYER_WEAPON.damageHeavy).toBe(26);
    expect(DEFAULT_PLAYER_WEAPON.staminaLight).toBe(12);
    expect(DEFAULT_PLAYER_WEAPON.staminaHeavy).toBe(24);
    expect(getStaminaCost(DEFAULT_PLAYER_WEAPON, true)).toBe(12);
    expect(getStaminaCost(DEFAULT_PLAYER_WEAPON, false)).toBe(24);
    expect(isAttackInRange(1.8, DEFAULT_PLAYER_WEAPON)).toBe(true);
    expect(isAttackInRange(2.1001, DEFAULT_PLAYER_WEAPON)).toBe(false);
  });

  test('the duel’s movement distances are unchanged — the 1.8 m measurement is the shipped one', () => {
    expect(DUEL_OPENING_SEPARATION_M).toBe(3.6);
    expect(DUEL_MOVE_STEP_M).toBe(1.8);
    expect(DUEL_MIN_GAP_M).toBe(1.2);
  });

  test('the AI’s out-of-range split is unchanged', () => {
    expect(chooseAIOutOfRangeAction(0)).toBe('advance');
    expect(chooseAIOutOfRangeAction(0.819)).toBe('advance');
    expect(chooseAIOutOfRangeAction(0.82)).toBe('taunt');
  });

  test('the contact rate still rides the action, and `mixer.timeScale` stays the hit-stop channel', () => {
    const code = meshSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain(
      'nextAction.setEffectiveTimeScale(attackPlaybackRateForAction(activeAction, targetClip));',
    );
    const mixerAssignments = code.match(/mixer\.timeScale\s*=/g) ?? [];
    expect(mixerAssignments.length).toBe(1);
    expect(code).toContain('mixer.timeScale = impactAnimationScale(impactRef?.current);');
    expect(code).toContain('<group scale={weaponAttachmentScale}>');
  });

  test('the responsive duel composition is untouched by this phase', () => {
    // The C-8.80N/P/Q composition: the tactic panel is the duel's flex sibling,
    // stacked on phones and side-by-side from `md` up. A timing change must not
    // touch it, and it does not.
    expect(panelSource).toContain('tactic-panel');
    expect(panelSource).toContain('flex-col md:flex-row');
    expect(panelSource).toContain('chronicle-card');
  });

  test('the fighter-scale table this phase measured against is the shipped one', () => {
    const block = meshSource.match(
      /const MODEL_SCALE_CORRECTIONS: Record<string, number> = \{([\s\S]*?)\n\};/,
    );
    expect(block).not.toBeNull();
    const table = block![1];
    expect(Number(table.match(/roman_warrior:\s*([\d.]+)/)![1])).toBe(ARENA_ROMAN_CORRECTION);
    expect(Number(table.match(/minotaur:\s*([\d.]+)/)![1])).toBe(MINOTAUR_CORRECTION);
  });
});
