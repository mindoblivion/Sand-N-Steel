import React, { useState } from 'react';
import { PlayerProfile } from '../../types/game';
import { Coins, Flame, Trophy, X, Check, Dices } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import { STABLE_FACTIONS, StableFactionId, placeTavernBet } from '../../utils/racingLeague';

interface TavernBettingModalProps {
  profile: PlayerProfile;
  onUpdateProfile: (updated: PlayerProfile) => void;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

export const TavernBettingModal: React.FC<TavernBettingModalProps> = ({
  profile,
  onUpdateProfile,
  onClose,
  onToast,
}) => {
  const [selectedFaction, setSelectedFaction] = useState<StableFactionId>('red_russata');
  const [wager, setWager] = useState<number>(100);

  const faction = STABLE_FACTIONS.find((f) => f.id === selectedFaction) || STABLE_FACTIONS[0];
  const potentialPayout = Math.floor(wager * faction.baseOdds);
  const activeBet = profile.activeRaceBet;

  const handlePlaceBet = () => {
    const res = placeTavernBet(profile, selectedFaction, wager);
    if (!res.ok) {
      if (onToast) onToast(res.reason);
      return;
    }
    sounds.playCoin();
    onUpdateProfile(res.profile);
    if (onToast) onToast(`Placed ${wager} gold bet on ${faction.name}!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl animate-fadeIn text-amber-100 relative max-h-[92dvh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-amber-200 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-amber-900/50 border border-amber-500 flex items-center justify-center mx-auto mb-3 shadow-[0_0_20px_rgba(245,158,11,0.5)]">
            <Dices className="w-8 h-8 text-amber-300" />
          </div>
          <span className="text-xs font-serif uppercase tracking-widest text-amber-400 font-bold">
            Golden Palm Bookmaker
          </span>
          <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mt-1">
            Circus Race Wagering
          </h3>
          <p className="text-xs font-serif text-neutral-400 italic">
            Place your wager with tavern bookies on upcoming chariot faction drivers.
          </p>
        </div>

        {activeBet ? (
          <div className="bg-neutral-950 p-5 rounded-2xl border border-amber-500/60 mb-6 text-center">
            <span className="text-xs font-mono uppercase text-green-400 font-bold block mb-1">
              Active Bet Placed!
            </span>
            <p className="text-sm font-serif text-amber-200">
              Wagered <strong className="text-yellow-400">{activeBet.wagerAmount} Gold</strong> on{' '}
              <strong className="text-amber-300">
                {STABLE_FACTIONS.find((f) => f.id === activeBet.factionId)?.name}
              </strong>{' '}
              at {activeBet.oddsMultiplier}x odds.
            </p>
            <div className="mt-3 text-xs font-mono text-amber-400">
              Potential Payout: <strong>{activeBet.potentialPayout} Gold</strong>
            </div>
            <p className="text-[11px] font-serif text-neutral-400 mt-2">
              Head to the East Circus District to start your race and settle the wager!
            </p>
          </div>
        ) : (
          <>
            {/* Stable Faction Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {STABLE_FACTIONS.map((f) => {
                const isSelected = f.id === selectedFaction;
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      sounds.playClick();
                      setSelectedFaction(f.id);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? `${f.bannerBg} ring-2 ring-amber-400 shadow-lg`
                        : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-300'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="font-serif font-bold text-xs">{f.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/60 font-bold text-yellow-400">
                          {f.baseOdds}x
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-neutral-400 mt-1">{f.driverName}</p>
                    </div>
                    <p className="text-[10px] font-serif italic text-neutral-300/80">{f.specialty}</p>
                  </button>
                );
              })}
            </div>

            {/* Wager Input */}
            <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 mb-6 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-neutral-400">Your Purse:</span>
                <span className="text-sm font-mono font-bold text-yellow-400 flex items-center gap-1">
                  <Coins className="w-4 h-4" /> {profile.gold} Gold
                </span>
              </div>

              <div>
                <label className="text-xs font-serif text-amber-200 block mb-2">Select Wager Amount:</label>
                <div className="flex items-center gap-2">
                  {[50, 100, 250, 500].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setWager(amt)}
                      className={`flex-1 min-h-[40px] py-1.5 rounded-xl font-mono text-xs font-bold border transition-all cursor-pointer ${
                        wager === amt
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-amber-200'
                      }`}
                    >
                      {amt}g
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-neutral-800 pt-3 text-xs font-mono">
                <span className="text-neutral-400">Potential Payout:</span>
                <span className="text-amber-300 font-bold text-sm">{potentialPayout} Gold</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 min-h-[48px] py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-serif font-bold text-xs uppercase cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handlePlaceBet}
                disabled={profile.gold < wager}
                className={`flex-1 min-h-[48px] py-3 rounded-xl font-serif font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  profile.gold >= wager
                    ? 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-neutral-950 border border-yellow-300 cursor-pointer shadow-lg active:scale-95'
                    : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
                }`}
              >
                <Dices className="w-4 h-4" />
                <span>Place Wager ({wager}g)</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
