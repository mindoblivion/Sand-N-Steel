import React from 'react';
import { Compass, ScrollText } from 'lucide-react';
import { KeeperPlate } from './KeeperPlate';
import type { LegendStopConversation } from '../../utils/librarianChain';

/**
 * STORY-5b — one of the three stops' conversations, as a panel in the city.
 *
 * The panel draws what `utils/librarianChain.ts` resolved and nothing more: the
 * keeper whose counter it is (the shipped `KeeperPlate`, the same plate the
 * treatment and tavern panels wear), the conversation's head line, and its lines.
 *
 * Two kinds arrive here:
 *   • `return`   — the chain's close at the Library, while the return is owed:
 *                  Dionysios's backstory and the line that opens the fragments.
 *   • `fragment` — one fragment read (or re-read) at its own stop.
 *
 * It holds no rule and writes nothing: `App` owns the one write each opening
 * earns (`withLibrarianChainClosed` / `withFragmentFound`), both identity-stable,
 * so a re-open never saves twice.
 */
interface LegendStopPanelProps {
  conversation: LegendStopConversation;
  onClose: () => void;
}

export const LegendStopPanel: React.FC<LegendStopPanelProps> = ({
  conversation,
  onClose,
}) => {
  const { stop, keeper, kind, title, lines, fragment } = conversation;

  return (
    <div
      data-legend-stop={stop.id}
      data-legend-stop-kind={kind}
      data-legend-fragment={fragment?.id ?? 'none'}
      className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-sm sm:max-w-md w-[90%] max-h-[70vh] overflow-y-auto bg-neutral-950/95 border-2 border-amber-500/80 p-4 rounded-2xl backdrop-blur-md shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-fadeIn"
    >
      <div className="mb-3">
        <KeeperPlate keeper={keeper} line={keeper.repeatLines[0] ?? keeper.firstVisitLine} />
      </div>

      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <h4 className="font-serif font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-amber-400" />
            <span>{stop.label}</span>
          </h4>
          <p className="text-sm font-serif font-bold text-amber-100 mb-2 flex items-start gap-1.5">
            <ScrollText className="w-3.5 h-3.5 mt-1 shrink-0 text-amber-400/80" aria-hidden="true" />
            <span>{title}</span>
          </p>
          <div className="flex flex-col gap-2">
            {lines.map((line, index) => (
              <p
                key={`${stop.id}-${kind}-${index}`}
                className="text-[11px] sm:text-xs font-serif text-neutral-200 leading-relaxed"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close the conversation"
          className="w-12 h-12 min-h-[48px] min-w-[48px] shrink-0 flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-amber-200 transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
