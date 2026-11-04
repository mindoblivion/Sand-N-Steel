interface ForgeDoorPanelProps {
  /** Closes the panel without entering. */
  onClose: () => void;
  /** Player chose to step inside the forge interior overlay. */
  onEnterForge: () => void;
  /** Player chose the forge's weapon storefront instead. */
  onShop: () => void;
}

/**
 * ForgeDoorPanel — the "what do you want to do at the forge?" choice card.
 * Mirrors ColosseumDoorPanel: enter the 3D forge interior, or open the
 * existing weapon storefront directly.
 */
export function ForgeDoorPanel({ onClose, onEnterForge, onShop }: ForgeDoorPanelProps) {
  return (
    <div
      data-forge-panel
      className="absolute inset-x-3 bottom-24 z-[70] flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-[min(92vw,26rem)] rounded-2xl border border-orange-600/40 bg-neutral-950/90 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-serif font-black text-orange-100 text-lg leading-tight">
              The Smithing Forge
            </div>
            <p className="mt-1 text-[13px] leading-snug text-neutral-300">
              Heat, hammer, and iron. Step inside to walk the forge floor and
              meet Sextus Ferratus — or browse his weapon racks from here.
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
            onClick={onEnterForge}
            className="min-h-[48px] rounded-xl bg-orange-600/90 hover:bg-orange-500 text-neutral-950 font-serif font-bold text-sm px-3"
          >
            Enter the Forge
          </button>
          <button
            type="button"
            onClick={onShop}
            className="min-h-[48px] rounded-xl border border-orange-600/60 text-orange-200 hover:bg-orange-500/15 font-serif font-bold text-sm px-3"
          >
            Buy Weapons
          </button>
        </div>
        <p className="mt-2 text-[11px] font-mono text-neutral-500">
          The furnace never cools — the forge is always open.
        </p>
      </div>
    </div>
  );
}
