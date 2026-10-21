/**
 * GC20 — the golden save corpus: the profile shapes the game has shipped, as data.
 *
 * The player profile is whole-profile JSON in `localStorage` under
 * `sand_and_steel_gladiator_save_v2` (see `services/storage.ts`) with **no version
 * field and no migration**.  New fields resolve lazily — `resolveRacingState` and
 * `resolveChariotLoadout` read a missing, partial or malformed field back to a
 * sane default rather than repairing it — and that design is safe only for as long
 * as every historical shape keeps resolving.  This directory is the corpus that
 * proves it: one frozen `.json` file per shape, each a complete profile.
 *
 * The fixtures are DATA, never rendered and never imported by production: the
 * only consumer is `src/utils/saveCorpus.test.ts`.  Each one is synthetic
 * (constructed here, or reconstructed from this repository's own history) — no
 * real player's save is or ever was copied into this directory.
 *
 * **Corpus rule — a future slice that adds a field to the save adds a fixture for
 * the shape it writes in the same PR.**  The manifest beside this file lists what
 * each fixture covers; `saveCorpus.test.ts` fails if a fixture file is not
 * registered here, or if a registered one is missing.
 *
 * Provenance is one line per fixture (the long form is in `MANIFEST.md`).
 */

import { PlayerProfile } from '../../types/game';

import minimalLegacyProfile from './minimalLegacyProfile.json';
import currentFreshProfile from './currentFreshProfile.json';
import midCareerProfile from './midCareerProfile.json';
import racingEraProfile from './racingEraProfile.json';
import nullObjectsProfile from './nullObjectsProfile.json';
import partialRacingProfile from './partialRacingProfile.json';
import partialChariotProfile from './partialChariotProfile.json';
import unknownFieldsProfile from './unknownFieldsProfile.json';
import storyRoadEraProfile from './storyRoadEraProfile.json';
import partialStoryProfile from './partialStoryProfile.json';
import emptyFieldsProfile from './emptyFieldsProfile.json';

/** What one fixture is, where it came from, and which shapes it covers. */
export interface SaveFixture {
  /** Stable id, used in test names and in the manifest. */
  id: string;
  /** The file's own name inside this directory. */
  file: string;
  /** One line: the era/shape it represents and how it was obtained. */
  provenance: string;
  /** The shapes it covers — what a future slice must not break. */
  covers: string[];
  /** The parsed shape. Cast on purpose: the suite validates it at runtime. */
  profile: PlayerProfile;
}

/**
 * A JSON import is typed by its literals, so a fixture is cast rather than
 * asserted into the profile type — the corpus's whole point is that the shape is
 * checked by loading and resolving it (which `saveCorpus.test.ts` does), not by
 * the compiler.  A malformed-adjacent fixture could never satisfy `PlayerProfile`
 * statically, and pinning it as if it did would hide the thing under test.
 */
const asProfile = (raw: unknown): PlayerProfile => raw as PlayerProfile;

export const SAVE_FIXTURES: SaveFixture[] = [
  {
    id: 'minimal-legacy',
    file: 'minimalLegacyProfile.json',
    provenance:
      "The import-era shipped creation's shape (git 76984d6, CharacterCreation.handleFinish), frozen: createNewProfile's field set plus `isLeftyMode`, which the factory omits.",
    covers: ['creation shape as first shipped', 'no chariot', 'no racing'],
    profile: asProfile(minimalLegacyProfile),
  },
  {
    id: 'current-fresh',
    file: 'currentFreshProfile.json',
    provenance:
      "Generated from createNewProfile('Tester') at HEAD and frozen — exactly what the factory writes today, untouched.",
    covers: ['the factory shape today', 'the shape every dev harness builds on'],
    profile: asProfile(currentFreshProfile),
  },
  {
    id: 'mid-career',
    file: 'midCareerProfile.json',
    provenance:
      'Hand-aged from a fresh save through the fields the shipped handlers advance (level, tier, defeated opponents, fights, an owned and equipped loadout).',
    covers: ['a played profile', 'gear owned and equipped', 'several tiers unlocked'],
    profile: asProfile(midCareerProfile),
  },
  {
    id: 'racing-era',
    file: 'racingEraProfile.json',
    provenance:
      'The mid-career save driven through the shipped chariot and racing transactions (buy + equip + unlock + select), then frozen — the exact bytes those handlers persist.',
    covers: ['chariot loadout owned and equipped', 'racing unlocked and selected', 'both later-added optional objects'],
    profile: asProfile(racingEraProfile),
  },
  {
    id: 'malformed-null-objects',
    file: 'nullObjectsProfile.json',
    provenance:
      'Hand-aged: `chariot` and `racing` present but null — a null where an object is expected.',
    covers: ['null in an optional object field', 'both lazy resolvers'],
    profile: asProfile(nullObjectsProfile),
  },
  {
    id: 'malformed-partial-racing',
    file: 'partialRacingProfile.json',
    provenance:
      'Hand-aged: a partial `racing` record — `unlocked` lists Quadra without Triga while `selected` names the locked Triga, the documented hand-edited state.',
    covers: ['partial racing record', 'orphan Quadra dropped', 'a selection that is not unlocked'],
    profile: asProfile(partialRacingProfile),
  },
  {
    id: 'malformed-partial-chariot',
    file: 'partialChariotProfile.json',
    provenance:
      'Hand-aged: a partial `chariot` record with no `equipped` block and an id the catalogue no longer knows.',
    covers: ['partial chariot record', 'unknown id dropped', 'equipped falls back to the stock parts'],
    profile: asProfile(partialChariotProfile),
  },
  {
    id: 'malformed-unknown-fields',
    file: 'unknownFieldsProfile.json',
    provenance:
      'Hand-aged: a fresh save plus three fields no build in this tree writes (a schema counter, a nested unknown object and an unknown string).',
    covers: ['forward compatibility', 'unknown fields ignored by every resolver', 'unknown fields survive a load and save round trip'],
    profile: asProfile(unknownFieldsProfile),
  },
  {
    id: 'story-road-era',
    file: 'storyRoadEraProfile.json',
    provenance:
      'The racing-era save hand-aged through every field added after it: tempered gear on three owned items, campaign flags, the road record with a chosen device, the coach-mark log and a mid-cycle clock.',
    covers: [
      'all five post-GC20 optional fields populated',
      'temper levels on owned items (1 to 3)',
      'road milestones and a chosen banner device',
      'a mid-cycle clock (day 4, dusk)',
    ],
    profile: asProfile(storyRoadEraProfile),
  },
  {
    id: 'partial-story-fields',
    file: 'partialStoryProfile.json',
    provenance:
      'Hand-aged: a played second-level save carrying a sparse story record, a single temper entry and a clock, with road and seen absent entirely.',
    covers: ['sparse story record', 'a single temper entry', 'road and seen absent'],
    profile: asProfile(partialStoryProfile),
  },
  {
    id: 'malformed-empty-fields',
    file: 'emptyFieldsProfile.json',
    provenance:
      'Hand-aged: every post-GC20 optional field present but empty-shaped — empty records and a zero clock, what a writer that created a field before filling it leaves.',
    covers: ['empty-shaped optional records', 'a zero clock (day 1, dawn)', 'nothing seen, no milestones'],
    profile: asProfile(emptyFieldsProfile),
  },
];

/** Look a fixture up by its id. */
export function getSaveFixture(id: string): SaveFixture | undefined {
  return SAVE_FIXTURES.find((fixture) => fixture.id === id);
}
