import React from 'react';
import { OpponentConfig } from '../../types/game';
import { Swords, Trophy, Coins, Zap, Shield, Skull } from 'lucide-react';

interface PreFightModalProps {
  opponent: OpponentConfig;
  onConfirm: () => void;
  onCancel: () => void;
}

export const PreFightModal: React.FC<PreFightModalProps> = ({ opponent, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border-2 border-red-500/80 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-fadeIn text-amber-100">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-900/50 border border-red-500 flex items-center justify-center mx-auto mb-3 shadow-[0_0_20px_rgba(239,68,68,0.5)]">
            <Swords className="w-8 h-8 text-red-300" />
          </div>
          <span className="text-xs font-serif uppercase tracking-widest text-red-400 font-bold">
            Arena Challenge
          </span>
          <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mt-1">
            {opponent.name}
          </h3>
          <p className="text-xs font-serif text-neutral-400 italic">{opponent.title}</p>
        </div>

        <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 mb-6 flex flex-col gap-2 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-neutral-400">Weapon Style:</span>
            <span className="text-amber-300 uppercase">{opponent.weaponType.replace('_', ' & ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Combat AI:</span>
            <span className="text-purple-300">{opponent.personality}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Gold Bounty:</span>
            <span className="text-yellow-400">+{opponent.rewardGold} Gold</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-serif font-bold text-xs uppercase cursor-pointer"
          >
            Retreat
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-serif font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg active:scale-95"
          >
            Step into Sand
          </button>
        </div>
      </div>
    </div>
  );
};
