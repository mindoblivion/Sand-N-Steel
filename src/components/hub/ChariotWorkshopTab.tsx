import React, { useMemo, useState } from 'react';
import { PlayerProfile } from '../../types/game';
import { Coins, Check, Lock, Eye, Wrench, RotateCcw, Info, ShoppingCart } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import { ChariotPreview } from '../3d/ChariotPreview';
import {
  CHARIOT_PARTS,
  ChariotFinishKey,
  ChariotPart,
  ChariotWheelVariantKey,
  chariotPartsBySlot,
  getChariotPart,
} from '../../data/chariotParts';
import {
  describeChariotRejection,
  getChariotEquipEligibility,
  getChariotPurchaseEligibility,
  resolveChariotLoadout,
} from '../../utils/chariotLoadout';

interface ChariotWorkshopTabProps {
  profile: PlayerProfile;
  onBuyPart: (partId: string) => void;
  onEquipPart: (partId: string) => void;
}

/**
 * Phase C-8.66B — the Chariot Workshop, mounted as a subview of the existing
 * Armory (gear) experience rather than as a sixth global tab.
 *
 * Preview selection is LOCAL, temporary state: it starts at the equipped
 * loadout, follows whatever card the player is looking at, and is discarded by
 * "Reset preview" — closing or leaving the view drops it too, because it lives
 * in this component. Nothing here writes to the profile; buying and equipping
 * go through the two callbacks, which use the existing gold and `saveProfile()`.
 */
export const ChariotWorkshopTab: React.FC<ChariotWorkshopTabProps> = ({
  profile,
  onBuyPart,
  onEquipPart,
}) => {
  const loadout = useMemo(() => resolveChariotLoadout(profile), [profile]);

  const equippedParts = useMemo(() => {
    const wheels = getChariotPart(loadout.equipped.wheels);
    const finish = getChariotPart(loadout.equipped.finish);
    return {
      wheels: wheels?.wheelVariant ?? ('standard' as ChariotWheelVariantKey),
      finish: finish?.finish ?? ('stock' as ChariotFinishKey),
    };
  }, [loadout]);

  const [previewWheels, setPreviewWheels] = useState<ChariotWheelVariantKey>(equippedParts.wheels);
  const [previewFinish, setPreviewFinish] = useState<ChariotFinishKey>(equippedParts.finish);

  const isPreviewing =
    previewWheels !== equippedParts.wheels || previewFinish !== equippedParts.finish;

  const resetPreview = () => {
    sounds.playClick();
    setPreviewWheels(equippedParts.wheels);
    setPreviewFinish(equippedParts.finish);
  };

  const previewPart = (part: ChariotPart) => {
    sounds.playClick();
    if (part.slot === 'wheels' && part.wheelVariant) setPreviewWheels(part.wheelVariant);
    if (part.slot === 'finish' && part.finish) setPreviewFinish(part.finish);
  };

  const handleBuy = (part: ChariotPart) => {
    const eligibility = getChariotPurchaseEligibility(profile, part.id);
    if (!eligibility.ok) return;
    sounds.playCoin();
    onBuyPart(part.id);
  };

  const handleEquip = (part: ChariotPart) => {
    const eligibility = getChariotEquipEligibility(profile, part.id);
    if (!eligibility.ok) return;
    sounds.playClick();
    onEquipPart(part.id);
  };

  const previewedWheelPart = CHARIOT_PARTS.find(
    (part) => part.slot === 'wheels' && part.wheelVariant === previewWheels
  );
  const previewedFinishPart = CHARIOT_PARTS.find(
    (part) => part.slot === 'finish' && part.finish === previewFinish
  );

  const renderCard = (part: ChariotPart) => {
    const purchase = getChariotPurchaseEligibility(profile, part.id);
    const isOwned = loadout.owned.includes(part.id);
    const isEquipped = loadout.equipped[part.slot] === part.id;
    const isPreviewed =
      (part.slot === 'wheels' && part.wheelVariant === previewWheels) ||
      (part.slot === 'finish' && part.finish === previewFinish);
    const affordable = profile.gold >= part.price;
    const stateLabel = isEquipped
      ? 'Equipped'
      : isOwned
      ? 'Owned'
      : // L16B — a visitor-acquired part is a discoverable locked goal, never stock.
      part.visitorOnly
      ? 'Brought by a visitor.'
      : part.price === 0
      ? 'Included with every chariot'
      : affordable
      ? 'Available'
      : 'Insufficient gold';

    return (
      <div
        key={part.id}
        className={`p-4 rounded-3xl border transition-all flex flex-col justify-between gap-3 ${
          isEquipped
            ? 'bg-amber-950/50 border-amber-400'
            : isPreviewed
            ? 'bg-neutral-900/90 border-cyan-500/60'
            : 'bg-neutral-900/80 border-amber-700/40'
        }`}
      >
        <div>
          <div className="flex justify-between items-start gap-2 mb-2">
            <h5 className="font-serif font-bold text-base text-amber-100">{part.name}</h5>
            <span className="font-mono text-xs font-bold text-yellow-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-700 shrink-0">
              {part.price === 0 ? 'Free' : `${part.price} Gold`}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 border border-neutral-700">
              {part.slot === 'wheels' ? 'Wheel set' : 'Cosmetic finish'}
            </span>
            <span
              className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                part.partClass === 'performance'
                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800'
                  : 'bg-purple-950/50 text-purple-300 border-purple-800'
              }`}
            >
              {part.partClass === 'performance' ? 'Fit upgrade' : 'Cosmetic'}
            </span>
          </div>

          <p className="text-xs text-neutral-400 mb-2">{part.description}</p>

          <div
            className={`text-[11px] font-mono flex items-center gap-1.5 ${
              isEquipped ? 'text-green-400' : isOwned ? 'text-amber-300' : affordable ? 'text-neutral-400' : 'text-red-400'
            }`}
          >
            {isEquipped ? (
              <Check className="w-3.5 h-3.5" />
            ) : isOwned ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            <span>{stateLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => previewPart(part)}
            className={`flex-1 min-w-[96px] py-2.5 min-h-[44px] rounded-2xl font-serif font-bold text-[11px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 border ${
              isPreviewed
                ? 'bg-cyan-900/60 text-cyan-200 border-cyan-600'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:text-amber-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{isPreviewed ? 'Previewing' : 'Preview'}</span>
          </button>

          {isOwned ? (
            <button
              onClick={() => handleEquip(part)}
              disabled={isEquipped}
              className={`flex-1 min-w-[96px] py-2.5 min-h-[44px] rounded-2xl font-serif font-black text-[11px] uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                isEquipped
                  ? 'bg-green-800 text-green-200 cursor-default'
                  : 'bg-amber-600 hover:bg-amber-500 text-neutral-950 cursor-pointer'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>{isEquipped ? 'Equipped' : 'Equip'}</span>
            </button>
          ) : (
            <button
              onClick={() => handleBuy(part)}
              disabled={!purchase.ok}
              title={purchase.ok ? `Buy for ${part.price} gold` : describeChariotRejection(purchase.reason)}
              className={`flex-1 min-w-[96px] py-2.5 min-h-[44px] rounded-2xl font-serif font-black text-[11px] uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                purchase.ok
                  ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300 cursor-pointer'
                  : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{purchase.ok ? `Buy (${part.price})` : describeChariotRejection(purchase.reason)}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      {/* HEADER */}
      <div className="bg-neutral-900/80 border-2 border-cyan-500/60 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="font-serif font-black text-xl sm:text-2xl text-amber-100 uppercase mb-1">
            Chariot Workshop
          </h3>
          <p className="text-xs sm:text-sm text-neutral-300 font-serif">
            Fit and finish a racing chariot. Buy once, equip whenever you like.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-neutral-950 px-4 py-2 rounded-2xl border border-yellow-500/60 font-mono font-bold text-yellow-400 text-lg shadow-inner">
          <Coins className="w-5 h-5" />
          <span>{profile.gold}</span>
        </div>
      </div>

      {/* LIVE PREVIEW */}
      <div className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
            {isPreviewing ? 'Previewing (not equipped)' : 'Currently equipped'}
          </div>
          {isPreviewing && (
            <button
              onClick={resetPreview}
              className="px-3 py-1.5 rounded-xl bg-neutral-800 border border-amber-600/50 text-amber-200 font-serif font-bold text-[11px] uppercase tracking-wider active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset preview</span>
            </button>
          )}
        </div>

        <div className="w-full h-56 sm:h-72 rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950">
          <ChariotPreview wheelVariant={previewWheels} finish={previewFinish} />
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-neutral-400">
          <div>
            Wheels: <span className="text-amber-200">{previewedWheelPart?.name ?? 'Standard Wheel Set'}</span>
          </div>
          <div>
            Finish: <span className="text-amber-200">{previewedFinishPart?.name ?? 'Workshop Stock Finish'}</span>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 text-[11px] font-serif text-neutral-400 bg-neutral-950/60 border border-neutral-800 rounded-2xl p-3">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p>
            Drag the model to turn it. Parts are fit and cosmetic upgrades only — no racing gameplay consumes
            chariot stats yet, so nothing here changes combat. The reinforced rim measures 0.0175 units lower
            than the standard wheel at the same axle height, so its tyre sits that much deeper at the ground
            line; the wheel is deliberately left on its axle rather than raised to hide it.
          </p>
        </div>
      </div>

      {/* WHEELS */}
      <div>
        <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
          <Wrench className="w-5 h-5" />
          <span>Wheel Sets</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {chariotPartsBySlot('wheels').map(renderCard)}
        </div>
      </div>

      {/* FINISHES */}
      <div>
        <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
          <Eye className="w-5 h-5" />
          <span>Timber &amp; Hide Finishes</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {chariotPartsBySlot('finish').map(renderCard)}
        </div>
      </div>
    </div>
  );
};
