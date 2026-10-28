/**
 * LUDI PHASE A — THE ACTA: the city's daily gazette, posted each morning.
 *
 * Rome ran on festivals, and the Acta is how a player learns what kind of day the city woke
 * into. Two surfaces print it, and both print the SAME three deeds:
 *
 *   • `ActaCard` — the CITY's dismissible morning card, raised once on entry (and again on a
 *     new day) and remembered for the rest of the page session through the module-local
 *     fact below. Nothing about the dismissal is saved and nothing is read from a save.
 *   • `ActaDeeds` — the list alone, which the Bounty Hall's board re-uses under Felix's own
 *     plate (`BountyBoardPanel`), so the hall and the street cannot print different deeds.
 *
 * The copy is the day's own: its name from `LUDI_ROTATION`, one line of character, and the
 * three deeds with their done/todo state. The card also states how many training sessions
 * the new day handed back — read from `ludiSessionsRefreshed`, the same number the rollover
 * applied. There is NO modifier line (Phase A ships no gameplay modifier).
 *
 * FIRST SIXTY SECONDS (§5, retention build-order step 4) adds ONE line to this card and
 * changes nothing else about it: the `unfinished` prop, filled by
 * `utils/firstSixtySeconds.ts`'s `unfinishedBusinessLine` with a live open loop — a waiting
 * grudge, else an unviewed triumph — or `null`. First Sixty Seconds — Director ruling
 * R-UNFINISHED: an uncompleted Acta is still owed NOTHING (the deeds print no line of their
 * own), and a profile with no open loop prints no line at all. The show rule, the draw and
 * the dismissal below are Phase A's, untouched.
 *
 * READ ONLY: it takes the profile, resolves the Acta once and renders. It writes nothing.
 */
import React from 'react';
import type { PlayerProfile } from '../../types/game';
import {
  ludiSessionsRefreshed,
  resolveLudiState,
  type ResolvedLudiDeed,
  type ResolvedLudiState,
} from '../../utils/ludiCalendar';

/**
 * SESSION SCOPE — the one fact this module remembers: the day whose Acta the player has
 * already dismissed in this page session. It is module memory, never storage: a reload, or
 * a new day, brings the card back. Keyed by the exertion day so dismissing today's Acta can
 * never silence tomorrow's.
 */
let dismissedActaDay: number | null = null;

/** Has the Acta for this exertion day already been dismissed this session? */
export function actaDismissedThisSession(day: number): boolean {
  return dismissedActaDay === day;
}

/** Remember that this day's Acta has been read. Nothing is persisted. */
export function dismissActaThisSession(day: number): void {
  dismissedActaDay = day;
}

/** Drop the session memory — the suite's own reset, never called by the game. */
export function resetActaSession(): void {
  dismissedActaDay = null;
}

/** One deed row: what it asks, and whether the day has paid it. */
export const ActaDeedRow: React.FC<{ entry: ResolvedLudiDeed }> = ({ entry }) => (
  <li
    data-acta-deed={entry.deed.id}
    data-acta-deed-done={entry.done ? 'true' : 'false'}
    className="flex items-start gap-2"
  >
    <span
      aria-hidden="true"
      className={`mt-[2px] font-mono text-[11px] ${entry.done ? 'text-emerald-400' : 'text-amber-500/70'}`}
    >
      {entry.done ? '✔' : '•'}
    </span>
    <span
      className={`text-[11px] sm:text-xs font-serif leading-snug ${
        entry.done ? 'text-emerald-200/90 line-through decoration-emerald-400/50' : 'text-neutral-300'
      }`}
    >
      {entry.deed.label}
    </span>
    <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
      {entry.done ? 'done' : 'todo'}
    </span>
  </li>
);

/**
 * THE DEEDS ALONE — the three rows plus the day's one summary line. Shared by the city card
 * and the Bounty Hall's board section, so both read from one resolved Acta.
 */
export const ActaDeeds: React.FC<{ state: ResolvedLudiState; className?: string }> = ({
  state,
  className,
}) => (
  <div data-acta-deeds data-acta-day={state.day} className={className}>
    <p data-acta-character className="text-[11px] sm:text-xs font-serif italic text-amber-200/90 leading-snug">
      {state.characterLine}
    </p>
    <ul className="mt-2 flex flex-col gap-1.5 list-none">
      {state.deeds.map((entry) => (
        <ActaDeedRow key={entry.deed.id} entry={entry} />
      ))}
    </ul>
    <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
      {state.remaining === 0 ? 'The day is done' : `${state.remaining} still posted`} · Favour{' '}
      {state.favour} · Laudes {state.laudes}
    </p>
  </div>
);

interface ActaCardProps {
  profile: PlayerProfile;
  /**
   * FIRST SIXTY SECONDS — §5's ONE unfinished-business line, resolved from LIVE state by
   * `utils/firstSixtySeconds.ts` (`unfinishedBusinessLine`): 'A grudge waits: <rival>',
   * else 'A triumph waits unviewed', else `null`. `null`/absent prints nothing at all —
   * the card never invents an open loop. Director ruling R-UNFINISHED.
   */
  unfinished?: string | null;
  /** Dismiss this morning's Acta. The card owns no write of any kind. */
  onDismiss: () => void;
}

/**
 * THE CITY'S MORNING CARD — dismissible, session-scoped, and never a gate: it covers no
 * control the player needs and closes with its own button (or the day's own dismissal is
 * remembered for the session).
 */
export const ActaCard: React.FC<ActaCardProps> = ({ profile, unfinished, onDismiss }) => {
  const state = resolveLudiState(profile);
  const sessions = ludiSessionsRefreshed(state.day);

  return (
    <div
      data-acta-card
      role="dialog"
      aria-label={`The Acta — ${state.dayName}`}
      className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-[92%] max-w-md bg-neutral-950/95 border-2 border-amber-600/80 p-4 rounded-2xl backdrop-blur-md shadow-[0_0_30px_rgba(217,119,6,0.35)] animate-fadeIn"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-500/80">
            The Acta · posted at dawn
          </p>
          <h4
            data-acta-day-name
            className="font-serif font-black text-base sm:text-lg text-amber-100 uppercase tracking-wider leading-tight"
          >
            {state.dayName}
          </h4>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss the Acta"
          className="w-12 h-12 min-h-[48px] min-w-[48px] shrink-0 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 transition-colors cursor-pointer flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      <ActaDeeds state={state} className="mt-2" />

      {/* FIRST SIXTY SECONDS — the ONE unfinished-business line (R-UNFINISHED). It is
          resolved from live state and printed only when there is an open loop, so a card
          with nothing waiting is exactly Phase A's card. */}
      {unfinished ? (
        <p
          data-acta-unfinished
          className="mt-3 font-serif text-[11px] sm:text-xs leading-snug text-amber-200"
        >
          {unfinished}
        </p>
      ) : null}

      <p
        data-acta-sessions
        className="mt-3 text-[10px] sm:text-[11px] font-mono text-amber-200/80 leading-relaxed"
      >
        Training sessions refreshed: {sessions}
        {sessions > 2 ? ' — Dies Quietus grants one more.' : '.'}
      </p>
    </div>
  );
};
