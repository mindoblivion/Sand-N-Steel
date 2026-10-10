import React from 'react';
import { PlayerProfile, WeaponItem, ArmorItem } from '../../types/game';
import { Layers, Shield, Swords, Check } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';

interface GearTabProps {
  profile: PlayerProfile;
  onEquipWeapon: (wpn: WeaponItem) => void;
  onEquipArmor: (armor: ArmorItem) => void;
}

export const GearTab: React.FC<GearTabProps> = ({ profile, onEquipWeapon, onEquipArmor }) => {
  const currentWeapon = profile.equipped.weapon;
  const currentHelm = profile.equipped.helm;
  const currentChest = profile.equipped.chest;

  const inventoryWeapons = profile.inventory.filter((i): i is WeaponItem => 'damageLight' in i);
  const inventoryArmors = profile.inventory.filter((i): i is ArmorItem => 'defense' in i);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      <div className="bg-neutral-900/80 border-2 border-cyan-500/60 rounded-3xl p-6 shadow-xl">
        <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mb-1">
          Gladiator Loadout & Armory
        </h3>
        <p className="text-sm text-neutral-300 font-serif">Equip owned weapons, helmets, and cuirasses.</p>
      </div>

      {/* CURRENTLY EQUIPPED WEAPON */}
      <div className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg">
        <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
          <Swords className="w-5 h-5 text-amber-400" />
          <span>Equipped Weapon: <strong className="text-yellow-300">{currentWeapon?.name}</strong></span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {inventoryWeapons.map((wpn) => {
            const isEquipped = currentWeapon?.id === wpn.id;
            return (
              <div
                key={wpn.id}
                className={`p-4 rounded-2xl border transition-all flex justify-between items-center ${
                  isEquipped ? 'bg-amber-950/60 border-amber-400' : 'bg-neutral-950/80 border-neutral-800'
                }`}
              >
                <div>
                  <div className="font-serif font-bold text-sm text-amber-100">{wpn.name}</div>
                  <div className="text-xs font-mono text-neutral-400">
                    Dmg: {wpn.damageLight}/{wpn.damageHeavy} • Range: {wpn.range}m
                  </div>
                </div>
                <button
                  onClick={() => {
                    sounds.playClick();
                    onEquipWeapon(wpn);
                  }}
                  disabled={isEquipped}
                  className={`px-4 py-2 rounded-xl text-xs font-serif font-bold cursor-pointer transition-all ${
                    isEquipped
                      ? 'bg-green-800 text-green-200 cursor-default'
                      : 'bg-amber-600 hover:bg-amber-500 text-neutral-950 active:scale-95'
                  }`}
                >
                  {isEquipped ? 'Equipped' : 'Equip'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* CURRENTLY EQUIPPED & OWNED ARMOR */}
      <div className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg">
        <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5 text-amber-400" />
          <span>Equipped Armor</span>
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="text-[10px] uppercase font-mono text-neutral-400">Helm</div>
            <div className="text-xs font-bold text-amber-200 truncate">{profile.equipped.helm?.name || 'None'}</div>
          </div>
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="text-[10px] uppercase font-mono text-neutral-400">Chest</div>
            <div className="text-xs font-bold text-amber-200 truncate">{profile.equipped.chest?.name || 'None'}</div>
          </div>
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="text-[10px] uppercase font-mono text-neutral-400">Arms</div>
            <div className="text-xs font-bold text-amber-200 truncate">{profile.equipped.arms?.name || 'None'}</div>
          </div>
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="text-[10px] uppercase font-mono text-neutral-400">Legs</div>
            <div className="text-xs font-bold text-amber-200 truncate">{profile.equipped.legs?.name || 'None'}</div>
          </div>
        </div>

        <h5 className="font-serif font-bold text-sm text-neutral-300 mb-3 uppercase tracking-wider">
          Owned Armor Pieces
        </h5>
        {inventoryArmors.length === 0 ? (
          <p className="text-xs text-neutral-500 italic">No armor owned yet. Visit the Armorer in the Market.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inventoryArmors.map((arm) => {
              const isEquipped = profile.equipped[arm.slot]?.id === arm.id;
              return (
                <div
                  key={arm.id}
                  className={`p-4 rounded-2xl border transition-all flex justify-between items-center ${
                    isEquipped ? 'bg-amber-950/60 border-amber-400' : 'bg-neutral-950/80 border-neutral-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-sm text-amber-100">{arm.name}</span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-amber-400 border border-neutral-700">
                        {arm.slot}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-neutral-400 mt-0.5">
                      Def: +{arm.defense} {arm.healthBonus ? `• HP: +${arm.healthBonus}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      sounds.playClick();
                      onEquipArmor(arm);
                    }}
                    disabled={isEquipped}
                    className={`px-4 py-2 rounded-xl text-xs font-serif font-bold cursor-pointer transition-all ${
                      isEquipped
                        ? 'bg-green-800 text-green-200 cursor-default'
                        : 'bg-amber-600 hover:bg-amber-500 text-neutral-950 active:scale-95'
                    }`}
                  >
                    {isEquipped ? 'Equipped' : 'Equip'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
