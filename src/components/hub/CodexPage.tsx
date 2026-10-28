/**
 * A5 — THE CODEX, rendered: the Records & Lore Library's third page, beside
 * The Road and Triumphs (the design's "two-page Library view": the Triumphs page
 * A8 established, and this one).
 *
 * The page OWNS NO RULE.  Every number, every mark and every name comes from the
 * pure derivation in `utils/codex.ts`, which reads only the profile the game
 * already saves — so nothing here can drift from what the duel result, the shop or
 * the city itself recorded.  It writes nothing at all: the one Codex write (a hub
 * location's first visit) belongs to the city's interaction and `App`'s save path.
 *
 * What it deliberately does NOT render (A5 — Director rulings R2/R3/R5):
 *   • no Fragments page — an empty shell would advertise unbuilt story (STORY-5
 *     adds it with the 3C content, and the page list is data-driven);
 *   • no horse-tiers section — no studio horse tiers are integrated yet;
 *   • no "best hype" column — hype is transient and has no persistent record;
 *   • no portraits — no opponent art exists, so a rival's mark is an INITIALS SEAL
 *     (the K1 `KeeperPlate` pattern), never invented art.
 */
import React from 'react';
import { Award, Compass, ScrollText } from 'lucide-react';
import { PlayerProfile } from '../../types/game';
import { buildCodex, type CodexEntry, type CodexPage as CodexPageData } from '../../utils/codex';
import { hasVellum } from '../../utils/librarianChain';
import { FragmentsPage } from './FragmentsPage';

interface CodexPageProps {
  profile: PlayerProfile;
}

/** The initials a rival's seal carries: the first letters of the first two words. */
function initialsOf(name: string): string {
  return name
    .replace(/["',.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

const EntryRow: React.FC<{ entry: CodexEntry; seal?: boolean }> = ({ entry, seal }) => (
  <li
    data-codex-entry={entry.id}
    data-codex-found={entry.found ? 'true' : 'false'}
    className={`rounded-xl border px-2.5 py-2 flex items-start gap-2 ${
      entry.found
        ? 'border-amber-500/60 bg-amber-500/10'
        : 'border-neutral-800 bg-neutral-950/60 opacity-60'
    }`}
  >
    {seal && (
      <span
        aria-hidden="true"
        data-codex-seal
        className={`w-8 h-8 shrink-0 rounded-xl border flex items-center justify-center font-serif font-black text-[11px] ${
          entry.found
            ? 'bg-gradient-to-br from-amber-600 to-yellow-600 border-amber-300 text-neutral-950'
            : 'bg-neutral-900 border-neutral-700 text-neutral-400'
        }`}
      >
        {initialsOf(entry.name)}
      </span>
    )}
    <div className="min-w-0">
      <p
        className={`font-serif font-bold text-xs uppercase tracking-wider ${
          entry.found ? 'text-amber-200' : 'text-neutral-400'
        }`}
      >
        {entry.name}
      </p>
      <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
        {entry.detail}
      </p>
      <p className="text-[10px] font-mono text-neutral-400">
        {entry.found ? 'Counted ✓' : 'Not yet'}
        {!entry.found && entry.source ? ` · sold at ${entry.source}` : ''}
      </p>
    </div>
  </li>
);

const PageSection: React.FC<{ page: CodexPageData }> = ({ page }) => (
  <section
    data-codex-page={page.id}
    data-codex-percent={page.percent}
    data-codex-laurel={page.laurel ? 'true' : 'false'}
    className="rounded-2xl border border-neutral-700 bg-neutral-900/70 px-3 py-3 flex flex-col gap-2"
    aria-label={page.label}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h4 className="font-serif font-black text-sm uppercase tracking-wider text-amber-100">
          {page.label}
        </h4>
        <p className="text-[11px] font-serif italic text-neutral-400">{page.blurb}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-xs text-amber-200" data-codex-page-count>
          {page.touched} / {page.total} · {page.percent}%
        </p>
        {page.laurel && (
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber-300">
            <Award className="w-3 h-3" aria-hidden="true" /> Laurel
          </p>
        )}
      </div>
    </div>

    {page.groups.map((group) => (
      <div key={group.id} data-codex-group={group.id} className="flex flex-col gap-1">
        <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
          {group.label}
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {group.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} seal={page.id === 'gladiators' || page.id === 'bosses'} />
          ))}
        </ul>
      </div>
    ))}
  </section>
);

export const CodexPage: React.FC<CodexPageProps> = ({ profile }) => {
  const codex = buildCodex(profile);
  /**
   * STORY-5b — THE VELLUM: a Library/Codex page style variant, gated on the
   * Librarian chain's completion (the same flag that opens the fragment
   * sequence). It is a class set on this page's own wrapper and NOTHING else —
   * the repository has no theme system to extend, so this is the smallest
   * honest way to give the page a second skin: one conditional class string on
   * the existing section, no new node, no provider, no token rewrite. Pure
   * presentation: it changes no count, no unlock and no save.
   */
  const vellum = hasVellum(profile);

  return (
    <section
      className={`flex flex-col gap-4 max-w-2xl mx-auto w-full ${
        vellum
          ? 'rounded-3xl border border-amber-600/40 bg-[#2b1d0f]/60 p-3 shadow-[inset_0_0_40px_rgba(180,120,40,0.25)]'
          : ''
      }`}
      aria-label="The Codex"
      data-codex
      data-codex-vellum={vellum ? 'true' : 'false'}
      data-codex-complete={codex.complete ? 'true' : 'false'}
      data-codex-marks={codex.laurelCount}
      data-codex-percent={codex.percent}
    >
      <header>
        <h3 className="font-serif font-black text-xl sm:text-2xl text-amber-100 uppercase tracking-wider">
          The Codex
        </h3>
        <p className="text-xs font-serif italic text-neutral-400 mt-1">
          A gladiator&rsquo;s life, indexed. Every rival, every boss, every team, every blade and
          every street your career has touched — an empty page is an invitation, not a chore.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/50 text-amber-200 uppercase tracking-wider">
            {codex.touched} / {codex.total} · {codex.percent}%
          </span>
          <span
            data-codex-laurel-count
            className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300"
          >
            Laurels: {codex.laurelCount} / {codex.pages.length}
          </span>
        </div>
      </header>

      {codex.pages.map((page) => (
        <PageSection key={page.id} page={page} />
      ))}

      {/* STORY-5b — the Fragments page: present only once the Librarian chain has
          opened the sequence, so no empty shell is ever advertised. */}
      {codex.fragments && <FragmentsPage page={codex.fragments} />}

      <p className="text-[10px] font-serif italic text-neutral-500 flex items-start gap-1.5">
        <Compass className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          A page&rsquo;s laurel is a mark for filling it completely. The only reward beyond that is
          the Saga capstone for filling every page — and the counts are honest: the bounty board
          opens in Chapter 3.
        </span>
      </p>
      <p className="text-[10px] font-serif italic text-neutral-600 flex items-start gap-1.5">
        <ScrollText className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
        <span>The Codex keeps the record; it never changes a stat, a price or a fight.</span>
      </p>
    </section>
  );
};
