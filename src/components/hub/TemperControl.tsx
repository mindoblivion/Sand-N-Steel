import React from 'react';
import { ArmorItem, PlayerProfile, WeaponItem } from '../../types/game';
import { Coins, Hammer, Lock } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import {
  TEMPER_MAX_LEVEL,
  describeTemperRejection,
  getTemperCost,
  getTemperPurchaseEligibility,
  resolveTemperLevel,
} from '../../utils/tempering';

interface TemperControlProps {
  profile: PlayerProfile;
  /** The owned item this row belongs to — a carried sword or a carried armour piece. */
  item: WeaponItem | ArmorItem;
  /** P6 — `App` runs `purchaseTemper` and writes the save; this screen only asks. */
  onTemper?: (itemId: string) => void;
}

/**
 * P6 — the temper row on an owned item's card in the Armory.
 *
 * This component owns NO transaction and NO rule.  The level, the next level's
 * cost, whether the purchase is allowed and the sentence a refusal prints all
 * come from `utils/tempering.ts` — including the Smithing Workshop's cap (P5),
 * which the helper reads from the profile's facility state.  The row therefore
 * cannot disagree with the purchase that fires behind it, and it never computes
 * a cap of its own.
 */
export const TemperControl: React.FC<TemperControlProps> = ({ profile, item, onTemper }) => {
  const level = resolveTemperLevel(profile, item.id);
  const eligibility = getTemperPurchaseEligibility(profile, item.id);
  const cost = getTemperCost(item, level);
  const rejection = eligibility.ok ? null : describeTemperRejection(eligibility.reason);

  const handleTemper = () => {
    if (!eligibility.ok) return;
    sounds.playCoin();
    onTemper?.(item.id);
  };

  return (
    <div
      data-temper-item={item.id}
      data-temper-level={level}
      data-temper-ok={eligibility.ok ? '1' : '0'}
      className="flex flex-col gap-1.5 w-full"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
          <Hammer className="w-3.5 h-3.5 text-amber-500" />
          <span>
            Temper <strong className="text-amber-300">+{level}</strong> / {TEMPER_MAX_LEVEL}
          </span>
        </span>

        <button
          onClick={handleTemper}
          disabled={!eligibility.ok}
          title={rejection ?? `Temper for ${cost} gold`}
          className={`min-h-[48px] px-4 py-2 rounded-xl text-[11px] font-serif font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
            eligibility.ok
              ? 'bg-amber-600 hover:bg-amber-500 text-neutral-950 active:scale-95'
              : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
          }`}
        >
          {eligibility.ok ? <Coins className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          <span>{eligibility.ok ? `Temper (${cost} Gold)` : 'Temper'}</span>
        </button>
      </div>

      {/* UI-1 (B-17) — a touch player never sees a title attribute, so the refusal
          is printed under the disabled control as well. */}
      {rejection && (
        <p data-temper-rejection="1" className="text-[11px] font-serif leading-snug text-red-300">
          {rejection}
        </p>
      )}
    </div>
  );
};
