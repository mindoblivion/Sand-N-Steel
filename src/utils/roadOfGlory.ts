/**
 * Progression Slice 1 — the Road of Glory: the player's climb, derived.
 *
 * Seven stages stand on one road, in this order:
 *
 *   nobody → sworn → blooded → known → feared → champion → legend
 *
 * The stages are **cumulative**: a profile's current stage is the highest one it
 * qualifies for, every earlier stage is `'reached'` and every later one `'ahead'`.
 * A stage is a *record*, not a switch — nothing here grants a rank, an unlock or a
 * reward, and nothing writes the save.  This module is read-only by construction:
 * it imports the profile type, the opponent roster (so the champion gate names the
 * real Colossus id rather than a copy of it) and the rank derivation, and it returns
 * a value.
 *
 * The thresholds themselves are **not** repeated here: the requirement text below is
 * built from the constants in `src/utils/rank.ts`, which is what `deriveRank` reads,
 * so the road cannot promise a gate the rank does not enforce.
 *
 * Legend's boss gate is `deriveRank`'s own (fame >= 1,500 with a boss kill on the
 * tier-4 circuit — see `rank.ts` for why the tier is read off `currentTier`).  The
 * progression design also names a Codex "Rudis-ready" condition for Legend; there is
 * no `src/utils/codex.ts` in this tree, so Legend is the rank alone and the Codex
 * condition belongs to the slice that builds the Codex page.
 */
import type { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import {
  CHAMPION_FAME,
  CHAMPION_TIER,
  LEGEND_BOSS_KILLS,
  LEGEND_FAME,
  LEGEND_TIER,
  VETERAN_FAME,
  VETERAN_TIER,
  deriveRank,
  rankAtLeast,
  type GladiatorRank,
} from './rank';

/** The seven stages, in progression order. */
export type RoadStageId =
  | 'nobody'
  | 'sworn'
  | 'blooded'
  | 'known'
  | 'feared'
  | 'champion'
  | 'legend';

/** Where a stage stands for this profile: behind them, under them, or ahead. */
export type RoadStageState = 'reached' | 'current' | 'ahead';

/** One stage of the resolved road.  `resolveRoadState` returns exactly these. */
export interface RoadStage {
  id: RoadStageId;
  state: RoadStageState;
}

/** A stage's authored copy, joined to the resolved state by the view. */
export interface RoadStageDefinition {
  id: RoadStageId;
  /** The stage's name, as the nodes print it. */
  name: string;
  /** Where on the road this stage stands, in the design's own words. */
  place: string;
  /** What reaching it takes, in words, built from `rank.ts`'s constants. */
  requirement: string;
}

/**
 * The Colossus — the tier-4 boss of the champion gate, read from the roster so the
 * id is whatever `src/data/opponents.ts` says it is.  Empty only if the roster ever
 * loses its tier-4 boss, in which case no profile is a champion.
 */
export const AURELIUS_OPPONENT_ID: string =
  ALL_OPPONENTS.find((opponent) => opponent.isBoss === true && opponent.tier === LEGEND_TIER)?.id ??
  '';

/**
 * The champion record — authored content, printed on the Champion node whatever the
 * profile's state: the road is a record of who holds the sand, and he holds it.
 */
export const CHAMPION_RECORD_LINE =
  'AURELIUS, THE COLOSSUS — Holder of the Laurel. Four years unbowed. No challenger has taken him past his second wind.';

/** The road, in order.  Requirement text is built from `rank.ts`, never restated. */
export const ROAD_STAGES: RoadStageDefinition[] = [
  {
    id: 'nobody',
    name: 'Nobody',
    place: 'The sand flats outside the walls',
    requirement: 'Where every gladiator begins — barefoot in the sand.',
  },
  {
    id: 'sworn',
    name: 'Sworn',
    place: 'The Ludus gate',
    requirement: 'Swear the oath at the Ludus gate.',
  },
  {
    id: 'blooded',
    name: 'Blooded',
    place: 'The training yard',
    requirement: 'Win your first bout in the arena sand.',
  },
  {
    id: 'known',
    name: 'Known',
    place: 'The fountain plaza',
    requirement: `Reach ${VETERAN_FAME} fame and fight on the tier-${VETERAN_TIER} circuit.`,
  },
  {
    id: 'feared',
    name: 'Feared',
    place: 'The Colosseum forecourt',
    requirement: `Reach ${CHAMPION_FAME} fame and fight on the tier-${CHAMPION_TIER} circuit.`,
  },
  {
    id: 'champion',
    name: 'Champion',
    place: 'The arena sand',
    // The champion's requirement *is* his record: the road prints the same line.
    requirement: CHAMPION_RECORD_LINE,
  },
  {
    id: 'legend',
    name: 'Legend',
    place: 'The laurel hill',
    requirement: `Reach ${LEGEND_FAME} fame, fight on the tier-${LEGEND_TIER} circuit, and put ${LEGEND_BOSS_KILLS} or more boss kills on the scribes' tablet.`,
  },
];

/** The road's own field (`profile.road`), resolved to something a view can print. */
export interface RoadProgress {
  /** The oath has been sworn.  Absent, partial or malformed reads as unsworn. */
  oathSworn: boolean;
  /** The banner device the gladiator swore under, or `null` when none is recorded. */
  bannerDevice: string | null;
  /** The milestone ids the player has seen.  Always an array; empty when none. */
  milestonesSeen: string[];
}

/**
 * Resolve the optional `profile.road` field, house lazy-resolution style: absent,
 * partial and hand-edited all read as unsworn / no device / none seen, and nothing
 * here repairs or writes the field.
 */
export function resolveRoadProgress(
  profile: PlayerProfile | null | undefined
): RoadProgress {
  const stored = profile?.road;
  const field = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : undefined;

  return {
    oathSworn: field?.oathSworn === true,
    bannerDevice:
      typeof field?.bannerDevice === 'string' && field.bannerDevice.trim() !== ''
        ? field.bannerDevice
        : null,
    milestonesSeen: Array.isArray(field?.milestonesSeen)
      ? field.milestonesSeen.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

/** Does this profile qualify for one stage on its own?  The gates, in one place. */
function qualifiesFor(
  id: RoadStageId,
  profile: PlayerProfile | null | undefined,
  road: RoadProgress,
  rank: GladiatorRank
): boolean {
  switch (id) {
    case 'nobody':
      // Every gladiator stands on the road; this stage is never ahead of anyone.
      return true;
    case 'sworn':
      return road.oathSworn;
    case 'blooded':
      return typeof profile?.fightsWon === 'number' && profile.fightsWon >= 1;
    case 'known':
      return rankAtLeast(rank, 'Veteran');
    case 'feared':
      return rankAtLeast(rank, 'Champion');
    case 'champion':
      return AURELIUS_OPPONENT_ID !== '' && Array.isArray(profile?.defeatedOpponentIds)
        ? profile.defeatedOpponentIds.includes(AURELIUS_OPPONENT_ID)
        : false;
    case 'legend':
      // The rank alone; the Codex "Rudis-ready" condition has no module yet.
      return rank === 'Legend';
  }
}

/**
 * Resolve the road for a profile: seven stages in `ROAD_STAGES` order, each
 * `'reached'`, `'current'` or `'ahead'`.
 *
 * The current stage is the **highest** the profile qualifies for — a champion who
 * never swore the oath, or a veteran who never won the first bout, is still standing
 * higher up the road, with the skipped stages behind them.  Exactly one stage is ever
 * `'current'`, because `nobody` is every profile's floor.
 */
export function resolveRoadState(
  profile: PlayerProfile | null | undefined
): RoadStage[] {
  const road = resolveRoadProgress(profile);
  const rank = deriveRank(profile);

  const qualified = ROAD_STAGES.map((definition) =>
    qualifiesFor(definition.id, profile, road, rank)
  );
  const currentIndex = qualified.lastIndexOf(true);

  return ROAD_STAGES.map((definition, index) => ({
    id: definition.id,
    state: index < currentIndex ? 'reached' : index === currentIndex ? 'current' : 'ahead',
  }));
}
