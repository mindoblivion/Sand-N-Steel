/**
 * The city's herald, on the surface — the one place a milestone cry is read.
 *
 * `src/utils/roadMilestones.ts` decides what is said and when; this component only
 * shows it, above whatever screen the player is on (the duel ends into the city, so the
 * cry has to be able to outlive the screen it was raised from).  It owns no state and
 * writes nothing: the caller hands it the cries, and removes exactly the ones it showed.
 *
 * Touch and narrow screens: the stack sits above the bottom controls, one cry per line,
 * and the whole toast can be dismissed by tapping it.
 */
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface HeraldToastProps {
  cries: string[];
  /**
   * L21D — called with EXACTLY the cries this render displayed, so the caller can
   * remove those and leave anything raised since the stack was drawn. A toast can
   * never dismiss a cry it never showed.
   */
  onDismiss: (displayed: readonly string[]) => void;
  /** How long the stack stays up, in ms. Long enough to read two lines on a phone. */
  durationMs?: number;
}

export const HeraldToast: React.FC<HeraldToastProps> = ({
  cries,
  onDismiss,
  durationMs = 7000,
}) => {
  useEffect(() => {
    if (cries.length === 0) return;
    // L21D — the snapshot, not a bare call: a cry appended after this render keeps
    // its place when this timer fires.
    const timer = window.setTimeout(() => onDismiss(cries), durationMs);
    return () => window.clearTimeout(timer);
  }, [cries, durationMs, onDismiss]);

  if (cries.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-3 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {cries.map((cry, index) => (
        <div
          key={`${index}-${cry}`}
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md border border-amber-500/60 bg-neutral-950/95 px-3 py-2 shadow-2xl"
        >
          <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-amber-500/80">
            Herald
          </span>
          <p className="flex-1 text-sm leading-snug text-amber-100">{cry}</p>
          <button
            type="button"
            onClick={() => onDismiss(cries)}
            aria-label="Dismiss the herald"
            className="shrink-0 p-1 text-amber-600/70 hover:text-amber-300"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
