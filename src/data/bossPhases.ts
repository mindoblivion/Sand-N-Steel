/**
 * ===========================================================================
 * SAND & STEEL — BOSS PHASES (Phase C-8.70C, Slice C-D)
 * ===========================================================================
 * One table of boss phase parameters, keyed by `bossMechanic`, and the pure
 * selectors the duel engine reads it through.
 *
 * THE RULE THIS FILE EXISTS FOR: a boss's PHASE 1 must reproduce exactly what
 * the four mechanics did before this slice — no boss gets harder by data entry
 * alone. PHASE 2 intensifies the boss's own SIGNATURE mechanic and nothing
 * else. `phaseC8_70c.test.ts` pins Phase 1 against the shipped behaviour
 * (Goliath's 0.30 telegraph rate, Ignis's base row, Valéria's single counter,
 * Aurelius's 50 % rage threshold).
 *
 * AUTHORED VALUES — every one carries an `AUTHORED` comment. The staged prompt
 * names no number for Ignis's Phase 2 row, Valéria's counter window or
 * Aurelius's lowered rage threshold, so those three are authored here, anchored
 * to each boss's own base row, and flagged as authored. They are NOT design
 * values: they are the in-slice placeholders a designer must tune. Everything
 * else is published behaviour or the prompt's own numbers (50 % phase
 * threshold, 0.8 s telegraph floor).
 *
 * TELEGRAPH FLOOR — READ BEFORE ADDING A CONSTANT. Slice C-C is not in this
 * repository's history: a repo-wide search for a telegraph-floor constant
 * (`telegraphFloor`, `TELEGRAPH_FLOOR`, any 0.8 s telegraph value) finds
 * nothing, and no Slice C-C file exists on this branch. So the floor is defined
 * ONCE, here (`TELEGRAPH_FLOOR_SECONDS`), and every boss phase and every point
 * of use reads this export — never a second literal 0.8. When C-C lands, this
 * constant must be replaced by (or re-exported from) C-C's own definition
 * rather than duplicated beside it.
 *
 * BOSS-ONLY: `bossPhaseParams` returns null unless `isBoss === true`, so a
 * non-boss opponent can never select a phase and no phase parameter can leak to
 * the roster's regular fighters.
 */
import { BossMechanic, OpponentConfig, WeaponType } from '../types/game';

// ── Telegraph floor ─────────────────────────────────────────────────────────

/**
 * The shortest wind-up any boss telegraph may resolve at, in seconds.
 *
 * Every telegraph parameter this file returns has already been through
 * `clampTelegraphSeconds`, and `DuelScene` uses the returned value as the
 * minimum settling delay before a telegraphed blow lands. A telegraph may be
 * set TO the floor, never below it.
 */
export const TELEGRAPH_FLOOR_SECONDS = 0.8;

/**
 * Clamp a configured telegraph duration to the floor. Non-finite, negative or
 * zero values resolve to the floor itself, so a malformed row is short rather
 * than instant.
 */
export function clampTelegraphSeconds(configured: number): number {
  if (!Number.isFinite(configured)) return TELEGRAPH_FLOOR_SECONDS;
  return Math.max(TELEGRAPH_FLOOR_SECONDS, configured);
}

// ── Phase thresholds ────────────────────────────────────────────────────────

/** A boss enters Phase 2 at or below this fraction of its maximum HP (50 %). */
export const BOSS_PHASE_HP_THRESHOLD = 0.5;

export type BossPhase = 1 | 2;

/** The phase every boss starts in. */
export const BOSS_FIRST_PHASE: BossPhase = 1;

/** The phase a boss enters when its HP crosses the threshold. */
export const BOSS_FINAL_PHASE: BossPhase = 2;

// ── Phase 1 values (published behaviour — do not retune here) ───────────────

/**
 * Goliath's shipped `heavy_telegraph` announce rate: `DuelScene` has always
 * rolled 0.30 for a wind-up when the boss is in range with stamina for the
 * follow-up power attack.
 */
export const GOLIATH_PHASE1_TELEGRAPH_CHANCE = 0.3;

/**
 * Goliath's declared heavy wind-up, in seconds. Today's engine announces the
 * blow on one AI turn and lands it on the next, so the warning always stands
 * for at least a whole player turn; the floor is what the resolving strike's
 * delay is held to (see `DuelScene`'s `AI_ACTION_DELAY_MS`). Phase 2's chained
 * second heavy uses this same value — "both at full telegraph duration".
 */
export const GOLIATH_HEAVY_TELEGRAPH_SECONDS = TELEGRAPH_FLOOR_SECONDS;

/**
 * Valéria's Phase 1 counter window: one answering counter per dodge, resolved
 * on her next turn — exactly what the single-shot `pendingCounter` ref did.
 */
export const VALERIA_PHASE1_COUNTER_WINDOW_TURNS = 1;

/** Aurelius's shipped rage threshold (`shouldActivateRage` has always used 50 %). */
export const AURELIUS_PHASE1_RAGE_THRESHOLD = 0.5;

// ── Phase 2 values ──────────────────────────────────────────────────────────

/**
 * AUTHORED — Ignis's Phase 2 row is his base row shifted, because the prompt
 * publishes no numbers for it. Base row (published): aggression 0.85,
 * blockChance 0.45. The authored row is aggression +0.10 (0.95) and
 * blockChance -0.15 (0.30): he presses harder and guards less once the mace is
 * drawn. Anchored to the base row so a roster change carries through. NOT a
 * design value — tune it as one.
 */
export const IGNIS_PHASE2_AGGRESSION_DELTA = 0.1;

/** AUTHORED — see `IGNIS_PHASE2_AGGRESSION_DELTA`. */
export const IGNIS_PHASE2_BLOCK_CHANCE_DELTA = -0.15;

/**
 * AUTHORED — Valéria's Phase 2 counter window: after a dodge her counter stays
 * armed for two of her turns instead of one, so one evasion can answer twice.
 * Base (published) window is 1. NOT a design value — tune it as one.
 */
export const VALERIA_PHASE2_COUNTER_WINDOW_TURNS = 2;

/**
 * AUTHORED — Aurelius's Phase 2 rage threshold: rage arrives at 75 % HP instead
 * of 50 %, i.e. sooner (the feed C-B's crowd hype already gives him continues,
 * nothing new is bolted on). Base (published) threshold is 0.5. NOT a design
 * value — tune it as one.
 */
export const AURELIUS_PHASE2_RAGE_THRESHOLD = 0.75;

// ── Phase parameters ────────────────────────────────────────────────────────

/**
 * One phase's resolved parameter set. Only the fields the boss's own mechanic
 * reads are present; every other field is absent rather than zero, so a
 * consumer cannot accidentally read another mechanic's value.
 * `telegraphSeconds` is always present and always floored.
 */
export interface BossPhaseParams {
  phase: BossPhase;
  mechanic: BossMechanic;
  /** Floored wind-up for this phase's telegraph (>= `TELEGRAPH_FLOOR_SECONDS`). */
  telegraphSeconds: number;

  // heavy_telegraph (Goliath)
  /** Probability that an in-range AI turn becomes a wind-up instead of a strike. */
  heavyTelegraphChance?: number;
  /** Phase 2: a second telegraphed heavy follows the first at full duration. */
  heavyChain?: boolean;

  // phase_weapon_switch (Ignis)
  weaponType?: WeaponType;
  aggression?: number;
  blockChance?: number;

  // counter_dodge (Valéria)
  /** Passive evade chance against the player's strikes (her configured dodgeChance). */
  passiveDodgeChance?: number;
  /** How many of her turns a queued counter stays armed. */
  counterWindowTurns?: number;

  // rage_mode_colossus (Aurelius)
  /** HP fraction at or below which rage activates. */
  rageThreshold?: number;
}

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Which phase a boss's HP puts it in. Pure. A non-boss, a boss with no mechanic,
 * or unusable HP values resolve to Phase 1 — the phase that changes nothing.
 */
export function bossPhaseForHealth(
  opponent: Pick<OpponentConfig, 'isBoss' | 'bossMechanic'>,
  currentHealth: number,
  healthMax: number,
): BossPhase {
  if (opponent.isBoss !== true || !opponent.bossMechanic) return BOSS_FIRST_PHASE;
  if (!Number.isFinite(currentHealth) || !Number.isFinite(healthMax) || healthMax <= 0) {
    return BOSS_FIRST_PHASE;
  }
  if (currentHealth <= 0) return BOSS_FIRST_PHASE;
  return currentHealth <= healthMax * BOSS_PHASE_HP_THRESHOLD ? BOSS_FINAL_PHASE : BOSS_FIRST_PHASE;
}

/**
 * The phase transition gate inputs. A boss may only ADVANCE into Phase 2 when no
 * action is executing and no telegraphed action is in flight, so a phase change
 * never interrupts a wind-up already announced: the current action finishes,
 * then the phase turns.
 */
export interface BossPhaseTransitionGate {
  /** The duel is mid-resolution (an animation is playing out). */
  isExecuting: boolean;
  /** A telegraphed action has been announced and has not landed yet. */
  telegraphInFlight: boolean;
}

/**
 * Resolve the phase a boss should hold this frame. Pure, and the single place
 * the transition rule lives — `DuelScene` calls it and commits whatever it
 * returns. It never moves backwards.
 */
export function nextBossPhase(
  current: BossPhase,
  opponent: Pick<OpponentConfig, 'isBoss' | 'bossMechanic'>,
  currentHealth: number,
  healthMax: number,
  gate: BossPhaseTransitionGate,
): BossPhase {
  const target = bossPhaseForHealth(opponent, currentHealth, healthMax);
  if (target <= current) return current;
  if (gate.isExecuting || gate.telegraphInFlight) return current;
  return target;
}

/**
 * The parameters of one boss's phase, or `null` for anything that is not a boss
 * with a mechanic — the boss-only gate every caller relies on.
 */
export function bossPhaseParams(
  opponent: Pick<
    OpponentConfig,
    | 'isBoss'
    | 'bossMechanic'
    | 'weaponType'
    | 'phase2WeaponType'
    | 'aggression'
    | 'blockChance'
    | 'dodgeChance'
  >,
  phase: BossPhase,
): BossPhaseParams | null {
  if (opponent.isBoss !== true || !opponent.bossMechanic) return null;

  const mechanic = opponent.bossMechanic;
  const telegraphSeconds = clampTelegraphSeconds(GOLIATH_HEAVY_TELEGRAPH_SECONDS);
  const isFinal = phase === BOSS_FINAL_PHASE;

  switch (mechanic) {
    case 'heavy_telegraph':
      return {
        phase,
        mechanic,
        telegraphSeconds,
        heavyTelegraphChance: GOLIATH_PHASE1_TELEGRAPH_CHANCE,
        // Phase 2's only change: the heavy chains. Rate and duration are the
        // Phase 1 values, so no new number enters the fight.
        heavyChain: isFinal,
      };

    case 'phase_weapon_switch':
      return {
        phase,
        mechanic,
        telegraphSeconds,
        // Phase 1 is the boss's own base row (published). Phase 2 is the
        // AUTHORED row derived from it (see the delta constants' comments).
        weaponType: isFinal ? opponent.phase2WeaponType ?? opponent.weaponType : opponent.weaponType,
        aggression: isFinal
          ? clampUnit(opponent.aggression + IGNIS_PHASE2_AGGRESSION_DELTA)
          : clampUnit(opponent.aggression),
        blockChance: isFinal
          ? clampUnit(opponent.blockChance + IGNIS_PHASE2_BLOCK_CHANCE_DELTA)
          : clampUnit(opponent.blockChance),
      };

    case 'counter_dodge':
      return {
        phase,
        mechanic,
        telegraphSeconds,
        passiveDodgeChance: clampUnit(opponent.dodgeChance),
        counterWindowTurns: isFinal
          ? VALERIA_PHASE2_COUNTER_WINDOW_TURNS
          : VALERIA_PHASE1_COUNTER_WINDOW_TURNS,
      };

    case 'rage_mode_colossus':
      return {
        phase,
        mechanic,
        telegraphSeconds,
        rageThreshold: isFinal ? AURELIUS_PHASE2_RAGE_THRESHOLD : AURELIUS_PHASE1_RAGE_THRESHOLD,
      };
  }
}

// ── Presentation labels ─────────────────────────────────────────────────────

/**
 * Plain-language names for each mechanic, used by the phase banner and by the
 * result screen's "why you fell" breakdown. One definition, so the two surfaces
 * cannot disagree.
 */
export const BOSS_MECHANIC_LABELS: Record<BossMechanic, string> = {
  heavy_telegraph: 'heavy slam',
  phase_weapon_switch: 'weapon switch',
  counter_dodge: 'counter',
  rage_mode_colossus: 'rage',
};

/** The in-world phase banner's one-line announcement. */
export function bossPhaseBanner(bossName: string, mechanic: BossMechanic): string {
  return `${bossName} — PHASE II · ${BOSS_MECHANIC_LABELS[mechanic].toUpperCase()}`;
}
