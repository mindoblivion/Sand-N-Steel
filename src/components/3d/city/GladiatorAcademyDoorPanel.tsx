interface GladiatorAcademyDoorPanelProps {
  /** Closes the panel without entering. */
  onClose: () => void;
  /** Player chose to step inside the academy interior overlay. */
  onEnterAcademy: () => void;
  /** Player chose to enter with Rufus's conversation already open. */
  onSeeRufus: () => void;
}

/**
 * GladiatorAcademyDoorPanel — the "what do you want to do at the academy?" choice card.
 * Mirrors ForgeDoorPanel / BountyHallDoorPanel / BathhouseDoorPanel, with the
 * Academy's own second action: "See Rufus" enters the interior with the
 * Doctore's conversation open — the hard course is his to offer, and the
 * first lesson is to go to the man, not the room.
 */
export function GladiatorAcademyDoorPanel({ onClose, onEnterAcademy, onSeeRufus }: GladiatorAcademyDoorPanelProps) {
  return (
    <div
      data-academy-panel
      className="absolute inset-x-3 bottom-24 z-[70] flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-[min(92vw,26rem)] rounded-2xl border border-red-600/40 bg-neutral-950/90 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-serif font-black text-red-100 text-lg leading-tight">
              Gladiator Ludus Academy
            </div>
            <p className="mt-1 text-[13px] leading-snug text-neutral-300">
              The elite school — mosaic atrium, mirrored hall, the champions&lsquo;
              gear on stands. Aulus Galerius Rufus, the Doctore, keeps the
              office, and the hard course is his to offer.
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
            onClick={onEnterAcademy}
            className="min-h-[48px] rounded-xl bg-red-600/90 hover:bg-red-500 text-neutral-50 font-serif font-bold text-sm px-3"
          >
            Enter the Academy
          </button>
          <button
            type="button"
            onClick={onSeeRufus}
            className="min-h-[48px] rounded-xl border border-red-600/60 text-red-200 hover:bg-red-500/15 font-serif font-bold text-sm px-3"
          >
            See Rufus
          </button>
        </div>
        <p className="mt-2 text-[11px] font-mono text-neutral-500">
          The hard course: three times the price, twice the gain — level 3 and up.
        </p>
      </div>
    </div>
  );
}
