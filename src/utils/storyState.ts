/**
 * STORY-1 — the campaign's state, read-only.
 *
 * `resolveStoryState` answers two questions about any profile and nothing else:
 * which chapter of the campaign the player is in, and — for that chapter — the
 * state of every gate that closes it.  The chapter is DERIVED.  It is never
 * stored on the save, and this module writes no profile at all: it is the whole
 * of the campaign's read path, and the card (`components/hub/CampaignCard.tsx`)
 * is its only consumer.
 *
 * The rules, in the order they matter:
 *   • A gate whose owning system has not landed is `'pending'`, not `'unmet'`: its
 *     evidence cannot exist yet, so the card says so instead of telling the
 *     player they are behind (the design's graceful-degradation rule).  No gate
 *     reads evidence that does not exist: the race, omen and story-beat gates all
 *     resolve as pending until the slice that writes their evidence lands.
 *   • A chapter is closed when every gate whose evidence CAN exist is met, so a
 *     profile whose record already passes a chapter's available gates resolves
 *     that chapter closed (the grandfather rule).
 *   • The current chapter is the first chapter that still has an unmet gate, so
 *     a fresh profile is in Chapter 0 and a profile that has closed every
 *     available gate resolves to Chapter 7 and the Legend state.
 *   • The Oath gate is also met by the grandfather rule: a legacy profile with
 *     `fightsWon > 0` resolves as oath-sworn, which is how saves written before
 *     the `road` field existed stay playable.
 *
 * A missing, partial or malformed `story` field — and a missing, partial or
 * malformed profile — resolves to the defaults rather than throwing, exactly as
 * `resolveRacingState` does for `racing`.  The input is only ever read: nothing
 * here mutates it, and the module imports no storage.
 */

import { PlayerProfile, StoryProgress } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { GladiatorRank, rankAtLeast, deriveRank } from './rank';

/** A gate's state: met by evidence, not yet met, or waiting on a later slice. */
export type StoryGateState = 'met' | 'unmet' | 'pending';

/** The kinds of gate whose owning system has not landed yet. */
export type StoryPendingKind = 'race' | 'omen' | 'beat';

/** The ids every gate is addressed by; stable, so the card and tests can name one. */
export type StoryGateId =
  | 'oath-sworn'
  | 'first-duel-won'
  | 'doctore-test'
  | 'tier-1-boss'
  | 'district-race'
  | 'omen'
  | 'rank-veteran'
  | 'tier-2-boss'
  | 'district-final'
  | 'library-seen'
  | 'tier-3'
  | 'league-promotion'
  | 'vexus-race'
  | 'dice-ending'
  | 'rank-champion'
  | 'tier-3-boss'
  | 'league-top-half'
  | 'trial-done'
  | 'tier-4-boss'
  | 'league-final'
  | 'summit-seen'
  | 'statue-ceremony'
  | 'rank-legend';

export interface StoryGate {
  id: StoryGateId;
  /** What the gate asks for, in words — printed while the gate is unmet. */
  requirement: string;
  /** The same gate, confirmed in words — printed once it is met. */
  confirmation: string;
  /**
   * Set when the owning system has not landed: the evidence cannot exist yet, so
   * the card prints `PENDING_GATE_LINES[pendingKind]` and never the requirement.
   */
  pendingKind?: StoryPendingKind;
  state: StoryGateState;
}

export const PENDING_GATE_LINES: Record<StoryPendingKind, string> = {
  race: 'The Circus has not opened its books yet.',
  omen: 'The omens have not been read yet.',
  beat: 'That hour has not been written yet.',
};

/** The line the card reads once every available chapter is closed. */
export const LEGEND_LINE = 'The road is walked. The city is yours to keep walking.';

export interface StoryChapter {
  index: number;
  title: string;
  /** The chapter's story beat, in one line. */
  beat: string;
}

/** The campaign's chapters, 0–7, in order. */
export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    index: 0,
    title: 'Bought at Dawn',
    beat: 'Bought at dawn, sworn to the ludus before the sun clears the wall.',
  },
  {
    index: 1,
    title: 'First Sand',
    beat: 'Your first blood in the sand, and the city starts to learn your name.',
  },
  {
    index: 2,
    title: "Fortuna's Coin, the Second Sand",
    beat: "The second sand — where Fortuna's coin decides what the city makes of you.",
  },
  {
    index: 3,
    title: 'The Name in the Records',
    beat: "A veteran's name, written into the city's own records.",
  },
  {
    index: 4,
    title: "The Vulture's Wheel",
    beat: "The vulture's wheel turns, and the dice fall where they fall.",
  },
  {
    index: 5,
    title: 'The Northern Trial',
    beat: 'The cold road north, and the trial that proves you.',
  },
  {
    index: 6,
    title: 'The Laurel, Twice',
    beat: 'The Titan of the Pantheon, and a second laurel.',
  },
  {
    index: 7,
    title: 'Legend, and the Open Road',
    beat: 'The last laurel, and the road that opens after it.',
  },
];

/** The last chapter's index — where a fully closed campaign resolves. */
export const STORY_FINAL_CHAPTER = STORY_CHAPTERS[STORY_CHAPTERS.length - 1].index;

/** The story flags, resolved: every field present, nothing invented. */
export interface ResolvedStoryFlags {
  librarySeen: boolean;
  fragmentsFound: string[];
  trialDone: boolean;
  diceEnding?: 'cut' | 'refused';
  deserterChoice?: 'spared' | 'taken';
  summitSeen: boolean;
}

export interface StoryState {
  /** The current chapter, 0–7. */
  chapter: number;
  title: string;
  beat: string;
  /** Every chapter closed on its available gates — the Legend state. */
  complete: boolean;
  /** The current chapter's gates, in table order, each with its state. */
  gates: StoryGate[];
  /** The resolved story flags (malformed input resolves to the defaults). */
  flags: ResolvedStoryFlags;
}

/** What the gate checks read: the profile's record, in numbers and flags. */
interface StoryEvidence {
  /** `profile.road?.oathSworn === true`, read defensively (the field is a later slice's). */
  oathSworn: boolean;
  fightsWon: number;
  fame: number;
  currentTier: number;
  rank: GladiatorRank;
  /** The ids of the bosses who have fallen. */
  defeatedIds: string[];
  flags: ResolvedStoryFlags;
}

interface GateDefinition {
  id: StoryGateId;
  requirement: string;
  confirmation: string;
  /** The check the available evidence answers; absent for a pending gate. */
  met?: (evidence: StoryEvidence) => boolean;
  pendingKind?: StoryPendingKind;
}

/** A finite number, or `null` — a string, NaN or a missing field is not a total. */
function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The `road` field belongs to a later slice and is not declared on
 * `PlayerProfile` on this branch, so it is read structurally: the Oath gate is
 * already correct the day it lands, and this slice never claims the field.
 */
function roadOathSworn(profile: PlayerProfile | null | undefined): boolean {
  const road = (profile as { road?: unknown } | null | undefined)?.road;
  if (!road || typeof road !== 'object' || Array.isArray(road)) return false;
  return (road as { oathSworn?: unknown }).oathSworn === true;
}

/** The stored `story` field, or `undefined` when it is absent or not a plain object. */
function storedStory(
  profile: PlayerProfile | null | undefined
): Partial<StoryProgress> | undefined {
  const stored = profile?.story;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return undefined;
  return stored;
}

/** Resolve the campaign's own flags: wrong types and unknown enum names fall back. */
function resolveFlags(profile: PlayerProfile | null | undefined): ResolvedStoryFlags {
  const stored = storedStory(profile);
  const fragments = stored?.fragmentsFound;
  const diceEnding = stored?.diceEnding;
  const deserterChoice = stored?.deserterChoice;

  return {
    librarySeen: stored?.librarySeen === true,
    fragmentsFound: Array.isArray(fragments)
      ? fragments.filter((fragment): fragment is string => typeof fragment === 'string')
      : [],
    trialDone: stored?.trialDone === true,
    diceEnding: diceEnding === 'cut' || diceEnding === 'refused' ? diceEnding : undefined,
    deserterChoice:
      deserterChoice === 'spared' || deserterChoice === 'taken' ? deserterChoice : undefined,
    summitSeen: stored?.summitSeen === true,
  };
}

/** A roster boss: the id the save records, and the short name the card prints. */
function tierBoss(tier: number): { id: string; shortName: string } | undefined {
  const boss = ALL_OPPONENTS.find((opponent) => opponent.tier === tier && opponent.isBoss === true);
  if (!boss) return undefined;
  const shortName = boss.name.split(' the ')[0].trim();
  return { id: boss.id, shortName: shortName || boss.name };
}

/**
 * A gate for the arena boss of a tier, its id read from the shipped roster —
 * never a literal id, and never a name the game does not contain: if the roster
 * ever lacks that boss the gate is unmet and says so generically rather than
 * naming a fighter the player cannot face.
 */
function tierBossGate(tier: number, id: StoryGateId): GateDefinition {
  const boss = tierBoss(tier);
  return {
    id,
    requirement: boss ? `Defeat ${boss.shortName}` : `Defeat the arena champion of Tier ${tier}`,
    confirmation: boss
      ? `${boss.shortName} has fallen in the sand.`
      : `The arena champion of Tier ${tier} has fallen.`,
    met: (evidence) => !!boss && evidence.defeatedIds.includes(boss.id),
  };
}

/** A gate whose owning system has not landed: the evidence cannot exist yet. */
function pendingGate(
  id: StoryGateId,
  requirement: string,
  confirmation: string,
  pendingKind: StoryPendingKind
): GateDefinition {
  return { id, requirement, confirmation, pendingKind };
}

/** The chapters' gates, in table order.  This is the campaign's one rule table. */
const CHAPTER_GATES: readonly (readonly GateDefinition[])[] = [
  // 0 — Bought at Dawn: the Oath sworn, or the grandfather rule for legacy saves.
  [
    {
      id: 'oath-sworn',
      requirement: 'Swear the oath of the ludus',
      confirmation: 'The oath of the ludus is sworn.',
      met: (evidence) => evidence.oathSworn || evidence.fightsWon > 0,
    },
  ],
  // 1 — First Sand: the first win, and the Doctore's test (pending).
  [
    {
      id: 'first-duel-won',
      requirement: 'Win your first duel',
      confirmation: 'Your first duel is won.',
      met: (evidence) => evidence.fightsWon >= 1,
    },
    pendingGate(
      'doctore-test',
      "Pass the Doctore's test under the restricted rules",
      "The Doctore's test is passed.",
      'beat'
    ),
  ],
  // 2 — Fortuna's Coin: Goliath, the first District race (pending), the omen (pending).
  [
    tierBossGate(1, 'tier-1-boss'),
    pendingGate(
      'district-race',
      'Finish your first District race',
      'Your first District race is run.',
      'race'
    ),
    pendingGate('omen', 'Face the reading of the omen', 'The omen has been read.', 'omen'),
  ],
  // 3 — The Name in the Records: Veteran, Ignis, the District final (pending), the Library.
  [
    {
      id: 'rank-veteran',
      requirement: 'Reach Veteran — 150 fame and Tier 2',
      confirmation: 'You have reached Veteran.',
      met: (evidence) => rankAtLeast(evidence.rank, 'Veteran'),
    },
    tierBossGate(2, 'tier-2-boss'),
    pendingGate(
      'district-final',
      'Reach the District final',
      'The District final is yours to race.',
      'race'
    ),
    {
      id: 'library-seen',
      requirement: 'Read your own name in the Records & Lore Library',
      confirmation: "Your name is in the city's records.",
      met: (evidence) => evidence.flags.librarySeen,
    },
  ],
  // 4 — The Vulture's Wheel: Tier 3, the League promotion (pending), the dice.
  [
    {
      id: 'tier-3',
      requirement: 'Reach Tier 3 of the arena',
      confirmation: 'You fight in Tier 3 of the arena.',
      met: (evidence) => evidence.currentTier >= 3,
    },
    pendingGate(
      'league-promotion',
      'Take your League promotion',
      'Your League promotion is taken.',
      'race'
    ),
    pendingGate(
      'vexus-race',
      'Run the Vexus incident race',
      'The Vexus incident race is run.',
      'beat'
    ),
    {
      id: 'dice-ending',
      requirement: "Reach the vulture's dice and let them fall",
      confirmation: 'The dice have fallen.',
      met: (evidence) => evidence.flags.diceEnding !== undefined,
    },
  ],
  // 5 — The Northern Trial: Champion, Valéria, the League top half (pending), the trial.
  [
    {
      id: 'rank-champion',
      requirement: 'Reach Champion — 600 fame and Tier 3',
      confirmation: 'You have reached Champion.',
      met: (evidence) => rankAtLeast(evidence.rank, 'Champion'),
    },
    tierBossGate(3, 'tier-3-boss'),
    pendingGate(
      'league-top-half',
      "Finish in the League's top half",
      "You stand in the League's top half.",
      'race'
    ),
    {
      id: 'trial-done',
      requirement: 'Walk the Northern Trial',
      confirmation: 'The Northern Trial is walked.',
      met: (evidence) => evidence.flags.trialDone,
    },
  ],
  // 6 — The Laurel, Twice: Aurelius, the League final (pending), the summit.
  [
    tierBossGate(4, 'tier-4-boss'),
    pendingGate('league-final', 'Win the League final', 'The League final is won.', 'race'),
    {
      id: 'summit-seen',
      requirement: 'Climb to the summit above the city',
      confirmation: 'You have stood on the summit.',
      met: (evidence) => evidence.flags.summitSeen,
    },
  ],
  // 7 — Legend, and the Open Road: the rank itself, and the statue ceremony (pending).
  [
    {
      id: 'rank-legend',
      requirement: 'Reach Legend',
      confirmation: 'You have reached Legend.',
      met: (evidence) => rankAtLeast(evidence.rank, 'Legend'),
    },
    pendingGate(
      'statue-ceremony',
      'See the statue ceremony played',
      'The statue ceremony is played.',
      'beat'
    ),
  ],
];

/** Read the profile's record once, in the terms the gates are written in. */
function readEvidence(profile: PlayerProfile | null | undefined): StoryEvidence {
  const defeated = profile?.defeatedOpponentIds;
  return {
    oathSworn: roadOathSworn(profile),
    fightsWon: finiteNumber(profile?.fightsWon) ?? 0,
    fame: finiteNumber(profile?.fame) ?? 0,
    currentTier: finiteNumber(profile?.currentTier) ?? 0,
    rank: deriveRank(profile),
    defeatedIds: Array.isArray(defeated)
      ? defeated.filter((id): id is string => typeof id === 'string')
      : [],
    flags: resolveFlags(profile),
  };
}

/** State a gate: pending while its system is unlanded, else met on its own evidence. */
function resolveGate(definition: GateDefinition, evidence: StoryEvidence): StoryGate {
  const state: StoryGateState = definition.pendingKind
    ? 'pending'
    : definition.met?.(evidence)
      ? 'met'
      : 'unmet';
  return {
    id: definition.id,
    requirement: definition.requirement,
    confirmation: definition.confirmation,
    pendingKind: definition.pendingKind,
    state,
  };
}

/** A chapter is closed once every gate whose evidence can exist is met. */
function isClosed(gates: readonly StoryGate[]): boolean {
  return gates.every((gate) => gate.state !== 'unmet');
}

/**
 * The campaign's state for any profile.  Total: never throws, never mutates the
 * profile it is handed, and every malformed value resolves to the defaults.
 */
export function resolveStoryState(profile: PlayerProfile | null | undefined): StoryState {
  const evidence = readEvidence(profile);
  const resolved = CHAPTER_GATES.map((definitions) =>
    definitions.map((definition) => resolveGate(definition, evidence))
  );

  // The current chapter is the first one that still has an unmet gate; if every
  // chapter is closed on its available gates, the campaign is at its Legend end.
  let chapter = STORY_FINAL_CHAPTER;
  for (let index = 0; index < resolved.length; index += 1) {
    if (!isClosed(resolved[index])) {
      chapter = index;
      break;
    }
  }

  const current = STORY_CHAPTERS[chapter];
  return {
    chapter: current.index,
    title: current.title,
    beat: current.beat,
    complete: resolved.every((gates) => isClosed(gates)),
    gates: resolved[chapter],
    flags: evidence.flags,
  };
}

/**
 * The line the card prints for one gate: the authored pending line while its
 * system is unlanded, its confirmation once it is met, and its requirement while
 * it is unmet.  One place, so the card holds no copy of the words.
 */
export function storyGateLine(gate: StoryGate): string {
  if (gate.state === 'pending') return PENDING_GATE_LINES[gate.pendingKind ?? 'race'];
  return gate.state === 'met' ? gate.confirmation : gate.requirement;
}
