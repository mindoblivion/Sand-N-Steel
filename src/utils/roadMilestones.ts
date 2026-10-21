/**
 * The Road of Glory's rituals — what a newly reached stage fires, and once only.
 *
 * Evaluated at exactly two call sites, the same two the city's surfaces report from:
 * the duel result handler and city entry.  It compares `resolveRoadState` before and
 * after the event; every stage that is newly reached fires its ritual and its id is
 * appended to `profile.road.milestonesSeen`, which this module is the only writer of.
 * There is no watcher and no timer — an event that changes nothing fires nothing.
 *
 * City entry is the grandfathering site, not a settlement: it passes a null baseline so
 * the stages a save has already earned but never been shown are recorded, and `silent`
 * so that history is written without the herald reading it back as news.
 *
 * Nothing else is stored: the rank gates are read from the road, the boss names from
 * `src/data/opponents.ts`, and the banner's stripes stay derived (`src/utils/heraldry.ts`).
 */
import type { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { resolveRoadProgress, resolveRoadState, type RoadStageId } from './roadOfGlory';
import { isBannerDevice, type BannerDevice } from './heraldry';

/** The herald's copy, one template per cry. */
export const HERALD_CRIES = {
  /** The Veteran rank gate. */
  veteran: (name: string) => `The herald cries: ${name}, Veteran of the Ludus!`,
  /** The Champion rank gate, in the same voice. */
  champion: (name: string) => `The herald cries: ${name}, Champion of Rome!`,
  /** A boss put down, named from the roster. */
  boss: (boss: string, name: string) => `${boss} has fallen to ${name}!`,
};

/**
 * The stages with something to say.  Every other stage is still recorded in
 * `milestonesSeen` — it simply has no cry of its own.
 */
const CRYING_STAGES: Partial<Record<RoadStageId, (name: string) => string>> = {
  known: HERALD_CRIES.veteran,
  feared: HERALD_CRIES.champion,
};

export interface RoadRitual {
  stage: RoadStageId;
  /** The cry this stage raises, or `null` for a silent stage. */
  cry: string | null;
  /** The Veteran ritual also opens the Device Choosing panel. */
  offerDeviceChoice: boolean;
}

export interface RoadEvaluation {
  /** The profile to save: `after`, with any new milestone ids appended. */
  profile: PlayerProfile;
  /** True when `milestonesSeen` grew, i.e. there is something new to save. */
  changed: boolean;
  rituals: RoadRitual[];
  /** Everything the herald says this time, in order. Empty when the call is `silent`. */
  cries: string[];
  /** True while the road is at or past Veteran and no device is recorded. */
  offerDeviceChoice: boolean;
}

/** Per-call switches. Only city entry sets one. */
export interface RoadEvaluationOptions {
  /**
   * City-entry grandfathering: record the stages the save has already earned but has
   * never been shown, and say nothing. A cry belongs to the event that won the stage —
   * the duel settlement — never to an arrival, so a save that is only now meeting its
   * own history must not hear that history read back as news. `rituals` still describes
   * what was recorded and `offerDeviceChoice` is untouched, so a grandfathered veteran
   * is still offered a banner device.
   */
  silent?: boolean;
}

/** The stages the road has already carried this profile through, in road order. */
function reachedStages(profile: PlayerProfile | null | undefined): RoadStageId[] {
  return resolveRoadState(profile)
    .filter((stage) => stage.state !== 'ahead')
    .map((stage) => stage.id);
}

/** Bosses this event put down for the first time, named from the roster. */
function newlyDefeatedBosses(
  before: PlayerProfile | null | undefined,
  after: PlayerProfile
): string[] {
  const alreadyFelled = new Set(before?.defeatedOpponentIds ?? []);
  const fresh = (after.defeatedOpponentIds ?? []).filter((id) => !alreadyFelled.has(id));

  return fresh
    .map((id) => ALL_OPPONENTS.find((opponent) => opponent.id === id))
    .filter((opponent) => opponent?.isBoss === true)
    .map((opponent) => (opponent as { name: string }).name);
}

/**
 * Compare the road before and after one event.  A stage fires only when this event
 * newly reached it and its id is not already recorded, so a replayed or repeated
 * evaluation is silent.
 */
export function evaluateRoadMilestones(
  before: PlayerProfile | null | undefined,
  after: PlayerProfile,
  options: RoadEvaluationOptions = {}
): RoadEvaluation {
  const name = after.name;
  const seen = resolveRoadProgress(after).milestonesSeen;
  const beforeReached = new Set(reachedStages(before));
  const freshStages = reachedStages(after).filter(
    (id) => id !== 'nobody' && !beforeReached.has(id) && !seen.includes(id)
  );

  const rituals: RoadRitual[] = freshStages.map((stage) => ({
    stage,
    cry: CRYING_STAGES[stage]?.(name) ?? null,
    offerDeviceChoice: stage === 'known',
  }));

  // A silent evaluation records what it finds and says nothing: city entry passes a null
  // baseline (so every earned-but-unshown stage is "fresh") and must not read the save's
  // whole boss history back to the herald — those cries were raised where the bosses fell.
  const cries = options.silent
    ? []
    : [
        ...rituals.map((ritual) => ritual.cry).filter((cry): cry is string => cry !== null),
        ...newlyDefeatedBosses(before, after).map((boss) => HERALD_CRIES.boss(boss, name)),
      ];

  const changed = freshStages.length > 0;
  const profile: PlayerProfile = changed
    ? {
        ...after,
        road: { ...(after.road ?? {}), milestonesSeen: [...seen, ...freshStages] },
      }
    : after;

  // Grandfathering: a gladiator already past Veteran without a device is offered the
  // panel at the next evaluation — never silently deviceless.
  const pastVeteran = reachedStages(after).includes('known');
  const offerDeviceChoice = pastVeteran && resolveRoadProgress(after).bannerDevice === null;

  return { profile, changed, rituals, cries, offerDeviceChoice };
}

/**
 * The one-time Device Choosing write: `road.bannerDevice`, set once and never again.
 * Refuses (`null`) a device this build cannot paint, or a banner that already carries
 * one, so a repeated or stale click can never rewrite the choice.
 */
export function chooseBannerDevice(
  profile: PlayerProfile | null | undefined,
  device: BannerDevice
): PlayerProfile | null {
  if (!profile || !isBannerDevice(device)) return null;
  if (resolveRoadProgress(profile).bannerDevice !== null) return null;

  return { ...profile, road: { ...(profile.road ?? {}), bannerDevice: device } };
}
