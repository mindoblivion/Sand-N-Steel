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

/**
 * A8 — Director ruling R2: ONE earned title per shipped Triumph category, and it
 * lives in the SAME record a purchased title does (`laurels.titles`, the P2
 * model), so it stays owned permanently and is selectable exactly like a bought
 * one.  The catalogue is declared here because this module owns the record's
 * legal id set — the evaluator (`utils/triumphs.ts`) decides WHEN each is
 * granted and is the only writer that grants them, but it cannot widen what the
 * record may hold.
 *
 * NAMES ARE DELIBERATELY NOT THE PURCHASABLE ONES.  "Living Legend" (2,000 fame,
 * `title_living_legend`) and "Living Legend of the Ludus" (earned at Legend
 * rank, `title_living_legend_of_the_ludus`) are different strings and different
 * ids; both stay selectable if owned, and `triumphs.test.ts` pins that they are
 * distinct.
 */
export type EarnedTitleCategory = 'sand' | 'coin' | 'steel' | 'saga';

export interface EarnedTitle {
  id: string;
  /** The display string `profile.title` becomes when this title is chosen. */
  name: string;
  category: EarnedTitleCategory;
}

/**
 * A8 — Director ruling R2, in full:
 *   • Sand  → 'Blood of the Sands' on the FIRST Sand triumph (design example);
 *   • Coin  → "Fortune's Favourite" on the FIRST Coin triumph (authored);
 *   • Steel → 'Iron-Bound' on the FIRST Steel triumph (authored);
 *   • Saga  → 'Living Legend of the Ludus' ONLY at Legend rank (design example,
 *             capstone-gated — never on the first Saga triumph).
 */
export const EARNED_TITLES: readonly EarnedTitle[] = [
  { id: 'title_blood_of_the_sands', name: 'Blood of the Sands', category: 'sand' },
  { id: 'title_fortunes_favourite', name: "Fortune's Favourite", category: 'coin' },
  { id: 'title_iron_bound', name: 'Iron-Bound', category: 'steel' },
  {
    id: 'title_living_legend_of_the_ludus',
    name: 'Living Legend of the Ludus',
    category: 'saga',
  },
];

const EARNED_TITLE_BY_ID: ReadonlyMap<string, EarnedTitle> = new Map(
  EARNED_TITLES.map((title) => [title.id, title]),
);

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

/**
 * What a profile owns: the title ids (catalogue order — the purchasable titles
 * first, then the earned ones) and the statue flag.
 *
 * A8 — the record holds BOTH kinds of title: the ones P2 sells (`LaurelId`) and
 * the ones the Triumphs evaluator EARNS (`EARNED_TITLES`).  The array is typed
 * `string[]` for exactly that reason — the record is the union of the two
 * catalogues, and both stay owned permanently (the P2 model).
 */
export interface TriumphState {
  titles: string[];
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

  // A8 — the record may hold two kinds of id: the purchasable titles (P2) and the
  // earned ones (A8).  Both survive the read, in catalogue order — purchased
  // first, earned second — and anything else is still dropped.  This is what
  // keeps a P2 purchase from wiping the titles A8 earned: `purchaseLaurel` below
  // composes its write from THIS list.
  const purchasable = TRIUMPHS.filter(
    (triumph) => triumph.kind === 'title' && owned.has(triumph.id),
  ).map((triumph) => triumph.id as string);
  const earnedTitles = EARNED_TITLES.filter((title) => owned.has(title.id)).map(
    (title) => title.id,
  );

  return {
    titles: [...purchasable, ...earnedTitles],
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

/**
 * One selectable title, whichever catalogue it came from — a P2 purchase or an
 * A8 earn.  The surface offers no distinction: owning it is what makes it
 * selectable.
 */
export interface TitleOption {
  id: string;
  name: string;
}

/**
 * A8 — every title this profile OWNS, purchasable first then earned, in
 * catalogue order.  Read-only; it repairs nothing.
 */
export function ownedTitleOptions(
  profile: PlayerProfile | null | undefined,
): TitleOption[] {
  const state = resolveLaurels(profile);
  const owned = new Set(state.titles);
  return [
    ...TRIUMPHS.filter((triumph) => triumph.kind === 'title' && owned.has(triumph.id)).map(
      (triumph) => ({ id: triumph.id as string, name: triumph.name }),
    ),
    ...EARNED_TITLES.filter((title) => owned.has(title.id)).map((title) => ({
      id: title.id,
      name: title.name,
    })),
  ];
}

/** The earned title a shipped category grants — `undefined` for anything else. */
export function earnedTitleForCategory(category: unknown): EarnedTitle | undefined {
  return EARNED_TITLES.find((title) => title.category === category);
}

/**
 * A8 — GRANT an earned title: append its id to `laurels.titles` and change
 * nothing else.  Pure, and idempotent: a title already owned, an unknown id, or
 * no profile at all returns the SAME profile object, so a caller can compare
 * identity to know whether to save.
 *
 * Director ruling R2's shape: the title is OWNED, not displayed.  The displayed
 * title stays whatever the player chose last — a title is a laurel he can wear,
 * not one put on him — and the Library's title row is where he puts it on.
 */
export function grantTitle(
  profile: PlayerProfile | null | undefined,
  titleId: unknown,
): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  const title = typeof titleId === 'string' ? EARNED_TITLE_BY_ID.get(titleId) : undefined;
  if (!title) return profile;
  const state = resolveLaurels(profile);
  if (state.titles.includes(title.id)) return profile;

  return {
    ...profile,
    laurels: { titles: [...state.titles, title.id], statue: state.statue },
  };
}

/**
 * A8 — DISPLAY one owned title: point `profile.title` at that title's own name
 * and change nothing else.  Both catalogues are searched, so a purchased title
 * and an earned one are selected the same way; a title the profile does not own,
 * an unknown id, or the title already displayed returns the same profile object
 * (no save).  The record is untouched — ownership and display stay separate, the
 * P2 model.
 */
export function selectDisplayedTitle(
  profile: PlayerProfile | null | undefined,
  titleId: unknown,
): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  const option = ownedTitleOptions(profile).find((title) => title.id === titleId);
  if (!option || profile.title === option.name) return profile;
  return { ...profile, title: option.name };
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
