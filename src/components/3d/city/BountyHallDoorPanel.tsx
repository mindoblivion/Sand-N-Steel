interface BountyHallDoorPanelProps {
  /** Closes the panel without entering. */
  onClose: () => void;
  /** Player chose to step inside the bounty hall interior overlay. */
  onEnterHall: () => void;
  /** Player chose the bounty board panel directly (the hall's current behaviour). */
  onViewBoard: () => void;
}

/**
 * BountyHallDoorPanel — the "what do you want to do at the bounty hall?" choice card.
 * Mirrors ForgeDoorPanel: enter the 3D bounty hall interior, or open the
 * existing bounty board panel directly.
 */
export function BountyHallDoorPanel({ onClose, onEnterHall, onViewBoard }: BountyHallDoorPanelProps) {
  return (
    <div
      data-bounty-hall-panel
      className="absolute inset-x-3 bottom-24 z-[70] flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-[min(92vw,26rem)] rounded-2xl border border-rose-600/40 bg-neutral-950/90 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-serif font-black text-rose-100 text-lg leading-tight">
              Bounty &amp; Mercenary Hall
            </div>
            <p className="mt-1 text-[13px] leading-snug text-neutral-300">
              Contracts, combat notices, and the Deserter&apos;s price. Step inside to walk the hall and
              meet Scribonia — or read the board from here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] -mr-1 -mt-1 rounded-xl text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onEnterHall}
            className="min-h-[48px] rounded-xl bg-rose-600/90 hover:bg-rose-500 text-neutral-50 font-serif font-bold text-sm px-3"
          >
            Enter the Hall
          </button>
          <button
            type="button"
            onClick={onViewBoard}
            className="min-h-[48px] rounded-xl border border-rose-600/60 text-rose-200 hover:bg-rose-500/15 font-serif font-bold text-sm px-3"
          >
            View the Board
          </button>
        </div>
        <p className="mt-2 text-[11px] font-mono text-neutral-500">
          Five postings stand at a time — the board pays to the copper.
        </p>
      </div>
    </div>
  );
}
