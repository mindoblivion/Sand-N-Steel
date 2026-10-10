import React from 'react';
import { PlayerProfile } from '../../types/game';
import { calculateTotalStats } from '../../services/storage';
import { Swords, Shield, Heart, Zap, Flame, Activity } from 'lucide-react';

interface StatsTabProps {
  profile: PlayerProfile;
  onAllocatePoint: (stat: 'strength' | 'agility' | 'stamina' | 'defense') => void;
}

export const StatsTab: React.FC<StatsTabProps> = ({ profile, onAllocatePoint }) => {
  const total = calculateTotalStats(profile);
  const totalStamina = total.stamina ?? profile.baseStats.stamina;

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full pb-12">
      <div className="bg-neutral-900/80 border-2 border-purple-500/60 rounded-3xl p-6 shadow-xl flex justify-between items-center">
        <div>
          <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mb-1">
            {profile.name}
          </h3>
          <div className="text-xs font-serif text-purple-300 italic">{profile.title}</div>
        </div>
        <div className="text-right">
          <div className="font-serif font-bold text-sm text-amber-300">Level {profile.level}</div>
          <div className="text-[11px] font-mono text-neutral-400">
            XP: {profile.xp} / {profile.xpToNextLevel}
          </div>
        </div>
      </div>

      {/* UNSPENT POINTS BANNER */}
      {profile.unspentStatPoints > 0 && (
        <div className="bg-amber-500/20 border border-amber-400 p-4 rounded-2xl flex justify-between items-center animate-pulse">
          <span className="font-serif font-bold text-sm text-amber-200">
            You have {profile.unspentStatPoints} unspent stat point(s)!
          </span>
        </div>
      )}

      {/* PRIMARY ATTRIBUTES */}
      <div>
        <h4 className="font-serif font-bold text-sm text-amber-300 mb-3 uppercase tracking-wider">
          Primary Attributes
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'strength', name: 'Strength', val: total.strength, base: profile.baseStats.strength, icon: Swords, color: 'text-red-400', desc: 'Increases light & heavy attack damage.' },
            { key: 'agility', name: 'Agility', val: total.agility, base: profile.baseStats.agility, icon: Zap, color: 'text-yellow-400', desc: 'Movement speed & hit probability.' },
            { key: 'stamina', name: 'Stamina', val: totalStamina, base: profile.baseStats.stamina, icon: Heart, color: 'text-green-400', desc: 'Max energy pool & recovery rate.' },
            { key: 'defense', name: 'Defense', val: total.defense, base: profile.baseStats.defense, icon: Shield, color: 'text-blue-400', desc: 'Damage reduction & block resistance.' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="p-5 rounded-3xl bg-neutral-900/80 border border-amber-700/40 shadow-lg flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${item.color}`} />
                    <span className="font-serif font-bold text-base text-amber-100">{item.name}</span>
                  </div>
                  <p className="text-xs text-neutral-400">{item.desc}</p>
                  <div className="text-[11px] font-mono text-amber-400/70 mt-1">Base: {item.base}</div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono font-black text-xl text-yellow-300">{item.val}</span>
                  {profile.unspentStatPoints > 0 && (
                    <button
                      onClick={() => onAllocatePoint(item.key as 'strength' | 'agility' | 'stamina' | 'defense')}
                      className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-lg flex items-center justify-center cursor-pointer shadow-md"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DERIVED COMBAT STATISTICS */}
      <div className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg">
        <h4 className="font-serif font-bold text-sm text-amber-300 mb-4 uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <span>Derived Combat Statistics</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-4 h-4 text-red-400" />
              <span className="font-serif font-bold text-xs text-amber-100">Max Health</span>
            </div>
            <div className="font-mono font-black text-2xl text-red-400 mt-1">
              {total.healthMax} <span className="text-xs font-normal text-neutral-400">HP</span>
            </div>
            <div className="text-[10px] font-mono text-neutral-500 mt-2">
              Formula: 80 + Str×4 + Def×3
            </div>
          </div>

          <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-green-400" />
              <span className="font-serif font-bold text-xs text-amber-100">Max Stamina</span>
            </div>
            <div className="font-mono font-black text-2xl text-green-400 mt-1">
              {total.staminaMax} <span className="text-xs font-normal text-neutral-400">SP</span>
            </div>
            <div className="text-[10px] font-mono text-neutral-500 mt-2">
              Formula: 70 + Sta×5
            </div>
          </div>

          <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="w-4 h-4 text-yellow-400" />
              <span className="font-serif font-bold text-xs text-amber-100">Stamina Recovery</span>
            </div>
            <div className="font-mono font-black text-2xl text-yellow-400 mt-1">
              {total.staminaRegen.toFixed(1)} <span className="text-xs font-normal text-neutral-400">SP/s</span>
            </div>
            <div className="text-[10px] font-mono text-neutral-500 mt-2">
              Formula: 12 + Agi×0.8 + Sta×0.4
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
