import React from 'react';
import type { OpponentConfig, PlayerProfile } from '../../types/game';
import {
  getKeeper,
  nightClerkLine,
  resolveSeenKeepers,
  selectOrigoLine,
  selectRepeatLine,
  type Keeper,
} from '../../data/keepers';
import { keeperStateLineFor } from '../../utils/keeperStateLines';
import { resolveLudiState } from '../../utils/ludiCalendar';
import { ActaDeeds } from './ActaCard';
import {
  bountyBoardState,
  DESERTER_CHOICE_LINES,
  type BountyRungState,
} from '../../utils/bountyLadder';
import { KeeperPlate } from './KeeperPlate';

interface BountyBoardPanelProps {
  profile: PlayerProfile;
  /** Night only changes the plate's line, exactly as every other counter does. */
  night: boolean;
  /** Enter a contract bout. The panel owns no transaction and writes nothing. */
  onEnterBout: (opponent: OpponentConfig) => void;
  /**
   * K3-BOARDS — the keeper's first visit is recorded through App's ONE write path
   * (`handleRecordKeeperVisit` → `recordKeeperVisit`), the same relay the four
   * plated counters use. It is called once per open, on mount.
   */
  onRecordKeeperVisit?: (keeperId: string) => void;
  onClose: () => void;
  /**
   * The dormant ladder's seam, exactly as `bountyLadder.bountyBoardState` and
   * STORY-4a's `mercyOfferFor` carry one: `resolveStoryState` cannot reach Chapter 3
   * until Stage 2 lands its race-results write, so a suite drives the OPEN board
   * through this argument. The city passes nothing, so the shipped reading is what
   * a player ever sees.
   */
  chapterOverride?: number;
}

/**
 * K3-BOARDS — the Bounty Hall's clerk, read from the registry by id.
 *
 * `getKeeperForBuilding('bounty_hall')` is deliberately still `undefined`: the hall
 * hosts TWO boards (Scribonia's bounty board and Cornelius Felix's mercenary
 * board, which this slice does not build), so a building→keeper map entry would
 * have to name one of them and would answer the wrong plate on the other. The
 * registry row itself is untouched — this reads it.
 */
const BOARD_KEEPER: Keeper | undefined = getKeeper('scribonia');

/**
 * LUDI PHASE A — THE HALL'S SECOND COUNTER: Cornelius Felix, called "the agent", whose own
 * notice board posts the city's daily three deeds (his first-visit line is the Acta's own
 * promise: "three fresh deeds on my board every morning"). Read from the registry BY ID for
 * exactly the reason above — the hall hosts two boards, so `getKeeperForBuilding` still
 * answers nothing for it and neither plate is reached through a building map.
 *
 * This is the K2 freeze pattern: who is at the counter and whether this gladiator had already
 * met him when the panel opened, frozen at open so the first-visit save landing a frame later
 * cannot swap his greeting under the player's eyes.
 */
const ACTA_KEEPER: Keeper | undefined = getKeeper('cornelius_felix');

/**
 * STORY-4b — THE BOUNTY BOARD, the panel the Bounty Hall's door opens.
 *
 * The same surface as a treatment counter, the tavern's rumours and Fortuna's
 * shrine: a keeper's plate, then a list of controls, each at the 48px floor. It
 * lists the five rungs (name, posted price, printed twist, cleared/locked state)
 * and the Deserter's final entry, and it PRINTS its own rule — a victory that
 * misses the printed rule keeps the ordinary purse and leaves the posting up.
 *
 * It writes nothing: the bout is entered through `onEnterBout`, the clear and the
 * bounty land in `App`'s duel-result write, and the only thing this panel reports
 * is a keeper visit. Before Chapter 3 it still renders — the board is readable,
 * its prices are posted, and a line says why nothing can be entered yet (R6).
 */
export const BountyBoardPanel: React.FC<BountyBoardPanelProps> = ({
  profile,
  night,
  onEnterBout,
  onRecordKeeperVisit,
  onClose,
  chapterOverride,
}) => {
  const board = bountyBoardState(profile, chapterOverride);

  /**
   * K2's freeze: who is at this counter and whether the visit had happened when
   * it opened. The first-visit save lands a frame later and re-renders this
   * panel, so reading it live would swap the greeting for the repeat line under
   * the player's eyes.
   */
  const seenAtOpenRef = React.useRef<boolean>(
    BOARD_KEEPER ? resolveSeenKeepers(profile).includes(BOARD_KEEPER.id) : false
  );
  /** LUDI PHASE A — Felix's own greeting, frozen at open exactly like Scribonia's. */
  const felixSeenAtOpenRef = React.useRef<boolean>(
    ACTA_KEEPER ? resolveSeenKeepers(profile).includes(ACTA_KEEPER.id) : false
  );
  /** LUDI PHASE A — today's Acta, resolved once for the hall's own section. */
  const acta = resolveLudiState(profile);

  React.useEffect(() => {
    if (!BOARD_KEEPER) return;
    onRecordKeeperVisit?.(BOARD_KEEPER.id);
    // Exactly once per open: the panel remounts each time the board is raised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!ACTA_KEEPER) return;
    // The agate board's keeper is met the same way, once per open.
    onRecordKeeperVisit?.(ACTA_KEEPER.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keeperLine = (keeper: Keeper, seenAtOpen?: boolean): string => {
    const seen = seenAtOpen ?? seenAtOpenRef.current;
    const own = seen
      ? selectOrigoLine(keeper, profile) ?? selectRepeatLine(keeper, 2)
      : keeper.firstVisitLine;
    // K4 — STATE > NIGHT > own, the same order every plated counter uses.
    const stateLine = keeperStateLineFor(keeper, profile);
    if (stateLine) return stateLine;
    return night ? nightClerkLine(keeper) || own : own;
  };

  const rungState = (entry: BountyRungState): string =>
    entry.cleared ? 'cleared' : entry.open ? 'open' : 'locked';

  return (
    <div
      data-bounty-panel
      className="absolute top-36 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-md sm:max-w-lg w-[92%] bg-neutral-950/95 border-2 border-amber-500/80 p-4 rounded-2xl backdrop-blur-md shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-fadeIn"
    >
      {/* K3-BOARDS — Scribonia, called "the Ledger", heads her own board. A header
          only: no control is added, so the list below it is unchanged. */}
      {BOARD_KEEPER && (
        <div className="mb-3">
          <KeeperPlate keeper={BOARD_KEEPER} line={keeperLine(BOARD_KEEPER)} />
        </div>
      )}

      {/* LUDI PHASE A — FELIX'S ACTA, headed by his own plate. The hall's second board:
          the city's three deeds for the day, with what is paid and what is still owed. A
          SECTION, not a second panel — nothing here is enterable, so no control is added
          and the bounty rows below are untouched. */}
      {ACTA_KEEPER && (
        <div
          data-acta-section
          data-acta-section-day={acta.day}
          className="mb-3 rounded-2xl border border-amber-700/30 bg-neutral-900/40 p-3"
        >
          <KeeperPlate
            keeper={ACTA_KEEPER}
            line={keeperLine(ACTA_KEEPER, felixSeenAtOpenRef.current)}
          />
          <div className="mt-3">
            <h4 className="font-serif font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wider mb-1">
              The Acta — {acta.dayName}
            </h4>
            <ActaDeeds state={acta} />
          </div>
        </div>
      )}

      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <h4 className="font-serif font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wider mb-1">
            The Deserter&apos;s Price
          </h4>
          <p className="text-[11px] sm:text-xs text-neutral-300 font-sans leading-relaxed">
            Five postings, paid to the copper. Clear one and the next goes up; clear all five and the
            clerk unlocks the name under the board.
          </p>
          <p
            data-bounty-rules
            className="mt-2 text-[10px] sm:text-[11px] font-mono text-amber-300/90 leading-relaxed"
          >
            {board.rulesLine}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close bounty board"
          className="w-12 h-12 min-h-[48px] min-w-[48px] rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 transition-colors cursor-pointer flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      {!board.open && (
        <p
          data-bounty-locked-line
          className="mt-3 text-[11px] sm:text-xs font-serif text-amber-200/90 border-l border-amber-700/70 pl-3 leading-relaxed"
        >
          {board.lockedLine}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 max-h-[54vh] overflow-y-auto pr-1">
        {board.rungs.map((entry) => (
          <div
            key={entry.rung.opponentId}
            data-bounty-rung={entry.rung.rung}
            data-bounty-rung-state={rungState(entry)}
            className="rounded-xl border border-amber-700/40 bg-neutral-900/70 p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-serif font-bold text-[11px] sm:text-xs uppercase tracking-wider text-amber-100">
                {entry.rung.rung}. {entry.opponent.name}
              </span>
              <span className="font-mono text-[11px] text-amber-300 shrink-0">
                {entry.postedGold}g · {entry.postedFame}f
              </span>
            </div>
            <p className="mt-1 text-[10px] sm:text-[11px] font-serif text-neutral-300 leading-snug">
              {entry.twistText}
            </p>
            {entry.note && (
              <p
                data-bounty-note="left-handed"
                className="mt-1 text-[10px] font-mono text-amber-200/80"
              >
                {entry.opponent.name} {entry.note}.
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                {entry.cleared ? 'Cleared — pays in full again' : entry.open ? 'Posted' : 'Locked'}
              </span>
              <button
                type="button"
                data-bounty-enter={entry.rung.opponentId}
                onClick={() => onEnterBout(entry.opponent)}
                disabled={!entry.open}
                className="min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-[11px] uppercase tracking-wider border border-amber-200 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {entry.cleared ? 'Fight again' : 'Take the contract'}
              </button>
            </div>
          </div>
        ))}

        <div
          data-bounty-final
          data-bounty-final-state={board.final.open ? 'open' : 'locked'}
          className="rounded-xl border border-rose-700/60 bg-neutral-950/80 p-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif font-bold text-[11px] sm:text-xs uppercase tracking-wider text-rose-100">
              {board.final.opponent.name}
            </span>
            <span className="font-mono text-[11px] text-rose-200 shrink-0">
              {board.final.capturedGold}g / {board.final.capturedFame}f taken alive
            </span>
          </div>
          <p className="mt-1 text-[10px] sm:text-[11px] font-serif text-neutral-300 leading-snug">
            The name under the board: a brother of the ludus who broke the sacramentum and runs the
            northern road with deserters. Taken alive pays {board.final.capturedGold}g and{' '}
            {board.final.capturedFame}f; killed outright pays {board.final.takenGold}g and{' '}
            {board.final.takenFame}f.
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              {board.final.cleared
                ? `Answered — ${profile.story?.deserterChoice === 'spared' ? 'taken alive' : 'killed'}`
                : board.final.open
                ? 'Unlocked'
                : 'Locked'}
            </span>
            <button
              type="button"
              data-bounty-enter={board.final.opponent.id}
              onClick={() => onEnterBout(board.final.opponent)}
              disabled={!board.final.open || board.final.cleared}
              className="min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-rose-700 via-red-600 to-rose-600 hover:from-rose-600 hover:to-red-500 text-neutral-50 font-serif font-black text-[11px] uppercase tracking-wider border border-rose-300 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Go to the northern road
            </button>
          </div>
          {!board.final.open && (
            <p className="mt-2 text-[10px] font-mono text-neutral-400">
              {board.final.lockReason === 'ladder'
                ? board.lockedLine
                : 'Clear all five postings to unlock him.'}
            </p>
          )}
          {board.final.cleared && (
            <p
              data-bounty-final-answer={profile.story?.deserterChoice}
              className="mt-2 text-[10px] sm:text-[11px] font-serif text-amber-200/90 leading-snug"
            >
              {profile.story?.deserterChoice
                ? DESERTER_CHOICE_LINES[profile.story.deserterChoice]
                : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
