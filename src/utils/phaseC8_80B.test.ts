/**
 * C-8.80B — the CONFIRMED duel withdrawal.
 *
 * The rule this suite exists to pin: a gladiator who raises the flag loses the bout, once,
 * through the SAME authoritative settlement a knockout uses — and a gladiator who merely
 * opens the dialog, or chooses to stay, loses nothing at all.
 *
 * Three registers, matching how this repo tests React code (there is no DOM renderer):
 *
 *   §A  BEHAVIOUR — `withdrawFromDuel` is a real, pure module, so its order (latch →
 *       invalidate → no purse → mark → settle), its refusals and its exactly-once
 *       property are executed, not asserted from source.
 *   §B  THE REAL SETTLEMENT BOUNDARY — the withdrawal is wired to the production
 *       `createDuelSettlementLatch`, `advanceCityDay` and `settleInjury` and a faithful
 *       model of App's DEFEAT branch, so "one loss, one day, one injury, no purse" and
 *       "a duplicate can never settle twice" are observed on the shipped helpers.
 *   §C  THE SHIPPED COMPONENTS, RENDERED — the confirmation dialog, the HUD's information
 *       badge and Withdraw control, and the result card's wording, via `react-dom/server`.
 *   §D  WIRING — the ordered source pins for the React effect paths (§A's module cannot
 *       prove who calls it), including that an unmount settles nothing.
 *
 * Run with: `bun test src/utils/phaseC8_80B.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { withdrawFromDuel } from './duelWithdrawal';
import { createDuelSettlementLatch } from './duelSettlement';
import { advanceCityDay, resolveCityDay } from './cityClock';
import { settleInjury } from './injurySettlement';
import { calculateDuelGold } from './duelRewards';
import { createNewProfile } from '../services/storage';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';
import { CombatHUD } from '../components/ui/CombatHUD';
import { DuelResultModal } from '../components/hub/DuelResultModal';
import { WithdrawConfirmModal } from '../components/duel/WithdrawConfirmModal';
import type { DuelStatistics, FighterState, PlayerProfile } from '../types/game';

const sceneSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const hudSource = readFileSync(new URL('../components/ui/CombatHUD.tsx', import.meta.url), 'utf8');

/** The slice of `source` from `start` (inclusive) up to `end` (exclusive); '' if absent. */
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  if (from < 0) return '';
  const to = source.indexOf(end, from + start.length);
  if (to < 0) return '';
  return source.slice(from, to);
}

/** Source with every comment removed, so prose can neither satisfy nor defeat a pin. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const marcus = ALL_OPPONENTS[0];

/** The stats object a bout carries into its settlement. */
function freshStats(overrides: Partial<DuelStatistics> = {}): DuelStatistics {
  return {
    damageDealt: 41,
    damageTaken: 17,
    hitsLanded: 6,
    perfectBlocks: 1,
    dodgesPerformed: 0,
    maxCombo: 3,
    crowdHypePeak: 61,
    durationSeconds: 38,
    goldEarned: marcus.rewardGold,
    fameEarned: marcus.rewardFame,
    xpEarned: marcus.rewardXp,
    ...overrides,
  };
}

function freshProfile(): PlayerProfile {
  const profile = createNewProfile('Verifier');
  return { ...profile, gold: 500, fightsWon: 2, fightsLost: 1 };
}

/**
 * A faithful model of App's settlement for a withdrawal: the production latch claims the
 * bout id, then ONE `advanceCityDay` and ONE `settleInjury`, then the DEFEAT branch's
 * profile literal (which credits no gold, fame or xp) and one commit.
 */
function createAppLikeSettlement(boutId = 1) {
  const latch = createDuelSettlementLatch();
  latch.arm();
  const commits: PlayerProfile[] = [];
  let current = freshProfile();

  const settle = (stats: DuelStatistics, didWin: boolean): void => {
    if (!latch.claim(boutId)) return;
    const city = advanceCityDay(current).city;
    const injury = settleInjury(current, didWin).injury ?? null;
    current = didWin
      ? {
          ...current,
          gold: current.gold + stats.goldEarned,
          fame: current.fame + stats.fameEarned,
          xp: current.xp + stats.xpEarned,
          fightsWon: current.fightsWon + 1,
          city,
          injury,
        }
      : { ...current, fightsLost: current.fightsLost + 1, city, injury };
    commits.push(current);
  };

  return {
    settle,
    latch,
    commits,
    get profile() {
      return current;
    },
  };
}

/** A latch + pending-work recorder around `withdrawFromDuel`, for the order assertions. */
function harness() {
  const isMatchOver = { current: false };
  const stats = freshStats();
  const events: string[] = [];
  const settlements: { didWin: boolean; goldEarned: number; outcome?: string }[] = [];

  const withdraw = () =>
    withdrawFromDuel({
      isMatchOver,
      stats,
      pending: {
        cancelEnemyStrike: () => events.push(`cancelEnemy(matchOver=${isMatchOver.current})`),
        cancelPlayerStrike: () => events.push(`cancelPlayer(matchOver=${isMatchOver.current})`),
        clearTurnTimer: () => events.push(`clearTimer(matchOver=${isMatchOver.current})`),
      },
      settle: (settled, didWin) => {
        events.push(`settle(matchOver=${isMatchOver.current})`);
        settlements.push({ didWin, goldEarned: settled.goldEarned, outcome: settled.outcome });
      },
    });

  return { isMatchOver, stats, events, settlements, withdraw };
}

// ── §A. The contract, executed ──────────────────────────────────────────────

describe('§A — a confirmed withdrawal is exactly one authoritative defeat', () => {
  test('the latch is set FIRST, then every pending action is dropped, then it settles', () => {
    const h = harness();
    expect(h.withdraw()).toBe(true);
    expect(h.isMatchOver.current).toBe(true);
    // One order only: latch → the three invalidations → the settlement.
    expect(h.events).toEqual([
      'cancelEnemy(matchOver=true)',
      'cancelPlayer(matchOver=true)',
      'clearTimer(matchOver=true)',
      'settle(matchOver=true)',
    ]);
  });

  test('it settles as a DEFEAT, through the callback it was handed', () => {
    const h = harness();
    h.withdraw();
    expect(h.settlements).toHaveLength(1);
    expect(h.settlements[0].didWin).toBe(false);
  });

  test('it pays nothing: the purse is zeroed before the settlement sees it', () => {
    const h = harness();
    expect(h.stats.goldEarned).toBe(marcus.rewardGold);
    h.withdraw();
    expect(h.stats.goldEarned).toBe(0);
    expect(h.settlements[0].goldEarned).toBe(0);
  });

  test('it marks the bout as withdrawn, which is the only claim it makes', () => {
    const h = harness();
    h.withdraw();
    expect(h.stats.outcome).toBe('withdrawn');
    expect(h.settlements[0].outcome).toBe('withdrawn');
  });

  test('no combat statistic is fabricated or rewritten', () => {
    const h = harness();
    const before = { ...h.stats };
    h.withdraw();
    expect(h.stats.damageDealt).toBe(before.damageDealt);
    expect(h.stats.damageTaken).toBe(before.damageTaken);
    expect(h.stats.hitsLanded).toBe(before.hitsLanded);
    expect(h.stats.perfectBlocks).toBe(before.perfectBlocks);
    expect(h.stats.maxCombo).toBe(before.maxCombo);
    expect(h.stats.crowdHypePeak).toBe(before.crowdHypePeak);
    expect(h.stats.durationSeconds).toBe(before.durationSeconds);
    // Nothing resembling a killing blow or a landed hit is invented.
    expect(Object.keys(h.stats).sort()).toEqual(
      ['crowdHypePeak', 'damageDealt', 'damageTaken', 'dodgesPerformed', 'durationSeconds',
        'fameEarned', 'goldEarned', 'hitsLanded', 'maxCombo', 'outcome', 'perfectBlocks',
        'xpEarned'].sort(),
    );
  });

  test('a second confirmation changes nothing and settles nothing', () => {
    const h = harness();
    expect(h.withdraw()).toBe(true);
    const eventsAfterFirst = [...h.events];
    expect(h.withdraw()).toBe(false);
    expect(h.withdraw()).toBe(false);
    expect(h.events).toEqual(eventsAfterFirst);
    expect(h.settlements).toHaveLength(1);
  });

  test('a withdrawal offered over a decided bout is refused and touches nothing', () => {
    const isMatchOver = { current: true };
    const stats = freshStats();
    let cancelled = 0;
    let settled = 0;
    const result = withdrawFromDuel({
      isMatchOver,
      stats,
      pending: {
        cancelEnemyStrike: () => (cancelled += 1),
        cancelPlayerStrike: () => (cancelled += 1),
        clearTurnTimer: () => (cancelled += 1),
      },
      settle: () => (settled += 1),
    });
    expect(result).toBe(false);
    expect(cancelled).toBe(0);
    expect(settled).toBe(0);
    expect(stats.goldEarned).toBe(marcus.rewardGold);
    expect(stats.outcome).toBeUndefined();
  });
});

// ── §B. The real settlement boundary ───────────────────────────────────────

describe('§B — the production latch, clock and injury settle a forfeit once', () => {
  test('one loss, one day, one injury — and no purse, fame or xp', () => {
    const app = createAppLikeSettlement();
    const start = app.profile;
    const stats = freshStats();
    withdrawFromDuel({
      isMatchOver: { current: false },
      stats,
      pending: { cancelEnemyStrike: () => {}, cancelPlayerStrike: () => {}, clearTurnTimer: () => {} },
      settle: app.settle,
    });

    expect(app.commits).toHaveLength(1);
    const settled = app.commits[0];
    expect(settled.fightsLost).toBe(start.fightsLost + 1);
    expect(settled.gold).toBe(start.gold);
    expect(settled.fame).toBe(start.fame);
    expect(settled.xp).toBe(start.xp);
    expect(settled.fightsWon).toBe(start.fightsWon);
    expect(settled.level).toBe(start.level);
    expect(settled.currentTier).toBe(start.currentTier);
    expect(resolveCityDay(settled)).toBe(resolveCityDay(start) + 1);
    expect(settled.injury).toEqual({ fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 });
  });

  test('the PRODUCTION latch is what makes it exactly once — a duplicate cannot settle', () => {
    const app = createAppLikeSettlement();
    const stats = freshStats();
    const request = {
      isMatchOver: { current: false } as { current: boolean },
      stats,
      pending: { cancelEnemyStrike: () => {}, cancelPlayerStrike: () => {}, clearTurnTimer: () => {} },
      settle: app.settle,
    };
    withdrawFromDuel(request);
    // A second confirmation, and even a direct second `settle` (a bypass of the scene's
    // own latch), are both refused by App's per-bout claim.
    withdrawFromDuel(request);
    app.settle(stats, false);
    expect(app.commits).toHaveLength(1);
    expect(app.profile.fightsLost).toBe(2);
    expect(resolveCityDay(app.profile)).toBe(2);
  });

  test('a victory pays a purse and a forfeit never does — the same helper', () => {
    expect(calculateDuelGold({ baseGold: marcus.rewardGold, didWin: false, crowdHypePeak: 100, perfectBlocks: 5, damageTaken: 0 }).total).toBe(0);
    expect(calculateDuelGold({ baseGold: marcus.rewardGold, didWin: true, crowdHypePeak: 100, perfectBlocks: 5, damageTaken: 0 }).total).toBeGreaterThan(0);
  });

  test('an existing injury is refreshed by a forfeit, exactly as a knockout defeat refreshes it', () => {
    const base = { ...freshProfile(), injury: { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 } };
    const afterForfeit = settleInjury(base, false).injury;
    const afterKnockout = settleInjury(base, false).injury;
    expect(afterForfeit).toEqual(afterKnockout);
    expect(afterForfeit).toEqual({ fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 });
  });
});

// ── §C. The shipped components, rendered ──────────────────────────────────

const fighter = (overrides: Record<string, unknown>) =>
  ({
    id: 'c8-80b',
    name: 'Test',
    title: 'Gladiator',
    isPlayer: false,
    position: [0, 0, 0],
    rotationY: 0,
    health: 80,
    stamina: 60,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: {
      strength: 10,
      agility: 10,
      stamina: 60,
      staminaMax: 100,
      staminaRegen: 20,
      defense: 5,
      healthMax: 100,
    },
    loadout: { weapon: DEFAULT_PLAYER_WEAPON },
    comboCount: 0,
    skinColor: '#c9a27a',
    hairColor: '#2b1d12',
    tunicColor: '#7f1d1d',
    ...overrides,
  }) as unknown as FighterState;

const renderHud = (): string =>
  renderToStaticMarkup(
    React.createElement(CombatHUD, {
      player: fighter({ id: 'p', name: 'Dimachaerus', isPlayer: true }),
      opponent: fighter({ id: 'o', name: 'Marcus' }),
      crowdHype: 52,
      comboCount: 0,
      matchTimer: 97,
      isMuted: false,
      onToggleMute: () => {},
      onWithdraw: () => {},
      onOpenHelp: () => {},
      cameraMode: 'cinematic',
      onCycleCameraMode: () => {},
      // C-8.80N — the command panel is DuelScene's flex sibling of the stage, not a
      // CombatHUD prop; these fixtures render the instrumentation overlay only.
      pendingEnemyAttack: null,
      pendingPlayerAttack: null,
      reactionTaken: null,
      onReactToPendingAttack: () => {},
    }),
  );

const renderResult = (stats: DuelStatistics): string =>
  renderToStaticMarkup(
    React.createElement(DuelResultModal, {
      didWin: false,
      opponent: marcus,
      stats,
      onContinue: () => {},
      injury: null,
    }),
  );

describe('§C — the shipped surfaces say what they do', () => {
  test('the dialog offers exactly two answers and warns that confirming is a defeat', () => {
    const html = renderToStaticMarkup(
      React.createElement(WithdrawConfirmModal, { onStay: () => {}, onConfirm: () => {} }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('data-withdraw-dialog="true"');
    expect(html).toContain('data-withdraw-action="stay"');
    expect(html).toContain('data-withdraw-action="confirm"');
    expect(html).toContain('Stay and Fight');
    expect(html).toContain('Confirm Withdrawal');
    // The consequence is stated in the terms the settlement applies.
    expect(html).toContain('defeat');
    expect(html).toContain('no purse');
    // …and staying is advertised as free.
    expect(html).toContain('costs you nothing');
  });

  test('the HUD shows the weapon as information and offers ONE deliberate way out', () => {
    const html = renderHud();
    // The equipped weapon is still visible… (the renderer escapes `&` in the item's name)
    expect(html).toContain('data-combat-weapon-badge="true"');
    expect(html).toContain(DEFAULT_PLAYER_WEAPON.name.replace(/&/g, '&amp;'));
    // …and it is no longer a control that leaves the bout.
    expect(html).not.toContain('Armory &amp; Opponents');
    expect(html).not.toContain('title="Armory &amp; Opponents"');
    expect(hudSource).not.toContain('onOpenArmory');
    // The one exit is an explicit action, labelled, and it only asks.
    expect(html).toContain('data-withdraw="true"');
    expect(html).toContain('Withdraw');
    expect(html.match(/data-withdraw="/g)?.length).toBe(1);
  });

  test('a withdrawal result card says WITHDREW, never DEFEAT or "Felled by"', () => {
    const html = renderResult(freshStats({ outcome: 'withdrawn', goldEarned: 0 }));
    expect(html).toContain('data-duel-outcome="withdrawal"');
    expect(html).toContain('WITHDREW');
    expect(html).toContain(`You quit the sand. ${marcus.name} is awarded the bout.`);
    expect(html).not.toContain('Felled by');
    expect(html).not.toContain('>DEFEAT<');
    expect(html).toContain('Withdrew with');
  });

  test('an ordinary knockout defeat is untouched by the withdrawal path', () => {
    const html = renderResult(freshStats({ goldEarned: 0 }));
    expect(html).toContain('data-duel-outcome="defeat"');
    expect(html).toContain('DEFEAT');
    expect(html).toContain('Felled by');
    expect(html).not.toContain('WITHDREW');
    expect(html).not.toContain('Withdrew with');
  });
});

// ── §D. The wiring (ordered source pins) ──────────────────────────────────

describe('§D — the scene asks, the module settles, nothing else does', () => {
  test('the HUD’s Withdraw only OPENS the dialog', () => {
    const scene = code(sceneSource);
    expect(scene).toContain('onWithdraw={() => setWithdrawConfirmOpen(true)}');
    // The old one-tap exit is gone from the HUD wiring.
    expect(scene).not.toContain('onOpenArmory={onOpenArmory}');
    // "Stay and Fight" closes the dialog and settles nothing.
    const stay = between(scene, 'onStay={() => setWithdrawConfirmOpen(false)}', 'onConfirm={handleConfirmWithdrawal}');
    expect(stay.length).toBeGreaterThan(0);
    expect(stay).not.toContain('withdrawFromDuel');
  });

  test('the confirmed handler settles through the PRODUCTION callback, by reference', () => {
    const handler = between(sceneSource, 'const handleConfirmWithdrawal = useCallback(', '}, [cancelPendingEnemyAttack');
    expect(handler.length).toBeGreaterThan(0);
    const body = code(handler);
    // It delegates — it never re-implements a settlement.
    expect(body).toContain('withdrawFromDuel({');
    expect(body).toContain('settle: onMatchComplete,');
    expect(body).not.toContain('saveProfile');
    expect(body).not.toContain('advanceCityDay');
    expect(body).not.toContain('settleInjury');
    // The three invalidations the module orders are supplied from the scene's own refs.
    expect(body).toContain('cancelEnemyStrike: cancelPendingEnemyAttack');
    expect(body).toContain('cancelPlayerStrike: () => playerStrikeRef.current?.cancel()');
    expect(body).toContain('clearTimeout(resolutionTimerRef.current)');
  });

  test('the scene still reports a result through TWO call sites, and the dialog is closed on either outcome', () => {
    const scene = code(sceneSource);
    // The settlement signature App pins is untouched: the withdrawal adds no third call.
    expect(scene.match(/onMatchComplete\(/g)?.length).toBe(2);
    expect(scene).not.toContain('onMatchComplete(statsRef.current, false, ');
    // A dialog left open over a decided bout is closed in BOTH outcome branches, so it
    // cannot cover the result card and cannot be clicked into a settled fight.
    expect(scene.match(/setWithdrawConfirmOpen\(false\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  test('an unrelated unmount forfeits nothing', () => {
    // Anchor on the unmount effect ITSELF, not on its first `clearTimeout` statement: the
    // confirmed-withdrawal handler's `clearTurnTimer` closure contains that same statement, so
    // a statement-level anchor slices the handler and never reaches the cleanup at all.
    const cleanup = between(sceneSource, 'useEffect(\n    () => () => {', '// OPPONENT AI TURN STRATEGY ENGINE');
    expect(cleanup.length).toBeGreaterThan(0);
    // It DOES drop the pending work, which is the only thing a cleanup may do...
    expect(cleanup).toContain('resolutionTimerRef.current = null');
    expect(cleanup).toContain('strikeRef.current?.cancel()');
    expect(cleanup).toContain('playerStrikeRef.current?.cancel()');
    // ...and it does NOT settle, and it does not withdraw.
    expect(cleanup).not.toContain('onMatchComplete');
    expect(cleanup).not.toContain('withdrawFromDuel');
    expect(cleanup).not.toContain('setWithdrawConfirmOpen');
  });

  test('App’s defeat branch is unchanged: a loss credits no gold, fame or xp', () => {
    const lossBlock = between(appSource, 'fightsLost: base.fightsLost + 1', 'setDuelResult(');
    expect(lossBlock.length).toBeGreaterThan(0);
    expect(lossBlock).not.toContain('gold:');
    expect(lossBlock).not.toContain('fame:');
    expect(lossBlock).not.toContain('xp:');
    // The settlement claims the bout before the clock turns, for a forfeit as for a knockout.
    const credit = between(appSource, 'const handleMatchComplete', 'const handleDuelResultDismiss');
    expect(credit.indexOf('.claim(')).toBeLessThan(credit.indexOf('advanceCityDay(base)'));
  });

  test('the module is pure: no React, storage, timers or randomness', () => {
    const source = code(
      readFileSync(new URL('./duelWithdrawal.ts', import.meta.url), 'utf8'),
    );
    for (const forbidden of [
      'useState',
      'useEffect',
      'useRef',
      'localStorage',
      'sessionStorage',
      'saveProfile',
      'Date.now',
      'new Date',
      'setTimeout',
      'setInterval',
      'Math.random',
      'advanceCityDay',
      'settleInjury',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
