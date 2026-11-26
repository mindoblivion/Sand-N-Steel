import { getFateCard, type FateCardEffect } from '../data/fateCards';
import { resolveFateState } from './gladiatorFate';

/**
 * ===========================================================================
 * PHASE2-FATECON-1 — Fate bonus math: the multipliers and flat terms the
 * consumers read off a profile's owned Fate cards.
 *
 * One function per kind-group, all pure: they take the owned card ids (as
 * resolved by `resolveFateState`, which already drops unknown ids) and return
 * a number the consumer applies. The stacking rule lives here and nowhere
 * else — multiplicative product of (1 + value) per owned stack, the same
 * idiom as the damage chain's `traitMult`. A flat kind sums instead: Iron
 * Lungs is +6 stamina per stack, not ×1.06.
 *
 * Nothing here reads storage or writes anything: the consumers own the write,
 * this module only does the arithmetic. Unknown card ids are ignored (a
 * defence against a hand-edited save, not a path the game can reach).
 * ===========================================================================
 */

/** Every Fate bonus a consumer needs, resolved once from the saved state. */
export interface FateBonuses {
  /** Flat stamina-max bonus (Iron Lungs, +6 per stack). */
  staminaMaxBonus: number;
  /** Stamina-regen multiplier (Second Wind, ×1.08 per stack). */
  staminaRegenMultiplier: number;
  /** City stride-speed multiplier (Fleet Footed, ×1.04 per stack). */
  movementSpeedMultiplier: number;
  /** The dodge's stamina cost in SP (Arena Runner, 12 → 11 at 1 stack, 10 at 2). */
  dodgeCost: number;
  /** Sidestep-distance multiplier (Evasive Instinct, ×1.08 per stack). */
  dodgeDistanceMultiplier: number;
  /** Duel gold multiplier (Blood Money, ×1.06 per stack). */
  goldRewardMultiplier: number;
  /** Duel fame multiplier (Crowd Favourite, ×1.05 per stack). */
  fameRewardMultiplier: number;
  /** Crowd-hype-gain multiplier (Showman, ×1.08 per stack). */
  crowdHypeMultiplier: number;
}

/** The dodge's shipped flat stamina cost, before any Fate discount. */
export const FATE_DODGE_BASE_STAMINA_COST = 12;

/**
 * The effect kinds PHASE2-FATECON-1 wired live. `gold_flat` is NOT in this
 * set: PHASE2-FATE wired it, and the draft modal still names it outright so
 * its own pin keeps reading true. The seven combat kinds and
 * `unlock_technique` stay out until Part 2.
 */
export const FATECON1_LIVE_EFFECT_KINDS: ReadonlySet<FateCardEffect['kind']> = new Set([
  'stamina_max_flat',
  'stamina_recovery_pct',
  'movement_speed_pct',
  'stamina_cost_pct',
  'dodge_distance_pct',
  'gold_reward_pct',
  'fame_reward_pct',
  'crowd_hype_pct',
]);

/** Multiplicative product of (1 + value) over every owned card of one kind. */
function productForKind(ownedCardIds: string[], kind: FateCardEffect['kind']): number {
  let product = 1;
  for (const id of ownedCardIds) {
    const card = getFateCard(id);
    if (!card) continue;
    const effect = card.effect;
    if (effect.kind === kind && 'value' in effect) {
      product *= 1 + effect.value;
    }
  }
  return product;
}

/** Flat sum of `value` over every owned card of one kind. */
function flatSumForKind(ownedCardIds: string[], kind: FateCardEffect['kind']): number {
  let sum = 0;
  for (const id of ownedCardIds) {
    const card = getFateCard(id);
    if (!card) continue;
    const effect = card.effect;
    if (effect.kind === kind && 'value' in effect) {
      sum += effect.value;
    }
  }
  return sum;
}

/** Iron Lungs: +6 maximum stamina per stack. */
export function fateStaminaMaxBonus(ownedCardIds: string[]): number {
  return flatSumForKind(ownedCardIds, 'stamina_max_flat');
}

/** Second Wind: stamina recovery ×1.08 per stack. */
export function fateStaminaRegenMultiplier(ownedCardIds: string[]): number {
  return productForKind(ownedCardIds, 'stamina_recovery_pct');
}

/** Fleet Footed: city stride speed ×1.04 per stack. */
export function fateMovementSpeedMultiplier(ownedCardIds: string[]): number {
  return productForKind(ownedCardIds, 'movement_speed_pct');
}

/**
 * Arena Runner: the dodge's stamina cost, rounded once on the final cost so
 * the DuelScene charge and the panel gate can share one number — 12 → 11 SP
 * at 1 stack, 10 at 2. The opponent never owns Fate cards, so its dodge
 * keeps the flat 12.
 */
export function fateDodgeCost(ownedCardIds: string[]): number {
  return Math.round(
    FATE_DODGE_BASE_STAMINA_COST * productForKind(ownedCardIds, 'stamina_cost_pct'),
  );
}

/** Evasive Instinct: sidestep distance ×1.08 per stack (1.8 → 1.944 m at 1). */
export function fateDodgeDistanceMultiplier(ownedCardIds: string[]): number {
  return productForKind(ownedCardIds, 'dodge_distance_pct');
}

/** Blood Money: duel gold ×1.06 per stack. */
export function fateGoldRewardMultiplier(ownedCardIds: string[]): number {
  return productForKind(ownedCardIds, 'gold_reward_pct');
}

/** Crowd Favourite: duel fame ×1.05 per stack. */
export function fateFameRewardMultiplier(ownedCardIds: string[]): number {
  return productForKind(ownedCardIds, 'fame_reward_pct');
}

/** Showman: crowd hype gained ×1.08 per stack. */
export function fateCrowdHypeMultiplier(ownedCardIds: string[]): number {
  return productForKind(ownedCardIds, 'crowd_hype_pct');
}

/**
 * The whole bundle, resolved once from the saved Fate state (or anything
 * malformed, which resolves to neutral). Consumers that need more than one
 * bonus call this; single-bonus sites call the matching function directly.
 */
export function resolveFateBonuses(stateInput: unknown): FateBonuses {
  const ownedCardIds = resolveFateState(stateInput).ownedCardIds;
  return {
    staminaMaxBonus: fateStaminaMaxBonus(ownedCardIds),
    staminaRegenMultiplier: fateStaminaRegenMultiplier(ownedCardIds),
    movementSpeedMultiplier: fateMovementSpeedMultiplier(ownedCardIds),
    dodgeCost: fateDodgeCost(ownedCardIds),
    dodgeDistanceMultiplier: fateDodgeDistanceMultiplier(ownedCardIds),
    goldRewardMultiplier: fateGoldRewardMultiplier(ownedCardIds),
    fameRewardMultiplier: fateFameRewardMultiplier(ownedCardIds),
    crowdHypeMultiplier: fateCrowdHypeMultiplier(ownedCardIds),
  };
}
