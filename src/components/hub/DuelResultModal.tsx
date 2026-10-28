import React from 'react';
import { DuelStatistics, OpponentConfig } from '../../types/game';
import { Trophy, Skull, Coins, Sparkles, Swords, ArrowRight, HeartPulse, Award } from 'lucide-react';
import { getPalma } from '../../data/palmae';
import { injuryBannerLine, type DuelInjuryEvent } from '../../utils/injury';
// C-8.70C — what the grudge's own result was, decided at the same write that
// recorded it (settled on a win, closed until the tier's next standard win).
import { grudgeResultLine, grudgeRewardLine } from '../../utils/grudgeBouts';
// C-8.70C — the bout mode's own purse and renown lines, from the same data the
// pre-fight card promised them with.
import { BOUT_MODES } from '../../data/boutModes';
import { CoachCard } from '../ui/CoachCard';
import { getCoachCard } from '../../utils/coachMarks';
import confetti from 'canvas-confetti';
import { sounds } from '../../audio/soundEffects';

interface DuelResultModalProps {
  didWin: boolean;
  opponent: OpponentConfig;
  stats: DuelStatistics;
  /**
   * STORY-2 — the beats' own lines for this result, decided at the write: the
   * Doctore's reading of a first novice bout, and the Doctore's Test's verdict
   * (a win outside the chosen rule says so plainly). Empty or absent on every
   * other duel, so the modal renders exactly as it always has.
   */
  storyLines?: string[];
  /**
   * S4 — what this duel did to the injury, decided at the same write that saved
   * the profile: a fresh wound on a loss (the banner names its own numbers), or
   * the wound this duel closed. A duel that only advances a live injury's clock
   * carries `null` and adds nothing.
   */
  injuryEvent?: DuelInjuryEvent | null;
  /** The player's purse after the duel, so the reward reads as spendable gold. */
  goldTotal?: number;
  /**
   * CL-3 — the Doctore's beat for this result (D8, on a profile's first loss),
   * already decided and seen-gated by App through `evaluateBeats`. Absent on
   * every other result, so the modal renders exactly as it always has.
   */
  coachCardId?: string | null;
  onCoachCardDismiss?: (id: string) => void;
  /**
   * CH-5 — the palma ids this victory newly unlocked, decided at the same write
   * that saved them.  Empty or absent on every other duel (and always on a
   * defeat), so the modal renders exactly as it always has.
   */
  palmaEarned?: string[];
  /**
   * PITCH A1 — what Fortuna's omen did in this bout, decided at the same write
   * that consumed it: the fame (or gold and fame) it added, or that it was spent
   * unpaid. Absent on every bout fought with no omen live.
   */
  omenLine?: string | null;
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
  storyLines,
  injuryEvent,
  goldTotal,
  coachCardId,
  onCoachCardDismiss,
  palmaEarned,
  omenLine,
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

  // CH-5 — the palms this victory unlocked, resolved from the palmae data by id.
  const earnedPalmae = (palmaEarned ?? [])
    .map((id) => getPalma(id))
    .filter((palma) => palma !== undefined);

  // C-8.70C — the mode this victory was fought under. It rides the in-memory
  // statistics object; a Sand win shows no mode line, because ×1.00 is no change.
  const boutModeDef = stats.boutMode ? BOUT_MODES[stats.boutMode] : undefined;
  const showsModeLines = Boolean(boutModeDef && boutModeDef.id !== 'sand');

  // CL-3 — the first loss's beat. It is dismissed by its ✕ (App records it seen
  // through the same `markSeen` write the hub uses) or by continuing past it, and
  // never before it has rendered: both handlers run from the card itself.
  const resultBeatCard = coachCardId ? getCoachCard(coachCardId) : undefined;
  const handleContinue = () => {
    if (resultBeatCard && coachCardId) onCoachCardDismiss?.(coachCardId);
    onContinue();
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md z-40 flex items-center justify-center p-4">
      {resultBeatCard && coachCardId && (
        <CoachCard
          id={coachCardId}
          card={resultBeatCard}
          placement="top"
          onDismiss={() => onCoachCardDismiss?.(coachCardId)}
        />
      )}
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

          <h3 className="anim-stamp font-serif font-black text-3xl sm:text-4xl uppercase tracking-wider mb-1">
            {didWin ? 'VICTORY!' : 'DEFEAT'}
          </h3>
          <p className="text-xs font-serif text-neutral-400">
            {didWin ? `You defeated ${opponent.name} in the sand!` : `Felled by ${opponent.name}. Recover your strength!`}
          </p>
        </div>

        {/* STORY-2 — the beats' lines: the Doctore speaking over the result. */}
        {storyLines && storyLines.length > 0 && (
          <div
            data-duel-story-lines={storyLines.length}
            className="bg-neutral-950/80 border border-amber-700/50 rounded-2xl p-4 mb-4 flex flex-col gap-2"
          >
            {storyLines.map((line) => (
              <p key={line} className="text-xs sm:text-[13px] font-serif italic text-amber-100/90 leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        )}

        {/* C-8.70C Slice C-D — WHY YOU FELL. A DEFEAT only: at most three
            plain, factual lines computed in the duel from its own tallies (the
            damage by class, the mechanic that landed, the crowd's verdict, the
            player's mix). In memory only — nothing here was saved. Victory
            results are unchanged. */}
        {!didWin && stats.whyYouFell && stats.whyYouFell.length > 0 && (
          <div
            data-why-you-fell={stats.whyYouFell.length}
            className="bg-neutral-950/80 border border-neutral-700/70 rounded-2xl p-4 mb-4 flex flex-col gap-1.5"
          >
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400">
              How it went
            </div>
            {stats.whyYouFell.map((line) => (
              <p
                key={line}
                className="text-xs sm:text-[13px] font-serif text-neutral-200 leading-relaxed"
              >
                {line}
              </p>
            ))}
          </div>
        )}

        {/* PITCH A1 — FORTUNA'S OMEN.  One line, outside the staged reveal, on a
            win and a defeat alike: the fame (or gold and fame) the omen added, or
            that it was spent unpaid.  Decided at the write that consumed it. */}
        {omenLine && (
          <p
            data-duel-omen
            className="text-xs sm:text-[13px] font-serif italic text-amber-200/90 leading-relaxed mb-4"
          >
            {omenLine}
          </p>
        )}

        {/* C-8.70C — THE GRUDGE'S OWN RESULT. A win settles it for good; a loss
            leaves it standing until a standard bout at its tier is won. Read
            from the row this duel was fought with. */}
        {opponent.grudge && (
          <div className="mb-4">
            <p
              data-duel-grudge={didWin ? 'settled' : 'open'}
              className="text-xs sm:text-[13px] font-serif italic text-amber-200/90 leading-relaxed"
            >
              {grudgeResultLine(opponent, didWin)}
            </p>
            {/* C-TRAIT — the purse the grudge paid, composed from the venue tier's
                floor regular x this bout's mode multipliers (design C3d). */}
            <p
              data-duel-grudge-purse={stats.boutMode ?? 'sand'}
              className="mt-1 text-[11px] font-mono text-neutral-300 leading-relaxed"
            >
              {grudgeRewardLine(opponent, stats.boutMode ?? 'sand')}
            </p>
          </div>
        )}

        {/* D-2 — the beast hunt's own epilogue, computed in the duel from its
            duel-session state alone (no save field): the beast driven off or gone
            with its master's fall. Absent on every other result. */}
        {/* D-5 — Hermas's adaptation log: computed IN MEMORY at result time from
            the duel's own live mix counter and adaptation state, and carried on
            the statistics object exactly as the beast's epilogue is. One line per
            threshold he read, in numbers; absent on every other result. */}
        {stats.adaptationLines && stats.adaptationLines.length > 0 && (
          <div
            data-long-memory-lines={stats.adaptationLines.length}
            className="bg-neutral-950/80 border border-amber-800/50 rounded-2xl p-3 mb-4 flex flex-col gap-1.5"
          >
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
              The long memory
            </div>
            {stats.adaptationLines.map((line) => (
              <p
                key={line}
                className="text-xs sm:text-[13px] font-mono text-amber-100/90 leading-relaxed"
              >
                {line}
              </p>
            ))}
          </div>
        )}

        {stats.beastEpilogue && (
          <p
            data-beast-epilogue="1"
            className="text-xs sm:text-[13px] font-serif italic text-amber-200/90 leading-relaxed mb-4"
          >
            {stats.beastEpilogue}
          </p>
        )}

        {/* CH-5 — PALMA EARNED.  Outside the staged reveal: a new palm is the
            consequence of the fight, not one of its reward figures. */}
        {earnedPalmae.length > 0 && (
          <div
            data-duel-palma-earned={earnedPalmae.map((palma) => palma.id).join(',')}
            className="bg-amber-950/40 border border-amber-500/70 rounded-2xl p-4 mb-4 flex items-start gap-2 font-serif text-xs sm:text-[13px] leading-relaxed text-amber-100"
          >
            <Award className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" />
            <span>
              <strong className="text-amber-300 uppercase tracking-wider">Palma earned</strong>
              {' — '}
              {earnedPalmae.map((palma) => palma.name).join(', ')}.
              <span className="block text-[11px] italic text-amber-200/80 mt-0.5">
                Wear it in Gladiator Stats, as far as your tier allows.
              </span>
            </span>
          </div>
        )}

        {/* S4 — the wound this duel dealt (or closed).  Outside the staged
            reveal: it is the consequence of the fight, not a reward line. */}
        {injuryEvent && (
          <div
            data-duel-injury={injuryEvent.kind}
            className={`rounded-2xl border p-4 mb-4 flex items-start gap-2 font-serif text-xs sm:text-[13px] leading-relaxed ${
              injuryEvent.kind === 'inflicted'
                ? 'bg-red-950/50 border-red-600/60 text-red-200'
                : 'bg-emerald-950/40 border-emerald-600/50 text-emerald-200'
            }`}
          >
            <HeartPulse
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                injuryEvent.kind === 'inflicted' ? 'text-red-400' : 'text-emerald-400'
              }`}
            />
            <span>
              {injuryEvent.kind === 'inflicted'
                ? injuryBannerLine(injuryEvent.injury)
                : 'Injury healed.'}
            </span>
          </div>
        )}

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
                  {/* C-8.70C — the mode line, before the bounty it multiplied. */}
                  {showsModeLines && boutModeDef && (
                    <div
                      className="flex justify-between text-amber-300"
                      data-duel-bout-mode-gold={boutModeDef.id}
                    >
                      <span>{boutModeDef.name} purse</span>
                      <span>×{boutModeDef.goldMultiplier.toFixed(2)} gold</span>
                    </div>
                  )}
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
                  {/* C-8.70C — the crowd's peak bonus, its own line item. It is
                      already inside the Gold Earned total above. */}
                  {typeof stats.crowdPeakGoldBonus === 'number' && stats.crowdPeakGoldBonus > 0 && (
                    <div className="flex justify-between" data-duel-crowd-peak-gold={stats.crowdPeakGoldBonus}>
                      <span>Crowd Peak</span>
                      <span>+{stats.crowdPeakGoldBonus}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span className="text-purple-400">Fame Gained:</span>
                <span data-testid="duel-reward-fame" className="text-purple-400">+{counted.fame}</span>
              </div>
              {/* C-8.70C — the crowd's own fame line items. Both are already
                  inside Fame Gained above; these say WHERE it came from. */}
              {typeof stats.crowdPeakFameBonus === 'number' && stats.crowdPeakFameBonus > 0 && (
                <div
                  className="text-[11px] text-purple-300/90 pl-3 ml-1 border-l border-purple-900/60"
                  data-duel-crowd-peak-fame={stats.crowdPeakFameBonus}
                >
                  Crowd&apos;s favor: +{stats.crowdPeakFameBonus} fame
                </div>
              )}
              {stats.crowdTurned && (
                <div
                  className="text-[11px] text-red-300 pl-3 ml-1 border-l border-red-900/60"
                  data-duel-crowd-turned="1"
                >
                  The crowd turned — fame reduced
                </div>
              )}
              {/* C-8.70C — the mode's renown multiplier, the figure the card
                  promised; the crowd's peak/turned lines above already compose it. */}
              {showsModeLines && boutModeDef && (
                <div
                  className="text-[11px] text-amber-300 pl-3 ml-1 border-l border-amber-900/60"
                  data-duel-bout-mode-fame={boutModeDef.id}
                >
                  {boutModeDef.name} renown: ×{boutModeDef.fameMultiplier.toFixed(2)} fame
                </div>
              )}
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
          onClick={handleContinue}
          className={`btn-press w-full py-4 rounded-2xl font-serif font-black text-sm uppercase tracking-wider cursor-pointer shadow-xl flex items-center justify-center gap-2 ${
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
