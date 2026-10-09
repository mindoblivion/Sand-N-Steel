import React, { useState } from 'react';
import { PlayerProfile, PlayerAppearance } from '../../types/game';
import { GladiatorPreview } from '../3d/GladiatorPreview';
import { sounds } from '../../audio/soundEffects';
import { DEFAULT_PLAYER_WEAPON, STARTING_SPARE_WEAPON } from '../../data/itemsDB';
import { Sparkles, Swords, Shield, Heart, Zap, Check, ArrowLeft } from 'lucide-react';

interface CharacterCreationProps {
  onComplete: (profile: PlayerProfile) => void;
  onCancel: () => void;
}

export const CharacterCreation: React.FC<CharacterCreationProps> = ({ onComplete, onCancel }) => {
  const [name, setName] = useState('Spartacus');
  const [characterModel, setCharacterModel] = useState<'roman_warrior' | 'procedural_gladiator'>('roman_warrior');
  const [skinColor, setSkinColor] = useState('#c68b59');
  const [tunicColor, setTunicColor] = useState('#854d0e');
  const [crestColor, setCrestColor] = useState('#dc2626');
  const [isLeftyMode, setIsLeftyMode] = useState(false);

  // 10 Starting Attribute Points
  const [pointsLeft, setPointsLeft] = useState(10);
  const [strength, setStrength] = useState(10);
  const [agility, setAgility] = useState(10);
  const [stamina, setStamina] = useState(10);
  const [defense, setDefense] = useState(4);

  const appearance: PlayerAppearance = {
    skinColor,
    hairColor: '#3e2723',
    tunicColor,
    crestColor,
    clothingStyle: 'roman_tunic',
    characterModel,
  };

  const handleStatChange = (stat: 'str' | 'agi' | 'sta' | 'def', delta: number) => {
    sounds.playClick();
    if (delta > 0 && pointsLeft <= 0) return;

    if (stat === 'str') {
      if (delta < 0 && strength <= 10) return;
      setStrength((prev) => prev + delta);
    } else if (stat === 'agi') {
      if (delta < 0 && agility <= 10) return;
      setAgility((prev) => prev + delta);
    } else if (stat === 'sta') {
      if (delta < 0 && stamina <= 10) return;
      setStamina((prev) => prev + delta);
    } else if (stat === 'def') {
      if (delta < 0 && defense <= 4) return;
      setDefense((prev) => prev + delta);
    }
    setPointsLeft((prev) => prev - delta);
  };

  const handleFinish = () => {
    sounds.playClick();
    const newProf: PlayerProfile = {
      name: name.trim() || 'Spartacus',
      title: 'The Sandborn Rebel',
      rank: 'Rookie',
      appearance,
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      unspentStatPoints: pointsLeft,
      baseStats: {
        strength,
        agility,
        stamina,
        defense,
      },
      gold: 100,
      fame: 0,
      currentTier: 1,
      tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
      defeatedOpponentIds: [],
      bossKills: 0,
      newGamePlus: 0,
      trainingSessionsLeft: 2,
      injury: null,
      equipped: {
        weapon: DEFAULT_PLAYER_WEAPON,
      },
      inventory: [DEFAULT_PLAYER_WEAPON, STARTING_SPARE_WEAPON], // includes spear
      fightsWon: 0,
      fightsLost: 0,
      peakCrowdHypeOverall: 0,
      isLeftyMode: isLeftyMode,
    };
    onComplete(newProf);
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-neutral-950 text-amber-100 flex flex-col p-4 sm:p-8 select-none overflow-y-auto">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-sm font-serif text-neutral-400 hover:text-amber-300 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Title</span>
        </button>
        <h2 className="font-serif font-black text-xl sm:text-2xl text-amber-300 uppercase tracking-wider">
          Gladiator Selection & Creation
        </h2>
        <div className="w-12"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto w-full my-auto">
        {/* 3D CHARACTER PREVIEW */}
        <div className="bg-neutral-900/80 border-2 border-amber-600/50 rounded-3xl p-4 flex flex-col items-center justify-center min-h-[360px] shadow-2xl relative overflow-hidden">
          <GladiatorPreview appearance={appearance} isLeftyMode={isLeftyMode} />
          <div className="absolute bottom-4 left-4 bg-neutral-950/80 border border-amber-500/40 px-3 py-1.5 rounded-xl text-xs font-mono text-amber-300">
            {characterModel === 'roman_warrior' ? 'Roman Warrior (Animated Rig)' : 'Custom Gladiator'} • {isLeftyMode ? 'Lefty Stance' : 'Righty Stance'}
          </div>
        </div>

        {/* CUSTOMIZATION & STAT POINTS */}
        <div className="flex flex-col gap-6 bg-neutral-900/60 border border-amber-700/40 rounded-3xl p-6 shadow-xl">
          {/* NAME INPUT */}
          <div>
            <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-2">
              Gladiator Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-amber-600/60 rounded-xl px-4 py-2.5 text-amber-100 font-serif font-bold text-sm focus:outline-none focus:border-amber-400"
              maxLength={20}
            />
          </div>

          {/* COMBAT STANCE / HANDEDNESS */}
          <div>
            <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-2">
              Combat Handedness (Stance)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsLeftyMode(false)}
                className={`py-2 px-3 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  !isLeftyMode
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-amber-600/50'
                }`}
              >
                ⚔️ Righty (Default)
              </button>
              <button
                type="button"
                onClick={() => setIsLeftyMode(true)}
                className={`py-2 px-3 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  isLeftyMode
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-amber-600/50'
                }`}
              >
                🗡️ Lefty Mode
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-2">
              Character Archetype
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCharacterModel('roman_warrior')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  characterModel === 'roman_warrior'
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-amber-600/50'
                }`}
              >
                ⚔️ Roman Warrior (Rigged GLB)
              </button>
              <button
                type="button"
                onClick={() => setCharacterModel('procedural_gladiator')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  characterModel === 'procedural_gladiator'
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-amber-600/50'
                }`}
              >
                🛡️ Centurion Gladiator
              </button>
            </div>
          </div>

          {/* SKILL POINT ALLOCATION */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-serif uppercase tracking-wider text-amber-300">
                Starting Skill Points
              </label>
              <span className="font-mono text-sm font-bold text-yellow-400 bg-amber-950/80 px-2.5 py-0.5 rounded border border-amber-700/60">
                {pointsLeft} Points Left
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {[
                { key: 'str', label: 'Strength (Damage)', val: strength, icon: Swords, color: 'text-red-400' },
                { key: 'agi', label: 'Agility (Speed & Dodge)', val: agility, icon: Zap, color: 'text-yellow-400' },
                { key: 'sta', label: 'Stamina (Endurance)', val: stamina, icon: Heart, color: 'text-green-400' },
                { key: 'def', label: 'Defense (Armor & Block)', val: defense, icon: Shield, color: 'text-blue-400' },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.key} className="flex justify-between items-center bg-neutral-950/80 p-2.5 rounded-xl border border-neutral-800">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${stat.color}`} />
                      <span className="text-xs font-serif font-bold text-neutral-200">{stat.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-amber-200 w-6 text-center">{stat.val}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStatChange(stat.key as 'str' | 'agi' | 'sta' | 'def', -1)}
                          className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-neutral-200 font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatChange(stat.key as 'str' | 'agi' | 'sta' | 'def', 1)}
                          disabled={pointsLeft <= 0}
                          className="w-7 h-7 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 border border-amber-400 text-neutral-950 font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CONFIRM BUTTON */}
          <button
            onClick={handleFinish}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.6)] border-2 border-amber-200 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            <Check className="w-5 h-5" />
            <span>Apply Points & Enter Metropolis [Town Gate]</span>
          </button>
        </div>
      </div>
    </div>
  );
};
