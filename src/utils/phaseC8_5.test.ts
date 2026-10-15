/**
 * Phase C-8.5 — Shield Block Turn Persistence (defect C-8.4) tests.
 *
 * Verifies the defensive-state lifecycle for the Shield Block fix:
 *
 *   1. Choosing shield_block sets isBlocking = true.
 *   2. The block persists through the turn-end cleanup so the opponent's
 *      incoming attack can interact with it.
 *   3. The incoming attack applies the existing block mitigation
 *      (calculateAttackDamage with isBlocked = true).
 *   4. The block is consumed (cleared) when the fighter next acts via the
 *      pre-clear, and does NOT mitigate a subsequent attack.
 *   5. Heavy-attack telegraph interactions remain correct: a block set in
 *      response to a telegraph persists across two turn boundaries until the
 *      heavy attack resolves, then is consumed on the player's next action.
 *   6. Existing dodge (isInvulnerable) behavior remains unchanged: the dodge
 *      stance persists through turn-end and is consumed on the next action,
 *      exactly as before the fix.
 *
 * The lifecycle is tested through the pure helpers extracted to
 * combatCalculations.ts (applyDefensiveAction, resolveTurnEndDefensive,
 * clearDefensiveStance) which model the same state transitions that
 * DuelScene.executeCombatTurn performs. No UI testing framework is needed.
 *
 * Run with: bun test src/utils/phaseC8_5.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import {
  applyDefensiveAction,
  resolveTurnEndDefensive,
  clearDefensiveStance,
  calculateAttackDamage,
} from './combatCalculations';

// ── Constants matching production code ─────────────────────────────────────

const BASE_DAMAGE = 20;
const ATTACKER_STR = 10;
const DEFENDER_DEF = 10;
const BLOCK_REDUCTION = 0.75;

/** Baseline: damage with no block, no crit, no rage. */
const unblockedDamage = calculateAttackDamage(
  BASE_DAMAGE, ATTACKER_STR, false, DEFENDER_DEF, false, BLOCK_REDUCTION, 1.0,
);

/** Blocked: same hit but with isBlocked = true. */
const blockedDamage = calculateAttackDamage(
  BASE_DAMAGE, ATTACKER_STR, false, DEFENDER_DEF, true, BLOCK_REDUCTION, 1.0,
);

// ── 1. Shield Block sets the defensive stance ──────────────────────────────

describe('C-8.5 — Shield Block sets isBlocking', () => {
  test('applyDefensiveAction with shield_block sets isBlocking true', () => {
    const initial = { isBlocking: false, isInvulnerable: false };
    const after = applyDefensiveAction(initial, 'shield_block');
    expect(after.isBlocking).toBe(true);
  });

  test('shield_block does not set isInvulnerable', () => {
    const initial = { isBlocking: false, isInvulnerable: false };
    const after = applyDefensiveAction(initial, 'shield_block');
    expect(after.isInvulnerable).toBe(false);
  });

  test('other actions do not set isBlocking', () => {
    const initial = { isBlocking: false, isInvulnerable: false };
    const after = applyDefensiveAction(initial, 'other');
    expect(after.isBlocking).toBe(false);
  });
});

// ── 2. Block persists through turn-end ─────────────────────────────────────

describe('C-8.5 — Block persists through turn-end', () => {
  test('resolveTurnEndDefensive preserves isBlocking = true', () => {
    const afterBlock = applyDefensiveAction(
      { isBlocking: false, isInvulnerable: false },
      'shield_block',
    );
    const afterTurnEnd = resolveTurnEndDefensive(afterBlock);
    expect(afterTurnEnd.isBlocking).toBe(true);
  });

  test('resolveTurnEndDefensive does not introduce isInvulnerable', () => {
    const afterBlock = applyDefensiveAction(
      { isBlocking: false, isInvulnerable: false },
      'shield_block',
    );
    const afterTurnEnd = resolveTurnEndDefensive(afterBlock);
    expect(afterTurnEnd.isInvulnerable).toBe(false);
  });
});

// ── 3. Incoming attack applies block mitigation ───────────────────────────

describe('C-8.5 — Incoming attack applies block mitigation', () => {
  test('blocked damage is less than unblocked damage', () => {
    expect(blockedDamage).toBeLessThan(unblockedDamage);
  });

  test('blocked damage applies weapon.blockReduction', () => {
    // With blockReduction 0.75, the blocked hit should be 25% of the
    // unblocked hit (rounded independently, so allow ±1).
    const expected = Math.max(1, Math.round(unblockedDamage * (1 - BLOCK_REDUCTION)));
    expect(blockedDamage).toBeGreaterThanOrEqual(expected - 1);
    expect(blockedDamage).toBeLessThanOrEqual(expected + 1);
  });

  test('blocked damage is at least 1 (floor)', () => {
    const minDmg = calculateAttackDamage(
      1, 0, false, 100, true, 0.85, 1.0,
    );
    expect(minDmg).toBeGreaterThanOrEqual(1);
  });
});

// ── 4. Block is consumed on next action and does not persist ───────────────

describe('C-8.5 — Block is consumed by pre-clear on next action', () => {
  test('clearDefensiveStance resets isBlocking to false', () => {
    const afterBlock = applyDefensiveAction(
      { isBlocking: false, isInvulnerable: false },
      'shield_block',
    );
    const afterTurnEnd = resolveTurnEndDefensive(afterBlock);
    const afterPreClear = clearDefensiveStance(afterTurnEnd);
    expect(afterPreClear.isBlocking).toBe(false);
  });

  test('after pre-clear, a second attack is NOT blocked', () => {
    // Simulate: block → turn-end → pre-clear → second incoming attack
    const afterPreClear = clearDefensiveStance(
      resolveTurnEndDefensive(
        applyDefensiveAction({ isBlocking: false, isInvulnerable: false }, 'shield_block'),
      ),
    );
    // The second attack reads isBlocked from the stance — now false
    const secondHitBlocked = calculateAttackDamage(
      BASE_DAMAGE, ATTACKER_STR, false, DEFENDER_DEF,
      afterPreClear.isBlocking, BLOCK_REDUCTION, 1.0,
    );
    expect(secondHitBlocked).toBe(unblockedDamage);
  });

  test('block does not protect against multiple attacks', () => {
    // First attack: block is active → reduced damage
    const stanceAfterBlock = resolveTurnEndDefensive(
      applyDefensiveAction({ isBlocking: false, isInvulnerable: false }, 'shield_block'),
    );
    const firstHit = calculateAttackDamage(
      BASE_DAMAGE, ATTACKER_STR, false, DEFENDER_DEF,
      stanceAfterBlock.isBlocking, BLOCK_REDUCTION, 1.0,
    );
    expect(firstHit).toBe(blockedDamage);

    // Fighter takes their next action → pre-clear consumes the block
    const stanceAfterPreClear = clearDefensiveStance(stanceAfterBlock);
    const secondHit = calculateAttackDamage(
      BASE_DAMAGE, ATTACKER_STR, false, DEFENDER_DEF,
      stanceAfterPreClear.isBlocking, BLOCK_REDUCTION, 1.0,
    );
    expect(secondHit).toBe(unblockedDamage);
    expect(secondHit).toBeGreaterThan(firstHit);
  });
});

// ── 5. Heavy-attack telegraph interactions ──────────────────────────────────

describe('C-8.5 — Heavy telegraph: block persists across two turn boundaries', () => {
  test('block survives two turn-end transitions before heavy attack resolves', () => {
    // Turn 1 (boss): telegraph announced. (No block set yet.)
    // Turn 2 (player): player chooses shield_block
    let stance = applyDefensiveAction(
      { isBlocking: false, isInvulnerable: false },
      'shield_block',
    );
    expect(stance.isBlocking).toBe(true);

    // Player's turn-end: block persists
    stance = resolveTurnEndDefensive(stance);
    expect(stance.isBlocking).toBe(true);

    // Turn 3 (boss): heavy attack resolves — block is still active
    const heavyHitDamage = calculateAttackDamage(
      40, ATTACKER_STR, false, DEFENDER_DEF,
      stance.isBlocking, BLOCK_REDUCTION, 1.0,
    );
    // Should be significantly less than the unblocked heavy hit
    const heavyUnblocked = calculateAttackDamage(
      40, ATTACKER_STR, false, DEFENDER_DEF,
      false, BLOCK_REDUCTION, 1.0,
    );
    expect(heavyHitDamage).toBeLessThan(heavyUnblocked);

    // Boss's turn-end: block still persists (opponent's cleanup doesn't
    // clear the player's stance)
    stance = resolveTurnEndDefensive(stance);
    expect(stance.isBlocking).toBe(true);

    // Turn 4 (player): player acts → pre-clear consumes the block
    stance = clearDefensiveStance(stance);
    expect(stance.isBlocking).toBe(false);
  });
});

// ── 6. Dodge (isInvulnerable) behavior unchanged ───────────────────────────

describe('C-8.5 — Dodge behavior unchanged', () => {
  test('dodge sets isInvulnerable, not isBlocking', () => {
    const after = applyDefensiveAction(
      { isBlocking: false, isInvulnerable: false },
      'dodge',
    );
    expect(after.isInvulnerable).toBe(true);
    expect(after.isBlocking).toBe(false);
  });

  test('dodge persists through turn-end', () => {
    const afterDodge = applyDefensiveAction(
      { isBlocking: false, isInvulnerable: false },
      'dodge',
    );
    const afterTurnEnd = resolveTurnEndDefensive(afterDodge);
    expect(afterTurnEnd.isInvulnerable).toBe(true);
  });

  test('dodge is consumed by pre-clear on next action', () => {
    const afterDodge = applyDefensiveAction(
      { isBlocking: false, isInvulnerable: false },
      'dodge',
    );
    const afterTurnEnd = resolveTurnEndDefensive(afterDodge);
    const afterPreClear = clearDefensiveStance(afterTurnEnd);
    expect(afterPreClear.isInvulnerable).toBe(false);
  });

  test('pre-clear consumes both block and dodge simultaneously', () => {
    // Fighter blocked last turn, then dodges this turn.
    // Pre-clear should remove the lingering block before dodge is set.
    const afterBlock = resolveTurnEndDefensive(
      applyDefensiveAction({ isBlocking: false, isInvulnerable: false }, 'shield_block'),
    );
    const afterPreClear = clearDefensiveStance(afterBlock);
    expect(afterPreClear.isBlocking).toBe(false);
    expect(afterPreClear.isInvulnerable).toBe(false);

    // Then dodge is applied fresh
    const afterDodge = applyDefensiveAction(afterPreClear, 'dodge');
    expect(afterDodge.isInvulnerable).toBe(true);
    expect(afterDodge.isBlocking).toBe(false);
  });
});
