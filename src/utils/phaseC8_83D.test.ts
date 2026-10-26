/**
 * Dodge stance lifetime - C-8.83D.
 *
 * C-8.83B established that `DODGE_STAMINA_COST` buys the dodge STANCE, not the tap:
 * a stance already held is a free REAFFIRM for the strike it was set for. The
 * C-8.83C audit argued that a free reaffirm can never be carried to a LATER strike
 * because the stance is consumed by the player's next accepted action (the pre-clear
 * at the top of `executeCombatTurn`). That argument rested on reading the source.
 * This suite PINS it, so a future change that lets the stance outlive the action -
 * or that lets a reaction click land after the window closed - fails here.
 *
 * The sequence it drives, end to end, on a hand-advanced clock:
 *
 *   §A  one stance, one charge - activate on the turn (12 SP, one dodge), then
 *       reaffirm it for the same announced strike (0 SP, still one dodge)
 *   §B  the lifetime - the impact lands once and leaves no window, the player's
 *       next accepted action (a NON-dodge one) consumes the stance, and the next
 *       strike is therefore a fresh 12 SP activation counting a second dodge
 *   §C  stale clicks - a reaction after the impact or after a cancellation spends
 *       no stamina and counts no dodge
 *   §D  nothing else moved - cost, evade chance, wind-up, one claim, one impact
 *
 * How faithful is the driver? The stance, the charge and the counter are the real
 * pure helpers (`applyDefensiveAction`, `clearDefensiveStance`,
 * `resolveTurnEndDefensive`, `planDodgeReaction`) and the window is the real
 * `createPendingStrike` on a controlled timer, so the ordering under test is the
 * shipped ordering. The React writes between them cannot be mounted here (this repo
 * has no DOM renderer for `DuelScene`), so the driver's writes are bound to the
 * shipped handler by the ordered source assertions in §B and §C: a driver step whose
 * shipped counterpart moves out of that order fails the suite.
 *
 * Limitation, stated rather than papered over: this is NOT live-duel acceptance. No
 * 3D scene is mounted, no wall-clock timing is exercised, and no Android device was
 * involved. It proves the stance/charge lifecycle, not the feel of the reaction.
 *
 * Run with: bun test src/utils/phaseC8_83D.test.ts
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DODGE_EVADE_CHANCE,
  DODGE_EVADE_PERCENT,
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
  applyDefensiveAction,
  clearDefensiveStance,
  planDodgeReaction,
  resolveTurnEndDefensive,
} from './combatCalculations';
import type { DefensiveAction, DefensiveStance } from './combatCalculations';
import { createPendingStrike } from './pendingStrike';
import type {
  EnemyStrikeAction,
  PendingReaction,
  PendingStrike,
  StrikeTimer,
} from './pendingStrike';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);

/** Index of a marker that must exist, reported by name when it does not. */
function at(marker: string): number {
  const index = duelSource.indexOf(marker);
  expect({ marker, found: index >= 0 }).toEqual({ marker, found: true });
  return index;
}

/** The slice between two markers, both required. */
function between(start: string, end: string): string {
  const from = at(start);
  const to = at(end);
  expect(to).toBeGreaterThan(from);
  return duelSource.slice(from, to);
}

/** The reaction handler's own body. */
const reactionBody = between(
  'const reactToPendingAttack = useCallback(',
  '// No blow may outlive the scene',
);

/** `executeCombatTurn`, from the resolution guard up to the movement branches. */
const turnPreClear = between('resolvingRef.current = true;', "if (actionType === 'advance') {");

// ── the clock ──────────────────────────────────────────────────────────────

/** A timer the test advances by hand: no sleeps, nothing timing-sensitive. */
function handClock() {
  let now = 0;
  let nextId = 1;
  const jobs = new Map<number, { at: number; run: () => void }>();

  const timer: StrikeTimer = {
    set(callback, ms) {
      const id = nextId++;
      jobs.set(id, { at: now + ms, run: callback });
      return id;
    },
    clear(handle) {
      jobs.delete(handle);
    },
  };

  return {
    timer,
    /** Advance the clock, running anything that falls due. */
    advance(ms: number) {
      now += ms;
      for (const [id, job] of [...jobs]) {
        if (job.at <= now) {
          jobs.delete(id);
          job.run();
        }
      }
    },
    get live() {
      return jobs.size;
    },
  };
}

// ── the duel stand-in ──────────────────────────────────────────────────────

/**
 * The three pieces of duel state this invariant lives in. Every write below is one
 * shipped write, in the shipped order; §B/§C assert that order against the source.
 */
interface Duel {
  stance: DefensiveStance;
  stamina: number;
  dodgesPerformed: number;
}

const OPEN: DefensiveStance = { isBlocking: false, isInvulnerable: false };

function freshDuel(stamina = 100): Duel {
  return { stance: { ...OPEN }, stamina, dodgesPerformed: 0 };
}

/** The player's own turn, taking Dodge (`} else if (actionType === 'dodge') {`). */
function playerTurnDodge(duel: Duel): void {
  duel.stance = applyDefensiveAction(clearDefensiveStance(duel.stance), 'dodge');
  duel.stamina = Math.max(0, duel.stamina - DODGE_STAMINA_COST);
  duel.dodgesPerformed += 1;
}

/** The player's next accepted action, through the pre-clear that opens the turn. */
function playerActs(duel: Duel, action: DefensiveAction = 'other'): void {
  duel.stance = applyDefensiveAction(clearDefensiveStance(duel.stance), action);
}

/** The turn-end cleanup: both flags survive into the opponent's turn. */
function endTurn(duel: Duel): void {
  duel.stance = resolveTurnEndDefensive(duel.stance);
}

type ReactionOutcome = 'claimed' | 'refused' | 'stale';

/**
 * One reaction click, in the shipped order: plan -> refusal guard -> claim guard ->
 * then (and only then) the stance write, the debit and the counter.
 */
function reactToStrike(
  duel: Duel,
  strike: PendingStrike,
  action: PendingReaction,
): ReactionOutcome {
  const plan = action === 'dodge' ? planDodgeReaction(duel.stance, duel.stamina) : null;
  if (plan !== null && plan.kind === 'refused') return 'refused';
  if (!strike.claimReaction()) return 'stale';

  if (plan !== null) {
    duel.stance = applyDefensiveAction(clearDefensiveStance(duel.stance), 'dodge');
    duel.stamina = Math.max(0, duel.stamina - plan.staminaCost);
    if (plan.countsDodge) duel.dodgesPerformed += 1;
  } else {
    duel.stance = applyDefensiveAction(clearDefensiveStance(duel.stance), 'shield_block');
  }
  return 'claimed';
}

/** Announce a strike and count its impacts. */
function announce(strike: PendingStrike, action: EnemyStrikeAction = 'quick_attack') {
  const impacts: EnemyStrikeAction[] = [];
  const accepted = strike.announce(action, (landing) => impacts.push(landing));
  return { accepted, impacts };
}

// ── §A. One stance, one charge ─────────────────────────────────────────────

describe('§A - a stance is paid for once, however many times it is set', () => {
  test("Dodge on the player's own turn activates: 12 SP and one dodge", () => {
    const duel = freshDuel(100);
    playerTurnDodge(duel);
    expect(duel.stance).toEqual({ isBlocking: false, isInvulnerable: true });
    expect(duel.stamina).toBe(100 - DODGE_STAMINA_COST);
    expect(duel.stamina).toBe(88);
    expect(duel.dodgesPerformed).toBe(1);
  });

  test('reaffirming that stance for the SAME announced strike spends nothing', () => {
    const duel = freshDuel(100);
    const clock = handClock();
    const strike = createPendingStrike({ timer: clock.timer });

    playerTurnDodge(duel);
    endTurn(duel);
    // The stance survives the turn boundary, so the announcement meets it.
    expect(duel.stance.isInvulnerable).toBe(true);

    const { accepted, impacts } = announce(strike);
    expect(accepted).toBe(true);

    expect(reactToStrike(duel, strike, 'dodge')).toBe('claimed');
    expect(duel.stamina).toBe(88); // no second debit
    expect(duel.dodgesPerformed).toBe(1); // no second count
    expect(duel.stance.isInvulnerable).toBe(true); // still standing for the blow
    // The window is spent: a second click in the same window changes nothing.
    expect(reactToStrike(duel, strike, 'dodge')).toBe('stale');
    expect(duel.stamina).toBe(88);
    expect(duel.dodgesPerformed).toBe(1);
    expect(impacts).toHaveLength(0);
  });
});

// ── §B. The lifetime ───────────────────────────────────────────────────────

describe('§B - the stance is consumed by the next action, so the next strike pays', () => {
  test('the impact lands exactly once, at the end of the wind-up', () => {
    const duel = freshDuel(100);
    const clock = handClock();
    const strike = createPendingStrike({ timer: clock.timer });

    playerTurnDodge(duel);
    endTurn(duel);
    const { impacts } = announce(strike, 'power_attack');
    expect(reactToStrike(duel, strike, 'dodge')).toBe('claimed');

    clock.advance(ENEMY_ATTACK_WINDUP_MS - 1);
    expect(impacts).toHaveLength(0);
    clock.advance(1);
    expect(impacts).toEqual(['power_attack']);

    // The window is closed after the impact: nothing is pending, so no claim is
    // possible. `hasReacted` still records the claim made DURING the window - it is
    // reset by the next announcement, not by the impact - which is exactly why the
    // guard that closes the window is `pending` being null, not the claim flag.
    expect(strike.pending).toBeNull();
    expect(strike.claimReaction()).toBe(false);
    expect(clock.live).toBe(0);
    // The impact is the OPPONENT's turn, so the player's stance is still held here:
    // only the player's own next action consumes it.
    expect(duel.stance.isInvulnerable).toBe(true);
  });

  test("the player's next accepted action - a NON-dodge one - clears the old stance", () => {
    const duel = freshDuel(100);
    const clock = handClock();
    const strike = createPendingStrike({ timer: clock.timer });

    playerTurnDodge(duel);
    endTurn(duel);
    announce(strike);
    reactToStrike(duel, strike, 'dodge');
    clock.advance(ENEMY_ATTACK_WINDUP_MS);

    // Advance, an attack, a taunt - none of them is a defensive action, and every
    // one of them consumes the stance through the turn's pre-clear.
    playerActs(duel, 'other');
    expect(duel.stance).toEqual(OPEN);

    // The shipped pre-clear is where that happens, and it runs before the first
    // action branch of the turn - not inside the dodge branch.
    expect(turnPreClear).toContain('prev.isInvulnerable || prev.isBlocking');
    expect(turnPreClear).toContain('{ ...prev, isInvulnerable: false, isBlocking: false }');
    expect(at('prev.isInvulnerable || prev.isBlocking')).toBeLessThan(
      at("if (actionType === 'advance') {"),
    );
  });

  test('a genuinely new strike therefore demands a fresh 12 SP activation', () => {
    const duel = freshDuel(100);
    const clock = handClock();
    const strike = createPendingStrike({ timer: clock.timer });

    // Strike 1: a stance set on the turn, reaffirmed for free.
    playerTurnDodge(duel);
    endTurn(duel);
    announce(strike);
    expect(reactToStrike(duel, strike, 'dodge')).toBe('claimed');
    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    playerActs(duel); // the player acts, consuming the stance

    // The new window asks for a NEW stance.
    expect(planDodgeReaction(duel.stance, duel.stamina)).toEqual({
      kind: 'activate',
      staminaCost: DODGE_STAMINA_COST,
      countsDodge: true,
    });

    // Strike 2: a genuinely new announcement, and the reaction pays again.
    const second = announce(strike, 'quick_attack');
    expect(second.accepted).toBe(true);
    expect(reactToStrike(duel, strike, 'dodge')).toBe('claimed');
    expect(duel.stamina).toBe(100 - DODGE_STAMINA_COST * 2);
    expect(duel.stamina).toBe(76);
    expect(duel.dodgesPerformed).toBe(2);
    expect(duel.stance.isInvulnerable).toBe(true);
  });

  test('negative control: without the pre-clear the new strike would still be free', () => {
    // The counterfactual, so the assertion above is not vacuous: a stance that
    // outlived the action WOULD re-arm for free. That is exactly what must not
    // happen, and the pre-clear is the only thing preventing it.
    const held: DefensiveStance = { isBlocking: false, isInvulnerable: true };
    expect(planDodgeReaction(held, 88).kind).toBe('reaffirm');
    expect(planDodgeReaction(held, 0).kind).toBe('reaffirm');
    expect(planDodgeReaction(clearDefensiveStance(held), 88).kind).toBe('activate');
  });

  test('both stances are consumed alike - a held guard does not survive either', () => {
    const guarded: DefensiveStance = { isBlocking: true, isInvulnerable: false };
    expect(clearDefensiveStance(resolveTurnEndDefensive(guarded))).toEqual(OPEN);
    // And a guard is not a dodge, so the reaction still pays for the new stance.
    expect(planDodgeReaction(guarded, 60).kind).toBe('activate');
  });
});

// ── §C. Stale clicks ───────────────────────────────────────────────────────

describe('§C - a click on a closed window spends nothing', () => {
  test('after the impact, neither answer can debit stamina or count a dodge', () => {
    for (const action of ['dodge', 'shield_block'] as PendingReaction[]) {
      for (const stamina of [100, 60, 0]) {
        const duel = freshDuel(stamina);
        const clock = handClock();
        const strike = createPendingStrike({ timer: clock.timer });

        announce(strike);
        clock.advance(ENEMY_ATTACK_WINDUP_MS); // the blow lands; the window closes
        expect(strike.pending).toBeNull();

        // The shipped order is affordability first, claim second, so an unaffordable
        // NEW dodge is refused before the closed window is consulted. Either answer is
        // acceptable here; what must hold is that nothing is CLAIMED, debited or counted.
        const expected: ReactionOutcome =
          action === 'dodge' && stamina < DODGE_STAMINA_COST ? 'refused' : 'stale';
        expect(reactToStrike(duel, strike, action)).toBe(expected);
        expect(duel.stamina).toBe(stamina);
        expect(duel.dodgesPerformed).toBe(0);
        expect(duel.stance).toEqual(OPEN);
      }
    }
  });

  test('after a cancellation, neither answer can debit stamina or count a dodge', () => {
    for (const action of ['dodge', 'shield_block'] as PendingReaction[]) {
      // A rich purse and an empty one: with stamina to spare the CLAIM guard is what
      // stops the click (nothing is pending), and with none the affordability guard
      // refuses it first. Neither may spend or count anything.
      for (const stamina of [100, 0]) {
        const duel = freshDuel(stamina);
        const clock = handClock();
        const strike = createPendingStrike({ timer: clock.timer });

        const { impacts } = announce(strike);
        expect(strike.cancel()).toBe(true);
        // The dropped strike cannot land late either.
        clock.advance(ENEMY_ATTACK_WINDUP_MS);
        expect(impacts).toHaveLength(0);

        const expected: ReactionOutcome =
          action === 'dodge' && stamina < DODGE_STAMINA_COST ? 'refused' : 'stale';
        expect(reactToStrike(duel, strike, action)).toBe(expected);
        expect(duel.stamina).toBe(stamina);
        expect(duel.dodgesPerformed).toBe(0);
        expect(duel.stance).toEqual(OPEN);
      }
    }
  });

  test('the shipped handler cannot debit before the claim - that is what makes it true', () => {
    const refusal = reactionBody.indexOf("dodgeCharge.kind === 'refused'");
    const claim = reactionBody.indexOf('if (!strikeRef.current?.claimReaction()) return;');
    const debit = reactionBody.indexOf(
      'stamina: Math.max(0, prev.stamina - dodgeCharge.staminaCost),',
    );
    const counter = reactionBody.indexOf(
      'if (dodgeCharge.countsDodge) statsRef.current.dodgesPerformed += 1;',
    );
    expect(refusal).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(refusal);
    expect(debit).toBeGreaterThan(claim);
    expect(counter).toBeGreaterThan(claim);
    // One debit and one count, both paid from the plan - never a literal charge.
    expect(reactionBody.split('prev.stamina - dodgeCharge.staminaCost').length - 1).toBe(1);
    expect(reactionBody).not.toContain('prev.stamina - DODGE_STAMINA_COST');
    expect(reactionBody.split('dodgesPerformed += 1').length - 1).toBe(1);
  });
});

// ── §D. Nothing else moved ─────────────────────────────────────────────────

describe('§D - the numbers this phase did not touch', () => {
  test('12 SP, an 88 % evade and a 700 ms window - unchanged', () => {
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(DODGE_EVADE_CHANCE).toBe(0.88);
    expect(DODGE_EVADE_PERCENT).toBe(88);
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
  });

  test('a window opens only on a new announcement, and resolves once', () => {
    const clock = handClock();
    const strike = createPendingStrike({ timer: clock.timer });
    const { impacts } = announce(strike);
    // A second announcement inside the window is refused: no free extra window.
    expect(strike.announce('power_attack', () => impacts.push('power_attack'))).toBe(false);
    expect(strike.claimReaction()).toBe(true);
    expect(strike.claimReaction()).toBe(false);
    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(impacts).toEqual(['quick_attack']);
    expect(clock.live).toBe(0);
  });
});
