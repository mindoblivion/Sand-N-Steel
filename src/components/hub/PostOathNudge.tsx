import React, { useCallback, useEffect, useState } from 'react';
import {
  hasSeenPostOathNudge,
  markPostOathNudgeSeen,
  type SessionStore,
} from '../../utils/postOathNudge';

/**
 * START-1 — the post-Oath nudge.
 *
 * The moment a gladiator takes the Oath the sequence offers ONCE, in that session, to
 * put the new gladiator somewhere safer than this device. The design's terms, all four
 * visible in this file:
 *
 *  - it appears once (the session flag is written the moment it is shown, so a remount
 *    cannot bring it back);
 *  - it is dismissible, twice over (the button and the close control);
 *  - it is session-flagged, through `utils/postOathNudge` — the player's save is never
 *    read or written by any of this;
 *  - it NEVER blocks input to anything else: the wrapper is `pointer-events-none` and
 *    only the card itself is interactive, so the city hub underneath stays usable while
 *    the nudge is up.
 */

export interface PostOathNudgeView {
  visible: boolean;
  /** The Oath has just been taken — offer the nudge (subject to the session flag). */
  offer: () => void;
  /** Dismiss it: it will not come back this session. */
  dismiss: () => void;
}

/**
 * The nudge's session state. `store` is injectable for tests; the default is the real
 * session storage (see `utils/postOathNudge`).
 */
export function usePostOathNudge(store?: SessionStore | null): PostOathNudgeView {
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) return;
    setPending(false);
    if (hasSeenPostOathNudge(store)) return;
    // Flagged as shown, not as dismissed: "appears once" is the promise.
    markPostOathNudgeSeen(store);
    setVisible(true);
  }, [pending, store]);

  const offer = useCallback(() => setPending(true), []);
  const dismiss = useCallback(() => setVisible(false), []);

  return { visible, offer, dismiss };
}

export interface PostOathNudgeProps {
  /** The existing cloud-save entry point — the nudge reuses it rather than adding auth. */
  onSaveProgress: () => void;
  onDismiss: () => void;
}

export const PostOathNudge: React.FC<PostOathNudgeProps> = ({ onSaveProgress, onDismiss }) => (
  <div className="fixed inset-0 z-[65] pointer-events-none flex items-end justify-center sm:justify-end">
    <div
      data-post-oath-nudge="1"
      role="status"
      className="pointer-events-auto m-3 w-[min(92vw,22rem)] rounded-2xl border border-amber-800/60 bg-neutral-950/95 backdrop-blur-sm px-4 py-3 shadow-2xl text-amber-100"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-serif text-sm text-amber-200">The Oath is sworn</p>
          <p className="mt-1 text-[11px] text-neutral-300 leading-relaxed">
            Your gladiator lives on this device alone. Make an account and he keeps
            fighting even if this one is lost, cleared or replaced.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              data-post-oath-action="save"
              onClick={onSaveProgress}
              className="px-3 py-1.5 rounded-full bg-gradient-to-r from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] border border-[#8b2a2a]/60 font-serif font-bold text-[11px] uppercase tracking-wider text-amber-50 cursor-pointer active:scale-95 transition-all"
            >
              Keep him safe
            </button>
            <button
              type="button"
              data-post-oath-action="dismiss"
              onClick={onDismiss}
              className="px-3 py-1.5 rounded-full border border-neutral-700 font-serif text-[11px] uppercase tracking-wider text-neutral-300 cursor-pointer hover:border-amber-700/60 hover:text-amber-200 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);
