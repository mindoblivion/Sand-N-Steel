/**
 * ===========================================================================
 * C-8.70C — Slice C-D: BOSS PHASES, as data
 * ===========================================================================
 * The five LADDER bosses each get two phases. A phase is a set of PARAMETERS the
 * mechanic the duel already runs reads — no phase introduces a second copy of its
 * boss's mechanic, and no phase rewrites a centred combat formula. Phase 1 is
 * TODAY's behaviour, value for value; Phase 2 intensifies the boss's SIGNATURE
 * mechanic and nothing else.
 *
 * ── THE PHASE LINE IS GIVEN (0.50), AND SO IS THE FLOOR (0.8 s) ────────────
 * `BOSS_PHASE_THRESHOLD` is the published 50 %, not an authored number, and the
 * telegraph floor is read from `data/boutModes.ts`'s `TELEGRAPH_FLOOR_SECONDS`
 * (exported by Slice C-C). This module defines NO second floor constant: every
 * telegraph hold it resolves goes through `modeTelegraphWindowMs` first and is
 * only ever raised back UP to that same floor, so a hold can never resolve below
 * 0.8 s in any boss, phase or mode. Steel/Invictus may sit ON the floor; Sand
 * keeps every shipped duration exactly.
 *
 * ── WHAT IS AUTHORED (flagged `authored: true` in the data itself) ─────────
 * The staged brief names no number for three things, so each is AUTHORED here
 * against its boss's own base row and flagged in the data, in the tests and in
 * the slice's report:
 *   • Ignis's Phase 2 profile row — his row's 0.85 / 0.45 moved by the published
 *     Steel delta's own step (0.05): 0.90 aggression / 0.40 blockChance.
 *   • Valéria's counter window — 2 of her own turns. Every telegraphed threat in
 *     this game spans exactly two slots (announce, then resolve), and her Phase 2
 *     counter gets that same two-slot span instead of Phase 1's single next turn.
 *   • Aurelius's lowered rage threshold — the charge his rage's damage multiplier
 *     needs for its published maximum, 1.00 → 0.50 (Slice C-B's 0→1 charge
 *     model's midpoint). His 50 % HP ignition is the GIVEN phase line and is
 *     untouched; what arrives sooner is the rage's full power.
 *
 * ── THE FENCE ──────────────────────────────────────────────────────────────
 * A phase ladder exists  ⇔  the row `isBoss` ∧ carries a LADDER mechanic ∧ its
 * `id` is that mechanic's registered boss id. Every helper here answers the
 * neutral Phase-1 value for anything else (`1`, `0`, `null`), so a regular row,
 * a grudge copy of a boss row and a FEATURE bout's inert mechanic all resolve to
 * "no phases" and the duel behaves exactly as it did before this slice.
 *
 * Everything here is pure — no React, no storage, no clock, no randomness — and
 * no phase state is ever saved: `FighterState.isPhase2` lives for one duel.
 */
import {
  TELEGRAPH_FLOOR_SECONDS,
  clampBoutProfileValue,
  modeTelegraphWindowMs,
  steelDeltaFor,
} from './boutModes';
import type { BoutMode, LadderBossMechanic, OpponentConfig } from '../types/game';

/** The given phase line: every ladder boss changes phase at or below 50 % HP. */
export const BOSS_PHASE_THRESHOLD = 0.5;

/* ── per-mechanic Phase-2 parameters ─────────────────────────────────────── */

/**
 * Goliath — `heavy_telegraph`. Phase 2 does not quicken the wind-up: it CHAINS a
 * second announced heavy after the first, at the same full hold.
 */
export interface HeavyTelegraphPhaseParams {
  /** P(announce a heavy) on an in-range AI slot with stamina for the follow-up. */
  telegraphChance: number;
  /**
   * Heavies this phase may announce back to back: 1 = today (announce → land →
   * the standard ladder), 2 = the chain (announce → land → announce → land).
   */
  chainHeavies: number;
}

/**
 * Ignis — `phase_weapon_switch`. The switch itself (weapon + Pyre Brand heal) is
 * unchanged; Phase 2 also moves the profile row he chooses with.
 */
export interface PhaseSwitchPhaseParams {
  /** The aggression row the AI chooses with while this phase is live. */
  aggression: number;
  /** The blockChance row the AI chooses with while this phase is live. */
  blockChance: number;
}

/**
 * Valéria — `counter_dodge`. Phase 2 keeps her counter armed across a WINDOW of
 * her own turns instead of the single next one, so sliding out of reach no
 * longer wastes it. Its damage source is still her existing quick attack.
 */
export interface CounterDodgePhaseParams {
  /**
   * Her turns an armed counter waits for the player to be back in her reach.
   * 0 = today (resolved on her very next turn, whatever the range).
   */
  counterWindowTurns: number;
}

/**
 * Aurelius — `rage_mode_colossus`. The 50 % HP ignition is the given phase line
 * and does not move; Phase 2 lowers the CHARGE at which his rage's damage
 * multiplier reaches its published maximum, so the rage arrives sooner while
 * Slice C-B's crowd feed keeps filling the same charge.
 */
export interface RagePhaseParams {
  /** Charge (0…1) at which the rage reaches `RAGE_DAMAGE_MULTIPLIER`. 1 = today. */
  rageChargeThreshold: number;
}

/**
 * TIER-8 — Scaevola — `second_rising`. Phase 2 IS the risen state: the profile
 * row he chooses with once he has risen. It is NOT read off HP — `bossPhaseAt`
 * returns phase 1 at health ≤ 0, and the rise fires on the fatal blow itself —
 * so the duel gates this profile on the risen ref (`bossSecondRisingProfileFor`),
 * never on the phase lookup. The numbers are the authored 0.05 steps (see the
 * ladder below); Phase 1 is the row's own published profile.
 */
export interface SecondRisingPhaseParams {
  /** The aggression row the AI chooses with once risen. */
  aggression: number;
  /** The blockChance row the AI chooses with once risen. */
  blockChance: number;
}

/* ── the ladder ──────────────────────────────────────────────────────────── */

export interface BossPhase<P> {
  phase: 1 | 2;
  /** HP fraction (of his own maximum) at or below which this phase is live. */
  atOrBelow: number;
  /** AUTHORED in this slice? Phase 1 reproduces today, so it never is. */
  authored: boolean;
  params: P;
}

export interface BossPhaseLadder<P, M extends LadderBossMechanic = LadderBossMechanic> {
  /** The ONE roster row this ladder belongs to — the fence's second half. */
  bossId: string;
  bossName: string;
  /** The ladder's own mechanic, as the literal — this is the union's discriminant. */
  mechanic: M;
  /**
   * The plain-language words the defeat screen's "why you fell" line needs for
   * the signature mechanic: the possessive the boss's own name requires, and the
   * mechanic's name as a player would say it.
   */
  whyYouFell: { owner: 'His' | 'Her'; mechanic: string };
  phases: readonly [BossPhase<P>, BossPhase<P>];
}

export type AnyBossPhaseLadder =
  | BossPhaseLadder<HeavyTelegraphPhaseParams, 'heavy_telegraph'>
  | BossPhaseLadder<PhaseSwitchPhaseParams, 'phase_weapon_switch'>
  | BossPhaseLadder<CounterDodgePhaseParams, 'counter_dodge'>
  | BossPhaseLadder<RagePhaseParams, 'rage_mode_colossus'>
  | BossPhaseLadder<SecondRisingPhaseParams, 'second_rising'>;

/**
 * THE FIVE LADDERS. Phase 1 of each reproduces today's shipped values exactly
 * (asserted in `utils/bossPhases.test.ts`); Phase 2 is the signature mechanic
 * intensified, with every authored number flagged.
 */
export const BOSS_PHASES: {
  readonly heavy_telegraph: BossPhaseLadder<HeavyTelegraphPhaseParams, 'heavy_telegraph'>;
  readonly phase_weapon_switch: BossPhaseLadder<PhaseSwitchPhaseParams, 'phase_weapon_switch'>;
  readonly counter_dodge: BossPhaseLadder<CounterDodgePhaseParams, 'counter_dodge'>;
  readonly rage_mode_colossus: BossPhaseLadder<RagePhaseParams, 'rage_mode_colossus'>;
  readonly second_rising: BossPhaseLadder<SecondRisingPhaseParams, 'second_rising'>;
} = {
  // GOLIATH THE PIT BEHEMOTH — the announced overhead smash.
  heavy_telegraph: {
    bossId: 'opp_goliath_boss',
    bossName: 'Goliath',
    mechanic: 'heavy_telegraph',
    whyYouFell: { owner: 'His', mechanic: 'overhead slam' },
    phases: [
      {
        phase: 1,
        atOrBelow: 1,
        authored: false,
        // Today, exactly: a 30 % announce rate, one heavy per announcement.
        params: { telegraphChance: 0.3, chainHeavies: 1 },
      },
      {
        phase: 2,
        atOrBelow: BOSS_PHASE_THRESHOLD,
        authored: false,
        // The DESIGN's own chain count (2); the chance is Phase 1's, unchanged.
        params: { telegraphChance: 0.3, chainHeavies: 2 },
      },
    ],
  },

  // IGNIS THE PYRE CHAMPION — blades to war mace at 50 %.
  phase_weapon_switch: {
    bossId: 'opp_ignis_boss',
    bossName: 'Ignis',
    mechanic: 'phase_weapon_switch',
    whyYouFell: { owner: 'His', mechanic: 'war-mace switch' },
    phases: [
      {
        phase: 1,
        atOrBelow: 1,
        authored: false,
        // The row's own published profile — what he has always chosen with.
        params: { aggression: 0.85, blockChance: 0.45 },
      },
      {
        phase: 2,
        atOrBelow: BOSS_PHASE_THRESHOLD,
        authored: true,
        // AUTHORED — anchor: the row's 0.85 / 0.45 moved by the published Steel
        // delta's own 0.05 step (0.90 / 0.40): one step forward, one step less
        // guarded, the weight of the mace in his hands.
        params: { aggression: 0.9, blockChance: 0.4 },
      },
    ],
  },

  // VALÉRIA THE VIPER QUEEN — the dodge that answers back.
  counter_dodge: {
    bossId: 'opp_valeria_boss',
    bossName: 'Valéria',
    mechanic: 'counter_dodge',
    whyYouFell: { owner: 'Her', mechanic: 'counter' },
    phases: [
      {
        phase: 1,
        atOrBelow: 1,
        authored: false,
        // Today, exactly: the armed counter resolves on her very next turn.
        params: { counterWindowTurns: 0 },
      },
      {
        phase: 2,
        atOrBelow: BOSS_PHASE_THRESHOLD,
        authored: true,
        // AUTHORED — anchor: the two-slot span every telegraphed threat in this
        // game already uses (announce, then resolve).
        params: { counterWindowTurns: 2 },
      },
    ],
  },

  // AURELIUS THE INVINCIBLE TITAN — the rage that arrives sooner.
  rage_mode_colossus: {
    bossId: 'opp_aurelius_boss',
    bossName: 'Aurelius',
    mechanic: 'rage_mode_colossus',
    whyYouFell: { owner: 'His', mechanic: 'rage' },
    phases: [
      {
        phase: 1,
        atOrBelow: 1,
        authored: false,
        // Today, exactly: the 1.25 multiplier is reached only at a full charge.
        params: { rageChargeThreshold: 1 },
      },
      {
        phase: 2,
        atOrBelow: BOSS_PHASE_THRESHOLD,
        authored: true,
        // AUTHORED — anchor: Slice C-B's 0→1 charge model's own midpoint, i.e.
        // his full rage power arrives at half the charge it took before.
        params: { rageChargeThreshold: 0.5 },
      },
    ],
  },

  // TIER-8 — SCAEVOLA THE TWICE-SLAIN — the man who does not stay down.
  // The row is a FEATURE bout (outside the ladder's advancement); the mechanic
  // is a LADDER mechanic (live, phased) — that split is deliberate, and the
  // fence below admits him because the mechanic is registered, not because
  // the row is a rung. Phase 1 is his published row; Phase 2 is the risen
  // state, and it is NEVER read off HP: the duel gates it on the risen ref.
  second_rising: {
    bossId: 'opp_scaevola_boss',
    bossName: 'Scaevola',
    mechanic: 'second_rising',
    whyYouFell: { owner: 'His', mechanic: 'second rising' },
    phases: [
      {
        phase: 1,
        atOrBelow: 1,
        authored: false,
        // The row's own published profile — what he has always chosen with.
        params: { aggression: 0.95, blockChance: 0.6 },
      },
      {
        phase: 2,
        atOrBelow: BOSS_PHASE_THRESHOLD,
        authored: true,
        // AUTHORED — anchor: the row's 0.95 / 0.60 moved by the published Steel
        // delta's own 0.05 step (1.00 / 0.55), the Ignis Phase-2 precedent:
        // risen, he abandons the guard — the fight gets faster, not tankier.
        // The rise lands him exactly on the phase line, so Phase 2 IS risen.
        params: { aggression: 1, blockChance: 0.55 },
      },
    ],
  },
};

/* ── the fence and the lookups ───────────────────────────────────────────── */

/**
 * The ladder this opponent's identity owns, or `null`. Boss-only AND row-specific:
 * a grudge copy of a boss keeps the mechanic string but not the id, and a FEATURE
 * boss's inert mechanic has no ladder at all.
 */
export function bossPhaseLadderFor(
  opponent: OpponentConfig | null | undefined,
): AnyBossPhaseLadder | null {
  if (!opponent || opponent.isBoss !== true) return null;
  const mechanic = opponent.bossMechanic;
  if (
    mechanic !== 'heavy_telegraph' &&
    mechanic !== 'phase_weapon_switch' &&
    mechanic !== 'counter_dodge' &&
    mechanic !== 'rage_mode_colossus' &&
    mechanic !== 'second_rising'
  ) {
    return null;
  }
  const ladder = BOSS_PHASES[mechanic];
  return ladder && ladder.bossId === opponent.id ? ladder : null;
}

const finite = (value: number): boolean => typeof value === 'number' && Number.isFinite(value);

/** Which phase is live at this HP. 1 for anything without a ladder. */
export function bossPhaseAt(
  opponent: OpponentConfig | null | undefined,
  health: number,
  healthMax: number,
): 1 | 2 {
  if (!bossPhaseLadderFor(opponent)) return 1;
  if (!finite(health) || !finite(healthMax) || healthMax <= 0) return 1;
  if (health <= 0) return 1;
  return health <= healthMax * BOSS_PHASE_THRESHOLD ? 2 : 1;
}

/** One phase's parameters, by its own `phase` number. */
export function phaseParams<P>(ladder: BossPhaseLadder<P>, phase: 1 | 2): P {
  const entry = ladder.phases.find((candidate) => candidate.phase === phase) ?? ladder.phases[0];
  return entry.params;
}

/**
 * Goliath's announce rate: Phase 1's 30 % in every phase. 0 without a ladder.
 *
 * STORY-4b — the gate is the MECHANIC, not the row id. A boss that carries
 * `heavy_telegraph` but owns no registered ladder is a SINGLE-PHASE fight (the
 * Deserter is the only such row), and a single-phase fight reads the mechanic's
 * Phase-1 rate in every phase — the same 0.30 Goliath announces at, since Phase 2
 * never quickens the wind-up. Nothing else about this helper moved: a row that is
 * not a boss, or a boss whose mechanic is another one, still answers 0.
 */
export function bossTelegraphChance(
  opponent: OpponentConfig | null | undefined,
  health: number,
  healthMax: number,
): number {
  const ladder = bossPhaseLadderFor(opponent);
  if (!ladder) {
    if (opponent?.isBoss === true && opponent.bossMechanic === 'heavy_telegraph') {
      return BOSS_PHASES.heavy_telegraph.phases[0].params.telegraphChance;
    }
    return 0;
  }
  if (ladder.mechanic !== 'heavy_telegraph') return 0;
  return phaseParams(ladder, bossPhaseAt(opponent, health, healthMax)).telegraphChance;
}

/** Heavies Goliath may chain. 1 (today) for anything without a ladder. */
export function bossChainHeavies(
  opponent: OpponentConfig | null | undefined,
  health: number,
  healthMax: number,
): number {
  const ladder = bossPhaseLadderFor(opponent);
  if (!ladder || ladder.mechanic !== 'heavy_telegraph') return 1;
  const count = phaseParams(ladder, bossPhaseAt(opponent, health, healthMax)).chainHeavies;
  return finite(count) && count > 0 ? Math.floor(count) : 1;
}

/** Valéria's counter window, in her own turns. 0 (today) without a ladder. */
export function bossCounterWindowTurns(
  opponent: OpponentConfig | null | undefined,
  health: number,
  healthMax: number,
): number {
  const ladder = bossPhaseLadderFor(opponent);
  if (!ladder || ladder.mechanic !== 'counter_dodge') return 0;
  const window = phaseParams(ladder, bossPhaseAt(opponent, health, healthMax)).counterWindowTurns;
  return finite(window) && window > 0 ? Math.floor(window) : 0;
}

/** The charge Aurelius's full rage power needs. 1 (today) without a ladder. */
export function bossRageChargeThreshold(
  opponent: OpponentConfig | null | undefined,
  health: number,
  healthMax: number,
): number {
  const ladder = bossPhaseLadderFor(opponent);
  if (!ladder || ladder.mechanic !== 'rage_mode_colossus') return 1;
  const threshold = phaseParams(ladder, bossPhaseAt(opponent, health, healthMax)).rageChargeThreshold;
  if (!finite(threshold) || threshold <= 0) return 1;
  return Math.min(1, threshold);
}

/**
 * Ignis's live profile row, composed with the bout mode's own Steel delta exactly
 * as the row itself is (`resolveBoutProfile`), or `null` in Phase 1 — where the
 * shipped `modeProfile` stands and nothing new is read.
 */
export function bossPhaseProfileFor(
  opponent: OpponentConfig | null | undefined,
  health: number,
  healthMax: number,
  mode: BoutMode,
): { aggression: number; blockChance: number } | null {
  const ladder = bossPhaseLadderFor(opponent);
  if (!ladder || ladder.mechanic !== 'phase_weapon_switch') return null;
  if (bossPhaseAt(opponent, health, healthMax) < 2) return null;
  const params = phaseParams(ladder, 2);
  const steel = steelDeltaFor(mode);
  return {
    aggression: clampBoutProfileValue(params.aggression + steel.aggression),
    blockChance: clampBoutProfileValue(params.blockChance + steel.blockChance),
  };
}

/**
 * TIER-8 — Scaevola's live profile row once risen, composed with the bout
 * mode's own Steel delta exactly as the row itself is — or `null` while he
 * has not risen, where the shipped `modeProfile` stands and nothing new is
 * read.
 *
 * The gate is the RISEN ref, never the phase lookup: `bossPhaseAt` reads
 * phase 1 at health ≤ 0 (the fatal blow's own moment) and phase 2 at any
 * health at or below the line — so before the rise, a Scaevola at 40 % HP
 * would wrongly choose with the risen row if this read HP. Only the rise
 * may flip this, and the rise sets the ref in the same dispatch as the HP.
 */
export function bossSecondRisingProfileFor(
  opponent: OpponentConfig | null | undefined,
  risen: boolean,
  mode: BoutMode,
): { aggression: number; blockChance: number } | null {
  const ladder = bossPhaseLadderFor(opponent);
  if (!ladder || ladder.mechanic !== 'second_rising' || !risen) return null;
  const params = phaseParams(ladder, 2);
  const steel = steelDeltaFor(mode);
  return {
    aggression: clampBoutProfileValue(params.aggression + steel.aggression),
    blockChance: clampBoutProfileValue(params.blockChance + steel.blockChance),
  };
}

/**
 * One boss telegraph hold in one mode, NEVER below the charter floor.
 *
 * `modeTelegraphWindowMs` is Slice C-C's own resolver (Steel/Invictus shorten a
 * longer hold TO the floor; Sand keeps it exactly); the `Math.max` here can only
 * raise a hold back onto `TELEGRAPH_FLOOR_SECONDS`, so no boss, phase or mode can
 * resolve a telegraph below it. No second floor constant is defined.
 */
export function bossTelegraphHoldMs(mode: BoutMode, shippedMs: number): number {
  if (!finite(shippedMs)) return TELEGRAPH_FLOOR_SECONDS * 1000;
  return Math.max(TELEGRAPH_FLOOR_SECONDS * 1000, modeTelegraphWindowMs(mode, shippedMs));
}

/**
 * The share of an accumulated charge that feeds the rage multiplier at this
 * phase's threshold: 1 (today) reads the charge as-is; 0.5 lets half a charge
 * deliver the published maximum. Clamped to 0…1, never a second formula.
 */
export function rageChargeAtThreshold(charge: number, threshold: number): number {
  const value = finite(charge) ? Math.max(0, Math.min(1, charge)) : 0;
  const line = finite(threshold) && threshold > 0 ? Math.min(1, threshold) : 1;
  return Math.min(1, value / line);
}
