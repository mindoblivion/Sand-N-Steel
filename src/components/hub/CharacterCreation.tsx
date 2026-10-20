import React, { useState } from 'react';
import { PlayerProfile, PlayerAppearance } from '../../types/game';
import { GladiatorPreview } from '../3d/GladiatorPreview';
import { sounds } from '../../audio/soundEffects';
import { DEFAULT_PLAYER_WEAPON, STARTING_SPARE_WEAPON } from '../../data/itemsDB';
import { calculateTotalStats } from '../../services/storage';
import { Sparkles, Swords, Shield, Heart, Zap, Check, ArrowLeft, Settings, Activity } from 'lucide-react';
import { GoogleSignInButton } from '../ui/GoogleSignInButton';
interface CharacterCreationProps {
  onComplete: (profile: PlayerProfile) => void;
  onCancel: () => void;
  onGoogleSignIn?: () => void;
  isGoogleLoading?: boolean;
  /** C-8.70B §SET-1 — the creation screen's own way into the settings panel. */
  onOpenSettings?: () => void;
}

export const CharacterCreation: React.FC<CharacterCreationProps> = ({ onComplete, onCancel, onGoogleSignIn, isGoogleLoading, onOpenSettings }) => {
  const [name, setName] = useState('Spartacus');
  const [characterModel, setCharacterModel] = useState<'roman_warrior' | 'procedural_gladiator' | 'amazonian' | 'retiarius' | 'minotaur' | 'dimachaerus'>('roman_warrior');
  const [skinColor, setSkinColor] = useState('#c68b59');
  const [tunicColor, setTunicColor] = useState('#854d0e');
  const [crestColor, setCrestColor] = useState('#dc2626');
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

  /**
   * CL-2 — the profile exactly as `handleFinish` hands it to `onComplete`, built
   * from the screen's current state.  Nothing here is written anywhere: the
   * derived preview below runs `calculateTotalStats` on it, and the fighter is
   * created from the same object, so the two can never disagree.
   */
  const buildProfile = (): PlayerProfile => ({
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
    isLeftyMode: false,
  });

  /** CL-2 — the live derived numbers shown under the stat allocation. */
  const draftStats = calculateTotalStats(buildProfile());

  const handleFinish = () => {
    sounds.playClick();
    onComplete(buildProfile());
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-neutral-950 text-amber-100 flex flex-col p-4 sm:p-8 select-none overflow-y-auto">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={onCancel}
          className="flex min-h-[48px] items-center gap-2 text-sm font-serif text-neutral-400 hover:text-amber-300 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Title</span>
        </button>
        <h2 className="font-serif font-black text-xl sm:text-2xl text-amber-300 uppercase tracking-wider">
          Gladiator Selection & Creation
        </h2>
        <div className="flex items-center gap-2">
          {/* C-8.70B §SET-1 — gear + label, at the same ≥48dp standard as every
              other entry point, beside the account button. */}
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                onOpenSettings();
              }}
              className="min-h-[48px] px-3 rounded-xl bg-neutral-900 border border-amber-600/50 text-amber-300 hover:text-amber-100 cursor-pointer flex items-center gap-2 font-serif font-bold text-xs uppercase tracking-wider"
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button>
          )}
          {onGoogleSignIn && (
            <GoogleSignInButton
              onClick={onGoogleSignIn}
              isLoading={isGoogleLoading}
              compact
            />
          )}
        </div>
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto w-full my-auto">
        {/* 3D CHARACTER PREVIEW */}
        <div className="bg-neutral-900/80 border-2 border-amber-600/50 rounded-3xl p-4 flex flex-col items-center justify-center min-h-[360px] shadow-2xl relative overflow-hidden">
          <GladiatorPreview appearance={appearance} />
          <div className="absolute bottom-4 left-4 bg-neutral-950/80 border border-amber-500/40 px-3 py-1.5 rounded-xl text-xs font-mono text-amber-300">
            {characterModel === 'roman_warrior' ? 'Roman Warrior (Animated Rig)' : characterModel === 'amazonian' ? 'Amazonian Warrior (Animated Rig)' : characterModel === 'retiarius' ? 'The Retiarius (Animated Rig)' : characterModel === 'minotaur' ? 'Minotaur (Animated Rig)' : characterModel === 'dimachaerus' ? 'Dimachaerus (Animated Rig)' : 'Centurion (Animated Rig)'}
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

          {/* CL-2 — the model pick is a LOOK, not a class.  This screen has no
              armatura / class selection at all (the fighting style is earned in the
              ludus later), so the label says so in one line rather than implying a
              class choice. */}
          <div>
            <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-2">
              Fighter's Look
            </label>
            <p className="text-[11px] font-serif text-neutral-400 leading-relaxed mb-2">
              Your look only — every fighter starts equal. Your fighting style comes from your class, earned in the ludus.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCharacterModel('roman_warrior')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  characterModel === 'roman_warrior'
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-amber-600/50'
                }`}
              >
                ⚔️ Roman Warrior
              </button>
              <button
                type="button"
                onClick={() => setCharacterModel('amazonian')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  characterModel === 'amazonian'
                    ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-emerald-600/50'
                }`}
              >
                🏹 Amazonian
              </button>
              <button
                type="button"
                onClick={() => setCharacterModel('procedural_gladiator')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  characterModel === 'procedural_gladiator'
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-amber-600/50'
                }`}
              >
                🛡️ Centurion
              </button>
              <button
                type="button"
                onClick={() => setCharacterModel('retiarius')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  characterModel === 'retiarius'
                    ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-cyan-600/50'
                }`}
              >
                🔱 The Retiarius
              </button>
              <button
                type="button"
                onClick={() => setCharacterModel('minotaur')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  characterModel === 'minotaur'
                    ? 'bg-orange-500/30 border-orange-400 text-orange-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-orange-600/50'
                }`}
              >
                🐂 Minotaur
              </button>
              <button
                type="button"
                onClick={() => setCharacterModel('dimachaerus')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  characterModel === 'dimachaerus'
                    ? 'bg-purple-500/30 border-purple-400 text-purple-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-purple-600/50'
                }`}
              >
                ⚔️ Dimachaerus
              </button>
            </div>
          </div>

          {/* SKILL POINT ALLOCATION */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-serif uppercase tracking-wider text-amber-300">
                Stat Points
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
                // UI-1 (B-4) — the stepper's own floor, so the − control is really
                // disabled at the value `handleStatChange` already refuses to cross.
                const statFloor = stat.key === 'def' ? 4 : 10;
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
                          disabled={stat.val <= statFloor}
                          aria-label={`Reduce ${stat.label}`}
                          className="shrink-0 w-12 h-12 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:border-neutral-800 disabled:text-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed border border-neutral-600 text-neutral-200 font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatChange(stat.key as 'str' | 'agi' | 'sta' | 'def', 1)}
                          disabled={pointsLeft <= 0}
                          aria-label={`Raise ${stat.label}`}
                          className="shrink-0 w-12 h-12 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 border border-amber-400 text-neutral-950 font-bold cursor-pointer"
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

          {/* CL-2 — the live derived preview: the same `calculateTotalStats` the camp's
              own Gladiator Stats screen reads, run on the profile as it stands right now.
              Read-only — no formula, pool or floor is touched. */}
          <div
            data-derived-preview="1"
            className="rounded-xl border border-amber-700/50 bg-neutral-950/70 px-3 py-2.5"
          >
            <div className="flex items-center gap-2 font-mono text-sm font-bold text-amber-200">
              <Activity className="w-4 h-4 text-amber-400" />
              <span>
                Health {draftStats.healthMax} · Stamina {draftStats.staminaMax}
              </span>
            </div>
            <p className="text-[11px] font-serif text-neutral-400 mt-1">
              Points also come from victories and the Training Yard.
            </p>
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
