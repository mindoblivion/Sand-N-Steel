/**
 * SANDS & STEEL — AI ACTION SELECTION & STRIKE AFFORDABILITY (C-8.75E)
 * ===========================================================================
 * Pure, side-effect-free selection for the opponent's in-range turn, plus the
 * ONE affordability rule every AI strike answers to.
 *
 * The defect this module closes: `DuelScene`'s tactical branches chose a power
 * attack without ever comparing its cost to the opponent's stamina — the only
 * stamina test in the chain was `opp.stamina < oppLightCost`, i.e. the LIGHT
 * attack's cost, and it sat behind branches (player blocking, player low HP,
 * the standard `chooseAIStandardAction` pool) that could pick the heavy strike
 * anyway. Resolution then clamped the bill with `Math.max(0, …)`, so an
 * opponent at 14 SP paid 12 for a 22 SP power slash and kept the damage: a
 * free, unaffordable blow.
 *
 * The rule now has two halves, and both read the same predicate:
 *   - SELECTION  `chooseAITacticalAction` never yields a strike the opponent
 *                cannot pay for. An unaffordable power attack becomes the quick
 *                attack it can afford; with neither affordable the turn falls
 *                back to the existing `rest` recovery, so no turn is wasted on
 *                a blow that cannot happen.
 *   - RESOLUTION `canAffordAttack` is also read by `executeCombatTurn`, right
 *                beside the C-8.70B §R3 range guard, so the paths that never
 *                consult selection (a queued counter, a telegraph landing, a
 *                stale UI) cannot resolve an unpaid strike either.
 *
 * C-8.84B — DODGE is the one action this module used to wave through, and it now
 * answers to the same two halves. `DODGE_STAMINA_COST` buys the evasion STANCE,
 * but the only stamina test in the chain was the LIGHT attack's cost, so with
 * `dual_blades` (light 9) an opponent at 9-11 SP reached the standard pool and
 * could draw `dodge`, and with `spear` (light 11) it could at 11 SP. Resolution
 * then billed with `Math.max(0, …)`, which clamps rather than refuses: the stance
 * and its evade were free. Selection now downgrades an unaffordable Dodge to the
 * existing zero-cost `shield_block`, and resolution refuses one that arrives
 * without consulting selection. Sufficient stamina is untouched — no priority,
 * weight, threshold or draw count moves.
 *
 * Nothing here changes a stamina cost, a probability weight, a telegraph time,
 * a damage formula or an opponent's configured aggression/blockChance: the
 * branches keep their exact order, thresholds and draw counts.
 */
import type { WeaponItem } from '../types/game';
import {
  canAffordDodge,
  chooseAIStandardAction,
  getStaminaCost,
} from './combatCalculations';

/** The two actions that actually spend stamina to strike. */
export type AIAttackAction = 'quick_attack' | 'power_attack';

/** Everything the in-range tactical chain can return. */
export type AITacticalAction = AIAttackAction | 'shield_block' | 'dodge' | 'rest' | 'taunt';

/**
 * Can this fighter pay for this strike, right now?
 *
 * The actual cost of the attack being thrown — not a stand-in constant, and not
 * the other attack's cost. A non-finite stamina (a hand-edited or corrupt save)
 * affords nothing, so the failure mode is a refused strike rather than a free one.
 */
export function canAffordAttack(
  stamina: number,
  weapon: WeaponItem,
  action: AIAttackAction,
): boolean {
  if (typeof stamina !== 'number' || !Number.isFinite(stamina)) return false;
  return stamina >= getStaminaCost(weapon, action === 'quick_attack');
}

/**
 * Downgrade a chosen action to one the opponent can actually pay for.
 *
 *   - affordable as chosen            → unchanged
 *   - power unaffordable, light is    → 'quick_attack' (keeps the offence, the
 *                                       aggression and the turn's shape)
 *   - neither strike affordable       → 'rest' (the existing recovery action)
 *   - Dodge unaffordable              → 'shield_block' (C-8.84B — the free guard
 *                                       this chain's own low-stamina branch
 *                                       already picks; it keeps the turn
 *                                       defensive and mints no stamina the way
 *                                       `rest`'s +40 would)
 *   - any other action                → unchanged (block, taunt, rest)
 *
 * It never draws a random number, so applying it cannot shift the AI's
 * probability stream.
 */
export function enforceAffordableAIAction(
  action: AITacticalAction,
  stamina: number,
  weapon: WeaponItem,
): AITacticalAction {
  // C-8.84B — `DODGE_STAMINA_COST` buys the stance, so an opponent short of it
  // must not be offered one. `shield_block` costs nothing and is already in this
  // chain's action set (branch 2), so the downgrade adds no new kind of turn.
  if (action === 'dodge') return canAffordDodge(stamina) ? 'dodge' : 'shield_block';
  if (action !== 'quick_attack' && action !== 'power_attack') return action;
  if (canAffordAttack(stamina, weapon, action)) return action;
  if (action === 'power_attack' && canAffordAttack(stamina, weapon, 'quick_attack')) {
    return 'quick_attack';
  }
  return 'rest';
}

/** The decision inputs for an in-range AI turn. */
export interface AITacticalContext {
  /** The player is holding a guard, so a heavy strike is the AI's preference. */
  playerIsBlocking: boolean;
  /** The player's remaining health — below 25 the AI looks to finish. */
  playerHealth: number;
  /** The opponent's stamina for this turn. */
  stamina: number;
  /** The opponent's resolved weapon — the source of both strike costs. */
  weapon: WeaponItem;
  /** The opponent's configured aggression, passed through unchanged. */
  aggression?: number;
  blockChance?: number;
}

/**
 * Choose the opponent's action while inside strike range.
 *
 * This is the SHIPPED branch chain, lifted out of `DuelScene` verbatim — same
 * order, same thresholds, same one-draw-per-branch shape — with the
 * affordability rule applied to whatever the branch picked:
 *
 *   1. player guarding    → 45 % power, 30 % taunt, 25 % block
 *   2. stamina < light    → 60 % block, 40 % rest
 *   3. player below 25 HP → 70 % quick, 30 % power
 *   4. otherwise          → chooseAIStandardAction(aggression, blockChance)
 *
 * Branches 1 and 3 can name a strike the opponent cannot pay for; branch 4 can
 * too, and it is also the only branch that can draw a Dodge (C-8.84B), which it
 * can now only keep when the opponent can pay for it. All three pass through
 * `enforceAffordableAIAction`.
 */
export function chooseAITacticalAction(
  context: AITacticalContext,
  rngOrValue: number | (() => number) = Math.random,
): AITacticalAction {
  const draw = () => (typeof rngOrValue === 'function' ? rngOrValue() : rngOrValue);
  const lightCost = getStaminaCost(context.weapon, true);

  let chosen: AITacticalAction;

  if (context.playerIsBlocking) {
    const r = draw();
    chosen = r < 0.45 ? 'power_attack' : r < 0.75 ? 'taunt' : 'shield_block';
  } else if (context.stamina < lightCost) {
    const r = draw();
    chosen = r < 0.6 ? 'shield_block' : 'rest';
  } else if (context.playerHealth < 25) {
    const r = draw();
    chosen = r < 0.7 ? 'quick_attack' : 'power_attack';
  } else {
    chosen = chooseAIStandardAction(context.aggression, context.blockChance, rngOrValue);
  }

  return enforceAffordableAIAction(chosen, context.stamina, context.weapon);
}
