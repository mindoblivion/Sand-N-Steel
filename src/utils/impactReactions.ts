/**
 * First deterministic impact-classification slice for the physical combat
 * expansion. This module classifies a landed strike only; it does not mutate
 * fighter state, apply damage, or decide turn order.
 *
 * The duel remains the authority for hit resolution. Call this only after a
 * strike has passed range, hit and evasion checks. A blocked strike cannot
 * stagger or knock down through this first-pass model.
 *
 * Thresholds are deliberately conservative starting values. They are exposed
 * as constants so combat tests and later balance tuning have one source.
 */

export type ImpactReaction = 'none' | 'stagger' | 'knockdown';

export interface ImpactClassificationInput {
  /** Final damage from the existing combat formula, after mitigation. */
  damage: number;
  /** Defender's maximum health; used to normalize impact across opponents. */
  defenderHealthMax: number;
  /** A shielded hit does not cause a reaction in this first pass. */
  isBlocked: boolean;
  /** Heavy/power strikes carry more displacement potential. */
  isPowerAttack: boolean;
  /** Critical strikes can cause a knockdown at a lower normalized threshold. */
  isCrit: boolean;
  /** Existing mass/impact tuning, normally 1 for NPCs. */
  impactMultiplier?: number;
}

export const IMPACT_REACTION_THRESHOLDS = {
  /** Any eligible impact at or above this share of max health causes stagger. */
  staggerHealthFraction: 0.1,
  /** A power attack must reach this share of max health to knock down. */
  powerKnockdownHealthFraction: 0.22,
  /** A critical hit can knock down at this lower share of max health. */
  criticalKnockdownHealthFraction: 0.18,
} as const;

/**
 * Classify the physical reaction to one already-landed strike.
 *
 * Non-finite, negative or structurally invalid inputs fail closed to 'none'.
 * A finite impact multiplier is clamped to 0.5..1.75 so malformed or extreme
 * mass values cannot create unbounded reactions.
 */
export function classifyImpactReaction(input: ImpactClassificationInput): ImpactReaction {
  const {
    damage,
    defenderHealthMax,
    isBlocked,
    isPowerAttack,
    isCrit,
  } = input;

  if (
    !Number.isFinite(damage) ||
    damage <= 0 ||
    !Number.isFinite(defenderHealthMax) ||
    defenderHealthMax <= 0 ||
    isBlocked
  ) {
    return 'none';
  }

  const suppliedMultiplier = input.impactMultiplier;
  const impactMultiplier =
    typeof suppliedMultiplier === 'number' && Number.isFinite(suppliedMultiplier)
      ? Math.max(0.5, Math.min(1.75, suppliedMultiplier))
      : 1;
  const healthFraction = (damage / defenderHealthMax) * impactMultiplier;

  if (
    (isPowerAttack && healthFraction >= IMPACT_REACTION_THRESHOLDS.powerKnockdownHealthFraction) ||
    (isCrit && healthFraction >= IMPACT_REACTION_THRESHOLDS.criticalKnockdownHealthFraction)
  ) {
    return 'knockdown';
  }

  if (healthFraction >= IMPACT_REACTION_THRESHOLDS.staggerHealthFraction || isPowerAttack) {
    return 'stagger';
  }

  return 'none';
}
