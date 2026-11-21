/**
 * ===========================================================================
 * FOUNTAIN COIN TOSS — Fortuna's favour, bought at the forum fountain
 * ===========================================================================
 * The forum fountain (SouthernDistrict's `ForumFountain`, mounted at [10, 0, 30])
 * takes a coin for a temporary Luck boost.  A small, delightful interaction that
 * makes the fountain *do* something — and the slice that introduces Luck, the
 * first of the vision doc's hidden attributes ("hidden Luck & Happiness").
 *
 * ── THE FIELD (design-published shape) ─────────────────────────────────────
 * `PlayerProfile.luck?: LuckState` is a LAZY optional object exactly like
 * `omen` and `time`: absent means no boost, and a missing, null or malformed
 * field reads as "no boost" rather than being repaired.  `LuckState` is one
 * number: `boostUntil`, the phase total (`resolveTimeState(profile).total`) at
 * the next dawn.  Nothing migrates the field and `createNewProfile()` writes
 * neither it nor a Luck of its own — Luck has no base value yet.
 *
 * ── DIRECTOR RULINGS (AUTHORED — implemented exactly as ruled) ─────────────
 * Ruling 1: one toss costs 1 gold ("small gold"), deducted immediately.  A purse
 * that cannot cover it is refused before any arithmetic, so no luck is written
 * and no save is touched — the same shape as the omen's gold refusal.
 * Ruling 2: the boost is +10% Luck (`LUCK_BOOST_PERCENT`) until the next dawn.
 * The Nov 4 brief said "30 game-minutes", but the clock has no minutes — time
 * advances in phases (`src/utils/timeState.ts`), so the dawn bound the brief
 * gave ("or until next dawn, whichever comes first") IS the duration: the boost
 * is live for totals in `[tossTotal, dawnTotal)`, i.e. `phasesUntilDawn` phases
 * (7 at dawn, 1 at night).  A toss at dawn buys the whole day; a toss at night
 * buys one phase.
 * Ruling 3: a new toss REPLACES a live boost — but the replacement can never
 * extend it, because the dawn is fixed.  A re-toss while the boost is live is
 * therefore always a pure waste of 1 gold, so it is REFUSED (`already-blessed`)
 * instead of charged: the panel disables the button while the boost is live and
 * prints the live line.  (The omen replaces a live omen with no refund; the
 * fountain cannot, because its duration is anchored to a dawn, not a bout.)
 * Ruling 4: Luck has NO consumer in this slice.  No duel, loot, shop or racing
 * formula reads it yet — the boost is live state plus its panel display, and
 * the first consumer is a follow-up slice (a duel-reward or bounty-purse
 * multiplier is the natural home).  This module must not be read as claiming
 * the +10% does anything mechanical today.
 * Ruling 5: the fountain the toss animates is the MOUNTED one.  SouthernDistrict
 * was never mounted on main (verified Nov 11 2026: nothing in the live scene
 * renders it), so this slice mounts ONLY `ForumFountain` — the other four
 * southern pieces (macellum, bibliotheca, pistrinum, triumphal arch) stay
 * unmounted, and their mount is a separate follow-up.  The basin's collider is
 * the rect the C-8.47 approach table already expects (`'forum'`).
 *
 * This module is pure: no storage, no profile write, no clock.  The gold and
 * the luck move only through a profile `App` then saves on the game's one
 * save-on-change path.
 */

import type { LuckState, PlayerProfile } from '../types/game';
import { resolveTimeState } from './timeState';

/** What one toss costs.  Ruling 1. */
export const COIN_TOSS_PRICE = 1;

/** The boost the toss buys, in percent.  Ruling 2 — display only until a consumer lands (Ruling 4). */
export const LUCK_BOOST_PERCENT = 10;

/**
 * The result line the panel prints after a successful toss — the brief's flavour
 * line verbatim.
 */
export const COIN_TOSS_RESULT_LINE =
  'The fountain glimmers. Fortune smiles upon you — luck favours you until dawn.';

/** The line the panel prints while a boost is live. */
export const LUCK_BOOST_LIVE_LINE =
  'Fortune already smiles on you — your luck holds until dawn. Come back after dawn to toss again.';

export type CoinTossRejectionReason = 'insufficient-gold' | 'already-blessed';

/**
 * `ok: false` carries the reason and no profile — nothing is paid and nothing
 * is saved.  `ok: true` carries the NEW luck state and the NEW profile.
 */
export type CoinTossOutcome =
  | { ok: false; reason: CoinTossRejectionReason }
  | { ok: true; luck: LuckState; profile: PlayerProfile };

/** A raw luck value, normalised: only a finite, positive phase total reads as a boost. */
function normalizeBoostUntil(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.floor(raw);
}

/**
 * Read the live Luck boost, the way every other lazy profile field is read.
 * `null` means no boost is live (absent, malformed, or expired at dawn).
 * Never throws and never repairs the save.
 */
export function resolveLuckBoost(profile: PlayerProfile | null | undefined): LuckState | null {
  const raw = (profile as { luck?: unknown } | null | undefined)?.luck;
  if (typeof raw !== 'object' || raw === null) return null;
  const boostUntil = normalizeBoostUntil((raw as { boostUntil?: unknown }).boostUntil);
  if (boostUntil === null) return null;
  const { total } = resolveTimeState(profile);
  if (total >= boostUntil) return null;
  return { boostUntil };
}

/**
 * How many phases the live boost has left (0 when none is live).  The panel's
 * display reads this; no consumer exists yet (Ruling 4).
 */
export function luckBoostPhasesLeft(profile: PlayerProfile | null | undefined): number {
  const boost = resolveLuckBoost(profile);
  if (!boost) return 0;
  return boost.boostUntil - resolveTimeState(profile).total;
}

/**
 * Toss a coin into the fountain.  Ruling 1: a purse under 1 gold is refused
 * before any arithmetic.  Ruling 3: a live boost is refused rather than
 * charged, because a re-toss could never extend a dawn-bound boost.
 * Otherwise the gold is debited and the boost is set to the next dawn.
 *
 * PURE: the argument is never mutated, and nothing is persisted here — the
 * caller hands the result to the existing `saveProfile()` path.
 */
export function tossCoin(profile: PlayerProfile): CoinTossOutcome {
  const gold = (profile as { gold?: unknown } | null)?.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < COIN_TOSS_PRICE) {
    return { ok: false, reason: 'insufficient-gold' };
  }
  if (resolveLuckBoost(profile)) {
    return { ok: false, reason: 'already-blessed' };
  }
  const { total, phasesUntilDawn } = resolveTimeState(profile);
  const luck: LuckState = { boostUntil: total + phasesUntilDawn };
  return {
    ok: true,
    luck,
    profile: { ...profile, gold: gold - COIN_TOSS_PRICE, luck },
  };
}

/** The panel's line for a successful toss.  The boost itself is the argument. */
export function coinTossResultLine(_luck: LuckState): string {
  return COIN_TOSS_RESULT_LINE;
}

/** The panel's line while a boost is live, or `null` when none is. */
export function luckBoostLine(profile: PlayerProfile | null | undefined): string | null {
  return resolveLuckBoost(profile) ? LUCK_BOOST_LIVE_LINE : null;
}

/** Is the boost live right now?  The button's disabled state reads this. */
export function isLuckBoostActive(profile: PlayerProfile | null | undefined): boolean {
  return resolveLuckBoost(profile) !== null;
}
