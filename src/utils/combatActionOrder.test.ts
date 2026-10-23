/**
 * Combat action validation and wind-up order (C-8.71A).
 *
 * The phase audited the order of operations a strike goes through and pinned the
 * one property the range gate exists for: a swing that cannot reach its target
 * costs NOTHING — no stamina, no animation, no damage, no opponent response and
 * no turn — and leaves no per-resolution state behind. It also pins the timing
 * the wind-up actually ships, so a later phase that wants a delayed player hit
 * has to move these numbers deliberately instead of by accident.
 *
 * Two registers, as the neighbouring suites use them: pure helpers where one
 * exists (`isAttackInRange`, the shared cost rule) and ordered source assertions
 * for the wiring (this repo has no DOM renderer to mount `DuelScene` under).
 * Source slices are anchored on CODE markers, never on prose.
 *
 * Run with: bun test src/utils/combatActionOrder.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  isAttackInRange,
  getStaminaCost,
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
  DEFENSE_MITIGATION_FACTOR,
  CRIT_MULTIPLIER,
  STRENGTH_BONUS_PER_POINT,
} from './combatCalculations';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import type { WeaponItem } from '../types/game';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../components/ui/TurnActionPanel.tsx', import.meta.url),
  'utf8',
);

/** Index of a marker that must exist, reported by name when it does not. */
function at(source: string, marker: string): number {
  const index = source.indexOf(marker);
  expect({ marker, found: index >= 0 }).toEqual({ marker, found: true });
  return index;
}

/** The slice between two markers, both required. */
function between(source: string, start: string, end: string): string {
  const from = at(source, start);
  const to = at(source, end);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

// The guard's own block: from the shared range test through its refusal.
const guardStart = 'if (!isAttackInRange(gap, attackerNow.loadout.weapon)) {';
const commitMarker = 'resolvingRef.current = true;';

/**
 * The brace-balanced block that STARTS at `start` (inclusive).
 *
 * C-8.75E added a second guard (strike affordability) beside the range guard,
 * before the same `resolvingRef` commit, so a slice that runs to the commit
 * marker no longer means "the refusal". This returns exactly one block, so the
 * claim each slice makes is unchanged and precisely delimited.
 */
function blockAt(source: string, start: string): string {
  const from = at(source, start); // eslint-disable-line @typescript-eslint/no-use-before-define
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  throw new Error(`unbalanced block at ${start}`);
}

/**
 * The RANGE guard's own refusal, brace-balanced.
 *
 * C-8.75E added the affordability guard beside it (before the same commit), so
 * the pins below stop at this block: they still assert exactly what C-8.71A
 * established — that the range refusal costs nothing — without being tripped by
 * an unrelated guard that happens to sit further down.
 */
const rangeRefusal = blockAt(duelSource, guardStart);

// ── §A. A refused strike costs nothing ─────────────────────────────────────

describe('§A — an out-of-range strike is refused before it costs anything', () => {
  test('the refusal is a log line and a return: no stamina, animation, damage or timer', () => {
    const refusal = rangeRefusal;

    expect(refusal).toContain('addLog(');
    expect(refusal).toContain('return;');
    // Nothing a landed or even attempted strike would touch appears here.
    expect(refusal).not.toContain('stamina');
    expect(refusal).not.toContain('getStaminaCost(');
    expect(refusal).not.toContain('setPlayer(');
    expect(refusal).not.toContain('setOpp(');
    expect(refusal).not.toContain('calculateHitChance(');
    expect(refusal).not.toContain('calculateAttackDamage(');
    expect(refusal).not.toContain('Math.random(');
    expect(refusal).not.toContain('resolutionTimerRef');
    expect(refusal).not.toContain('spawnDamageText(');
    expect(refusal).not.toContain('sounds.');
    expect(refusal).not.toContain('impactRef');
    expect(refusal).not.toContain('setIsExecuting(true)');
  });

  test('the range guard precedes the cost, the roll, the animation and the turn timer', () => {
    const guard = at(duelSource, guardStart);
    const cost = at(duelSource, 'const staminaCost = getStaminaCost(attacker.loadout.weapon, isQuick);');
    const hit = at(duelSource, 'const hitPct = calculateHitChance(isQuick, attacker.stats.agility, defender.stats.agility);');
    const damage = at(duelSource, 'calculateAttackDamage(');
    const timer = at(duelSource, 'resolutionTimerRef.current = setTimeout(');
    const toggle = at(duelSource, 'setIsPlayerTurn(!isActorPlayer);');

    expect(guard).toBeLessThan(cost);
    expect(cost).toBeLessThan(hit);
    expect(hit).toBeLessThan(damage);
    expect(guard).toBeLessThan(timer);
    expect(timer).toBeLessThan(toggle);
  });

  test('the engine and the tactic panel read the one shared range rule', () => {
    expect(duelSource).toContain('isAttackInRange(gap, attackerNow.loadout.weapon)');
    expect(panelSource).toContain('isAttackInRange(distance, player.loadout.weapon)');
    // Neither site re-implements the comparison the helper owns.
    expect(duelSource).not.toContain('<= getWeaponRange');
    expect(panelSource).not.toContain('<= getWeaponRange');
  });
});

// ── §B. A refused strike cannot consume or advance the turn ────────────────

describe('§B — a refused strike never holds or advances the turn', () => {
  test('the resolution timer is the only turn advance, and it is scheduled after the guard', () => {
    const toggles = duelSource.split('setIsPlayerTurn(').length - 1;
    // The 1100 ms resolution timer, the range guard's refusal release (C-8.71A)
    // and the affordability guard's refusal release (C-8.75E).
    expect(toggles).toBe(3);
    expect(at(duelSource, guardStart)).toBeLessThan(at(duelSource, commitMarker));
  });

  test('a refused announced strike releases the lock and hands the turn back', () => {
    const refusal = rangeRefusal;

    expect(refusal).toContain('if (!isActorPlayer && isExecuting) {');
    const release = between(refusal, 'if (!isActorPlayer && isExecuting) {', 'return;');
    expect(release).toContain('setIsExecuting(false);');
    expect(release).toContain('setIsPlayerTurn(true);');
    // The release sits inside the refusal, before the return that ends it.
    expect(refusal.indexOf('setIsPlayerTurn(true);')).toBeLessThan(refusal.indexOf('return;'));
  });

  test('the release can only belong to an announced opponent strike, never a player action', () => {
    expect(duelSource.split('if (!isActorPlayer && isExecuting) {').length - 1).toBe(1);
  });
});

// ── §C. Nothing per-resolution leaks out of a refused strike ───────────────

describe('§C — the telegraphed-heavy marker is cleared before any refusal', () => {
  test('the read-and-clear precedes the range guard', () => {
    const clear = at(duelSource, 'telegraphLandingRef.current = false;');
    expect(clear).toBeLessThan(at(duelSource, guardStart));
    // Exactly one clear per resolution, and the read sits beside it.
    expect(duelSource.split('telegraphLandingRef.current = false;').length - 1).toBe(1);
    expect(at(duelSource, 'const isTelegraphedHeavy = !isActorPlayer && telegraphLandingRef.current;'))
      .toBeLessThan(at(duelSource, guardStart));
  });

  test('no branch returns between the actor being resolved and the marker being cleared', () => {
    const head = between(
      duelSource,
      'const isActorPlayer = actor === \'player\';',
      'telegraphLandingRef.current = false;',
    );
    expect(head).not.toContain('return;');
  });
});

// ── §D. The refusal is legible ─────────────────────────────────────────────

describe('§D — the player is told why the strike was refused', () => {
  test('the chronicle line names the reason and the remedy', () => {
    const refusal = rangeRefusal;
    expect(refusal).toContain('is out of range — Advance before striking.');
    expect(refusal).toContain("'system'");
  });

  test('the tactic panel explains the same rule on both strike buttons', () => {
    expect(panelSource.split('Out of range — Advance to strike').length - 1).toBe(2);
    expect(panelSource).toContain("'OUT OF RANGE'");
    expect(panelSource).toContain("'IN STRIKE RANGE'");
  });
});

// ── §E. An in-range strike is untouched ────────────────────────────────────

describe('§E — a legal strike still costs, rolls and lands exactly as before', () => {
  const attackBranch = between(
    duelSource,
    "else if (actionType === 'quick_attack' || actionType === 'power_attack') {",
    '// 4. ANIMATION RESOLUTION & TURN TRANSITION (1100ms)',
  );

  test('the attack branch still spends the weapon cost, rolls and resolves damage', () => {
    expect(attackBranch).toContain('getStaminaCost(attacker.loadout.weapon, isQuick)');
    expect(attackBranch.split('stamina: Math.max(0, prev.stamina - staminaCost)').length - 1).toBe(2);
    expect(attackBranch).toContain('calculateHitChance(isQuick, attacker.stats.agility, defender.stats.agility)');
    expect(attackBranch).toContain('calculateAttackDamage(');
    expect(attackBranch).toContain('defender.isInvulnerable');
  });

  test('the ship cost is one helper: nothing hardcodes a strike price', () => {
    expect(duelSource).not.toContain('prev.stamina - 10');
    expect(duelSource).not.toContain('prev.stamina - 22');
    const gladius = DEFAULT_PLAYER_WEAPON as WeaponItem;
    expect(getStaminaCost(gladius, true)).toBe(gladius.staminaLight);
    expect(getStaminaCost(gladius, false)).toBe(gladius.staminaHeavy);
    // And the shared rule itself still accepts the edge and refuses beyond it.
    expect(isAttackInRange(gladius.range, gladius)).toBe(true);
    expect(isAttackInRange(gladius.range + 0.0001, gladius)).toBe(false);
  });
});

// ── §F. The wind-up timing this phase did NOT change ───────────────────────

describe('§F — the shipped timing: both fighters wind up and the cue is answerable', () => {
  test('the opponent\'s swing is announced and its damage resolved later, by the controller', () => {
    const announce = between(
      duelSource,
      'const announceEnemyAttack = useCallback(',
      'const reactToPendingAttack = useCallback(',
    );
    expect(announce).toContain('strikeRef.current?.announce(');
    expect(announce).toContain("executeTurnRef.current('opponent', landing);");
    expect(announce).toContain('setIsExecuting(true);');
    // The announcement starts the swing animation and nothing else: no damage,
    // no stamina, no turn timer, no settlement.
    expect(announce).not.toContain('calculateAttackDamage(');
    expect(announce).not.toContain('calculateHitChance(');
    expect(announce).not.toContain('stamina:');
    expect(announce).not.toContain('resolutionTimerRef');
    expect(announce).not.toContain('onMatchComplete');
  });

  test('the wind-up and the resolution window keep their audited lengths', () => {
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(duelSource).toContain('}, 1100);');
    expect(duelSource).toContain('}, 750);');
  });

  test('the player\'s strike is committed at once but RESOLVED at the end of its wind-up', () => {
    // C-8.71B rebased this pin deliberately — C-8.71A wrote it so that a delayed
    // player hit would move these assertions on purpose rather than by accident.
    // The branch still spends, starts the swing and carries the roll in ONE
    // place, but the player's roll is handed to the one-impact controller
    // instead of running in the commit; the branch itself still owns no timer
    // (the controller does), and the shared 1100 ms timer still owns the turn.
    expect(duelSource).toContain("onExecuteAction={(action) => executeCombatTurn('player', action)}");
    expect(duelSource).toContain('const resolveImpact = () => {');
    expect(duelSource).toContain('playerStrikeRef.current?.strike(actionType, resolveImpact)');
    expect(duelSource).not.toContain('pendingPlayerStrike');
    expect(duelSource).not.toContain('announcePlayerAttack');
    const attackBranch = between(
      duelSource,
      "else if (actionType === 'quick_attack' || actionType === 'power_attack') {",
      '// 4. ANIMATION RESOLUTION & TURN TRANSITION (1100ms)',
    );
    // The swing animation still precedes the roll it labels, and the deferred
    // impact still lives in this branch: one path, one formula, no second timer.
    expect(attackBranch.indexOf('action: isQuick ? \'attack_light\' : \'attack_heavy\''))
      .toBeLessThan(attackBranch.indexOf('calculateAttackDamage('));
    expect(attackBranch).not.toContain('setTimeout(');
  });
});

// ── §G. Scope guard: no balance value moved with this fix ─────────────────

describe('§G — the fix moved no combat value', () => {
  test('the shared constants are the audited ones', () => {
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(DEFENSE_MITIGATION_FACTOR).toBe(2.5);
    expect(CRIT_MULTIPLIER).toBe(1.5);
    expect(STRENGTH_BONUS_PER_POINT).toBe(0.05);
  });

  test('the refusal block adds no new rule table of its own', () => {
    const refusal = rangeRefusal;
    // Four statements or fewer beyond the log: the release pair and the return.
    expect(refusal.split('\n').filter((line) => line.trim().startsWith('set')).length).toBe(2);
    expect(refusal).not.toContain('gap >');
    expect(refusal).not.toContain('0.5');
  });
});

// ── §H. The queued counter is announced, not resolved (C-8.75D) ────────────

/**
 * `source` with `//` line comments removed.
 *
 * Valéria's counter branch carries a long prose comment that NAMES the call the
 * fix stopped making, so a plain `not.toContain('executeCombatTurn(...)')` over
 * the raw slice would be satisfied — or tripped — by the explanation of the fix
 * rather than by the fix itself. Every pin below runs on code only.
 */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('§H — Valéria\'s queued counter goes through the shared announcement', () => {
  // The AI effect's decision block: from the timer it runs in up to the point the
  // ORDINARY action is chosen. That is exactly the two branches able to fire a
  // strike before the normal AI decision — Goliath's telegraph landing and
  // Valéria's queued counter.
  const aiTurn = between(
    duelSource,
    'const aiTimer = setTimeout(() => {',
    'let chosenAction: CombatActionType',
  );

  // The counter branch alone: from the latch it consumes to the end of the block.
  // Anchored on CODE, never on the phase comment above it, so retitling that
  // comment cannot silently empty the slice.
  const counterTurn = aiTurn.slice(at(aiTurn, 'pendingCounterRef.current = false;'));
  const counterCode = codeOnly(counterTurn);
  const aiCode = codeOnly(aiTurn);

  test('the counter is handed to the announcement exactly once, and the latch is spent first', () => {
    expect(counterCode).toContain("announceEnemyAttack('quick_attack');");
    // One announcement — not two, not zero.
    expect(counterCode.split("announceEnemyAttack('quick_attack')").length - 1).toBe(1);
    // Consumed BEFORE announcing, so one evade can arm one counter (C-8.75B).
    expect(counterCode.indexOf('pendingCounterRef.current = false;')).toBeLessThan(
      counterCode.indexOf("announceEnemyAttack('quick_attack')"),
    );
    // The branch ends there: the turn belongs to the controller's 700 ms impact.
    expect(counterCode.indexOf('return;')).toBeGreaterThan(
      counterCode.indexOf("announceEnemyAttack('quick_attack')"),
    );
  });

  test('the counter cannot resolve in place — the bypass C-8.75B removed stays removed', () => {
    // Revert the production call to the old direct resolution and THIS fails: the
    // player would again be struck by a strike that was never announced and could
    // never be answered.
    expect(counterCode).not.toContain("executeCombatTurn('opponent', 'quick_attack')");
    expect(counterCode).not.toContain('executeCombatTurn(');
  });

  test('no opponent quick attack in the AI turn is resolved without an announcement', () => {
    // The invariant behind that one branch: every quick attack she throws has been
    // announced, so none of them is resolved directly anywhere in the AI turn.
    expect(aiCode).not.toContain("executeCombatTurn('opponent', 'quick_attack')");
    expect(aiCode).toContain("announceEnemyAttack('quick_attack');");
    // The one direct resolution left is Goliath's telegraph landing — a strike the
    // player was shown on the PREVIOUS turn, i.e. its own announcement.
    expect(aiCode).toContain("executeCombatTurn('opponent', 'power_attack')");
  });
});
