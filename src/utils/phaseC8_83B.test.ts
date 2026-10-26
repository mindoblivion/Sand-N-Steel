/**
 * Idempotent Dodge reaction cost - C-8.83B.
 *
 * The defect: a player who set Dodge on their OWN turn kept the stance across the
 * turn boundary (`resolveTurnEndDefensive` preserves it), and when the enemy's
 * announced strike arrived and they selected Dodge again in the reaction window,
 * `reactToPendingAttack` debited another 12 SP and incremented `dodgesPerformed` a
 * second time - for the one stance already paid for on their turn.
 *
 * The correction is ONE rule, `planDodgeReaction` (`combatCalculations.ts`): the
 * 12 SP buys the dodge STANCE, not the tap. A stance already held is a **reaffirm**
 * - the reaction is still claimed (so Shield Guard cannot also be stacked, and the
 * cue names the dodge), the stance stays standing for the pending blow, but nothing
 * is debited and no second dodge is counted. Anything that is not already a dodge
 * stance keeps the ordinary activation and the existing refusal below the cost.
 *
 * This suite pins the rule, the lifecycle that makes a free reaffirm unable to arm
 * an unrelated strike, the impact-time evade roll it must not disturb, and the
 * shipped wiring:
 *
 *   §A the charge rule - activate / reaffirm / refused, deterministically
 *   §B the lifecycle - one stance, one payment, and no way to reuse it later
 *   §C the impact - the 88 % evade roll and its timing are untouched
 *   §D the shipped reaction - refusal -> claim -> stance, one debit, one count
 *   §E nothing else moved - guard, passive evade, miss, failed-dodge copy, constants
 *   §F the cue and the control - a reaffirm claims no charge on screen either
 *
 * Run with: bun test src/utils/phaseC8_83B.test.ts
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  DODGE_EVADE_CHANCE,
  DODGE_EVADE_PERCENT,
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
  PLAYER_ATTACK_WINDUP_MS,
  applyDefensiveAction,
  clearDefensiveStance,
  planDodgeReaction,
  resolveTurnEndDefensive,
} from './combatCalculations';
import type { DefensiveStance } from './combatCalculations';
import { resolveReactionCue } from './pendingStrike';
import type { PendingReaction } from './pendingStrike';
import { DODGE_FAILED_MARKER, landedStrikeText } from './strikeFeedback';
import { rollsPassiveEvade } from './counterDodge';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import { CombatHUD } from '../components/ui/CombatHUD';
import type { FighterState } from '../types/game';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);

/** The reaction handler's own body: the one place this phase changed. */
const reactionBody = (() => {
  const start = duelSource.indexOf('const reactToPendingAttack = useCallback(');
  const end = duelSource.indexOf('// No blow may outlive the scene');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return duelSource.slice(start, end);
})();

/** The turn-action dodge branch (`} else if (actionType === 'dodge') {`). */
const turnDodgeBranch = (() => {
  const start = duelSource.indexOf("} else if (actionType === 'dodge') {");
  const end = duelSource.indexOf("} else if (actionType === 'taunt') {");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return duelSource.slice(start, end);
})();

const OPEN: DefensiveStance = { isBlocking: false, isInvulnerable: false };
const DODGING: DefensiveStance = { isBlocking: false, isInvulnerable: true };

// ── §A. The charge rule ────────────────────────────────────────────────────

describe('§A - 12 SP buys the stance, so a held stance is re-armed for free', () => {
  test('a FIRST dodge is an activation: exactly 12 SP, counted once', () => {
    const plan = planDodgeReaction(OPEN, 100);
    expect(plan.kind).toBe('activate');
    expect(plan.staminaCost).toBe(DODGE_STAMINA_COST);
    expect(plan.staminaCost).toBe(12);
    expect(plan.countsDodge).toBe(true);
    // Paying it leaves the player 12 lighter.
    expect(Math.max(0, 100 - plan.staminaCost)).toBe(88);
  });

  test('re-selecting Dodge on the SAME pending strike neither charges nor double-counts', () => {
    // The reported case: Dodge set on the player's turn (-12 already spent), the
    // enemy's strike announced, Dodge selected again in the reaction window.
    const plan = planDodgeReaction(DODGING, 88);
    expect(plan.kind).toBe('reaffirm');
    expect(plan.staminaCost).toBe(0);
    expect(plan.countsDodge).toBe(false);

    // One stance therefore costs 12 SP in total and counts as one dodge.
    const activation = planDodgeReaction(OPEN, 100);
    const totalCharged = activation.staminaCost + plan.staminaCost;
    const timesCounted = [activation, plan].filter((p) => p.countsDodge).length;
    expect(totalCharged).toBe(DODGE_STAMINA_COST);
    expect(timesCounted).toBe(1);
  });

  test('a reaffirm is free even with no stamina left - it spends nothing', () => {
    // A player who dodged down to 0 SP still holds the stance; refusing the confirm
    // would leave them unable to answer with the dodge they already paid for.
    expect(planDodgeReaction(DODGING, 0)).toEqual({
      kind: 'reaffirm',
      staminaCost: 0,
      countsDodge: false,
    });
  });

  test('a NEW stance below the cost is refused, and debits nothing', () => {
    for (const stamina of [0, 1, DODGE_STAMINA_COST - 1]) {
      const plan = planDodgeReaction(OPEN, stamina);
      expect(plan.kind).toBe('refused');
      expect(plan.staminaCost).toBe(0);
      expect(plan.countsDodge).toBe(false);
    }
    // Exactly enough is enough - the boundary is unchanged.
    const edge = planDodgeReaction(OPEN, DODGE_STAMINA_COST);
    expect(edge.kind).toBe('activate');
    expect(edge.staminaCost).toBe(DODGE_STAMINA_COST);
  });

  test('a shield guard stance is NOT a dodge stance, so it still pays', () => {
    const blocking: DefensiveStance = { isBlocking: true, isInvulnerable: false };
    const plan = planDodgeReaction(blocking, 60);
    expect(plan.kind).toBe('activate');
    expect(plan.staminaCost).toBe(DODGE_STAMINA_COST);
    expect(plan.countsDodge).toBe(true);
  });

  test('the rule is pure and total', () => {
    const stance = { ...OPEN };
    expect(planDodgeReaction(stance, 60)).toEqual(planDodgeReaction(stance, 60));
    expect(stance).toEqual(OPEN);
    // Deterministic across the whole band, not just at the sampled points.
    for (let stamina = 0; stamina <= 100; stamina += 1) {
      const plan = planDodgeReaction(OPEN, stamina);
      expect(plan.kind).toBe(stamina < DODGE_STAMINA_COST ? 'refused' : 'activate');
      expect(plan.staminaCost).toBe(stamina < DODGE_STAMINA_COST ? 0 : DODGE_STAMINA_COST);
    }
  });
});

// ── §B. The lifecycle - one stance, one payment ─────────────────────────────

describe('§B - a free reaffirm can never arm an unrelated strike', () => {
  test('the stance survives the turn boundary, which is why the reaction sees it', () => {
    const set = applyDefensiveAction(clearDefensiveStance({ isBlocking: true, isInvulnerable: false }), 'dodge');
    expect(set.isInvulnerable).toBe(true);
    // Turn end preserves it (the pending strike must be able to meet it)…
    const atTurnEnd = resolveTurnEndDefensive(set);
    expect(atTurnEnd.isInvulnerable).toBe(true);
    // …so the reaction window genuinely has a held stance to reaffirm.
    expect(planDodgeReaction(atTurnEnd, 60).kind).toBe('reaffirm');
  });

  test('the next action consumes it, so a LATER strike is a fresh 12 SP activation', () => {
    const afterActing = clearDefensiveStance(resolveTurnEndDefensive(DODGING));
    expect(afterActing.isInvulnerable).toBe(false);

    const nextStrike = planDodgeReaction(afterActing, 60);
    expect(nextStrike.kind).toBe('activate');
    expect(nextStrike.staminaCost).toBe(DODGE_STAMINA_COST);

    // And that pre-clear is still where the shipped scene does it.
    expect(duelSource).toContain('prev.isInvulnerable || prev.isBlocking');
    expect(duelSource).toContain('? { ...prev, isInvulnerable: false, isBlocking: false }');
  });

  test('repeated reaffirms of one stance never accumulate cost or counts', () => {
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

  test('the ordinary turn-action Dodge still charges every time it is taken', () => {
    // A new stance on a new turn is paid for, even if the last one was a dodge:
    // this is what stops "free dodge forever" from the turn path. One debit for
    // the player, one for the opponent.
    expect(turnDodgeBranch.split('prev.stamina - DODGE_STAMINA_COST').length - 1).toBe(2);
    expect(turnDodgeBranch).not.toContain('planDodgeReaction');
  });
});

// ── §C. The impact ─────────────────────────────────────────────────────────

describe('§C - the stance still resolves through the unchanged evade roll', () => {
  test('the impact reads the SAME flag the reaffirm leaves standing', () => {
    expect(duelSource).toContain(
      'const isEvaded = defender.isInvulnerable && Math.random() < DODGE_EVADE_CHANCE;',
    );
    expect(DODGE_EVADE_CHANCE).toBe(0.88);
    expect(DODGE_EVADE_PERCENT).toBe(88);
  });

  test('the roll behaves exactly as before at the 88 % boundary', () => {
    const resolve = (stance: DefensiveStance, roll: number) =>
      stance.isInvulnerable && roll < DODGE_EVADE_CHANCE;

    // A reaffirmed stance is the same stance, so the same rolls decide it.
    expect(resolve(DODGING, 0)).toBe(true);
    expect(resolve(DODGING, 0.8799)).toBe(true);
    expect(resolve(DODGING, 0.88)).toBe(false);
    expect(resolve(DODGING, 0.9999)).toBe(false);
    expect(resolve(OPEN, 0)).toBe(false);
  });

  test('neither the reaction nor the impact touches the timing constants', () => {
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    expect(reactionBody).not.toContain('ENEMY_ATTACK_WINDUP_MS');
    expect(reactionBody).not.toContain('setTimeout');
  });
});

// ── §D. The shipped reaction ────────────────────────────────────────────────

describe('§D - one rule, one debit, one count in the shipped handler', () => {
  test('the charge is decided by the plan, from the snapshot the impact reads', () => {
    expect(reactionBody).toContain(
      'planDodgeReaction(fightersRef.current.player, fightersRef.current.player.stamina)',
    );
  });

  test('the refused plan returns BEFORE the reaction is claimed', () => {
    const refusal = reactionBody.indexOf("dodgeCharge.kind === 'refused'");
    const claim = reactionBody.indexOf('claimReaction()');
    expect(refusal).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(claim);
  });

  test('the claim still precedes every stance write', () => {
    const claim = reactionBody.indexOf('claimReaction()');
    expect(claim).toBeGreaterThan(-1);
    expect(reactionBody.indexOf('setReactionTaken(action)')).toBeGreaterThan(claim);
    expect(
      reactionBody.indexOf("applyDefensiveAction(clearDefensiveStance(prev), 'dodge')"),
    ).toBeGreaterThan(claim);
    expect(
      reactionBody.indexOf("applyDefensiveAction(clearDefensiveStance(prev), 'shield_block')"),
    ).toBeGreaterThan(claim);
  });

  test('exactly one debit, and it is the plan cost - no literal second charge', () => {
    expect(reactionBody.split('prev.stamina - dodgeCharge.staminaCost').length - 1).toBe(1);
    expect(reactionBody).not.toContain('prev.stamina - DODGE_STAMINA_COST');
    expect(reactionBody).not.toMatch(/prev\.stamina - \d/);
  });

  test('the dodge counter is gated on the plan, so one stance counts once', () => {
    expect(reactionBody).toContain(
      'if (dodgeCharge.countsDodge) statsRef.current.dodgesPerformed += 1;',
    );
    expect(reactionBody.split('dodgesPerformed += 1').length - 1).toBe(1);
  });

  test('the cue is told whether the stamina was actually spent', () => {
    expect(reactionBody).toContain('setReactionDodgeCharged(dodgeCharge.staminaCost > 0);');
    expect(reactionBody).toContain("dodgeCharge.kind === 'reaffirm'");
    // The ordinary line is unchanged for an activation.
    expect(reactionBody).toContain('throws themselves into a dodge!');
  });
});

// ── §E. Nothing else moved ─────────────────────────────────────────────────

describe('§E - guard, passive evade, miss, failed-dodge copy and constants unchanged', () => {
  test('Dodge costs 12 SP and evades at 88 % - unchanged', () => {
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(DODGE_EVADE_CHANCE).toBe(0.88);
    expect(DODGE_EVADE_PERCENT).toBe(88);
  });

  test('the guard reaction still costs nothing and writes no stamina field', () => {
    const marker = "...applyDefensiveAction(clearDefensiveStance(prev), 'shield_block')";
    const at = reactionBody.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    // Everything from the guard's stance write to the end of that write's object.
    const tail = reactionBody.slice(at, at + 400);
    expect(tail).not.toContain('stamina:');
    expect(tail).not.toContain('DODGE_STAMINA_COST');
    // C-8.84F — the reaction's copy now comes from the shared `guardFeedback`
    // module (its shield-equipped wording is unchanged there), so this tail
    // pins the helper's log as what the guard branch writes.
    expect(tail).toContain('reactionGuard.log');
  });

  test('the blocked branch, the passive evade and the miss are untouched', () => {
    expect(duelSource).toContain('const isBlocked = defender.isBlocking;');
    expect(duelSource).toContain('rollsPassiveEvade(opponent, Math.random())');
    expect(duelSource).toContain('!defender.isInvulnerable &&');
    // A missed strike still credits nothing.
    const missStart = duelSource.indexOf('// MISSED');
    expect(missStart).toBeGreaterThan(-1);
    const miss = duelSource.slice(missStart, duelSource.indexOf('};', missStart));
    expect(miss).not.toContain('applyStaminaRegen');
  });

  test('the passive evade reader is unchanged: only a counter_dodge boss', () => {
    const boss = { bossMechanic: 'counter_dodge' as const, dodgeChance: 0.5 };
    expect(rollsPassiveEvade(boss, 0.1)).toBe(true);
    expect(rollsPassiveEvade(boss, 0.9)).toBe(false);
    expect(
      rollsPassiveEvade({ bossMechanic: 'rage_mode_colossus', dodgeChance: 0.5 }, 0.1),
    ).toBe(false);
  });

  test('a failed dodge still names itself, with one damage figure', () => {
    const line = landedStrikeText({
      attackerName: 'Brutus',
      defenderName: 'Cassius',
      damage: 17,
      isCrit: false,
      dodgeFailed: true,
    });
    expect(line).toContain(DODGE_FAILED_MARKER);
    expect(line).toContain('17');
    const open = landedStrikeText({
      attackerName: 'Brutus',
      defenderName: 'Cassius',
      damage: 17,
      isCrit: false,
    });
    expect(open).not.toContain(DODGE_FAILED_MARKER);
    expect(line).not.toBe(open);
  });
});

// ── §F. The cue and the control ────────────────────────────────────────────

describe('§F - a reaffirm claims no charge on screen either', () => {
  test('an ordinary dodge cue still reports the 12 SP it spent', () => {
    const cue = resolveReactionCue('dodge');
    expect(cue!.kind).toBe('dodge');
    expect(cue!.label).toContain(`${DODGE_STAMINA_COST} SP spent`);
    expect(cue!.label).toContain(`${DODGE_EVADE_PERCENT}%`);
    // The default argument keeps every existing caller byte-identical.
    expect(resolveReactionCue('dodge', undefined, true)!.label).toBe(cue!.label);
  });

  test('a reaffirm cue claims no charge, and still promises only a CHANCE', () => {
    const cue = resolveReactionCue('dodge', undefined, false);
    expect(cue!.kind).toBe('dodge');
    expect(cue!.label.toLowerCase()).toContain('dodge');
    expect(cue!.label.toLowerCase()).toContain('chance');
    expect(cue!.label).toContain(`${DODGE_EVADE_PERCENT}%`);
    expect(cue!.label).toContain('already paid for');
    expect(cue!.label).not.toContain('SP spent');
    expect(cue!.label.toLowerCase()).not.toContain('guard');
    for (const overclaim of [
      'guarantee',
      'certain',
      'always',
      'will evade',
      'immune',
      'no damage',
    ]) {
      expect(cue!.label.toLowerCase()).not.toContain(overclaim);
    }
  });

  test('the HUD passes the flag through, and marks a held stance as free', () => {
    expect(hudSource).toContain('reactionDodgeCharged?: boolean;');
    expect(hudSource).toContain('reactionDodgeCharged = true,');
    expect(hudSource).toContain('reactionDodgeCharged,\n  );');

    const held = renderHud({ stamina: 0, isInvulnerable: true });
    expect(held).toContain('data-reaction="dodge"');
    expect(held).toContain('Dodge · held');
    expect(held).toContain('no cost');
    const heldButton = held.slice(held.indexOf('data-reaction="dodge"'));
    expect(heldButton.slice(0, 700)).not.toContain('disabled');

    // Control: with no stance held, 0 SP still refuses a NEW dodge.
    const cold = renderHud({ stamina: 0, isInvulnerable: false });
    expect(cold).toContain(`Dodge −${DODGE_STAMINA_COST} SP`);
    const coldButton = cold.slice(cold.indexOf('data-reaction="dodge"'));
    expect(coldButton.slice(0, 700)).toContain('disabled');
  });

  test('the HUD reports the reaffirm cue when told the charge was not spent', () => {
    const held = renderHud({
      stamina: 88,
      isInvulnerable: true,
      reactionTaken: 'dodge',
      reactionDodgeCharged: false,
    });
    expect(held).toContain('data-reaction-kind="dodge"');
    expect(held).toContain('already paid for');
    expect(held).not.toContain(`${DODGE_STAMINA_COST} SP spent`);
  });
});

// ── fixture ────────────────────────────────────────────────────────────────

interface HudOptions {
  stamina: number;
  isInvulnerable: boolean;
  reactionTaken?: PendingReaction | null;
  reactionDodgeCharged?: boolean;
}

function fighter(overrides: Partial<FighterState>): FighterState {
  return {
    id: 'p',
    name: 'Dimachaerus',
    title: 'Gladiator',
    isPlayer: true,
    position: [0, 0, 0],
    rotationY: 0,
    health: 100,
    stamina: 60,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: {
      strength: 10,
      agility: 10,
      stamina: 60,
      staminaMax: 100,
      staminaRegen: 20,
      defense: 5,
      healthMax: 100,
    },
    loadout: { weapon: DEFAULT_PLAYER_WEAPON },
    comboCount: 0,
    skinColor: '#c9a27a',
    hairColor: '#2b1d12',
    tunicColor: '#7f1d1d',
    ...overrides,
  } as unknown as FighterState;
}

function renderHud(opts: HudOptions): string {
  return renderToStaticMarkup(
    React.createElement(CombatHUD, {
      player: fighter({ stamina: opts.stamina, isInvulnerable: opts.isInvulnerable }),
      opponent: fighter({ id: 'o', name: 'Marcus', isPlayer: false }),
      crowdHype: 52,
      comboCount: 0,
      matchTimer: 97,
      isMuted: false,
      onToggleMute: () => {},
      onWithdraw: () => {},
      onOpenHelp: () => {},
      cameraMode: 'cinematic',
      onCycleCameraMode: () => {},
      pendingEnemyAttack: 'power_attack',
      pendingPlayerAttack: null,
      reactionTaken: opts.reactionTaken ?? null,
      reactionDodgeCharged: opts.reactionDodgeCharged,
      onReactToPendingAttack: () => {},
    }),
  );
}
