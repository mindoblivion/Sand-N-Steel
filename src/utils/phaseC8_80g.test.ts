/**
 * Phase C-8.80G — attack contact-phase calibration (runtime animation + transform
 * assertions).
 *
 * ── WHAT IS PINNED, AND WHY AT THE RUNTIME LEVEL ──────────────────────────
 * The correction is one number applied to a real `AnimationAction`, so a source-string
 * test would prove nothing about the clip time the renderer reaches. These tests
 * therefore (a) drive the real `AnimationMixer`/`AnimationAction` API this project uses
 * and read `action.time` off it, and (b) rebuild the shipped fighter hierarchy in
 * three.js — the real `arena_roman.glb` / `minotaur.glb`, the real `gladius.glb`, root
 * scale = `meshScale × body correction`, the gladius on `hand_r` inside the C-8.80E
 * attachment group — and measure the blade tip's world distance to the defender's
 * nearest skinned vertex.
 *
 * Measured contact frames (see `utils/attackContact`): `Sword_Attack` 519 ms,
 * `Sword_Regular_C` 659 ms — against a 700 ms impact. At rate 1 the blade is already
 * recovering at the impact (tip-to-defender 2.032 / 1.673 against 0.786 / 0.573 at
 * contact); with the calibrated rates it is at its contact pose.
 *
 * Run with: bun test src/utils/phaseC8_80g.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';
import {
  ATTACK_CLIP_CONTACT_MS,
  ATTACK_CLIP_START_LAG_MS,
  HIT_STOP_SAMPLE_LAG_MS,
  attackContactWindowMs,
  attackPlaybackRateForAction,
  attackPlaybackRateForClip,
} from './attackContact';
import {
  ENEMY_ATTACK_WINDUP_MS,
  PLAYER_ATTACK_WINDUP_MS,
  getWeaponRange,
  isAttackInRange,
} from './combatCalculations';
import { createPlayerStrike } from './playerStrike';
import { withdrawFromDuel } from './duelWithdrawal';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import type { DuelStatistics } from '../types/game';

const REPO = new URL('../../', import.meta.url).pathname;

/** The shipped body corrections (GladiatorMesh's `MODEL_SCALE_CORRECTIONS`). */
const ARENA_ROMAN_CORRECTION = 1.0;
const MINOTAUR_CORRECTION = 0.77;

/** How far a re-measurement may sit from the stored constant, in ms. */
const CONTACT_TOLERANCE_MS = 7;

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const meshSource = readFileSync(
  new URL('../components/3d/GladiatorMesh.tsx', import.meta.url),
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
  // GLTFLoader warns about every embedded texture it cannot decode without a DOM;
  // the geometry, skeleton and clips load regardless.
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
  let action: THREE.AnimationAction | null = null;
  if (clip) {
    action = mixer.clipAction(clip);
    action.play();
    mixer.setTime(clipTime);
  }
  root.updateMatrixWorld(true);
  return { root, scene, mixer, clip, action };
}

function findRightHand(scene: THREE.Object3D): THREE.Object3D | null {
  let hand: THREE.Object3D | null = null;
  scene.traverse((o: any) => {
    if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o;
  });
  return hand;
}

/** The C-8.80E attachment: `1 / correction` inside the hand bone, `[π/2, 0, 0]`. */
function attachGladius(hand: THREE.Object3D, gladius: any, correction: number) {
  const attachment = new THREE.Group();
  attachment.scale.setScalar(1 / correction);
  const orient = new THREE.Group();
  orient.rotation.set(Math.PI / 2, 0, 0);
  orient.add(SkeletonUtils.clone(gladius.scene));
  attachment.add(orient);
  hand.add(attachment);
  return attachment;
}

function skinnedCloud(scene: THREE.Object3D, stride = 5): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o: any) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const count = o.geometry.attributes.position.count;
    for (let i = 0; i < count; i += stride) {
      o.getVertexPosition(i, v);
      o.localToWorld(v);
      points.push(v.clone());
    }
  });
  return points;
}

/**
 * The measured contact frame of one attack clip on one body, at the legal gladius
 * distance (2.1, roots at ±1.05), with the defender holding `Fighting_Idle`.
 */
function measureContact(gltf: any, correction: number, clipName: string) {
  const defender = buildFighter(gltf, correction, -1.05, 0, 'Fighting_Idle', 0.4);
  const cloud = skinnedCloud(defender.scene);

  const player = buildFighter(gltf, correction, 1.05, Math.PI, clipName, 0);
  const hand = findRightHand(player.scene)!;
  const attachment = attachGladius(hand, gladiusGltf, correction);
  const box = new THREE.Box3().setFromObject(gladiusGltf.scene);
  const tipLocal = new THREE.Vector3(0, box.max.y, 0);

  const tipDistanceAt = (t: number) => {
    player.mixer.setTime(t);
    player.root.updateMatrixWorld(true);
    const tip = attachment.localToWorld(tipLocal.clone());
    let d = Infinity;
    for (const p of cloud) d = Math.min(d, p.distanceToSquared(tip));
    return Math.sqrt(d);
  };

  let contactMs = 0;
  let contactDistance = Infinity;
  let distanceAtImpact = Infinity;
  for (let ms = 350; ms <= 800; ms += 1) {
    const d = tipDistanceAt(ms / 1000);
    if (d < contactDistance) {
      contactDistance = d;
      contactMs = ms;
    }
    if (ms === 700) distanceAtImpact = d;
  }
  return { contactMs, contactDistance, distanceAtImpact };
}

// ── §A  The per-clip derivation ────────────────────────────────────────────
describe('A. One playback rate per clip, derived from its own measured contact frame', () => {
  test('the window is the 700 ms wind-up — the two one-frame offsets cancel', () => {
    expect(attackContactWindowMs()).toBe(PLAYER_ATTACK_WINDUP_MS);
    expect(attackContactWindowMs()).toBe(700);
    // Stated as the two named offsets, so a future change to either is visible.
    expect(attackContactWindowMs()).toBe(
      PLAYER_ATTACK_WINDUP_MS - ATTACK_CLIP_START_LAG_MS + HIT_STOP_SAMPLE_LAG_MS,
    );
    expect(ATTACK_CLIP_START_LAG_MS).toBeCloseTo(1000 / 60, 9);
    expect(HIT_STOP_SAMPLE_LAG_MS).toBeCloseTo(1000 / 60, 9);
  });

  test('each calibrated clip maps its own contact frame onto the impact', () => {
    for (const [clip, contact] of Object.entries(ATTACK_CLIP_CONTACT_MS)) {
      const rate = attackPlaybackRateForClip(clip);
      expect(rate * attackContactWindowMs()).toBeCloseTo(contact, 9);
      expect(rate).toBeLessThan(1);
    }
    // The exact shipped figures.
    expect(attackPlaybackRateForClip('Sword_Attack') * 700).toBeCloseTo(519, 9);
    expect(attackPlaybackRateForClip('Sword_Regular_C') * 700).toBeCloseTo(659, 9);
  });

  test('the two clips do not share a rate — there is no universal multiplier', () => {
    const light = attackPlaybackRateForClip('Sword_Attack');
    const heavy = attackPlaybackRateForClip('Sword_Regular_C');
    expect(light).toBeCloseTo(0.7414285714, 9);
    expect(heavy).toBeCloseTo(0.9414285714, 9);
    expect(Math.abs(heavy - light) * 700).toBeCloseTo(140, 9);
  });

  test('the derivation follows the wind-up instead of hard-coding 700', () => {
    expect(attackPlaybackRateForClip('Sword_Attack', 900) * 900).toBeCloseTo(519, 9);
    expect(attackPlaybackRateForClip('Sword_Regular_C', 500) * 500).toBeCloseTo(659, 9);
    expect(attackContactWindowMs(600)).toBe(600);
  });

  test('an uncalibrated clip and every non-striking action play at 1', () => {
    expect(attackPlaybackRateForClip('Sword_Regular_A')).toBe(1);
    expect(attackPlaybackRateForClip('Fighting_Idle')).toBe(1);
    expect(attackPlaybackRateForClip('')).toBe(1);
    for (const action of ['idle', 'walk', 'block', 'dodge', 'hit', 'death'] as const) {
      expect(attackPlaybackRateForAction(action, 'Sword_Attack')).toBe(1);
    }
    expect(attackPlaybackRateForAction('attack_light', 'Sword_Attack')).toBeLessThan(1);
    expect(attackPlaybackRateForAction('attack_heavy', 'Sword_Regular_C')).toBeLessThan(1);
    // A striking action whose clip is uncalibrated stays at 1 as well.
    expect(attackPlaybackRateForAction('attack_heavy', 'Attack_Ground_Pound')).toBe(1);
  });

  test('unusable inputs fall back to the identity rate', () => {
    expect(attackPlaybackRateForClip('Sword_Attack', 0)).toBeCloseTo(519 / 700, 9);
    expect(attackPlaybackRateForClip('Sword_Attack', NaN)).toBeCloseTo(519 / 700, 9);
    expect(attackContactWindowMs(-5)).toBe(700);
  });
});

// ── §B  The measured contact frames, re-derived from the real assets ───────
describe('B. Contact frames re-measured from the shipping assets', () => {
  test('Sword_Attack contacts at ~519 ms and is long gone at 700 ms', () => {
    const m = measureContact(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Attack');
    expect(Math.abs(m.contactMs - ATTACK_CLIP_CONTACT_MS.Sword_Attack)).toBeLessThanOrEqual(
      CONTACT_TOLERANCE_MS,
    );
    // The C-8.80F defect, measured: at the impact the tip is much further away.
    expect(m.distanceAtImpact).toBeGreaterThan(m.contactDistance * 2);
  }, 120_000);

  test('Sword_Regular_C contacts at ~659 ms and is long gone at 700 ms', () => {
    const m = measureContact(arenaGltf, ARENA_ROMAN_CORRECTION, 'Sword_Regular_C');
    expect(Math.abs(m.contactMs - ATTACK_CLIP_CONTACT_MS.Sword_Regular_C)).toBeLessThanOrEqual(
      CONTACT_TOLERANCE_MS,
    );
    expect(m.distanceAtImpact).toBeGreaterThan(m.contactDistance * 2);
  }, 120_000);

  test('a different body reaches the same contact frame — the phase belongs to the clip', () => {
    const light = measureContact(minotaurGltf, MINOTAUR_CORRECTION, 'Sword_Attack');
    const heavy = measureContact(minotaurGltf, MINOTAUR_CORRECTION, 'Sword_Regular_C');
    expect(Math.abs(light.contactMs - ATTACK_CLIP_CONTACT_MS.Sword_Attack)).toBeLessThanOrEqual(
      CONTACT_TOLERANCE_MS,
    );
    expect(Math.abs(heavy.contactMs - ATTACK_CLIP_CONTACT_MS.Sword_Regular_C)).toBeLessThanOrEqual(
      CONTACT_TOLERANCE_MS,
    );
  }, 180_000);

  test('the two calibrated contact frames disagree by far more than the tolerance', () => {
    const light = ATTACK_CLIP_CONTACT_MS.Sword_Attack;
    const heavy = ATTACK_CLIP_CONTACT_MS.Sword_Regular_C;
    expect(heavy - light).toBeGreaterThan(CONTACT_TOLERANCE_MS * 10);
  });
});

// ── §C  Real AnimationAction semantics: rate, clip time and the hit-stop ───
describe('C. The rate is applied to the action, and the hit-stop does not shift contact', () => {
  const frame = 1 / 60;

  function freshAction(gltf: any, clipName: string) {
    const scene = SkeletonUtils.clone(gltf.scene);
    const root = new THREE.Group();
    root.add(scene);
    const mixer = new THREE.AnimationMixer(root);
    const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
    const action = mixer.clipAction(clip);
    action.play();
    return { mixer, action };
  }

  test('`reset()` does not clear the playback rate — the lifecycle point is safe', () => {
    const { action } = freshAction(arenaGltf, 'Sword_Attack');
    action.setEffectiveTimeScale(0.5);
    action.reset();
    expect(action.timeScale).toBeCloseTo(0.5, 9);
    expect(action.time).toBe(0);
  });

  test('at the calibrated rate the action is at its contact frame at 700 ms', () => {
    for (const clip of ['Sword_Attack', 'Sword_Regular_C'] as const) {
      const { mixer, action } = freshAction(arenaGltf, clip);
      const rate = attackPlaybackRateForClip(clip);
      action.setEffectiveTimeScale(rate);
      for (let i = 0; i < 42; i++) mixer.update(frame); // 42 frames = 700 ms
      const contactMs = ATTACK_CLIP_CONTACT_MS[clip];
      // Within one frame's worth of clip time.
      expect(Math.abs(action.time * 1000 - contactMs)).toBeLessThanOrEqual(rate * 1000 * frame + 1e-6);
    }
  });

  test('at the shipped rate of 1 the action is 181 ms past contact at 700 ms', () => {
    const { mixer, action } = freshAction(arenaGltf, 'Sword_Attack');
    expect(action.timeScale).toBe(1);
    for (let i = 0; i < 42; i++) mixer.update(frame);
    expect(action.time * 1000).toBeCloseTo(700, 6);
    expect(action.time * 1000 - ATTACK_CLIP_CONTACT_MS.Sword_Attack).toBeCloseTo(181, 6);
  });

  test('the hit-stop freezes the clip and resumes at the calibrated rate', () => {
    const { mixer, action } = freshAction(arenaGltf, 'Sword_Attack');
    const rate = attackPlaybackRateForClip('Sword_Attack');
    action.setEffectiveTimeScale(rate);
    for (let i = 0; i < 42; i++) mixer.update(frame);
    const atImpact = action.time;

    // `impactAnimationScale` returns 0 while frozen; the mixer multiplies by it.
    mixer.timeScale = 0;
    for (let i = 0; i < 6; i++) mixer.update(frame); // a 100 ms hit-stop, longer than any shipped one
    expect(action.time).toBeCloseTo(atImpact, 12);

    mixer.timeScale = 1;
    mixer.update(frame);
    expect(action.time - atImpact).toBeCloseTo(rate * frame, 12);
  });

  test('the shipped hit-stop durations are unchanged and cannot move the contact pose', () => {
    const table = duelSource.match(/const HIT_STOP_MS = \{([\s\S]*?)\} as const;/);
    expect(table).not.toBeNull();
    const body = table![1];
    const read = (name: string) => {
      const m = body.match(new RegExp(`${name}:\\s*(\\d+)`));
      return m ? Number(m[1]) : NaN;
    };
    expect(read('quick')).toBe(60);
    expect(read('power')).toBe(110);
    expect(read('crit')).toBe(170);
    expect(read('blocked')).toBe(40);
    expect(read('telegraphedHeavy')).toBe(200);
    // A freeze holds the pose; it never advances it, so the contact frame cannot drift.
    const { mixer, action } = freshAction(arenaGltf, 'Sword_Regular_C');
    action.setEffectiveTimeScale(attackPlaybackRateForClip('Sword_Regular_C'));
    for (let i = 0; i < 42; i++) mixer.update(frame);
    const frozen = action.time;
    for (const ms of [60, 110, 170, 200]) {
      mixer.timeScale = 0;
      const frames = Math.round(ms / 16);
      for (let i = 0; i < frames; i++) mixer.update(frame);
      expect(action.time).toBeCloseTo(frozen, 12);
      mixer.timeScale = 1;
    }
  });
});

// ── §D  The combat contract this phase must not move ───────────────────────
describe('D. The fixed combat contract is untouched', () => {
  test('both wind-ups and the 1100 ms turn window are unchanged', () => {
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(duelSource).toContain('}, 1100);');
    expect(duelSource).toMatch(/resolutionTimerRef\.current = setTimeout\(/);
  });

  test('damage, range and stamina are unchanged', () => {
    expect(getWeaponRange(DEFAULT_PLAYER_WEAPON)).toBe(2.1);
    expect(DEFAULT_PLAYER_WEAPON.damageLight).toBe(14);
    expect(DEFAULT_PLAYER_WEAPON.damageHeavy).toBe(26);
    expect(DEFAULT_PLAYER_WEAPON.staminaLight).toBe(12);
    expect(DEFAULT_PLAYER_WEAPON.staminaHeavy).toBe(24);
    expect(isAttackInRange(2.1, DEFAULT_PLAYER_WEAPON)).toBe(true);
    expect(isAttackInRange(2.1001, DEFAULT_PLAYER_WEAPON)).toBe(false);
  });

  test('the rate is applied to the action, and `mixer.timeScale` stays the hit-stop channel', () => {
    const code = meshSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain(
      'nextAction.setEffectiveTimeScale(attackPlaybackRateForAction(activeAction, targetClip));',
    );
    expect(code).toContain('attackPlaybackRateForAction');
    // The one and only mixer rate assignment is the hit-stop's.
    const mixerAssignments = code.match(/mixer\.timeScale\s*=/g) ?? [];
    expect(mixerAssignments.length).toBe(1);
    expect(code).toContain('mixer.timeScale = impactAnimationScale(impactRef?.current);');
  });

  test('the weapon attachment correction is still in place', () => {
    const code = meshSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('<group scale={weaponAttachmentScale}>');
    expect(code).toContain('attachmentScaleForModelCorrection');
  });
});

// ── §E  Cancellation and withdrawal still invalidate the pending strike ────
describe('E. A calibrated swing is still droppable', () => {
  function fakeTimer() {
    let nextId = 1;
    const callbacks = new Map<number, () => void>();
    return {
      timer: {
        set(callback: () => void) {
          const id = nextId++;
          callbacks.set(id, callback);
          return id;
        },
        clear(handle: number) {
          callbacks.delete(handle);
        },
      },
      fireAll() {
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const cb of pending) cb();
      },
      get size() {
        return callbacks.size;
      },
    };
  }

  test('cancelling before the impact resolves nothing', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    let hits = 0;
    expect(strike.strike('quick_attack', () => { hits += 1; })).toBe(true);
    expect(clock.size).toBe(1);
    expect(strike.cancel()).toBe(true);
    expect(clock.size).toBe(0);
    clock.fireAll();
    expect(hits).toBe(0);
  });

  test('a confirmed withdrawal drops the swing and settles once', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    let hits = 0;
    strike.strike('power_attack', () => { hits += 1; });

    const stats: DuelStatistics = {
      damageDealt: 0,
      damageTaken: 12,
      hitsLanded: 0,
      perfectBlocks: 0,
      dodgesPerformed: 0,
      maxCombo: 0,
      crowdHypePeak: 25,
      durationSeconds: 8,
      goldEarned: 120,
      fameEarned: 4,
      xpEarned: 10,
    };
    const isMatchOver = { current: false };
    let settlements = 0;
    const withdrew = withdrawFromDuel({
      isMatchOver,
      stats,
      pending: {
        cancelEnemyStrike: () => {},
        cancelPlayerStrike: () => { strike.cancel(); },
        clearTurnTimer: () => {},
      },
      settle: () => { settlements += 1; },
    });

    expect(withdrew).toBe(true);
    expect(isMatchOver.current).toBe(true);
    expect(clock.size).toBe(0);
    clock.fireAll();
    expect(hits).toBe(0);
    expect(settlements).toBe(1);
    expect(stats.goldEarned).toBe(0);
    expect(stats.outcome).toBe('withdrawn');

    // A second confirmation changes nothing and cannot resolve the old swing.
    const again = withdrawFromDuel({
      isMatchOver,
      stats,
      pending: { cancelEnemyStrike: () => {}, cancelPlayerStrike: () => {}, clearTurnTimer: () => {} },
      settle: () => { settlements += 1; },
    });
    expect(again).toBe(false);
    expect(settlements).toBe(1);
    expect(hits).toBe(0);
  });

  test('a stale callback cannot resolve a newer swing', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    let first = 0;
    let second = 0;
    strike.strike('quick_attack', () => { first += 1; });
    strike.cancel();
    strike.strike('power_attack', () => { second += 1; });
    clock.fireAll();
    expect(first).toBe(0);
    expect(second).toBe(1);
  });
});
