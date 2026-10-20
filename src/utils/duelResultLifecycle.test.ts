/**
 * The duel's result and reward lifecycle — one fight, one result, one purse.
 *
 * §R1–§R3B left one gap in this area: the wind-up cue, the reactions, the range
 * gate and the Colosseum door were all pinned and verified live, but nothing
 * covered what happens when the fight actually ENDS. This suite is that coverage,
 * and it is written in the same two registers the neighbouring suites use:
 *
 *   • **behaviour** where the rule is a pure function or a controllable clock —
 *     the purse (`calculateDuelGold`), the tier rule (`resolveVictoryTier`) and
 *     the pending strike's cancellation (`createPendingStrike` with a fake timer);
 *   • **wiring** where the rule lives inside a React effect that no headless
 *     renderer can drive here (this repo has no DOM-testing library) — the source
 *     reads below are ordered assertions, not a text snapshot, and they pin only
 *     the properties that make the lifecycle safe.
 *
 * Sections:
 *   §A  one settlement per fight — two call sites, both behind a latch that is
 *       never cleared, both delayed by the same bounded ceremony
 *   §B  the purse is written onto the ONE stats object App credits, before the
 *       settlement, and the result screen reads that same breakdown
 *   §C  App's credit follows the reward rules once per branch — gold, fame, xp,
 *       fight counts, the boss-first-defeat tier rule, and one save per branch
 *   §D  nothing lands after the fight: a cancelled announcement cannot resolve,
 *       a stale callback cannot resolve, a second announcement is refused, and
 *       the unmount cleanup drops the strike and the turn timer
 *   §E  a defeat pays nothing at all
 *
 * Run with: `bun test src/utils/duelResultLifecycle.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { calculateDuelGold } from './duelRewards';
import { resolveVictoryTier } from './tierAdvancement';
import { createPendingStrike } from './pendingStrike';
import type { StrikeTimer } from './pendingStrike';
import { ENEMY_ATTACK_WINDUP_MS } from './combatCalculations';
import { ALL_OPPONENTS } from '../data/opponents';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const resultModalSource = readFileSync(
  new URL('../components/hub/DuelResultModal.tsx', import.meta.url),
  'utf8',
);

/** The slice of `source` from `start` (inclusive) up to `end` (exclusive). */
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return '';
  return source.slice(from, to);
}

/** The one effect that decides the fight. */
const outcomeEffect = between(
  duelSource,
  '// Check victory / defeat conditions',
  '// Boss phase-2 weapon switch',
);

/** App's one credit path. */
const creditHandler = between(appSource, 'const handleMatchComplete', 'const handleDuelResultDismiss');

/**
 * The scene's unmount cleanup. Anchored on its own CODE rather than on the comment
 * above it, so retitling the comment cannot silently empty the slice (a lesson from
 * this suite's first run, where a corrected comment turned three assertions into
 * vacuous ones — `''.toContain(...)`-style passes are not evidence).
 */
const unmountCleanup = between(
  duelSource,
  'if (resolutionTimerRef.current !== null) clearTimeout(resolutionTimerRef.current);',
  '// OPPONENT AI TURN STRATEGY ENGINE',
);

const marcus = ALL_OPPONENTS[0];
/** A boss whose first defeat is what moves the tier (Goliath the Pit Behemoth). */
const tierBoss = ALL_OPPONENTS.find((opponent) => opponent.isBoss && opponent.tier === 1)!;
const plainRookie = ALL_OPPONENTS.find((opponent) => !opponent.isBoss)!;

/** A clock the test advances by hand; a cleared callback can still be fired. */
function fakeTimer() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; run: () => void }>();
  const callbacks = new Map<number, () => void>();

  const timer: StrikeTimer = {
    set(callback, ms) {
      const id = nextId++;
      scheduled.set(id, { at: now + ms, run: callback });
      callbacks.set(id, callback);
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
    fireStale(handle: number) {
      callbacks.get(handle)?.();
    },
    get live() {
      return scheduled.size;
    },
  };
}

// ── §A. One settlement per fight ────────────────────────────────────────────

describe('§A — a fight settles exactly once', () => {
  test('the outcome effect is the only place a fight is settled', () => {
    expect(duelSource.match(/onMatchComplete\(/g)?.length).toBe(2);
    expect(outcomeEffect.match(/onMatchComplete\(statsRef\.current, true\)/g)?.length).toBe(1);
    expect(outcomeEffect.match(/onMatchComplete\(statsRef\.current, false\)/g)?.length).toBe(1);
  });

  test('the settlement latch is set in both outcome branches and is never cleared', () => {
    expect(outcomeEffect.match(/isMatchOver\.current = true/g)?.length).toBe(2);
    // Once a fight is over it stays over for the life of the scene: nothing in
    // the source may reset the latch (a reset would allow a second settlement).
    expect(duelSource).not.toContain('isMatchOver.current = false');
  });

  test('the latch is set before either settlement, and the effect returns on it', () => {
    const win = outcomeEffect.indexOf('onMatchComplete(statsRef.current, true)');
    const loss = outcomeEffect.indexOf('onMatchComplete(statsRef.current, false)');
    const latches = [...outcomeEffect.matchAll(/isMatchOver\.current = true/g)].map((m) => m.index ?? -1);
    expect(latches.length).toBe(2);
    expect(latches[0]).toBeLessThan(win);
    expect(latches[1]).toBeLessThan(loss);
    // …and the effect returns immediately once the latch is set, so a re-render
    // caused by the final health write cannot settle the same fight twice.
    expect(outcomeEffect).toContain('if (isMatchOver.current) return;');
  });

  test('both outcomes are held for the same bounded ceremony before settling', () => {
    const delays = [
      ...outcomeEffect.matchAll(
        /onMatchComplete\(statsRef\.current, (?:true|false)\);\s*\n\s*\}, (\d+)\);/g,
      ),
    ].map((match) => Number(match[1]));

    expect(delays.length).toBe(2);
    expect(delays[0]).toBe(delays[1]);
    expect(Number.isFinite(delays[0])).toBe(true);
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[0]).toBeLessThanOrEqual(5000);
  });
});

// ── §B. The purse the result screen shows is the purse App credits ──────────

describe('§B — one stats object carries the purse to both the screen and the purse', () => {
  test('a victory computes the purse and writes it onto the credited stats object', () => {
    const winBlock = outcomeEffect.slice(
      outcomeEffect.indexOf('if (opp.health <= 0)'),
      outcomeEffect.indexOf('} else if (player.health <= 0)'),
    );

    expect(winBlock).toContain('const purse = calculateDuelGold({');
    expect(winBlock).toContain('baseGold: opponent.rewardGold');
    expect(winBlock).toContain('didWin: true');
    expect(winBlock).toContain('crowdHypePeak: statsRef.current.crowdHypePeak');
    expect(winBlock).toContain('perfectBlocks: statsRef.current.perfectBlocks');
    expect(winBlock).toContain('damageTaken: statsRef.current.damageTaken');

    // The total is what the purse is credited; the breakdown is what the screen itemises.
    expect(winBlock.indexOf('statsRef.current.goldEarned = purse.total')).toBeGreaterThan(-1);
    expect(winBlock.indexOf('statsRef.current.goldBreakdown = purse')).toBeGreaterThan(-1);
    // …and both are written before the settlement that hands the object over.
    expect(winBlock.indexOf('statsRef.current.goldEarned = purse.total')).toBeLessThan(
      winBlock.indexOf('onMatchComplete(statsRef.current, true)'),
    );
  });

  test('the result screen counts up exactly the figures the stats object carries', () => {
    expect(resultModalSource).toContain('const gold = stats.goldEarned;');
    expect(resultModalSource).toContain('const fame = stats.fameEarned;');
    expect(resultModalSource).toContain('const xp = stats.xpEarned;');
    // The last frame writes the stats' own values, never a rounding of them.
    expect(resultModalSource).toContain('setCounted({ gold, fame, xp })');
  });

  test('a plain win pays the opponent\'s flat bounty, so the reward rules are unchanged', () => {
    const purse = calculateDuelGold({
      baseGold: marcus.rewardGold,
      didWin: true,
      crowdHypePeak: 25,
      perfectBlocks: 0,
      damageTaken: 40,
    });
    expect(purse.total).toBe(marcus.rewardGold);
    expect(purse).toEqual({ base: marcus.rewardGold, hype: 0, precision: 0, flawless: 0, total: 35 });
  });
});

// ── §C. App's credit: once per branch, by the existing rules ────────────────

describe('§C — App credits a finished fight once, by the existing rules', () => {
  test('the three currencies are credited exactly once, from the stats object', () => {
    expect(creditHandler.match(/profile\.gold \+ stats\.goldEarned/g)?.length).toBe(1);
    expect(creditHandler.match(/profile\.fame \+ stats\.fameEarned/g)?.length).toBe(1);
    expect(creditHandler.match(/profile\.xp \+ stats\.xpEarned/g)?.length).toBe(1);
  });

  test('each fight is counted once, on its own side of the result', () => {
    expect(creditHandler.match(/fightsWon: profile\.fightsWon \+ 1/g)?.length).toBe(1);
    expect(creditHandler.match(/fightsLost: profile\.fightsLost \+ 1/g)?.length).toBe(1);
    // The id is appended only when it is not already in the book.
    expect(creditHandler).toContain('profile.defeatedOpponentIds.includes(activeOpponent.id)');
  });

  test('gold, fame and xp exist only on the winning branch', () => {
    const lossBlock = creditHandler.slice(creditHandler.indexOf('} else {'));
    expect(lossBlock.length).toBeGreaterThan(0);
    expect(lossBlock).not.toContain('gold');
    expect(lossBlock).not.toContain('fame');
    expect(lossBlock).not.toContain('xp');
  });

  test('exactly one profile write per branch — no second payout from a repeated save', () => {
    expect(creditHandler.match(/saveProfile\(settledProfile\)/g)?.length).toBe(2);
    expect(creditHandler.match(/setProfile\(settledProfile\)/g)?.length).toBe(2);
  });

  test('the tier moves only on a boss\'s first defeat (the existing reward rule)', () => {
    expect(creditHandler).toContain('resolveVictoryTier(');

    const firstDefeat = resolveVictoryTier({
      currentTier: 1,
      opponent: tierBoss,
      defeatedOpponentIds: [],
    });
    expect(firstDefeat).toEqual({ currentTier: 2, firstDefeat: true, advanced: true });

    const rematch = resolveVictoryTier({
      currentTier: 1,
      opponent: tierBoss,
      defeatedOpponentIds: [tierBoss.id],
    });
    expect(rematch.advanced).toBe(false);
    expect(rematch.currentTier).toBe(1);

    const nonBoss = resolveVictoryTier({
      currentTier: 1,
      opponent: plainRookie,
      defeatedOpponentIds: [],
    });
    expect(nonBoss.advanced).toBe(false);
    expect(nonBoss.currentTier).toBe(1);
  });
});

// ── §D. Nothing lands after the fight ───────────────────────────────────────

describe('§D — a pending strike cannot outlive the fight', () => {
  test('both outcome branches drop the announced strike before they settle', () => {
    const winBlock = outcomeEffect.slice(
      outcomeEffect.indexOf('if (opp.health <= 0)'),
      outcomeEffect.indexOf('} else if (player.health <= 0)'),
    );
    const lossBlock = outcomeEffect.slice(outcomeEffect.indexOf('} else if (player.health <= 0)'));

    for (const block of [winBlock, lossBlock]) {
      expect(block).toContain('cancelPendingEnemyAttack()');
      expect(block.indexOf('cancelPendingEnemyAttack()')).toBeLessThan(
        block.indexOf('onMatchComplete(statsRef.current,'),
      );
    }
  });

  test('a strike cancelled at the result resolves no damage afterwards', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer, windupMs: ENEMY_ATTACK_WINDUP_MS });
    let impacts = 0;

    expect(strike.announce('power_attack', () => (impacts += 1))).toBe(true);
    // The victory/defeat effect's own call.
    expect(strike.cancel()).toBe(true);

    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    clock.advance(10_000);
    expect(impacts).toBe(0);
    expect(strike.pending).toBeNull();
    expect(clock.live).toBe(0);
  });

  test('a stale callback the platform still fires resolves nothing', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer, windupMs: ENEMY_ATTACK_WINDUP_MS });
    let impacts = 0;

    strike.announce('quick_attack', () => (impacts += 1));
    strike.cancel();
    clock.fireStale(1);

    expect(impacts).toBe(0);
  });

  test('a second announcement inside one window is refused, so one strike can land once', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer, windupMs: ENEMY_ATTACK_WINDUP_MS });
    const landed: string[] = [];

    expect(strike.announce('quick_attack', (action) => landed.push(action))).toBe(true);
    expect(strike.announce('power_attack', (action) => landed.push(action))).toBe(false);

    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(landed).toEqual(['quick_attack']);
    expect(clock.live).toBe(0);
  });

  test('the unmount cleanup drops the strike and the turn-end timer', () => {
    expect(unmountCleanup.length).toBeGreaterThan(0);
    expect(unmountCleanup).toContain('clearTimeout(resolutionTimerRef.current)');
    expect(unmountCleanup).toContain('resolutionTimerRef.current = null');
    expect(unmountCleanup).toContain('strikeRef.current?.cancel()');
  });

  test('no delayed action may start a resolution once the fight is over', () => {
    // Both entry points into a resolution — the engine itself and the player's
    // reaction — refuse to run after the latch. The announced strike's own
    // callback checks it too, so a callback that slipped past `cancel()` while
    // the scene was still mounted cannot resolve a blow into a finished fight.
    const engine = between(
      duelSource,
      'const executeCombatTurn = useCallback(',
      '// 3. OFFENSIVE ATTACK ACTIONS',
    );
    expect(engine).toContain('if (resolvingRef.current || isMatchOver.current) return;');

    const reaction = between(
      duelSource,
      'const reactToPendingAttack = useCallback(',
      '// No blow may outlive the scene',
    );
    expect(reaction).toContain('if (isMatchOver.current) return;');

    const settlement = between(
      duelSource,
      'const announceEnemyAttack = useCallback(',
      'const reactToPendingAttack',
    );
    expect(settlement).toContain('if (isMatchOver.current) return;');
  });
});

// ── §E. A defeat pays nothing ───────────────────────────────────────────────

describe('§E — the arena only feeds a winner', () => {
  test('the defeat branch zeroes the purse and computes no purse at all', () => {
    const lossBlock = outcomeEffect.slice(outcomeEffect.indexOf('} else if (player.health <= 0)'));
    expect(lossBlock).toContain('statsRef.current.goldEarned = 0');
    expect(lossBlock).not.toContain('calculateDuelGold');
    expect(lossBlock).not.toContain('goldBreakdown');
  });

  test('a loss pays nothing whatever the fight\'s figures were', () => {
    for (const input of [
      { crowdHypePeak: 100, perfectBlocks: 5, damageTaken: 0 },
      { crowdHypePeak: 75, perfectBlocks: 3, damageTaken: 40 },
      { crowdHypePeak: 0, perfectBlocks: 0, damageTaken: 200 },
    ]) {
      expect(calculateDuelGold({ baseGold: marcus.rewardGold, didWin: false, ...input }).total).toBe(0);
    }
  });
});
