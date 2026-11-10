/**
 * Gladiator body-weight rules.
 *
 * Weight is a combat-style modifier, never a weapon permission check.
 * Weapon eligibility remains governed by Strength/weapon requirements.
 * Legacy profiles omit weight and resolve to the neutral 180 lb baseline.
 */
export const DEFAULT_GLADIATOR_WEIGHT_LB = 180;
export const MIN_GLADIATOR_WEIGHT_LB = 140;
export const MAX_GLADIATOR_WEIGHT_LB = 300;

/** Clamp untrusted save/UI input to the supported body-weight range. */
export function normalizeGladiatorWeight(weight: unknown): number {
  if (typeof weight !== 'number' || !Number.isFinite(weight)) {
    return DEFAULT_GLADIATOR_WEIGHT_LB;
  }
  return Math.round(
    Math.max(MIN_GLADIATOR_WEIGHT_LB, Math.min(MAX_GLADIATOR_WEIGHT_LB, weight)),
  );
}

/**
 * Resolve the bounded trade-offs from one normalized value.
 *
 * 180 lb is neutral. Lighter builds have less impact, quicker attack recovery
 * and a slightly quicker stride; heavier builds have more impact, slower
 * recovery and a slower stride. Weight never gates weapons.
 */
export function getWeightCombatProfile(weight: unknown): {
  weightLb: number;
  impactMultiplier: number;
  recoveryMultiplier: number;
  movementMultiplier: number;
} {
  const weightLb = normalizeGladiatorWeight(weight);
  const offset = (weightLb - DEFAULT_GLADIATOR_WEIGHT_LB) / 120;
  const tradeoff = offset * 0.15;
  return {
    weightLb,
    impactMultiplier: 1 + tradeoff,
    recoveryMultiplier: 1 + tradeoff,
    movementMultiplier: 1 - tradeoff,
  };
}

/** Weight is intentionally absent from this predicate: Strength owns eligibility. */
export function meetsWeaponStrengthRequirement(
  strength: number,
  requiredStrength: number,
): boolean {
  return Number.isFinite(strength) &&
    Number.isFinite(requiredStrength) &&
    strength >= requiredStrength;
}
