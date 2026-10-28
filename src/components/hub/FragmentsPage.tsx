import React from 'react';
import { ScrollText, Lock } from 'lucide-react';
import type { CodexFragmentsEntry, CodexFragmentsPage } from '../../utils/codex';

/**
 * STORY-5b — THE FRAGMENTS PAGE of the Codex.
 *
 * It renders only what `buildCodex` derived, and it exists only when the
 * snapshot carries a `fragments` page (i.e. the Librarian chain has closed and
 * opened the fragment sequence). A found fragment reads its authored text; an
 * unfound one is SEALED — its own number and a seal, with no text at all (the
 * payload does not even carry one).
 *
 * Read-only: this page writes nothing, holds no rule and names no unlock.
 */

const EntryCard: React.FC<{ entry: CodexFragmentsEntry }> = ({ entry }) => (
  <li
    data-codex-fragment={entry.id}
    data-codex-fragment-found={entry.found ? 'true' : 'false'}
    className={`rounded-xl border px-3 py-2.5 ${
      entry.found
        ? 'border-amber-500/60 bg-amber-500/10'
        : 'border-neutral-800 bg-neutral-950/60'
    }`}
  >
    <div className="flex items-center gap-2">
      {entry.found ? (
        <ScrollText className="w-3.5 h-3.5 shrink-0 text-amber-300" aria-hidden="true" />
      ) : (
        <Lock className="w-3.5 h-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
      )}
      <p
        className={`font-serif font-bold text-xs uppercase tracking-wider ${
          entry.found ? 'text-amber-200' : 'text-neutral-400'
        }`}
      >
        {entry.order}. {entry.title}
      </p>
    </div>
    {entry.found && entry.text ? (
      <p
        data-codex-fragment-text
        className="mt-2 text-[11px] sm:text-xs font-serif text-neutral-200 leading-relaxed"
      >
        {entry.text}
      </p>
    ) : (
      <p
        data-codex-fragment-sealed
        className="mt-2 text-[10px] font-mono uppercase tracking-wider text-neutral-500"
      >
        Sealed — not yet found.
      </p>
    )}
  </li>
);

export const FragmentsPage: React.FC<{ page: CodexFragmentsPage }> = ({ page }) => (
  <section
    data-codex-page={page.id}
    data-codex-fragments-found={page.found}
    className="rounded-2xl border border-amber-500/50 bg-amber-950/20 px-3 py-3 flex flex-col gap-2"
    aria-label={page.label}
  >
    <div>
      <h4 className="font-serif font-black text-sm uppercase tracking-wider text-amber-100">
        {page.label}
      </h4>
      <p className="text-[11px] font-serif italic text-neutral-400">{page.blurb}</p>
      <p className="mt-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
        {page.found} of {page.total} recovered · the cognomen, and not one letter more
      </p>
    </div>
    <ul className="flex flex-col gap-1.5">
      {page.entries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} />
      ))}
    </ul>
  </section>
);
