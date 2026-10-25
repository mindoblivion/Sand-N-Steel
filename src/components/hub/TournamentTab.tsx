import React from 'react';
import { PlayerProfile, OpponentConfig } from '../../types/game';
import { TOURNAMENT_TIERS, ALL_OPPONENTS } from '../../data/opponents';
import { featureBoutStatuses } from '../../utils/featureBouts';
import { Swords, Trophy, Skull, Play, Lock, CheckCircle, Shield } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import { PrimusPalusBoard } from './PrimusPalusBoard';
// S7 — whether the player has bought the tavern's rumour on this opponent.  The
// dossier below is READ from OpponentConfig; intel changes nothing a fight computes.
import { hasIntel } from '../../utils/intel';
import { beastIntelLine } from '../../utils/beastHunt';

/** How the opponents' own weapon types read on a rumour card. Display only. */
const WEAPON_LABELS: Record<OpponentConfig['weaponType'], string> = {
  sword_shield: 'Sword & Shield',
  spear: 'Spear',
  dual_blades: 'Dual Blades',
  mace: 'Mace',
};

/** How each boss mechanic reads on a rumour card. Display only. */
const BOSS_MECHANIC_LABELS: Record<NonNullable<OpponentConfig['bossMechanic']>, string> = {
  heavy_telegraph: 'Heavy attacks are telegraphed',
  phase_weapon_switch: 'Changes weapon in the second phase',
  counter_dodge: 'Counters out of a dodge',
  rage_mode_colossus: 'Falls into a rage when wounded',
  // D-1 — the feature-bout signatures, named on the tavern's deep card only.
  // The mechanic itself is inert: no duel branch reads these strings yet.
  beast_hunt: 'Hunts with a beast that crouches, then pounces',
  false_telegraph: 'His wind-ups lie — some are feints',
  unbroken_panoply: 'Fights behind gilt pride-pieces that crack and shrink him',
  yoked_brothers: 'Fights as a pair, crossing to your flank',
  the_long_memory: 'Adapts against whatever attack you lean on',
};

interface TournamentTabProps {
  profile: PlayerProfile;
  onSelectOpponent: (opp: OpponentConfig) => void;
}

export const TournamentTab: React.FC<TournamentTabProps> = ({ profile, onSelectOpponent }) => {
  const currentTierInfo = TOURNAMENT_TIERS.find((t) => t.tier === profile.currentTier) || TOURNAMENT_TIERS[0];
  // D-1 — the ladder list is the ladder only: a Feature Bout is never a rung of
  // the tier the player is fighting in, and it is listed in its own section.
  const tierOpponents = ALL_OPPONENTS.filter(
    (o) => o.tier === profile.currentTier && o.featureBout !== true
  );
  const featureBouts = featureBoutStatuses(profile);

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

      {/* STORY-2 — THE PRIMUS PALUS BOARD, beside the tournament card. */}
      <PrimusPalusBoard profile={profile} />

      {/* OPPONENTS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tierOpponents.map((opp) => {
          const isDefeated = profile.defeatedOpponentIds.includes(opp.id);
          const isLocked = profile.level < opp.recommendedLevel && !isDefeated;
          const hasRumour = hasIntel(profile, opp.id);

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

                {/* S7 — THE TAVERN'S RUMOUR.  Rendered ONLY for an opponent whose
                    rumour the player has bought, from OpponentConfig as it stands:
                    no stat, formula or reward is touched, and every opponent
                    without intel renders exactly the surface it always has. */}
                {hasRumour && (
                  <div
                    data-intel={opp.id}
                    className="mb-4 rounded-xl border border-cyan-700/60 bg-cyan-950/40 p-2.5"
                  >
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-300 mb-1">
                      Tavern rumour — information only
                    </div>
                    <div className="text-[11px] font-mono text-neutral-100">
                      {opp.personality} fighter · {WEAPON_LABELS[opp.weaponType]}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-300">
                      STR {opp.stats.strength} · AGI {opp.stats.agility} · STA{' '}
                      {opp.stats.staminaMax} · REG {opp.stats.staminaRegen} · DEF{' '}
                      {opp.stats.defense} · HP {opp.stats.healthMax}
                    </div>
                    {opp.bossMechanic && (
                      <div className="mt-1 text-[11px] font-mono text-cyan-200">
                        Signature: {BOSS_MECHANIC_LABELS[opp.bossMechanic]}
                      </div>
                    )}
                    {/* D-2 — the beast's published numbers, built from the row by
                        `beastIntelLine` so no figure is restated here. Rumour
                        depth only: the fight computes none of this from a card. */}
                    {opp.beast && (
                      <div
                        data-beast-intel={opp.id}
                        className="mt-1 text-[11px] font-mono text-amber-200"
                      >
                        {beastIntelLine(opp.beast)}
                      </div>
                    )}
                  </div>
                )}

                {/* REWARDS */}
                <div className="flex items-center gap-3 text-xs font-mono bg-neutral-950/80 p-2.5 rounded-xl border border-neutral-800 mb-4">
                  <span className="text-yellow-400 font-bold">from {opp.rewardGold} Gold</span>
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
                className={`w-full min-h-[48px] py-3 rounded-2xl font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
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

      {/* D-1 — FEATURE BOUTS. Bosses faced OUTSIDE the ladder. Every value on
          these cards is DATA: the purse and venue come from the row, the gate's
          words from `featureBoutGateText`, and the availability from the pure
          resolver — nothing here decides either one. A locked bout prints its
          gate in plain words; the card line itself belongs to the pre-fight
          card, at identity-intel depth, not to the arena list. */}
      {featureBouts.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-xs font-serif uppercase tracking-widest text-emerald-300">
              Feature Bouts
            </h3>
            <span className="text-[10px] font-mono text-neutral-500">
              outside the ladder — a win here opens no tier
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featureBouts.map(({ opponent: opp, open, defeated, gateText }) => (
              <div
                key={opp.id}
                data-feature-bout={opp.id}
                data-feature-bout-open={open ? 'true' : 'false'}
                className={`p-5 rounded-3xl border-2 shadow-xl flex flex-col justify-between transition-all ${
                  open
                    ? 'bg-gradient-to-br from-emerald-950/70 to-neutral-900/90 border-emerald-600/70'
                    : 'bg-neutral-900/80 border-neutral-700/60'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                        open
                          ? 'bg-emerald-900 text-emerald-200 border-emerald-500'
                          : 'bg-neutral-800 text-neutral-300 border-neutral-600'
                      }`}
                    >
                      {open ? '⚔ FEATURE BOUT' : '🔒 FEATURE BOUT'}
                    </span>
                    <span className="text-xs font-mono text-neutral-400">LVL {opp.recommendedLevel}</span>
                  </div>

                  <h4 className="font-serif font-black text-lg text-amber-100 mb-0.5">{opp.name}</h4>
                  <div className="text-xs text-neutral-400 font-serif italic mb-4">{opp.title}</div>

                  <div className="flex items-center gap-3 text-xs font-mono bg-neutral-950/80 p-2.5 rounded-xl border border-neutral-800 mb-4">
                    <span className="text-yellow-400 font-bold">from {opp.rewardGold} Gold</span>
                    <span className="text-purple-400 font-bold">+{opp.rewardFame} Fame</span>
                    <span className="text-cyan-400 font-bold">+{opp.rewardXp} XP</span>
                  </div>

                  {!open && gateText && (
                    <p className="text-[11px] font-serif text-amber-200/80 leading-relaxed mb-4">{gateText}</p>
                  )}
                </div>

                <button
                  onClick={() => {
                    sounds.playClick();
                    onSelectOpponent(opp);
                  }}
                  disabled={!open}
                  className={`w-full min-h-[48px] py-3 rounded-2xl font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    !open
                      ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                      : defeated
                      ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 cursor-pointer'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white border border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.45)] cursor-pointer'
                  }`}
                >
                  {!open ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Locked</span>
                    </>
                  ) : defeated ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span>Fight Again (Rematch)</span>
                    </>
                  ) : (
                    <>
                      <Swords className="w-4 h-4" />
                      <span>Enter Arena Duel</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
