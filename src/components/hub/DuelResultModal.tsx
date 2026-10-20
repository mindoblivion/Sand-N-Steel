import React from 'react';
import { DuelStatistics, OpponentConfig } from '../../types/game';
import { Trophy, Skull, Coins, Sparkles, Swords, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../../audio/soundEffects';

interface DuelResultModalProps {
  didWin: boolean;
  opponent: OpponentConfig;
  stats: DuelStatistics;
  /** The player's purse after the duel, so the reward reads as spendable gold. */
  goldTotal?: number;
  onContinue: () => void;
}

/**
 * The staged reveal, in ms from mount at the winning pace: the header is already
 * there at 0, the recap lifts in at 250, the two recap lines the result never
 * showed (Max Combo, Crowd Peak) at 550, and the rewards at 800.  A defeat runs
 * the same ceremony at 1.4× — 350 / 770 — and never reaches a rewards stage.
 */
const STAGE_RECAP_MS = 250;
const STAGE_EXTRA_MS = 550;
const STAGE_REWARDS_MS = 800;
const DEFEAT_PACE = 1.4;
/** The reward figures count up from zero to their values over this long. */
const COUNT_UP_MS = 600;

/**
 * A block that has not been revealed yet keeps its space, so the card never changes
 * height mid-ceremony and the Continue button never moves under the player's thumb.
 * Transform and opacity only (the house motion rule); the 500ms transition is the
 * `duration-500` in the class list below.
 */
const revealClass = (revealed: boolean): string =>
  `transition-[opacity,transform] duration-500 ease-out ${
    revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
  }`;

export const DuelResultModal: React.FC<DuelResultModalProps> = ({
  didWin,
  opponent,
  stats,
  goldTotal,
  onContinue,
}) => {
  const pace = didWin ? 1 : DEFEAT_PACE;
  // 0 = header only, 1 = recap, 2 = the two extra recap lines, 3 = rewards.
  const [stage, setStage] = React.useState(0);
  const [counted, setCounted] = React.useState({ gold: 0, fame: 0, xp: 0 });

  // House motion rule: a player who asked the system for less motion gets the whole
  // result at once — the same blocks, already in place, with the count-up's two
  // clinks still marking the reward figures.
  const [reducedMotion, setReducedMotion] = React.useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

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

  // The staged reveal itself.  The Continue button is deliberately not part of it:
  // it is there from t=0 and closes the modal through the existing onContinue,
  // however early it is tapped.
  React.useEffect(() => {
    if (reducedMotion) {
      setStage(didWin ? 3 : 2);
      return;
    }
    const timers = [
      setTimeout(() => setStage(1), STAGE_RECAP_MS * pace),
      setTimeout(() => setStage(2), STAGE_EXTRA_MS * pace),
    ];
    if (didWin) timers.push(setTimeout(() => setStage(3), STAGE_REWARDS_MS * pace));
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [didWin, pace, reducedMotion]);

  // Gold, Fame and XP count up from zero to exactly what the duel paid: one coin clink
  // when the first frame of the count-up starts, one when it completes.  The frames are
  // cancelled on unmount and the last frame writes the stats' own values — never a
  // rounding of them.  `sounds` self-checks the app's mute state, like every other call.
  const revealRewards = didWin && stage >= 3;
  React.useEffect(() => {
    if (!revealRewards) return;
    const gold = stats.goldEarned;
    const fame = stats.fameEarned;
    const xp = stats.xpEarned;
    let startedAt = 0;
    let firstFrame = true;
    let frame = 0;

    const tick = (now: number) => {
      if (firstFrame) {
        firstFrame = false;
        startedAt = now;
        sounds.playCoin();
      }
      const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
      if (progress < 1) {
        setCounted({
          gold: Math.round(gold * progress),
          fame: Math.round(fame * progress),
          xp: Math.round(xp * progress),
        });
        frame = requestAnimationFrame(tick);
      } else {
        setCounted({ gold, fame, xp });
        sounds.playCoin();
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [revealRewards, stats.goldEarned, stats.fameEarned, stats.xpEarned]);

  // Addendum A — "Fell at X% of <opponent>'s HP remaining" on a defeat.  The modal is
  // handed no final-HP value, but it needs none: DuelScene puts the opponent on
  // `opponent.stats.healthMax` and removes exactly `stats.damageDealt` from it over the
  // fight, with no healing anywhere in the scene.  Nothing was rewired for this line; if
  // the max is missing or unusable the line is simply absent.
  const opponentHpRemainingPercent = React.useMemo(() => {
    if (didWin) return null;
    const maxHp = opponent.stats?.healthMax;
    if (typeof maxHp !== 'number' || !Number.isFinite(maxHp) || maxHp <= 0) return null;
    const remaining = Math.max(0, maxHp - stats.damageDealt);
    return Math.round((remaining / maxHp) * 100);
  }, [didWin, opponent.stats?.healthMax, stats.damageDealt]);

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

        {/* COMBAT RECAP — in at 250ms (350 on a defeat) */}
        <div
          className={`bg-neutral-950 p-4 rounded-2xl border border-neutral-800 mb-6 flex flex-col gap-2 font-mono text-xs ${revealClass(
            stage >= 1,
          )}`}
        >
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

          {/* The two lines the statistics always carried but the recap never showed —
              in at 550ms (770 on a defeat), win and defeat alike. */}
          <div className={`flex flex-col gap-2 ${revealClass(stage >= 2)}`}>
            <div className="flex justify-between">
              <span className="text-neutral-400">Max Combo:</span>
              <span className="text-amber-300">x{stats.maxCombo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Crowd Peak:</span>
              <span className="text-amber-300">{stats.crowdHypePeak}%</span>
            </div>
          </div>

          {/* Addendum A — how much of the opponent was still standing.  Defeat only. */}
          {opponentHpRemainingPercent !== null && (
            <div className="text-neutral-400">
              Fell at <span className="text-red-400 font-bold">{opponentHpRemainingPercent}%</span> of{' '}
              {opponent.name}&apos;s HP remaining
            </div>
          )}

          {didWin && (
            <div className={`flex flex-col gap-2 ${revealClass(stage >= 3)}`}>
              <div className="h-px bg-neutral-800 my-1"></div>
              <div className="flex justify-between font-bold">
                <span className="text-yellow-400">Gold Earned:</span>
                <span data-testid="duel-reward-gold" className="text-yellow-400">+{counted.gold}</span>
              </div>
              {stats.goldBreakdown && (
                <div className="pl-3 ml-1 flex flex-col gap-1 text-[11px] text-neutral-400 border-l border-amber-900/70">
                  <div className="flex justify-between">
                    <span>Victory Bounty</span>
                    <span>+{stats.goldBreakdown.base}</span>
                  </div>
                  {stats.goldBreakdown.hype > 0 && (
                    <div className="flex justify-between">
                      <span>Crowd Favour</span>
                      <span>+{stats.goldBreakdown.hype}</span>
                    </div>
                  )}
                  {stats.goldBreakdown.precision > 0 && (
                    <div className="flex justify-between">
                      <span>Perfect Blocks</span>
                      <span>+{stats.goldBreakdown.precision}</span>
                    </div>
                  )}
                  {stats.goldBreakdown.flawless > 0 && (
                    <div className="flex justify-between">
                      <span>Flawless Victory</span>
                      <span>+{stats.goldBreakdown.flawless}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span className="text-purple-400">Fame Gained:</span>
                <span data-testid="duel-reward-fame" className="text-purple-400">+{counted.fame}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-cyan-400">XP Earned:</span>
                <span data-testid="duel-reward-xp" className="text-cyan-400">+{counted.xp}</span>
              </div>
              {typeof goldTotal === 'number' && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Purse Now:</span>
                  <span className="text-yellow-300">{goldTotal} Gold</span>
                </div>
              )}
            </div>
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
