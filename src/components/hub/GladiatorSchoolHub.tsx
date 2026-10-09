import React, { useState } from 'react';
import { PlayerProfile, OpponentConfig, WeaponItem, ArmorItem } from '../../types/game';
import { TournamentTab } from './TournamentTab';
import { TrainingTab } from './TrainingTab';
import { ShopTab } from './ShopTab';
import { GearTab } from './GearTab';
import { StatsTab } from './StatsTab';
import { PreFightModal } from './PreFightModal';
import { HelpModal } from './HelpModal';
import { Swords, Dumbbell, ShoppingCart, Layers, BarChart2, Compass, Volume2, VolumeX, HelpCircle, RotateCcw, Cloud, Settings } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';

interface GladiatorSchoolHubProps {
  playerProfile: PlayerProfile;
  activeTab: 'tournament' | 'training' | 'shop' | 'gear' | 'stats';
  onTabChange: (tab: 'tournament' | 'training' | 'shop' | 'gear' | 'stats') => void;
  onEnterCity3D: () => void;
  onSelectOpponent: (opp: OpponentConfig) => void;
  onTrainStat: (stat: 'strength' | 'agility' | 'stamina' | 'defense') => void;
  onBuyItem: (item: WeaponItem | ArmorItem) => void;
  onEquipWeapon: (wpn: WeaponItem) => void;
  onEquipArmor: (armor: ArmorItem) => void;
  onAllocateStatPoint: (stat: 'strength' | 'agility' | 'stamina' | 'defense') => void;
  onOpenDriveSync: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onResetGame: () => void;
  onOpenSettings?: () => void;
}

export const GladiatorSchoolHub: React.FC<GladiatorSchoolHubProps> = ({
  playerProfile,
  activeTab,
  onTabChange,
  onEnterCity3D,
  onSelectOpponent,
  onTrainStat,
  onBuyItem,
  onEquipWeapon,
  onEquipArmor,
  onAllocateStatPoint,
  onOpenDriveSync,
  onToggleMute,
  isMuted,
  onResetGame,
  onOpenSettings,
}) => {
  const [selectedOpponent, setSelectedOpponent] = useState<OpponentConfig | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="relative w-full h-full min-h-screen bg-neutral-950 text-amber-100 flex flex-col select-none overflow-y-auto">
      {/* TOP HEADER BAR */}
      <header className="w-full bg-neutral-900/90 border-b border-amber-600/50 p-3 sm:p-4 backdrop-blur-md sticky top-0 z-30 flex justify-between items-center shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-yellow-600 border border-amber-300 flex items-center justify-center shadow-md">
            <Swords className="w-5 h-5 text-neutral-950" />
          </div>
          <div>
            <h1 className="font-serif font-black text-sm sm:text-base text-amber-100 uppercase tracking-wider">
              {playerProfile.name}
            </h1>
            <div className="text-[10px] text-amber-400 font-mono">
              LVL {playerProfile.level} • {playerProfile.gold} Gold • {playerProfile.fame} Fame
            </div>
          </div>
        </div>

        {/* 3D CITY BUTTON & UTILITIES */}
        <div className="flex items-center gap-2">
          <button
            onClick={onEnterCity3D}
            className="px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-serif font-bold text-xs uppercase tracking-wider shadow-lg active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Compass className="w-4 h-4" />
            <span>3D Metropolis</span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-neutral-800 border border-amber-500/40 text-amber-300 hover:text-amber-100 cursor-pointer"
              title="Game Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenDriveSync}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:text-cyan-100 cursor-pointer"
            title="Google Drive Cloud Saves"
          >
            <Cloud className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-amber-200 cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleMute}
            className="p-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-amber-200 cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          </button>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <nav className="w-full bg-neutral-900/50 border-b border-neutral-800 px-4 py-2.5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        {[
          { key: 'tournament', label: 'Colosseum', icon: Swords },
          { key: 'training', label: 'Training Yard', icon: Dumbbell },
          { key: 'shop', label: 'Bazaar & Forge', icon: ShoppingCart },
          { key: 'gear', label: 'Armory', icon: Layers },
          { key: 'stats', label: 'Gladiator Stats', icon: BarChart2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                sounds.playClick();
                onTabChange(tab.key as 'tournament' | 'training' | 'shop' | 'gear' | 'stats');
              }}
              className={`py-2 px-3 sm:px-4 rounded-xl font-serif font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-amber-500/20 border border-amber-400 text-amber-200 shadow-md'
                  : 'bg-neutral-900/80 border border-neutral-800 text-neutral-400 hover:text-amber-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* MAIN TAB CONTENT */}
      <main className="flex-1 p-4 sm:p-8">
        {activeTab === 'tournament' && (
          <TournamentTab profile={playerProfile} onSelectOpponent={(opp) => setSelectedOpponent(opp)} />
        )}
        {activeTab === 'training' && (
          <TrainingTab profile={playerProfile} onTrainStat={onTrainStat} />
        )}
        {activeTab === 'shop' && (
          <ShopTab profile={playerProfile} onBuyItem={onBuyItem} />
        )}
        {activeTab === 'gear' && (
          <GearTab
            profile={playerProfile}
            onEquipWeapon={onEquipWeapon}
            onEquipArmor={onEquipArmor}
          />
        )}
        {activeTab === 'stats' && (
          <StatsTab profile={playerProfile} onAllocatePoint={onAllocateStatPoint} />
        )}
      </main>

      {/* PRE-FIGHT MODAL */}
      {selectedOpponent && (
        <PreFightModal
          opponent={selectedOpponent}
          onConfirm={() => {
            const opp = selectedOpponent;
            setSelectedOpponent(null);
            onSelectOpponent(opp);
          }}
          onCancel={() => setSelectedOpponent(null)}
        />
      )}

      {/* HELP MODAL */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
};
