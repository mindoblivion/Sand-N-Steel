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
import React, { useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { PlayerProfile } from '../../types/game';
import { LaurelResult } from '../../utils/laurels';
// LUDI PHASE A — the library's two tallies, read from the ONE counter each: the shared
// `records.laudes` (`resolveLaudes`) and the calendar's persistent Favour. The honour
// counter is printed in its own word, "Laudes": P2's naming law reserves the palma's word
// for the fame honours bought here, and the rack must not print it.
import { resolveLaudes } from '../../utils/diceTrail';
import { resolveLudiState } from '../../utils/ludiCalendar';
import { RoadOfGloryPage } from './RoadOfGloryPage';
import { TriumphsPage } from './TriumphsPage';
import { CodexPage } from './CodexPage';
import { LibrarianChainCard } from './LibrarianChainCard';

/**
 * The library's pages, in reading order.  The Road is page one.
 *
 * A5 — 'Codex' is the fourth entry, beside The Road and Triumphs, inside this same
 * rack: the design's two-page Library view is one rack with more than one page, and
 * the Codex adds no navigation entry of its own (the character sheet's route lands
 * on Triumphs; the Codex tab is reached on the rack itself).
 */
export type LibraryPageId = 'road' | 'triumphs' | 'codex';

export const LIBRARY_PAGES: { id: LibraryPageId; label: string }[] = [
  { id: 'road', label: 'The Road' },
  { id: 'triumphs', label: 'Triumphs' },
  { id: 'codex', label: 'Codex' },
];

interface LibraryTabProps {
  profile: PlayerProfile;
  /** P2 — a Triumph buy, routed to `App`'s `purchaseLaurel` + save path. */
  onPurchaseTriumph?: (laurelId: string) => LaurelResult;
  /**
   * A8 — the page the rack is showing, when a surface outside the rack routes
   * into it (the character sheet's "View Triumphs" button, one surface with two
   * doors).  Absent = the rack keeps its own state, opening on The Road.
   */
  page?: LibraryPageId;
  onPageChange?: (page: LibraryPageId) => void;
  /**
   * A8 — Director ruling R7: opening the Triumphs page marks every earned deed
   * as read, in ONE save (`App` owns the write).  The ✦ on the Library building's
   * prompt clears from that same write.
   */
  onViewTriumphs?: () => void;
  /** A8 — put an owned title (bought or earned) on the record. */
  onSelectTitle?: (titleId: string) => void;
  /**
   * STORY-5b — the Librarian chain's STEP 1: opening the Codex page IS reading
   * it. The rack reports that here, once per open; `App` composes the one
   * identity-stable write (`withCodexRead`), so a later open saves nothing.
   */
  onViewCodex?: () => void;
}

export const LibraryTab: React.FC<LibraryTabProps> = ({
  profile,
  onPurchaseTriumph,
  page: controlledPage,
  onPageChange,
  onViewTriumphs,
  onSelectTitle,
  onViewCodex,
}) => {
  const [ownPage, setOwnPage] = useState<LibraryPageId>('road');
  /** LUDI PHASE A — the two lifetime tallies the header prints. */
  const laudes = resolveLaudes(profile);
  const ludi = resolveLudiState(profile);
  const page = controlledPage ?? ownPage;
  const setPage = (next: LibraryPageId) => {
    setOwnPage(next);
    onPageChange?.(next);
  };

  /**
   * A8 — the one view mark.  It fires when the Triumphs page becomes the page on
   * screen, including when a route from the character sheet opens it directly.
   * `markTriumphsViewed` is identity-stable once everything is read, so the write
   * happens ONCE and never repeats; the callback is held in a ref so an ordinary
   * re-render of this view can never re-raise it.
   */
  const markViewed = useRef(onViewTriumphs);
  markViewed.current = onViewTriumphs;
  useEffect(() => {
    if (page !== 'triumphs') return;
    markViewed.current?.();
  }, [page]);

  /**
   * STORY-5b — STEP 1 of the Librarian chain, the same one-view-mark pattern the
   * Triumphs page uses: the moment the Codex page becomes the page on screen, the
   * rack reports it. The Codex is ONE page holding every section (LibraryTab's
   * `LIBRARY_PAGES` distinguishes the rack's pages, not the Codex's sections), so
   * the page-open is the read — there is no per-entry gesture to count. The
   * callback is identity-stable in `App` (its writer refuses a second read), so
   * this fires at most one write per profile.
   */
  const readCodex = useRef(onViewCodex);
  readCodex.current = onViewCodex;
  useEffect(() => {
    if (page !== 'codex') return;
    readCodex.current?.();
  }, [page]);

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

        {/* LUDI PHASE A — THE ACTA'S TALLY, on this existing surface: the Laudes the daily
            third deed has paid (the shared counter, never a second one) and the Favour the
            city keeps for him. Read-only: this rack writes nothing here. */}
        <p
          data-library-ludi
          className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-amber-200/90"
        >
          <span data-library-laudes={laudes}>Laudes {laudes}</span>
          <span data-library-favour={ludi.favour}>Favour {ludi.favour}</span>
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

      {/* STORY-5b — the Librarian chain's card, on this view and nowhere else. It
          retires itself once the chain closes (the fragments then live on the
          Codex's own Fragments page). */}
      <LibrarianChainCard profile={profile} />

      {page === 'road' && <RoadOfGloryPage profile={profile} />}
      {page === 'triumphs' && (
        <TriumphsPage
          profile={profile}
          onPurchase={onPurchaseTriumph}
          onSelectTitle={onSelectTitle}
        />
      )}
      {/* A5 — the Codex is READ-ONLY: it derives every mark from the profile and
          writes nothing, so it takes no handler and no save path. */}
      {page === 'codex' && <CodexPage profile={profile} />}
    </div>
  );
};
