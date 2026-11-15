import React from 'react';
import { Swords } from 'lucide-react';

/** Compact confirmation shown when the player reaches the Colosseum gate. */
export function ColosseumDoorPanel({
  onEnter,
  onStayOutside,
}: {
  onEnter: () => void;
  onStayOutside: () => void;
}) {
  return (
    <div
      data-colosseum-panel
      role="dialog"
      aria-modal="true"
      aria-labelledby="colosseum-gate-title"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto max-w-xs w-[calc(100%-2rem)] rounded-2xl border border-amber-600/60 bg-neutral-950/95 p-4 shadow-2xl backdrop-blur-md"
    >
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/40 bg-amber-950/60 text-amber-300">
          <Swords className="h-5 w-5" />
        </div>
        <h4 id="colosseum-gate-title" className="font-serif font-black text-amber-200 text-base uppercase tracking-wider">
          The Grand Colosseum
        </h4>
        <p className="mt-2 text-sm text-neutral-300">
          Would you like to enter the Colosseum?
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-colosseum-enter
          onClick={onEnter}
          className="min-h-[48px] rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-neutral-950 font-serif font-black text-sm"
        >
          Enter
        </button>
        <button
          type="button"
          data-colosseum-stay-outside
          onClick={onStayOutside}
          className="min-h-[48px] rounded-xl border border-amber-700/50 bg-neutral-900 text-amber-100 font-serif font-bold text-sm"
        >
          Stay Outside
        </button>
      </div>
    </div>
  );
}
