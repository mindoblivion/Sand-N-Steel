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
 * Resolve the two sides of the weight trade-off from one normalized value.
 *
 * The 180 lb default is neutral. Lighter builds lose a little impact but recover
 * sooner; heavier builds hit harder but take longer to recover. Both effects are
 * bounded by the authored 140–300 lb creation range. Weight never gates weapons.
 */
export function getWeightCombatProfile(weight: unknown): {
  weightLb: number;
  impactMultiplier: number;
  recoveryMultiplier: number;
} {
  const weightLb = normalizeGladiatorWeight(weight);
  const offset = (weightLb - DEFAULT_GLADIATOR_WEIGHT_LB) / 120;
  const tradeoff = offset * 0.15;
  return {
    weightLb,
    impactMultiplier: 1 + tradeoff,
    recoveryMultiplier: 1 + tradeoff,
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
