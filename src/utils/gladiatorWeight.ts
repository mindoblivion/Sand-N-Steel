/**
 * Gladiator body-weight rules.
 *
 * Weight is a combat-style modifier, never a weapon permission check.
 * Weapon eligibility remains governed by the existing Strength/weapon rules.
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
 * Weight changes attack tempo and impact in opposite directions.
 * At the 180 lb baseline both multipliers are exactly 1.
 * The bounded ±15% range avoids extreme builds becoming mandatory.
 */
export function getWeightCombatProfile(weight: unknown): {
  weightLb: number;
  attackSpeedMultiplier: number;
  impactMultiplier: number;
} {
  const weightLb = normalizeGladiatorWeight(weight);
  const offset = (weightLb - DEFAULT_GLADIATOR_WEIGHT_LB) / 120;
  return {
    weightLb,
    attackSpeedMultiplier: 1 - offset * 0.15,
    impactMultiplier: 1 + offset * 0.15,
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
