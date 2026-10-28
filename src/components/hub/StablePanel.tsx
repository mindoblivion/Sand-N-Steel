import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Check, Coins, Lock, ShoppingCart } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import {
  MAX_CONDITIONING,
  describeStableRejection,
  getStableConditioningEligibility,
  getStableQuality,
  getStableQualityEligibility,
  nextConditioningCost,
  resolveStableState,
  stableTeamSize,
} from '../../utils/stableProgression';
import { requiredStableForConditioning, requiredStableForQuality } from '../../utils/facilityProgression';

interface StablePanelProps {
  profile: PlayerProfile;
  /** P6 — `App` runs `purchaseStableQuality` and writes the save. */
  onBuyQuality?: (grade: number) => void;
  /** P6 — `App` runs `purchaseStableConditioning` and writes the save. */
  onBuyConditioning?: (level: number) => void;
}

/**
 * P4's two ladders as a panel beside the horse teams that are built on them.
 *
 * This component states no rule of its own: the grade, the conditioning level,
 * the next rung, its price, whether it may be bought and the sentence a refusal
 * prints all come from `utils/stableProgression.ts`, and the Imperial Stable's
 * facility gate is read from `utils/facilityProgression.ts` — so a grade the
 * building does not support shows LOCKED with the helper's own reason rather
 * than disappearing.  Nothing here writes a profile.
 */
export const StablePanel: React.FC<StablePanelProps> = ({
  profile,
  onBuyQuality,
  onBuyConditioning,
}) => {
  const state = resolveStableState(profile);
  const current = getStableQuality(state.quality);
  const nextQuality = getStableQuality(state.quality + 1);
  const qualityCheck = nextQuality
    ? getStableQualityEligibility(profile, nextQuality.grade)
    : null;

  const nextLevel = state.conditioning + 1;
  const conditioningPrice = nextConditioningCost(profile);
  const conditioningCheck =
    state.conditioning < MAX_CONDITIONING
      ? getStableConditioningEligibility(profile, nextLevel)
      : null;
  const teamSize = stableTeamSize(profile);

  /** The facility requirement a refusal is talking about, read from the helper that owns it. */
  const requiredForQuality =
    qualityCheck && !qualityCheck.ok && qualityCheck.reason === 'facility-required' && nextQuality
      ? requiredStableForQuality(nextQuality.grade)
      : 0;
  const requiredForConditioning =
    conditioningCheck &&
    !conditioningCheck.ok &&
    conditioningCheck.reason === 'facility-required'
      ? requiredStableForConditioning(nextLevel)
      : 0;

  const buyQuality = () => {
    if (!nextQuality || !qualityCheck?.ok) return;
    sounds.playCoin();
    onBuyQuality?.(nextQuality.grade);
  };

  const buyConditioning = () => {
    if (!conditioningCheck?.ok) return;
    sounds.playCoin();
    onBuyConditioning?.(nextLevel);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      <div className="bg-neutral-900/80 border-2 border-cyan-500/60 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="font-serif font-black text-xl sm:text-2xl text-amber-100 uppercase mb-1">
            Imperial Stable
          </h3>
          <p className="text-xs sm:text-sm text-neutral-300 font-serif">
            The bloodline and condition of the team that pulls your chariot.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-neutral-950 px-4 py-2 rounded-2xl border border-yellow-500/60 font-mono font-bold text-yellow-400 text-lg shadow-inner">
          <Coins className="w-5 h-5" />
          <span>{profile.gold}</span>
        </div>
      </div>

      {/* QUALITY — one team, one standard. */}
      <div
        data-stable-quality={state.quality}
        className="bg-neutral-900/80 border border-amber-700/40 rounded-3xl p-5 shadow-lg flex flex-col gap-3"
      >
        <div className="flex flex-wrap justify-between items-start gap-2">
          <div>
            <h4 className="font-serif font-bold text-base text-amber-100">Quality</h4>
            <p className="text-xs text-neutral-400">
              Current grade: <strong className="text-amber-200">{current?.name ?? 'Plow Team'}</strong>
            </p>
          </div>
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 border border-neutral-700">
            Grade {state.quality}
          </span>
        </div>

        {nextQuality && qualityCheck ? (
          <>
            <div className="text-xs font-mono text-neutral-300">
              Next: <strong className="text-amber-200">{nextQuality.name}</strong> ·{' '}
              <strong className="text-yellow-400">{nextQuality.price} Gold</strong>
            </div>

            <button
              data-stable-action="quality"
              onClick={buyQuality}
              disabled={!qualityCheck.ok}
              title={
                qualityCheck.ok
                  ? `Buy ${nextQuality.name} for ${nextQuality.price} gold`
                  : describeStableRejection(qualityCheck.reason)
              }
              className={`w-full sm:w-auto min-h-[48px] px-4 py-2.5 rounded-2xl font-serif font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                qualityCheck.ok
                  ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300 cursor-pointer active:scale-95'
                  : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
              }`}
            >
              {qualityCheck.ok ? (
                <ShoppingCart className="w-3.5 h-3.5" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>{`Buy (${nextQuality.price})`}</span>
            </button>

            {!qualityCheck.ok && (
              <p
                data-stable-rejection="quality"
                className="text-[11px] font-serif leading-snug text-red-300"
              >
                {describeStableRejection(qualityCheck.reason)}
                {requiredForQuality > 0
                  ? ` (Needs the Imperial Stable at level ${requiredForQuality}.)`
                  : ''}
              </p>
            )}
          </>
        ) : (
          <div className="text-[11px] font-mono flex items-center gap-1.5 text-green-400">
            <Check className="w-3.5 h-3.5" />
            <span>{current?.name ?? 'Plow Team'} — the best the stables breed.</span>
          </div>
        )}
      </div>

      {/* CONDITIONING — priced for the team the player actually races. */}
      <div
        data-stable-conditioning={state.conditioning}
        data-conditioning-price={state.conditioning < MAX_CONDITIONING ? conditioningPrice : 0}
        className="bg-neutral-900/80 border border-amber-700/40 rounded-3xl p-5 shadow-lg flex flex-col gap-3"
      >
        <div className="flex flex-wrap justify-between items-start gap-2">
          <div>
            <h4 className="font-serif font-bold text-base text-amber-100">Conditioning</h4>
            <p className="text-xs text-neutral-400">
              Level <strong className="text-amber-200">{state.conditioning}</strong> of {MAX_CONDITIONING} · kept
              fit for a <strong className="text-amber-200">{teamSize}-horse</strong> team
            </p>
          </div>
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 border border-neutral-700">
            {teamSize} Horses
          </span>
        </div>

        {conditioningCheck ? (
          <>
            <div className="text-xs font-mono text-neutral-300">
              Next: <strong className="text-amber-200">Level {nextLevel}</strong> ·{' '}
              <strong className="text-yellow-400">{conditioningPrice} Gold</strong>
            </div>

            <button
              data-stable-action="conditioning"
              onClick={buyConditioning}
              disabled={!conditioningCheck.ok}
              title={
                conditioningCheck.ok
                  ? `Buy conditioning level ${nextLevel} for ${conditioningPrice} gold`
                  : describeStableRejection(conditioningCheck.reason)
              }
              className={`w-full sm:w-auto min-h-[48px] px-4 py-2.5 rounded-2xl font-serif font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                conditioningCheck.ok
                  ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300 cursor-pointer active:scale-95'
                  : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
              }`}
            >
              {conditioningCheck.ok ? (
                <ShoppingCart className="w-3.5 h-3.5" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>{`Buy (${conditioningPrice})`}</span>
            </button>

            {!conditioningCheck.ok && (
              <p
                data-stable-rejection="conditioning"
                className="text-[11px] font-serif leading-snug text-red-300"
              >
                {describeStableRejection(conditioningCheck.reason)}
                {requiredForConditioning > 0
                  ? ` (Needs the Imperial Stable at level ${requiredForConditioning}.)`
                  : ''}
              </p>
            )}
          </>
        ) : (
          <div className="text-[11px] font-mono flex items-center gap-1.5 text-green-400">
            <Check className="w-3.5 h-3.5" />
            <span>Fully conditioned.</span>
          </div>
        )}
      </div>

      <p className="text-[11px] font-serif text-neutral-400 bg-neutral-950/60 border border-neutral-800 rounded-2xl p-3">
        Quality and conditioning are bought for your one team and are the same for every team you own.
        Neither is a live racing stat yet — racing gameplay is not available, and nothing here changes your
        combat numbers.
      </p>
    </div>
  );
};
