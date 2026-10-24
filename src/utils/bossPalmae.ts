/**
 * ===========================================================================
 * CH-4 — BOSS PALMAE AT THEIR MECHANIC SITES
 * ===========================================================================
 * Two of the four `bossOnly` palmae are events rather than modifier-block
 * fields, so CH-1 could only record them in `notes`:
 *
 *   • Pit Bellower (Goliath) — "his telegraph turn also drains 8 of the
 *     player's stamina"
 *   • Pyre Brand (Ignis) — "on a phase switch, heal 10% of maximum health, once"
 *
 * Their block `effect` is the empty identity; the effect is hand-wired at the
 * boss's own existing mechanic site (the `heavy_telegraph` announce branch and
 * the `phase_weapon_switch` transition in `DuelScene`). This module owns the
 * magnitudes and the clamping, so the site stays a call and the arithmetic stays
 * testable without a browser, exactly as `combatModifiers.ts` does for the
 * stages. Palmae ADD to a mechanic: neither helper replaces anything the boss
 * already did.
 *
 * The other two boss palmae need no helper here: Colossus Hide is a
 * `damageTakenMult` already evaluated in `damageTakenMultiplier` (quick attacks
 * only, via `PALMA_TAKEN_CONDITIONS`), and Viper's Patience is a
 * `damageDealtMult` already evaluated in `damageDealtMultiplier` (on the attack
 * that follows a triggered counter, via `DamageContext.isCounterAttack`).
 *
 * Everything here is pure — no React, no storage, no randomness.
 */
import type { FighterModifiers } from './combatModifiers';

/** Pit Bellower's drain, in stamina points, on the player's telegraph turn. */
export const PIT_BELLOWER_STAMINA_DRAIN = 8;

/** Pyre Brand's phase-switch heal, as a fraction of the boss's maximum health. */
export const PYRE_BRAND_HEAL_FRACTION = 0.1;

/** True when the fighter's palmae include `id` (boss-only rows included). */
export function carriesBossPalma(mods: FighterModifiers, id: string): boolean {
  return mods.palmae.some((palma) => palma.id === id);
}

/**
 * What Goliath's telegraph turn takes off the player: 8 stamina when he carries
 * Pit Bellower, nothing otherwise. A non-boss can never reach this — `bossOnly`
 * rows are structurally excluded from non-boss configs.
 */
export function pitBellowerStaminaDrain(mods: FighterModifiers): number {
  return carriesBossPalma(mods, 'pit_bellower') ? PIT_BELLOWER_STAMINA_DRAIN : 0;
}

/** The player's stamina after a drain, floored at 0 (never negative). */
export function applyPitBellowerDrain(stamina: number, drain: number): number {
  const current = Number.isFinite(stamina) ? Math.max(0, stamina) : 0;
  if (!Number.isFinite(drain) || drain <= 0) return current;
  return Math.max(0, current - drain);
}

/**
 * What Pyre Brand restores when the phase switch fires: 10 % of maximum health
 * (rounded to a whole point, as every health value in the duel is), or 0 when
 * the boss does not carry it. "Once per fight" is the phase switch's own
 * `phaseSwitchedRef`: the ref is set before this amount is applied, so a second
 * pass through the transition cannot heal again.
 */
export function pyreBrandHealAmount(mods: FighterModifiers, healthMax: number): number {
  if (!carriesBossPalma(mods, 'pyre_brand')) return 0;
  if (!Number.isFinite(healthMax) || healthMax <= 0) return 0;
  return Math.round(healthMax * PYRE_BRAND_HEAL_FRACTION);
}

/** Health after a heal, never above the maximum (and never above `health`). */
export function applyPyreBrandHeal(health: number, healthMax: number, amount: number): number {
  if (!Number.isFinite(health) || !Number.isFinite(healthMax)) return health;
  if (!Number.isFinite(amount) || amount <= 0) return Math.min(health, healthMax);
  return Math.min(healthMax, health + amount);
}
