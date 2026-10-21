import React from 'react';
import type { CoachCard as CoachCardEntry } from '../../utils/coachMarks';

/**
 * CL-1 — one coach-mark card, presented.
 *
 * This component is presentational only: it renders one entry of the
 * `COACH_CARDS` registry and reports a dismissal.  It decides nothing about
 * whether it should be on screen and it writes nothing — `resolveSeenState` /
 * `markSeen` and the trigger belong to the caller (the hub's first-open card).
 *
 * It is deliberately NOT a modal, unlike `HelpModal`: the wrapper is
 * pointer-transparent and only the card itself is interactive, so the surface
 * underneath — the whole camp — stays usable while the card is up.  It sits at a
 * screen edge, chosen by `placement`, and its ✕ is a 44px touch target, at least
 * the size of the hub's own header controls.
 */

export type CoachCardPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface CoachCardProps {
  /** The registry id this card was drawn from — stamped on the DOM for the caller's tests. */
  id: string;
  card: CoachCardEntry;
  /** Which screen edge to sit on.  Defaults to the bottom edge. */
  placement?: CoachCardPlacement;
  onDismiss: () => void;
}

/**
 * Where each edge puts the card.  The bottom edge lifts by 8rem on narrow screens
 * only: the post-Oath nudge (`PostOathNudge`) occupies the bottom band on a phone
 * for the session's first camp open — the very moment this card first appears — so
 * the card would otherwise be hidden behind it.  Above 640px the nudge sits at the
 * bottom-right corner and the full-width edge is free again.
 */
const PLACEMENT_CLASS: Record<CoachCardPlacement, string> = {
  top: 'top-0 left-1/2 -translate-x-1/2 items-start',
  bottom: 'bottom-0 left-1/2 -translate-x-1/2 items-end max-sm:bottom-32',
  left: 'left-0 top-1/2 -translate-y-1/2',
  right: 'right-0 top-1/2 -translate-y-1/2',
};

/**
 * UI-1 (S-1) — the device's own insets, on the edge each placement anchors to, with
 * the card's existing 12px spacing as the floor (the `PostOathNudge` pattern): the
 * notch or status bar can never sit over the card, and a device without insets is
 * pixel-identical to the `m-3` it replaces, since `env()` resolves to 0 there.
 */
const EDGE_INSET_CLASS: Record<CoachCardPlacement, string> = {
  top: 'mt-[max(0.75rem,env(safe-area-inset-top))] mr-3 mb-3 ml-3',
  bottom: 'mt-3 mr-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] ml-3',
  left: 'mt-3 mr-3 mb-3 ml-[max(0.75rem,env(safe-area-inset-left))]',
  right: 'mt-3 mr-[max(0.75rem,env(safe-area-inset-right))] mb-3 ml-3',
};

export const CoachCard: React.FC<CoachCardProps> = ({
  id,
  card,
  placement = 'bottom',
  onDismiss,
}) => {
  return (
    <div
      data-coach-card={id}
      role="status"
      className={`fixed z-[60] w-[min(92vw,22rem)] pointer-events-none flex flex-col ${PLACEMENT_CLASS[placement]} ${EDGE_INSET_CLASS[placement]}`}
    >
      <div className="pointer-events-auto rounded-2xl border border-amber-800/60 bg-neutral-950/95 backdrop-blur-sm px-4 py-3 shadow-2xl text-amber-100">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            {card.speaker && (
              <p className="font-serif text-sm text-amber-200">{card.speaker}</p>
            )}
            <p
              className={`text-[11px] text-neutral-200 leading-relaxed${
                card.speaker ? ' mt-1' : ''
              }`}
            >
              {card.text}
            </p>
          </div>
          <button
            type="button"
            data-coach-card-dismiss={id}
            aria-label="Dismiss"
            onClick={onDismiss}
            className="shrink-0 -mt-1 -mr-1 w-11 h-11 rounded-xl border border-neutral-700 text-neutral-300 hover:text-amber-200 hover:border-amber-700/60 cursor-pointer active:scale-95 transition-all flex items-center justify-center text-sm leading-none"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};
