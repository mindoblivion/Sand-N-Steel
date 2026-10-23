import React, { useState } from 'react';
import { PlayerProfile, PlayerAppearance, ArmaturaId, CharacterModelType } from '../../types/game';
import { GladiatorPreview } from '../3d/GladiatorPreview';
import { sounds } from '../../audio/soundEffects';
import { ARMATURAE } from '../../data/armaturae';
import { calculateTotalStats } from '../../services/storage';
import {
  CREATION_POINTS,
  DEFAULT_SELECTION,
  NO_ALLOCATION,
  armaturaKit,
  buildCreatedProfile,
  selectArmatura,
  selectCharacterModel,
  unspentPoints,
  type AllocationStat,
  type CreationAllocation,
  type CreationSelection,
} from '../../utils/characterCreation';
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
  /**
   * CH-2 — the class is chosen here and the LOOK is chosen beside it; the two are
   * independent.  `selectArmatura` / `selectCharacterModel` are the only two
   * writers, so a class can only ever *suggest* its natural model (while the player
   * has not picked one) and a look can never change the class.
   */
  const [selection, setSelection] = useState<CreationSelection>(DEFAULT_SELECTION);
  const [skinColor] = useState('#c68b59');
  const [tunicColor] = useState('#854d0e');
  const [crestColor] = useState('#dc2626');
  /**
   * CH-2 — the ten creation points, held as points SPENT per attribute.  The
   * absolute value on screen is the class template plus this, so the per-stat floor
   * IS the template and the pool is the same ten points it has always been.
   */
  const [allocation, setAllocation] = useState<CreationAllocation>(NO_ALLOCATION);

  const armatura = ARMATURAE.find((row) => row.id === selection.armatura) ?? ARMATURAE[0];
  const pointsLeft = unspentPoints(allocation);

  const appearance: PlayerAppearance = {
    skinColor,
    hairColor: '#3e2723',
    tunicColor,
    crestColor,
    clothingStyle: 'roman_tunic',
    characterModel: selection.characterModel,
  };

  const handleArmaturaSelect = (id: ArmaturaId) => {
    sounds.playClick();
    setSelection((current) => selectArmatura(current, id));
  };

  const handleModelSelect = (model: CharacterModelType) => {
    sounds.playClick();
    setSelection((current) => selectCharacterModel(current, model));
  };

  const handleStatChange = (stat: AllocationStat, delta: number) => {
    sounds.playClick();
    if (delta > 0 && pointsLeft <= 0) return;
    const next = allocation[stat] + delta;
    // The floor is the class template: never below zero points spent.
    if (next < 0) return;
    setAllocation((current) => ({ ...current, [stat]: next }));
  };

  /**
   * CL-2 / CH-2 — the profile exactly as `handleFinish` hands it to `onComplete`,
   * built from the screen's current state by the pure creation module.  Nothing
   * here is written anywhere: the derived preview below runs `calculateTotalStats`
   * on it, so the two can never disagree.
   */
  const buildProfile = (): PlayerProfile =>
    buildCreatedProfile({ name, appearance, armatura: selection.armatura, allocation });

  /** CL-2 — the live derived numbers shown under the stat allocation. */
  const draftStats = calculateTotalStats(buildProfile());

  const handleFinish = () => {
    sounds.playClick();
    onComplete(buildProfile());
  };

  // CH-2 — each row's floor is the class template's own value, so the − control is
  // really disabled at the value `handleStatChange` already refuses to cross.
  const statRows = [
    { key: 'strength' as AllocationStat, label: 'Strength (Damage)', val: armatura.stats.strength + allocation.strength, statFloor: armatura.stats.strength, icon: Swords, color: 'text-red-400' },
    { key: 'agility' as AllocationStat, label: 'Agility (Speed & Dodge)', val: armatura.stats.agility + allocation.agility, statFloor: armatura.stats.agility, icon: Zap, color: 'text-yellow-400' },
    { key: 'stamina' as AllocationStat, label: 'Stamina (Endurance)', val: armatura.stats.stamina + allocation.stamina, statFloor: armatura.stats.stamina, icon: Heart, color: 'text-green-400' },
    { key: 'defense' as AllocationStat, label: 'Defense (Armor & Block)', val: armatura.stats.defense + allocation.defense, statFloor: armatura.stats.defense, icon: Shield, color: 'text-blue-400' },
  ];

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
            {selection.characterModel === 'roman_warrior' ? 'Roman Warrior (Animated Rig)' : selection.characterModel === 'amazonian' ? 'Amazonian Warrior (Animated Rig)' : selection.characterModel === 'retiarius' ? 'The Retiarius (Animated Rig)' : selection.characterModel === 'minotaur' ? 'Minotaur (Animated Rig)' : selection.characterModel === 'dimachaerus' ? 'Dimachaerus (Animated Rig)' : 'Centurion (Animated Rig)'}
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

          {/* CH-2 — THE ARMATURA PICKER.  Seven cards rendered from `data/armaturae.ts`
              (never a copy of the data): name, fantasy, stat template, doctrina and kit.
              Choosing one sets the allocation's starting stats to its template. */}
          <div>
            <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-2">
              Armatura — Your Class
            </label>
            <p className="text-[11px] font-serif text-neutral-400 leading-relaxed mb-2">
              Your class sets your starting attributes, your signature technique and the weapon you enter with.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-armatura-picker>
              {ARMATURAE.map((row) => {
                const selected = row.id === armatura.id;
                const kit = armaturaKit(row);
                const kitLine = [kit.weapon.name, ...kit.inventory.slice(1).map((item) => item.name)].join(' · ');
                return (
                  <button
                    key={row.id}
                    type="button"
                    data-armatura-card={row.id}
                    aria-pressed={selected}
                    onClick={() => handleArmaturaSelect(row.id)}
                    className={`min-h-[48px] text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      selected
                        ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-md'
                        : 'bg-neutral-950 border-neutral-700 text-neutral-300 hover:border-amber-600/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-serif font-bold text-sm text-amber-200">{row.name}</span>
                      {selected && <Check className="w-4 h-4 text-amber-300 shrink-0" />}
                    </div>
                    <p className="text-[11px] font-serif italic text-neutral-400 mt-0.5">{row.fantasy}</p>
                    <p className="text-[10px] font-mono text-amber-400/80 mt-1">
                      STR {row.stats.strength} · AGI {row.stats.agility} · STA {row.stats.stamina} · DEF {row.stats.defense}
                    </p>
                    <p className="text-[10px] font-serif text-neutral-300 mt-1">
                      <span className="font-bold text-amber-200/90">{row.doctrina.name}:</span> {row.doctrina.text}
                    </p>
                    <p className="text-[10px] font-mono text-neutral-500 mt-1">Kit: {kitLine}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CH-2 — the model pick is a LOOK only.  It never changes the class, and
              the class never overrides a look the player has chosen. */}
          <div>
            <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-2">
              Fighter's Look
            </label>
            <p className="text-[11px] font-serif text-neutral-400 leading-relaxed mb-2">
              Your look only — it never changes your class. Your class is chosen above.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleModelSelect('roman_warrior')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  selection.characterModel === 'roman_warrior'
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-amber-600/50'
                }`}
              >
                ⚔️ Roman Warrior
              </button>
              <button
                type="button"
                onClick={() => handleModelSelect('amazonian')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  selection.characterModel === 'amazonian'
                    ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-emerald-600/50'
                }`}
              >
                🏹 Amazonian
              </button>
              <button
                type="button"
                onClick={() => handleModelSelect('procedural_gladiator')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  selection.characterModel === 'procedural_gladiator'
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-amber-600/50'
                }`}
              >
                🛡️ Centurion
              </button>
              <button
                type="button"
                onClick={() => handleModelSelect('retiarius')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  selection.characterModel === 'retiarius'
                    ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-cyan-600/50'
                }`}
              >
                🔱 The Retiarius
              </button>
              <button
                type="button"
                onClick={() => handleModelSelect('minotaur')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  selection.characterModel === 'minotaur'
                    ? 'bg-orange-500/30 border-orange-400 text-orange-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-orange-600/50'
                }`}
              >
                🐂 Minotaur
              </button>
              <button
                type="button"
                onClick={() => handleModelSelect('dimachaerus')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all ${
                  selection.characterModel === 'dimachaerus'
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
              {statRows.map((stat) => {
                const Icon = stat.icon;
                const { statFloor } = stat;
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
                          onClick={() => handleStatChange(stat.key, -1)}
                          disabled={stat.val <= statFloor}
                          aria-label={`Reduce ${stat.label}`}
                          className="shrink-0 w-12 h-12 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:border-neutral-800 disabled:text-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed border border-neutral-600 text-neutral-200 font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatChange(stat.key, 1)}
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
            <p className="text-[10px] font-mono text-neutral-500 mt-2">
              {CREATION_POINTS} points to spend · your class template is the floor.
            </p>
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
