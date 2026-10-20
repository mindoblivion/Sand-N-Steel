/**
 * STORY-1 — the derived gladiator rank.
 *
 * The save's own `rank` field is what character creation writes ('Rookie') and
 * nothing in the game ever advances it, so it says nothing about how far the
 * player has actually come.  The rank the campaign reads is therefore DERIVED
 * from the record that does move — fame, the tier the player fights in, and the
 * bosses who have fallen — and is never written back to the save.
 *
 * The thresholds, and nothing else, are the whole rule:
 *
 *   | rank     | fame    | and                                          |
 *   |----------|---------|----------------------------------------------|
 *   | Rookie   | —       | the default: everything below                |
 *   | Veteran  | >= 150  | `currentTier` >= 2                           |
 *   | Champion | >= 600  | `currentTier` >= 3                           |
 *   | Legend   | >= 1500 | a Tier-4 boss beaten (`defeatedOpponentIds`) |
 *
 * A missing, partial or malformed profile resolves to 'Rookie' rather than
 * throwing — the same contract `resolveRacingState` and `resolveStoryState` keep
 * — and the stored `rank` field is ignored here: never read, never written.
 */

import { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';

/** The four ranks, in ascending order. */
export type GladiatorRank = 'Rookie' | 'Veteran' | 'Champion' | 'Legend';

/** The thresholds above, as the single source of truth for this module. */
export const RANK_THRESHOLDS = {
  veteran: { fame: 150, currentTier: 2 },
  champion: { fame: 600, currentTier: 3 },
  /** `currentTier` here names the tier whose BOSS must be in `defeatedOpponentIds`. */
  legend: { fame: 1500, currentTier: 4 },
} as const;

/** Ascending, so `rankAtLeast` can compare two ranks without a second table. */
export const RANK_ORDER: readonly GladiatorRank[] = ['Rookie', 'Veteran', 'Champion', 'Legend'];

/** Is `rank` at least `minimum`?  'Legend' is the end of the ladder. */
export function rankAtLeast(rank: GladiatorRank, minimum: GladiatorRank): boolean {
  return RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf(minimum);
}

/** A finite number, or `null` — a string, NaN or a missing field is not a total. */
function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The beaten ids, dropped unless they are really ids (strings). */
function defeatedIds(profile: PlayerProfile | null | undefined): string[] {
  const stored = profile?.defeatedOpponentIds;
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === 'string');
}

/** Every Tier-4 boss in the shipped roster — the rank's Legend condition. */
function tierFourBossIds(): string[] {
  return ALL_OPPONENTS.filter(
    (opponent) => opponent.tier === RANK_THRESHOLDS.legend.currentTier && opponent.isBoss === true
  ).map((opponent) => opponent.id);
}

/**
 * The rank a profile's record has earned.  Legend is tested first, then
 * Champion, then Veteran, so the highest satisfied row wins.
 */
export function deriveRank(profile: PlayerProfile | null | undefined): GladiatorRank {
  const fame = finiteNumber(profile?.fame) ?? 0;
  const currentTier = finiteNumber(profile?.currentTier) ?? 0;
  const defeated = defeatedIds(profile);

  const hasTierFourBoss = tierFourBossIds().some((id) => defeated.includes(id));

  if (fame >= RANK_THRESHOLDS.legend.fame && hasTierFourBoss) return 'Legend';
  if (fame >= RANK_THRESHOLDS.champion.fame && currentTier >= RANK_THRESHOLDS.champion.currentTier) {
    return 'Champion';
  }
  if (fame >= RANK_THRESHOLDS.veteran.fame && currentTier >= RANK_THRESHOLDS.veteran.currentTier) {
    return 'Veteran';
  }
  return 'Rookie';
}
