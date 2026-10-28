import React, { useState } from 'react';
import { BoutMode, OpponentConfig } from '../../types/game';
import { Swords, Trophy, Coins, Zap, Shield, Skull } from 'lucide-react';
// C-8.70C — the three bout modes and the plain-language list of EVERY effect,
// built from the same data the duel reads. The choice is session-only: it starts
// on Sand every time and is never written to a save.
import {
  BOUT_MODES,
  BOUT_MODE_ORDER,
  DEFAULT_BOUT_MODE,
  boutModeEffectLines,
} from '../../data/boutModes';
import type { BeatLine, DoctoreTestRestriction } from '../../utils/storyBeats';
import { doctoreRestrictionSpec } from '../../utils/storyBeats';
import { getArmatura } from '../../data/armaturae';
import { getPalma, type Palma } from '../../data/palmae';
// Day/Night T3 — the hour the bout is fought in, as FLAVOUR COPY: the duel card's own
// Latin phase line. Availability, mode and every figure on this card are untouched.
import { DEFAULT_PHASE } from '../../utils/atmosphere';
import { duelPhaseLine } from '../../utils/phaseFlavor';
import type { TimePhase } from '../../utils/timeState';
// C-8.70C — the grudge's two sentences, built from the generated row itself.
import {
  grudgeProfileLine,
  grudgeRewardLine,
  grudgeStudiedLine,
  grudgeTraitLine,
} from '../../utils/grudgeBouts';

interface PreFightModalProps {
  opponent: OpponentConfig;
  /** C-8.70C — the chosen bout mode travels to App, which hands it to the duel. */
  onConfirm: (mode: BoutMode) => void;
  onCancel: () => void;
  /**
   * STORY-2 — the beat's NARRATION on this card (the novice bout's briefing).
   * Words from a voice, never intel: the card's intel block below is unchanged.
   */
  narration?: readonly BeatLine[];
  /**
   * STORY-2 — the restriction the player chose for the Doctore's Test, printed
   * back on the card so the rule and its reason are still in front of them when
   * they step into the sand (the Clarity law).
   */
  restriction?: DoctoreTestRestriction | null;
  /**
   * Day/Night T3 — the clock's phase when the card was opened. Optional: a caller that
   * passes nothing shows the staging default's line, exactly as the city does.
   */
  phase?: TimePhase;
}

export const PreFightModal: React.FC<PreFightModalProps> = ({
  opponent,
  onConfirm,
  onCancel,
  narration,
  restriction,
  phase = DEFAULT_PHASE,
}) => {
  // T3 — a boss card always reads as an evening spectacle; every other hour names the
  // light, and a regular bout at Nox offers the torches in words.
  const hourLine = duelPhaseLine(phase, opponent.isBoss === true);
  // Session-only, defaulting to Sand on every opening (no preference exists to
  // remember this in the profile).
  const [boutMode, setBoutMode] = useState<BoutMode>(DEFAULT_BOUT_MODE);
  const modeDef = BOUT_MODES[boutMode];
  const modeEffects = boutModeEffectLines(boutMode, opponent);
  const restrictionSpec = doctoreRestrictionSpec(restriction ?? null);
  /**
   * CH-5 — SCOUTING INTEL, read-only.  The opponent's class, its doctrina and the
   * palms it carries all come from CH-4's own config data; nothing is derived here
   * and nothing is written.  A config without a class or a palm adds no row.
   */
  const armatura = opponent.armatura ? getArmatura(opponent.armatura) : undefined;
  const palmae = (opponent.palmae ?? [])
    .map((id) => getPalma(id))
    .filter((palma): palma is Palma => Boolean(palma));

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
      {/* A centred dialog: `data-origin="center"` is the transport-free panel variant. */}
      <div
        className="anim-panel bg-neutral-900 border-2 border-red-500/80 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-amber-100"
        data-origin="center"
      >
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

        {/* Day/Night T3 — THE HOUR. Flavour copy only: the light the bout will be
            fought in, in the design's own Latin card line. Nothing here offers, gates or
            prices anything. */}
        <div
          data-prefight-phase={phase}
          data-prefight-night-state={opponent.isBoss === true ? 'spectacle' : phase === 'night' ? 'torchlit' : 'day'}
          className="bg-neutral-950 border border-amber-700/50 rounded-2xl px-4 py-3 mb-4"
        >
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 mb-1">
            The Hour
          </div>
          <p className="text-xs sm:text-[13px] font-serif italic text-amber-100/90 leading-relaxed">
            {hourLine.headline}
          </p>
          {hourLine.offer && (
            <p className="mt-1 text-[11px] font-serif text-neutral-300 leading-relaxed">
              {hourLine.offer}
            </p>
          )}
        </div>

        {/* STORY-2 — the beat's framing: voices, not statistics. */}
        {narration && narration.length > 0 && (
          <div
            data-prefight-narration
            className="bg-amber-950/30 border border-amber-700/40 rounded-2xl p-4 mb-4 flex flex-col gap-3"
          >
            {narration.map((entry) => (
              <div key={entry.speaker}>
                <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
                  {entry.speaker}
                </div>
                <p className="text-xs sm:text-[13px] font-serif italic text-amber-100/90 leading-relaxed">
                  “{entry.line}”
                </p>
              </div>
            ))}
          </div>
        )}

        {/* C-8.70C + C-TRAIT — A GRUDGE BOUT, in plain language: that this is a
            grudge, what the rival studied (from his generated row), his profile
            before → after, the EVOLVED TRAIT he now carries (design C3b — the
            slot is never null, so its row is printed by name and effect), and the
            purse the venue tier pays before the chosen mode multiplies it. */}
        {opponent.grudge && (
          <div
            data-prefight-grudge={opponent.grudge.baseId}
            className="bg-neutral-950 border border-rose-700/60 rounded-2xl p-4 mb-4"
          >
            <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 mb-1">
              Grudge Bout
            </div>
            <p className="text-xs sm:text-[13px] font-serif italic text-amber-100/90 leading-relaxed">
              {grudgeStudiedLine(opponent)}
            </p>
            <div className="mt-2 text-[11px] font-mono text-neutral-300">
              {grudgeProfileLine(opponent.grudge)}
            </div>
            <div
              data-prefight-grudge-trait={opponent.grudge.evolvedTrait}
              className="mt-1 text-[11px] font-mono text-rose-200"
            >
              {grudgeTraitLine(opponent)}
            </div>
            <div
              data-prefight-grudge-purse={boutMode}
              className="mt-1 text-[11px] font-mono text-neutral-300"
            >
              {grudgeRewardLine(opponent, boutMode)}
            </div>
          </div>
        )}

        {/* STORY-2 — the Doctore's Test prints the chosen rule and its reason. */}
        {restrictionSpec && (
          <div
            data-prefight-restriction={restrictionSpec.id}
            className="bg-neutral-950 border border-orange-600/50 rounded-2xl p-4 mb-4"
          >
            <div className="text-[10px] font-mono uppercase tracking-wider text-orange-400 mb-1">
              The Doctore’s Test — {restrictionSpec.name}
            </div>
            <p className="text-xs font-serif text-amber-100 leading-relaxed">{restrictionSpec.rule}</p>
            <p className="text-[11px] font-serif italic text-neutral-400 mt-1 leading-relaxed">
              {restrictionSpec.reason}
            </p>
          </div>
        )}

        {/* D-1 — A FEATURE BOUT'S CARD LINE, verbatim from its row. Identity
            intel only: who he is and how he fights, in the design's own words.
            The mechanic's numbers stay on the Tavern's deep card. */}
        {opponent.featureBout === true && opponent.cardLine && (
          <div
            data-prefight-card-line={opponent.id}
            className="bg-neutral-950 border border-emerald-800/60 rounded-2xl p-4 mb-4"
          >
            <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 mb-1">
              The Bookmaker’s Line
            </div>
            <p className="text-xs sm:text-[13px] font-serif italic text-amber-100/90 leading-relaxed">
              {opponent.cardLine}
            </p>
          </div>
        )}

        {/* C-8.70C — BOUT MODE. Touch-first: three targets in one row, each at
            least 48px tall; beneath them EVERY effect of the chosen mode is
            listed in plain language, built from the same data the duel reads, so
            the player commits with full information. */}
        <div
          data-prefight-mode
          className="bg-neutral-950 border border-amber-700/50 rounded-2xl p-4 mb-4"
        >
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 mb-2">
            Bout Mode
          </div>
          <div role="group" aria-label="Bout mode" className="grid grid-cols-3 gap-2 mb-3">
            {BOUT_MODE_ORDER.map((id) => {
              const def = BOUT_MODES[id];
              const selected = id === boutMode;
              return (
                <button
                  key={id}
                  type="button"
                  data-bout-mode={id}
                  data-selected={selected ? 'true' : 'false'}
                  aria-pressed={selected}
                  onClick={() => setBoutMode(id)}
                  className={`btn-press min-h-[48px] px-2 rounded-xl border font-serif font-black text-[11px] uppercase tracking-wider cursor-pointer ${
                    selected
                      ? 'bg-amber-500/25 border-amber-300 text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.35)]'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-amber-200'
                  }`}
                >
                  {def.name}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] font-serif italic text-amber-200/80 mb-2">{modeDef.tagline}</p>
          <ul data-bout-mode-effects={boutMode} className="flex flex-col gap-1.5">
            {modeEffects.map((line) => (
              <li key={line} className="text-[11px] font-mono text-neutral-300 leading-relaxed">
                {line}
              </li>
            ))}
          </ul>
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
            <span className="text-neutral-400">Base Bounty:</span>
            <span className="text-yellow-400">from {opponent.rewardGold} Gold</span>
          </div>
        </div>

        {/* CH-5 — SCOUTING INTEL.  What the opponent fights as, and what it
            carries.  Read-only: the card reports the config, it changes nothing. */}
        {(armatura || palmae.length > 0) && (
          <div
            data-prefight-scouting
            className="bg-neutral-950 p-4 rounded-2xl border border-amber-800/60 mb-6 flex flex-col gap-2 font-mono text-xs"
          >
            {armatura && (
              <div data-scouting-armatura={armatura.id}>
                <div className="flex justify-between gap-3">
                  <span className="text-neutral-400">Armatura:</span>
                  <span className="text-amber-200 text-right">{armatura.name}</span>
                </div>
                <p className="text-[11px] font-serif text-neutral-400 mt-1">
                  <span className="text-amber-300">{armatura.doctrina.name}</span> — {armatura.doctrina.text}
                </p>
              </div>
            )}
            {palmae.map((palma) => (
              <div key={palma.id} data-scouting-palma={palma.id} className="flex justify-between gap-3">
                <span className="text-neutral-400">Palma · {palma.name}:</span>
                <span className="text-right text-neutral-300 text-[11px] font-serif">{palma.description}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="btn-press flex-1 min-h-[48px] py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-serif font-bold text-xs uppercase cursor-pointer"
          >
            Retreat
          </button>
          <button
            onClick={() => onConfirm(boutMode)}
            className="btn-press flex-1 min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-serif font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg"
          >
            Step into Sand
          </button>
        </div>
      </div>
    </div>
  );
};
