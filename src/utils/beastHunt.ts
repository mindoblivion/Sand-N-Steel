/**
 * ===========================================================================
 * D-2 — BEAST HUNT: Ferrum, the crouch cadence, the pounce and the net
 * ===========================================================================
 * Marcellin the Beastmaster's mechanic, as pure state and pure decisions. This
 * module owns WHAT the beast does and WHEN; `DuelScene` owns only the calls. That
 * split is what makes the mechanic testable without a browser, and it is what
 * keeps the mechanic's FENCE in one place:
 *
 *   a beast exists  ⇔  the opponent `isBoss` ∧ carries `featureBout` ∧ its
 *                       mechanic is `beast_hunt` ∧ the row carries valid
 *                       `beast` sub-data
 *
 * A regular opponent that somehow carries the mechanic string therefore fields no
 * beast at all — `beastConfigFor` answers `null` and every call site is a no-op.
 * That is the slice's acceptance core, pinned by the suite.
 *
 * ── WHAT THE BEAST IS NOT ────────────────────────────────────────────────────
 * There is no new combat formula and no new pipeline stage. The pounce is
 * resolved by the duel's EXISTING attack branch, dispatched as the action type
 * the beast's own `hitProfile` names, with the beast's row values substituted for
 * a fighter's (hit agility, strength, base damage). The player's strike at the
 * crouch rolls the same `calculateHitChance` a strike at a fighter does. Wounds
 * are a counter on duel-only state, never health: the beast has no HP, no save
 * and no `FighterState`.
 *
 * Everything here is pure — no React, no storage, no randomness, no clock.
 */
import type { BeastConfig, OpponentConfig } from '../types/game';
import { ENTANGLE_TURNS_ON_LAND } from './statefulDoctrinae';

/** Where the beast is in its own three-beat cycle. */
export type BeastPose = 'prowl' | 'crouch' | 'pounce-resolved' | 'fled';

/**
 * The beast's whole duel-session state. Transient by construction: it lives in a
 * `DuelScene` ref/state pair for one fight and is never written to a profile.
 */
export interface BeastDuelState {
  /** Wounds it has taken (0 … `maxWounds`); the run to its flight. */
  wounds: number;
  /** Boss action slots taken this duel — the cadence counter. */
  slots: number;
  /** Where it is in the cycle. */
  pose: BeastPose;
  /** Cadences it will still skip, bought by the retiarius' net. */
  netSkip: number;
}

/** The beast's telegraph, shown for the whole of the player's one action against it. */
export const BEAST_CROUCH_TELEGRAPH = 'FERRUM CROUCHES — POUNCE INCOMING';

/** The HUD's one-line report of the master-alone phase (Part D's words). */
export const BEAST_FLIGHT_WORDS = 'The master fights mad now — grief makes him reckless';

/**
 * Blood-Scent's magnitude, as the `traitMult` the master's next attack carries.
 * Authored: the palma row says "+20 %", and the row's own `effect` block stays
 * EMPTY (D-1's rule) because the condition — a beast wound — is not a block field.
 */
export const BLOOD_SCENT_DAMAGE_MULT = 1.2;

/** A fresh beast at the opening of the bout: prowling, unwounded, cadence zero. */
export function createBeastState(): BeastDuelState {
  return { wounds: 0, slots: 0, pose: 'prowl', netSkip: 0 };
}

/* ── THE FENCE ───────────────────────────────────────────────────────────── */

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The beast this opponent fields, or `null` when it fields none.
 *
 * THE FENCE, in full: `isBoss` ∧ `featureBout` ∧ the mechanic ∧ usable sub-data.
 * Each clause is required, so a synthetic regular opponent carrying a copied
 * mechanic string can never spawn a beast. A row with a malformed beast block is
 * refused too rather than producing a half-working one.
 */
export function beastConfigFor(
  opponent: OpponentConfig | null | undefined
): BeastConfig | null {
  if (!opponent) return null;
  if (opponent.isBoss !== true) return null;
  if (opponent.featureBout !== true) return null;
  if (opponent.bossMechanic !== 'beast_hunt') return null;

  const beast = opponent.beast;
  if (!beast || typeof beast.name !== 'string' || beast.name.trim().length === 0) return null;
  if (beast.hitProfile !== 'quick' && beast.hitProfile !== 'power') return null;
  if (!finite(beast.agility) || beast.agility < 0) return null;
  if (!finite(beast.strength) || beast.strength < 0) return null;
  if (!finite(beast.pounceDamage) || beast.pounceDamage <= 0) return null;
  if (!finite(beast.crouchEveryNthAction) || beast.crouchEveryNthAction < 1) return null;
  if (!finite(beast.maxWounds) || beast.maxWounds < 1) return null;
  if (!finite(beast.masterAloneAggressionBonus) || beast.masterAloneAggressionBonus < 0) return null;
  if (!finite(beast.flightHype) || beast.flightHype < 0) return null;
  return beast;
}

/** Is this opponent one that fields a beast? The one predicate every site asks. */
export function isBeastHuntBout(opponent: OpponentConfig | null | undefined): boolean {
  return beastConfigFor(opponent) !== null;
}

/* ── THE CADENCE ─────────────────────────────────────────────────────────── */

/**
 * One boss action slot has opened.
 *
 * The counter counts SLOTS, not attacks: a crouch is the boss's action for its
 * slot and so is the pounce, which is why the beast's cycle fits inside the
 * boss's own action economy without a second timer. A spent pounce returns to
 * prowling as the next slot opens, so the pose never lingers as a stale state.
 */
export function openBossSlot(state: BeastDuelState): BeastDuelState {
  const settled: BeastDuelState =
    state.pose === 'pounce-resolved' ? { ...state, pose: 'prowl' } : state;
  return { ...settled, slots: settled.slots + 1 };
}

/**
 * What the beast does with the slot that has just opened.
 *
 *   pounce — a live crouch was not interrupted: this slot is the spring.
 *   crouch — a cadence slot (every `crouchEveryNthAction`-th): the beast gathers
 *            itself and Marcellin does not attack this turn.
 *   skip   — a cadence slot while netted: the beast cannot gather itself, the
 *            skip is spent, and the master takes the slot himself.
 *   none   — an ordinary slot: Marcellin acts as he always does.
 */
export type BeastSlotPlan = 'pounce' | 'crouch' | 'skip' | 'none';

export function planBeastSlot(state: BeastDuelState, beast: BeastConfig): BeastSlotPlan {
  if (state.pose === 'fled') return 'none';
  if (state.pose === 'crouch') return 'pounce';
  const every = Math.max(1, Math.floor(beast.crouchEveryNthAction));
  if (state.slots % every !== 0) return 'none';
  return state.netSkip > 0 ? 'skip' : 'crouch';
}

/** The beast gathers itself: the crouch is live until the player's next action resolves. */
export function beastCrouches(state: BeastDuelState): BeastDuelState {
  return { ...state, pose: 'crouch' };
}

/** The crouch was not interrupted: the pounce takes the boss's next slot. */
export function beastPounces(state: BeastDuelState): BeastDuelState {
  return { ...state, pose: 'pounce-resolved' };
}

/** A netted cadence is spent: one fewer skip left, the beast still prowling. */
export function beastSkipsCadence(state: BeastDuelState): BeastDuelState {
  return { ...state, netSkip: Math.max(0, state.netSkip - 1) };
}

/**
 * The player's strike landed on the crouching beast: the pounce dies, one wound
 * is taken, and at `maxWounds` the beast flees the arena.
 */
export function beastWounded(state: BeastDuelState, beast: BeastConfig): BeastDuelState {
  const max = Math.max(1, Math.floor(beast.maxWounds));
  const wounds = Math.min(max, state.wounds + 1);
  return { ...state, wounds, pose: wounds >= max ? 'fled' : 'prowl' };
}

/**
 * The retiarius' net fell over the crouching beast. The pounce is cancelled (a
 * netted lion does not spring), and the beast loses the next two cadences — the
 * entangle's own two turns, borrowed from `statefulDoctrinae` so the two nets in
 * the game cannot disagree about their length.
 *
 * SECUTOR'S SNAG-PROOF PURSUIT DOES NOT APPLY HERE. That doctrina is a secutor's
 * helm — "the net finds no hold on a man trained against it" — and a lion is not
 * a secutor: the beast has no class at all. The duel therefore resolves this cast
 * with `resolveNetCast({})`, which has no class to refuse. This ruling is stated
 * here, and pinned by the D-2 suite.
 */
export function beastNetted(state: BeastDuelState): BeastDuelState {
  return { ...state, pose: 'prowl', netSkip: ENTANGLE_TURNS_ON_LAND };
}

/** The master falls while the beast still stands: it flees with the result. */
export function beastFleesWithMaster(state: BeastDuelState): BeastDuelState {
  return state.pose === 'fled' ? state : { ...state, pose: 'fled' };
}

/* ── THE MASTER ALONE ────────────────────────────────────────────────────── */

/**
 * Marcellin's aggression once the beast is gone: his own row value plus the
 * authored shift, clamped into the range `chooseAIStandardAction` documents
 * (0 … 1). A non-positive or unusable shift leaves the value exactly as it was,
 * so a duel without a flight is bit-identical to the standard boss.
 */
export function masterAloneAggression(base: number, bonus: number): number {
  const aggression = finite(base) ? base : 0.5;
  if (!finite(bonus) || bonus <= 0) return aggression;
  return Math.min(1, Math.max(0, aggression + bonus));
}

/* ── THE WORDS ───────────────────────────────────────────────────────────── */

const ordinal = (n: number): string => {
  const whole = Math.max(1, Math.floor(n));
  const suffix =
    whole % 100 >= 11 && whole % 100 <= 13
      ? 'th'
      : whole % 10 === 1
      ? 'st'
      : whole % 10 === 2
      ? 'nd'
      : whole % 10 === 3
      ? 'rd'
      : 'th';
  return `${whole}${suffix}`;
};

/**
 * The beast's published numbers, as the Tavern's rumour prints them. Built from
 * the row so no figure is ever restated in a component.
 */
export function beastIntelLine(beast: BeastConfig | null | undefined): string {
  if (!beast) return '';
  return (
    `${beast.name} — pounce: ${beast.hitProfile} hit profile (AGI ${beast.agility}, ` +
    `STR ${beast.strength}) · ${beast.pounceDamage} base damage · crouches every ` +
    `${ordinal(beast.crouchEveryNthAction)} boss action · ${beast.maxWounds} wounds drive it off`
  );
}

/**
 * The result screen's epilogue, computed from the duel's own beast state — no
 * save field, no profile write. `didWin` is the player's result.
 */
export function beastEpilogueLine(
  state: BeastDuelState | null | undefined,
  didWin: boolean,
  beastName: string,
  masterName: string
): string {
  if (!state) return '';
  const fled = state.pose === 'fled';
  if (didWin) {
    return fled
      ? `${beastName} was driven off before the end; ${masterName} fell alone.`
      : `${beastName} bolted for the gates the instant ${masterName} hit the sand.`;
  }
  return fled
    ? `${beastName} was long gone — ${masterName} finished what the beast could not.`
    : `${beastName} stood over ${masterName} and roared, and the crowd roared back.`;
}
