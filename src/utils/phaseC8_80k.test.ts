/**
 * Phase C-8.80K — the movement chronicle reports the step that was taken.
 *
 * Advance and Retreat used to print a flat "advances 1.8m" / "retreats back
 * 1.8m" whatever the clamps did: at the 1.2 m minimum gap the fighter did not
 * move at all, yet the chronicle said they had walked the full step. What is
 * pinned here, and how:
 *
 *   §A the seven required outcomes, each DRIVEN through the shipped movement
 *      helpers (`resolveAdvanceTargetZ` / `resolveRetreatTargetZ` from
 *      `utils/duelGeometry`) and then reported by the shipped formatter — the
 *      same composition `DuelScene` performs, never a duplicate of the clamp;
 *   §B the opponent's mirror — one path, so the AI's step is reported by the
 *      same rule;
 *   §C formatting and rounding at the displayed precision, including the case
 *      that used to be the lie: a displacement that rounds to zero says the
 *      fighter could not move rather than printing "0.0m";
 *   §D the production wiring, read out of `DuelScene.tsx` with comments
 *      stripped — the chronicle line goes through the helper, no flat "1.8m"
 *      movement claim survives in code, and the movement values, the clamps,
 *      the opening distance and the stamina rule are untouched.
 *
 * Run with: `bun test src/utils/phaseC8_80k.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DUEL_MOVE_STEP_M,
  DUEL_MIN_GAP_M,
  DUEL_RETREAT_LIMIT_Z,
  DUEL_SPAWN_OFFSET_Z,
  resolveAdvanceTargetZ,
  resolveRetreatTargetZ,
} from './duelGeometry';
import {
  MOVE_REPORT_DECIMALS,
  describeMoveReport,
  formatMoveDistance,
  moveDisplacement,
  reportedDistance,
} from './duelMoveReport';

const sceneSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
/** Source with every comment removed, so prose can neither satisfy nor defeat a pin. */
const sceneCode = sceneSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PLAYER_Z = DUEL_SPAWN_OFFSET_Z; // +1.8
const OPP_Z = -DUEL_SPAWN_OFFSET_Z; // −1.8

/** The shipped step, run exactly as the scene runs it, and then reported. */
function advanceReport(playerZ: number, oppZ: number): { moved: number; text: string } {
  const targetZ = resolveAdvanceTargetZ(playerZ, oppZ, -1);
  return {
    moved: moveDisplacement(playerZ, targetZ),
    text: describeMoveReport('Spartacus', 'advance', playerZ, targetZ),
  };
}

function retreatReport(playerZ: number): { moved: number; text: string } {
  const targetZ = resolveRetreatTargetZ(playerZ, -1);
  return {
    moved: moveDisplacement(playerZ, targetZ),
    text: describeMoveReport('Spartacus', 'retreat', playerZ, targetZ),
  };
}

describe('C-8.80K §A — the step that was actually taken', () => {
  test('1. an unobstructed Advance still reads as the shipped sentence', () => {
    const { moved, text } = advanceReport(PLAYER_Z, OPP_Z);
    expect(moved).toBeCloseTo(DUEL_MOVE_STEP_M, 12);
    // The wording a full step has always used, verbatim.
    expect(text).toBe('Spartacus advances 1.8m toward their opponent.');
  });

  test('2. an Advance shortened by the 1.2 m minimum gap names the real distance', () => {
    // 2.0 m apart: a full step would close the gap to 0.2, so the gap clamp cuts it to 0.8.
    const playerZ = 0.2;
    const oppZ = -1.8;
    const { moved, text } = advanceReport(playerZ, oppZ);
    expect(moved).toBeCloseTo(0.8, 12);
    expect(text).toBe(
      'Spartacus advances only 0.8m toward their opponent — the enemy is already at grips.',
    );
    // Still a legal body gap: the clamp did its job.
    expect(Math.abs(resolveAdvanceTargetZ(playerZ, oppZ, -1) - oppZ)).toBeCloseTo(DUEL_MIN_GAP_M, 12);
  });

  test('3. an Advance that can go no farther claims no movement at all', () => {
    // Already at the minimum gap: the target IS the current position.
    const playerZ = 0.4;
    const oppZ = -0.8;
    const { moved, text } = advanceReport(playerZ, oppZ);
    // 1.1e-16 of float noise is not a step: it rounds to zero at the displayed
    // precision, which is exactly what the report decides on.
    expect(moved).toBeLessThan(1e-12);
    expect(reportedDistance(moved)).toBe(0);
    expect(text).toBe('Spartacus cannot advance — the enemy is already at grips.');
    expect(text).not.toContain('1.8m');
    expect(text).not.toContain('0.0m');
  });

  test('4. an ordinary Retreat still reads as the shipped sentence', () => {
    const { moved, text } = retreatReport(PLAYER_Z);
    expect(moved).toBeCloseTo(DUEL_MOVE_STEP_M, 12);
    expect(text).toBe('Spartacus retreats back 1.8m.');
  });

  test('5. a Retreat reduced by the ±7.5 m boundary names the real distance', () => {
    const { moved, text } = retreatReport(6.0);
    expect(moved).toBeCloseTo(1.5, 12);
    expect(text).toBe("Spartacus retreats only 1.5m — the arena's edge stops them.");
  });

  test('6. a Retreat that can go no farther claims no movement at all', () => {
    const { moved, text } = retreatReport(DUEL_RETREAT_LIMIT_Z);
    expect(moved).toBe(0);
    expect(text).toBe("Spartacus cannot retreat — the arena's edge is at their back.");
    expect(text).not.toContain('1.8m');
  });
});

describe('C-8.80K §B — the opponent’s step uses the same rule', () => {
  test('the AI’s Advance is reported by the same composition', () => {
    // Opponent at −1.8 moving toward +1.8 (direction +1).
    const fromZ = OPP_Z;
    const targetZ = resolveAdvanceTargetZ(fromZ, PLAYER_Z, 1);
    expect(describeMoveReport('Marcus', 'advance', fromZ, targetZ)).toBe(
      'Marcus advances 1.8m toward their opponent.',
    );
  });

  test('the AI’s clamped Advance is reported as shortened, not as a full step', () => {
    const fromZ = -0.2;
    const playerZ = 1.8;
    const targetZ = resolveAdvanceTargetZ(fromZ, playerZ, 1);
    expect(moveDisplacement(fromZ, targetZ)).toBeCloseTo(0.8, 12);
    expect(describeMoveReport('Marcus', 'advance', fromZ, targetZ)).toBe(
      'Marcus advances only 0.8m toward their opponent — the enemy is already at grips.',
    );
  });

  test('both fighters really do share one message path', () => {
    // One chronicle call per movement branch, naming the actor — not two branches.
    expect(sceneCode.split('describeMoveReport(').length - 1).toBe(2);
    expect(sceneCode.split("describeMoveReport(attacker.name, 'advance'").length - 1).toBe(1);
    expect(sceneCode.split("describeMoveReport(attacker.name, 'retreat'").length - 1).toBe(1);
  });
});

describe('C-8.80K §C — formatting and rounding at the displayed precision', () => {
  test('the display precision is one decimal, as the shipped messages were', () => {
    expect(MOVE_REPORT_DECIMALS).toBe(1);
    expect(formatMoveDistance(1.8)).toBe('1.8m');
    expect(formatMoveDistance(0.8)).toBe('0.8m');
    expect(formatMoveDistance(1.5)).toBe('1.5m');
    // A whole metre still reads with its decimal, never "2m".
    expect(formatMoveDistance(2)).toBe('2.0m');
    expect(formatMoveDistance(0.25)).toBe('0.3m');
  });

  test('a displacement that rounds to zero is reported as no movement', () => {
    // 0.04 m is below the displayed precision — floating-point noise against a
    // clamp, not a step the player can see.
    expect(reportedDistance(0.04)).toBe(0);
    const text = describeMoveReport('Spartacus', 'advance', 1.0, 0.96);
    expect(text).toBe('Spartacus cannot advance — the enemy is already at grips.');
    expect(text).not.toContain('0.0m');
  });

  test('a displacement at or above the precision is still reported', () => {
    expect(reportedDistance(0.06)).toBe(0.1);
    expect(describeMoveReport('Spartacus', 'retreat', 7.44, 7.5)).toBe(
      "Spartacus retreats only 0.1m — the arena's edge stops them.",
    );
  });

  test('the reported displacement is measured, never the nominal step', () => {
    // The nominal step survives only as the full-step threshold.
    expect(reportedDistance(DUEL_MOVE_STEP_M - 0.01)).toBe(1.8);
    expect(describeMoveReport('Spartacus', 'advance', 1.79, 0)).toContain('advances 1.8m');
    expect(describeMoveReport('Spartacus', 'advance', 1.5, 0)).toContain('advances only 1.5m');
  });
});

const reportSource = readFileSync(new URL('./duelMoveReport.ts', import.meta.url), 'utf8');

/** The movement branches with their comments stripped — the only code this phase touched. */
const movementCode = (() => {
  const raw = sceneSource.slice(
    sceneSource.indexOf('// 1. MOVEMENT ACTIONS'),
    sceneSource.indexOf('// 2. DEFENSIVE'),
  );
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
})();

describe('C-8.80K §D — the production wiring and what must not have moved', () => {
  test('the chronicle line goes through the shared formatter, not a literal', () => {
    expect(sceneCode).toContain('describeMoveReport(');
    // The old flat claims are gone from the CODE (the comments still explain them).
    expect(sceneCode).not.toContain('advances 1.8m toward their opponent.`');
    expect(sceneCode).not.toContain('retreats back 1.8m.`');
    // …and the wording now lives in the report module, which keeps the full-step sentence.
    expect(reportSource).toContain('advances ${distance} toward their opponent.');
    expect(reportSource).toContain('retreats back ${distance}.');
  });

  test('the displacement is derived from the real before/after Z', () => {
    // The actor's own position is read before the target is computed…
    expect(sceneCode).toContain('const fromZ = attacker.position[2];');
    // …and both branches hand that pair to the formatter.
    expect(sceneCode).toContain("describeMoveReport(attacker.name, 'advance', fromZ, targetZ)");
    expect(sceneCode).toContain("describeMoveReport(attacker.name, 'retreat', fromZ, targetZ)");
    // No arithmetic on the nominal step anywhere in the scene.
    expect(sceneCode).not.toContain('DUEL_MOVE_STEP_M');
  });

  test('the movement values and clamps are untouched (C-8.80J intact)', () => {
    expect(DUEL_MOVE_STEP_M).toBe(1.8);
    expect(DUEL_MIN_GAP_M).toBe(1.2);
    expect(DUEL_RETREAT_LIMIT_Z).toBe(7.5);
    expect(DUEL_SPAWN_OFFSET_Z).toBe(1.8);
    // Both clamps still run through the shipped helpers — two call sites each.
    expect(sceneCode.split('resolveAdvanceTargetZ(').length - 1).toBe(2);
    expect(sceneCode.split('resolveRetreatTargetZ(').length - 1).toBe(2);
    // The same stamina rule, still applied to both fighters by both branches.
    expect(movementCode.split('applyStaminaRegen(prev.stamina').length - 1).toBe(4);
  });

  test('nothing else in the movement path was rewired', () => {
    // The step is still 'walk' for both fighters, and both still pay the same regen.
    expect(movementCode.split("action: 'walk',").length - 1).toBe(4);
    // The movement branch itself grew no timer and no randomness.
    expect(movementCode).not.toContain('setTimeout');
    expect(movementCode).not.toContain('Math.random');
    // The report module is pure: no clock, no storage, no renderer.
    expect(reportSource).not.toContain('localStorage');
    expect(reportSource).not.toContain('Date');
    expect(reportSource).not.toContain('Math.random');
  });
});
