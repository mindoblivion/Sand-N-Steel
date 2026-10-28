import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Dumbbell, Swords, Shield, Heart, Zap, Award } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import { DoctoreTestCard } from './DoctoreTestCard';
import type { DoctoreTestRestriction } from '../../utils/storyBeats';
import { trainingCost } from '../../utils/facilityProgression';
import { resolvePalmae } from '../../utils/traitModifiers';
import { DOCTORE_PALMAE, palmaPrice } from '../../utils/palmaeState';

interface TrainingTabProps {
  profile: PlayerProfile;
  onTrainStat: (stat: 'strength' | 'agility' | 'stamina' | 'defense') => void;
  /**
   * STORY-2 — the Doctore House's own duel entry. The yard is the ludus, so the
   * restricted-rules Test is offered here, above the conditioning cards.
   */
  onSelectDoctoreTest?: (restriction: DoctoreTestRestriction) => void;
  /**
   * CH-5 — the Doctore's own palms, bought with gold.  A purchase UNLOCKS it; it
   * is equipped in the Gladiator Stats panel.  `App` runs `purchaseDoctorePalma`
   * and writes the save — this screen only asks.
   */
  onBuyPalma?: (palmaId: string) => void;
}

export const TrainingTab: React.FC<TrainingTabProps> = ({
  profile,
  onTrainStat,
  onSelectDoctoreTest,
  onBuyPalma,
}) => {
  // P5 — the Ludus Training Yard sets stat training's price (and only that).
  const cost = trainingCost(profile);
  const canAfford = profile.gold >= cost;
  // CH-5 — the Doctore's palms: ownership and prices read from the palmae data.
  const ownedPalmae = resolvePalmae(profile).unlocked ?? [];

  const trainingOptions = [
    { key: 'strength', name: 'Heavy Log Sleds', desc: 'Increases light & heavy attack damage.', icon: Swords, color: 'text-red-400' },
    { key: 'agility', name: 'Reflex Speed Target', desc: 'Increases movement speed & dodge recovery.', icon: Zap, color: 'text-yellow-400' },
    { key: 'stamina', name: 'Sand Endurance Drills', desc: 'Increases maximum stamina capacity & regen.', icon: Heart, color: 'text-green-400' },
    { key: 'defense', name: 'Shield Deflection Stance', desc: 'Reduces damage taken and strengthens block.', icon: Shield, color: 'text-blue-400' },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full pb-12">
      {onSelectDoctoreTest && (
        <DoctoreTestCard profile={profile} onChooseRestriction={onSelectDoctoreTest} />
      )}

      <div className="bg-neutral-900/80 border-2 border-orange-500/60 rounded-3xl p-6 shadow-xl text-center">
        <Dumbbell className="w-10 h-10 text-orange-400 mx-auto mb-2" />
        <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mb-1">
          Ludus Martial Training Yard
        </h3>
        <p className="text-sm text-neutral-300 font-serif">
          Condition your body for the arena. Training costs <strong className="text-yellow-300">{cost} Gold</strong> per session.
        </p>
        {/* LUDI PHASE A — THE DAY'S SESSIONS, shown and NOT enforced. The Acta's rollover
            refreshes them (two, or three on Dies Quietus), and this row is the read that
            makes the number visible; gold stays the only gate, so a spent session never
            stops a training and no control below is ever disabled by it. */}
        <p
          data-training-sessions={profile.trainingSessionsLeft}
          className="mt-2 text-[11px] sm:text-xs font-mono uppercase tracking-wider text-orange-300/90"
        >
          Sessions left today: {profile.trainingSessionsLeft}
        </p>
        <p className="mt-1 text-[10px] sm:text-[11px] font-serif text-neutral-400">
          Gold is the only gate — a spent session never stops you training.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {trainingOptions.map((opt) => {
          const Icon = opt.icon;
          return (
            <div
              key={opt.key}
              className="p-5 rounded-3xl bg-neutral-900/80 border border-amber-700/40 hover:border-amber-500/80 transition-all flex flex-col justify-between shadow-lg"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-5 h-5 ${opt.color}`} />
                  <h4 className="font-serif font-bold text-base text-amber-100">{opt.name}</h4>
                </div>
                <p className="text-xs text-neutral-400 mb-4">{opt.desc}</p>
              </div>

              <button
                onClick={() => {
                  sounds.playClick();
                  onTrainStat(opt.key as 'strength' | 'agility' | 'stamina' | 'defense');
                }}
                disabled={!canAfford}
                className="w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md"
              >
                Train (+1 {opt.key.toUpperCase()})
              </button>
            </div>
          );
        })}
      </div>

      {/* CH-5 — THE DOCTORE'S PALMS.  The two palms he sells, at their own data
          prices, through the same purchase pattern as the conditioning cards
          above: cost shown, affordability gate, gold never negative (the
          transaction re-checks it).  Buying unlocks; equipping happens in
          Gladiator Stats. */}
      {onBuyPalma && DOCTORE_PALMAE.length > 0 && (
        <div
          className="bg-neutral-900/80 border-2 border-amber-700/50 rounded-3xl p-6 shadow-xl"
          data-doctore-palmae
        >
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-amber-400" />
            <h3 className="font-serif font-black text-xl text-amber-100 uppercase">
              The Doctore&apos;s Palms
            </h3>
          </div>
          <p className="text-xs font-serif text-neutral-300 mb-4">
            Old tricks he will part with for coin. A palm is worn in Gladiator Stats, never here.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DOCTORE_PALMAE.map((palma) => {
              const price = palmaPrice(palma);
              const owned = ownedPalmae.includes(palma.id);
              const affordable = price !== null && profile.gold >= price;
              return (
                <div
                  key={palma.id}
                  data-doctore-palma={palma.id}
                  data-doctore-palma-owned={owned ? 'true' : 'false'}
                  className="p-5 rounded-3xl bg-neutral-900/80 border border-amber-700/40 flex flex-col justify-between shadow-lg"
                >
                  <div>
                    <h4 className="font-serif font-bold text-base text-amber-100">{palma.name}</h4>
                    <p className="text-xs text-neutral-400 mt-1 mb-2">{palma.description}</p>
                    <div className="text-[11px] font-mono text-yellow-300">
                      {price === null ? 'Not for sale' : `${price} Gold`}
                    </div>
                  </div>
                  {owned ? (
                    <div className="mt-3 w-full min-h-[48px] py-3 rounded-2xl bg-neutral-950 border border-amber-700/40 text-amber-300 font-serif font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center">
                      Owned
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        onBuyPalma(palma.id);
                      }}
                      disabled={!affordable}
                      className="mt-3 w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md"
                    >
                      Buy {palma.name} — {price} Gold
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
