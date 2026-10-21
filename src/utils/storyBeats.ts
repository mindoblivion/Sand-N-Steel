/**
 * STORY-2 — "Arrival, Oath, First Sand": the chapter-one beats as data and rules.
 *
 * Three seams, one pure module (it imports no storage and no React, so the hub,
 * the result modal and the tests all read the same words):
 *
 *   • BEAT 1 — the novice bout. `opp_marcus` is the shipped Tier 1 Fight 1
 *     opponent and stays exactly as shipped. What this module adds is the beat's
 *     FRAMING, and only for a FRESH profile: one whose record has not yet won a
 *     duel and has not yet put Marcus down. A profile that has done either has
 *     already lived the arrival, so it is never shown the framing again (the
 *     grandfather rule). The lines are narration — Niger names the bout, Marcus
 *     answers — and never intel: no stat, tier or technique is printed.
 *
 *   • BEAT 2 — the Doctore's Test. Two restricted rules, each printed with the
 *     reason it is set (the Clarity law), and the player chooses one before the
 *     duel: win having reached a combo of 3 or more, or win with stamina never
 *     dropping below half. The verdict is read off the duel's own tracked
 *     statistics — `maxCombo` and the `lowestStaminaFraction` low-water mark —
 *     never from a new combat formula.
 *
 *   • The RESULT LINES both beats print. `App` computes them at the result write
 *     (the same write that records the duel) and hands them to the result modal,
 *     so the screen and the save can never disagree about what happened.
 */

import type { DuelStatistics, OpponentConfig, PlayerProfile } from '../types/game';

/** The shipped novice bout: Tier 1, Fight 1. */
export const NOVICE_BOUT_OPPONENT_ID = 'opp_marcus';

/** The Doctore's yard champion's id, restated from the roster (`data/opponents.ts`). */
export const DOCTORE_TEST_OPPONENT_ID = 'opp_doctore_sextus';

/** The combo a "win by combo" attempt has to reach. */
export const DOCTORE_TEST_COMBO_TARGET = 3;

/** The stamina floor of a "win fresh" attempt, as a fraction of the maximum. */
export const DOCTORE_TEST_STAMINA_FLOOR = 0.5;

/** The two rules the Doctore sets, by id. */
export type DoctoreTestRestriction = 'combo' | 'fresh';

export interface DoctoreTestRestrictionSpec {
  id: DoctoreTestRestriction;
  /** The rule's short name, as the entry card and the briefing print it. */
  name: string;
  /** The restriction itself, in words — always printed. */
  rule: string;
  /** Why the Doctore sets it — always printed (the Clarity law). */
  reason: string;
}

/** Both restrictions, in the order the entry card offers them. */
export const DOCTORE_TEST_RESTRICTIONS: readonly DoctoreTestRestrictionSpec[] = [
  {
    id: 'combo',
    name: 'Win by Combo',
    rule: 'Win the duel having reached a combo of 3 or more.',
    reason:
      'A yard measure is not beaten by one lucky thrust. String three blows together and he will believe you.',
  },
  {
    id: 'fresh',
    name: 'Win Fresh',
    rule: 'Win the duel with your stamina never dropping below half of its maximum.',
    reason: 'The measure of a fighter is what he has left when the other man is spent.',
  },
];

/** The spec for a restriction id, or `null` for anything this build does not know. */
export function doctoreRestrictionSpec(value: unknown): DoctoreTestRestrictionSpec | null {
  if (typeof value !== 'string') return null;
  return DOCTORE_TEST_RESTRICTIONS.find((spec) => spec.id === value) ?? null;
}

/** The opponent the Test is fought against — never a name comparison. */
export function isDoctoreTestOpponent(opponent: OpponentConfig | null | undefined): boolean {
  return opponent?.id === DOCTORE_TEST_OPPONENT_ID;
}

/** True for the shipped novice bout (`opp_marcus`). */
export function isNoviceBoutOpponent(opponent: OpponentConfig | null | undefined): boolean {
  return opponent?.id === NOVICE_BOUT_OPPONENT_ID;
}

/**
 * Is this profile still living the arrival? True while it has won no duel AND has
 * not put Marcus down. Both halves matter: a profile that lost to him still has
 * no win, and a profile that has won any duel has left the arrival behind —
 * including a legacy save that never saw this beat at all.
 */
export function isNoviceBoutDue(profile: PlayerProfile | null | undefined): boolean {
  if (!profile) return false;
  const wins = profile.fightsWon;
  if (typeof wins === 'number' && Number.isFinite(wins) && wins > 0) return false;
  const defeated = profile.defeatedOpponentIds;
  const ids = Array.isArray(defeated) ? defeated : [];
  return !ids.includes(NOVICE_BOUT_OPPONENT_ID);
}

/** One line of the pre-fight narration, with the voice that says it. */
export interface BeatLine {
  speaker: string;
  line: string;
}

/**
 * BEAT 1's pre-fight framing on Marcus's card: Niger names the bout, Marcus
 * answers. Narration only — the free card's intel is still names alone.
 */
export const NOVICE_BOUT_BRIEFING: readonly BeatLine[] = [
  {
    speaker: 'Niger',
    line: 'This is the novice bout, and it is yours. Marcus has three weeks in the yard and has not yet bled a man — today you are his first sand and he is yours. Put on a show the crowd can read.',
  },
  {
    speaker: 'Marcus',
    line: 'I have watched every bout from that gate. I know how you carry your sword. I am not afraid of you.',
  },
];

/** The Doctore reading the player's FIRST attempt at the novice bout. */
export function doctoreAttemptLine(didWin: boolean): string {
  return didWin
    ? 'Doctore: first sand, and you finished him clean. The yard will talk of it by noon — now the Test, where the rules are mine.'
    : 'Doctore: you lost, and it cost you nothing but a bruise and a lesson. The sand is still here and so are you. Go again.';
}

/**
 * Did a duel's own tracked statistics satisfy the chosen restriction?
 *
 * `combo` reads `maxCombo` (the duel's high-water mark, tracked exactly as the
 * shipped counter already did); `fresh` reads `lowestStaminaFraction` (the
 * stamina low-water mark, tracked the same `Math.min` way). Nothing here touches
 * a combat formula — it only reads numbers the fight already produced.
 */
export function meetsDoctoreRestriction(
  restriction: DoctoreTestRestriction | null | undefined,
  stats: DuelStatistics | null | undefined
): boolean {
  if (!stats) return false;
  if (restriction === 'combo') return stats.maxCombo >= DOCTORE_TEST_COMBO_TARGET;
  if (restriction === 'fresh') return stats.lowestStaminaFraction >= DOCTORE_TEST_STAMINA_FLOOR;
  return false;
}

/**
 * The line the result prints for a Doctore's Test bout the player WON. A win that
 * missed the chosen rule says so plainly (the Test stays unpassed); a win under
 * it says the Test is passed.
 */
export function doctoreTestResultLine(
  restriction: DoctoreTestRestriction,
  stats: DuelStatistics
): string {
  const spec = doctoreRestrictionSpec(restriction);
  const rule = spec ? spec.rule : 'the Doctore’s rule';
  if (meetsDoctoreRestriction(restriction, stats)) {
    return `The Doctore’s Test is PASSED. You won inside his rule — ${rule}`;
  }
  const detail =
    restriction === 'combo'
      ? `Your best combination was ${stats.maxCombo}, short of ${DOCTORE_TEST_COMBO_TARGET}.`
      : `Your stamina fell to ${Math.round(stats.lowestStaminaFraction * 100)}% of its maximum.`;
  return `The Doctore’s Test is NOT passed: you won the bout, but not inside his rule. ${detail} The entry stays open — take it again.`;
}

/**
 * Has this profile already passed the Test? Reads the gate's own two pieces of
 * evidence (the test opponent's id in the record, and the pass flag the victory
 * write set) — the same pair `resolveStoryState`'s gate reads, so the entry card
 * and the campaign can never disagree.
 */
export function isDoctoreTestPassed(profile: PlayerProfile | null | undefined): boolean {
  if (!profile) return false;
  const defeated = Array.isArray(profile.defeatedOpponentIds)
    ? profile.defeatedOpponentIds
    : [];
  const flag = profile.story?.doctoreTestPassed === true;
  return flag && defeated.includes(DOCTORE_TEST_OPPONENT_ID);
}
