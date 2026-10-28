/**
 * ===========================================================================
 * PITCH A6 — THE VICTORY CARD (duel card only)
 * ===========================================================================
 * Every duel ends in a Roman-poster result card: the player's name, the class
 * he fights as, the result, the crowd's peak and the winning margin.  This
 * module is the PURE half of the slice — the poster's content and its frame:
 *
 *   composeVictoryCard(profile, opponent, stats, didWin)
 *
 * It never touches the DOM, never reads storage, never writes a profile and
 * never throws.  The canvas painter (`victoryCardPainter.ts`) draws whatever
 * this returns; the poster section (`VictoryPoster`) displays it and offers the
 * OS share sheet.  Nothing leaves the device except the image the player
 * chooses to share — there is no backend, no upload and no text entry anywhere
 * in this slice.
 *
 * ── THE ONE CONTENT GAP THIS SLICE CLOSES ────────────────────────────────
 * `DuelStatistics` had no winner-remaining-HP field, so the margin had no
 * source.  `winnerHealthFraction` (an OPTIONAL, IN-MEMORY-ONLY reading set by
 * `DuelScene` at result time) is that source.  Nothing saves `DuelStatistics`,
 * so no save format and no profile field changes: the save corpus stays at 23
 * optional fields.
 *
 * ── THE RACE CARD IS OUT OF THIS SLICE ───────────────────────────────────
 * Only the duel card is built here.  The RACE card unlocks later, once Stage 1
 * Slice 4 lands a race results screen, by feeding race results into this same
 * composer.
 */

import type { ArmaturaId, DuelStatistics, OpponentConfig, PlayerProfile } from '../types/game';
import { getArmatura } from '../data/armaturae';
import { resolveArmatura } from './traitModifiers';

/** The three card frames.  Selected by `victoryCardFrame` — never by the view. */
export type VictoryCardFrame = 'victory' | 'defeat' | 'champion';

/** The frame's own word on the poster (the result line is printed separately). */
export const VICTORY_CARD_FRAME_LABEL: Record<VictoryCardFrame, string> = {
  victory: 'VICTORY',
  defeat: 'DEFEAT',
  champion: 'CHAMPION',
};

/** The result as the card prints it. */
export type VictoryCardResult = 'Victory' | 'Defeat';

/**
 * The player fields the card reads.  A `PlayerProfile` satisfies this shape;
 * naming only what is read keeps the composer honest about its inputs (and
 * makes it callable from a test with two fields).
 */
export interface VictoryCardPlayer {
  name?: string;
  armatura?: ArmaturaId;
  /** Read by the one armatura resolver, so a legacy save still infers its class. */
  appearance?: { characterModel?: string };
}

/** Everything the fixed canvas template prints, already composed. */
export interface VictoryCardData {
  playerName: string;
  /** The player's armatura name — the class he fights as. */
  className: string;
  opponentName: string;
  result: VictoryCardResult;
  /** The crowd's peak hype, whole percent (0–100). */
  peakHype: number;
  /**
   * The winner's remaining health as a whole percent (`'64%'`), or absent when
   * the transient reading is absent — see Director ruling R-MARGIN.
   */
  margin?: string;
  frame: VictoryCardFrame;
}

/**
 * Pitch A6 — Director ruling R-MARGIN.
 *
 * The margin is the WINNER's remaining health as a fraction of the maximum they
 * entered the duel with: the player's own fraction on a player win, the
 * opponent's on a player defeat.  If the transient is absent (an old path that
 * never set it), the poster OMITS the margin line rather than inventing one.
 */
export function formatHealthMargin(fraction: number | null | undefined): string | undefined {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return undefined;
  const clamped = Math.max(0, Math.min(1, fraction));
  return `${Math.round(clamped * 100)}%`;
}

/**
 * Pitch A6 — Director ruling R-MARGIN, the reading itself.
 *
 * `DuelScene` calls this at result time for the WINNER of the bout, exactly the
 * way `lowestHealthFraction` is tracked: a reading of the fight, never consulted
 * by any combat formula.  An unusable maximum yields `undefined`, which the
 * poster prints as "no margin line" — never as a guessed 0% or 100%.
 */
export function winnerHealthFraction(health: number, healthMax: number): number | undefined {
  if (!Number.isFinite(health) || !Number.isFinite(healthMax) || healthMax <= 0) {
    return undefined;
  }
  return Math.max(0, Math.min(1, health / healthMax));
}

/**
 * Pitch A6 — Director ruling R-FRAME.
 *
 * Frame order is RESULT-FIRST:
 *   1. a player defeat is the Defeat frame, whatever the opponent is;
 *   2. else a win against any boss row (`isBoss === true`: ladder bosses,
 *      Feature Bouts, the bounty Deserter) is the Champion frame;
 *   3. else it is the Victory frame.
 *
 * The boss flag is the shipped `OpponentConfig.isBoss` — the same flag every
 * other boss fence in the game reads.  No faction system is invented here.
 */
export function victoryCardFrame(
  didWin: boolean,
  opponent: Pick<OpponentConfig, 'isBoss'> | null | undefined,
): VictoryCardFrame {
  if (!didWin) return 'defeat';
  return opponent?.isBoss === true ? 'champion' : 'victory';
}

/** The crowd's peak as the card prints it: a whole percent, clamped to 0–100. */
function peakHypePercent(crowdHypePeak: number | undefined): number {
  if (typeof crowdHypePeak !== 'number' || !Number.isFinite(crowdHypePeak)) return 0;
  return Math.round(Math.max(0, Math.min(100, crowdHypePeak)));
}

/**
 * Compose the card's content.  Pure: same inputs, same card; nothing is read
 * from the DOM, storage or the save.  `stats` is the duel's own in-memory
 * `DuelStatistics`, so the peak and the transient winner reading are this
 * bout's, not the profile's.
 */
export function composeVictoryCard(
  profile: VictoryCardPlayer | null | undefined,
  opponent: Pick<OpponentConfig, 'name' | 'isBoss'> | null | undefined,
  stats: Pick<DuelStatistics, 'crowdHypePeak' | 'winnerHealthFraction'> | null | undefined,
  didWin: boolean,
): VictoryCardData {
  // `resolveArmatura` is the ONE class resolver: an explicit class wins, and a
  // legacy save's look infers it. The card reads the profile and never writes it.
  const armatura = getArmatura(resolveArmatura(profile as PlayerProfile | null | undefined));
  const card: VictoryCardData = {
    // Defensive labels only: a duel is always fought by a named, classed
    // profile, so these never print in play.
    playerName: profile?.name?.trim() || 'Gladiator',
    className: armatura?.name || 'Gladiator',
    opponentName: opponent?.name ?? 'Unknown rival',
    result: didWin ? 'Victory' : 'Defeat',
    peakHype: peakHypePercent(stats?.crowdHypePeak),
    frame: victoryCardFrame(didWin, opponent),
  };
  // R-MARGIN: an absent reading omits the line — it is never invented.
  const margin = formatHealthMargin(stats?.winnerHealthFraction);
  if (margin !== undefined) card.margin = margin;
  return card;
}

/** The file the share sheet is handed: one PNG, named for its frame. */
export function victoryCardFileName(frame: VictoryCardFrame): string {
  return `sand-and-steel-${frame}-card.png`;
}

/** The slice of `navigator` the share rule reads.  Injectable for tests. */
export interface ShareCapableNavigator {
  canShare?: (data?: ShareData) => boolean;
}

/**
 * The share rule, and the ONLY thing that decides whether a Share button is
 * drawn: the OS share sheet must be available for FILES, i.e.
 * `navigator.canShare({ files })` must answer exactly `true`.
 *
 * A navigator with no `canShare`, one that throws, one that answers false — and
 * the server, where there is no navigator at all — all mean "no button".  The
 * poster still displays; a dead button never appears.
 */
export function canShareVictoryCard(
  files: File[],
  nav: ShareCapableNavigator | null | undefined = typeof navigator === 'undefined'
    ? null
    : navigator,
): boolean {
  if (!nav || typeof nav.canShare !== 'function') return false;
  if (!Array.isArray(files) || files.length === 0) return false;
  try {
    return nav.canShare({ files }) === true;
  } catch {
    return false;
  }
}
