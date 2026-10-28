/**
 * ===========================================================================
 * STORY-4a — MERCY OR GLORY (Pitch A9, duel form only)
 * ===========================================================================
 * On defeating a NAMED rival — never a generic opponent — the result surface
 * offers SPARE or FINISH.  The two answers are the whole of this slice:
 *
 *   • SPARE  — the rival may return.  His C-A grudge (C-8.70C) is KEPT: the
 *     grudge bout IS the higher-difficulty return path this slice implements.
 *     The spared map records him, so he is never offered mercy twice.
 *   • FINISH — the bigger fame purse now (R1), and the rival is gone: his
 *     grudge for that defeat is REMOVED, so he never generates a future grudge
 *     and never receives another offer.
 *
 * THE RULES, one place each (every Director ruling is flagged as
 * 'STORY-4a — Director ruling' at the code it governs):
 *
 *   • ELIGIBILITY (R5, R6, R7) — a victory over a NAMED ladder regular at
 *     Tier 2 or higher, on that rival's FIRST defeat.  Excluded: Sextus the
 *     Yard Measure (the story bout), every boss (ladder and Feature Bout),
 *     Tier 1 regulars, and victories inside generated grudge bouts.  Offers
 *     begin at Chapter 3 (`resolveStoryState`), read from the record the bout
 *     was FOUGHT with, so a win can neither create nor retroactively earn an
 *     offer.  R6's stated consequence: Chapter 3 is unreachable until Stage 2
 *     lands its race-results write, so the offer is DORMANT — the code lands
 *     now, tested, and activates when Stage 2 unlocks Chapter 3.
 *   • ONCE EACH — the spared map enforces it for a Spared rival; a Finished
 *     rival is enforced by the SAME first-defeat rule, because a finished rival
 *     stays in `defeatedOpponentIds` and no later victory is a first victory.
 *   • THE STATE — exactly one new profile field, `spared` (see
 *     `types/game.ts`).  Finish writes NO flag: a finished rival is DERIVED
 *     (`hasFinishedAnyRival` / `isRivalFinished`) from the record that already
 *     exists — beaten, no grudge record, not spared — because C-8.70C writes a
 *     grudge for every first victory over a regular and this slice's Finish is
 *     the only thing that removes one.
 *   • NO MATH BEYOND R1 — the grudge shifts are never recomputed here.  The
 *     board card reads them through `grudgeProfileLine` / `grudgeTraitLine`,
 *     the same helpers the tournament's grudge card uses, so the published caps
 *     (±0.15, clamp [0.05, 0.95]) stay in one place.
 *
 * Pure: this module reads and writes no storage, imports no clock, and every
 * write returns a NEW profile (the caller saves it through the normal path).
 */
import type { GrudgeRecord, OpponentConfig, PlayerProfile } from '../types/game';
import { DOCTORE_TEST_OPPONENT, LADDER_OPPONENTS } from '../data/opponents';
import { getPalma } from '../data/palmae';
import {
  grudgeBoutStatuses,
  grudgeProfileLine,
  grudgeTraitLine,
  resolveGrudges,
} from './grudgeBouts';
import { resolveStoryState } from './storyState';

/* ── THE PUBLISHED VALUES ────────────────────────────────────────────────── */

/** R5/R7 — the mercy rule's floor: a named ladder regular at Tier 2 or higher. */
export const MERCY_MIN_TIER = 2;

/** R6 — the chapter offers begin at (STORY-1's table, 0-7). */
export const MERCY_CHAPTER = 3;

/**
 * STORY-4a — Director ruling R1: Finish pays the duel's FINAL fame x 1.25,
 * rounded, applied once at the choice.  This is a ruling, not a design value;
 * the Director may countermand it.
 */
export const FINISH_FAME_MULTIPLIER = 1.25;

/** The two answers. */
export type MercyChoice = 'spare' | 'finish';

/* ── THE STATE (one field, lazy) ─────────────────────────────────────────── */

/** The spared map, exactly as Pitch A9 shapes it. */
export type SparredState = { [rivalId: string]: true };

/**
 * The rivals a save records as SPARED.  Absent, null and malformed all read as
 * "nobody spared"; an entry is kept only when it is exactly `true`, and the
 * returned record is always a fresh object (the profile is never mutated).
 */
export function resolveSpared(profile: PlayerProfile | null | undefined): SparredState {
  const stored = profile?.spared;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const spared: SparredState = {};
  for (const [rivalId, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof rivalId !== 'string' || rivalId === '') continue;
    if (raw === true) spared[rivalId] = true;
  }
  return spared;
}

/** Is this rival in the spared map? */
export function isRivalSpared(
  profile: PlayerProfile | null | undefined,
  rivalId: string
): boolean {
  return resolveSpared(profile)[rivalId] === true;
}

/* ── THE FENCE (R7: derived from the roster, never a literal id list) ─────── */

/**
 * The ladder's NAMED REGULARS at Tier 2 or higher — Cassius, Brutus, Naija,
 * Drusus, Kallias and the Pale Twins, derived from the roster itself (`tier >=
 * MERCY_MIN_TIER`, not a boss, not a Feature Bout).  No row's id is written in
 * this file, so a future roster edit moves the population with the data.
 */
const MERCY_ROSTER: readonly OpponentConfig[] = LADDER_OPPONENTS.filter(
  (row) => row.isBoss !== true && row.featureBout !== true && Math.floor(row.tier) >= MERCY_MIN_TIER
);

/** The same population as ids, for the derivations below and for tests. */
export const MERCY_RIVAL_IDS: readonly string[] = MERCY_ROSTER.map((row) => row.id);

/**
 * Is this opponent a rival mercy can be offered for?  STORY-4a — Director
 * ruling R5/R7: a named ladder regular at Tier 2+, never Sextus, never a boss
 * of any kind, never a generated grudge row (that rival already had his
 * choice).
 */
export function isMercyRival(opponent: OpponentConfig | null | undefined): boolean {
  if (!opponent) return false;
  if (typeof opponent.id !== 'string' || opponent.id === '') return false;
  // R5 — the story bout (Sextus the Yard Measure) is not a mercy rival.
  if (opponent.id === DOCTORE_TEST_OPPONENT.id) return false;
  // R5 — bosses hold no grudges and take no mercy: ladder bosses AND Feature
  // Bout bosses are excluded by this one check plus the roster derivation.
  if (opponent.isBoss === true) return false;
  if (opponent.featureBout === true) return false;
  // R5 — a generated grudge row is never a mercy rival.
  if (opponent.grudge !== undefined) return false;
  if (!Number.isFinite(opponent.tier) || Math.floor(opponent.tier) < MERCY_MIN_TIER) return false;
  return MERCY_RIVAL_IDS.includes(opponent.id);
}

/* ── THE OFFER ───────────────────────────────────────────────────────────── */

/** What the result surface needs to draw the choice. */
export interface MercyOffer {
  /** The base roster id the flag (and the grudge) is keyed by. */
  rivalId: string;
  rivalName: string;
  /**
   * True on the FIRST offer this profile has ever seen — the Chapter 3
   * teaching firing, which carries the teaching lines.
   */
  teaching: boolean;
}

/**
 * The offer for this result, or `null`.  Everything the rule reads comes from
 * the profile as it stood when the bout was FOUGHT (before the victory write):
 *
 *   • the rival passes the R5/R7 fence;
 *   • the win is that rival's FIRST defeat (R5's "once each" and R4's "no
 *     retroactive offers": a rival already in the book can never be offered
 *     again, whether he was spared, finished, or beaten before this slice);
 *   • he is not already spared;
 *   • the bout was fought in Chapter 3 or later (R6).
 *
 * `chapterOverride` exists so the rule can be exercised before Stage 2 unlocks
 * Chapter 3 — the shipped call passes nothing and the chapter is derived.
 */
export function mercyOfferFor(
  profile: PlayerProfile | null | undefined,
  opponent: OpponentConfig | null | undefined,
  didWin: boolean,
  chapterOverride?: number
): MercyOffer | null {
  if (!didWin || !profile) return null;
  if (!isMercyRival(opponent)) return null;
  // R5 — once each: only a FIRST defeat can offer.  (The spared map then holds
  // the Spare half of the rule; this holds both halves.)
  const defeated = Array.isArray(profile.defeatedOpponentIds) ? profile.defeatedOpponentIds : [];
  if (defeated.includes(opponent!.id)) return null;
  if (isRivalSpared(profile, opponent!.id)) return null;
  // R6 — Chapter 3+ only, read from the record this bout was fought with.
  const chapter = Number.isFinite(chapterOverride)
    ? (chapterOverride as number)
    : resolveStoryState(profile).chapter;
  if (chapter < MERCY_CHAPTER) return null;

  return {
    rivalId: opponent!.id,
    rivalName: opponent!.name,
    teaching:
      Object.keys(resolveSpared(profile)).length === 0 && !hasFinishedAnyRival(profile),
  };
}

/* ── THE WRITES ──────────────────────────────────────────────────────────── */

/**
 * SPARE — `spared[rivalId] = true`, idempotently: a second write for the same
 * rival returns the caller's own profile, so nothing is saved twice.
 *
 * The rival KEEPS his grudge (R2): the grudge bout is the higher-difficulty
 * return path, so this write touches `spared` and nothing else.  Gold is never
 * touched by mercy.
 */
export function spareRival(profile: PlayerProfile, rivalId: string): PlayerProfile {
  if (!profile || typeof rivalId !== 'string' || rivalId === '') return profile;
  const spared = resolveSpared(profile);
  if (spared[rivalId] === true) return profile;
  return { ...profile, spared: { ...spared, [rivalId]: true } };
}

/** What Finish paid and removed. */
export interface FinishOutcome {
  profile: PlayerProfile;
  /** The duel's final fame x 1.25, rounded — the total that now stands. */
  totalFame: number;
  /** The increment this choice added on top of the fame the duel already paid. */
  extraFame: number;
}

/**
 * FINISH — the bigger fame purse, once, and the rival is gone.
 *
 * STORY-4a — Director ruling R1: the duel's FINAL fame (after the mode
 * multipliers, the crowd peak, the crowd-turned factor and the omen
 * multipliers, in that order) x 1.25, ROUNDED, applied once at the choice.
 * The duel's own write already paid `finalFame`, so only the rounded
 * difference is added here — calling this twice would pay the difference twice,
 * which is why the result surface writes it exactly once.
 *
 * STORY-4a — Director ruling R2: the Finished rival's grudge for that defeat is
 * REMOVED.  No record, no future grudge (`recordStandardVictory` only records a
 * FIRST victory) and no further offer.  Gold is untouched.
 */
export function finishRival(
  profile: PlayerProfile,
  rivalId: string,
  finalFame: number
): FinishOutcome {
  const baseFame = Number.isFinite(finalFame) ? Math.max(0, Math.round(finalFame)) : 0;
  const totalFame = Math.round(baseFame * FINISH_FAME_MULTIPLIER);
  const extraFame = Math.max(0, totalFame - baseFame);

  let next = profile;
  // Remove the one key from the STORED record, leaving every other entry exactly
  // as it was saved — a resolver read here would rewrite the map into its own
  // normalised shape, which is more than this answer is allowed to touch.
  const stored = profile.grudges;
  if (stored && typeof stored === 'object' && !Array.isArray(stored) && rivalId in stored) {
    const { [rivalId]: _removed, ...rest } = stored as Record<string, GrudgeRecord>;
    next = { ...next, grudges: rest };
  }
  if (extraFame > 0) next = { ...next, fame: (next.fame ?? 0) + extraFame };
  return { profile: next, totalFame, extraFame };
}

/* ── THE DERIVED "FINISHED" (no second field) ─────────────────────────────── */

/**
 * Was this rival FINISHED?  Derived, because Finish writes no flag:
 * a mercy rival the player has beaten, with no grudge record left and no spared
 * entry.  C-8.70C records a grudge on every first victory over a regular, and
 * this slice's Finish is the only writer that removes one — so the absence is
 * the record.
 *
 * Known edge, stated rather than hidden: a save written before C-8.70C could in
 * principle carry a beaten regular with no grudge record, and would read as
 * finished.  It cannot produce a wrong consequence (no grudge to remove, no
 * offer to suppress that the first-defeat rule does not already suppress); it
 * can only suppress the first-Finish herald line once on such a save.
 */
export function isRivalFinished(
  profile: PlayerProfile | null | undefined,
  rivalId: string
): boolean {
  if (!profile || !MERCY_RIVAL_IDS.includes(rivalId)) return false;
  const defeated = Array.isArray(profile.defeatedOpponentIds) ? profile.defeatedOpponentIds : [];
  if (!defeated.includes(rivalId)) return false;
  if (isRivalSpared(profile, rivalId)) return false;
  return resolveGrudges(profile)[rivalId] === undefined;
}

/** Has this profile finished any rival at all?  (The first-Finish herald gate.) */
export function hasFinishedAnyRival(profile: PlayerProfile | null | undefined): boolean {
  return MERCY_RIVAL_IDS.some((rivalId) => isRivalFinished(profile, rivalId));
}

/**
 * Is this answer the profile's FIRST of its kind?  Read from the record before
 * the answer's own write: the first Spare is the first entry the spared map ever
 * holds, and the first Finish is the first rival this slice has finished (both
 * derived — Finish writes no flag).  The herald's one-line cries are gated here.
 */
export function isFirstMercyOfKind(
  profile: PlayerProfile | null | undefined,
  choice: MercyChoice
): boolean {
  if (choice === 'spare') return Object.keys(resolveSpared(profile)).length === 0;
  return !hasFinishedAnyRival(profile);
}

/* ── THE BOARD CARDS (§5) ────────────────────────────────────────────────── */

/** One rival's grudge card, as the Primus Palus board prints it. */
export interface BoardGrudgeCard {
  /** The base roster id the board's entry is keyed by. */
  rivalId: string;
  rivalName: string;
  /** The generated rematch row the bout is started with (the board's own link). */
  boutId: string;
  grudgeTier: number;
  /** The grudge may be entered right now. */
  open: boolean;
  /** base -> adjusted, from `grudgeProfileLine` (the C-A shifts, caps ±0.15). */
  shifts: string;
  /** The C-TRAIT line, "Evolved trait — <name> — <effect>", or ''. */
  trait: string;
  /** The granted palma's name alone, or '' when C-TRAIT granted none. */
  palmaName: string;
}

/**
 * Every rival with a LIVE grudge — one the player has not settled and whose
 * venue tier the ladder has — read entirely through `grudgeBoutStatuses` and the
 * existing card helpers.  Nothing here recomputes a shift, a cap or a grant.
 */
export function boardGrudgeCards(
  profile: PlayerProfile | null | undefined
): BoardGrudgeCard[] {
  return grudgeBoutStatuses(profile)
    .filter((status) => !status.settled)
    .map((status) => {
      const evolved = status.opponent.grudge?.evolvedTrait;
      return {
        rivalId: status.base.id,
        rivalName: status.base.name,
        boutId: status.opponent.id,
        grudgeTier: status.grudgeTier,
        open: status.open,
        shifts: grudgeProfileLine(status.opponent.grudge),
        trait: grudgeTraitLine(status.opponent),
        palmaName: getPalma(evolved)?.name ?? '',
      };
    });
}

/* ── THE WORDS (flavor only; no numbers, no promised mechanics) ───────────── */

/**
 * R6 — the teaching lines the Chapter 3 firing carries.  Flavor in the keeper's
 * voice: they name the choice and say it is made once, and promise nothing.
 */
export const MERCY_TEACHING_LINES: readonly string[] = [
  'The keeper speaks low, so the crowd cannot hear it: a beaten man is not yet a dead one.',
  'Spare him and he will come back for you. Finish him and the sand keeps what it is given.',
  'It is asked once, and only of the named. Say it, and it is said.',
];

/**
 * The keeper's line for the offer and for each answer.  Flavor on the result
 * surface only — no keeper registry data is added, and `src/data/keepers.ts` is
 * not touched.
 */
export function mercyKeeperLine(stage: 'offer' | 'spare' | 'finish', rivalName: string): string {
  const name = rivalName && rivalName.trim() ? rivalName.trim() : 'Your rival';
  if (stage === 'spare') {
    return `The keeper does not look at you. “He walks out of the sand. He will not forget that you let him.”`;
  }
  if (stage === 'finish') {
    // STORY-4a — Director ruling R3: the house mark is FLAVOR ONLY.  The price
    // effect at the shops and the revenge bounty at Scribonia's board are
    // DEFERRED (no rival→house mapping, no bounty-hunter design), so this line
    // promises nothing mechanical — it is the keeper's words, nothing more.
    return `The keeper turns away before the sand is still. “It is done. ${name}'s house will hear of it.”`;
  }
  return `The keeper stays your hand a moment. “He is beaten. What comes next is yours to say, and it is said once.”`;
}

/**
 * The consequence line under the answer, in the surface's own words.  Spare
 * names the return path; Finish names the fame and the loss, in numbers, because
 * the surface must agree with the save.
 */
export function mercyChoiceLine(
  choice: MercyChoice,
  rivalName: string,
  extraFame = 0
): string {
  const name = rivalName && rivalName.trim() ? rivalName.trim() : 'Your rival';
  if (choice === 'spare') {
    return `Spared — ${name} keeps his grudge and may call you out again, one tier higher and having studied you.`;
  }
  return (
    `Finished — fame x${FINISH_FAME_MULTIPLIER.toFixed(2)} on this bout, counted once` +
    (extraFame > 0 ? ` (+${extraFame})` : '') +
    `. ${name} will not come back.`
  );
}

/** The first-Spare herald line (flavor; no numbers, nothing promised). */
export const MERCY_FIRST_SPARE_CRY =
  'A hand is stayed in the sand — the herald will not read that name as ended.';

/** The first-Finish herald line (flavor; no numbers, nothing promised). */
export const MERCY_FIRST_FINISH_CRY =
  'One more name struck from the lists, and the herald reads it slowly.';

/**
 * The herald's one-line cry for a mercy answer, or none.  Each fires ONCE per
 * profile: the first Spare is the first entry the spared map ever holds, and the
 * first Finish is the first rival this slice has finished (derived above).
 */
export function mercyHeraldCries(choice: MercyChoice, first: boolean): string[] {
  if (!first) return [];
  return [choice === 'spare' ? MERCY_FIRST_SPARE_CRY : MERCY_FIRST_FINISH_CRY];
}
