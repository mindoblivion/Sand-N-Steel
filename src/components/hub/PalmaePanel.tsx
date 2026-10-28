import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Award, Lock } from 'lucide-react';
import { getPalma, PALMAE_PLAYER_POOL } from '../../data/palmae';
import { resolvePalmae } from '../../utils/traitModifiers';
import { palmaSlotsForTier, PALMA_SLOT_CEILING, slotOpeningTier } from '../../utils/palmaeState';

interface PalmaePanelProps {
  profile: PlayerProfile;
  /** CH-5 — wear a palm; `App` runs the validated transaction and writes the save. */
  onEquipPalma?: (palmaId: string) => void;
  /** CH-5 — take a palm off; the same transaction in the other direction. */
  onUnequipPalma?: (palmaId: string) => void;
}

/**
 * CH-5 — the Palmae panel: the palms this gladiator owns, against the slots his
 * tier allows.
 *
 * Read-only apart from the two taps it hands back to `App`, which is the only
 * writer of `profile.palmae` (`utils/palmaeState.ts`).  The slot ladder is the
 * Director's ruling — `min(3, max(0, currentTier - 1))` — and a locked slot names
 * the tier that opens it, so the player can see what the next circuit buys.
 */
export const PalmaePanel: React.FC<PalmaePanelProps> = ({
  profile,
  onEquipPalma,
  onUnequipPalma,
}) => {
  const state = resolvePalmae(profile);
  const unlockedIds = state.unlocked ?? [];
  const equippedIds = state.equipped ?? [];
  const slots = palmaSlotsForTier(profile.currentTier);
  const unlocked = PALMAE_PLAYER_POOL.filter((palma) => unlockedIds.includes(palma.id));
  const hasFreeSlot = equippedIds.length < slots;
  const canEquip = Boolean(onEquipPalma) && hasFreeSlot;

  return (
    <div
      className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg"
      data-palmae-panel
      data-palmae-slots={slots}
      data-palmae-equipped={equippedIds.length}
    >
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <h4 className="font-serif font-bold text-sm text-amber-300 uppercase tracking-wider flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          <span>Palmae</span>
        </h4>
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
          Worn {equippedIds.length} / {slots}
        </span>
      </div>

      {/* THE SLOTS — filled, open, or the tier that opens them. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {Array.from({ length: PALMA_SLOT_CEILING }, (_unused, slotIndex) => {
          const wornId = equippedIds[slotIndex];
          const worn = wornId ? getPalma(wornId) : undefined;
          const openingTier = slotOpeningTier(slotIndex);
          const locked = slotIndex >= slots;
          return (
            <div
              key={slotIndex}
              data-palma-slot={slotIndex + 1}
              data-slot-state={worn ? 'filled' : locked ? 'locked' : 'open'}
              className={`p-3 rounded-2xl border text-center ${
                worn
                  ? 'bg-amber-500/15 border-amber-500/60'
                  : locked
                    ? 'bg-neutral-950/60 border-neutral-800'
                    : 'bg-neutral-950/80 border-dashed border-amber-800/60'
              }`}
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                Slot {slotIndex + 1}
              </div>
              {worn ? (
                <div className="font-serif font-bold text-sm text-amber-200 mt-1">{worn.name}</div>
              ) : locked ? (
                <div className="mt-1 flex items-center justify-center gap-1 text-[11px] font-serif italic text-neutral-500">
                  <Lock className="w-3 h-3" />
                  <span>Tier {openingTier ?? '—'} opens it</span>
                </div>
              ) : (
                <div className="mt-1 text-[11px] font-serif italic text-neutral-400">Empty</div>
              )}
            </div>
          );
        })}
      </div>

      {unlocked.length === 0 ? (
        <p className="font-serif text-xs italic text-neutral-500" data-palmae-none>
          No palms yet. Win in the sand — or buy the Doctore's training — and they will come.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {unlocked.map((palma) => {
            const worn = equippedIds.includes(palma.id);
            return (
              <li
                key={palma.id}
                data-palma={palma.id}
                data-palma-worn={worn ? 'true' : 'false'}
                className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-2xl flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-serif font-bold text-sm text-amber-100">{palma.name}</div>
                  <p className="text-[11px] font-serif text-neutral-400 mt-0.5">{palma.description}</p>
                  <div className="text-[10px] font-mono text-amber-400/70 mt-1">{palma.sourceDetail}</div>
                </div>
                <button
                  type="button"
                  data-palma-action={worn ? 'unequip' : 'equip'}
                  onClick={() => {
                    if (worn) onUnequipPalma?.(palma.id);
                    else onEquipPalma?.(palma.id);
                  }}
                  disabled={!worn && !canEquip}
                  className="shrink-0 min-h-[44px] px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 border border-amber-700/60 text-amber-200 font-serif font-bold text-[11px] uppercase tracking-wider cursor-pointer"
                >
                  {worn ? 'Unequip' : 'Equip'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!hasFreeSlot && unlocked.length > 0 && (
        <p className="mt-3 text-[11px] font-serif italic text-neutral-500" data-palmae-no-slot>
          Every slot your tier allows is filled — and the next circuit opens another.
        </p>
      )}
    </div>
  );
};
