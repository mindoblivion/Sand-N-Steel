import React, { useMemo, useState } from 'react';
import { PlayerProfile } from '../../types/game';
import { Coins, Eye, Flag, Info, Wrench } from 'lucide-react';
import { getSelectedRacingConfig } from '../../utils/racingProgression';
import { resolveChariotLoadout } from '../../utils/chariotLoadout';
import { getChariotPart } from '../../data/chariotParts';

interface PreRacePanelProps {
  profile: PlayerProfile;
  /** Close the panel and hand control back to the city, exactly as it was. */
  onLeave: () => void;
}

/**
 * Phase C-8.70B — the pre-race entry panel.
 *
 * It is the East Circus District's race entry point's own screen: the district's
 * signed signpost (a `HUB_LOCATIONS` trigger — the city's existing interaction
 * component, not a parallel system) opens it, and it shows what the player would
 * race with.
 *
 * What it reads, and where each figure comes from:
 *   • the team, by name and horse count, from `getSelectedRacingConfig(profile)`
 *     — the same `selected` source of truth `RacingConfigSection` writes, so a
 *     fresh profile shows Biga with 2 horses and an unlocked-but-unselected
 *     Triga still shows the size actually selected;
 *   • the fitted loadout from `resolveChariotLoadout(profile)`, the same pure
 *     read the Chariot Workshop uses.
 *
 * Save safety — the whole point of this slice.  The panel is READ-ONLY: it
 * imports no storage and calls no save writer, so opening it, pressing
 * "Start Race" or pressing "Leave" cannot move gold, ownership, unlocks or the
 * selection.  "Start Race" is inert by design in this slice — it sets one piece
 * of local React state and says so on screen; it does not change scene, spawn
 * anything or write anything.  "Leave" calls back to the city, which simply
 * closes the panel.  Both controls are ordinary buttons, so touch and
 * mouse/keyboard drive them identically.
 */
export const PreRacePanel: React.FC<PreRacePanelProps> = ({ profile, onLeave }) => {
  const [notice, setNotice] = useState(false);

  const team = useMemo(() => getSelectedRacingConfig(profile), [profile]);
  const loadout = useMemo(() => resolveChariotLoadout(profile), [profile]);

  const wheels = getChariotPart(loadout.equipped.wheels);
  const finish = getChariotPart(loadout.equipped.finish);
  const wheelsName = wheels?.name ?? 'Standard Wheel Set';
  const finishName = finish?.name ?? 'Workshop Stock Finish';

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-fadeIn text-amber-100 max-h-[92dvh] overflow-y-auto">
        <div className="text-center mb-5">
          <div className="w-16 h-16 rounded-full bg-amber-900/50 border border-amber-500 flex items-center justify-center mx-auto mb-3 shadow-[0_0_20px_rgba(245,158,11,0.5)]">
            <Flag className="w-8 h-8 text-amber-300" />
          </div>
          <span className="text-xs font-serif uppercase tracking-widest text-amber-400 font-bold">
            Circus Race Entry
          </span>
          <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mt-1">
            {team.name}
          </h3>
          <p className="text-xs font-serif text-neutral-400 italic">
            {team.horses} horses on the yoke
          </p>
        </div>

        <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 mb-5 flex flex-col gap-2 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-neutral-400">Selected team:</span>
            <span className="text-amber-300 uppercase" data-race-field="team">
              {team.name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Horses:</span>
            <span className="text-amber-300" data-race-field="horses">
              {team.horses}
            </span>
          </div>
          <div className="flex justify-between items-center gap-3">
            <span className="text-neutral-400 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-cyan-400" />
              <span>Wheels:</span>
            </span>
            <span className="text-amber-200 text-right" data-race-field="wheels">
              {wheelsName}
            </span>
          </div>
          <div className="flex justify-between items-center gap-3">
            <span className="text-neutral-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-purple-400" />
              <span>Finish:</span>
            </span>
            <span className="text-amber-200 text-right" data-race-field="finish">
              {finishName}
            </span>
          </div>
          <div className="flex justify-between border-t border-neutral-800 pt-2 mt-1">
            <span className="text-neutral-400 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-yellow-400" />
              <span>Purse:</span>
            </span>
            <span className="text-yellow-400">{profile.gold}</span>
          </div>
        </div>

        {notice ? (
          <div
            className="flex items-start gap-2 text-[11px] font-serif text-amber-200 bg-amber-950/50 border border-amber-500/60 rounded-2xl p-3 mb-4"
            data-race-notice="pending"
          >
            <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <p>
              The gates are still being raised — chariot racing arrives in the next phase. Your team
              and chariot are recorded and will be waiting on the sand.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[11px] font-serif text-neutral-400 bg-neutral-950/60 border border-neutral-800 rounded-2xl p-3 mb-4">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p>
              Nothing is wagered and nothing is written to your gladiator here: this is the entry
              staging point for the Circus, and the race itself is not run yet.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onLeave}
            data-race-action="leave"
            className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-serif font-bold text-xs uppercase cursor-pointer active:scale-95 transition-all"
          >
            Leave
          </button>
          <button
            onClick={() => setNotice(true)}
            data-race-action="start"
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-neutral-950 font-serif font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg active:scale-95 transition-all"
          >
            Start Race
          </button>
        </div>
      </div>
    </div>
  );
};
