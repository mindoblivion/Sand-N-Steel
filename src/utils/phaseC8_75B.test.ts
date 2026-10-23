/**
 * Valéria counter readability and evade balance (C-8.75B).
 *
 * The defect this pins: when Valéria (`bossMechanic: 'counter_dodge'`) evaded a
 * player strike, the counter she queued resolved by calling
 * `executeCombatTurn('opponent', 'quick_attack')` directly from the AI effect —
 * so the player was struck by a blow that was never announced, never shown, and
 * could never be answered, while every other enemy strike in the game has been
 * telegraphed for 700 ms since §R1. The fix routes the counter through the SAME
 * announcement controller (`utils/pendingStrike`) instead of around it.
 *
 * That lifecycle is bookkeeping and timing, so it is driven here on a
 * CONTROLLED clock (`fakeTimer`) rather than on the wall clock: no test sleeps,
 * nothing is timing-sensitive, and a stale callback can be fired on purpose
 * instead of hoped for.
 *
 * Sections:
 *   §A  the counter is ANNOUNCED, lands at the end of its wind-up, and answers
 *       to the same one-impact / one-reaction / cancel rules as any enemy strike
 *   §B  passive evade belongs to the counter_dodge mechanic alone, and the
 *       shipped rate is the chosen one
 *   §C  the balance evidence: a deterministic seeded simulation of the shipped
 *       formulas at 0.75 / 0.35 / 0.25, with its own uncertainty stated
 *
 * Run with: bun test src/utils/phaseC8_75B.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import { createPendingStrike } from './pendingStrike';
import type { EnemyStrikeAction, StrikeTimer } from './pendingStrike';
import {
  isCounterDodgeOpponent,
  queuesCounterOnEvade,
  resolvePassiveEvadeChance,
  rollsPassiveEvade,
} from './counterDodge';
import {
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
  applyStaminaRegen,
  calculateAttackDamage,
  calculateHitChance,
  getStaminaCost,
  shieldGuardStaminaGain,
} from './combatCalculations';
import { ALL_OPPONENTS } from '../data/opponents';
import { ALL_WEAPONS, getWeaponByType } from '../data/itemsDB';

/** A clock the test advances by hand. */
function fakeTimer() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; run: () => void }>();
  const timer: StrikeTimer = {
    set(callback, ms) {
      const id = nextId++;
      scheduled.set(id, { at: now + ms, run: callback });
      return id;
    },
    clear(handle) {
      scheduled.delete(handle);
    },
  };
  return {
    timer,
    advance(ms: number) {
      now += ms;
      for (const [id, job] of [...scheduled]) {
        if (job.at <= now) {
          scheduled.delete(id);
          job.run();
        }
      }
    },
  };
}

const QUICK: EnemyStrikeAction = 'quick_attack';

// ── §A. The counter's lifecycle ────────────────────────────────────────────

/**
 * The scene's counter path, reduced to exactly the two decisions it makes:
 *
 *   1. the impact closure queues the counter when a player strike is evaded
 *      (`queuesCounterOnEvade`), and
 *   2. the opponent's turn ANNOUNCES the queued counter through the shared
 *      controller instead of resolving it.
 *
 * Everything else the real scene does (stamina, damage, the 1100 ms turn timer)
 * is downstream of `onImpact`, so a harness that records impacts measures the
 * lifecycle the defect was in.
 */
function counterHarness() {
  const clock = fakeTimer();
  const strike = createPendingStrike({ timer: clock.timer, windupMs: ENEMY_ATTACK_WINDUP_MS });
  const impacts: EnemyStrikeAction[] = [];
  const state = { queued: false, matchOver: false, playerTurn: false, announcements: 0 };

  const onImpact = (action: EnemyStrikeAction) => {
    // The real callback re-checks the settlement latch before resolving.
    if (state.matchOver) return;
    impacts.push(action);
  };

  return {
    clock,
    strike,
    impacts,
    state,
    /** The impact closure's queueing half. */
    evade(playerIsAttacker: boolean, opponent: object) {
      if (queuesCounterOnEvade(playerIsAttacker, opponent)) state.queued = true;
    },
    /** The AI effect's counter branch — the code under test's shape. */
    opponentTurn(): 'announced' | 'refused' | 'no-counter' | 'blocked' {
      if (state.playerTurn || state.matchOver || strike.pending !== null) return 'blocked';
      if (!state.queued) return 'no-counter';
      state.queued = false;
      const announced = strike.announce(QUICK, onImpact);
      if (announced) state.announcements += 1;
      return announced ? 'announced' : 'refused';
    },
  };
}

const VALERIA = ALL_OPPONENTS.find((o) => o.id === 'opp_valeria_boss')!;

describe('§A — the counter is announced, then resolves exactly once', () => {
  test('an evaded player strike queues a counter that is ANNOUNCED, not resolved', () => {
    const h = counterHarness();
    h.evade(true, VALERIA);
    expect(h.state.queued).toBe(true);

    expect(h.opponentTurn()).toBe('announced');
    // Announced means pending — and nothing has landed yet.
    expect(h.strike.pending).toBe(QUICK);
    expect(h.impacts).toEqual([]);
    // The latch was consumed by the announcement itself.
    expect(h.state.queued).toBe(false);
  });

  test('nothing lands before the 700 ms wind-up, and exactly one blow lands at it', () => {
    const h = counterHarness();
    h.evade(true, VALERIA);
    h.opponentTurn();

    h.clock.advance(ENEMY_ATTACK_WINDUP_MS - 1);
    expect(h.impacts).toEqual([]);

    h.clock.advance(1);
    expect(h.impacts).toEqual([QUICK]);
    expect(h.strike.pending).toBeNull();
  });

  test('the counter cannot resolve twice', () => {
    const h = counterHarness();
    h.evade(true, VALERIA);
    h.opponentTurn();
    // A second turn attempt inside the same window is refused by the controller.
    expect(h.opponentTurn()).toBe('blocked');

    h.clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(h.impacts).toEqual([QUICK]);
    // Long after the blow, a repeated AI pass has nothing left to spend.
    h.clock.advance(ENEMY_ATTACK_WINDUP_MS * 5);
    expect(h.opponentTurn()).toBe('no-counter');
    expect(h.impacts).toEqual([QUICK]);
    expect(h.state.announcements).toBe(1);
  });

  test('a second evade re-arms the counter for the NEXT turn only', () => {
    const h = counterHarness();
    h.evade(true, VALERIA);
    h.opponentTurn();
    h.clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(h.impacts).toEqual([QUICK]);

    h.evade(true, VALERIA);
    expect(h.opponentTurn()).toBe('announced');
    h.clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(h.impacts).toEqual([QUICK, QUICK]);
  });

  test('the player gets the SAME one reaction every announced strike gets', () => {
    const h = counterHarness();
    h.evade(true, VALERIA);
    h.opponentTurn();

    // Shield Guard, then Dodge: only the first may count, so a block and an
    // evade can never stack on one counter.
    expect(h.strike.claimReaction()).toBe(true);
    expect(h.strike.hasReacted).toBe(true);
    expect(h.strike.claimReaction()).toBe(false);

    h.clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(h.impacts).toEqual([QUICK]);
  });

  test('a cancelled counter never lands, and cannot be spent later instead', () => {
    const h = counterHarness();
    h.evade(true, VALERIA);
    h.opponentTurn();

    // The fight ends (or the scene unmounts) inside the wind-up.
    expect(h.strike.cancel()).toBe(true);
    h.state.matchOver = true;
    h.clock.advance(ENEMY_ATTACK_WINDUP_MS * 4);

    expect(h.impacts).toEqual([]);
    // The latch was consumed by the announcement, so the counter is gone rather
    // than deferred into a stale turn.
    expect(h.opponentTurn()).toBe('blocked');
    expect(h.impacts).toEqual([]);
  });

  test('no counter is announced once the fight is decided, or on the player\'s own turn', () => {
    const h = counterHarness();
    h.evade(true, VALERIA);
    h.state.matchOver = true;
    expect(h.opponentTurn()).toBe('blocked');

    const p = counterHarness();
    p.evade(true, VALERIA);
    p.state.playerTurn = true;
    expect(p.opponentTurn()).toBe('blocked');
    expect(p.impacts).toEqual([]);
  });

  test('a player who evades the counter does not chain a counter of their own', () => {
    const h = counterHarness();
    // Valéria is the attacker here — the player evading her counter.
    h.evade(false, VALERIA);
    expect(h.state.queued).toBe(false);
    expect(h.opponentTurn()).toBe('no-counter');
  });

  test('the wind-up and the turn window keep the audited relationship', () => {
    // The impact is scheduled before the 1100 ms turn timer, so it always lands
    // inside the turn that owns it — the same rule every announced strike obeys.
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(ENEMY_ATTACK_WINDUP_MS).toBeLessThan(1100);
  });
});

// ── §B. Who may passively evade, and at what rate ──────────────────────────

describe('§B — passive evade belongs to the counter_dodge mechanic alone', () => {
  test('only Valéria is a counter_dodge opponent, and only she can passively evade', () => {
    const evaders = ALL_OPPONENTS.filter((o) => resolvePassiveEvadeChance(o) > 0);
    expect(evaders.map((o) => o.id)).toEqual(['opp_valeria_boss']);
    expect(isCounterDodgeOpponent(VALERIA)).toBe(true);
  });

  test('every other opponent resolves 0 despite carrying a configured dodgeChance', () => {
    const others = ALL_OPPONENTS.filter((o) => o.id !== 'opp_valeria_boss');
    expect(others.length).toBeGreaterThan(3);
    for (const opponent of others) {
      // The field is populated on all of them — the MECHANIC is the gate.
      expect(opponent.dodgeChance).toBeGreaterThan(0);
      expect(resolvePassiveEvadeChance(opponent)).toBe(0);
      expect(rollsPassiveEvade(opponent, 0)).toBe(false);
    }
  });

  test('no other boss mechanic can passively evade even with a high rate', () => {
    for (const mechanic of ['heavy_telegraph', 'phase_weapon_switch', 'rage_mode_colossus'] as const) {
      expect(resolvePassiveEvadeChance({ bossMechanic: mechanic, dodgeChance: 0.9 })).toBe(0);
      expect(rollsPassiveEvade({ bossMechanic: mechanic, dodgeChance: 0.9 }, 0)).toBe(false);
    }
  });

  test('the roll is strict, and a malformed rate or roll is not an evade', () => {
    const boss = { bossMechanic: 'counter_dodge' as const, dodgeChance: 0.35 };
    expect(rollsPassiveEvade(boss, 0)).toBe(true);
    expect(rollsPassiveEvade(boss, 0.349)).toBe(true);
    expect(rollsPassiveEvade(boss, 0.35)).toBe(false);
    expect(rollsPassiveEvade(boss, 0.9)).toBe(false);

    expect(rollsPassiveEvade(boss, Number.NaN)).toBe(false);
    expect(rollsPassiveEvade({ bossMechanic: 'counter_dodge' }, 0)).toBe(false);
    expect(rollsPassiveEvade({ bossMechanic: 'counter_dodge', dodgeChance: Number.NaN }, 0)).toBe(false);
    expect(rollsPassiveEvade(null, 0)).toBe(false);
    expect(rollsPassiveEvade(undefined, 0)).toBe(false);
  });

  test('an out-of-range configured rate is clamped into [0, 1]', () => {
    expect(resolvePassiveEvadeChance({ bossMechanic: 'counter_dodge', dodgeChance: 4 })).toBe(1);
    expect(resolvePassiveEvadeChance({ bossMechanic: 'counter_dodge', dodgeChance: -2 })).toBe(0);
  });

  test('only the PLAYER\'s strike can be countered', () => {
    expect(queuesCounterOnEvade(true, VALERIA)).toBe(true);
    expect(queuesCounterOnEvade(false, VALERIA)).toBe(false);
    expect(queuesCounterOnEvade(true, { bossMechanic: 'rage_mode_colossus', dodgeChance: 0.5 })).toBe(false);
  });
});

// ── §C. The chosen rate, and the evidence for it ───────────────────────────

/** A tiny deterministic PRNG, so a run is reproducible from its seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One Valéria fight, played through the SHIPPED formulas and her own shipped
 * configuration, with the passive-evade rate as the only variable.
 *
 * The player is a level-8 shield-and-spatha line — str 15 / agi 11 / def 21 /
 * sta 10, built from the same derivations `calculateTotalStats` uses (health
 * 80 + str·4 + def·3 = 203, stamina 70 + sta·5 = 120, regen 12 + agi·0.8 +
 * sta·0.4 = 24.8) — equipped with the Imperial Spatha (the mid-tier
 * `sword_shield` weapon) and playing the competent policy the combat rules
 * reward: strike with the quick attack whenever the stamina is there, catch
 * breath when it is not, and Shield Guard every announced strike (free, and its
 * one recovery is the shipped `shieldGuardStaminaGain`).
 *
 * Deliberate simplifications, all identical across the three rates so the
 * COMPARISON is sound: Valéria never spends stamina (she cannot run out, which
 * can only overstate her aggression), and her non-attack AI turns (taunts,
 * shields) are not modelled, so the chip damage below is an upper bound.
 * Two draws are consumed per player strike and two per enemy strike at every
 * rate, so the three runs read the same random stream.
 */
const PLAYER = {
  strength: 15,
  agility: 11,
  defense: 21,
  staminaMax: 120,
  staminaRegen: 24.8,
  healthMax: 203,
};
const PLAYER_WEAPON = ALL_WEAPONS.find((w) => w.id === 'spatha_legion')!;
const OPP_WEAPON = getWeaponByType('spear');
const MAX_ROUNDS = 400;

interface Fight {
  attempts: number;
  landed: number;
  counters: number;
  damageTaken: number;
  won: boolean;
}

function fight(rate: number, rand: () => number): Fight {
  let playerHp = PLAYER.healthMax;
  let oppHp = VALERIA.stats.healthMax;
  let stamina = PLAYER.staminaMax;
  let attempts = 0;
  let landed = 0;
  let counters = 0;
  let damageTaken = 0;
  let rounds = 0;

  const quickCost = getStaminaCost(PLAYER_WEAPON, true);
  const playerHit = calculateHitChance(true, PLAYER.agility, VALERIA.stats.agility);
  const enemyHit = calculateHitChance(true, VALERIA.stats.agility, PLAYER.agility);
  const playerDamage = calculateAttackDamage(
    PLAYER_WEAPON.damageLight, PLAYER.strength, false, VALERIA.stats.defense, false, 0, 1,
  );
  const chipDamage = calculateAttackDamage(
    OPP_WEAPON.damageLight, VALERIA.stats.strength, false, PLAYER.defense,
    true, PLAYER_WEAPON.blockReduction, 1,
  );
  const guardGain = shieldGuardStaminaGain(true, PLAYER.staminaRegen);

  while (playerHp > 0 && oppHp > 0 && rounds < MAX_ROUNDS) {
    rounds += 1;

    if (stamina >= quickCost) {
      stamina -= quickCost;
      attempts += 1;
      const evadeRoll = rand();
      const hitRoll = rand();
      if (evadeRoll < rate) {
        counters += 1;
      } else if (hitRoll * 100 <= playerHit) {
        oppHp -= playerDamage;
        landed += 1;
      }
    } else {
      stamina = applyStaminaRegen(stamina, PLAYER.staminaMax, PLAYER.staminaRegen);
    }
    if (oppHp <= 0) break;

    // Every enemy strike — the counter included — meets the same Shield Guard.
    const dodgeRoll = rand();
    const enemyHitRoll = rand();
    void dodgeRoll;
    if (enemyHitRoll * 100 <= enemyHit) {
      damageTaken += chipDamage;
      playerHp -= chipDamage;
      stamina = applyStaminaRegen(stamina, PLAYER.staminaMax, guardGain);
    }
  }

  return { attempts, landed, counters, damageTaken, won: oppHp <= 0 && playerHp > 0 };
}

const TRIALS = 10000;
const SEED = 20261023;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function simulate(rate: number, seed = SEED) {
  const rand = mulberry32(seed);
  const fights: Fight[] = [];
  for (let i = 0; i < TRIALS; i++) fights.push(fight(rate, rand));
  const attempts = fights.map((f) => f.attempts);
  const totalAttempts = attempts.reduce((a, b) => a + b, 0);
  const totalLanded = fights.reduce((a, f) => a + f.landed, 0);
  const wins = fights.filter((f) => f.won).length;
  return {
    rate,
    trials: TRIALS,
    winRate: wins / TRIALS,
    landedRate: totalLanded / totalAttempts,
    attemptsMean: mean(attempts),
    attemptsMedian: median(attempts),
    countersMean: mean(fights.map((f) => f.counters)),
    damageTakenMean: mean(fights.map((f) => f.damageTaken)),
  };
}

describe('§C — the shipped passive-evade rate, against measured alternatives', () => {
  const at75 = simulate(0.75);
  const at35 = simulate(0.35);
  const at25 = simulate(0.25);

  test('the chosen rate is 0.35, and it is the one the roster already fields', () => {
    expect(VALERIA.dodgeChance).toBe(0.35);
    expect(resolvePassiveEvadeChance(VALERIA)).toBe(0.35);

    // Supported by the roster, not only by the simulation: it is her own
    // division's rate, and it sits inside the roster's own configured band.
    const peer = ALL_OPPONENTS.find((o) => o.tier === 3 && o.fightIndex === 1)!;
    expect(peer.dodgeChance).toBe(0.35);

    const configured = ALL_OPPONENTS.map((o) => o.dodgeChance);
    expect(Math.min(...configured)).toBeGreaterThan(0);
    expect(VALERIA.dodgeChance).toBeLessThan(Math.max(...configured));
    // 0.75 was double the roster's previous maximum — that is why it read as a wall.
    expect(at75.rate).toBeGreaterThan(Math.max(...configured));
  });

  test('the landed-hit rate falls as the passive evade rises', () => {
    expect(at75.landedRate).toBeLessThan(at35.landedRate);
    expect(at35.landedRate).toBeLessThan(at25.landedRate);
    // The measured bands at this seed (the hit roll is ~70% against her agility,
    // so the landed rate is (1 − evade) × 0.70).
    expect(at75.landedRate).toBeGreaterThan(0.15);
    expect(at75.landedRate).toBeLessThan(0.20);
    expect(at35.landedRate).toBeGreaterThan(0.42);
    expect(at35.landedRate).toBeLessThan(0.49);
    expect(at25.landedRate).toBeGreaterThan(0.49);
    expect(at25.landedRate).toBeLessThan(0.56);
  });

  test('0.75 costs the most attempts and 0.25 the fewest', () => {
    expect(at75.attemptsMedian).toBeGreaterThan(at35.attemptsMedian);
    expect(at35.attemptsMean).toBeGreaterThan(at25.attemptsMean);
    // Measured: 52 / 28 / 24 median attempts to take her 320 HP down.
    expect(at75.attemptsMedian).toBeGreaterThanOrEqual(45);
    expect(at35.attemptsMedian).toBeLessThanOrEqual(32);
  });

  test('incoming counter frequency scales with the rate', () => {
    expect(at75.countersMean).toBeGreaterThan(at35.countersMean);
    expect(at35.countersMean).toBeGreaterThan(at25.countersMean);
    // Each counter is now a TELEGRAPHED strike the player can answer, but its
    // frequency is still the rate's own: ~39 / 10 / 6 per fight, measured.
    expect(at75.countersMean).toBeGreaterThan(30);
    expect(at35.countersMean).toBeGreaterThan(6);
    expect(at35.countersMean).toBeLessThan(14);
  });

  test('0.75 is a wall and 0.35 is a fight the player can win', () => {
    expect(at75.winRate).toBeLessThan(0.5);
    expect(at35.winRate).toBeGreaterThan(0.9);
    expect(at25.winRate).toBeGreaterThanOrEqual(at35.winRate);
    // Not a walkover at the chosen rate: she still lands real damage.
    expect(at35.damageTakenMean).toBeGreaterThan(60);
  });

  test('the trial count is large enough for the comparison to mean something', () => {
    // 95% binomial half-width on the win rate, at the worst case p = 0.5.
    const halfWidth = 1.96 * Math.sqrt(0.25 / TRIALS);
    for (const run of [at75, at35, at25]) expect(run.trials).toBe(TRIALS);
    expect(halfWidth).toBeLessThan(0.02);
    // And the measured gap between the shipped rate and the reported one is far
    // larger than that uncertainty, so the ordering is not a sampling accident.
    expect(at35.winRate - at75.winRate).toBeGreaterThan(4 * halfWidth);
  });

  test('the simulation is deterministic — the same seed reproduces it exactly', () => {
    expect(simulate(0.35, SEED)).toEqual(at35);
    const other = simulate(0.35, SEED + 1);
    // A different stream lands in the same place: the result is not seed luck.
    expect(Math.abs(other.winRate - at35.winRate)).toBeLessThan(0.03);
    expect(Math.abs(other.landedRate - at35.landedRate)).toBeLessThan(0.02);
  });
});
