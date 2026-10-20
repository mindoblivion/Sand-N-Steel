import React from 'react';
import { PlayerProfile } from '../../types/game';
import { Compass } from 'lucide-react';
import { LEGEND_LINE, resolveStoryState, storyGateLine } from '../../utils/storyState';

interface CampaignCardProps {
  profile: PlayerProfile;
}

/**
 * STORY-1 — the campaign card.
 *
 * The head of the Records & Lore Library view: which chapter of the campaign
 * the player is in, its story beat in one line, and the state of every gate that
 * closes it, in words.
 *
 * It is presentational and read-only by construction.  Every word it prints —
 * the chapter, the beat, each gate's line and the Legend line — comes from the
 * pure `resolveStoryState()` (`src/utils/storyState.ts`), so the card holds no
 * copy of the campaign's rules and its own file names no profile field.  It
 * writes nothing: it imports no storage, calls no save writer, and the resolver
 * it reads is total, so a fresh, legacy or hand-edited save renders without
 * throwing.
 *
 * Honesty in the copy, which is the whole point of the card:
 *   • a met gate prints its plain confirmation;
 *   • an unmet gate prints what is required ("Win your first duel");
 *   • a gate whose owning system has not landed prints the authored pending line
 *     ("The Circus has not opened its books yet.") — never a requirement the
 *     player could not satisfy and never a gate shown as met without evidence.
 */
export const CampaignCard: React.FC<CampaignCardProps> = ({ profile }) => {
  const story = resolveStoryState(profile);

  return (
    <section
      data-campaign-card
      data-chapter={story.chapter}
      data-campaign-complete={story.complete ? 'true' : 'false'}
      className="bg-neutral-900/80 border-2 border-amber-600/50 rounded-3xl p-5 sm:p-6 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <Compass className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">
            {story.complete ? 'Campaign · Legend' : `Campaign · Chapter ${story.chapter}`}
          </div>
          <h3 className="font-serif font-black text-lg sm:text-xl text-amber-100 leading-tight">
            {story.title}
          </h3>
          <p className="text-xs sm:text-[13px] text-neutral-300 italic mt-1 leading-relaxed">
            {story.beat}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {story.gates.map((gate) => (
          <li
            key={gate.id}
            data-story-gate={gate.id}
            data-state={gate.state}
            className="flex items-start gap-2 text-xs sm:text-[13px]"
          >
            <span
              aria-hidden
              className={
                gate.state === 'met'
                  ? 'text-emerald-400 w-3 shrink-0'
                  : gate.state === 'pending'
                    ? 'text-neutral-500 w-3 shrink-0'
                    : 'text-amber-400 w-3 shrink-0'
              }
            >
              {gate.state === 'met' ? '✔' : gate.state === 'pending' ? '…' : '◆'}
            </span>
            <span
              className={
                gate.state === 'met'
                  ? 'text-emerald-200/90'
                  : gate.state === 'pending'
                    ? 'text-neutral-400'
                    : 'text-amber-200'
              }
            >
              {storyGateLine(gate)}
            </span>
          </li>
        ))}
      </ul>

      {story.complete && (
        <p className="mt-4 pt-3 border-t border-amber-700/40 font-serif text-sm text-amber-200">
          {LEGEND_LINE}
        </p>
      )}
    </section>
  );
};
