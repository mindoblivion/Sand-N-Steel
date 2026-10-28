/**
 * STORY-3 — CHAPTER TWO, "Fortuna's Coin, the Second Sand": Beat 3's words.
 *
 * One pure module for the two things Chapter 2 says out loud, so no component
 * holds a copy of them and the suites can read the same strings the player does:
 *
 *   • BEAT 3's BRIEFING on the pre-fight card of the chapter's tournament final
 *     (Tier 1's boss).  It rides the EXISTING story-briefing surface STORY-2
 *     built — `PreFightModal`'s `narration` prop, a voices-only block above the
 *     shipped intel rows, fed from the hub — so nothing new is mounted and the
 *     card's numbers are untouched.  Postumia speaks: the shrine is where the
 *     omen is taken or declined, and the card's job is to send the player there
 *     before the bout.
 *
 *   • THE CROSS-GATE POINTER's words (Director ruling 3).  While Chapter 2 is
 *     open and its District race gate is unmet, opening the tournament tab has
 *     the herald mention the Circus through `HeraldToast` — the herald's one
 *     surface.  TEXT ONLY: `circusPointerDue` decides, nothing here changes a
 *     gate, a price or a reward.
 *
 * Neither export writes a profile, reads storage or invents evidence: `story
 * state` is resolved by `resolveStoryState` and the omen's own fields by
 * `utils/omens`.  The two deferrals Chapter 2 carries are recorded on the
 * chapter's gate table in `utils/storyState.ts`.
 */

import { ALL_OPPONENTS } from '../data/opponents';
import type { OpponentConfig, PlayerProfile } from '../types/game';
import type { BeatLine } from './storyBeats';
import {
  STORY_CHAPTER_FORTUNA,
  circusPointerDue,
  isFortunaOmenTaken,
  resolveStoryState,
} from './storyState';

/**
 * The chapter's tournament final is Tier 1's boss, found in the shipped roster —
 * never a literal id, so the card follows the roster if the champion changes.
 */
const TOURNAMENT_FINAL = ALL_OPPONENTS.find(
  (opponent) => opponent.tier === 1 && opponent.isBoss === true
);

/** Is this bout the chapter's final (the Tier-1 boss)? */
export function isTournamentFinalBout(
  opponent: OpponentConfig | null | undefined
): boolean {
  return !!opponent && !!TOURNAMENT_FINAL && opponent.id === TOURNAMENT_FINAL.id;
}

/**
 * BEAT 3's briefing, spoken by the shrine's priestess.  Narration, not intel: it
 * names no figure on the card and prints no stat — it points at the shrine and
 * says what Fortuna's word is worth, kind or ill.
 */
export const FORTUNA_SHRINE_BRIEFING: readonly BeatLine[] = [
  {
    speaker: 'Postumia',
    line: 'Before you take the sand in a tournament final, come to the shrine and let Fortuna read the bout. Take her word, or refuse it once — either way she will know your name. A man who knows his luck fights better than one who only hopes.',
  },
];

/**
 * Is the shrine briefing due on this card? Only on the chapter's final, only
 * while Chapter 2 is open, and only until the beat is settled — once the omen is
 * taken (or the one decline is spent) the card stops pointing at the shrine and
 * the player is left with the bout in front of them.
 */
export function isFortunaBriefingDue(
  profile: PlayerProfile | null | undefined,
  opponent: OpponentConfig | null | undefined
): boolean {
  if (!isTournamentFinalBout(opponent)) return false;
  if (resolveStoryState(profile).chapter !== STORY_CHAPTER_FORTUNA) return false;
  return !isFortunaOmenTaken(profile);
}

/**
 * The herald's circus pointer, in the city's own voice.  Read only while
 * `circusPointerDue` holds; `null` means the herald says nothing.
 */
export const CIRCUS_POINTER_CRY =
  'The Circus is running, gladiator — finish one District race, any placing, and this chapter turns.';

/** The cry to raise on the tournament tab, or `null` when the pointer is not due. */
export function circusPointerCry(profile: PlayerProfile | null | undefined): string | null {
  if (!profile) return null;
  return circusPointerDue(resolveStoryState(profile)) ? CIRCUS_POINTER_CRY : null;
}
