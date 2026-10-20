/**
 * The arena purse — what a Colosseum victory actually pays.
 *
 * Every opponent already carries a flat `rewardGold` bounty (`data/opponents.ts`),
 * and `App.handleMatchComplete` credits `stats.goldEarned` to `profile.gold` on a
 * win. That flat bounty is the purse's floor; this module is the rule that turns a
 * finished fight's own statistics into the amount actually paid, so the gold that
 * funds tempering rewards HOW the player won, not only that they survived.
 *
 * The purse is the base bounty plus three performance bonuses:
 *
 *   • **Crowd favour** — +10 % of the base for every full 25 points of crowd hype
 *     above 50 the fight peaked at (75 → +10 %, 100 → +20 %). A flat, quiet win
 *     pays the bounty and nothing more.
 *   • **Precision** — 5 gold per perfect block, capped at five blocks (+25).
 *   • **Flawless** — a fight won without taking a single point of damage pays an
 *     extra 50 % of the base.
 *
 * A loss pays nothing at all: the arena only feeds a winner, which is what keeps
 * gold a reward for risking the sand rather than an income for standing in it.
 *
 * Everything here is a pure function of the numbers it is handed — no profile, no
 * storage, no randomness — so the duel pays the figure the result screen shows and
 * the rule is checkable on its own. Malformed input (NaN, negative, missing) is
 * clamped to zero instead of throwing.
 */

import type { DuelGoldBreakdown } from '../types/game';

/** Hype at or below this earns no crowd-favour bonus. */
export const PURSE_HYPE_FLOOR = 50;
/** Each full step of hype above the floor is worth one share of the base. */
export const PURSE_HYPE_STEP = 25;
/** One step's share of the base bounty. */
export const PURSE_HYPE_STEP_RATE = 0.1;
/** Gold per perfect block. */
export const PURSE_PRECISION_PER_BLOCK = 5;
/** Perfect blocks beyond this earn nothing, so a long fight cannot out-earn the bounty alone. */
export const PURSE_PRECISION_MAX_BLOCKS = 5;
/** Extra share of the base paid for taking no damage at all. */
export const PURSE_FLAWLESS_RATE = 0.5;

/** The fight figures the purse is read from — the same ones the result screen shows. */
export interface DuelPurseInput {
  /** The opponent's own `rewardGold` — the victory bounty before bonuses. */
  baseGold: number;
  /** Only a victory pays. A loss returns an all-zero purse. */
  didWin: boolean;
  /** The fight's peak crowd hype (0 … 100). */
  crowdHypePeak: number;
  /** Perfect blocks landed by the player. */
  perfectBlocks: number;
  /** Damage the player took across the whole fight; 0 means flawless. */
  damageTaken: number;
}

/** Clamp any runtime value to a non-negative integer. */
function toCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * The gold a finished duel pays, itemised.
 *
 * `total` is what the caller credits to the purse and what the result screen
 * renders; the four parts are the breakdown. For a loss every field is 0, and
 * `total` is never negative.
 */
export function calculateDuelGold(input: DuelPurseInput): DuelGoldBreakdown {
  if (!input || !input.didWin) {
    return { base: 0, hype: 0, precision: 0, flawless: 0, total: 0 };
  }

  const base = toCount(input.baseGold);

  const hypeSteps = Math.max(
    0,
    Math.floor((toCount(input.crowdHypePeak) - PURSE_HYPE_FLOOR) / PURSE_HYPE_STEP),
  );
  const hype = Math.round(base * PURSE_HYPE_STEP_RATE * hypeSteps);

  const blocks = Math.min(toCount(input.perfectBlocks), PURSE_PRECISION_MAX_BLOCKS);
  const precision = blocks * PURSE_PRECISION_PER_BLOCK;

  const flawless = toCount(input.damageTaken) === 0 ? Math.round(base * PURSE_FLAWLESS_RATE) : 0;

  return { base, hype, precision, flawless, total: base + hype + precision + flawless };
}
