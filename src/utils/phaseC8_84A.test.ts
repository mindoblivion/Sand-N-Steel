/**
 * Turn-action Dodge affordability - C-8.84A.
 *
 * `DODGE_STAMINA_COST` (12 SP) buys the Dodge STANCE. C-8.83B settled what a
 * REACTION to an announced strike charges, and its path refuses an unaffordable
 * new stance (`planDodgeReaction` -> 'refused'). The player's own TURN action never
 * had that test: `executeCombatTurn`'s dodge branch bills with
 * `Math.max(0, prev.stamina - DODGE_STAMINA_COST)`, which does not refuse anything
 * -- it CLAMPS. A turn-action Dodge taken at 0-11 SP therefore set `isInvulnerable`,
 * recorded a dodge in `dodgesPerformed` and consumed the turn, for free.
 *
 * The tactic panel's button is disabled below 12 SP, so this was reachable only
 * through a stale panel (or any direct call), which is exactly the class of hole
 * C-8.75E closed for strikes: the RESOLUTION must refuse, not just the selection.
 * C-8.84A adds that guard, in the same place and under the same contract.
 *
 * What this suite pins:
 *
 *   A  the guard's placement - both actors since C-8.84B, before the stance
 *      pre-clear, the dodge
 *      counter and the `resolvingRef` commit
 *   B  the threshold - 0-11 refused, 12 and above accepted
 *   C  the turn action end to end - refusal leaves no stance / counter / turn, and
 *      a paid Dodge charges exactly 12 exactly once
 *   D  the C-8.83B reaction path and its free reaffirmation unchanged
 *   E  Shield Guard, strike affordability and the existing refusal feedback
 *      unchanged
 *
 * How faithful is the driver? The stance, the counter and the charge are decided by
 * the real helpers (`canAffordDodge`, `applyDefensiveAction`, `clearDefensiveStance`,
 * `resolveTurnEndDefensive`, `planDodgeReaction`), and section A binds the driver's
 * write order to the shipped handler: if the guard moves after the stance pre-clear,
 * the counter or the commit, section A fails.
 *
 * Limitation, stated rather than papered over: this is NOT live-duel acceptance and
 * NOT Android acceptance. No 3D scene is mounted, no wall clock is exercised, and the
 * component's React writes cannot be mounted here (this repo has no DOM renderer for
 * `DuelScene`). It proves the affordability contract, not how the refusal feels.
 *
 * Run with: bun test src/utils/phaseC8_84A.test.ts
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DODGE_EVADE_CHANCE,
  DODGE_EVADE_PERCENT,
  DODGE_STAMINA_COST,
  applyDefensiveAction,
  canAffordDodge,
  clearDefensiveStance,
  getStaminaCost,
  planDodgeReaction,
  resolveTurnEndDefensive,
  shieldGuardStaminaGain,
} from './combatCalculations';
import type { DefensiveStance } from './combatCalculations';
import { canAffordAttack } from './aiActionSelection';
import { getWeaponByType } from '../data/itemsDB';

const DUEL_SOURCE = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const AI_SOURCE = readFileSync(new URL('./aiActionSelection.ts', import.meta.url), 'utf8');

/**
 * The body of a `const NAME = useCallback(...)` callback, brace-matched while
 * skipping strings and comments. A missing callback fails loudly instead of
 * testing nothing.
 */
function callbackBody(marker: string): string {
  const start = DUEL_SOURCE.indexOf(marker);
  if (start < 0) throw new Error(`callback marker missing: ${marker}`);
  const arrow = DUEL_SOURCE.indexOf('=> {', start);
  if (arrow < 0) throw new Error(`callback arrow missing: ${marker}`);
  const open = DUEL_SOURCE.indexOf('{', arrow);

  let depth = 0;
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < DUEL_SOURCE.length; i++) {
    const char = DUEL_SOURCE[i];
    const next = DUEL_SOURCE[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') {
        i++;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return DUEL_SOURCE.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced callback body: ${marker}`);
}

const RESOLVE_BODY = callbackBody('const executeCombatTurn = useCallback(');
const REACTION_BODY = callbackBody('const reactToPendingAttack = useCallback(');

/** The executed body with `//` comments stripped -- ordering reads code, not prose. */
const RESOLVE_CODE = RESOLVE_BODY.split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

/** The shipped dodge branch of `executeCombatTurn`. */
const TURN_DODGE_BRANCH = (() => {
  const start = DUEL_SOURCE.indexOf("} else if (actionType === 'dodge') {");
  const end = DUEL_SOURCE.indexOf("} else if (actionType === 'taunt') {");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return DUEL_SOURCE.slice(start, end);
})();

/** The shipped Shield Guard branch of `executeCombatTurn`. */
const TURN_GUARD_BRANCH = (() => {
  const start = DUEL_SOURCE.indexOf("else if (actionType === 'shield_block') {");
  const end = DUEL_SOURCE.indexOf("} else if (actionType === 'dodge') {");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return DUEL_SOURCE.slice(start, end);
})();

/** The dodge affordability guard, as it is written in the resolution. */
const GUARD_TEXT = 'canAffordDodge(attackerNow.stamina)';
const DODGE_REFUSAL_COPY = 'is too winded to take an evasion stance.';

// -- the turn-action stand-in -------------------------------------------------

interface TurnDuel {
  stance: DefensiveStance;
  stamina: number;
  dodgesPerformed: number;
  /** `resolvingRef.current` / `setIsExecuting` -- the turn was committed. */
  turnConsumed: boolean;
  logs: Array<{ text: string; type: string }>;
  refused: boolean;
}

const OPEN: DefensiveStance = { isBlocking: false, isInvulnerable: false };
const DODGING: DefensiveStance = { isBlocking: false, isInvulnerable: true };

function freshTurn(stamina: number, stance: DefensiveStance = OPEN): TurnDuel {
  return {
    stance: { ...stance },
    stamina,
    dodgesPerformed: 0,
    turnConsumed: false,
    logs: [],
    refused: false,
  };
}

/**
 * One player turn-action Dodge, in the shipped order: the affordability guard,
 * then the commit, then the stance pre-clear, then the branch's own writes.
 */
function turnDodge(duel: TurnDuel): TurnDuel {
  // C-8.84A guard -- must run before ANY mutation.
  if (!canAffordDodge(duel.stamina)) {
    duel.refused = true;
    duel.logs.push({ text: DODGE_REFUSAL_COPY, type: 'system' });
    return duel;
  }

  // `resolvingRef.current = true; setIsExecuting(true);`
  duel.turnConsumed = true;
  // The stance pre-clear at the top of the turn, then the branch's own writes.
  duel.stance = applyDefensiveAction(clearDefensiveStance(duel.stance), 'dodge');
  duel.stamina = Math.max(0, duel.stamina - DODGE_STAMINA_COST);
  duel.dodgesPerformed += 1;
  return duel;
}

const WEAPON = getWeaponByType('sword_shield');
const LIGHT_COST = getStaminaCost(WEAPON, true);

// -- A. The guard and where it sits -------------------------------------------

describe('A - the resolution refuses an unaffordable Dodge, before it mutates anything', () => {
  test('the turn branch still clamps, which is exactly why the guard is required', () => {
    // Not a target of this phase: the branch keeps its clamp (C-8.75E left the
    // strike branch the same way). The guard upstream is what makes it unreachable
    // below the cost, so this stays pinned rather than quietly rewritten.
    expect(TURN_DODGE_BRANCH.split('Math.max(0, prev.stamina - DODGE_STAMINA_COST)').length - 1).toBe(2);
    expect(TURN_DODGE_BRANCH.split('dodgesPerformed += 1').length - 1).toBe(1);
  });

  test('the guard is the shared predicate, not a literal or a clamp', () => {
    expect(RESOLVE_CODE).toContain(GUARD_TEXT);
    expect(RESOLVE_CODE).not.toContain('attackerNow.stamina < 12');
    expect(RESOLVE_CODE).not.toContain('attackerNow.stamina < DODGE_STAMINA_COST');
  });

  test('the guard covers BOTH actors (rebased by C-8.84B, which closed the AI half)', () => {
    const guard = RESOLVE_CODE.indexOf(GUARD_TEXT);
    expect(guard).toBeGreaterThan(-1);
    const lineStart = RESOLVE_CODE.lastIndexOf('\n', guard);
    const line = RESOLVE_CODE.slice(lineStart, RESOLVE_CODE.indexOf('\n', guard));
    expect(line).toContain("actionType === 'dodge'");
    // C-8.84B removed the `isActorPlayer` narrowing this test used to pin, and the
    // AI's own selection now reads the same predicate instead of waving Dodge
    // through (see phaseC8_84B.test.ts for the AI half of the contract).
    expect(line).not.toContain('isActorPlayer');
    expect(AI_SOURCE).toContain('canAffordDodge');
  });

  test('it runs after the strike guards and before the commit', () => {
    const range = RESOLVE_CODE.indexOf('isAttackInRange(gap, attackerNow.loadout.weapon)');
    const strikeAfford = RESOLVE_CODE.indexOf('canAffordAttack(attackerNow.stamina');
    const dodgeAfford = RESOLVE_CODE.indexOf(GUARD_TEXT);
    const commit = RESOLVE_CODE.indexOf('resolvingRef.current = true');
    expect(range).toBeGreaterThan(-1);
    expect(strikeAfford).toBeGreaterThan(range);
    expect(dodgeAfford).toBeGreaterThan(strikeAfford);
    expect(commit).toBeGreaterThan(dodgeAfford);
  });

  test('it runs before the stance pre-clear, the counter and the branch', () => {
    const dodgeAfford = RESOLVE_CODE.indexOf(GUARD_TEXT);
    const preClear = RESOLVE_CODE.indexOf('prev.isInvulnerable || prev.isBlocking');
    const preClearWrite = RESOLVE_CODE.indexOf(
      '? { ...prev, isInvulnerable: false, isBlocking: false }',
    );
    const counter = RESOLVE_CODE.indexOf('statsRef.current.dodgesPerformed += 1');
    expect(dodgeAfford).toBeGreaterThan(-1);
    // A refused Dodge must not consume a held stance...
    expect(preClear).toBeGreaterThan(dodgeAfford);
    expect(preClearWrite).toBeGreaterThan(dodgeAfford);
    // ...nor count as one.
    expect(counter).toBeGreaterThan(dodgeAfford);
  });

  test('the refusal reports itself in the existing system-log channel', () => {
    const refusalBlock = RESOLVE_CODE.slice(
      RESOLVE_CODE.indexOf(GUARD_TEXT),
      RESOLVE_CODE.indexOf('resolvingRef.current = true'),
    );
    expect(refusalBlock).toContain(DODGE_REFUSAL_COPY);
    expect(refusalBlock).toContain("'system'");
    expect(refusalBlock).toContain('return;');
  });
});

// -- B. The threshold ---------------------------------------------------------

describe('B - 12 SP is the line, and nothing else moves it', () => {
  test('0-11 SP cannot buy a stance', () => {
    for (let stamina = 0; stamina < DODGE_STAMINA_COST; stamina += 1) {
      expect(canAffordDodge(stamina)).toBe(false);
    }
  });

  test('exactly 12 and above can', () => {
    expect(canAffordDodge(DODGE_STAMINA_COST)).toBe(true);
    expect(canAffordDodge(DODGE_STAMINA_COST + 1)).toBe(true);
    expect(canAffordDodge(100)).toBe(true);
  });

  test('a non-finite stamina reads as unaffordable, like the strike guard', () => {
    expect(canAffordDodge(Number.NaN)).toBe(false);
    expect(canAffordDodge(Number.POSITIVE_INFINITY)).toBe(false);
    expect(canAffordAttack(Number.NaN, WEAPON, 'quick_attack')).toBe(false);
  });
});

// -- C. The turn action, end to end -------------------------------------------

describe('C - what the turn action does at each stamina', () => {
  test('0 SP: refused, no stance, no counter, no turn', () => {
    const duel = turnDodge(freshTurn(0));
    expect(duel.refused).toBe(true);
    expect(duel.stance).toEqual(OPEN);
    expect(duel.dodgesPerformed).toBe(0);
    expect(duel.turnConsumed).toBe(false);
    expect(duel.stamina).toBe(0);
    expect(duel.logs).toEqual([{ text: DODGE_REFUSAL_COPY, type: 'system' }]);
  });

  test('1-11 SP: the same refusal, for every value', () => {
    for (let stamina = 1; stamina < DODGE_STAMINA_COST; stamina += 1) {
      const duel = turnDodge(freshTurn(stamina));
      expect(duel.refused).toBe(true);
      expect(duel.stance).toEqual(OPEN);
      expect(duel.dodgesPerformed).toBe(0);
      expect(duel.turnConsumed).toBe(false);
      expect(duel.stamina).toBe(stamina);
    }
  });

  test('a refused Dodge cannot consume a stance the player is already holding', () => {
    const duel = turnDodge(freshTurn(11, DODGING));
    expect(duel.refused).toBe(true);
    // The guard returned before the pre-clear, so the paid-for stance survives.
    expect(duel.stance).toEqual(DODGING);
    expect(duel.turnConsumed).toBe(false);
    expect(duel.dodgesPerformed).toBe(0);
  });

  test('exactly 12 SP: activates, leaves 0, counts one dodge, spends the turn', () => {
    const duel = turnDodge(freshTurn(DODGE_STAMINA_COST));
    expect(duel.refused).toBe(false);
    expect(duel.stance).toEqual({ isBlocking: false, isInvulnerable: true });
    expect(duel.stamina).toBe(0);
    expect(duel.dodgesPerformed).toBe(1);
    expect(duel.turnConsumed).toBe(true);
    expect(duel.logs).toEqual([]);
  });

  test('more than 12 SP: exactly 12 is charged', () => {
    const cases: Array<[number, number]> = [
      [DODGE_STAMINA_COST + 1, 1],
      [50, 50 - DODGE_STAMINA_COST],
      [100, 100 - DODGE_STAMINA_COST],
    ];
    for (const [stamina, left] of cases) {
      const duel = turnDodge(freshTurn(stamina));
      expect(duel.stamina).toBe(left);
      expect(stamina - duel.stamina).toBe(DODGE_STAMINA_COST);
      expect(duel.dodgesPerformed).toBe(1);
      expect(duel.stance.isInvulnerable).toBe(true);
    }
  });

  test('negative control: without the guard the free stance is exactly the reported defect', () => {
    // The clamp alone, i.e. the pre-C-8.84A resolution at 5 SP.
    const unguarded = freshTurn(5);
    unguarded.stance = applyDefensiveAction(clearDefensiveStance(unguarded.stance), 'dodge');
    unguarded.stamina = Math.max(0, unguarded.stamina - DODGE_STAMINA_COST);
    unguarded.dodgesPerformed += 1;
    unguarded.turnConsumed = true;
    expect(unguarded.stance.isInvulnerable).toBe(true);
    expect(unguarded.stamina).toBe(0);
    expect(unguarded.dodgesPerformed).toBe(1);
    // The same inputs through the shipped guard: nothing happens.
    const guarded = turnDodge(freshTurn(5));
    expect(guarded.refused).toBe(true);
    expect(guarded.stance).toEqual(OPEN);
  });

  test('the stance still runs the turn boundary and an 88 % impact-time evade', () => {
    const duel = turnDodge(freshTurn(100));
    // The turn-end cleanup preserves both flags (unchanged by this phase).
    duel.stance = resolveTurnEndDefensive(duel.stance);
    expect(duel.stance.isInvulnerable).toBe(true);
    expect(DODGE_EVADE_CHANCE).toBe(0.88);
    expect(DODGE_EVADE_PERCENT).toBe(88);
    // The impact still reads the flag the paid stance leaves standing.
    expect(DUEL_SOURCE).toContain(
      'const isEvaded = defender.isInvulnerable && Math.random() < DODGE_EVADE_CHANCE;',
    );
  });
});

// -- D. The reaction path is untouched ----------------------------------------

describe('D - C-8.83B reaction behaviour, including the free reaffirmation', () => {
  test('the reaction charges by plan, and a held stance still reaffirms for nothing', () => {
    expect(planDodgeReaction(OPEN, DODGE_STAMINA_COST - 1)).toEqual({
      kind: 'refused',
      staminaCost: 0,
      countsDodge: false,
    });
    expect(planDodgeReaction(OPEN, DODGE_STAMINA_COST)).toEqual({
      kind: 'activate',
      staminaCost: DODGE_STAMINA_COST,
      countsDodge: true,
    });
    // The reaffirmation at ANY stamina, including 0 -- the whole point of C-8.83B.
    for (const stamina of [0, 5, DODGE_STAMINA_COST - 1, 88]) {
      expect(planDodgeReaction(DODGING, stamina)).toEqual({
        kind: 'reaffirm',
        staminaCost: 0,
        countsDodge: false,
      });
    }
  });

  test('the reaction handler does not use the turn guard', () => {
    // A held stance must stay free to reaffirm even at 0 SP, so the new turn guard
    // is deliberately absent from the reaction path.
    expect(REACTION_BODY).not.toContain('canAffordDodge');
    expect(REACTION_BODY).toContain('planDodgeReaction(');
  });

  test('one stance is still paid for once, however many times it is set', () => {
    let stamina = 88;
    let dodges = 1;
    for (let press = 0; press < 5; press += 1) {
      const plan = planDodgeReaction(DODGING, stamina);
      stamina = Math.max(0, stamina - plan.staminaCost);
      if (plan.countsDodge) dodges += 1;
    }
    expect(stamina).toBe(88);
    expect(dodges).toBe(1);
  });
});

// -- E. Nothing else moved ----------------------------------------------------

describe('E - Shield Guard, strike affordability and existing feedback', () => {
  test('Shield Guard keeps no stamina cost and gains no new guard', () => {
    expect(TURN_GUARD_BRANCH).not.toContain('canAffordDodge');
    expect(TURN_GUARD_BRANCH).not.toContain('prev.stamina -');
    expect(TURN_GUARD_BRANCH).toContain('isBlocking: true');
    // The guard's recovery still only lands when it stops a blow (C-8.70B R2).
    expect(shieldGuardStaminaGain(true, 12, true)).toBeGreaterThan(0);
    expect(shieldGuardStaminaGain(false, 12, true)).toBe(0);
  });

  test('strike affordability is unchanged, at its own thresholds', () => {
    expect(canAffordAttack(LIGHT_COST - 1, WEAPON, 'quick_attack')).toBe(false);
    expect(canAffordAttack(LIGHT_COST, WEAPON, 'quick_attack')).toBe(true);
    expect(canAffordAttack(0, WEAPON, 'power_attack')).toBe(false);
  });

  test('the existing strike refusal copy is preserved and still distinct', () => {
    expect(RESOLVE_CODE).toContain('is too winded to strike');
    expect(RESOLVE_CODE).toContain('the blow is lost.');
    expect(DODGE_REFUSAL_COPY).not.toContain('strike');
    // Two different refusals, so a player can tell a swing from a stance.
    expect(DODGE_REFUSAL_COPY.indexOf('evasion stance')).toBeGreaterThan(-1);
  });

  test('the out-of-range refusal still precedes both, and the costs are unchanged', () => {
    const range = RESOLVE_CODE.indexOf('is out of range');
    const dodgeAfford = RESOLVE_CODE.indexOf(GUARD_TEXT);
    expect(range).toBeGreaterThan(-1);
    expect(dodgeAfford).toBeGreaterThan(range);
    expect(DODGE_STAMINA_COST).toBe(12);
  });
});
