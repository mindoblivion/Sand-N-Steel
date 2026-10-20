/**
 * The gladiator's rank, derived from the record — the single source of truth.
 *
 * The stored `rank` field is what character creation writes ('Rookie') and
 * nothing in the game ever advances it, so it says nothing about how far the
 * player has actually come.  The rank read here is DERIVED from the record that
 * does move — fame, the tier the player fights in, and the bosses who have
 * fallen — and is never written back to the save.
 *
 * The thresholds, ascending:
 *
 *   | rank     | fame    | and                                     |
 *   |----------|---------|-----------------------------------------|
 *   | Rookie   | —       | the default: everything below           |
 *   | Veteran  | >= 150  | `currentTier` >= 2                      |
 *   | Champion | >= 600  | `currentTier` >= 3                      |
 *   | Legend   | >= 1500 | Tier 4, and a boss felled on that tier  |
 *
 * A Tier-4 boss felled is recorded two ways on the save: the profile's
 * `bossKills` count, and the fallen boss's id in `defeatedOpponentIds` (what the
 * arena's win path writes today).  Either is evidence of the same kill, so either
 * satisfies Legend — a save carrying one of them is not asked to carry both.
 *
 * A missing, partial or malformed profile resolves to 'Rookie' rather than
 * throwing — the same contract `resolveRacingState` and `resolveStoryState` keep.
 * The module is pure: it imports the profile type and the shipped roster only,
 * reads no storage and no clock, and returns a rank rather than a profile, so no
 * path through it can write a save.
 */

import type { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';

/** The four ranks, ascending.  The stored union itself, so the two cannot drift. */
export type GladiatorRank = PlayerProfile['rank'];

/** The ranks as a value, for display and for the suites' sweeps. */
export const RANK_ORDER: readonly GladiatorRank[] = [
  'Rookie',
  'Veteran',
  'Champion',
  'Legend',
];

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
 * The same thresholds keyed by rank, for consumers that walk the table (the
 * campaign card's gate table).  Built from the constants above, so the two forms
 * cannot drift.
 */
export const RANK_THRESHOLDS = {
  veteran: { fame: VETERAN_FAME, currentTier: VETERAN_TIER },
  champion: { fame: CHAMPION_FAME, currentTier: CHAMPION_TIER },
  legend: { fame: LEGEND_FAME, currentTier: LEGEND_TIER },
} as const;

/**
 * The fields `deriveRank` reads.  Structural on purpose: a `PlayerProfile`
 * satisfies it, and so does a bare literal in a suite.
 */
export interface RankInput {
  fame?: number;
  currentTier?: number;
  bossKills?: number;
  defeatedOpponentIds?: string[];
}

/** A missing, non-finite or negative count reads as zero — never as NaN. */
function countOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Every Tier-4 boss in the shipped roster — the rank's Legend condition. */
function tierFourBossIds(): string[] {
  return ALL_OPPONENTS.filter(
    (opponent) => opponent.tier === LEGEND_TIER && opponent.isBoss === true
  ).map((opponent) => opponent.id);
}

/** The felled ids, dropped unless they are really ids (strings). */
function felledIds(profile: RankInput | null | undefined): string[] {
  const stored = profile?.defeatedOpponentIds;
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === 'string');
}

/**
 * The player's rank, derived from the save.
 *
 * Legend is tested first, then Champion, then Veteran, so the highest satisfied
 * row wins.  A profile with no fame, tier or kill record at all (every
 * pre-progression save) resolves to Rookie rather than throwing, which is the
 * state it actually earned.
 */
export function deriveRank(profile: RankInput | null | undefined): GladiatorRank {
  const fame = countOrZero(profile?.fame);
  const tier = countOrZero(profile?.currentTier);
  const bossKills = countOrZero(profile?.bossKills);
  const felled = felledIds(profile);

  const tierFourBossDown =
    bossKills >= LEGEND_BOSS_KILLS || tierFourBossIds().some((id) => felled.includes(id));

  if (fame >= LEGEND_FAME && tier >= LEGEND_TIER && tierFourBossDown) return 'Legend';
  if (fame >= CHAMPION_FAME && tier >= CHAMPION_TIER) return 'Champion';
  if (fame >= VETERAN_FAME && tier >= VETERAN_TIER) return 'Veteran';
  return 'Rookie';
}
