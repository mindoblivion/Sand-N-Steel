/**
 * ===========================================================================
 * SAND & STEEL — COMBAT CALCULATIONS (Phase 32B)
 * ===========================================================================
 * Pure, side-effect-free combat math.  Single source of truth for every
 * damage, stamina, range, and hit-chance formula used in the duel.
 *
 * Consumed by:
 *   - components/duel/DuelScene.tsx   (actual combat resolution + AI)
 *   - components/ui/TurnActionPanel.tsx (HUD estimates, button thresholds)
 *   - scripts/combatTests.ts          (regression tests)
 *
 * Importing from here — instead of duplicating formulas — guarantees the UI
 * estimates and the real combat pipeline can never drift apart.
 */
import { WeaponItem } from '../types/game';

/**
 * Scaling constant for the defense-mitigation curve.
 *
 *   mitigated = rawDamage * 100 / (100 + defense * DEFENSE_MITIGATION_FACTOR)
 *
 * At 2.5 a defender with defense 20 sees ~33 % reduction, defense 38 ~49 %,
 * and the curve asymptotes so that even defense 100 only reaches ~71 % —
 * high-defense builds are durable but never invulnerable.
 */
export const DEFENSE_MITIGATION_FACTOR = 2.5;

/**
 * Strength-to-damage bonus: each point of Strength adds 5 % multiplicative
 * damage.  Matches the original AI Studio formula exactly.
 */
export const STRENGTH_BONUS_PER_POINT = 0.05;

/**
 * Critical-hit damage multiplier (power attacks only, 25 % base chance).
 */
export const CRIT_MULTIPLIER = 1.5;

/**
 * Weapon-specific effective attack range in arena meters.
 *
 * Replaces the old binary `spear ? 3.8 : 2.5` check.  Every weapon in
 * `data/itemsDB.ts` carries a tuned `range` value (1.6–3.3 m), so this simply
 * surfaces it — no fallback heuristic is needed.
 */
export function getWeaponRange(weapon: WeaponItem): number {
  return weapon.range;
}

/**
 * Weapon-specific stamina cost for a light (quick) or heavy (power) attack.
 *
 * Replaces the old hardcoded 10 / 22 constants.  Every weapon defines
 * `staminaLight` and `staminaHeavy` (8–22 / 16–44), so the cost now scales
 * with the weapon's weight and reach.
 */
export function getStaminaCost(weapon: WeaponItem, isQuick: boolean): number {
  return isQuick ? weapon.staminaLight : weapon.staminaHeavy;
}

/**
 * Hit-probability percentage for a quick or power attack.
 *
 * Quick:  high floor (50 %), high ceiling (95 %) — fast, reliable.
 * Power:  lower floor (35 %), lower ceiling (80 %) — riskier but harder hit.
 *
 * Both are clamped and driven by the agility gap between attacker and
 * defender, identical to the original AI Studio formula.
 */
export function calculateHitChance(
  isQuick: boolean,
  attackerAgi: number,
  defenderAgi: number,
): number {
  if (isQuick) {
    return Math.max(50, Math.min(95, Math.round(80 + attackerAgi * 1.5 - defenderAgi * 1.2)));
  }
  return Math.max(35, Math.min(80, Math.round(60 + attackerAgi * 1.2 - defenderAgi * 1.2)));
}

/**
 * Full damage calculation for a single landed hit, applying in order:
 *
 *   1. Strength bonus  (× 1 + str × 0.05)
 *   2. Critical multiplier (× 1.5 for power-attack crits, × 1 otherwise)
 *   3. Defense mitigation (multiplicative, diminishing returns)
 *   4. Block reduction (defender's weapon blockReduction, if actively blocking)
 *
 * The result is rounded and floored at 1 so a hit always deals at least
 * 1 damage — even against a maxed-out defender who is blocking.
 *
 * @param baseDamage   weapon.damageLight or weapon.damageHeavy
 * @param attackerStrength  attacker's total Strength stat
 * @param isCrit      true for a critical hit (power attacks only)
 * @param defenderDefense  defender's total Defense stat
 * @param isBlocked    true when the defender chose Shield Guard this turn
 * @param blockReduction   defender's weapon.blockReduction (0–1 fraction absorbed)
 */
export function calculateAttackDamage(
  baseDamage: number,
  attackerStrength: number,
  isCrit: boolean,
  defenderDefense: number,
  isBlocked: boolean,
  blockReduction: number,
): number {
  const strBonus = 1 + attackerStrength * STRENGTH_BONUS_PER_POINT;
  const critMult = isCrit ? CRIT_MULTIPLIER : 1.0;
  const rawDamage = baseDamage * strBonus * critMult;

  // Defense mitigation — diminishing returns, never reaches 100 %
  const defenseMultiplier = 100 / (100 + defenderDefense * DEFENSE_MITIGATION_FACTOR);
  let mitigated = rawDamage * defenseMultiplier;

  // Block mitigation — the defender's weapon determines how well they block.
  // blockReduction is the fraction of incoming damage absorbed (0.35–0.85),
  // so the damage that passes through is (1 − blockReduction).
  if (isBlocked) {
    mitigated *= 1 - blockReduction;
  }

  return Math.max(1, Math.round(mitigated));
}

/**
 * Apply stamina regeneration, clamped to [0, staminaMax].
 *
 * Used on every non-attacking, non-dodge turn (advance, retreat, shield
 * block, taunt) so the fighter's `staminaRegen` stat — previously computed
 * in `calculateTotalStats` but never consumed — now drives passive recovery.
 */
export function applyStaminaRegen(
  current: number,
  staminaMax: number,
  regen: number,
): number {
  return Math.max(0, Math.min(staminaMax, current + regen));
}
