import React from 'react';
import { PlayerProfile, OpponentConfig } from '../../types/game';
import { TOURNAMENT_TIERS, ALL_OPPONENTS } from '../../data/opponents';
import { Swords, Trophy, Skull, Play, Lock, CheckCircle, Shield } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';

interface TournamentTabProps {
  profile: PlayerProfile;
  onSelectOpponent: (opp: OpponentConfig) => void;
}

export const TournamentTab: React.FC<TournamentTabProps> = ({ profile, onSelectOpponent }) => {
  const currentTierInfo = TOURNAMENT_TIERS.find((t) => t.tier === profile.currentTier) || TOURNAMENT_TIERS[0];
  const tierOpponents = ALL_OPPONENTS.filter((o) => o.tier === profile.currentTier);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      {/* TIER HEADER */}
      <div className="bg-gradient-to-r from-amber-950/80 via-neutral-900/90 to-amber-950/80 border-2 border-amber-600/60 rounded-3xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-serif uppercase tracking-widest text-amber-400">
            Tournament Division
          </span>
          <span className="text-xs font-mono text-neutral-400">
            Recommended LVL {currentTierInfo.minLevel}+
          </span>
        </div>
        <h3 className="font-serif font-black text-2xl sm:text-3xl text-amber-100 uppercase mb-1">
          {currentTierInfo.name}
        </h3>
        <p className="text-sm text-neutral-300 font-serif italic">{currentTierInfo.description}</p>
      </div>

      {/* OPPONENTS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tierOpponents.map((opp) => {
          const isDefeated = profile.defeatedOpponentIds.includes(opp.id);
          const isLocked = profile.level < opp.recommendedLevel && !isDefeated;

          return (
            <div
              key={opp.id}
              className={`p-5 rounded-3xl border-2 transition-all shadow-xl flex flex-col justify-between ${
                opp.isBoss
                  ? 'bg-gradient-to-br from-red-950/80 to-neutral-900/90 border-red-500/80'
                  : 'bg-neutral-900/80 border-amber-700/40 hover:border-amber-500/80'
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                      opp.isBoss
                        ? 'bg-red-900 text-red-200 border-red-500'
                        : 'bg-amber-950 text-amber-300 border-amber-700'
                    }`}
                  >
                    {opp.isBoss ? '👑 ARENA BOSS' : `Rank Match #${opp.fightIndex}`}
                  </span>
                  <span className="text-xs font-mono text-neutral-400">LVL {opp.recommendedLevel}</span>
                </div>

                <h4 className="font-serif font-black text-lg text-amber-100 mb-0.5">{opp.name}</h4>
                <div className="text-xs text-neutral-400 font-serif italic mb-4">{opp.title}</div>

                {/* REWARDS */}
                <div className="flex items-center gap-3 text-xs font-mono bg-neutral-950/80 p-2.5 rounded-xl border border-neutral-800 mb-4">
                  <span className="text-yellow-400 font-bold">+{opp.rewardGold} Gold</span>
                  <span className="text-purple-400 font-bold">+{opp.rewardFame} Fame</span>
                  <span className="text-cyan-400 font-bold">+{opp.rewardXp} XP</span>
                </div>
              </div>

              {/* ENTER DUEL BUTTON */}
              <button
                onClick={() => {
                  sounds.playClick();
                  onSelectOpponent(opp);
                }}
                disabled={isLocked}
                className={`w-full py-3 rounded-2xl font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
                  isDefeated
                    ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600'
                    : opp.isBoss
                    ? 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white border border-rose-300 shadow-[0_0_20px_rgba(225,29,72,0.6)]'
                    : 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-neutral-950 border border-amber-200 shadow-lg'
                }`}
              >
                {isDefeated ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span>Fight Again (Rematch)</span>
                  </>
                ) : isLocked ? (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Locked (Requires LVL {opp.recommendedLevel})</span>
                  </>
                ) : (
                  <>
                    <Swords className="w-4 h-4" />
                    <span>Enter Arena Duel</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
