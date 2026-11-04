import React from 'react';
import { Swords } from 'lucide-react';

/**
 * COLOSSEUM-INTERIOR — the Colosseum door's choice panel.
 *
 * When the player interacts with the Colosseum in the city, the door offers
 * two choices instead of resolving a duel ticket immediately: "Enter the
 * Arena" opens the enterable interior (the empty arena; `App` owns the
 * overlay), and "Fight" keeps the door's existing ticket. Same surface as
 * the shrine and treatment panels. Presentational only — the caller owns the
 * choices.
 */
export function ColosseumDoorPanel({
  onEnterArena,
  onFight,
  onClose,
}: {
  onEnterArena: () => void;
  onFight: () => void;
  onClose: () => void;
}) {
  return (
    <div
      data-colosseum-panel
      className="absolute top-36 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-sm sm:max-w-md w-[calc(100%-2rem)] rounded-2xl border border-amber-600/50 bg-neutral-950/90 p-4 shadow-2xl"
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <h4 className="font-serif font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Swords className="w-4 h-4 text-amber-400" />
            <span>The Colosseum</span>
          </h4>
          <p className="text-[11px] sm:text-xs text-neutral-300 font-sans leading-relaxed">
            Fifty thousand empty seats. Walk the sand alone — or answer the door's call and fight.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close colosseum panel"
          className="text-neutral-400 hover:text-amber-200 text-lg leading-none p-2 min-w-[44px] min-h-[44px]"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          data-enter-arena
          onClick={onEnterArena}
          className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:via-amber-400 hover:to-yellow-400 text-neutral-950 font-serif font-black text-sm flex items-center justify-center gap-2"
        >
          <span>Enter the Arena</span>
        </button>
        <button
          type="button"
          data-colosseum-fight
          onClick={onFight}
          className="w-full min-h-[48px] rounded-xl bg-neutral-900 hover:bg-neutral-800 text-amber-100 font-serif font-bold text-sm flex items-center justify-center gap-2 border border-amber-700/40"
        >
          <Swords className="w-4 h-4 text-amber-400" />
          <span>Fight</span>
        </button>
      </div>
    </div>
  );
}
