import React from 'react';
import { DuelStatistics, OpponentConfig } from '../../types/game';
import { Trophy, Skull, Coins, Sparkles, Swords, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';

interface DuelResultModalProps {
  didWin: boolean;
  opponent: OpponentConfig;
  stats: DuelStatistics;
  onContinue: () => void;
}

export const DuelResultModal: React.FC<DuelResultModalProps> = ({
  didWin,
  opponent,
  stats,
  onContinue,
}) => {
  React.useEffect(() => {
    if (didWin) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#dc2626', '#3b82f6', '#10b981'],
      });
    }
  }, [didWin]);

  return (
    <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md z-40 flex items-center justify-center p-4">
      <div
        className={`border-2 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-fadeIn text-amber-100 ${
          didWin
            ? 'bg-neutral-900 border-amber-500/80'
            : 'bg-neutral-900 border-red-600/80'
        }`}
      >
        <div className="text-center mb-6">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xl ${
              didWin ? 'bg-amber-500/20 border border-amber-400' : 'bg-red-900/40 border border-red-500'
            }`}
          >
            {didWin ? <Trophy className="w-8 h-8 text-yellow-400" /> : <Skull className="w-8 h-8 text-red-400" />}
          </div>

          <h3 className="font-serif font-black text-3xl sm:text-4xl uppercase tracking-wider mb-1">
            {didWin ? 'VICTORY!' : 'DEFEAT'}
          </h3>
          <p className="text-xs font-serif text-neutral-400">
            {didWin ? `You defeated ${opponent.name} in the sand!` : `Felled by ${opponent.name}. Recover your strength!`}
          </p>
        </div>

        {/* COMBAT RECAP */}
        <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 mb-6 flex flex-col gap-2 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-neutral-400">Damage Dealt:</span>
            <span className="text-red-400 font-bold">{stats.damageDealt}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Hits Landed:</span>
            <span className="text-amber-300">{stats.hitsLanded}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Match Duration:</span>
            <span className="text-neutral-300">{stats.durationSeconds}s</span>
          </div>
          {didWin && (
            <>
              <div className="h-px bg-neutral-800 my-1"></div>
              <div className="flex justify-between font-bold">
                <span className="text-yellow-400">Gold Earned:</span>
                <span className="text-yellow-400">+{stats.goldEarned}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-purple-400">Fame Gained:</span>
                <span className="text-purple-400">+{stats.fameEarned}</span>
              </div>
            </>
          )}
        </div>

        <button
          onClick={onContinue}
          className={`w-full py-4 rounded-2xl font-serif font-black text-sm uppercase tracking-wider cursor-pointer shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${
            didWin
              ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-neutral-950 border border-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
              : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600'
          }`}
        >
          <span>Return to Metropolis [Town Gate]</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
