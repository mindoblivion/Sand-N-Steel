/**
 * C-8.70C — the crowd's live rule: decay, embolden, the turning, the peak
 * reward and Aurelius's rage feed.
 *
 * Pure functions over the numbers in `data/crowdConfig.ts` — no React, no
 * three.js, no clock, no storage — so the duel's loop and the suite drive the
 * SAME arithmetic and the tuning has one home.
 *
 * `combatCalculations.ts` is NOT touched by this slice: the embolden shift is an
 * INPUT (`crowdEmboldenedAggression` adjusts the profile values DuelScene hands
 * the existing chooser) and the rage feed scales the multiplier VALUE that the
 * shipped damage formula already accepts, so no selection or damage formula
 * changes.
 */
import { CROWD_CONFIG, crowdTierTuning, type CrowdConfig } from '../data/crowdConfig';
import type { OpponentConfig } from '../types/game';
import { RAGE_DAMAGE_MULTIPLIER } from './combatCalculations';

/** Clamp any hype reading onto the shipped 0…ceiling band; junk reads as 0. */
export function clampCrowdHype(hype: number, config: CrowdConfig = CROWD_CONFIG): number {
  if (typeof hype !== 'number' || !Number.isFinite(hype)) return 0;
  return Math.max(0, Math.min(config.hypeCeiling, hype));
}

/** The clamped hype as a 0…1 fraction of the ceiling. */
function hypeFraction(hype: number, config: CrowdConfig): number {
  return clampCrowdHype(hype, config) / config.hypeCeiling;
}

// ── Decay ───────────────────────────────────────────────────────────────────

/** Hype lost per second for a venue tier, accelerated while the sand is quiet. */
export function crowdDecayPerSecond(
  tier: number | undefined,
  passive: boolean,
  config: CrowdConfig = CROWD_CONFIG,
): number {
  const tuning = crowdTierTuning(tier, config);
  return tuning.decayRatePerSecond * (passive ? tuning.passiveDecayMultiplier : 1);
}

export interface CrowdDecayInput {
  hype: number;
  tier: number | undefined;
  /** True while NEITHER fighter has taken an offensive action inside the window. */
  passive: boolean;
  dtSeconds: number;
  /**
   * C-8.70C — an optional factor on the tier's own rate. Invictus passes its
   * top-tier 1.25 here; every other caller omits it and reads exactly the
   * config value (1).
   */
  rateMultiplier?: number;
  config?: CrowdConfig;
}

/**
 * One tick of the crowd's clock: `hype − rate × dt`, floored at 0. A
 * non-finite or non-positive tick changes nothing (a paused duel does not cool),
 * and the result is rounded to 3 dp so a float tail cannot move a comparison.
 */
export function applyCrowdHypeDecay(input: CrowdDecayInput): number {
  const config = input.config ?? CROWD_CONFIG;
  const hype = clampCrowdHype(input.hype, config);
  const dt = Number.isFinite(input.dtSeconds) && input.dtSeconds > 0 ? input.dtSeconds : 0;
  if (dt === 0) return hype;
  const multiplier =
    typeof input.rateMultiplier === 'number' && Number.isFinite(input.rateMultiplier)
      ? input.rateMultiplier
      : 1;
  const rate = crowdDecayPerSecond(input.tier, input.passive, config) * multiplier;
  return Math.max(0, Math.round((hype - rate * dt) * 1000) / 1000);
}

/** True once the sand has been quiet for the tier's whole passive window. */
export function crowdIsPassive(
  msSinceOffensiveAction: number,
  tier: number | undefined,
  config: CrowdConfig = CROWD_CONFIG,
): boolean {
  if (!Number.isFinite(msSinceOffensiveAction)) return false;
  const windowMs = crowdTierTuning(tier, config).passiveWindowSeconds * 1000;
  return msSinceOffensiveAction >= windowMs;
}

/** The two attacks are the crowd's idea of an offensive action; nothing else is. */
export function crowdOffensiveAction(action: string): boolean {
  return action === 'quick_attack' || action === 'power_attack';
}

// ── Embolden ────────────────────────────────────────────────────────────────

/**
 * The aggression shift the crowd adds at this hype: 0 below the threshold,
 * `emboldenFloorShift` AT the threshold, linear to `emboldenCap` at
 * `emboldenFullThreshold`, and never above the cap.
 */
export function crowdEmboldenShift(hype: number, config: CrowdConfig = CROWD_CONFIG): number {
  const value = clampCrowdHype(hype, config);
  if (value < config.emboldenThreshold) return 0;
  if (value >= config.emboldenFullThreshold) return config.emboldenCap;
  const span = config.emboldenFullThreshold - config.emboldenThreshold;
  const progress = span > 0 ? (value - config.emboldenThreshold) / span : 1;
  return config.emboldenFloorShift + progress * (config.emboldenCap - config.emboldenFloorShift);
}

/**
 * The opponent's effective aggression: its resolved base plus the shift, capped
 * at 1. Non-finite bases are passed through untouched — the chooser's own
 * fallback branch owns them, so this can never resurrect a NaN as a number.
 */
export function crowdEmboldenedAggression(
  aggression: number,
  hype: number,
  config: CrowdConfig = CROWD_CONFIG,
): number {
  if (typeof aggression !== 'number' || !Number.isFinite(aggression)) return aggression;
  const shift = crowdEmboldenShift(hype, config);
  if (shift <= 0) return aggression;
  return Math.min(1, aggression + shift);
}

/** The public hype-state reader: current hype and the emboldened band, for a boss. */
export interface CrowdHypeState {
  hype: number;
  isEmboldened: boolean;
  shift: number;
}

export function readCrowdHypeState(hype: number, config: CrowdConfig = CROWD_CONFIG): CrowdHypeState {
  const value = clampCrowdHype(hype, config);
  const shift = crowdEmboldenShift(value, config);
  return { hype: value, isEmboldened: shift > 0, shift };
}

// ── The second half, and the crowd turning ──────────────────────────────────

/** Where the second half begins: elapsed time against the config's expectation. */
export function crowdSecondHalfStartSeconds(config: CrowdConfig = CROWD_CONFIG): number {
  return config.expectedDuelSeconds / 2;
}

export function isCrowdSecondHalf(elapsedSeconds: number, config: CrowdConfig = CROWD_CONFIG): boolean {
  if (!Number.isFinite(elapsedSeconds)) return false;
  return elapsedSeconds >= crowdSecondHalfStartSeconds(config);
}

/** True only in the second half AND below the turning threshold. */
export function crowdTurnsNow(
  hype: number,
  elapsedSeconds: number,
  config: CrowdConfig = CROWD_CONFIG,
): boolean {
  return isCrowdSecondHalf(elapsedSeconds, config) && clampCrowdHype(hype, config) < config.crowdTurnedThreshold;
}

// ── The rewards ─────────────────────────────────────────────────────────────

/** A peak bonus: `base × (peak / ceiling × factor)`, rounded, never negative. */
export function crowdPeakBonus(
  base: number,
  factor: number,
  hypePeak: number,
  config: CrowdConfig = CROWD_CONFIG,
): number {
  const amount = Number.isFinite(base) ? Math.max(0, base) : 0;
  if (!Number.isFinite(factor) || factor <= 0) return 0;
  return Math.round(amount * hypeFraction(hypePeak, config) * factor);
}

export interface CrowdDuelRewardInput {
  baseFame: number;
  baseGold: number;
  crowdHypePeak: number;
  crowdTurned: boolean;
  config?: CrowdConfig;
}

export interface CrowdDuelReward {
  /** The peak bonus paid to fame, separate from the base. */
  peakFameBonus: number;
  /** The peak bonus paid to gold, separate from the purse. */
  peakGoldBonus: number;
  /** Fame before the crowd's turning is applied (base + peak bonus). */
  fameBeforeTurn: number;
  /** The fame actually paid. */
  fame: number;
  /** How much fame the turning cost, 0 when it did not turn. */
  fameLost: number;
  crowdTurned: boolean;
}

/**
 * The crowd's own line items on a victory: the peak bonus for fame and gold, and
 * the turning's fame multiplier (< 1). Gold is NEVER reduced by the turning —
 * only fame is.
 */
export function crowdDuelReward(input: CrowdDuelRewardInput): CrowdDuelReward {
  const config = input.config ?? CROWD_CONFIG;
  const peakFameBonus = crowdPeakBonus(input.baseFame, config.peakFameFactor, input.crowdHypePeak, config);
  const peakGoldBonus = crowdPeakBonus(input.baseGold, config.peakGoldFactor, input.crowdHypePeak, config);
  const fameBeforeTurn = (Number.isFinite(input.baseFame) ? Math.max(0, input.baseFame) : 0) + peakFameBonus;
  const fame = input.crowdTurned ? Math.round(fameBeforeTurn * config.turnedFameFactor) : fameBeforeTurn;
  return {
    peakFameBonus,
    peakGoldBonus,
    fameBeforeTurn,
    fame,
    fameLost: fameBeforeTurn - fame,
    crowdTurned: input.crowdTurned === true,
  };
}

// ── Aurelius's rage feed (boss-only, NEW rate — see the note below) ─────────

/**
 * `rage_mode_colossus` is Aurelius's id and nobody else's: the fence requires a
 * BOSS that owns that mechanic, so Goliath (`heavy_telegraph`) and every regular
 * row answer false. This is the ONLY place hype is read as power.
 */
export function crowdRageFeedApplies(
  opponent: Pick<OpponentConfig, 'isBoss' | 'bossMechanic'> | null | undefined,
): boolean {
  return Boolean(opponent && opponent.isBoss === true && opponent.bossMechanic === 'rage_mode_colossus');
}

/** The rage accumulation RATE multiplier: `1 + hype/100 × rageFeedFactor`. */
export function crowdRageRateMultiplier(hype: number, config: CrowdConfig = CROWD_CONFIG): number {
  return 1 + hypeFraction(hype, config) * config.rageFeedFactor;
}

/**
 * One tick of the rage charge (0…1). AUTHORED rate — the shipped CF-6 rage is a
 * TRIGGER (it ignites at 50 % health), so no accumulation rate existed; this is
 * the minimal one added, and the charge is what the existing
 * `RAGE_DAMAGE_MULTIPLIER` input ramps to.
 */
export function advanceCrowdRageCharge(
  charge: number,
  hype: number,
  dtSeconds: number,
  config: CrowdConfig = CROWD_CONFIG,
): number {
  const current = Number.isFinite(charge) ? Math.max(0, Math.min(1, charge)) : 0;
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
  if (dt === 0) return current;
  const rate = config.rageAccumulationPerSecond * crowdRageRateMultiplier(hype, config);
  return Math.min(1, current + rate * dt);
}

/** The rage damage multiplier at a charge: 1.0 → the shipped 1.25 at full charge. */
export function crowdRageDamageMultiplier(charge: number): number {
  const value = Number.isFinite(charge) ? Math.max(0, Math.min(1, charge)) : 0;
  return 1 + (RAGE_DAMAGE_MULTIPLIER - 1) * value;
}
