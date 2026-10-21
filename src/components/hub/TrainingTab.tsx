import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Dumbbell, Swords, Shield, Heart, Zap, Moon } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import { TRAINING_ACTIONS, trainingCost, type TrainingStat } from '../../data/training';
import { resolveTrainingSchedule } from '../../utils/trainingSchedule';

interface TrainingTabProps {
  profile: PlayerProfile;
  onTrainStat: (stat: TrainingStat) => void;
}

/** Presentation only: the icon and ink each discipline wears. */
const DISCIPLINE_LOOK: Record<TrainingStat, { icon: typeof Swords; color: string }> = {
  strength: { icon: Swords, color: 'text-red-400' },
  agility: { icon: Zap, color: 'text-yellow-400' },
  stamina: { icon: Heart, color: 'text-green-400' },
  defense: { icon: Shield, color: 'text-blue-400' },
};

export const TrainingTab: React.FC<TrainingTabProps> = ({ profile, onTrainStat }) => {
  // Living City L5 — the day's timetable, from the ONE resolver the training
  // transaction also checks, so a card on screen and a session agree by
  // construction. The cost comes from the same helper the transaction charges.
  const schedule = resolveTrainingSchedule(profile);
  const cost = trainingCost(profile.level);
  const canAfford = profile.gold >= cost;
  const scheduledIds = new Set(schedule.actions.map((action) => action.id));

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
        <p className="text-xs text-neutral-400 font-serif mt-2">
          Day {schedule.day} of the Ludus — {schedule.actions.length} of {TRAINING_ACTIONS.length} disciplines drill today
          {schedule.resting.length > 0 && (
            <>; <span className="text-amber-200/80">{schedule.resting.map((action) => action.name).join(', ')}</span> rests</>
          )}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TRAINING_ACTIONS.map((action) => {
          const look = DISCIPLINE_LOOK[action.id];
          const Icon = look.icon;
          const scheduled = scheduledIds.has(action.id);
          const enabled = scheduled && canAfford;

          return (
            <div
              key={action.id}
              className={`p-5 rounded-3xl bg-neutral-900/80 border transition-all flex flex-col justify-between shadow-lg ${
                scheduled ? 'border-amber-700/40 hover:border-amber-500/80' : 'border-neutral-700/40'
              }`}
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-5 h-5 ${scheduled ? look.color : 'text-neutral-500'}`} />
                  <h4 className={`font-serif font-bold text-base ${scheduled ? 'text-amber-100' : 'text-neutral-500'}`}>
                    {action.name}
                  </h4>
                </div>
                <p className="text-xs text-neutral-400 mb-4">{action.description}</p>
                {!scheduled && (
                  <p className="text-xs text-neutral-500 font-serif mb-3 flex items-center gap-1.5">
                    <Moon className="w-3.5 h-3.5" />
                    Resting today — the yard runs this drill on another day.
                  </p>
                )}
              </div>

              <button
                onClick={() => {
                  sounds.playClick();
                  onTrainStat(action.id);
                }}
                disabled={!enabled}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md"
              >
                Train (+1 {action.id.toUpperCase()})
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
