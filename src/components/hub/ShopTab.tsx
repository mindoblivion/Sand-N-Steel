import React from 'react';
import { PlayerProfile, WeaponItem, ArmorItem } from '../../types/game';
import { ALL_WEAPONS, ALL_ARMORS } from '../../data/weapons';
import { ShoppingCart, Coins, Shield, Swords, Check } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';

interface ShopTabProps {
  profile: PlayerProfile;
  onBuyItem: (item: WeaponItem | ArmorItem) => void;
}

export const ShopTab: React.FC<ShopTabProps> = ({ profile, onBuyItem }) => {
  const ownedItemIds = new Set([
    profile.equipped.weapon?.id,
    profile.equipped.helm?.id,
    profile.equipped.chest?.id,
    profile.equipped.arms?.id,
    profile.equipped.legs?.id,
    ...profile.inventory.map((i) => i.id),
  ]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      <div className="bg-neutral-900/80 border-2 border-yellow-500/60 rounded-3xl p-6 shadow-xl flex justify-between items-center">
        <div>
          <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mb-1">
            Imperial Smithing Forge & Bazaar
          </h3>
          <p className="text-sm text-neutral-300 font-serif">Purchase weapons, shields, and gladiator armor.</p>
        </div>
        <div className="flex items-center gap-2 bg-neutral-950 px-4 py-2 rounded-2xl border border-yellow-500/60 font-mono font-bold text-yellow-400 text-lg shadow-inner">
          <Coins className="w-5 h-5" />
          <span>{profile.gold}</span>
        </div>
      </div>

      {/* WEAPONS */}
      <div>
        <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
          <Swords className="w-5 h-5" />
          <span>Weapons & Armaments</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ALL_WEAPONS.map((wpn) => {
            const isOwned = ownedItemIds.has(wpn.id);
            const canAfford = profile.gold >= wpn.price;

            return (
              <div
                key={wpn.id}
                className="p-5 rounded-3xl bg-neutral-900/80 border border-amber-700/40 hover:border-amber-500/80 transition-all flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h5 className="font-serif font-bold text-base text-amber-100">{wpn.name}</h5>
                    <span className="font-mono text-xs font-bold text-yellow-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-700">
                      {wpn.price} Gold
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mb-3">{wpn.description}</p>
                  <div className="text-xs font-mono text-neutral-300 flex items-center gap-3 mb-4">
                    <span>Light: <strong className="text-red-400">{wpn.damageLight}</strong></span>
                    <span>Heavy: <strong className="text-red-400">{wpn.damageHeavy}</strong></span>
                    <span>Range: <strong className="text-cyan-400">{wpn.range}m</strong></span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    sounds.playCoin();
                    onBuyItem(wpn);
                  }}
                  disabled={isOwned || !canAfford}
                  className={`w-full py-3 rounded-2xl font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-2 ${
                    isOwned
                      ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                      : canAfford
                      ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300'
                      : 'bg-neutral-900 text-neutral-600 border border-neutral-800 opacity-50'
                  }`}
                >
                  {isOwned ? (
                    <>
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Owned</span>
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      <span>Buy Weapon ({wpn.price} Gold)</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ARMOR */}
      <div>
        <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          <span>Armor & Helmets</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ALL_ARMORS.map((arm) => {
            const isOwned = ownedItemIds.has(arm.id);
            const canAfford = profile.gold >= arm.price;

            return (
              <div
                key={arm.id}
                className="p-5 rounded-3xl bg-neutral-900/80 border border-amber-700/40 hover:border-amber-500/80 transition-all flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h5 className="font-serif font-bold text-base text-amber-100">{arm.name}</h5>
                    <span className="font-mono text-xs font-bold text-yellow-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-700">
                      {arm.price} Gold
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mb-3">{arm.description}</p>
                  <div className="text-xs font-mono text-neutral-300 flex items-center gap-3 mb-4">
                    <span>Defense: <strong className="text-blue-400">+{arm.defense}</strong></span>
                    {arm.healthBonus && <span>HP: <strong className="text-green-400">+{arm.healthBonus}</strong></span>}
                  </div>
                </div>

                <button
                  onClick={() => {
                    sounds.playCoin();
                    onBuyItem(arm);
                  }}
                  disabled={isOwned || !canAfford}
                  className={`w-full py-3 rounded-2xl font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-2 ${
                    isOwned
                      ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                      : canAfford
                      ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300'
                      : 'bg-neutral-900 text-neutral-600 border border-neutral-800 opacity-50'
                  }`}
                >
                  {isOwned ? (
                    <>
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Owned</span>
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      <span>Buy Armor ({arm.price} Gold)</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
