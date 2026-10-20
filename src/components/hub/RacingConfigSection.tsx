import React from 'react';
import { PlayerProfile, ChariotTeamSize } from '../../types/game';
import { Coins, Check, Flag, Info, Lock, ShoppingCart } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import {
  RACING_CONFIGS,
  RacingConfig,
  describeRacingRejection,
  getRacingPurchaseEligibility,
  getRacingSelectionEligibility,
  resolveRacingState,
} from '../../utils/racingProgression';

interface RacingConfigSectionProps {
  profile: PlayerProfile;
  /** Buy a team.  App wires this to `purchaseRacingConfig` + `saveProfile`. */
  onBuyConfig?: (horses: ChariotTeamSize) => void;
  /** Select an unlocked team.  App wires this to `selectRacingConfig` + `saveProfile`. */
  onSelectConfig?: (horses: ChariotTeamSize) => void;
}

/**
 * One line of flavour per team.  The catalogue (`racingProgression.ts`) owns the
 * names, prices and order; this is presentation only, so it lives here rather
 * than in the data model.
 */
const CONFIG_BLURBS: Record<string, string> = {
  biga:
    'Two horses. The light team every stable starts with — quick to turn and easy to hold in the sand.',
  triga:
    'Three horses. More pull on the straights, and a harder line to hold through the turn.',
  quadra:
    'Four horses. The heaviest team the stables keep — the whole width of the track in front of you.',
};

/**
 * Phase C-8.67C — the Racing Configuration section: the player-facing Biga /
 * Triga / Quadra progression, shown below the Chariot Workshop's fit and cosmetic
 * cards (the subview the Imperial Stable opens), so it is reached through the
 * existing gear tab and no new screen, tab or subview is added.
 *
 * This component owns no mutation path of its own.  It reads eligibility from the
 * pure C-8.67B helpers, uses them again before firing a control (so a stale
 * control is inert), and every write goes out through the two callbacks — which
 * App wires to `purchaseRacingConfig` / `selectRacingConfig` and the existing
 * `saveProfile()` path.  Horse-count progression is deliberately independent of
 * the wheel and finish catalogue beside it.
 *
 * It also says plainly that a selection is only a saved preference: no race
 * starts, and nothing about combat changes.
 */
export const RacingConfigSection: React.FC<RacingConfigSectionProps> = ({
  profile,
  onBuyConfig,
  onSelectConfig,
}) => {
  const racing = resolveRacingState(profile);

  const handleBuy = (config: RacingConfig) => {
    // Re-check against the profile this render was given, so a control left over
    // from an earlier state (already unlocked, prerequisite still locked, gold
    // now short) cannot fire a transaction.
    if (!getRacingPurchaseEligibility(profile, config.horses).ok) return;
    sounds.playCoin();
    onBuyConfig?.(config.horses);
  };

  const handleSelect = (config: RacingConfig) => {
    if (!getRacingSelectionEligibility(profile, config.horses).ok) return;
    sounds.playClick();
    onSelectConfig?.(config.horses);
  };

  const renderCard = (config: RacingConfig) => {
    const isUnlocked = racing.unlocked.includes(config.horses);
    const isSelected = racing.selected === config.horses;
    const purchase = getRacingPurchaseEligibility(profile, config.horses);

    const stateLabel = isSelected
      ? 'Your selected team'
      : isUnlocked
      ? 'Unlocked — select it at no cost'
      : purchase.ok
      ? `Available for ${config.price} gold`
      : purchase.reason === 'insufficient-gold'
      ? `Not enough gold — ${config.price} needed`
      : describeRacingRejection(purchase.reason);

    const stateTone = isSelected
      ? 'text-green-400'
      : isUnlocked
      ? 'text-amber-300'
      : purchase.ok
      ? 'text-neutral-400'
      : 'text-red-400';

    return (
      <div
        key={config.id}
        data-racing-config={config.id}
        className={`p-4 rounded-3xl border transition-all flex flex-col justify-between gap-3 ${
          isSelected
            ? 'bg-amber-950/50 border-amber-400'
            : isUnlocked
            ? 'bg-neutral-900/90 border-amber-700/40'
            : 'bg-neutral-900/80 border-neutral-800'
        }`}
      >
        <div>
          <div className="flex justify-between items-start gap-2 mb-2">
            <h5 className="font-serif font-bold text-base text-amber-100">{config.name}</h5>
            <span className="font-mono text-xs font-bold text-yellow-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-700 shrink-0">
              {config.price === 0 ? 'Free' : `${config.price} Gold`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 border border-neutral-700">
              {config.horses} Horses
            </span>
            <span
              className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                isSelected
                  ? 'bg-green-950/60 text-green-300 border-green-800'
                  : isUnlocked
                  ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700'
              }`}
            >
              {isSelected ? 'Selected' : isUnlocked ? 'Unlocked' : 'Locked'}
            </span>
          </div>

          <p className="text-xs text-neutral-400 mb-2">{CONFIG_BLURBS[config.id]}</p>

          <div className={`text-[11px] font-mono flex items-start gap-1.5 ${stateTone}`}>
            {isUnlocked ? (
              <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            ) : (
              <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            )}
            <span>{stateLabel}</span>
          </div>
        </div>

        {isUnlocked ? (
          <button
            data-racing-action="select"
            onClick={() => handleSelect(config)}
            disabled={isSelected}
            title={isSelected ? `${config.name} is already your selected team` : `Select ${config.name}`}
            className={`w-full min-h-[48px] py-2.5 px-2 rounded-2xl font-serif font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
              isSelected
                ? 'bg-green-800 text-green-200 cursor-default'
                : 'bg-amber-600 hover:bg-amber-500 text-neutral-950 cursor-pointer active:scale-95'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            <span>{isSelected ? 'Selected team' : 'Select team'}</span>
          </button>
        ) : (
          <>
            <button
              data-racing-action="buy"
              onClick={() => handleBuy(config)}
              disabled={!purchase.ok}
              title={
                purchase.ok
                  ? `Buy the ${config.name} team for ${config.price} gold`
                  : describeRacingRejection(purchase.reason)
              }
              className={`w-full min-h-[48px] py-2.5 px-2 rounded-2xl font-serif font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                purchase.ok
                  ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300 cursor-pointer active:scale-95'
                  : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{`Buy (${config.price})`}</span>
            </button>
            {/* UI-1 (B-17) — a touch player never sees a title attribute, so the
                rejection is printed under the disabled control as well. */}
            {!purchase.ok && (
              <p
                data-racing-rejection="1"
                className="text-[11px] font-serif leading-snug text-red-300"
              >
                {describeRacingRejection(purchase.reason)}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      {/* HEADER */}
      <div className="bg-neutral-900/80 border-2 border-cyan-500/60 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="font-serif font-black text-xl sm:text-2xl text-amber-100 uppercase mb-1">
            Racing Configuration
          </h3>
          <p className="text-xs sm:text-sm text-neutral-300 font-serif">
            The team that pulls your chariot. Biga fields two horses, Triga three, Quadra four.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-neutral-950 px-4 py-2 rounded-2xl border border-yellow-500/60 font-mono font-bold text-yellow-400 text-lg shadow-inner">
          <Coins className="w-5 h-5" />
          <span>{profile.gold}</span>
        </div>
      </div>

      {/* WHAT A SELECTION MEANS — no race starts, and nothing about combat changes. */}
      <div className="flex items-start gap-2 text-[11px] font-serif text-neutral-400 bg-neutral-950/60 border border-neutral-800 rounded-2xl p-3">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p>
          Selecting a team saves it to your gladiator as your preferred racing setup. It does not start a
          race — racing gameplay is not available yet — and it never changes your combat stats or the parts
          fitted to your chariot.
        </p>
      </div>

      {/* TEAMS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{RACING_CONFIGS.map(renderCard)}</div>
    </div>
  );
};
