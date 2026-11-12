import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Users, Coins, UserPlus, Sword, Trophy, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import {
  resolveTrainees,
  getTraineeCapacity,
  RECRUIT_TRAINEE_COST,
  recruitTrainee,
  assignTraineeActivity,
  dismissTrainee,
  describeTraineeRejection,
} from '../../utils/ludusTrainees';

interface TraineeManagementPanelProps {
  profile: PlayerProfile;
  onUpdateProfile: (profile: PlayerProfile) => void;
  onToast: (message: string) => void;
}

export const TraineeManagementPanel: React.FC<TraineeManagementPanelProps> = ({
  profile,
  onUpdateProfile,
  onToast,
}) => {
  const trainees = resolveTrainees(profile);
  const capacity = getTraineeCapacity(profile);
  const canRecruit = trainees.length < capacity && profile.gold >= RECRUIT_TRAINEE_COST;

  const handleRecruit = () => {
    const result = recruitTrainee(profile);
    if (!result.ok) {
      onToast(describeTraineeRejection(result.reason));
      return;
    }
    sounds.playCoin();
    onUpdateProfile(result.profile);
    if (result.message) onToast(result.message);
  };

  const handleAssign = (traineeId: string, activity: 'sparring' | 'exhibition') => {
    const result = assignTraineeActivity(profile, traineeId, activity);
    if (!result.ok) {
      onToast(describeTraineeRejection(result.reason));
      return;
    }
    sounds.playClick();
    onUpdateProfile(result.profile);
    if (result.message) onToast(result.message);
  };

  const handleDismiss = (traineeId: string) => {
    const result = dismissTrainee(profile, traineeId);
    if (!result.ok) {
      onToast(describeTraineeRejection(result.reason));
      return;
    }
    sounds.playClick();
    onUpdateProfile(result.profile);
    if (result.message) onToast(result.message);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      <div className="bg-neutral-900/80 border-2 border-amber-500/60 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="font-serif font-black text-xl sm:text-2xl text-amber-100 uppercase mb-1 flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-400" />
            <span>Trainee Barracks</span>
          </h3>
          <p className="text-xs sm:text-sm text-neutral-300 font-serif">
            Recruit junior gladiators, drill them in sparring, or send them on provincial exhibition tours for gold and fame.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-neutral-950 px-3 py-1.5 rounded-2xl border border-amber-700/50 text-xs font-mono text-amber-200">
            Capacity: <strong className="text-amber-400">{trainees.length} / {capacity}</strong>
          </div>
          <div className="flex items-center gap-2 bg-neutral-950 px-4 py-2 rounded-2xl border border-yellow-500/60 font-mono font-bold text-yellow-400 text-lg shadow-inner">
            <Coins className="w-5 h-5" />
            <span>{profile.gold}</span>
          </div>
        </div>
      </div>

      {/* Recruitment Box */}
      <div className="bg-neutral-900/80 border border-amber-700/40 rounded-3xl p-5 shadow-lg flex flex-wrap justify-between items-center gap-4">
        <div>
          <h4 className="font-serif font-bold text-base text-amber-100">Recruit New Trainee</h4>
          <p className="text-xs text-neutral-400">
            Cost: <strong className="text-yellow-400">{RECRUIT_TRAINEE_COST} Gold</strong> · Requires available stable slot.
          </p>
        </div>
        <button
          onClick={handleRecruit}
          disabled={!canRecruit}
          className={`min-h-[48px] px-5 py-2.5 rounded-2xl font-serif font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
            canRecruit
              ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300 cursor-pointer active:scale-95 shadow-lg'
              : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>Recruit Trainee</span>
        </button>
      </div>

      {/* Trainee List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trainees.length === 0 ? (
          <div className="col-span-full bg-neutral-950/60 border border-neutral-800 rounded-3xl p-8 text-center text-neutral-400 font-serif">
            No trainees housed in your barracks. Recruit your first novice gladiator to begin building your school's legacy.
          </div>
        ) : (
          trainees.map((trainee) => (
            <div
              key={trainee.id}
              className="bg-neutral-900/80 border border-neutral-800 rounded-3xl p-5 shadow-lg flex flex-col justify-between gap-4 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-600/5 rounded-full blur-2xl pointer-events-none" />

              <div>
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div>
                    <h4 className="font-serif font-bold text-base text-amber-100">{trainee.name}</h4>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/60">
                      {trainee.classType}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-neutral-400 block">Level {trainee.level}</span>
                    <span className="text-xs font-mono text-amber-400 font-bold">Skill: {trainee.skill}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 text-xs font-mono">
                  {trainee.status === 'idle' ? (
                    <span className="text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Orders
                    </span>
                  ) : (
                    <span className="text-yellow-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> On {trainee.assignmentType} ({trainee.daysRemaining} days left)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-neutral-800">
                {trainee.status === 'idle' ? (
                  <>
                    <button
                      onClick={() => handleAssign(trainee.id, 'sparring')}
                      className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-200 border border-neutral-700 font-serif font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Sword className="w-3.5 h-3.5 text-amber-400" />
                      <span>Spar (1d)</span>
                    </button>
                    <button
                      onClick={() => handleAssign(trainee.id, 'exhibition')}
                      className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-200 border border-neutral-700 font-serif font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Tour (3d)</span>
                    </button>
                  </>
                ) : (
                  <div className="w-full text-center text-xs font-mono text-neutral-500 py-2 bg-neutral-950/60 rounded-xl border border-neutral-900">
                    Busy on mission ({trainee.daysRemaining}d remaining)
                  </div>
                )}

                <button
                  onClick={() => handleDismiss(trainee.id)}
                  title="Release Trainee"
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/50 font-serif font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-[11px] font-serif text-neutral-400 bg-neutral-950/60 border border-neutral-800 rounded-2xl p-4">
        Sparring drills improve trainees' combat skill over 1 day. Exhibition tours send them to provincial arenas for 3 days, returning with substantial gold and fame purses once completed. Upgrading your Imperial Stable increases your maximum trainee capacity.
      </p>
    </div>
  );
};
