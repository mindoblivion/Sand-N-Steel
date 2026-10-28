import React from 'react';
import { ScrollText } from 'lucide-react';
import type { PlayerProfile } from '../../types/game';
import {
  LIBRARIAN_CHAIN_LAUDES,
  LIBRARIAN_STEP_LINES,
  LIBRARIAN_STEP_TITLES,
  librarianChainSteps,
} from '../../utils/librarianChain';

/**
 * STORY-5b — "THE NAME IN THE STONE", the Librarian chain's card.
 *
 * It sits on the Library view (the rack's own header, never a new navigation
 * entry) and draws the chain's three steps in order with the words Dionysios
 * says for each. Every state comes from `utils/librarianChain.ts`; it writes
 * nothing and gates nothing.
 *
 * It renders ONLY while the chain is incomplete. Once it closes, the backstory
 * is spoken at the counter and the fragments live on the Codex's own Fragments
 * page, so this card has nothing left to teach and disappears.
 */
interface LibrarianChainCardProps {
  profile: PlayerProfile;
}

export const LibrarianChainCard: React.FC<LibrarianChainCardProps> = ({ profile }) => {
  const steps = librarianChainSteps(profile);
  if (steps.complete) return null;

  const done = [steps.step1Done, steps.step2Done, false];
  const nextIndex = done.findIndex((state) => !state);

  return (
    <div
      data-librarian-chain
      data-librarian-step-2={steps.step2Done ? 'done' : 'owed'}
      data-librarian-veteran={steps.veteran ? 'true' : 'false'}
      className="bg-neutral-900/80 border border-amber-700/50 rounded-3xl p-4 shadow-lg"
    >
      <div className="flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-amber-300" aria-hidden="true" />
        <h3 className="font-serif font-black text-sm uppercase tracking-wider text-amber-100">
          The Name in the Stone
        </h3>
      </div>
      <p className="mt-1 text-[11px] font-serif italic text-neutral-400">
        Dionysios keeps one list he was paid to cut short. Three steps, and {LIBRARIAN_CHAIN_LAUDES}{' '}
        Laudes at the end of them.
      </p>

      <ol className="mt-3 flex flex-col gap-2">
        {LIBRARIAN_STEP_TITLES.map((title, index) => {
          const isDone = done[index];
          const isNext = index === nextIndex;
          return (
            <li
              key={title}
              data-librarian-step={index + 1}
              data-librarian-step-state={isDone ? 'done' : 'owed'}
              className={`rounded-lg border px-3 py-2 ${
                isDone
                  ? 'border-amber-600/40 bg-amber-950/30'
                  : 'border-neutral-800 bg-neutral-950/60'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-serif font-bold text-[11px] text-amber-100">
                  {index + 1}. {title}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 shrink-0">
                  {isDone ? 'Done' : isNext ? 'Owed' : 'Later'}
                </span>
              </div>
              {isNext && (
                <p className="mt-1 text-[10px] sm:text-[11px] font-serif text-neutral-300 leading-snug">
                  {LIBRARIAN_STEP_LINES[(index + 1) as 1 | 2 | 3]}
                </p>
              )}
              {index === 2 && steps.step1Done && steps.step2Done && !steps.veteran && (
                <p className="mt-1 text-[10px] font-mono text-amber-300/90">
                  He will talk when the city calls you Veteran — 150 fame, and the second circuit.
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
