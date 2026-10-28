/**
 * ===========================================================================
 * D-3 — VARRO'S FALSE TELEGRAPH: the tell, the roll, and the two lying heavies
 * ===========================================================================
 * Varro "The Mirage" announces every heavy the way Goliath does — the same
 * `'telegraph'` action, the same one full turn for the player to answer — and
 * then the announced heavy turns out to be one of two things:
 *
 *   TRUE   the heavy he promised: `planted` feet (weight on the back foot) and
 *          the normal `power_attack` through the standard pipeline.
 *   FEINT  the same wind-up, `light` feet (weight forward), resolving as a
 *          QUICK attack through the standard pipeline: quick hit profile, quick
 *          damage, quick stamina. A feint is a lie about the ATTACK, never about
 *          the TIME the player is given — the telegraph's own duration is
 *          untouched, so both answers remain blockable.
 *
 * This module owns WHAT the tell is, WHEN the roll decides, and the two words
 * the duel says; `DuelScene` owns only the calls. Everything here is pure — no
 * React, no storage, no clock, and no randomness that is not the caller's own
 * seed — which is what makes a seeded sequence testable without a browser.
 *
 * ── THE FENCE ──────────────────────────────────────────────────────────────
 *   a false telegraph exists  ⇔  the opponent `isBoss` ∧ carries `featureBout`
 *                                ∧ its mechanic is `false_telegraph` ∧ the row
 *                                carries valid `falseTelegraph` sub-data.
 *
 * A regular opponent carrying a copied mechanic string therefore answers `null`
 * and every call site is a no-op — the same acceptance core D-2 shipped for the
 * beast, pinned the same way.
 *
 * ── THE TELL IS WEIGHT, NEVER SIDE ─────────────────────────────────────────
 * `tellFor` reads the KIND and nothing else: lefty and righty mode are
 * presentation of a hand, and a tell about which foot carries the weight cannot
 * depend on which hand holds the sword. The suite asserts the identical
 * sequence with the app's lefty flag on and off.
 */
import type { FalseTelegraphConfig, OpponentConfig } from '../types/game';

/** Which foot carries the weight. The ONE cue the player reads. */
export type FeetTell = 'light' | 'planted';

/** What the announced heavy actually is. */
export type TelegraphKind = 'true' | 'feint';

/** The HUD words, fired once, on the first feint of the bout (Part A's line). */
export const FEET_TELL_WORDS = 'His foot stayed light — that one was a lie. Watch the feet.';

/** Varro's whole duel-session state. Transient by construction — never saved. */
export interface FalseTelegraphState {
  /** Heavies initiated this duel (the teaching pair included). */
  heavies: number;
  /** Feints thrown so far. */
  feints: number;
  /** The announced heavy's tell while the wind-up is live; `null` otherwise. */
  tell: FeetTell | null;
  /** The announced heavy's kind while the wind-up is live; `null` otherwise. */
  kind: TelegraphKind | null;
  /** The one-time HUD line has fired. */
  toldOnce: boolean;
  /** Two Faces: the last feint armed the next TRUE heavy. */
  followUpArmed: boolean;
}

/** A fresh bout: no heavies thrown, no tell up, nothing told. */
export function createFalseTelegraphState(): FalseTelegraphState {
  return { heavies: 0, feints: 0, tell: null, kind: null, toldOnce: false, followUpArmed: false };
}

/* ── THE FENCE ───────────────────────────────────────────────────────────── */

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The false telegraph this opponent carries, or `null` when it carries none.
 *
 * THE FENCE, in full: `isBoss` ∧ `featureBout` ∧ the mechanic ∧ usable
 * sub-data. Each clause is required, so a synthetic regular opponent carrying a
 * copied mechanic string can never telegraph a lie.
 */
export function falseTelegraphConfigFor(
  opponent: OpponentConfig | null | undefined
): FalseTelegraphConfig | null {
  if (!opponent) return null;
  if (opponent.isBoss !== true) return null;
  if (opponent.featureBout !== true) return null;
  if (opponent.bossMechanic !== 'false_telegraph') return null;

  const config = opponent.falseTelegraph;
  if (!config) return null;
  if (!finite(config.feintChance) || config.feintChance < 0 || config.feintChance > 1) return null;
  if (!Array.isArray(config.teachingSequence)) return null;
  if (config.teachingSequence.some((kind) => kind !== 'true' && kind !== 'feint')) return null;
  if (!finite(config.feintFollowUpMult) || config.feintFollowUpMult < 1) return null;
  return config;
}

/** Is this opponent one whose heavies lie? The one predicate every site asks. */
export function isFalseTelegraphBout(opponent: OpponentConfig | null | undefined): boolean {
  return falseTelegraphConfigFor(opponent) !== null;
}

/* ── THE SEEDED ROLL ─────────────────────────────────────────────────────── */

/**
 * A deterministic value in [0, 1) from a seed and a salt (the heavy's index).
 *
 * A small integer avalanche (the murmur/mulberry family), chosen because it is
 * exact in 32-bit lanes on every JS engine and needs no state object: the same
 * `(seed, salt)` always answers the same number, which is what lets a duel's
 * feint sequence, and its test, be one fixed thing. A non-finite seed or salt
 * reads as zero rather than producing `NaN`.
 */
export function seededRoll(seed: number, salt: number): number {
  let t = (Math.floor(finite(seed) ? seed : 0) ^ Math.imul(Math.floor(finite(salt) ? salt : 0), 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
  t = (t ^ (t >>> 15)) >>> 0;
  return t / 4294967296;
}

/* ── THE TELL ────────────────────────────────────────────────────────────── */

/** The tell a kind wears. Weight forward (light) for a lie; planted for the real one. */
export function tellFor(kind: TelegraphKind): FeetTell {
  return kind === 'feint' ? 'light' : 'planted';
}

/** The action a planned heavy resolves as — a feint IS a quick attack. */
export function falseTelegraphAction(kind: TelegraphKind): 'quick_attack' | 'power_attack' {
  return kind === 'feint' ? 'quick_attack' : 'power_attack';
}

/** What the announced heavy is, and the tell it wears. */
export interface HeavyPlan {
  kind: TelegraphKind;
  tell: FeetTell;
}

/**
 * Decide the heavy BEFORE it is announced, so its tell can be shown.
 *
 * The teaching sequence is taken first (`state.heavies` is how many have already
 * been thrown, so heavies 1 and 2 are its entries 0 and 1); afterwards the seeded
 * roll against the row's own `feintChance` governs. A roll exactly ON the chance
 * reads as a true heavy (`<`, not `<=`), so `feintChance` 0 is "never lies" and
 * 1 is "always" without a special case.
 */
export function planHeavy(
  state: FalseTelegraphState,
  config: FalseTelegraphConfig,
  seed: number
): HeavyPlan {
  const forced = config.teachingSequence[Math.max(0, Math.floor(state.heavies))];
  const kind: TelegraphKind =
    forced ?? (seededRoll(seed, state.heavies + 1) < config.feintChance ? 'feint' : 'true');
  return { kind, tell: tellFor(kind) };
}

/** The heavy is announced: count it and publish its tell for the wind-up's turn. */
export function initiateHeavy(
  state: FalseTelegraphState,
  config: FalseTelegraphConfig,
  seed: number
): { state: FalseTelegraphState; plan: HeavyPlan } {
  const plan = planHeavy(state, config, seed);
  return {
    plan,
    state: { ...state, heavies: state.heavies + 1, tell: plan.tell, kind: plan.kind },
  };
}

/**
 * The announced heavy resolves — whatever the blow then becomes (a landed hit, a
 * block, a miss, an evade, or a swing that fell short all spend it).
 *
 * A feint counts here, arms Two Faces, and speaks its one-time line; a TRUE heavy
 * spends whatever Two Faces had armed, so the +15 % can never carry past the blow
 * it was promised to (win or lose the exchange). The tell always comes down.
 */
export function resolveHeavy(
  state: FalseTelegraphState,
  kind: TelegraphKind
): { state: FalseTelegraphState; words: string } {
  const feint = kind === 'feint';
  return {
    words: feint && !state.toldOnce ? FEET_TELL_WORDS : '',
    state: {
      ...state,
      tell: null,
      kind: null,
      feints: state.feints + (feint ? 1 : 0),
      toldOnce: state.toldOnce || feint,
      followUpArmed: feint,
    },
  };
}

/**
 * Two Faces' multiplier for the heavy about to resolve: the palma's own +15 %
 * when this is a TRUE heavy and the last thing thrown was a feint, else 1.
 */
export function followUpMultiplier(
  state: FalseTelegraphState,
  config: FalseTelegraphConfig,
  kind: TelegraphKind
): number {
  return kind === 'true' && state.followUpArmed ? config.feintFollowUpMult : 1;
}
