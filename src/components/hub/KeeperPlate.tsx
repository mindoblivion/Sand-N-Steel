import React from 'react';
import type { Keeper } from '../../data/keepers';

interface KeeperPlateProps {
  keeper: Keeper;
  /** The one line the keeper is saying right now (first-visit or repeat). */
  line: string;
}

/**
 * K1 — the keeper's name-plate, at the head of a storefront.
 *
 * A HEADER ONLY: it draws who is behind the counter and what they say, and adds
 * no control of any kind — no button, no toggle, nothing to mis-tap on a phone.
 * The plate is a placeholder in this slice (initials in the plate's own seal, no
 * image asset); the name and title are the real ones from `data/keepers.ts`.
 */

/** The initials the plate's seal carries: the first letters of the first two words. */
function initialsOf(name: string): string {
  return name
    .replace(/["',.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

export const KeeperPlate: React.FC<KeeperPlateProps> = ({ keeper, line }) => (
  <div
    data-keeper={keeper.id}
    className="bg-neutral-900/80 border border-amber-700/40 rounded-3xl p-4 sm:p-5 shadow-lg flex items-start gap-4"
  >
    <div
      aria-hidden="true"
      className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-amber-600 to-yellow-600 border border-amber-300 flex items-center justify-center font-serif font-black text-neutral-950 text-base shadow-md"
    >
      {initialsOf(keeper.name)}
    </div>
    <div className="min-w-0">
      <p className="font-serif font-black text-base sm:text-lg text-amber-100 leading-tight">
        {keeper.name}
      </p>
      <p className="text-[11px] font-mono uppercase tracking-wider text-amber-400/80">
        {keeper.title}
      </p>
      <p data-keeper-line className="text-sm text-neutral-300 font-serif mt-2">
        {line}
      </p>
    </div>
  </div>
);
