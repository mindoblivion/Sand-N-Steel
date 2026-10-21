/**
 * P2 — TRIUMPHS: the fame honours a gladiator buys, and the record of owning them.
 *
 * **The player-facing name is "Triumphs".**  The word "Laurel" is reserved for the
 * palma — the day's golden laurel (`data/glossary.ts`) — so no string in this file,
 * and no string either surface prints, calls a Triumph a laurel.  The save field is
 * still `laurels` and the transaction is still `purchaseLaurel`, because those are
 * the design's own code identifiers (§11 C1d renames the surface, not the field).
 *
 * The catalogue is four honours, priced in **fame only** — never gold:
 *
 *   | Triumph                | kind   | price (fame) |
 *   |------------------------|--------|--------------|
 *   | Crowd Favourite        | title  | 300          |
 *   | Champion of the Sands  | title  | 800          |
 *   | Living Legend          | title  | 2,000        |
 *   | Ludus Statue           | statue | 1,200        |
 *
 * The rules, which `purchaseLaurel` alone enforces:
 *   • fame is the only currency spent, and the balance can never go negative — a
 *     price the profile cannot cover is refused before any arithmetic happens;
 *   • each Triumph is ownable ONCE — a second buy is refused, so a stale or
 *     repeated click can never be charged twice;
 *   • buying a title also makes it the profile's displayed title (`profile.title`,
 *     the shipped display string `StatsTab` already prints) while every owned
 *     title stays owned permanently — the record is a set, the display is a pointer;
 *   • the statue sets `laurels.statue` and nothing else.
 *
 * **Zero power.**  Nothing here touches a stat, a reward, a price, a gate or a
 * fight: buying a Triumph spends fame and records that it was bought.  No combat,
 * reward or progression path reads `laurels` (pinned by `laurels.test.ts` §F).
 *
 * Shape and purity follow the shipped pure-transaction idiom exactly
 * (`racingProgression.ts`, `chariotLoadout.ts`, `tempering.ts`):
 *   • no profile, no `laurels` object and no title array is mutated in place — a
 *     success returns a NEW `PlayerProfile` for the caller to hand to the existing
 *     `setProfile()` + `saveProfile()` pair;
 *   • a refusal returns `{ ok: false, reason }` and no profile at all, so a refused
 *     buy cannot reach a save writer;
 *   • a legacy save (no `laurels` field), a partial field and a malformed field all
 *     resolve to "owns nothing" rather than throwing, and nothing backfills them.
 */

import { PlayerProfile } from '../types/game';

/** A Triumph's two shapes: a title (a display string) or the ludus statue (a flag). */
export type LaurelKind = 'title' | 'statue';

/** The four catalogue ids.  Stored verbatim in `laurels.titles` (titles only). */
export type LaurelId =
  | 'title_crowd_favourite'
  | 'title_champion_of_the_sands'
  | 'title_living_legend'
  | 'statue_ludus';

export interface Laurel {
  id: LaurelId;
  kind: LaurelKind;
  /** The player-facing name — and, for a title, the string `profile.title` becomes. */
  name: string;
  /** Fame price.  Fame only; no Triumph has a gold price. */
  price: number;
  /** One line of flavour for the surface's card. */
  blurb: string;
}

/**
 * The catalogue, in display order: the three titles ascending by price, then the
 * statue.  Prices are the design's and are the single source of truth for the
 * transaction, the surfaces and the suites.
 */
export const TRIUMPHS: readonly Laurel[] = [
  {
    id: 'title_crowd_favourite',
    kind: 'title',
    name: 'Crowd Favourite',
    price: 300,
    blurb: 'The sand knows your name, and the cheap seats chant it.',
  },
  {
    id: 'title_champion_of_the_sands',
    kind: 'title',
    name: 'Champion of the Sands',
    price: 800,
    blurb: 'Spoken by the herald before your bouts, and after them.',
  },
  {
    id: 'title_living_legend',
    kind: 'title',
    name: 'Living Legend',
    price: 2000,
    blurb: 'A name the city tells its children, while you still walk it.',
  },
  {
    id: 'statue_ludus',
    kind: 'statue',
    name: 'Ludus Statue',
    price: 1200,
    blurb: 'Bronze of you, raised in the yard where you learned the sword.',
  },
];

/** The statue's owned line — the one line the design fixes word for word. */
export const STATUE_OWNED_LINE = 'Your statue stands at the ludus.';

const TRIUMPH_BY_ID: ReadonlyMap<string, Laurel> = new Map(
  TRIUMPHS.map((triumph) => [triumph.id, triumph]),
);

/**
 * Look a Triumph up by id.  Anything else — an unknown string, a number, `null` —
 * resolves to `undefined`, which every caller turns into a refusal rather than a
 * guess.
 */
export function getTriumph(ref: unknown): Laurel | undefined {
  if (typeof ref !== 'string') return undefined;
  return TRIUMPH_BY_ID.get(ref);
}

/** What a profile owns: the title ids (catalogue order) and the statue flag. */
export interface TriumphState {
  titles: LaurelId[];
  statue: boolean;
}

/** The stored field, or `undefined` when it is absent or not a plain object. */
function storedLaurels(
  profile: PlayerProfile | null | undefined,
): { titles?: unknown; statue?: unknown } | undefined {
  const stored = profile?.laurels;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return undefined;
  return stored as { titles?: unknown; statue?: unknown };
}

/**
 * Resolve what the player owns.
 *
 * Total, never throwing, and never repairing the save:
 *   • no `laurels` field (every save written before this slice) → owns nothing;
 *   • `titles` that is not an array, entries that are not strings, ids the
 *     catalogue does not know, and duplicates are all dropped;
 *   • the surviving titles come back in catalogue order, whatever order the save
 *     holds them in;
 *   • `statue` is true only for a stored `true`.
 */
export function resolveLaurels(profile: PlayerProfile | null | undefined): TriumphState {
  const stored = storedLaurels(profile);
  const rawTitles = Array.isArray(stored?.titles) ? (stored!.titles as unknown[]) : [];
  const owned = new Set(rawTitles.filter((entry): entry is string => typeof entry === 'string'));

  return {
    titles: TRIUMPHS.filter(
      (triumph) => triumph.kind === 'title' && owned.has(triumph.id),
    ).map((triumph) => triumph.id),
    statue: stored?.statue === true,
  };
}

/** Does the profile own this Triumph?  An unknown id owns nothing. */
export function ownsTriumph(profile: PlayerProfile | null | undefined, ref: unknown): boolean {
  const triumph = getTriumph(ref);
  if (!triumph) return false;
  const state = resolveLaurels(profile);
  return triumph.kind === 'title'
    ? state.titles.includes(triumph.id as LaurelId)
    : state.statue;
}

/** The owned Triumphs, as catalogue entries, for a surface to list. */
export function ownedTriumphs(profile: PlayerProfile | null | undefined): Laurel[] {
  const state = resolveLaurels(profile);
  return TRIUMPHS.filter((triumph) =>
    triumph.kind === 'title' ? state.titles.includes(triumph.id) : state.statue,
  );
}

/** Why a purchase was refused.  `ok: true` never carries a reason. */
export type TriumphRejectionReason =
  | 'no-profile'
  | 'unknown-triumph'
  | 'already-owned'
  | 'insufficient-fame';

export type LaurelResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: TriumphRejectionReason };

/**
 * A profile whose fame is missing or not a finite number can afford nothing —
 * reading it as "not enough fame" keeps a malformed save from producing a NaN
 * balance by subtraction.
 */
function fameOf(profile: PlayerProfile): number | null {
  const fame = profile.fame;
  return typeof fame === 'number' && Number.isFinite(fame) ? fame : null;
}

/**
 * Can the player buy this Triumph right now?  A surface uses it to state the
 * reason on the card; the purchase re-checks the same rules, so a stale or
 * repeated click is refused exactly as a first one would be.
 */
export function getTriumphPurchaseEligibility(
  profile: PlayerProfile | null | undefined,
  ref: unknown,
): { ok: true } | { ok: false; reason: TriumphRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };

  const triumph = getTriumph(ref);
  if (!triumph) return { ok: false, reason: 'unknown-triumph' };

  if (ownsTriumph(profile, triumph.id)) return { ok: false, reason: 'already-owned' };

  const fame = fameOf(profile);
  if (fame === null || fame < triumph.price) return { ok: false, reason: 'insufficient-fame' };

  return { ok: true };
}

/**
 * Buy one Triumph with fame.
 *
 * Pure: the caller's profile is never mutated, a success returns a new profile
 * whose fame is exactly `fame - price`, and a refusal returns no profile at all.
 * A title buy records the id in `laurels.titles` AND points `profile.title` at the
 * title's own name; a statue buy sets `laurels.statue`.  Neither writes anything
 * else — no gold, no stat, no reward.
 */
export function purchaseLaurel(
  profile: PlayerProfile | null | undefined,
  ref: unknown,
): LaurelResult {
  const eligibility = getTriumphPurchaseEligibility(profile, ref);
  if (!eligibility.ok) return eligibility;
  if (!profile) return { ok: false, reason: 'no-profile' };

  const triumph = getTriumph(ref)!;
  const state = resolveLaurels(profile);
  const isTitle = triumph.kind === 'title';

  return {
    ok: true,
    profile: {
      ...profile,
      fame: profile.fame - triumph.price,
      ...(isTitle ? { title: triumph.name } : {}),
      laurels: {
        titles: isTitle ? [...state.titles, triumph.id] : state.titles,
        statue: isTitle ? state.statue : true,
      },
    },
  };
}

/** A short, player-facing explanation of a refusal — the surface's own wording. */
export function describeTriumphRejection(reason: TriumphRejectionReason): string {
  switch (reason) {
    case 'no-profile':
      return 'No gladiator profile loaded.';
    case 'unknown-triumph':
      return 'The ludus keeps no such honour.';
    case 'already-owned':
      return 'Already yours.';
    case 'insufficient-fame':
      return 'Not enough fame.';
  }
}
