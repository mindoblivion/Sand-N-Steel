import React from 'react';
import { Swords, Lock, CheckCircle, Coins, Skull } from 'lucide-react';
import type { OpponentConfig, PlayerProfile } from '../../types/game';
import { legendBoutsView, resolveEchoWon, isLegendBoutStaged } from '../../utils/librarianChain';

/**
 * STORY-5b — THE LEGEND BOUTS, on the tournament tab.
 *
 * STORY-5b — Director ruling R6: this slice BUILDS Beat 4's slot on the
 * tournament tab (the slot did not exist before it). It builds the slot, not
 * Beat 4's story content: three exhibitions and the echo bout, all staged
 * EXISTING roster rows (R5's authored staging).
 *
 * The section holds NO rule. Every unlock, gate sentence, staged row and purse
 * comes from `utils/librarianChain.ts`; the purse is the row's own `rewardGold`,
 * printed and never restated. It writes nothing — an exhibition is entered
 * through `onEnterBout`, and `App` marks the bout as the slice's own so the duel
 * result path skips the ladder bookkeeping (Director ruling R4).
 *
 * Before the Librarian chain completes there is no section at all: the fragment
 * sequence has not opened, so nothing here is even sealed (R1).
 */
interface LegendBoutsSectionProps {
  profile: PlayerProfile;
  /** Enter a legend bout — the dressed row, marked as an exhibition by `App`. */
  onEnterBout: (opponent: OpponentConfig) => void;
}

export const LegendBoutsSection: React.FC<LegendBoutsSectionProps> = ({
  profile,
  onEnterBout,
}) => {
  const view = legendBoutsView(profile);
  if (!view.visible) return null;

  const echoSpoken = resolveEchoWon(profile);
  const cards = [...view.exhibitions, ...(view.echo ? [view.echo] : [])];

  return (
    <div data-legend-bouts className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xs font-serif uppercase tracking-widest text-amber-300">
          Legend Bouts
        </h3>
        <span className="text-[10px] font-mono text-neutral-500">
          exhibitions of the erased champion — repeatable, and outside the ladder
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(({ bout, opponent, unlocked, gateText }) => {
          if (!opponent) return null;
          const isEcho = bout.key === 'echo';
          return (
            <div
              key={bout.key}
              data-legend-bout={bout.key}
              data-legend-bout-open={unlocked ? 'true' : 'false'}
              className={`p-5 rounded-3xl border-2 shadow-xl flex flex-col justify-between transition-all ${
                unlocked
                  ? 'bg-gradient-to-br from-amber-950/70 to-neutral-900/90 border-amber-600/70'
                  : 'bg-neutral-900/80 border-neutral-700/60'
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                      unlocked
                        ? 'bg-amber-900 text-amber-200 border-amber-500'
                        : 'bg-neutral-800 text-neutral-300 border-neutral-600'
                    }`}
                  >
                    {unlocked ? (isEcho ? '☠ ECHO BOUT' : '⚔ EXHIBITION') : isEcho ? '🔒 ECHO BOUT' : '🔒 EXHIBITION'}
                  </span>
                  <span className="text-xs font-mono text-neutral-400">
                    LVL {opponent.recommendedLevel}
                  </span>
                </div>

                <h4 className="font-serif font-black text-lg text-amber-100 mb-0.5">
                  {bout.staging}
                </h4>
                <div className="text-xs text-neutral-400 font-serif italic mb-3">
                  {bout.subtitle}
                </div>

                {/* The reveal line itself is spoken ONCE, at the first victory (the result
                    screen). The card only records that it was spoken — it never repeats it. */}
                {isEcho && echoSpoken && (
                  <p
                    data-legend-echo-spoken
                    className="text-[11px] font-serif text-amber-200/90 leading-relaxed mb-3"
                  >
                    He has been named once, out loud. The city is still deciding what it heard.
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs font-mono bg-neutral-950/80 p-2.5 rounded-xl border border-neutral-800 mb-4">
                  <span className="text-yellow-400 font-bold flex items-center gap-1">
                    <Coins className="w-3 h-3" />
                    from {opponent.rewardGold} Gold
                  </span>
                  <span className="text-cyan-400 font-bold flex items-center gap-1">
                    <Skull className="w-3 h-3" />
                    vs {opponent.name}
                  </span>
                </div>

                {!unlocked && (
                  <p className="text-[11px] font-serif text-amber-200/80 leading-relaxed mb-4">
                    {gateText}
                  </p>
                )}
              </div>

              <button
                onClick={() => onEnterBout(opponent)}
                disabled={!unlocked}
                className={`w-full min-h-[48px] py-3 rounded-2xl font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  !unlocked
                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-neutral-950 border border-amber-200 shadow-lg cursor-pointer'
                }`}
              >
                {!unlocked ? (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Locked</span>
                  </>
                ) : echoSpoken && isEcho ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span>Fight the Echo Again</span>
                  </>
                ) : (
                  <>
                    <Swords className="w-4 h-4" />
                    <span>Enter Exhibition</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] font-mono text-neutral-500">
        An exhibition pays the staged row&apos;s own purse and moves nothing on the ladder: no
        tier, no grudge, no mercy, no omen, no fought record.
      </p>
    </div>
  );
};

/** The staged-row predicate, re-exported for callers that already import this file. */
export { isLegendBoutStaged };
