import React from 'react';
import type { OpponentConfig, PlayerProfile } from '../../types/game';
import {
  DICE_CHOICE_COST_LINES,
  DICE_CHOICE_LINES,
  DICE_CHAIN_LAUDES,
  DICE_DEEP_CARD_PRICE,
  DICE_RUMORS,
  HOUSE_CUP_LINE,
  PISO_OFFER_LINE,
  QUIET_DICE_BACKSTORY_LINE,
  QUIET_DICE_CLOSING_LINE,
  QUIET_DICE_STEP_LINES,
  TAVERN_WINE_LINE,
  diceTrailView,
  isRumourServiceClosed,
  type DiceChoice,
} from '../../utils/diceTrail';

interface DiceTrailSectionProps {
  profile: PlayerProfile;
  /**
   * Enter a trail bout.  A staged ladder ROW, fought as a standard duel: the
   * panel owns no transaction and writes nothing, exactly as the bounty board
   * does.  `App` marks the bout as the trail's own so the victory records the
   * card and STORY-4a's mercy never fires on it.
   */
  onEnterBout: (opponent: OpponentConfig) => void;
  /** Answer Piso.  The write (and the 300 g, for 'cut') lives in `App`. */
  onChooseEnding: (choice: DiceChoice) => void;
}

const STEP_TITLES = ['Buy a true thing.', 'His champion, then.', 'Tell me what he said.'] as const;

/**
 * STORY-5a — THE DICE TRAIL, as a SECTION of the tavern intel panel (Director
 * ruling R6): one panel, one interaction, under Aelia Prisca's existing plate.
 *
 * It draws three things in the order the player earns them — the QUIET DICE
 * chain (§2.4's run-up), the rumour BOARD (§3A) that the chain's closing line
 * opens, and Piso's offer at the end — and it holds NO rule of its own: every
 * step state, unlock, price, offer condition and consequence line comes from
 * `utils/diceTrail.ts`.  It writes nothing.
 */
export const DiceTrailSection: React.FC<DiceTrailSectionProps> = ({
  profile,
  onEnterBout,
  onChooseEnding,
}) => {
  const view = diceTrailView(profile);
  const rumoursClosed = isRumourServiceClosed(profile);

  const stepDone = [view.step1Done, view.step2Done, view.boardOpen];

  return (
    <div data-dice-trail className="mt-4 border-t border-amber-700/50 pt-3">
      <h5 className="font-serif font-black text-amber-200 text-[11px] sm:text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
        <span>The Loaded Dice</span>
      </h5>

      {/* The house cup's flavour, worn by the counter itself. PURE FLAVOUR: the
          line changes and nothing else does — no mechanic wears this cup. */}
      <p
        data-tavern-wine-line={view.cup ? 'cup' : 'watered'}
        className="text-[10px] sm:text-[11px] font-serif italic text-neutral-400 leading-snug"
      >
        {view.cup ? HOUSE_CUP_LINE : TAVERN_WINE_LINE}
      </p>

      {/* ── THE QUIET DICE CHAIN ────────────────────────────────────────────
          Steps 1 and 2 are DERIVED (a deep card bought; his champion beaten),
          step 3 is the return to this counter — which is the write that opens
          the board and pays the chain. */}
      {!view.chainComplete && (
        <div data-quiet-dice-chain className="mt-3 flex flex-col gap-2">
          {STEP_TITLES.map((title, index) => {
            const done = stepDone[index];
            return (
              <div
                key={title}
                data-quiet-dice-step={index + 1}
                data-quiet-dice-step-state={done ? 'done' : 'pending'}
                className="rounded-lg border border-amber-700/40 bg-neutral-900/70 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-serif font-bold text-[11px] text-amber-100">
                    {index + 1}. {title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 shrink-0">
                    {done ? 'Done' : 'Owed'}
                  </span>
                </div>
                <p className="mt-1 text-[10px] sm:text-[11px] font-serif text-neutral-300 leading-snug">
                  {QUIET_DICE_STEP_LINES[(index + 1) as 1 | 2 | 3]}
                </p>
              </div>
            );
          })}

          {/* The chain's one bout is entered HERE, and only while it is owed. */}
          {view.nextBout && view.nextBout.bout.key === 'chain' && (
            <button
              type="button"
              data-dice-enter={view.nextBout.bout.opponentId}
              onClick={() => onEnterBout(view.nextBout!.opponent)}
              className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-[11px] uppercase tracking-wider border border-amber-200 transition-all active:scale-[0.98] cursor-pointer"
            >
              Face {view.nextBout.bout.staging}
            </button>
          )}

          {/* Step 1 has no button of its own: the deep card is the list above,
              at S7's own price, and buying one IS the step. */}
          {!view.step1Done && (
            <p className="text-[10px] font-mono text-amber-300/90">
              The list above is the price: {DICE_DEEP_CARD_PRICE}g for a true thing.
            </p>
          )}
        </div>
      )}

      {/* ── THE RUMOUR BOARD — opened ONLY by her closing line ─────────────── */}
      {view.chainComplete && (
        <div data-dice-board className="mt-3 flex flex-col gap-2">
          <p
            data-dice-closing-line
            className="font-serif italic text-[11px] sm:text-xs text-amber-200 leading-snug"
          >
            “{QUIET_DICE_CLOSING_LINE}”
          </p>
          <p className="text-[10px] sm:text-[11px] font-serif text-neutral-300 leading-snug">
            {QUIET_DICE_BACKSTORY_LINE}
          </p>
          <p
            data-dice-chain-reward={view.laudes}
            className="text-[10px] font-mono uppercase tracking-wider text-amber-300/90"
          >
            The house cup is yours. {DICE_CHAIN_LAUDES} Laudes with it.
          </p>

          {/* The closure is permanent: once 'cut' is answered the counter says it
              and the rumour list above is replaced by the same notice. */}
          {rumoursClosed && (
            <p className="text-[10px] sm:text-[11px] font-serif text-rose-200/90 leading-snug">
              {DICE_CHOICE_LINES.cut}
            </p>
          )}

          {DICE_RUMORS.map((rumor, index) => {
            const entry = view.rumors[index];
            const state = entry.won ? 'won' : entry.unlocked ? 'open' : 'locked';
            return (
              <div
                key={rumor.id}
                data-dice-rumor={rumor.id}
                data-dice-rumor-state={state}
                className="rounded-lg border border-amber-700/40 bg-neutral-900/70 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-serif font-bold text-[11px] text-amber-100">
                    {index + 1}. {rumor.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 shrink-0">
                    {state === 'won' ? 'Taken' : state === 'open' ? 'Posted' : 'Sealed'}
                  </span>
                </div>
                <p className="mt-1 text-[10px] sm:text-[11px] font-serif text-neutral-300 leading-snug">
                  {rumor.text}
                </p>
                {state === 'open' && entry.opponent && (
                  <button
                    type="button"
                    data-dice-enter={entry.opponent.id}
                    onClick={() => onEnterBout(entry.opponent as OpponentConfig)}
                    className="mt-2 w-full min-h-[48px] rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-[11px] uppercase tracking-wider border border-amber-200 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    Face {rumor.bout.staging}
                  </button>
                )}
              </div>
            );
          })}

          {/* ── PISO'S OFFER — the full cost printed BEFORE either answer ───── */}
          {view.offerOpen && (
            <div
              data-dice-offer
              className="rounded-lg border border-rose-700/60 bg-neutral-950/80 px-3 py-2"
            >
              <p className="text-[10px] sm:text-[11px] font-serif text-rose-100 leading-snug">
                {PISO_OFFER_LINE}
              </p>
              <p
                data-dice-cost="cut"
                className="mt-2 text-[10px] font-mono text-rose-200/90 leading-snug"
              >
                {DICE_CHOICE_COST_LINES.cut}
              </p>
              <p
                data-dice-cost="refused"
                className="mt-1 text-[10px] font-mono text-amber-200/90 leading-snug"
              >
                {DICE_CHOICE_COST_LINES.refused}
              </p>
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  data-dice-choice="cut"
                  onClick={() => onChooseEnding('cut')}
                  className="flex-1 min-h-[48px] rounded-xl bg-neutral-800 hover:bg-neutral-700 text-rose-100 font-serif font-black text-[11px] uppercase tracking-wider border border-rose-500/70 transition-all active:scale-[0.98] cursor-pointer px-3"
                >
                  Take his cut
                </button>
                <button
                  type="button"
                  data-dice-choice="refused"
                  onClick={() => onChooseEnding('refused')}
                  className="flex-1 min-h-[48px] rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-[11px] uppercase tracking-wider border border-amber-200 transition-all active:scale-[0.98] cursor-pointer px-3"
                >
                  Refuse him
                </button>
              </div>
            </div>
          )}

          {/* Answered: the offer is GONE for good, and the answer stands. */}
          {view.choice && (
            <p
              data-dice-choice-answer={view.choice}
              className="text-[10px] sm:text-[11px] font-serif text-amber-100/90 leading-snug"
            >
              {DICE_CHOICE_LINES[view.choice]}
            </p>
          )}

          {/* The honest purse: his champion, a STANDARD duel, its own purse. */}
          {view.choice === 'refused' && view.nextBout && view.nextBout.bout.key === 'ending' && (
            <button
              type="button"
              data-dice-enter={view.nextBout.bout.opponentId}
              onClick={() => onEnterBout(view.nextBout!.opponent)}
              className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-rose-700 via-red-600 to-rose-600 hover:from-rose-600 hover:to-red-500 text-neutral-50 font-serif font-black text-[11px] uppercase tracking-wider border border-rose-300 transition-all active:scale-[0.98] cursor-pointer"
            >
              {view.endingChampionWon ? 'Face him again' : `Face ${view.nextBout.bout.staging}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
