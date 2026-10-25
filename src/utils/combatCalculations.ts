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
 * Rage mode damage multiplier for the `rage_mode_colossus` boss mechanic
 * (Phase 38B). Applied to the raged opponent's outgoing attack damage.
 */
export const RAGE_DAMAGE_MULTIPLIER = 1.25;

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
 * Whether an attack can legally be started at `distance` with `weapon`.
 *
 * C-8.70B §R3 — the ONE range rule, read by both the tactic panel (so the
 * attack buttons disable themselves) and the combat engine (so a stale UI or a
 * direct call cannot spend stamina on a swing that cannot land). A weapon with
 * no usable range answers `false` rather than letting an invalid attack through.
 */
export function isAttackInRange(distance: number, weapon: WeaponItem): boolean {
  const range = weapon?.range;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) return false;
  if (typeof range !== 'number' || !Number.isFinite(range) || range <= 0) return false;
  return distance <= range;
}

/**
 * The readable wind-up before an announced enemy attack lands, in milliseconds.
 *
 * C-8.70B §R1 — the AI announces the strike, the HUD shows the cue and offers
 * Shield Guard / Dodge, and only at the end of this window does the existing
 * resolution run. It sits inside the audited 600–800 ms reaction band and stays
 * shorter than the ~1.1 s resolution window that follows it, so an enemy turn
 * keeps a readable rhythm without moving any combat formula.
 */
export const ENEMY_ATTACK_WINDUP_MS = 700;

/**
 * The readable wind-up before the PLAYER's own strike lands, in milliseconds.
 *
 * C-8.71B — the swing and its telegraph start at the tap, but the blow resolves
 * one window later, so the player's attack reads as a swing instead of an
 * instant number. It is ONE explicit duration for every weapon and both strike
 * types (no per-weapon timing): the deliberate 600–800 ms band, matched to the
 * enemy's 700 ms so both fighters anticipate at the same speed.
 *
 * It must stay shorter than the 1100 ms resolution window that follows every
 * action — the impact is scheduled first and the turn-end timer second, so the
 * blow always lands before the turn can pass.
 */
export const PLAYER_ATTACK_WINDUP_MS = 700;

/**
 * Stamina spent to enter the Dodge stance. The engine and the tactic panel read
 * the same constant so the displayed cost can never drift from the charge.
 */
export const DODGE_STAMINA_COST = 12;

/**
 * Chance that a Dodge stance evades an incoming strike outright (C-8.82B).
 *
 * This is the one lever that decides whether Dodge is worth its 12 SP, because
 * both stances resolve against the SAME mitigated blow: a guard passes
 * `(1 − blockReduction)` of it through every time it is hit, while a dodge
 * passes nothing on a success and ALL of it on a failure. The stance therefore
 * only trades favourably while `1 − DODGE_EVADE_CHANCE < 1 − blockReduction`,
 * i.e. while the evade rate beats the best shield in the roster.
 *
 * At the old 0.75 the roster's shields (gladius 0.82, shamshir 0.80, spatha
 * 0.85) absorbed more than a dodge avoided AND recovered stamina on a stopped
 * blow, so for a shield build Shield Guard beat Dodge on both damage and
 * stamina — strict dominance over the whole shield segment of the roster. The
 * sweep in `phaseC8_82b.test.ts` finds 0.86 the first rate that merely breaks
 * the dominance, and 0.88 the smallest whole-percent rate at which the roster's
 * heaviest attack is cut by a meaningful >= 15 % against EVERY weapon's guard
 * (spatha 0.85: guard 8 -> dodge 6.72 expected damage, 16.0 %; gladius 0.82:
 * 33 %). A dodge still fails 12 % of the time and then takes the blow
 * UNMITIGATED, so it stays a wager rather than a better shield.
 */
export const DODGE_EVADE_CHANCE = 0.88;

/**
 * {@link DODGE_EVADE_CHANCE} as the whole percentage the UI and the manual
 * print. Derived, so no display can drift from the roll the engine makes.
 */
export const DODGE_EVADE_PERCENT = Math.round(DODGE_EVADE_CHANCE * 100);

/**
 * Fraction of the fighter's `staminaRegen` a stopped blow returns through
 * Shield Guard (C-8.72B).
 *
 * C-8.70B §R2 stopped the guard from recovering on its own, but a stopped blow
 * still credited the FULL regen stat — measured at 31.9 SP per blocked exchange
 * on a representative shield build, against Dodge's 12 SP cost for a 75 %
 * evade. Halving that credit narrows the resource gap (≈ 16 SP instead of
 * ≈ 32 SP) while leaving the guard's mitigation, Dodge's cost and evade chance,
 * the damage formula and every AI probability untouched: the shield absorbs the
 * same damage, it just no longer doubles as the arena's best stamina engine.
 */
export const SHIELD_GUARD_REGEN_MULTIPLIER = 0.5;

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
 *   3. Rage multiplier  (× RAGE_DAMAGE_MULTIPLIER when attacker is raged, × 1 otherwise)
 *   4. Defense mitigation (multiplicative, diminishing returns)
 *   5. Block reduction (defender's weapon blockReduction, if actively blocking)
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
 * @param rageMultiplier  damage multiplier for rage mode (default 1.0 = no rage)
 */
export function calculateAttackDamage(
  baseDamage: number,
  attackerStrength: number,
  isCrit: boolean,
  defenderDefense: number,
  isBlocked: boolean,
  blockReduction: number,
  rageMultiplier: number = 1.0,
): number {
  const strBonus = 1 + attackerStrength * STRENGTH_BONUS_PER_POINT;
  const critMult = isCrit ? CRIT_MULTIPLIER : 1.0;
  const rawDamage = baseDamage * strBonus * critMult * rageMultiplier;

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

/**
 * Shield Guard's stamina rule (C-8.70B §R2).
 *
 * Raising the guard costs nothing and recovers NOTHING on its own: the old
 * unconditional `staminaRegen` on every Shield Guard turn made the action
 * strictly better than Dodge — damage reduction *and* free recovery — where
 * Dodge pays {@link DODGE_STAMINA_COST} for an {@link DODGE_EVADE_CHANCE} evade.
 * Recovery now happens
 * only when the guard actually STOPS a blow, i.e. in the existing `isBlocked`
 * branch of the resolution, so a raised shield that nothing hits recovers
 * nothing and the trade-off is real: certainty (partial damage absorbed) versus
 * the dodge's all-or-nothing evade at a cost.
 *
 * C-8.72B scales that credit by {@link SHIELD_GUARD_REGEN_MULTIPLIER}: the full
 * regen stat was measured at 31.9 SP per blocked exchange against Dodge's 12 SP,
 * so the guard's recovery is halved and its mitigation left exactly as it was.
 */
export function shieldGuardStaminaGain(didStopBlow: boolean, regen: number): number {
  if (!didStopBlow) return 0;
  if (typeof regen !== 'number' || !Number.isFinite(regen) || regen <= 0) return 0;
  return regen * SHIELD_GUARD_REGEN_MULTIPLIER;
}

/**
 * Determine whether the `rage_mode_colossus` boss mechanic should activate.
 *
 * Pure, side-effect-free — the caller (DuelScene) owns the ref that prevents
 * re-activation and the React state that stores `isRaged`.
 *
 * @param bossMechanic     the opponent's configured boss mechanic
 * @param currentHealth    the opponent's current HP
 * @param healthMax        the opponent's maximum HP
 * @param alreadyActivated whether rage has already activated this fight
 * @returns true if rage should activate now (caller sets isRaged + ref)
 */
export function shouldActivateRage(
  bossMechanic: string | undefined,
  currentHealth: number,
  healthMax: number,
  alreadyActivated: boolean,
): boolean {
  if (alreadyActivated) return false;
  if (bossMechanic !== 'rage_mode_colossus') return false;
  if (!Number.isFinite(currentHealth) || currentHealth <= 0) return false;
  if (!Number.isFinite(healthMax) || healthMax <= 0) return false;
  return currentHealth <= healthMax * 0.5;
}

/**
 * Combat events that can affect the player's combo counter.
 *
 * Used by `applyComboEvent` to compute the new combo count after each
 * combat resolution branch in `DuelScene.executeCombatTurn`.
 */
export type ComboEvent =
  | 'landed'          // player attack hit and was not blocked → +1
  | 'miss'            // player attack missed → reset to 0
  | 'blocked'         // player attack blocked but dealt chip damage → no change
  | 'fully_blocked'   // player attack blocked, 0 damage → reset to 0
  | 'player_damaged'  // opponent attack damaged the player → reset to 0
  | 'none';           // evaded, out of range, non-attack → no change

/**
 * Compute the new player combo count after a combat event.
 *
 * Pure and side-effect-free — the caller (`DuelScene`) owns the React
 * state (`player.comboCount`) and the ref (`statsRef.current.maxCombo`).
 *
 * Semantics (Phase 39B, defect C-9):
 *   - 'landed':         the player's attack hit and was not blocked → +1
 *   - 'miss':           the player's attack missed → reset to 0
 *   - 'fully_blocked':  the player's attack was blocked and dealt 0 damage → reset to 0
 *   - 'player_damaged': an opponent attack successfully damaged the player → reset to 0
 *   - 'blocked':        the player's attack was blocked but dealt chip damage (≥1) → no change
 *   - 'none':           evaded, out of range, or non-attack action → no change
 *
 * A critical hit counts as one successful hit, not multiple.
 * Non-attack actions (taunt, rest, advance, retreat, block, dodge) never
 * increment or reset the combo.
 *
 * @param currentCombo  the player's current combo count
 * @param event         the combat event affecting the combo
 * @returns the new combo count
 */
export function applyComboEvent(currentCombo: number, event: ComboEvent): number {
  switch (event) {
    case 'landed':         return currentCombo + 1;
    case 'miss':            return 0;
    case 'fully_blocked':   return 0;
    case 'player_damaged':  return 0;
    case 'blocked':         return currentCombo;
    case 'none':            return currentCombo;
  }
}

/**
 * Update the per-duel crowd-hype peak after a hype change.
 *
 * Returns the new peak — the maximum of the current peak and the new hype
 * value.  The peak only ever increases; it never decreases when hype remains
 * unchanged or drops back down.
 *
 * Pure and side-effect-free — the caller (DuelScene) owns the ref that stores
 * the peak (`statsRef.current.crowdHypePeak`) and the React state that stores
 * the current hype (`crowdHype`).
 *
 * @param currentPeak  the highest hype reached so far this duel
 * @param newHype      the hype value after the latest increment
 * @returns the updated peak (≥ currentPeak, never lower)
 */
export function updateHypePeak(currentPeak: number, newHype: number): number {
  return Math.max(currentPeak, newHype);
}

/**
 * A fighter's transient defensive flags that persist across the turn
 * boundary so the opponent's incoming attack can interact with them.
 *
 *   isBlocking      — set by `shield_block`, consumed on next action
 *   isInvulnerable  — set by `dodge`, consumed on next action
 *
 * Both follow the same lifecycle: set during the fighter's turn, preserved
 * through the turn-end cleanup, and cleared via `clearDefensiveStance` when
 * the fighter takes their next action (pre-clear at the top of
 * `executeCombatTurn`).
 */
export interface DefensiveStance {
  isBlocking: boolean;
  isInvulnerable: boolean;
}

/**
 * The defensive action a fighter can take during their turn.
 *
 *   'shield_block' — raises the shield (sets isBlocking)
 *   'dodge'        — enters evasion stance (sets isInvulnerable)
 *   'other'        — any non-defensive action (advance, attack, taunt, …)
 */
export type DefensiveAction = 'shield_block' | 'dodge' | 'other';

/**
 * Apply a defensive action to the fighter's stance, returning the new
 * stance. Pure and side-effect-free — the caller owns the React state.
 *
 * `shield_block` sets `isBlocking = true` (and does not touch
 * `isInvulnerable`). `dodge` sets `isInvulnerable = true` (and does not
 * touch `isBlocking`). `other` leaves both unchanged.
 *
 * Note: the caller is expected to pre-clear the stance via
 * `clearDefensiveStance` before applying a new action, so a fighter who
 * blocked last turn and dodges this turn ends up with only
 * `isInvulnerable = true`, not both flags.
 */
export function applyDefensiveAction(
  state: DefensiveStance,
  action: DefensiveAction,
): DefensiveStance {
  if (action === 'shield_block') return { ...state, isBlocking: true };
  if (action === 'dodge') return { ...state, isInvulnerable: true };
  return state;
}

/**
 * Resolve the fighter's stance at turn-end. Both `isBlocking` and
 * `isInvulnerable` are **preserved** — they must survive into the
 * opponent's turn so the incoming attack can interact with them. They are
 * consumed (cleared) when the fighter next acts via `clearDefensiveStance`.
 *
 * Pure and side-effect-free.
 */
export function resolveTurnEndDefensive(state: DefensiveStance): DefensiveStance {
  return { ...state };
}

/**
 * Clear both defensive flags. Called as a pre-clear at the top of
 * `executeCombatTurn` when a fighter takes their next action, consuming
 * any lingering block or dodge stance from the previous turn.
 *
 * Pure and side-effect-free.
 */
export function clearDefensiveStance(state: DefensiveStance): DefensiveStance {
  return { isBlocking: false, isInvulnerable: false };
}

/**
 * Choose the AI's out-of-range movement action.
 *
 * When the opponent is beyond strike range, it either advances (82 %) or
 * taunts (18 %) to close distance or build hype. This is a pure,
 * side-effect-free function that accepts an injectable random value so it
 * can be tested deterministically without touching `Math.random`.
 *
 * @param rngOrValue  A random value in [0, 1) or a () => number callback.
 *                   Defaults to Math.random for production use.
 * @returns 'advance' or 'taunt' — never an attack action
 */
export function chooseAIOutOfRangeAction(
  rngOrValue: number | (() => number) = Math.random,
): 'advance' | 'taunt' {
  const r = typeof rngOrValue === 'function' ? rngOrValue() : rngOrValue;
  return r < 0.82 ? 'advance' : 'taunt';
}

/**
 * The four actions the standard AI combat branch can choose from.
 */
export type AIStandardAction = 'quick_attack' | 'power_attack' | 'shield_block' | 'dodge';

/**
 * Backward-compatible fallback thresholds for the standard combat branch.
 *
 * These are the original hardcoded values from DuelScene before Phase 37B
 * (aggression/blockChance integration). Used when either configuration value
 * is missing, NaN, or non-finite.
 *
 *   quick_attack:   0.46
 *   power_attack:   0.26
 *   shield_block:   0.18
 *   dodge:          0.10
 */
export const AI_FALLBACK_THRESHOLDS = {
  quick: 0.46,
  power: 0.72,   // 0.46 + 0.26
  block: 0.90,   // 0.46 + 0.26 + 0.18
} as const;

/**
 * Relative weight of quick vs power attack within the offensive pool.
 *
 * Preserves the original 46:26 ratio from the pre-37B standard branch,
 * normalized so the two shares sum to 1.
 */
const OFFENSIVE_QUICK_SHARE = 46 / (46 + 26); // ≈ 0.6389

/**
 * Choose an AI standard-combat action from the opponent's `aggression` and
 * `blockChance` configuration.
 *
 * This is the fallback branch used when the opponent is in strike range,
 * has stamina, the player is not blocking, and the player is not low on
 * health. All other tactical branches (out-of-range, player-blocking,
 * low-stamina, low-player-HP, boss telegraph / counter-dodge) are handled
 * BEFORE this function is called and are completely unaffected.
 *
 * ── Probability model (single uniform draw) ────────────────────────────
 *
 *   aggression        = P(offensive action) = quick_attack + power_attack
 *   1 − aggression    = P(defensive action) = shield_block + dodge
 *
 *   Within offensive:  quick : power = 46 : 26  (original ratio preserved)
 *   Within defensive:  blockChance = P(shield_block), remainder = P(dodge)
 *
 *   Cumulative thresholds cover [0, 1) without gaps or overlaps:
 *     [0,                       aggression × 46/72)                         → quick_attack
 *     [aggression × 46/72,      aggression)                                → power_attack
 *     [aggression,              aggression + (1−aggression) × blockChance)  → shield_block
 *     [aggression + (1−aggression) × blockChance,  1)                       → dodge
 *
 * ── Fallback ───────────────────────────────────────────────────────────
 *
 * If `aggression` OR `blockChance` is missing, NaN, or non-finite, the
 * original hardcoded probabilities are used:
 *   46% quick_attack, 26% power_attack, 18% shield_block, 10% dodge
 *
 * Valid finite values outside [0, 1] are clamped to the nearest boundary
 * rather than triggering the fallback.
 *
 * @param aggression   P(offensive) in [0,1], or invalid for fallback
 * @param blockChance  P(block | defensive) in [0,1], or invalid for fallback
 * @param rngOrValue   A random value in [0,1) or a () => number callback.
 *                     Defaults to Math.random for production use.
 * @returns One of: 'quick_attack', 'power_attack', 'shield_block', 'dodge'
 */
export function chooseAIStandardAction(
  aggression: number | undefined,
  blockChance: number | undefined,
  rngOrValue: number | (() => number) = Math.random,
): AIStandardAction {
  const r = typeof rngOrValue === 'function' ? rngOrValue() : rngOrValue;

  // Validate: both must be finite numbers. If either is invalid, use
  // the backward-compatible fallback that preserves the original
  // hardcoded probabilities.
  const validAggression = typeof aggression === 'number' && Number.isFinite(aggression);
  const validBlockChance = typeof blockChance === 'number' && Number.isFinite(blockChance);

  if (!validAggression || !validBlockChance) {
    if (r < AI_FALLBACK_THRESHOLDS.quick) return 'quick_attack';
    if (r < AI_FALLBACK_THRESHOLDS.power) return 'power_attack';
    if (r < AI_FALLBACK_THRESHOLDS.block) return 'shield_block';
    return 'dodge';
  }

  // Clamp finite out-of-range values to [0, 1]
  const agg = Math.max(0, Math.min(1, aggression));
  const blk = Math.max(0, Math.min(1, blockChance));

  const quickCutoff = agg * OFFENSIVE_QUICK_SHARE;
  const powerCutoff = agg;
  const blockCutoff = agg + (1 - agg) * blk;

  if (r < quickCutoff) return 'quick_attack';
  if (r < powerCutoff) return 'power_attack';
  if (r < blockCutoff) return 'shield_block';
  return 'dodge';
}
