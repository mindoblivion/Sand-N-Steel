import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Swords, ScrollText } from 'lucide-react';
import { DOCTORE_TEST_OPPONENT } from '../../data/opponents';
import {
  DOCTORE_TEST_RESTRICTIONS,
  isDoctoreTestPassed,
  type DoctoreTestRestriction,
} from '../../utils/storyBeats';
import { sounds } from '../../audio/soundEffects';

interface DoctoreTestCardProps {
  profile: PlayerProfile;
  /** The player has chosen a rule: the caller opens the pre-fight card with it. */
  onChooseRestriction: (restriction: DoctoreTestRestriction) => void;
}

/**
 * STORY-2 — THE DOCTORE'S TEST, as it is offered at the Doctore House (the ludus
 * hub, Training Yard tab).
 *
 * The card prints BOTH restrictions with the reason each is set (the Clarity
 * law) and lets the player choose one before the duel; the choice travels to the
 * pre-fight card so the rule is still in front of them at the sand. It is the
 * same hub idiom the ladder uses — a card, the shared pre-fight modal, then the
 * duel — and it is not a gate: a profile that has passed keeps the entry as a
 * bout (the world keeps its place), while the campaign's own gate stays met.
 */
export const DoctoreTestCard: React.FC<DoctoreTestCardProps> = ({
  profile,
  onChooseRestriction,
}) => {
  const passed = isDoctoreTestPassed(profile);

  return (
    <section
      data-doctore-test-card
      data-test-passed={passed ? 'true' : 'false'}
      className="bg-neutral-900/80 border-2 border-orange-600/60 rounded-3xl p-5 sm:p-6 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <ScrollText className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-orange-400/80">
            Restricted duel · the Doctore’s Test
          </div>
          <h3 className="font-serif font-black text-lg sm:text-xl text-amber-100 leading-tight">
            {DOCTORE_TEST_OPPONENT.name}
          </h3>
          <p className="text-xs font-serif text-neutral-400 italic mt-0.5">
            {DOCTORE_TEST_OPPONENT.title}
          </p>
          <p className="text-xs sm:text-[13px] text-neutral-300 italic mt-2 leading-relaxed">
            “Sextus has carried this yard for eleven years. Beat him once inside one of my rules and
            the sand is yours. Lose, and it is only sand — the entry stays open.”
          </p>
        </div>
      </div>

      {passed && (
        <p
          data-doctore-test-state="passed"
          className="mt-3 text-xs font-serif text-emerald-300/90"
        >
          The Doctore’s Test is passed. The bout stays on the yard’s slate whenever you want it again.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DOCTORE_TEST_RESTRICTIONS.map((spec) => (
          <div
            key={spec.id}
            data-doctore-restriction={spec.id}
            className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between gap-3"
          >
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 mb-1">
                {spec.name}
              </div>
              <p className="text-xs font-serif text-amber-100 leading-relaxed">{spec.rule}</p>
              <p className="text-[11px] font-serif italic text-neutral-400 mt-1 leading-relaxed">
                {spec.reason}
              </p>
            </div>
            <button
              onClick={() => {
                sounds.playClick();
                onChooseRestriction(spec.id);
              }}
              className="w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-neutral-950 font-serif font-black text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <Swords className="w-4 h-4" />
              <span>Take the Test — {spec.name}</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};
