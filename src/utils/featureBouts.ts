/**
 * ===========================================================================
 * D-1 — FEATURE BOUTS: who may be faced, and in what words
 * ===========================================================================
 * A Feature Bout is a boss fought OUTSIDE the tier ladder. Its row carries its
 * own gate as data (`OpponentConfig.gate`); this module is the one resolver that
 * turns that data plus a profile into "open / locked", and into the plain words
 * the tournament tab prints. Nothing here is a component's opinion, and no gate,
 * purse or card line is restated in a component.
 *
 * THE RULE, in full (boss-rosters.md Part A):
 *
 *   open  ⇔  the DERIVED rank (`utils/rank.ts`) is at least the gate's rank
 *          ∧  the gate's boss, if it names one, is in `defeatedOpponentIds`
 *          ∧  the tier the gate names, if it names one, has been reached
 *          ∧  `currentTier` is at least the bout's VENUE tier
 *
 * Every condition is inclusive, and every one is DATA — including Gnaeus's,
 * which names no boss at all: Part A encodes his gate as "Tier 3 cleared", i.e.
 * `tierReached: 4`, precisely so it is not a boss-defeat id.
 *
 * WHAT A FEATURE BOUT IS NOT (asserted by the suite, never re-derived here):
 *   • it never advances `currentTier` — `resolveVictoryTier` asks `isLadderBoss`;
 *   • it never adds a `bossKills` stripe — `nextBossKills` asks the same;
 *   • it never satisfies ANOTHER bout's boss gate — every gate names a LADDER
 *     champion's id, and a feature boss's id is never one of them.
 *
 * The module is pure: it reads the roster and the rank resolver, no storage, no
 * clock, and returns a verdict rather than a profile.
 */
import type { OpponentConfig } from '../types/game';
import { ALL_OPPONENTS, FEATURE_BOUT_OPPONENTS } from '../data/opponents';
import {
  RANK_THRESHOLDS,
  deriveRank,
  rankAtLeast,
  type GladiatorRank,
  type RankInput,
} from './rank';

/** Why a bout is still closed. One entry per unmet condition, in reading order. */
export type FeatureBoutUnmet = 'gate' | 'rank' | 'tier' | 'boss' | 'venue';

/** One bout's availability, and the sentence that says why. */
export interface FeatureBoutStatus {
  opponent: OpponentConfig;
  /** May the player enter it right now? */
  open: boolean;
  /** Has this bout already been won at least once? (A rematch stays available.) */
  defeated: boolean;
  /** The gate in plain words, from the row's own data. `''` when it declares none. */
  gateText: string;
  /** The conditions not yet met; `[]` when open. */
  unmet: FeatureBoutUnmet[];
}

/** A profile in the shape this resolver reads — a bare literal satisfies it. */
export interface FeatureBoutProfile extends RankInput {
  currentTier?: number;
}

/** The gate's rank words ("Veteran rank — 150 fame and Tier 2 reached"). */
const RANK_GATE_TEXT: Record<GladiatorRank, string> = {
  Rookie: 'Rookie rank',
  Veteran: `Veteran rank — ${RANK_THRESHOLDS.veteran.fame} fame and Tier ${RANK_THRESHOLDS.veteran.currentTier} reached`,
  Champion: `Champion rank — ${RANK_THRESHOLDS.champion.fame} fame and Tier ${RANK_THRESHOLDS.champion.currentTier} reached`,
  Legend: `Legend rank — ${RANK_THRESHOLDS.legend.fame} fame and Tier ${RANK_THRESHOLDS.legend.currentTier} reached`,
};

const ROSTER_BY_ID = new Map(ALL_OPPONENTS.map((opponent) => [opponent.id, opponent] as const));

/** The roster name a gate's sentence uses ("Aurelius the Invincible Titan" → "Aurelius"). */
function shortName(name: string): string {
  return name.split(' the ')[0].trim() || name;
}

/** The gate boss's short name, read from the roster; `null` when the id names nobody. */
function gateBossShortName(id: string | undefined): string | null {
  if (!id) return null;
  const boss = ROSTER_BY_ID.get(id);
  return boss ? shortName(boss.name) : null;
}

/** A whole, non-negative number; anything else reads as zero. */
function countOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The felled ids, dropped unless they really are ids. */
function felledIds(profile: FeatureBoutProfile | null | undefined): string[] {
  const stored = profile?.defeatedOpponentIds;
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * The gate in plain words, built only from the row's own data and the roster.
 *
 * Part A's phrasing, kept: `Requires: Champion rank — 600 fame and Tier 3
 * reached — and Valéria defeated.` A gate that names a tier instead of a boss
 * says `and Tier 3 cleared.` (Gnaeus). A row with no gate says `''`: it is not
 * available, and it has nothing truthful to print.
 */
export function featureBoutGateText(opponent: OpponentConfig | null | undefined): string {
  const gate = opponent?.gate;
  if (!gate) return '';
  const clauses = [RANK_GATE_TEXT[gate.rank] ?? `${gate.rank} rank`];
  if (gate.tierReached) clauses.push(`Tier ${Math.max(1, gate.tierReached - 1)} cleared`);
  const boss = gateBossShortName(gate.bossDefeatedId);
  if (boss) clauses.push(`${boss} defeated`);
  return `Requires: ${clauses.join(' — and ')}.`;
}

/**
 * One bout's status for a profile: open or not, and every condition it fails.
 *
 * A row that declares no gate is never available — a Feature Bout without a gate
 * is missing data, not an unlocked fight.
 */
export function resolveFeatureBout(
  opponent: OpponentConfig | null | undefined,
  profile: FeatureBoutProfile | null | undefined
): FeatureBoutStatus {
  const row = opponent ?? null;
  const defeated = row ? felledIds(profile).includes(row.id) : false;
  const base: FeatureBoutStatus = {
    opponent: row as OpponentConfig,
    open: false,
    defeated,
    gateText: featureBoutGateText(row),
    unmet: [],
  };
  if (!row || row.featureBout !== true || !row.gate) {
    return { ...base, unmet: ['gate'] };
  }

  const unmet: FeatureBoutUnmet[] = [];
  const gate = row.gate;
  if (!rankAtLeast(deriveRank(profile ?? {}), gate.rank)) unmet.push('rank');
  if (gate.tierReached && countOrZero(profile?.currentTier) < gate.tierReached) unmet.push('tier');
  if (gate.bossDefeatedId && !felledIds(profile).includes(gate.bossDefeatedId)) unmet.push('boss');
  if (countOrZero(profile?.currentTier) < row.tier) unmet.push('venue');

  return { ...base, open: unmet.length === 0, unmet };
}

/**
 * Every Feature Bout, in roster order — what the tournament tab lists.
 *
 * The list is the ROSTER's, so a bout cannot be listed twice, and a profile that
 * is missing or malformed simply locks them all (`deriveRank` reads it as
 * Rookie), which is the state such a save has actually earned.
 */
export function featureBoutStatuses(
  profile: FeatureBoutProfile | null | undefined
): FeatureBoutStatus[] {
  return FEATURE_BOUT_OPPONENTS.map((opponent) => resolveFeatureBout(opponent, profile));
}
