import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Dumbbell, Swords, Shield, Heart, Zap } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';

interface TrainingTabProps {
  profile: PlayerProfile;
  onTrainStat: (stat: 'strength' | 'agility' | 'stamina' | 'defense') => void;
}

export const TrainingTab: React.FC<TrainingTabProps> = ({ profile, onTrainStat }) => {
  const cost = 25 * profile.level;
  const canAfford = profile.gold >= cost;

  const trainingOptions = [
    { key: 'strength', name: 'Heavy Log Sleds', desc: 'Increases light & heavy attack damage.', icon: Swords, color: 'text-red-400' },
    { key: 'agility', name: 'Reflex Speed Target', desc: 'Increases movement speed & dodge recovery.', icon: Zap, color: 'text-yellow-400' },
    { key: 'stamina', name: 'Sand Endurance Drills', desc: 'Increases maximum stamina capacity & regen.', icon: Heart, color: 'text-green-400' },
    { key: 'defense', name: 'Shield Deflection Stance', desc: 'Reduces damage taken and strengthens block.', icon: Shield, color: 'text-blue-400' },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full pb-12">
      <div className="bg-neutral-900/80 border-2 border-orange-500/60 rounded-3xl p-6 shadow-xl text-center">
        <Dumbbell className="w-10 h-10 text-orange-400 mx-auto mb-2" />
        <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mb-1">
          Ludus Martial Training Yard
        </h3>
        <p className="text-sm text-neutral-300 font-serif">
          Condition your body for the arena. Training costs <strong className="text-yellow-300">{cost} Gold</strong> per session.
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
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md"
              >
                Train (+1 {opt.key.toUpperCase()})
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
