/**
 * Progression Slice 1 — `deriveRank`, and the thresholds it is derived from.
 *
 * The rank is a threshold on fields the save already carries, in ascending order:
 *
 *   • **Rookie**   — the default; every profile below the first gate.
 *   • **Veteran**  — `fame >= 150` AND `currentTier >= 2`.
 *   • **Champion** — `fame >= 600` AND `currentTier >= 3`.
 *   • **Legend**   — `fame >= 1,500` AND a boss felled on the tier-4 circuit.
 *
 * This module is the single source of truth for those numbers: the Road of Glory's
 * requirement text (`src/utils/roadOfGlory.ts`) reads the constants rather than
 * repeating them, and every boundary in `src/utils/rank.test.ts` is stated against
 * them.
 *
 * **The stored `rank` field is not this.** `PlayerProfile.rank` is what the save has
 * always carried (character creation writes `'Rookie'`); nothing here reads it,
 * nothing writes it, and there is no migration for it. `deriveRank` is the truth
 * derived from progress, and the Road page is its only consumer.
 *
 * The module is pure: it imports the profile *type* only, reads no storage, no
 * clock and no environment, and returns a rank rather than a profile — no path
 * through it can write a save.
 */
import type { PlayerProfile } from '../types/game';

/** The four ranks, ascending.  The stored union itself, so the two cannot drift. */
export type GladiatorRank = PlayerProfile['rank'];

/** The ranks as a value, for display and for the suites' sweeps. */
export const RANK_ORDER: GladiatorRank[] = ['Rookie', 'Veteran', 'Champion', 'Legend'];

/** Exhaustive against `GladiatorRank`: a fifth rank cannot be added silently. */
export const RANK_INDEX: Record<GladiatorRank, number> = {
  Rookie: 0,
  Veteran: 1,
  Champion: 2,
  Legend: 3,
};

/** Is `rank` at or above `minimum`?  Every gate is inclusive ("fame >= 150"). */
export function rankAtLeast(rank: GladiatorRank, minimum: GladiatorRank): boolean {
  return RANK_INDEX[rank] >= RANK_INDEX[minimum];
}

/** Veteran: fame >= VETERAN_FAME AND the tier-2 circuit reached. */
export const VETERAN_FAME = 150;
export const VETERAN_TIER = 2;

/** Champion: fame >= CHAMPION_FAME AND the tier-3 circuit reached. */
export const CHAMPION_FAME = 600;
export const CHAMPION_TIER = 3;

/** Legend: fame >= LEGEND_FAME AND a boss felled on the tier-4 circuit. */
export const LEGEND_FAME = 1500;
export const LEGEND_TIER = 4;
export const LEGEND_BOSS_KILLS = 1;

/**
 * The fields `deriveRank` reads.  Structural on purpose: a `PlayerProfile`
 * satisfies it, and so does a bare literal in a suite.
 */
export interface RankInput {
  fame?: number;
  currentTier?: number;
  bossKills?: number;
}

/** A missing, non-finite or negative count reads as zero — never as NaN. */
function countOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The player's rank, derived from the save.
 *
 * `bossKills` is a bare count: the save records no tier per kill, so the tier-4
 * condition is read off `currentTier`, which only ever reaches 4 by fighting
 * through the fourth-tier circuit.  A profile with no fame, tier or boss-kill
 * field at all (every pre-progression save) resolves to Rookie rather than
 * throwing, which is the state it actually earned.
 */
export function deriveRank(profile: RankInput | null | undefined): GladiatorRank {
  const fame = countOrZero(profile?.fame);
  const tier = countOrZero(profile?.currentTier);
  const bossKills = countOrZero(profile?.bossKills);

  if (fame >= LEGEND_FAME && tier >= LEGEND_TIER && bossKills >= LEGEND_BOSS_KILLS) {
    return 'Legend';
  }
  if (fame >= CHAMPION_FAME && tier >= CHAMPION_TIER) return 'Champion';
  if (fame >= VETERAN_FAME && tier >= VETERAN_TIER) return 'Veteran';
  return 'Rookie';
}
