import React from 'react';
import { getFateCard, type FateCardRarity } from '../../data/fateCards';
import { FATECON1_LIVE_EFFECT_KINDS } from '../../utils/fateBonuses';
import type { FateDraft } from '../../utils/gladiatorFate';
import { sounds } from '../../audio/soundEffects';

interface FateDraftModalProps {
  /** The first queued level-up draft: exactly three cards, pick one. */
  draft: FateDraft;
  /** The choice, reported to App — App owns the write and the save. */
  onChoose: (cardId: string) => void;
}

const RARITY_STYLES: Record<FateCardRarity, string> = {
  common: 'text-neutral-300 border-neutral-600/70',
  uncommon: 'text-emerald-300 border-emerald-600/60',
  rare: 'text-sky-300 border-sky-600/60',
  epic: 'text-violet-300 border-violet-600/60',
  legendary: 'text-amber-300 border-amber-500/70',
};

/**
 * PHASE2-FATE — the level-up draft, a pick-1-of-3 modal on the return to the hub.
 *
 * It opens when the duel-result modal is dismissed and a draft is queued, and it
 * is BLOCKING: there is no close button, no backdrop tap and no Escape — the
 * player chooses a card before continuing, so a level-up can never be silently
 * skipped. A second queued draft (a victory that crossed two levels) appears as
 * soon as the first choice lands, because App derives the shown draft from the
 * first pending draft on the saved profile.
 *
 * Invalid or replayed taps are inert by the resolver's contract: `onChoose` is
 * only ever called with a card id from this draft, and App's handler ignores a
 * choice the resolver refuses. Nothing here reads storage and nothing writes:
 * the modal reports the choice, App transacts it.
 *
 * The effect-status lines say plainly whether a card's effect is live:
 * "Takes effect immediately." for `gold_flat` and the fourteen kinds
 * PHASE2-FATECON-1 and PHASE2-FATECON-2 wired (the
 * `FATECON1_LIVE_EFFECT_KINDS` set), and "Not yet in effect." for
 * everything else — the card is still yours to keep, and the line never
 * promises what the game does not deliver yet. Only Deep Wounds is still
 * waiting: no technique registry and no bleeding system exist to consume it.
 */
export const FateDraftModal: React.FC<FateDraftModalProps> = ({ draft, onChoose }) => {
  const cards = draft.cardIds
    .map((cardId) => getFateCard(cardId))
    .filter((card) => card !== undefined);

  return (
    <div
      className="fate-draft-modal fixed inset-0 bg-neutral-950/85 backdrop-blur-md z-40 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Fate draft for level ${draft.level}`}
    >
      <div className="w-full max-w-3xl bg-neutral-950/90 border-2 border-amber-600/60 rounded-2xl p-3 sm:p-4 shadow-2xl select-none">
        <div className="text-center pb-2 border-b border-amber-900/40 mb-3">
          <h2 className="font-serif text-xl sm:text-2xl text-amber-200">Fate Smiles</h2>
          <p className="text-xs sm:text-sm text-neutral-300">
            Level {draft.level} — choose one card. The others fade.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              data-fate-card-id={card.id}
              onClick={() => {
                sounds.playClick();
                onChoose(card.id);
              }}
              className={`fate-draft-card min-h-[48px] p-2 sm:p-3 rounded-xl border bg-neutral-900/80 flex flex-col gap-1 text-left cursor-pointer transition-all hover:border-amber-400 active:scale-95 ${RARITY_STYLES[card.rarity]}`}
            >
              <span className="text-[10px] sm:text-xs uppercase tracking-wide text-neutral-400">
                {card.category} · {card.rarity}
              </span>
              <span className="font-serif text-sm sm:text-base text-amber-100 leading-tight">
                {card.name}
              </span>
              <span className="fate-draft-tagline text-[11px] sm:text-xs italic text-neutral-400 leading-snug">
                {card.tagline}
              </span>
              <span className="text-[11px] sm:text-xs text-neutral-200 leading-snug">
                {card.description}
              </span>
              {/* PHASE2-FATECON-1 — the live set is `gold_flat` plus the eight
                  kinds this slice wired; the literal stays so the PHASE2-FATE
                  pin keeps reading true. */}
              {card.effect.kind === 'gold_flat' || FATECON1_LIVE_EFFECT_KINDS.has(card.effect.kind) ? (
                <span className="text-[11px] sm:text-xs font-semibold text-amber-300 leading-snug">
                  Takes effect immediately.
                </span>
              ) : (
                <span className="text-[11px] sm:text-xs text-neutral-400 leading-snug">
                  Not yet in effect.
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
