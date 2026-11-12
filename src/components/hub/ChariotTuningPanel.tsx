import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Wrench, Shield, Zap, Coins, ArrowUpCircle, Flame } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import {
  resolveChariotTuning,
  getTuningUpgradeCost,
  purchaseTuningUpgrade,
  MAX_TUNING_LEVEL,
  ChariotTuning,
} from '../../utils/racingLeague';

interface ChariotTuningPanelProps {
  profile: PlayerProfile;
  onUpdateProfile: (updated: PlayerProfile) => void;
  onToast?: (msg: string) => void;
}

export const ChariotTuningPanel: React.FC<ChariotTuningPanelProps> = ({
  profile,
  onUpdateProfile,
  onToast,
}) => {
  const tuning = resolveChariotTuning(profile);

  const statsList: {
    key: keyof ChariotTuning;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }[] = [
    {
      key: 'reinStrength',
      title: 'Rein Strength & Harness',
      description: 'Increases steering responsiveness and cornering grip during high-speed turns.',
      icon: Wrench,
      color: 'text-cyan-400',
    },
    {
      key: 'axleDurability',
      title: 'Iron Axle Durability',
      description: 'Strengthens the chassis against impact damage and prevents spin-outs during collisions.',
      icon: Shield,
      color: 'text-blue-400',
    },
    {
      key: 'wheelSpikes',
      title: 'Scythe Wheel Spikes',
      description: 'Lethal hub blades that damage and slow rival chariots when racing side-by-side.',
      icon: Flame,
      color: 'text-red-400',
    },
    {
      key: 'staminaConditioning',
      title: 'Equine Stamina Conditioning',
      description: 'Extends whip boost duration and speeds up horse stamina recovery on straightaways.',
      icon: Zap,
      color: 'text-yellow-400',
    },
  ];

  const handleUpgrade = (stat: keyof ChariotTuning) => {
    const res = purchaseTuningUpgrade(profile, stat);
    if (!res.ok) {
      if (onToast) onToast(res.reason);
      return;
    }
    sounds.playCoin();
    onUpdateProfile(res.profile);
    if (onToast) onToast(`Upgraded ${stat} tuning!`);
  };

  return (
    <div className="bg-neutral-900/90 border border-amber-600/50 rounded-3xl p-5 sm:p-6 shadow-xl mb-6 text-amber-100">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <h3 className="font-serif font-black text-lg sm:text-xl text-amber-200 uppercase tracking-wider flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-400" />
            <span>Chariot Tuning & Performance</span>
          </h3>
          <p className="text-xs text-neutral-300 font-serif">
            Fine-tune your chariot's mechanical attributes to dominate rival Roman stables in the Circus League.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-neutral-950 px-3.5 py-1.5 rounded-2xl border border-yellow-500/60 font-mono font-bold text-yellow-400 text-sm shadow-inner">
          <Coins className="w-4 h-4" />
          <span>{profile.gold}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {statsList.map((s) => {
          const level = tuning[s.key];
          const isMax = level >= MAX_TUNING_LEVEL;
          const cost = getTuningUpgradeCost(level);
          const canAfford = profile.gold >= cost;
          const Icon = s.icon;

          return (
            <div
              key={s.key}
              className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex justify-between items-start gap-2 mb-1">
                  <h4 className="font-serif font-bold text-sm text-amber-100 flex items-center gap-1.5">
                    <Icon className={`w-4 h-4 ${s.color}`} />
                    <span>{s.title}</span>
                  </h4>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-neutral-800 text-amber-300 border border-neutral-700 font-bold shrink-0">
                    Lv {level} / {MAX_TUNING_LEVEL}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 font-serif leading-snug">{s.description}</p>
                {/* Level indicators */}
                <div className="flex gap-1.5 mt-3">
                  {Array.from({ length: MAX_TUNING_LEVEL }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-2 flex-1 rounded-full transition-all ${
                        idx < level ? 'bg-gradient-to-r from-yellow-500 to-amber-500 shadow-sm' : 'bg-neutral-800'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {!isMax ? (
                <button
                  onClick={() => handleUpgrade(s.key)}
                  disabled={!canAfford}
                  className={`min-h-[44px] px-4 py-2 rounded-xl font-serif font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                    canAfford
                      ? 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-neutral-950 border border-yellow-300 cursor-pointer active:scale-95 shadow-md'
                      : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
                  }`}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>Tune ({cost} Gold)</span>
                </button>
              ) : (
                <div className="text-xs font-mono text-center text-green-400 py-2 bg-neutral-900/60 rounded-xl border border-green-900/40 font-bold">
                  Maximum Tuning Reached
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
