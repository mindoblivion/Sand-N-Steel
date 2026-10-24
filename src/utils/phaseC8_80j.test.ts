/**
 * Phase C-8.80J — the designed opening engagement distance.
 *
 * The bout used to open at `z = ±3.5`, a 7.0 m gap that was the camera rig's own
 * framing distance rather than a designed engagement distance: the starter
 * gladius (range 2.1) was THREE Advances away, so the opening turns were spent
 * walking. The opening is now 3.6 m — still outside 2.1 m, so the first legal
 * blow remains something the player must close for, but one 1.8 m Advance leaves
 * 1.8 m, inside 2.1 m.
 *
 * What is pinned here, and how:
 *   §A the opening geometry — the designed separation, its symmetry about the
 *      origin, the production spawn reading it, and the fact that 3.6 m is out
 *      of the real starter weapon's range;
 *   §B one Advance — DRIVEN through the shipped `resolveAdvanceTargetZ`, which
 *      lands 1.8 m apart and inside that same real range;
 *   §C the 1.2 m minimum gap — the step may never close it, however often it is
 *      repeated;
 *   §D the retreat clamps, plus the pre-fix 7.0 m frame replayed through the
 *      SAME helper as a control (three approach actions instead of one);
 *   §E everything C-8.80J must not have changed — the range guard, the C-8.80G
 *      contact calibration, the movement values and the AI's 82/18 split.
 *
 * Values are derived, not restated: the weapon comes from `data/itemsDB`, the
 * range rule from `combatCalculations`, the contact times from `attackContact`,
 * and every spawn/movement figure from `utils/duelGeometry` — the module the
 * shipped `DuelScene` now calls.
 *
 * Run with: `bun test src/utils/phaseC8_80j.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DUEL_OPENING_SEPARATION_M,
  DUEL_SPAWN_OFFSET_Z,
  DUEL_MOVE_STEP_M,
  DUEL_MIN_GAP_M,
  DUEL_RETREAT_LIMIT_Z,
  resolveAdvanceTargetZ,
  resolveRetreatTargetZ,
} from './duelGeometry';
import {
  isAttackInRange,
  getWeaponRange,
  chooseAIOutOfRangeAction,
  PLAYER_ATTACK_WINDUP_MS,
} from './combatCalculations';
import {
  ATTACK_CLIP_CONTACT_MS,
  attackContactWindowMs,
  attackPlaybackRateForClip,
} from './attackContact';
import { getWeaponByType, DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const sceneSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
/** Source with every comment removed, so prose can neither satisfy nor defeat a pin. */
const sceneCode = sceneSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The starter gladius — Marcus's own weapon type, and the player's starting gear. */
const gladius = getWeaponByType('sword_shield');

const PLAYER_Z = DUEL_SPAWN_OFFSET_Z;
const OPP_Z = -DUEL_SPAWN_OFFSET_Z;
const separationOf = (playerZ: number, oppZ: number) => Math.abs(playerZ - oppZ);

/** The shipped advance, run for the player (`-1`, toward −Z). */
const advancePlayer = (playerZ: number, oppZ: number) =>
  resolveAdvanceTargetZ(playerZ, oppZ, -1);
/** The shipped advance, run for the opponent (`+1`, toward +Z). */
const advanceOpponent = (playerZ: number, oppZ: number) =>
  resolveAdvanceTargetZ(oppZ, playerZ, 1);

describe('C-8.80J §A — the designed opening', () => {
  test('the opening separation is the designed 3.6 m', () => {
    // The one designed figure this phase introduces; every other value below is
    // derived from it or from the shipped modules.
    expect(DUEL_OPENING_SEPARATION_M).toBe(3.6);
  });

  test('both spawns are symmetric about the arena origin', () => {
    expect(DUEL_SPAWN_OFFSET_Z).toBe(DUEL_OPENING_SEPARATION_M / 2);
    expect(DUEL_SPAWN_OFFSET_Z).toBeCloseTo(1.8, 12);
    // The pair is centred: the midpoint of the two spawns is the origin itself.
    expect((PLAYER_Z + OPP_Z) / 2).toBe(0);
    expect(separationOf(PLAYER_Z, OPP_Z)).toBeCloseTo(DUEL_OPENING_SEPARATION_M, 12);
  });

  test('the production duel spawns from those constants, not from the old ±3.5', () => {
    expect(sceneCode).toContain('position: [0, 0, DUEL_SPAWN_OFFSET_Z],');
    expect(sceneCode).toContain('position: [0, 0, -DUEL_SPAWN_OFFSET_Z],');
    expect(sceneCode).not.toContain('position: [0, 0, 3.5],');
    expect(sceneCode).not.toContain('position: [0, 0, -3.5],');
  });

  test('the opening is outside the starter gladius’ range', () => {
    expect(getWeaponRange(gladius)).toBe(2.1);
    // The player's own starting weapon agrees with the opponent's type mapping.
    expect(DEFAULT_PLAYER_WEAPON.range).toBe(getWeaponRange(gladius));
    expect(DUEL_OPENING_SEPARATION_M).toBeGreaterThan(getWeaponRange(gladius));
    expect(isAttackInRange(DUEL_OPENING_SEPARATION_M, gladius)).toBe(false);
  });
});

describe('C-8.80J §B — one Advance reaches legal range', () => {
  test('a single player Advance closes the gap to 1.8 m', () => {
    const playerZ = advancePlayer(PLAYER_Z, OPP_Z);
    expect(playerZ).toBeCloseTo(0, 12);
    expect(separationOf(playerZ, OPP_Z)).toBeCloseTo(1.8, 12);
  });

  test('and that 1.8 m gap is inside the starter gladius’ range', () => {
    const gap = separationOf(advancePlayer(PLAYER_Z, OPP_Z), OPP_Z);
    expect(isAttackInRange(gap, gladius)).toBe(true);
    // Still a legal body gap — the step did not push the fighters together.
    expect(gap).toBeGreaterThanOrEqual(DUEL_MIN_GAP_M);
  });

  test('the opponent’s Advance is the exact mirror image', () => {
    const playerZ = advancePlayer(PLAYER_Z, OPP_Z);
    const oppZ = advanceOpponent(PLAYER_Z, OPP_Z);
    expect(oppZ).toBeCloseTo(-playerZ, 12);
    expect(separationOf(PLAYER_Z, oppZ)).toBeCloseTo(1.8, 12);
  });

  test('the range guard is inclusive at exactly the weapon range', () => {
    expect(isAttackInRange(getWeaponRange(gladius), gladius)).toBe(true);
    expect(isAttackInRange(getWeaponRange(gladius) + 0.01, gladius)).toBe(false);
  });

  test('both advance directions run through the shipped helper', () => {
    // Two call sites — player and opponent — and no surviving hand-rolled clamp.
    expect(sceneCode.split('resolveAdvanceTargetZ(').length - 1).toBe(2);
    expect(sceneCode).not.toContain('opp.position[2] + 1.2');
    expect(sceneCode).not.toContain('player.position[2] - 1.2');
  });
});

describe('C-8.80J §C — the 1.2 m minimum gap is intact', () => {
  test('the minimum gap and the step are the shipped values', () => {
    expect(DUEL_MIN_GAP_M).toBe(1.2);
    expect(DUEL_MOVE_STEP_M).toBe(1.8);
  });

  test('an Advance cannot close the gap below 1.2 m', () => {
    // 1.2 m apart already: the step is refused entirely.
    const playerZ = 0.4;
    const oppZ = -0.8;
    expect(separationOf(playerZ, oppZ)).toBeCloseTo(DUEL_MIN_GAP_M, 12);
    const next = advancePlayer(playerZ, oppZ);
    expect(next).toBeCloseTo(playerZ, 12);
    expect(separationOf(next, oppZ)).toBeCloseTo(DUEL_MIN_GAP_M, 12);
  });

  test('the opponent’s step is refused by the same clamp, mirrored', () => {
    const playerZ = 0.8;
    const oppZ = -0.4;
    const next = advanceOpponent(playerZ, oppZ);
    expect(next).toBeCloseTo(oppZ, 12);
    expect(separationOf(playerZ, next)).toBeCloseTo(DUEL_MIN_GAP_M, 12);
  });

  test('repeated Advances from the opening stop at 1.2 m and never pass through', () => {
    let playerZ = PLAYER_Z;
    let oppZ = OPP_Z;
    for (let i = 0; i < 10; i += 1) {
      playerZ = advancePlayer(playerZ, oppZ);
      oppZ = advanceOpponent(playerZ, oppZ);
      expect(separationOf(playerZ, oppZ)).toBeGreaterThanOrEqual(DUEL_MIN_GAP_M - 1e-12);
    }
    expect(separationOf(playerZ, oppZ)).toBeCloseTo(DUEL_MIN_GAP_M, 12);
  });
});

describe('C-8.80J §D — retreat clamps, and the pre-fix opening as a control', () => {
  test('the retreat limit is unchanged and clamps on both sides', () => {
    expect(DUEL_RETREAT_LIMIT_Z).toBe(7.5);
    // A retreat that would overshoot the arena edge stops on it…
    expect(resolveRetreatTargetZ(6.0, -1)).toBeCloseTo(DUEL_RETREAT_LIMIT_Z, 12);
    expect(resolveRetreatTargetZ(-6.0, 1)).toBeCloseTo(-DUEL_RETREAT_LIMIT_Z, 12);
    // …and one already on the edge does not move.
    expect(resolveRetreatTargetZ(DUEL_RETREAT_LIMIT_Z, -1)).toBeCloseTo(DUEL_RETREAT_LIMIT_Z, 12);
    expect(resolveRetreatTargetZ(-DUEL_RETREAT_LIMIT_Z, 1)).toBeCloseTo(-DUEL_RETREAT_LIMIT_Z, 12);
    // Inside the limit a retreat is one plain step away from the opponent.
    expect(resolveRetreatTargetZ(PLAYER_Z, -1)).toBeCloseTo(PLAYER_Z + DUEL_MOVE_STEP_M, 12);
  });

  test('the shipped retreat targets run through the helper', () => {
    expect(sceneCode.split('resolveRetreatTargetZ(').length - 1).toBe(2);
    expect(sceneCode).not.toContain('Math.min(7.5,');
    expect(sceneCode).not.toContain('Math.max(-7.5,');
  });

  test('control — the old 7.0 m opening needed three approach actions', () => {
    // The pre-C-8.80J spawns, in the same helper: ±3.5 = 7.0 m.
    const OLD_OFFSET = 3.5;
    let playerZ = OLD_OFFSET;
    const oppZ = -OLD_OFFSET;
    expect(separationOf(playerZ, oppZ)).toBeCloseTo(7.0, 12);
    expect(isAttackInRange(separationOf(playerZ, oppZ), gladius)).toBe(false);

    playerZ = advancePlayer(playerZ, oppZ);
    expect(separationOf(playerZ, oppZ)).toBeCloseTo(5.2, 12);
    expect(isAttackInRange(separationOf(playerZ, oppZ), gladius)).toBe(false);

    playerZ = advancePlayer(playerZ, oppZ);
    expect(separationOf(playerZ, oppZ)).toBeCloseTo(3.4, 12);
    expect(isAttackInRange(separationOf(playerZ, oppZ), gladius)).toBe(false);

    // 7.0 is not a whole number of 1.8 m steps, so the third one lands 1.6 m
    // apart — still inside range, which is the point.
    playerZ = advancePlayer(playerZ, oppZ);
    expect(separationOf(playerZ, oppZ)).toBeCloseTo(1.6, 12);
    expect(isAttackInRange(separationOf(playerZ, oppZ), gladius)).toBe(true);
  });

  test('the shipped opening needs exactly one of those actions', () => {
    let actions = 0;
    let playerZ = PLAYER_Z;
    const oppZ = OPP_Z;
    while (!isAttackInRange(separationOf(playerZ, oppZ), gladius) && actions < 10) {
      playerZ = advancePlayer(playerZ, oppZ);
      actions += 1;
    }
    expect(actions).toBe(1);
    expect(separationOf(playerZ, oppZ)).toBeCloseTo(1.8, 12);
  });
});

describe('C-8.80J §E — what this phase must not have changed', () => {
  test('the attack range guard still refuses invalid input', () => {
    expect(isAttackInRange(Number.NaN, gladius)).toBe(false);
    expect(isAttackInRange(-0.1, gladius)).toBe(false);
    expect(isAttackInRange(1.8, { ...gladius, range: 0 })).toBe(false);
    expect(isAttackInRange(1.8, { ...gladius, range: Number.NaN })).toBe(false);
    expect(isAttackInRange(1.8, gladius)).toBe(true);
  });

  test('the C-8.80G attack-contact calibration is untouched', () => {
    expect(ATTACK_CLIP_CONTACT_MS.Sword_Attack).toBe(519);
    expect(ATTACK_CLIP_CONTACT_MS.Sword_Regular_C).toBe(659);
    expect(attackContactWindowMs()).toBe(PLAYER_ATTACK_WINDUP_MS);
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    // The rates are still contact ÷ window — derived, not restated.
    expect(attackPlaybackRateForClip('Sword_Attack')).toBeCloseTo(519 / 700, 12);
    expect(attackPlaybackRateForClip('Sword_Regular_C')).toBeCloseTo(659 / 700, 12);
    // …and the duel scene carries no rate of its own.
    expect(sceneCode).not.toContain('519');
    expect(sceneCode).not.toContain('659');
  });

  test('the AI’s out-of-range split is unchanged (82 % advance / 18 % taunt)', () => {
    expect(chooseAIOutOfRangeAction(0)).toBe('advance');
    expect(chooseAIOutOfRangeAction(0.819)).toBe('advance');
    expect(chooseAIOutOfRangeAction(0.82)).toBe('taunt');
    expect(chooseAIOutOfRangeAction(0.999)).toBe('taunt');
  });
});
