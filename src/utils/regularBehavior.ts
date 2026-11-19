/**
 * ===========================================================================
 * REGULARS-1 — Named regulars fight distinctly (phase-2 loop audit, beat 6).
 * Pure helpers only — no React, no storage — so `DuelScene` (the AI effect)
 * and the tests call the SAME function.
 *
 * The gap: every named regular ran the one shared AI in
 * `chooseAIStandardAction` — a single uniform draw split by two numbers
 * (aggression, blockChance). Per-opponent variation was numbers only, and
 * `personality` is a display word nothing in the duel reads. The honest
 * criterion for a behavior is that it must be a conditional rule the
 * (aggression, blockChance) pair cannot express — a choice that depends on
 * the fight's state, not a third number fed into the same draw.
 *
 * ── THE MECHANISM ──────────────────────────────────────────────────────────
 * One call site: `DuelScene` calls `applyRegularBehavior` once, in the AI
 * effect, after the tactical ladder resolves `chosenAction` and BEFORE the
 * telegraph overrides. That ordering is the guarantee: a behavior-chosen
 * power is announced exactly like a ladder-chosen power
 * (`shouldAnnounceRegularPower`), so no behavior can ever throw a silent
 * heavy. The hook returns a `CombatActionType` or `null` (null = keep the
 * ladder's choice).
 *
 * The hook may only return an action the fighter can afford — power needs
 * `stamina >= heavyCost`, quick needs `stamina >= lightCost` — and returns
 * null out of range (the out-of-range branch already decided advance/taunt)
 * and for any boss row. Behaviors apply in all bout modes: the mode steel
 * delta still composes the profile the ladder reads; the hook overrides the
 * *choice*, never the profile. `combatCalculations.ts` stays frozen — the
 * hook calls the frozen `chooseAIStandardAction` when it needs a re-roll,
 * it never re-implements the draw.
 *
 * State comes from three runtime-only refs in `DuelScene`, reset with the
 * other refs: `oppLastActionRef` ({ action, landed } — `landed` means the
 * blow connected cleanly: not missed, not evaded, not blocked),
 * `oppBlockedPlayerAttackRef` (read into the hook's input on the AI slot and
 * cleared there, so one block arms exactly one answer), and — REGULARS-2 —
 * `oppTookCleanHitRef` (the same shape: one clean hit arms exactly one brace).
 * ===========================================================================
 */

import type { CombatActionType } from '../components/ui/TurnActionPanel';
import type { RegularBehavior } from '../types/game';
import { chooseAIStandardAction } from './combatCalculations';

/** The opponent's last AI-slot action, as the duel records it. */
export interface OpponentLastAction {
  /** The action the slot dispatched — the action, not the outcome. */
  action: CombatActionType;
  /** True only when a blow connected cleanly: not missed, not evaded, not blocked. */
  landed: boolean;
}

export interface RegularBehaviorInput {
  /** The row's behavior. Absent means the ladder's choice stands. */
  behavior: RegularBehavior | undefined;
  /** The fence: a boss row carrying a behavior never fires it. */
  isBoss: boolean;
  /** Whether the player is in a block stance as the slot is chosen. */
  playerBlocking: boolean;
  /** Whether the player is entangled as the slot is chosen. */
  playerEntangled: boolean;
  /** False out of range — the advance/taunt branch already decided. */
  inRange: boolean;
  /** The opponent's Z, in arena metres, for the hit-and-run bound check. */
  oppPositionZ: number;
  /** The opponent's last AI-slot action, or null before his first slot. */
  lastAction: OpponentLastAction | null;
  /** True when he blocked a player attack since his last slot. */
  blockedPlayerAttack: boolean;
  /** The distance between the fighters, in arena metres, for the tip band. */
  distanceM: number;
  /** The slot weapon's reach, in arena metres, for the tip band. */
  reachM: number;
  /** True when the player's attack landed cleanly on him since his last slot. */
  tookCleanHit: boolean;
  /** The opponent's current stamina. */
  stamina: number;
  /** Stamina cost of a quick attack with the slot's weapon. */
  lightCost: number;
  /** Stamina cost of a power attack with the slot's weapon. */
  heavyCost: number;
  /** The live aggression the ladder would have chosen with (mode-composed). */
  aggression: number;
  /** The live blockChance the ladder would have chosen with (mode-composed). */
  blockChance: number;
  /** Injectable draw, the `chooseAIStandardAction` pattern. Defaults to Math.random. */
  rng?: number | (() => number);
}

/** One retreat step, in arena metres — the same 1.8 m the retreat branch moves. */
export const HIT_AND_RUN_RETREAT_M = 1.8;

/** The ring's rear bound: the retreat branch clamps Z at −7.5 m. */
export const HIT_AND_RUN_REAR_BOUND_M = -7.5;

/**
 * REGULARS-2 — Kallias's inner edge: the exact inner edge of Spearman's
 * Ground (`SPEARMANS_GROUND_BANDS`, `combatModifiers.ts`: inside half reach
 * pays ×0.90). The outer edge stays the doctrina's, not the hook's — the
 * hook never re-implements the damage table.
 */
export const TIP_INNER_RATIO = 0.5;

/** Marcus `eager` — player blocking: power 0.80 / taunt 0.10 / block 0.10. */
export const EAGER_TABLE = { powerCutoff: 0.8, tauntCutoff: 0.9 } as const;

/** Brutus `anvil_answers` — after blocking: power 0.65 / quick 0.20 / block 0.15. */
export const ANVIL_TABLE = { powerCutoff: 0.65, quickCutoff: 0.85 } as const;

/** Twins `twin_tempo` — after a quick action: power 0.80 / quick 0.10 / block 0.10. */
export const TWIN_AFTER_QUICK_TABLE = { powerCutoff: 0.8, quickCutoff: 0.9 } as const;

/** Twins `twin_tempo` — after a power action: quick 0.70 / power 0.15 / block 0.15. */
export const TWIN_AFTER_POWER_TABLE = { quickCutoff: 0.7, powerCutoff: 0.85 } as const;

function drawRng(rng: number | (() => number) | undefined): number {
  if (typeof rng === 'function') return rng();
  return rng ?? Math.random();
}

/** A two-cutoff roll: r < first → first action, r < second → second, else the fallback. */
function rollTwoCutoffs(
  r: number,
  first: CombatActionType,
  firstCutoff: number,
  second: CombatActionType,
  secondCutoff: number,
  fallback: CombatActionType,
): CombatActionType {
  if (r < firstCutoff) return first;
  if (r < secondCutoff) return second;
  return fallback;
}

/** The affordability guard: a power needs the heavy cost, a quick the light cost. */
function canAfford(
  action: CombatActionType,
  stamina: number,
  lightCost: number,
  heavyCost: number,
): boolean {
  if (action === 'power_attack') return stamina >= heavyCost;
  if (action === 'quick_attack') return stamina >= lightCost;
  return true;
}

/**
 * The one regular-behavior hook. Returns the action the behavior chooses, or
 * `null` to keep the ladder's choice. A choice the fighter cannot afford is
 * never downgraded — it returns `null` and the ladder's choice stands.
 */
export function applyRegularBehavior(input: RegularBehaviorInput): CombatActionType | null {
  const { behavior } = input;
  // Fence: no behavior, an unknown behavior, or a boss row carrying one —
  // the ladder's choice stands in every case.
  if (behavior === undefined || input.isBoss) return null;
  // Out of range the advance/taunt branch already decided; a behavior never fires there.
  if (!input.inRange) return null;

  switch (behavior) {
    case 'eager': {
      // Marcus smashes the shield: only while the player is blocking.
      if (!input.playerBlocking) return null;
      const chosen = rollTwoCutoffs(
        drawRng(input.rng),
        'power_attack',
        EAGER_TABLE.powerCutoff,
        'taunt',
        EAGER_TABLE.tauntCutoff,
        'shield_block',
      );
      return canAfford(chosen, input.stamina, input.lightCost, input.heavyCost) ? chosen : null;
    }
    case 'hit_and_run': {
      // Flaccus steps back — only after a quick attack LANDED, and only if
      // there is ring to retreat into: the step must land strictly inside
      // the rear bound, so a retreat at the bound (which would stand the
      // fighter still and waste the turn) never fires.
      const last = input.lastAction;
      if (last?.action !== 'quick_attack' || !last.landed) return null;
      if (input.oppPositionZ - HIT_AND_RUN_RETREAT_M <= HIT_AND_RUN_REAR_BOUND_M) return null;
      return 'retreat';
    }
    case 'anvil_answers': {
      // Brutus answers being struck: only after he blocked a player attack.
      if (!input.blockedPlayerAttack) return null;
      const chosen = rollTwoCutoffs(
        drawRng(input.rng),
        'power_attack',
        ANVIL_TABLE.powerCutoff,
        'quick_attack',
        ANVIL_TABLE.quickCutoff,
        'shield_block',
      );
      return canAfford(chosen, input.stamina, input.lightCost, input.heavyCost) ? chosen : null;
    }
    case 'fishers_press': {
      // Naija presses while the net holds: aggression forced to 1.00 through
      // the frozen chooser, so the 46:26 quick:power split stands and no
      // defensive action can ever come back. When the net is not holding the
      // ladder runs exactly as today.
      if (!input.playerEntangled) return null;
      const rerolled = chooseAIStandardAction(1.0, input.blockChance, input.rng ?? Math.random);
      return canAfford(rerolled, input.stamina, input.lightCost, input.heavyCost) ? rerolled : null;
    }
    case 'twin_tempo': {
      // The Twins alternate blades: the ACTION counts, not the outcome — the
      // second blade follows whether the first connected or not.
      const last = input.lastAction?.action;
      if (last === 'quick_attack') {
        const chosen = rollTwoCutoffs(
          drawRng(input.rng),
          'power_attack',
          TWIN_AFTER_QUICK_TABLE.powerCutoff,
          'quick_attack',
          TWIN_AFTER_QUICK_TABLE.quickCutoff,
          'shield_block',
        );
        return canAfford(chosen, input.stamina, input.lightCost, input.heavyCost) ? chosen : null;
      }
      if (last === 'power_attack') {
        const chosen = rollTwoCutoffs(
          drawRng(input.rng),
          'quick_attack',
          TWIN_AFTER_POWER_TABLE.quickCutoff,
          'power_attack',
          TWIN_AFTER_POWER_TABLE.powerCutoff,
          'shield_block',
        );
        return canAfford(chosen, input.stamina, input.lightCost, input.heavyCost) ? chosen : null;
      }
      return null;
    }
    case 'wall_closes': {
      // Cassius braces when bloodied: only after the player's attack
      // landed cleanly on him. Deterministic, no rng — the wall doesn't
      // gamble. A block costs nothing, so the stamina guard is trivially met.
      if (!input.tookCleanHit) return null;
      return 'shield_block';
    }
    case 'measured_guard': {
      // Drusus measures his breath: in the middle band — he can afford a
      // quick but not a power — he blocks instead of the ladder's tired
      // quick. Below lightCost the ladder's low-stamina branch owns the
      // band; at exactly heavyCost he can afford the power.
      if (input.stamina < input.lightCost || input.stamina >= input.heavyCost) return null;
      return 'shield_block';
    }
    case 'hold_the_tip': {
      // Kallias keeps you at the spear's tip: inside half his reach he
      // steps back — unless his last action was already a retreat, or
      // there is no ring to retreat into (same bound guard as Flaccus:
      // the step must land strictly inside the rear bound).
      if (input.distanceM / input.reachM >= TIP_INNER_RATIO) return null;
      if (input.lastAction?.action === 'retreat') return null;
      if (input.oppPositionZ - HIT_AND_RUN_RETREAT_M <= HIT_AND_RUN_REAR_BOUND_M) return null;
      return 'retreat';
    }
    default:
      return null;
  }
}
