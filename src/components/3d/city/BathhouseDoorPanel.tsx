interface BathhouseDoorPanelProps {
  /** Closes the panel without entering. */
  onClose: () => void;
  /** Player chose to step inside the bathhouse interior overlay. */
  onEnterBathhouse: () => void;
  /** Player chose to enter with Straton's conversation already open. */
  onHearSteam: () => void;
}

/**
 * BathhouseDoorPanel — the "what do you want to do at the thermae?" choice card.
 * Mirrors ForgeDoorPanel / BountyHallDoorPanel, with one difference the canon
 * forces: there is no service to sell, so the second action is not a purchase.
 * "Hear the Steam" enters the interior with Straton's conversation open — the
 * bathhouse's only content is the man and his gossip. No coin changes hands.
 */
export function BathhouseDoorPanel({ onClose, onEnterBathhouse, onHearSteam }: BathhouseDoorPanelProps) {
  return (
    <div
      data-bathhouse-panel
      className="absolute inset-x-3 bottom-24 z-[70] flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-[min(92vw,26rem)] rounded-2xl border border-sky-600/40 bg-neutral-950/90 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-serif font-black text-sky-100 text-lg leading-tight">
              The Imperial Bathhouse
            </div>
            <p className="mt-1 text-[13px] leading-snug text-neutral-300">
              Marble, steam, and four pools in sequence. Straton of Corinth
              keeps the door, and the steam keeps the gossip — the Thermae
              ask nothing of you but the dirt.
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
            onClick={onEnterBathhouse}
            className="min-h-[48px] rounded-xl bg-sky-600/90 hover:bg-sky-500 text-neutral-50 font-serif font-bold text-sm px-3"
          >
            Enter the Bathhouse
          </button>
          <button
            type="button"
            onClick={onHearSteam}
            className="min-h-[48px] rounded-xl border border-sky-600/60 text-sky-200 hover:bg-sky-500/15 font-serif font-bold text-sm px-3"
          >
            Hear the Steam
          </button>
        </div>
        <p className="mt-2 text-[11px] font-mono text-neutral-500">
          No coin changes hands here. The baths are free — the gossip doubly so.
        </p>
      </div>
    </div>
  );
}
