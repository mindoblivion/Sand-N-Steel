import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Building2, Check, Coins, Lock, ShoppingCart } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import {
  FACILITIES,
  FacilityId,
  MAX_FACILITY_LEVEL,
  describeFacilityRejection,
  getFacilityUpgradeEligibility,
  nextFacilityLevel,
  resolveFacilities,
} from '../../utils/facilityProgression';

interface FacilitiesPanelProps {
  profile: PlayerProfile;
  /** P6 — `App` runs `purchaseFacility` and writes the save. */
  onBuyFacility?: (id: FacilityId) => void;
}

/**
 * P5's three buildings, on the hub's own front page.
 *
 * Every row is read out of `FACILITIES`: the building's name, the level built,
 * the next level's name and its price.  The panel carries no price literal and
 * no rule — eligibility and the refusal sentence come from
 * `utils/facilityProgression.ts`, and the purchase goes through the one App
 * handler.  A building at its top rung shows no buy control at all.
 */
export const FacilitiesPanel: React.FC<FacilitiesPanelProps> = ({ profile, onBuyFacility }) => {
  const built = resolveFacilities(profile);

  return (
    <div
      data-facilities-panel="1"
      className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-4 sm:p-5 shadow-lg mb-6"
    >
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
        <h3 className="font-serif font-bold text-sm text-amber-300 uppercase tracking-wider flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-400" />
          <span>Ludus Facilities</span>
        </h3>
        <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-yellow-500/60 font-mono font-bold text-yellow-400 text-sm shadow-inner">
          <Coins className="w-4 h-4" />
          <span>{profile.gold}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FACILITIES.map((facility) => {
          const level = built[facility.id];
          const next = nextFacilityLevel(profile, facility.id);
          const eligibility = getFacilityUpgradeEligibility(profile, facility.id);

          return (
            <div
              key={facility.id}
              data-facility={facility.id}
              data-facility-level={level}
              data-facility-cost={next?.price ?? 0}
              className="p-4 rounded-2xl bg-neutral-950/80 border border-neutral-800 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex justify-between items-start gap-2 mb-1">
                  <h4 className="font-serif font-bold text-sm text-amber-100">{facility.name}</h4>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 border border-neutral-700 shrink-0">
                    Lv {level} / {MAX_FACILITY_LEVEL}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-neutral-400">
                  {level === 0
                    ? 'Not built'
                    : facility.levels[level - 1]?.name ?? 'Built'}
                </p>
                {next && (
                  <p className="text-[11px] font-mono text-neutral-300 mt-1">
                    Next: <strong className="text-amber-200">{next.name}</strong> ·{' '}
                    <strong className="text-yellow-400">{next.price} Gold</strong>
                  </p>
                )}
              </div>

              {next ? (
                <div className="flex flex-col gap-1.5">
                  <button
                    data-facility-action={facility.id}
                    onClick={() => {
                      if (!eligibility.ok) return;
                      sounds.playCoin();
                      onBuyFacility?.(facility.id);
                    }}
                    disabled={!eligibility.ok}
                    title={
                      eligibility.ok
                        ? `Build ${next.name} for ${next.price} gold`
                        : describeFacilityRejection(eligibility.reason)
                    }
                    className={`w-full min-h-[48px] px-3 py-2 rounded-xl font-serif font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                      eligibility.ok
                        ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300 cursor-pointer active:scale-95'
                        : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
                    }`}
                  >
                    {eligibility.ok ? (
                      <ShoppingCart className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>{`Build (${next.price})`}</span>
                  </button>
                  {!eligibility.ok && (
                    <p
                      data-facility-rejection={facility.id}
                      className="text-[11px] font-serif leading-snug text-red-300"
                    >
                      {describeFacilityRejection(eligibility.reason)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-[11px] font-mono flex items-center gap-1.5 text-green-400">
                  <Check className="w-3.5 h-3.5" />
                  <span>Fully built.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
