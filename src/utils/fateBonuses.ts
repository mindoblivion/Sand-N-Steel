import { getFateCard, type FateCardEffect } from '../data/fateCards';
import type { WeaponType } from '../types/game';
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
export interface FateBonuses extends FateCombatBonuses {
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

/**
 * PHASE2-FATECON-2 — the combat bonuses: the Fate kinds that ride the
 * duel. `ownedCardIds` rides along so the per-dispatch helpers (weapon
 * mastery, the live conditionals) can read the same resolved ids the
 * bundle did — one resolution, no second read of the saved state.
 */
export interface FateCombatBonuses {
  /** The owned card ids, as resolved by `resolveFateState` (unknown ids dropped). */
  ownedCardIds: string[];
  /** Unconditional outgoing-damage multiplier (Brutal Force + Master of Arms, ×1.03 per stack). */
  damageMultiplier: number;
  /**
   * Incoming-damage multiplier (Shield Savant, ×0.98 per stack). Applied
   * POST-FORMULA on damage the player takes, Riposte-style — never inside
   * the traitMult chain, whose denominator would invert it (brief §2).
   */
  damageTakenMultiplier: number;
  /**
   * Attack-recovery multiplier (Quick Recovery, ×0.96 per stack). It
   * multiplies the weight recovery at the `turnResolutionMs` call site;
   * the clamp [0.85, 1.15] stays as-is and eats ~0.95 points at the
   * extreme (lightest fighter, 3 stacks: 0.8405 → 0.85).
   */
  attackRecoveryMultiplier: number;
}

/** The dodge's shipped flat stamina cost, before any Fate discount. */
export const FATE_DODGE_BASE_STAMINA_COST = 12;

/**
 * The effect kinds PHASE2-FATECON-1 and PHASE2-FATECON-2 wired live.
 * `gold_flat` is NOT in this set: PHASE2-FATE wired it, and the draft
 * modal still names it outright so its own pin keeps reading true.
 * Only `unlock_technique` (Deep Wounds) stays out: no technique registry
 * and no bleeding system exist to consume it.
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
  'damage_pct',
  'weapon_mastery_pct',
  'conditional_damage_pct',
  'damage_taken_pct',
  'attack_recovery_pct',
  'once_per_bout_survival',
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

// ── PHASE2-FATECON-2 — the combat helpers ──────────────────────────────────

/** Brutal Force + Master of Arms: outgoing damage ×1.03 per stack. */
export function fateDamageMultiplier(ownedCardIds: string[]): number {
  return productForKind(ownedCardIds, 'damage_pct');
}

/**
 * Weapon mastery: ×1.05 per stack of the doctrine for the weapon in hand.
 * No mace card exists in the catalogue, so a mace reads 1 — no catalogue
 * change, no special case anywhere else.
 */
export function fateWeaponMasteryMultiplier(ownedCardIds: string[], weaponType: WeaponType): number {
  let product = 1;
  for (const id of ownedCardIds) {
    const card = getFateCard(id);
    if (!card) continue;
    const effect = card.effect;
    if (effect.kind === 'weapon_mastery_pct' && effect.weapon === weaponType) {
      product *= 1 + effect.value;
    }
  }
  return product;
}

/** The live state the four conditional-damage cards read. */
export interface FateConditionalState {
  /** The opponent missed on a previous turn; consumed by the next attack. */
  afterOpponentMisses: boolean;
  /** The player dodged (stance evade) on a previous turn; consumed by the next attack. */
  afterSuccessfulDodge: boolean;
  /** The attacker's health now (the player, for a Fate-boosted blow). */
  attackerHealth: number;
  attackerHealthMax: number;
  /** The defender's health now. */
  defenderHealth: number;
  defenderHealthMax: number;
}

/**
 * The four conditional-damage cards, each only when its condition holds:
 * Opening Strike after the opponent misses, Executioner against an enemy
 * below 25% health, Adrenaline Surge after a successful dodge, Blood of
 * the Colossus while the player is below 30% health. The health checks
 * mirror the palma idiom (`PALMA_DEALT_CONDITIONS`): strictly below the
 * threshold, and never on a dead fighter (health > 0).
 */
export function fateConditionalDamageMultiplier(
  ownedCardIds: string[],
  state: FateConditionalState,
): number {
  let product = 1;
  for (const id of ownedCardIds) {
    const card = getFateCard(id);
    if (!card) continue;
    const effect = card.effect;
    if (effect.kind !== 'conditional_damage_pct') continue;
    const holds =
      effect.condition === 'after_opponent_misses'
        ? state.afterOpponentMisses
        : effect.condition === 'after_successful_dodge'
        ? state.afterSuccessfulDodge
        : effect.condition === 'enemy_below_25_percent'
        ? state.defenderHealth > 0 && state.defenderHealth < state.defenderHealthMax * 0.25
        : effect.condition === 'player_below_30_percent'
        ? state.attackerHealth > 0 && state.attackerHealth < state.attackerHealthMax * 0.3
        : false;
    if (holds) product *= 1 + effect.value;
  }
  return product;
}

/**
 * Shield Savant: incoming damage ×0.98 per stack. The card's value is
 * already negative (−0.02), so the plain product gives 0.98^stacks — but
 * the product is only ever applied POST-FORMULA on damage the player
 * takes, never inside the traitMult chain (brief §2: the denominator
 * inverts it).
 */
export function fateDamageTakenMultiplier(ownedCardIds: string[]): number {
  return productForKind(ownedCardIds, 'damage_taken_pct');
}

/**
 * Quick Recovery: attacks resolve ×0.96 per stack faster. The card's
 * value is +0.04 ("recover 4% faster"), so the hold multiplier is
 * (1 − value), NOT (1 + value) — the plain product would slow the
 * fighter down instead of speeding them up.
 */
export function fateAttackRecoveryMultiplier(ownedCardIds: string[]): number {
  let product = 1;
  for (const id of ownedCardIds) {
    const card = getFateCard(id);
    if (!card) continue;
    const effect = card.effect;
    if (effect.kind === 'attack_recovery_pct' && 'value' in effect) {
      product *= 1 - effect.value;
    }
  }
  return product;
}

/** The combat bundle: the unconditional combat kinds, resolved once. */
export function resolveFateCombatBonuses(stateInput: unknown): FateCombatBonuses {
  return combatBonusesForIds(resolveFateState(stateInput).ownedCardIds);
}

function combatBonusesForIds(ownedCardIds: string[]): FateCombatBonuses {
  return {
    ownedCardIds,
    damageMultiplier: fateDamageMultiplier(ownedCardIds),
    damageTakenMultiplier: fateDamageTakenMultiplier(ownedCardIds),
    attackRecoveryMultiplier: fateAttackRecoveryMultiplier(ownedCardIds),
  };
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
    ...combatBonusesForIds(ownedCardIds),
  };
}
