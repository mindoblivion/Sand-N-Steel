/**
 * Records & Lore Library — the hub's reading room, and the view the city's
 * Records & Lore Library building opens.
 *
 * The view is a small page rack: **page one is "The Road"** (the Road of Glory), and
 * the pages behind it keep their own content and their order.  The page list below is
 * the single place that order is written, so a later page (the Codex page of the
 * progression design) appends here rather than re-ordering anything.  The Triumphs
 * page appended here with P2 — inside this rack, with no new navigation entry.
 *
 * Read-only except for the Triumphs page: it takes the profile, hands it to the page
 * it is showing, and every other page writes nothing.  A Triumph purchase is handed
 * up to `onPurchaseTriumph` (`App`'s one write) and this view stores nothing.
 */
import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { PlayerProfile } from '../../types/game';
import { LaurelResult } from '../../utils/laurels';
import { RoadOfGloryPage } from './RoadOfGloryPage';
import { TriumphsPage } from './TriumphsPage';

/** The library's pages, in reading order.  The Road is page one. */
export type LibraryPageId = 'road' | 'triumphs';

export const LIBRARY_PAGES: { id: LibraryPageId; label: string }[] = [
  { id: 'road', label: 'The Road' },
  { id: 'triumphs', label: 'Triumphs' },
];

interface LibraryTabProps {
  profile: PlayerProfile;
  /** P2 — a Triumph buy, routed to `App`'s `purchaseLaurel` + save path. */
  onPurchaseTriumph?: (laurelId: string) => LaurelResult;
}

export const LibraryTab: React.FC<LibraryTabProps> = ({ profile, onPurchaseTriumph }) => {
  const [page, setPage] = useState<LibraryPageId>('road');

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto w-full pb-12">
      <div className="bg-neutral-900/80 border-2 border-purple-500/60 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-300" />
          <h2 className="font-serif font-black text-lg sm:text-xl text-amber-100 uppercase tracking-wider">
            Records &amp; Lore Library
          </h2>
        </div>
        <p className="mt-1 text-xs font-serif italic text-purple-200/80">
          Ancient parchments, records, and the deeds of the sand.
        </p>

        <nav className="mt-4 flex flex-wrap gap-1.5" aria-label="Library pages">
          {LIBRARY_PAGES.map((entry) => {
            const isActive = entry.id === page;
            return (
              <button
                key={entry.id}
                onClick={() => setPage(entry.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`min-h-[40px] px-3 rounded-xl font-serif font-bold text-xs uppercase tracking-wider transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-purple-500/20 border-purple-400 text-purple-100 shadow-md'
                    : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:text-purple-200'
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </nav>
      </div>

      {page === 'road' && <RoadOfGloryPage profile={profile} />}
      {page === 'triumphs' && (
        <TriumphsPage profile={profile} onPurchase={onPurchaseTriumph} />
      )}
    </div>
  );
};
