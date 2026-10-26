/**
 * ===========================================================================
 * D-4 — THE YOKED BROTHERS: the Cotta pair, the Crossing, and the Oath
 * ===========================================================================
 * Lucius & Gaius Cotta are ONE opponent row fought as two men. This module owns
 * WHAT the pair does and WHEN; `DuelScene` owns only the calls. That split is
 * what makes the mechanic testable without a browser, and it is what keeps the
 * mechanic's FENCE in one place:
 *
 *   a pair exists  ⇔  the opponent `isBoss` ∧ carries `featureBout` ∧ its
 *                     mechanic is `yoked_brothers` ∧ the row carries valid
 *                     `brothers` sub-data
 *
 * A regular opponent that somehow carries the mechanic string — or a copy of the
 * sub-data — fields NO pair at all: `yokedBrothersConfigFor` answers `null` and
 * every call site is a no-op, so it fights as one standard fighter. That is the
 * slice's acceptance core, pinned by the suite.
 *
 * ── WHAT THE PAIR IS NOT ────────────────────────────────────────────────────
 * There is no second HP pool, no second fighter state, no new damage formula and
 * no new combat stage. The pair is ONE row with ONE pool; the front brother's
 * "share" is the pool above the withdrawal line. Every strike — the front's
 * telegraphed heavy, the rear's flank strike — is dispatched through the duel's
 * EXISTING attack action with a brother's published weapon and profile
 * substituted for the fighter's, exactly as D-2 substitutes the beast's row. The
 * survivor's Oath is one more factor on the same `traitMult` every modifier
 * already rides.
 *
 * Everything here is pure — no React, no storage, no randomness, no clock.
 */
import type { OpponentConfig, WeaponItem, YokedBrotherProfile, YokedBrothersConfig } from '../types/game';
import { getWeaponByType } from '../data/itemsDB';

/** Which half of the pair. The front leads and takes the damage; the rear circles. */
export type BrothersRole = 'front' | 'rear';

/** Both brothers standing, or the survivor alone. */
export type BrothersPhase = 'pair' | 'survivor';

/**
 * The Crossing's own three beats: `idle` (nothing live), `announced` (the front
 * has telegraphed its heavy and the rear is circling) and `exposed` (the player
 * dodged it: the pair's next action is the recovery).
 */
export type CrossingState = 'idle' | 'announced' | 'exposed';

/** What a boss action slot turned out to be. */
export type BrothersSlotKind = 'act' | 'crossing' | 'crossing-resolution' | 'recovery';

/** Where a model stands, for the presentation layer only. */
export type BrothersStage = 'fighting' | 'station' | 'flank' | 'withdrawn';

/**
 * The pair's whole duel-session state. Transient by construction: it lives in a
 * `DuelScene` ref/state pair for one fight and is never written to a profile.
 */
export interface BrothersDuelState {
  /** Boss action slots taken this duel — the Crossing's cadence counter. */
  slots: number;
  /** The brother who takes the NEXT ordinary slot. */
  active: BrothersRole;
  /** The brother leading the slot in progress (the Crossing's leader is the front). */
  acting: BrothersRole;
  /** Both standing, or the survivor alone. */
  phase: BrothersPhase;
  /** Who remains in the survivor phase; `null` while both stand. */
  survivor: BrothersRole | null;
  /** The Crossing's beat. */
  crossing: CrossingState;
  /** The front brother has been withdrawn at the withdrawal line. */
  frontWithdrawn: boolean;
  /** The Exposed words have been announced once. */
  exposedAnnounced: boolean;
  /** The Oath words have been announced once. */
  oathAnnounced: boolean;
}

/** The Crossing's banner, shown for the whole of the player's one action. */
export const CROSSING_TELEGRAPH_WORDS = 'THE BROTHERS CROSS — HEAVY INCOMING';

/** The Exposed words — announced on the FIRST exposure only (the prompt's line). */
export const CROSSING_EXPOSED_WORDS = "They've overreached — the pair is exposed.";

/** The recovery slot's own line: no attack comes. */
export const CROSSING_RECOVERY_WORDS = 'The pair recovers its footing — no blade comes.';

/** The survivor's Oath, built from the survivor's own name (the prompt's words). */
export function oathWords(name: string): string {
  return `${name} swears the oath — one blade, all grief.`;
}

/** The withdrawal, built from the pair's own names. */
export function withdrawalWords(cfg: YokedBrothersConfig): string {
  return `Attendants drag ${cfg.front.name} from the sand — ${cfg.rear.name} stands alone.`;
}

/** A fresh pair at the opening of the bout: both standing, front leading, slots at zero. */
export function createBrothersState(): BrothersDuelState {
  return {
    slots: 0,
    active: 'front',
    acting: 'front',
    phase: 'pair',
    survivor: null,
    crossing: 'idle',
    frontWithdrawn: false,
    exposedAnnounced: false,
    oathAnnounced: false,
  };
}

/* ── THE FENCE ───────────────────────────────────────────────────────────── */

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A brother's published profile, or `null` when any clause is unusable. */
function validProfile(profile: unknown): profile is YokedBrotherProfile {
  if (!profile || typeof profile !== 'object') return false;
  const p = profile as Partial<YokedBrotherProfile>;
  if (typeof p.name !== 'string' || p.name.trim().length === 0) return false;
  if (typeof p.weaponType !== 'string') return false;
  if (!finite(p.aggression) || p.aggression < 0 || p.aggression > 1) return false;
  if (!finite(p.blockChance) || p.blockChance < 0 || p.blockChance > 1) return false;
  return true;
}

/**
 * The pair this opponent fields, or `null` when it fields none.
 *
 * THE FENCE, in full: `isBoss` ∧ `featureBout` ∧ the mechanic ∧ usable sub-data
 * (two named brothers, a positive cadence, an Oath that actually raises damage,
 * a withdrawal line strictly inside the pool). Each clause is required, so a
 * synthetic regular opponent carrying a copied mechanic string — or a row with a
 * malformed pair block — can never field a second man.
 */
export function yokedBrothersConfigFor(
  opponent: OpponentConfig | null | undefined
): YokedBrothersConfig | null {
  if (!opponent) return null;
  if (opponent.isBoss !== true) return null;
  if (opponent.featureBout !== true) return null;
  if (opponent.bossMechanic !== 'yoked_brothers') return null;

  const pair = opponent.brothers;
  if (!pair || typeof pair !== 'object') return null;
  if (!validProfile(pair.front) || !validProfile(pair.rear)) return null;
  if (!finite(pair.crossingEveryNthAction) || pair.crossingEveryNthAction < 1) return null;
  if (!finite(pair.survivorDamageMult) || pair.survivorDamageMult <= 1) return null;
  if (!finite(pair.survivorAggressionBonus) || pair.survivorAggressionBonus < 0) return null;
  if (
    !finite(pair.withdrawalAtHealthFraction) ||
    pair.withdrawalAtHealthFraction <= 0 ||
    pair.withdrawalAtHealthFraction >= 1
  ) {
    return null;
  }
  return pair;
}

/** Is this opponent one that fields the pair? The one predicate every site asks. */
export function isYokedBrothersBout(opponent: OpponentConfig | null | undefined): boolean {
  return yokedBrothersConfigFor(opponent) !== null;
}

/* ── THE TWO PROFILES ────────────────────────────────────────────────────── */

/** The other half of the pair. */
export function otherBrother(role: BrothersRole): BrothersRole {
  return role === 'front' ? 'rear' : 'front';
}

/** The acting brother's published profile. */
export function brotherProfile(cfg: YokedBrothersConfig, role: BrothersRole): YokedBrotherProfile {
  return role === 'front' ? cfg.front : cfg.rear;
}

/** The weapon that brother fights with, through the canonical registry. */
export function brotherWeapon(cfg: YokedBrothersConfig, role: BrothersRole): WeaponItem {
  return getWeaponByType(brotherProfile(cfg, role).weaponType);
}

/**
 * The aggression the AI chooses with on `role`'s slot: his published value, plus
 * the Oath's shift while he is the survivor. Data only — no other reader.
 */
export function brotherAggression(
  cfg: YokedBrothersConfig,
  state: BrothersDuelState | null | undefined,
  role: BrothersRole
): number {
  const base = brotherProfile(cfg, role).aggression;
  const sworn = state?.phase === 'survivor' && state.survivor === role;
  return Math.max(0, Math.min(1, base + (sworn ? cfg.survivorAggressionBonus : 0)));
}

/** The blockChance the AI chooses with on `role`'s slot (his published value). */
export function brotherBlockChance(cfg: YokedBrothersConfig, role: BrothersRole): number {
  return brotherProfile(cfg, role).blockChance;
}

/**
 * The survivor's Oath damage multiplier for a strike landed by the remaining
 * brother — folded into the same `traitMult` every other modifier rides.
 */
export function survivorDamageMult(
  cfg: YokedBrothersConfig,
  state: BrothersDuelState | null | undefined
): number {
  return state?.phase === 'survivor' ? cfg.survivorDamageMult : 1;
}

/* ── THE CADENCE ─────────────────────────────────────────────────────────── */

/**
 * Can the front brother lead a Crossing? A netted man cannot: the entangled
 * brother may not open the trap, so the cadence slot passes as an ordinary one.
 */
export function canLeadCrossing(frontEntangled: boolean): boolean {
  return !frontEntangled;
}

/** What the duel does about the slot that has just opened. */
export interface BrothersSlotContext {
  /** Is the front brother netted (CH-3b's entangle) on this slot? */
  frontEntangled: boolean;
  /** Is an announced crossing heavy still awaiting its resolution? */
  pendingHeavy: boolean;
  /** Is the pair in its own weapon's reach? The trap needs contact. */
  inRange: boolean;
}

export interface BrothersSlotPlan {
  /** The state after the slot opens (slots incremented, the Crossing marked). */
  state: BrothersDuelState;
  plan: BrothersSlotKind;
  /** The brother leading this slot (the Crossing is always led by the front). */
  actor: BrothersRole;
}

/**
 * One boss action slot opens.
 *
 * Reading order, and each clause is the design's own:
 *   • an announced Crossing whose heavy is still live → this slot IS its
 *     resolution, and the front leads it;
 *   • an Exposed pair → this slot is the recovery: no attack at all;
 *   • the cadence slot, both standing, in reach and the front not netted → the
 *     Crossing (the front telegraphs, the rear circles);
 *   • otherwise the brother whose turn it is acts with his own profile.
 *
 * The cadence counts BOSS SLOTS, so the Crossing consumes its telegraph slot and
 * its resolution slot; the next Crossing is due four slots after it starts.
 */
export function planBrothersSlot(
  state: BrothersDuelState,
  cfg: YokedBrothersConfig,
  ctx: BrothersSlotContext
): BrothersSlotPlan {
  const slots = state.slots + 1;
  if (state.crossing === 'announced' && ctx.pendingHeavy) {
    return { state: { ...state, slots, acting: 'front' }, plan: 'crossing-resolution', actor: 'front' };
  }
  if (state.crossing === 'exposed') {
    return {
      state: { ...state, slots, crossing: 'idle' },
      plan: 'recovery',
      actor: state.active,
    };
  }
  const every = Math.max(1, Math.floor(cfg.crossingEveryNthAction));
  const cadence = slots % every === 0;
  if (state.phase === 'pair' && cadence && ctx.inRange && canLeadCrossing(ctx.frontEntangled)) {
    return {
      state: { ...state, slots, crossing: 'announced', acting: 'front' },
      plan: 'crossing',
      actor: 'front',
    };
  }
  return { state: { ...state, slots, acting: state.active }, plan: 'act', actor: state.active };
}

/**
 * The slot resolved: the brother who did NOT lead it takes the next ordinary
 * one. The Crossing is led by the front, so it hands the next slot to the rear.
 */
export function completeBrothersSlot(
  state: BrothersDuelState,
  actor: BrothersRole
): BrothersDuelState {
  return { ...state, active: otherBrother(actor) };
}

/* ── THE CROSSING'S RESOLUTION ───────────────────────────────────────────── */

/**
 * What the player answered the front heavy with.
 *
 *   dodged — he was in the evasion stance when the heavy resolved. The dodge is
 *            the answer the trap is built to punish a block for, and it takes
 *            BOTH strikes: the flank finds only sand, and the pair overreaches.
 *   blocked — the shield stopped the front blade; the rear comes round it.
 *   open   — neither: the heavy was taken on the body or never reached him.
 */
export type CrossingAnswer = 'dodged' | 'blocked' | 'open';

export function crossingAnswerFor(input: {
  playerInDodge: boolean;
  frontBlocked: boolean;
}): CrossingAnswer {
  if (input.playerInDodge) return 'dodged';
  return input.frontBlocked ? 'blocked' : 'open';
}

export interface CrossingResolution {
  state: BrothersDuelState;
  /** `resolves` = dispatch the flank strike; `auto-miss` = it never comes. */
  flank: 'resolves' | 'auto-miss';
  /** True only on the FIRST exposure of the fight. */
  exposedNow: boolean;
  /** The one-shot HUD line, or `null` when it has already been said. */
  words: string | null;
}

/**
 * The Crossing, resolved at exchange end.
 *
 * A dodged heavy auto-misses the flank and leaves the pair EXPOSED (their next
 * action is the recovery, announced once). Anything else — a blocked blade or a
 * taken one — sends the rear's flank strike through the standard pipeline.
 */
export function resolveCrossingAnswer(
  state: BrothersDuelState,
  answer: CrossingAnswer
): CrossingResolution {
  if (answer === 'dodged') {
    const exposedNow = !state.exposedAnnounced;
    return {
      state: { ...state, crossing: 'exposed', exposedAnnounced: true },
      flank: 'auto-miss',
      exposedNow,
      words: exposedNow ? CROSSING_EXPOSED_WORDS : null,
    };
  }
  return { state: { ...state, crossing: 'idle' }, flank: 'resolves', exposedNow: false, words: null };
}

/* ── THE WITHDRAWAL AND THE OATH ─────────────────────────────────────────── */

/**
 * Has the pair's pool reached the withdrawal line? The front brother's share is
 * everything above `withdrawalAtHealthFraction` of the row's own maximum, so the
 * crossing is `health <= healthMax × fraction` — strictly once, in the pair phase.
 */
export function frontWithdrawalDue(
  state: BrothersDuelState,
  health: number,
  healthMax: number,
  cfg: YokedBrothersConfig
): boolean {
  if (state.phase !== 'pair' || state.frontWithdrawn) return false;
  if (!finite(health) || !finite(healthMax) || healthMax <= 0) return false;
  return health <= healthMax * cfg.withdrawalAtHealthFraction;
}

export interface WithdrawalResult {
  state: BrothersDuelState;
  /** The withdrawal's own line (once — the flag guards it). */
  words: string | null;
  /** The Oath, announced once (the prompt's exact words, from the survivor's name). */
  oathWords: string | null;
}

/**
 * The front brother is withdrawn and the survivor's Oath begins: the survivor
 * gains the Oath's damage and aggression, the Crossing never fires again, and
 * both announcements are one-shot.
 */
export function withdrawFront(
  state: BrothersDuelState,
  cfg: YokedBrothersConfig
): WithdrawalResult {
  if (state.phase === 'survivor') return { state, words: null, oathWords: null };
  const survivor: BrothersRole = 'rear';
  const next: BrothersDuelState = {
    ...state,
    phase: 'survivor',
    survivor,
    frontWithdrawn: true,
    crossing: 'idle',
    active: survivor,
    acting: survivor,
    oathAnnounced: true,
  };
  return {
    state: next,
    words: withdrawalWords(cfg),
    oathWords: oathWords(brotherProfile(cfg, survivor).name),
  };
}

/* ── THE PRESENTATION ────────────────────────────────────────────────────── */

/**
 * Where each model stands. The acting brother holds the fighting line, the other
 * takes the rear station; while the Crossing is announced the rear circles to the
 * flank; in the survivor phase the front is gone.
 */
export function brotherPresentation(state: BrothersDuelState): {
  front: BrothersStage;
  rear: BrothersStage;
} {
  if (state.phase === 'survivor' || state.frontWithdrawn) {
    return { front: 'withdrawn', rear: 'fighting' };
  }
  if (state.crossing === 'announced') return { front: 'fighting', rear: 'flank' };
  if (state.crossing === 'exposed') return { front: 'fighting', rear: 'station' };
  return state.acting === 'front'
    ? { front: 'fighting', rear: 'station' }
    : { front: 'station', rear: 'fighting' };
}

/**
 * Which side the rear brother circles to, in world X. The traverse is the tell,
 * and Lefty Mode mirrors it, so the cue exists in both hands.
 */
export function flankSide(isLeftyMode: boolean): 1 | -1 {
  return isLeftyMode ? -1 : 1;
}

/**
 * The pair's published numbers, built from the row for the tavern's deep card —
 * no figure is restated in a component.
 */
export function brothersIntelLine(cfg: YokedBrothersConfig | null | undefined): string {
  if (!cfg) return '';
  const line = (role: BrothersRole, label: string) => {
    const profile = brotherProfile(cfg, role);
    const weapon = brotherWeapon(cfg, role);
    return (
      `${profile.name} (${label}: ${weapon.name}) — aggression ${profile.aggression.toFixed(2)}, ` +
      `block ${profile.blockChance.toFixed(2)}`
    );
  };
  return (
    `${line('front', 'front')} · ${line('rear', 'rear')} · Crossing every ` +
    `${cfg.crossingEveryNthAction}th boss action · withdrawal at ` +
    `${Math.round(cfg.withdrawalAtHealthFraction * 100)}% HP · Oath +` +
    `${Math.round((cfg.survivorDamageMult - 1) * 100)}% damage, ` +
    `+${cfg.survivorAggressionBonus.toFixed(2)} aggression`
  );
}
