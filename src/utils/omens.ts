/**
 * ===========================================================================
 * PITCH A1 — FORTUNA'S OMEN: the shrine's word, before the tournament
 * ===========================================================================
 * `ideas-story.md` §5 Hook A: at the Shrine, before any tournament, offer gold
 * for an omen — a kind omen (a small fame bonus on the next tournament win), an
 * ill omen (a harder first bout for a bigger purse if you win anyway), or
 * decline (a small "self-reliant" fame trickle the first time).  The consequence
 * must be immediate, legible and repeatable, so the shrine becomes a pre-fight
 * ritual stop for the rest of the game (`story-design.md` Beat 3).
 *
 * ── THE FIELD (design-published shape) ─────────────────────────────────────
 * `PlayerProfile.omen?: { kind: OmenKind; expiresAtBout: number }` is a LAZY
 * optional object exactly like `chariot` and `racing`: absent means no omen, and
 * a missing, null or malformed field reads as "no omen" rather than being
 * repaired.  `expiresAtBout` is total bouts (`fightsWon + fightsLost`) + 1 at the
 * moment of offering — always the next duel.  `PlayerProfile.omenTrickleClaimed?:
 * boolean` is the once-ever marker the decline needs (absent/false = unclaimed).
 * Nothing migrates either field and `createNewProfile()` writes neither.
 *
 * ── DIRECTOR RULINGS (AUTHORED — implemented exactly as ruled) ─────────────
 * Pitch A1 — Director ruling 1: offering price 25 gold ("small gold", anchored
 * to the Inn's 25 g rest price against T1 purses of 35–120 g).  A purse that
 * cannot cover it is refused before any arithmetic, so no omen is written and no
 * save is touched — the same shape as the training gold refusal.
 * Pitch A1 — Director ruling 2: kind determination is RANDOM at offering, 50/50
 * kind/ill, through an injectable RNG (default `Math.random`).  Fortuna gives
 * what she gives; there are two listed outcomes, so equal weight is the cleanest
 * faithful reading, and tests inject a sequence so both are reachable.
 * Pitch A1 — Director ruling 3: a kind omen multiplies the NEXT duel win's fame
 * by ×1.25 applied LAST — after the bout-mode multiplier, after the crowd's peak
 * bonus, after the crowd-turned factor.  C-C's composition order is untouched:
 * this module is handed the numbers that order already produced and multiplies
 * the final fame.  Gold is never touched.
 * Pitch A1 — Director ruling 4: an ill omen hardens the NEXT duel only —
 * opponent aggression +0.10 and blockChance +0.05, clamped into [0.05, 0.95]
 * (anchored to Challenge C-A's verbatim grudge shifts).  It is applied at the
 * same duel-entry layer as the mode delta and AFTER it, and it is NOT counted
 * toward C-C's ±0.20 grudge+mode budget: it is a separate shrine effect.
 * Winning that bout anyway pays gold ×1.25 AND fame ×1.25, applied last (the same
 * final position as the kind omen); losing it expires the omen unpaid.
 * Pitch A1 — Director ruling 5: the decline's "self-reliant" trickle is paid
 * ONCE per profile, ever: +5 fame immediately (anchored below a T1 win's 10–35
 * fame), recorded by `omenTrickleClaimed`.  Later declines pay nothing and write
 * nothing.  Declining while an omen is live leaves that omen untouched and pays
 * nothing (and therefore does not spend the trickle).
 * Pitch A1 — Director ruling 6: at offering, `expiresAtBout = fightsWon +
 * fightsLost + 1` — the next bout's index.  The omen is consumed at the next
 * duel result in `App.handleMatchComplete`, inside its EXISTING save: a kind
 * omen pays on a win and expires unpaid on a loss; an ill omen hardens that one
 * bout and pays or expires at its result.  A new offering REPLACES a live omen
 * (no refund — the latest word stands, and Hook A wants it repeatable).
 * Pitch A1 — Director ruling 7: "tournament win" maps to ANY duel win — ladder,
 * Feature Bout or grudge — all entered from the tournament menu.  Races (the
 * circus) never consume, trigger or interact with omens; training, story beats
 * and Rest do not consume them either (only a duel RESULT does).
 * Pitch A1 — Director ruling 8: the once-ever trickle needs a persistent marker;
 * `omenTrickleClaimed?: boolean` is this slice's SECOND new profile field.
 *
 * ── OUT OF THIS SLICE (deliberately not built here) ────────────────────────
 * Pitch A1 — Event A's doubling is out of scope (there is no event system in
 * this tree).  The retention doc's random flavour-modifier variant of the omen
 * is RECONCILED here rather than implemented: Hook A governs A1, so the omen's
 * two outcomes are the kind/ill pair above, not a random modifier table.
 * Fortunae-day doubling needs the festival state and is a later slice.
 * K3's Postumia plate on the shrine panel comes later — this slice builds the
 * panel, not the plate.
 *
 * This module is pure: no storage, no profile write, no clock.  The gold and the
 * omen move only through a profile `App` then saves on the game's one
 * save-on-change path, and the duel result that consumes the omen does so inside
 * the write it already performs.
 */

import type { OmenKind, OmenState, PlayerProfile, SteelDelta } from '../types/game';
import { clampBoutProfileValue } from '../data/boutModes';

/** What one offering costs.  Pitch A1 — Director ruling 1. */
export const OMEN_PRICE = 25;

/** The kind omen's final fame multiplier.  Pitch A1 — Director ruling 3. */
export const OMEN_FAME_MULTIPLIER = 1.25;

/** The ill omen's final gold multiplier on a win.  Pitch A1 — Director ruling 4. */
export const OMEN_ILL_GOLD_MULTIPLIER = 1.25;

/** The ill omen's duel-entry shift.  Pitch A1 — Director ruling 4. */
export const OMEN_ILL_PROFILE_DELTA: SteelDelta = Object.freeze({
  aggression: 0.1,
  blockChance: 0.05,
});

/** The once-ever decline trickle.  Pitch A1 — Director ruling 5. */
export const OMEN_TRICKLE_FAME = 5;

/** Equal weight for the two words.  Pitch A1 — Director ruling 2. */
export const OMEN_KIND_CHANCE = 0.5;

const ZERO_DELTA: SteelDelta = Object.freeze({ aggression: 0, blockChance: 0 });

/** The fields this module reads, so a bare literal in a suite satisfies it. */
export interface OmenRecord {
  omen?: OmenState | null;
  omenTrickleClaimed?: boolean;
  fightsWon?: number;
  fightsLost?: number;
  gold?: number;
  fame?: number;
}

/** Total bouts this profile has fought, from the shipped counters. */
function totalBouts(profile: OmenRecord | null | undefined): number {
  const won = profile?.fightsWon;
  const lost = profile?.fightsLost;
  const safe = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  return safe(won) + safe(lost);
}

/**
 * The bout index a new omen would wait for.  Pitch A1 — Director ruling 6:
 * `fightsWon + fightsLost + 1`, i.e. the player's next duel.
 */
export function nextBoutIndex(profile: OmenRecord | null | undefined): number {
  return totalBouts(profile) + 1;
}

/**
 * The live omen, resolved lazily: absent, null, a non-object, an unknown kind or
 * a missing/non-positive bout index all read as "no omen".  Always a fresh
 * object — a caller can never mutate the save through it.
 */
export function resolveOmen(profile: OmenRecord | null | undefined): OmenState | null {
  const raw = profile?.omen as { kind?: unknown; expiresAtBout?: unknown } | null | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind;
  if (kind !== 'kind' && kind !== 'ill') return null;
  const bout = raw.expiresAtBout;
  if (typeof bout !== 'number' || !Number.isFinite(bout) || bout < 1) return null;
  return { kind, expiresAtBout: Math.floor(bout) };
}

/** Is an ill omen waiting on the next bout?  The duel's entry read. */
export function isIllOmenPending(profile: OmenRecord | null | undefined): boolean {
  return resolveOmen(profile)?.kind === 'ill';
}

/** Has this gladiator already taken his one free decline? */
export function isTrickleClaimed(profile: OmenRecord | null | undefined): boolean {
  return profile?.omenTrickleClaimed === true;
}

/** The profile with its omen cleared (the same object when nothing was there). */
export function clearOmen(profile: PlayerProfile): PlayerProfile {
  if (!resolveOmen(profile)) return profile;
  const next = { ...profile };
  delete next.omen;
  return next;
}

/* ── the offerings ───────────────────────────────────────────────────────── */

export type OmenOfferRejectionReason = 'insufficient-gold';

/**
 * `ok: true` carries the NEW profile and the word Fortuna gave; a refusal carries
 * no profile at all, so a refused offering can never reach `saveProfile`.
 */
export type OmenOfferOutcome =
  | { ok: true; profile: PlayerProfile; omen: OmenState }
  | { ok: false; reason: OmenOfferRejectionReason };

/**
 * Offer 25 gold for Fortuna's word.  Pitch A1 — Director ruling 1 (price and its
 * refusal), ruling 2 (50/50 through the injected RNG) and ruling 6 (the bout
 * index, and a new offering replacing a live omen with no refund).
 */
export function offerOmen(
  profile: PlayerProfile,
  random: () => number = Math.random,
): OmenOfferOutcome {
  const gold = (profile as OmenRecord | null)?.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < OMEN_PRICE) {
    return { ok: false, reason: 'insufficient-gold' };
  }
  const roll = typeof random === 'function' ? random() : Number.NaN;
  const kind: OmenKind = Number.isFinite(roll) && roll >= OMEN_KIND_CHANCE ? 'ill' : 'kind';
  const omen: OmenState = { kind, expiresAtBout: nextBoutIndex(profile) };
  return {
    ok: true,
    omen,
    profile: { ...profile, gold: gold - OMEN_PRICE, omen },
  };
}

export type OmenDeclineRejectionReason = 'omen-live' | 'already-claimed';

/**
 * `wrote: false` carries the reason and no profile — nothing is paid and nothing
 * is saved.  `wrote: true` carries the NEW profile and the fame the decline paid.
 */
export type OmenDeclineOutcome =
  | { wrote: false; reason: OmenDeclineRejectionReason }
  | { wrote: true; profile: PlayerProfile; famePaid: number };

/**
 * Decline Fortuna's word.  Pitch A1 — Director ruling 5: the FIRST decline per
 * profile ever pays +5 fame and records the marker; a live omen is left
 * untouched and pays nothing; every later decline writes nothing at all.
 */
export function declineOmen(profile: PlayerProfile): OmenDeclineOutcome {
  if (resolveOmen(profile)) return { wrote: false, reason: 'omen-live' };
  if (isTrickleClaimed(profile)) return { wrote: false, reason: 'already-claimed' };
  const fame = (profile as OmenRecord | null)?.fame;
  const base = typeof fame === 'number' && Number.isFinite(fame) ? Math.max(0, fame) : 0;
  return {
    wrote: true,
    famePaid: OMEN_TRICKLE_FAME,
    profile: {
      ...profile,
      fame: base + OMEN_TRICKLE_FAME,
      omenTrickleClaimed: true,
    },
  };
}

/* ── the duel entry ──────────────────────────────────────────────────────── */

/** The shift an ill omen adds at duel entry — zero when no ill omen waits. */
export function illOmenDelta(illActive: boolean): SteelDelta {
  return illActive ? OMEN_ILL_PROFILE_DELTA : ZERO_DELTA;
}

/**
 * Pitch A1 — Director ruling 4: the ill omen is applied at the same duel-entry
 * layer as the mode delta and AFTER it, clamped into the published [0.05, 0.95]
 * band, and — deliberately — without passing through C-C's ±0.20 grudge+mode cap
 * (a separate shrine effect).  With no ill omen the input is returned unchanged.
 */
export function applyIllOmenToBoutProfile(profile: SteelDelta, illActive: boolean): SteelDelta {
  if (!illActive) return profile;
  return {
    aggression: clampBoutProfileValue(profile.aggression + OMEN_ILL_PROFILE_DELTA.aggression),
    blockChance: clampBoutProfileValue(profile.blockChance + OMEN_ILL_PROFILE_DELTA.blockChance),
  };
}

/* ── the duel result ─────────────────────────────────────────────────────── */

export interface OmenRewards {
  fame: number;
  gold: number;
}

export interface OmenSettlement {
  /** Fame as the result pays it, omen multiplier included. */
  fame: number;
  /** Gold as the result pays it, omen multiplier included. */
  gold: number;
  /** What the omen itself added, so the screen can print it. */
  fameBonus: number;
  goldBonus: number;
  /** True when the omen paid a multiplier on this win. */
  paid: boolean;
  /** Plain wording for the result screen, or null when no omen was live. */
  line: string | null;
}

export const OMEN_KIND_PAID_LABEL = "Fortuna's kind omen";
export const OMEN_KIND_LOST_LINE = "Fortuna's kind omen goes unanswered — the favour is spent.";
export const OMEN_ILL_SPENT_LINE = 'The ill omen is spent.';
export const OMEN_ILL_PAID_LABEL = 'The ill omen is answered';

/**
 * The omen's part in ONE duel result.  Pitch A1 — Director ruling 3: the kind
 * omen's ×1.25 fame is applied LAST, to the numbers C-C's order already produced
 * (mode → crowd peak → crowd turning), and the gold is untouched; ruling 4: the
 * ill omen's win pays gold ×1.25 and fame ×1.25 in that same final position; and
 * either word expires unpaid on a loss.  Pure: it returns new numbers and writes
 * nothing.
 */
export function settleOmenRewards(
  omen: OmenState | null,
  didWin: boolean,
  rewards: OmenRewards,
): OmenSettlement {
  const fame = typeof rewards?.fame === 'number' && Number.isFinite(rewards.fame) ? rewards.fame : 0;
  const gold = typeof rewards?.gold === 'number' && Number.isFinite(rewards.gold) ? rewards.gold : 0;
  if (!omen) return { fame, gold, fameBonus: 0, goldBonus: 0, paid: false, line: null };
  if (!didWin) {
    return {
      fame,
      gold,
      fameBonus: 0,
      goldBonus: 0,
      paid: false,
      line: omen.kind === 'kind' ? OMEN_KIND_LOST_LINE : OMEN_ILL_SPENT_LINE,
    };
  }
  const nextFame = Math.round(fame * OMEN_FAME_MULTIPLIER);
  const nextGold = omen.kind === 'ill' ? Math.round(gold * OMEN_ILL_GOLD_MULTIPLIER) : gold;
  const fameBonus = nextFame - fame;
  const goldBonus = nextGold - gold;
  return {
    fame: nextFame,
    gold: nextGold,
    fameBonus,
    goldBonus,
    paid: true,
    line:
      omen.kind === 'kind'
        ? `${OMEN_KIND_PAID_LABEL}: +${fameBonus} fame`
        : `${OMEN_ILL_PAID_LABEL} — +${goldBonus} gold, +${fameBonus} fame`,
  };
}

/* ── the words (data, so the panels only render them) ────────────────────── */

/** The one line a live omen reads with, on the shrine panel and the fight card. */
export function omenLine(omen: OmenState): string {
  const bout = omen.expiresAtBout;
  return omen.kind === 'kind'
    ? `Fortuna's kind omen — the next bout (#${bout}) pays a quarter more fame if you win.`
    : `Fortuna's ill omen — the next bout (#${bout}): your opponent presses harder and guards better, and a win pays a quarter more gold and fame.`;
}

/** What the panel says once the offering has been taken. */
export function omenOfferResultLine(omen: OmenState): string {
  return omen.kind === 'kind'
    ? "Fortuna's word is kind — the next bout (#" + omen.expiresAtBout + ') pays a quarter more fame if you win.'
    : "Fortuna's word is ill — the next bout (#" + omen.expiresAtBout + ') hardens your opponent; win it and the purse and renown pay a quarter more.';
}

/** What the panel says once the player declines. */
export function omenDeclineResultLine(outcome: OmenDeclineOutcome): string {
  if (outcome.wrote) return `You decline and trust your own arm. +${outcome.famePaid} fame.`;
  return outcome.reason === 'omen-live'
    ? "You decline. Fortuna's omen already rests on you, untouched."
    : 'You decline. Your own arm is all the luck you take.';
}
