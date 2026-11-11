import React, { useState } from 'react';
import { PlayerProfile, PlayerAppearance, ArmaturaId, CharacterModelType } from '../../types/game';
import { GladiatorPreview } from '../3d/GladiatorPreview';
import { sounds } from '../../audio/soundEffects';
import { ARMATURAE } from '../../data/armaturae';
import { calculateTotalStats } from '../../services/storage';
import {
  DEFAULT_CORPUS,
  DEFAULT_SELECTION,
  NO_ALLOCATION,
  armaturaKit,
  buildCreatedProfile,
  buildStatDelta,
  creationPoints,
  selectArmatura,
  selectCharacterModel,
  unspentPoints,
  type AllocationStat,
  type CreationAllocation,
  type CreationCorpus,
  type CreationSelection,
} from '../../utils/characterCreation';
import {
  BUILDS,
  PROVINCES,
  VITIA,
  VITIUM_CREATION_POINTS,
} from '../../data/corpusEtOrigo';
import type { BuildId, ProvinceId, VitiumId } from '../../types/game';
import { Sparkles, Swords, Shield, Heart, Zap, Check, ArrowLeft, Settings, Activity, User } from 'lucide-react';
import { GoogleSignInButton } from '../ui/GoogleSignInButton';

const SKIN_TONES = [
  { id: 'fair', label: 'Fair', color: '#f1d0b5' },
  { id: 'light-olive', label: 'Light olive', color: '#dfb58d' },
  { id: 'bronze', label: 'Bronze', color: '#c68b59' },
  { id: 'warm-brown', label: 'Warm brown', color: '#a87550' },
  { id: 'deep-brown', label: 'Deep brown', color: '#805338' },
  { id: 'dark-umber', label: 'Dark umber', color: '#593b2b' },
] as const;

interface CharacterCreationProps {
  onComplete: (profile: PlayerProfile) => void;
  onCancel: () => void;
  onGoogleSignIn?: () => void;
  isGoogleLoading?: boolean;
  authError?: string | null;
  /** C-8.70B §SET-1 — the creation screen's own way into the settings panel. */
  onOpenSettings?: () => void;
  /** Called only after the preview's 3D model has finished loading. */
  onReady?: () => void;
  onPreviewError?: (error: Error) => void;
}

export const CharacterCreation: React.FC<CharacterCreationProps> = ({
  onComplete,
  onCancel,
  onGoogleSignIn,
  isGoogleLoading,
  authError,
  onOpenSettings,
  onReady,
  onPreviewError,
}) => {
  const [activeTab, setActiveTab] = useState<'identity' | 'body' | 'features'>('identity');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [name, setName] = useState('Spartacus');
  const [bodyWeightLb, setBodyWeightLb] = useState(180);
  /**
   * CH-2 — the class is chosen here and the LOOK is chosen beside it; the two are
   * independent. `selectArmatura` / `selectCharacterModel` are the only two
   * writers, so a class can only ever *suggest* its natural model (while the player
   * has not picked one) and a look can never change the class.
   */
  const [selection, setSelection] = useState<CreationSelection>(DEFAULT_SELECTION);
  const [skinColor, setSkinColor] = useState('#c68b59');
  const [tunicColor] = useState('#854d0e');
  const [crestColor] = useState('#dc2626');
  /**
   * CH-2 — the ten creation points, held as points SPENT per attribute. The
   * absolute value on screen is the class template plus this, so the per-stat floor
   * IS the template and the pool is the same ten points it has always been.
   */
  const [allocation, setAllocation] = useState<CreationAllocation>(NO_ALLOCATION);
  /**
   * PITCH A4 — Corpus et Origo: the build, the birth province and the flaw. The
   * defaults are Even + Italia + no flaw (all changeable), and a chosen flaw raises
   * the pool from ten points to twelve.
   */
  const [corpus, setCorpus] = useState<CreationCorpus>(DEFAULT_CORPUS);

  const armatura = ARMATURAE.find((row) => row.id === selection.armatura) ?? ARMATURAE[0];
  const pointsLeft = unspentPoints(allocation, corpus.vitium);
  /** The build's delta — applied before allocation, so it moves the stat floor. */
  const buildDelta = buildStatDelta(corpus.build);
  const selectedProvinceName = PROVINCES.find((row) => row.id === corpus.origo)?.name ?? 'None';
  const selectedVitiumName = VITIA.find((row) => row.id === corpus.vitium)?.name ?? 'No flaw';

  const appearance: PlayerAppearance = {
    bodyWeightLb,
    skinColor,
    hairColor: '#3e2723',
    tunicColor,
    crestColor,
    clothingStyle: 'roman_tunic',
    characterModel: selection.characterModel,
  };

  const handleArmaturaSelect = (id: ArmaturaId) => {
    sounds.playClick();
    setPreviewError(null);
    setSelection((current) => selectArmatura(current, id));
  };

  const handleModelSelect = (model: CharacterModelType) => {
    sounds.playClick();
    setPreviewError(null);
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
   * built from the screen's current state by the pure creation module.
   */
  const buildProfile = (): PlayerProfile =>
    buildCreatedProfile({
      name,
      appearance,
      armatura: selection.armatura,
      allocation,
      build: corpus.build,
      origo: corpus.origo,
      vitium: corpus.vitium,
    });

  /** Pitch A4 — the three pickers' writers. */
  const handleBuildSelect = (id: BuildId) => {
    sounds.playClick();
    setCorpus((current) => ({ ...current, build: id }));
  };

  const handleOrigoSelect = (id: ProvinceId) => {
    sounds.playClick();
    setCorpus((current) => ({ ...current, origo: id }));
  };

  const handleVitiumSelect = (id: VitiumId | null) => {
    sounds.playClick();
    setCorpus((current) => ({ ...current, vitium: id }));
  };

  /** CL-2 — the live derived numbers shown under the stat allocation. */
  const draftStats = calculateTotalStats(buildProfile());

  const handleFinish = () => {
    sounds.playClick();
    onComplete(buildProfile());
  };

  const strengthFloor = armatura.stats.strength + (buildDelta.str ?? 0);
  const agilityFloor = armatura.stats.agility + (buildDelta.agi ?? 0);
  const staminaFloor = armatura.stats.stamina + (buildDelta.sta ?? 0);
  const defenseFloor = armatura.stats.defense + (buildDelta.def ?? 0);

  const statRows = [
    { key: 'strength' as AllocationStat, label: 'Strength (Damage)', val: strengthFloor + allocation.strength, statFloor: strengthFloor, icon: Swords, color: 'text-red-400' },
    { key: 'agility' as AllocationStat, label: 'Agility (Speed & Dodge)', val: agilityFloor + allocation.agility, statFloor: agilityFloor, icon: Zap, color: 'text-yellow-400' },
    { key: 'stamina' as AllocationStat, label: 'Stamina (Endurance)', val: staminaFloor + allocation.stamina, statFloor: staminaFloor, icon: Heart, color: 'text-green-400' },
    { key: 'defense' as AllocationStat, label: 'Defense (Armor & Block)', val: defenseFloor + allocation.defense, statFloor: defenseFloor, icon: Shield, color: 'text-blue-400' },
  ];

  return (
    <div className="relative w-full h-[100dvh] min-h-0 bg-neutral-950 text-amber-100 flex flex-col p-2 sm:p-4 lg:p-6 select-none overflow-hidden pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* HEADER */}
      <div className="flex shrink-0 flex-wrap justify-between items-center gap-2 mb-2 sm:mb-3 px-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex min-h-[48px] items-center gap-2 text-xs sm:text-sm font-serif text-neutral-400 hover:text-amber-300 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Title</span>
        </button>
        <h2 className="font-serif font-black text-base sm:text-2xl text-amber-300 uppercase tracking-wider">
          Gladiator Creation
        </h2>
        <div className="flex items-center gap-2">
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
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}
          {authError && (
            <p role="alert" className="max-w-sm rounded-lg border border-red-500/50 bg-red-950/90 px-3 py-2 text-center text-xs text-red-100">
              {authError}
            </p>
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

      {/* MAIN CONTENT SPLIT AREA */}
      <div className="flex-1 min-h-0 w-full max-w-5xl mx-auto flex flex-col lg:grid lg:grid-cols-2 gap-2 sm:gap-4 lg:gap-8 overflow-hidden">
        {/* 3D CHARACTER PREVIEW (UPPER REGION ON MOBILE ~38-42dvh, BOUNDED) */}
        <div className="shrink-0 h-[38dvh] max-h-[320px] min-h-[190px] lg:h-full lg:max-h-none lg:min-h-[480px] bg-neutral-900/80 border-2 border-amber-600/50 rounded-2xl sm:rounded-3xl p-1.5 sm:p-3 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden">
          <GladiatorPreview
            appearance={appearance}
            onReady={onReady}
            onError={(error) => {
              setPreviewError(error.message || 'The selected gladiator model could not be loaded.');
              onPreviewError?.(error);
            }}
          />
          {previewError && (
            <div role="alert" className="absolute inset-x-3 top-3 z-10 rounded-xl border border-amber-500/60 bg-neutral-950/95 p-3 text-center text-xs text-amber-100 shadow-xl">
              <p className="font-bold text-amber-300">3D preview unavailable</p>
              <p className="mt-1">You can still customize and create your gladiator. Try changing the model or reopening this screen.</p>
            </div>
          )}
          <div className="absolute bottom-2.5 left-2.5 bg-neutral-950/85 border border-amber-500/40 px-2.5 py-1 rounded-xl text-[11px] font-mono text-amber-300 z-10 shadow-md">
            {selection.characterModel === "roman_warrior" ? "Roman Warrior" : selection.characterModel === "amazonian" ? "Amazonian" : selection.characterModel === "retiarius" ? "The Retiarius" : selection.characterModel === "minotaur" ? "Minotaur" : selection.characterModel === "dimachaerus" ? "Dimachaerus" : "Centurion"}
          </div>
        </div>

        {/* CUSTOMIZATION PANEL (LOWER REGION ON MOBILE, INDEPENDENTLY SCROLLABLE) */}
        <div className="flex-1 min-h-0 flex flex-col bg-neutral-900/70 border border-amber-700/40 rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden">
          {/* CATEGORY TABS BAR: IDENTITY | BODY | FEATURES */}
          <div data-creation-tabs="true" className="grid grid-cols-3 shrink-0 border-b border-amber-600/30 bg-neutral-950/90 p-1.5 gap-1">
            <button
              type="button"
              data-tab="identity"
              onClick={() => { sounds.playClick(); setActiveTab('identity'); }}
              aria-selected={activeTab === 'identity'}
              className={`min-h-[48px] px-1.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-serif font-bold uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
                activeTab === 'identity'
                  ? 'bg-amber-500/30 border border-amber-400 text-amber-200 shadow-md'
                  : 'text-neutral-400 hover:text-amber-300 hover:bg-neutral-900/60'
              }`}
            >
              <Swords className="w-4 h-4 shrink-0 text-amber-400" />
              <span className="truncate">Identity</span>
            </button>

            <button
              type="button"
              data-tab="body"
              onClick={() => { sounds.playClick(); setActiveTab('body'); }}
              aria-selected={activeTab === 'body'}
              className={`min-h-[48px] px-1.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-serif font-bold uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
                activeTab === 'body'
                  ? 'bg-amber-500/30 border border-amber-400 text-amber-200 shadow-md'
                  : 'text-neutral-400 hover:text-amber-300 hover:bg-neutral-900/60'
              }`}
            >
              <User className="w-4 h-4 shrink-0 text-amber-400" />
              <span className="truncate">Body</span>
            </button>

            <button
              type="button"
              data-tab="features"
              onClick={() => { sounds.playClick(); setActiveTab('features'); }}
              aria-selected={activeTab === 'features'}
              className={`min-h-[48px] px-1.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-serif font-bold uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
                activeTab === 'features'
                  ? 'bg-amber-500/30 border border-amber-400 text-amber-200 shadow-md'
                  : 'text-neutral-400 hover:text-amber-300 hover:bg-neutral-900/60'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
              <span className="truncate">Features</span>
            </button>
          </div>

          {/* INDEPENDENTLY SCROLLABLE TAB PANEL */}
          <div
            data-tab-panel={activeTab}
            className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y p-3 sm:p-5 space-y-4 sm:space-y-6 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] [scrollbar-gutter:stable]"
          >
            {/* SECTION 1: IDENTITY */}
            {activeTab === 'identity' && (
              <div className="flex flex-col gap-4 sm:gap-6">
                {/* NAME INPUT */}
                <div>
                  <label htmlFor="gladiator-name-input" className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-2">
                    Gladiator Name
                  </label>
                  <input
                    id="gladiator-name-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-neutral-950 border border-amber-600/60 rounded-xl px-4 py-2.5 text-amber-100 font-serif font-bold text-sm focus:outline-none focus:border-amber-400 min-h-[48px]"
                    maxLength={20}
                  />
                </div>

                {/* ARMATURA PICKER (CLASS SELECTION) */}
                <div>
                  <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-1">
                    Armatura &mdash; Class Selection
                  </label>
                  <p className="text-[11px] font-serif text-neutral-400 leading-relaxed mb-2.5">
                    Your class sets your starting attributes, signature doctrina and equipment.
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
                              : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-amber-600/50'
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

                {/* STEPPER BUTTON TO NEXT SECTION */}
                <button
                  type="button"
                  onClick={() => { sounds.playClick(); setActiveTab('body'); }}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-neutral-900 border border-amber-600/40 hover:border-amber-400 text-amber-300 font-serif font-bold text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <span>Continue to Body & Build &rarr;</span>
                </button>
              </div>
            )}

            {/* SECTION 2: BODY */}
            {activeTab === 'body' && (
              <div className="flex flex-col gap-4 sm:gap-6">
                {/* FIGHTER'S LOOK (MODEL SELECTION) */}
                <div>
                  <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-1">
                    Fighter's Look &mdash; Model Selection
                  </label>
                  <p className="text-[11px] font-serif text-neutral-400 leading-relaxed mb-2.5">
                    Your physical appearance model. Choose any look independently of class.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleModelSelect('roman_warrior')}
                      className={`min-h-[48px] py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all flex items-center justify-center gap-1 ${
                        selection.characterModel === 'roman_warrior'
                          ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-amber-600/50'
                      }`}
                    >
                      ⚔️ Roman Warrior
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModelSelect('amazonian')}
                      className={`min-h-[48px] py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all flex items-center justify-center gap-1 ${
                        selection.characterModel === 'amazonian'
                          ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 shadow-md'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-emerald-600/50'
                      }`}
                    >
                      🏹 Amazonian
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModelSelect('procedural_gladiator')}
                      className={`min-h-[48px] py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all flex items-center justify-center gap-1 ${
                        selection.characterModel === 'procedural_gladiator'
                          ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-md'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-amber-600/50'
                      }`}
                    >
                      🛡️ Centurion
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModelSelect('retiarius')}
                      className={`min-h-[48px] py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all flex items-center justify-center gap-1 ${
                        selection.characterModel === 'retiarius'
                          ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-md'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-cyan-600/50'
                      }`}
                    >
                      🔱 The Retiarius
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModelSelect('minotaur')}
                      className={`min-h-[48px] py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all flex items-center justify-center gap-1 ${
                        selection.characterModel === 'minotaur'
                          ? 'bg-orange-500/30 border-orange-400 text-orange-200 shadow-md'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-orange-600/50'
                      }`}
                    >
                      🐂 Minotaur
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModelSelect('dimachaerus')}
                      className={`min-h-[48px] py-2.5 px-2 rounded-xl border text-xs font-serif font-bold cursor-pointer transition-all flex items-center justify-center gap-1 ${
                        selection.characterModel === 'dimachaerus'
                          ? 'bg-purple-500/30 border-purple-400 text-purple-200 shadow-md'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-purple-600/50'
                      }`}
                    >
                      ⚔️ Dimachaerus
                    </button>
                  </div>
                </div>

                {/* SKIN TONE PICKER (FOR CENTURION) */}
                {selection.characterModel === 'procedural_gladiator' && (
                  <div className="rounded-xl border border-amber-700/40 bg-neutral-950/70 p-3.5" data-skin-tone-picker>
                    <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-2">
                      Skin Tone &mdash; Centurion
                    </label>
                    <div className="flex flex-wrap gap-3" role="group" aria-label="Choose gladiator skin tone">
                      {SKIN_TONES.map((tone) => {
                        const selected = skinColor === tone.color;
                        return (
                          <button
                            key={tone.id}
                            type="button"
                            data-skin-tone={tone.id}
                            aria-label={`Select skin tone: ${tone.label}`}
                            aria-pressed={selected}
                            title={tone.label}
                            onClick={() => { sounds.playClick(); setSkinColor(tone.color); }}
                            className={`h-12 w-12 rounded-full border-2 transition-transform cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 ${
                              selected ? 'border-amber-300 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.55)]' : 'border-neutral-500 hover:scale-105'
                            }`}
                            style={{ backgroundColor: tone.color }}
                          />
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-neutral-400">
                      Choose a complexion for the Centurion look. Imported gladiator models do not yet support verified skin-tone tinting.
                    </p>
                  </div>
                )}

                {/* BODY WEIGHT SLIDER */}
                <div className="rounded-xl border border-amber-700/40 bg-neutral-950/70 p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label htmlFor="gladiator-body-weight" className="text-xs font-serif uppercase tracking-wider text-amber-300">
                      Body Weight
                    </label>
                    <span className="text-sm font-serif font-bold text-amber-100 tabular-nums">{bodyWeightLb} lb</span>
                  </div>
                  <input
                    id="gladiator-body-weight"
                    type="range"
                    min={140}
                    max={300}
                    step={5}
                    value={bodyWeightLb}
                    onChange={(event) => setBodyWeightLb(Number(event.target.value))}
                    className="w-full min-h-[44px] accent-amber-500 cursor-pointer"
                    aria-describedby="gladiator-weight-guidance"
                  />
                  <p id="gladiator-weight-guidance" className="text-[11px] leading-relaxed text-neutral-400 mt-1">
                    Body weight shifts your gladiator's build, attack impact and stamina recovery rate.
                  </p>
                </div>

                {/* CORPUS BUILD PICKER */}
                <div>
                  <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-1">
                    Corpus &mdash; Physical Build
                  </label>
                  <p className="text-[11px] font-serif text-neutral-400 leading-relaxed mb-2.5">
                    The frame you grew into. Modifies your attribute floors prior to point allocation.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" data-corpus-build-picker>
                    {BUILDS.map((row) => {
                      const selected = row.id === corpus.build;
                      const delta = buildStatDelta(row.id);
                      const deltaLine = [
                        delta.str ? `STR ${delta.str > 0 ? '+' : ''}${delta.str}` : null,
                        delta.agi ? `AGI ${delta.agi > 0 ? '+' : ''}${delta.agi}` : null,
                        delta.sta ? `STA ${delta.sta > 0 ? '+' : ''}${delta.sta}` : null,
                        delta.def ? `DEF ${delta.def > 0 ? '+' : ''}${delta.def}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <button
                          key={row.id}
                          type="button"
                          data-corpus-build-card={row.id}
                          aria-pressed={selected}
                          onClick={() => handleBuildSelect(row.id)}
                          className={`min-h-[48px] text-left p-3 rounded-xl border transition-all cursor-pointer ${
                            selected
                              ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-md'
                              : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-amber-600/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-serif font-bold text-sm text-amber-200">{row.name}</span>
                            {selected && <Check className="w-4 h-4 text-amber-300 shrink-0" />}
                          </div>
                          <p className="text-[11px] font-serif italic text-neutral-400 mt-0.5">{row.text}</p>
                          <p className="text-[10px] font-mono text-amber-400/80 mt-1">
                            {deltaLine || 'No stat change'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* STEPPER BUTTON TO NEXT SECTION */}
                <button
                  type="button"
                  onClick={() => { sounds.playClick(); setActiveTab('features'); }}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-neutral-900 border border-amber-600/40 hover:border-amber-400 text-amber-300 font-serif font-bold text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <span>Continue to Features & Attributes &rarr;</span>
                </button>
              </div>
            )}

            {/* SECTION 3: FEATURES & STATS */}
            {activeTab === 'features' && (
              <div className="flex flex-col gap-4 sm:gap-6">
                {/* PROVINCE (ORIGO) & FLAW (VITIUM) in Details block */}
                <details
                  data-optional-background
                  className="rounded-xl border border-amber-700/40 bg-neutral-950/40"
                >
                  <summary className="min-h-[48px] cursor-pointer px-4 py-3 font-serif text-sm font-bold text-amber-200 marker:text-amber-400">
                    <span>Background choices (optional)</span>
                    <span className="ml-2 text-[11px] font-mono font-normal text-neutral-400">
                      {selectedProvinceName} · {selectedVitiumName}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-5 border-t border-amber-700/30 p-4">
                    {/* ORIGO PICKER (PROVINCE / BIRTHPLACE) */}
                    <div>
                      <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-1">
                        Origo &mdash; Birth Province
                      </label>
                      <p className="text-[11px] font-serif text-neutral-400 leading-relaxed mb-2.5">
                        Where you were born. Grants a passive trait and identifies your favoured deity.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-corpus-origo-picker>
                        {PROVINCES.map((row) => {
                          const selected = row.id === corpus.origo;
                          return (
                            <button
                              key={row.id}
                              type="button"
                              data-corpus-origo-card={row.id}
                              aria-pressed={selected}
                              onClick={() => handleOrigoSelect(row.id)}
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
                              <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mt-0.5">
                                Favoured god: <span className="text-amber-300">{row.god}</span>
                              </p>
                              <p className="text-[10px] font-mono text-amber-400/80 mt-1">{row.passive.text}</p>
                              <p className="text-[11px] font-serif italic text-neutral-400 mt-1">{row.flavour}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* VITIUM (CHARACTER FLAW / FEATURES) */}
                    <div>
                      <label className="block text-xs font-serif uppercase tracking-wider text-amber-300 mb-1">
                        Vitium &mdash; Character Flaw
                      </label>
                      <p className="text-[11px] font-serif text-neutral-400 leading-relaxed mb-2.5">
                        Taking a permanent flaw grants {VITIUM_CREATION_POINTS} bonus stat points to spend.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-corpus-vitium-picker>
                        <button
                          type="button"
                          data-corpus-vitium-card="none"
                          aria-pressed={corpus.vitium === null}
                          onClick={() => handleVitiumSelect(null)}
                          className={`min-h-[48px] text-left p-3 rounded-xl border transition-all cursor-pointer ${
                            corpus.vitium === null
                              ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-md'
                              : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-amber-600/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-serif font-bold text-sm text-amber-200">No Flaw</span>
                            {corpus.vitium === null && <Check className="w-4 h-4 text-amber-300 shrink-0" />}
                          </div>
                          <p className="text-[11px] font-serif italic text-neutral-400 mt-0.5">
                            Standard pool of 10 points. No permanent hindrance in combat.
                          </p>
                        </button>
                        {VITIA.map((row) => {
                          const selected = row.id === corpus.vitium;
                          return (
                            <button
                              key={row.id}
                              type="button"
                              data-corpus-vitium-card={row.id}
                              aria-pressed={selected}
                              onClick={() => handleVitiumSelect(row.id)}
                              className={`min-h-[48px] text-left p-3 rounded-xl border transition-all cursor-pointer ${
                                selected
                                  ? 'bg-red-500/20 border-red-400 text-red-100 shadow-md'
                                  : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-red-600/50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-serif font-bold text-sm text-amber-200">{row.name}</span>
                                <span className="text-[10px] font-mono text-red-300 shrink-0 font-bold">
                                  +{VITIUM_CREATION_POINTS} PTS
                                </span>
                              </div>
                              <p className="text-[11px] font-serif italic text-neutral-400 mt-0.5">{row.text}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </details>

                {/* STAT POINT ALLOCATION */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-serif uppercase tracking-wider text-amber-300">
                      Attribute Allocation
                    </label>
                    <span className="font-mono text-xs font-bold text-yellow-400 bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-700/60 shadow-sm">
                      {pointsLeft} Points Left
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {statRows.map((stat) => {
                      const Icon = stat.icon;
                      const { statFloor } = stat;
                      return (
                        <div key={stat.key} className="flex justify-between items-center bg-neutral-950/80 p-2.5 rounded-xl border border-neutral-800">
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${stat.color}`} />
                            <span className="text-xs font-serif font-bold text-neutral-200">{stat.label}</span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <span className="font-mono font-bold text-sm text-amber-200 w-6 text-center tabular-nums">{stat.val}</span>
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
                    {creationPoints(corpus.vitium)} points available &middot; class template plus build sets the stat floor.
                  </p>
                </div>

                {/* DERIVED STATS PREVIEW */}
                <div
                  data-derived-preview="1"
                  className="rounded-xl border border-amber-700/50 bg-neutral-950/80 px-3.5 py-3 shadow-md"
                >
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-amber-200">
                    <Activity className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Health {draftStats.healthMax} &middot; Stamina {draftStats.staminaMax}
                    </span>
                  </div>
                  <p className="text-[11px] font-serif text-neutral-400 mt-1 leading-relaxed">
                    Health and Stamina calculate directly from Strength, Defense, and Stamina stats.
                  </p>
                </div>

                {/* FINAL SUBMIT BUTTON */}
                <button
                  type="button"
                  data-action="submit-character"
                  onClick={handleFinish}
                  className="w-full min-h-[52px] py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.6)] border-2 border-amber-200 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <Check className="w-5 h-5 shrink-0" />
                  <span>Apply Points & Enter Metropolis [Town Gate]</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
