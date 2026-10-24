/**
 * Reaction lifecycle verification (C-8.79C).
 *
 * C-8.79B made the reaction cue name the stance the player actually took. This
 * phase asks the next question: is that cue still SYNCHRONISED with what the
 * impact does, and is the whole pending-strike/reaction lifecycle dropped safely
 * when the bout settles or the player leaves the arena?
 *
 * The audit was read-only and found NO reproducible defect, so this file adds
 * evidence, not production code. Everything here is deterministic:
 *
 *   • the bookkeeping is driven on a controlled clock (`createPendingStrike`
 *     takes its timer as a parameter) — no test sleeps;
 *   • the stance and damage rules are the SHIPPED pure functions
 *     (`applyDefensiveAction`, `clearDefensiveStance`, `calculateAttackDamage`);
 *   • the dodge rate and the block flag are READ OUT of the shipped resolution
 *     source, so a changed rate re-parameterises this suite instead of silently
 *     invalidating it;
 *   • the cue itself is rendered from the SHIPPED `CombatHUD` component.
 *
 * Sections:
 *   §A the cue names a stance, and that stance is the one the impact reads
 *   §B one claim, one stance, one charge — repeated taps and refusals
 *   §C cancellation: telegraph, pending-strike and delayed-impact windows
 *   §D the shipped wiring that makes §A–§C true
 *   §E the cue, rendered from the shipped HUD, and its window
 *
 * Run with: bun test src/utils/phaseC8_79C.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CombatHUD } from '../components/ui/CombatHUD';
import { createPendingStrike, resolveReactionCue } from './pendingStrike';
import type { PendingReaction, StrikeTimer } from './pendingStrike';
import {
  applyDefensiveAction,
  calculateAttackDamage,
  clearDefensiveStance,
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
} from './combatCalculations';
import type { DefensiveStance } from './combatCalculations';
import { queuesCounterOnEvade } from './counterDodge';
import { ALL_WEAPONS, DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import type { FighterState } from '../types/game';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);

/** `//` and block-comment lines stripped, so prose can neither satisfy nor defeat a pin. */
const codeOnly = (source: string): string =>
  source
    .split('\n')
    .filter(
      (line) =>
        !line.trim().startsWith('//') &&
        !line.trim().startsWith('*') &&
        !line.trim().startsWith('/*'),
    )
    .join('\n');

const duelCode = codeOnly(duelSource);

/**
 * The shipped dodge rate, read out of the resolution itself. A model that
 * hard-coded its own 0.75 would keep passing after the real rate moved.
 */
const SHIPPED_DODGE_RATE = Number(
  /defender\.isInvulnerable && Math\.random\(\) < ([\d.]+)/.exec(duelCode)?.[1],
);

/** The reaction handler's own body, so its ordering can be pinned without the rest of the file. */
const reactionBody = duelSource.slice(
  duelSource.indexOf('const reactToPendingAttack = useCallback('),
  duelSource.indexOf('// No blow may outlive the scene'),
);

/** The impact callback `announceEnemyAttack` hands to the controller. */
const impactBody = duelSource.slice(
  duelSource.indexOf('strikeRef.current?.announce('),
  duelSource.indexOf('if (!announced) return;'),
);

// ── A model of the two shipped decision sequences ───────────────────────────
//
// These helpers call ONLY shipped code. The sequencing they encode is pinned
// against `DuelScene.tsx` in §D, so a change to the real order fails there
// rather than being silently absorbed here.

const baseStance: DefensiveStance = { isBlocking: false, isInvulnerable: false };

/**
 * `reactToPendingAttack`, exactly as shipped: stamina refusal BEFORE the claim,
 * claim BEFORE the stance write.
 */
function reactToPendingAttack(
  strike: ReturnType<typeof createPendingStrike>,
  action: PendingReaction,
  ctx: { stamina: number },
): { cueInput: PendingReaction | null; stance: DefensiveStance; stamina: number } {
  const unchanged = {
    cueInput: null as PendingReaction | null,
    stance: baseStance,
    stamina: ctx.stamina,
  };
  if (action === 'dodge' && ctx.stamina < DODGE_STAMINA_COST) return unchanged;
  if (!strike.claimReaction()) return unchanged;

  const stance =
    action === 'dodge'
      ? applyDefensiveAction(clearDefensiveStance(baseStance), 'dodge')
      : applyDefensiveAction(clearDefensiveStance(baseStance), 'shield_block');
  return {
    cueInput: action,
    stance,
    stamina: action === 'dodge' ? Math.max(0, ctx.stamina - DODGE_STAMINA_COST) : ctx.stamina,
  };
}

interface ImpactResult {
  evaded: boolean;
  missed: boolean;
  damage: number | null;
}

/**
 * The shipped strike-resolution order (`DuelScene.tsx`, `resolveImpact`):
 * the active-dodge evade roll first, then the hit roll, then the damage formula
 * with `isBlocked` taken from `defender.isBlocking`.
 */
function resolveImpactAgainst(
  defender: DefensiveStance,
  opts: {
    evadeRoll: number;
    hitRollPct: number;
    hitPct: number;
    weapon?: typeof DEFAULT_PLAYER_WEAPON;
  },
): ImpactResult {
  const weapon = opts.weapon ?? DEFAULT_PLAYER_WEAPON;
  const evaded = defender.isInvulnerable && opts.evadeRoll < SHIPPED_DODGE_RATE;
  if (evaded) return { evaded: true, missed: false, damage: null };
  if (opts.hitRollPct <= opts.hitPct) {
    return {
      evaded: false,
      missed: false,
      damage: calculateAttackDamage(
        weapon.damageLight,
        10,
        false,
        5,
        defender.isBlocking,
        weapon.blockReduction,
        1,
      ),
    };
  }
  return { evaded: false, missed: true, damage: null };
}

/** A clock the test advances by hand. Cleared callbacks stay fireable on purpose. */
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
    get live() {
      return scheduled.size;
    },
  };
}

// ── §A. Cue ↔ stance ↔ outcome ─────────────────────────────────────────────

describe('§A — the cue names the stance the impact actually reads', () => {
  test('the shipped dodge rate is still the one this suite models', () => {
    // Read from the resolution source, not copied: 75 % evade, 25 % land.
    expect(SHIPPED_DODGE_RATE).toBe(0.75);
    expect(SHIPPED_DODGE_RATE).toBeLessThan(1);
  });

  test('a Dodge cue sets exactly the stance the evade roll reads', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    strike.announce('quick_attack', () => {});
    const { cueInput, stance } = reactToPendingAttack(strike, 'dodge', { stamina: 60 });

    expect(cueInput).toBe('dodge');
    expect(resolveReactionCue(cueInput)!.kind).toBe('dodge');
    // The impact's evade reads isInvulnerable; a dodge must raise no shield.
    expect(stance.isInvulnerable).toBe(true);
    expect(stance.isBlocking).toBe(false);
  });

  test('a Shield Guard cue sets exactly the stance the block reduction reads', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    strike.announce('quick_attack', () => {});
    const { cueInput, stance } = reactToPendingAttack(strike, 'shield_block', { stamina: 60 });

    expect(cueInput).toBe('shield_block');
    expect(resolveReactionCue(cueInput)!.kind).toBe('shield_block');
    // The impact's damage formula reads isBlocking; a guard grants no evade.
    expect(stance.isBlocking).toBe(true);
    expect(stance.isInvulnerable).toBe(false);
  });

  test('a successful dodge causes no damage at all', () => {
    const dodgeStance: DefensiveStance = { isBlocking: false, isInvulnerable: true };
    // Every roll below the shipped rate evades, even against the best hit roll.
    for (const evadeRoll of [0, 0.1, 0.5, 0.7499]) {
      const result = resolveImpactAgainst(dodgeStance, { evadeRoll, hitRollPct: 0, hitPct: 95 });
      expect(result.evaded).toBe(true);
      expect(result.damage).toBeNull();
    }
  });

  test('a FAILED dodge lands at full force — the cue promises a chance, not an evade', () => {
    const dodgeStance: DefensiveStance = { isBlocking: false, isInvulnerable: true };
    const failed = resolveImpactAgainst(dodgeStance, { evadeRoll: 0.9, hitRollPct: 1, hitPct: 95 });
    const guardStance: DefensiveStance = { isBlocking: true, isInvulnerable: false };
    const guarded = resolveImpactAgainst(guardStance, { evadeRoll: 1, hitRollPct: 1, hitPct: 95 });

    expect(failed.evaded).toBe(false);
    expect(failed.damage).not.toBeNull();
    // No shield was raised, so no block reduction may be applied.
    expect(failed.damage!).toBeGreaterThan(guarded.damage!);

    // And the wording it was shown under never guarantees the evade.
    const label = resolveReactionCue('dodge')!.label.toLowerCase();
    expect(label).toContain('chance');
    for (const overclaim of ['guarantee', 'certain', 'always', 'will evade', 'immune', 'no damage']) {
      expect(label).not.toContain(overclaim);
    }
  });

  test('a Shield Guard strictly reduces the blow, for every equippable weapon', () => {
    const guardStance: DefensiveStance = { isBlocking: true, isInvulnerable: false };
    const openStance: DefensiveStance = { isBlocking: false, isInvulnerable: false };

    for (const weapon of ALL_WEAPONS) {
      const guarded = resolveImpactAgainst(guardStance, {
        evadeRoll: 1,
        hitRollPct: 1,
        hitPct: 95,
        weapon,
      });
      const open = resolveImpactAgainst(openStance, {
        evadeRoll: 1,
        hitRollPct: 1,
        hitPct: 95,
        weapon,
      });
      // "Reduced force" is a claim about a blow that lands: strictly less damage.
      expect(guarded.damage!).toBeLessThan(open.damage!);
      expect(guarded.damage!).toBeGreaterThanOrEqual(1);
    }

    // The guard's line is scoped to a landing blow and claims no evade.
    const label = resolveReactionCue('shield_block')!.label.toLowerCase();
    expect(label).toContain('reduced');
    for (const overclaim of ['dodge', 'immune', 'no damage', 'evade']) {
      expect(label).not.toContain(overclaim);
    }
  });

  test('one claim can never raise both stances at once', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    strike.announce('power_attack', () => {});
    reactToPendingAttack(strike, 'shield_block', { stamina: 60 });
    const second = reactToPendingAttack(strike, 'dodge', { stamina: 60 });

    // The second tap is refused outright, so it writes no stance and no cue.
    expect(second.cueInput).toBeNull();
    expect(second.stance).toEqual(baseStance);
    expect(second.stamina).toBe(60);
  });
});

// ── §B. One claim, one stance, one charge ──────────────────────────────────

describe('§B — repeated input and refusals leave the lifecycle consistent', () => {
  test('the announcement survives exactly one claim', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    strike.announce('quick_attack', () => {});

    expect(strike.claimReaction()).toBe(true);
    expect(strike.claimReaction()).toBe(false);
    expect(strike.claimReaction()).toBe(false);
    expect(strike.hasReacted).toBe(true);
    // A claim is a stance, not a resolution: the strike is still pending.
    expect(strike.pending).toBe('quick_attack');
  });

  test('an insufficient-stamina dodge is refused before the claim and announces nothing', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    strike.announce('power_attack', () => {});

    const refused = reactToPendingAttack(strike, 'dodge', { stamina: DODGE_STAMINA_COST - 1 });
    expect(refused.cueInput).toBeNull();
    expect(refused.stance).toEqual(baseStance);
    expect(refused.stamina).toBe(DODGE_STAMINA_COST - 1);
    // Nothing was spent, so the reaction is still available…
    expect(strike.hasReacted).toBe(false);

    // …and the other answer still works, which is the point of ordering it first.
    const guard = reactToPendingAttack(strike, 'shield_block', { stamina: DODGE_STAMINA_COST - 1 });
    expect(guard.cueInput).toBe('shield_block');
    expect(strike.hasReacted).toBe(true);
  });

  test('exactly the dodge cost is charged, once, and the guard is free', () => {
    const first = fakeTimer();
    const strikeA = createPendingStrike({ timer: first.timer });
    strikeA.announce('quick_attack', () => {});
    const dodge = reactToPendingAttack(strikeA, 'dodge', { stamina: 100 });
    expect(100 - dodge.stamina).toBe(DODGE_STAMINA_COST);

    const second = fakeTimer();
    const strikeB = createPendingStrike({ timer: second.timer });
    strikeB.announce('quick_attack', () => {});
    const guard = reactToPendingAttack(strikeB, 'shield_block', { stamina: 100 });
    expect(guard.stamina).toBe(100);

    // A refused repeat cannot bill a second time.
    const repeat = reactToPendingAttack(strikeA, 'dodge', { stamina: dodge.stamina });
    expect(repeat.stamina).toBe(dodge.stamina);
  });

  test('a dodge at exactly the cost is allowed (the boundary is not off by one)', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    strike.announce('quick_attack', () => {});
    const edge = reactToPendingAttack(strike, 'dodge', { stamina: DODGE_STAMINA_COST });
    expect(edge.cueInput).toBe('dodge');
    expect(edge.stamina).toBe(0);
  });
});

// ── §C. Cancellation across all three windows ──────────────────────────────

describe('§C — dropping a pending strike leaves nothing behind', () => {
  test('telegraph window: a cancel prevents the impact and frees the reaction', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    const impacts: string[] = [];
    strike.announce('quick_attack', (landing) => impacts.push(landing));

    expect(strike.cancel()).toBe(true);
    expect(strike.pending).toBeNull();
    expect(strike.hasReacted).toBe(false);
    expect(clock.live).toBe(0);

    clock.advance(ENEMY_ATTACK_WINDUP_MS * 2);
    expect(impacts).toEqual([]);
  });

  test('pending-strike window: a claimed reaction dies with the cancelled strike', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    const impacts: string[] = [];
    strike.announce('power_attack', (landing) => impacts.push(landing));
    expect(strike.claimReaction()).toBe(true);

    strike.cancel();
    expect(strike.hasReacted).toBe(false);
    // A settled or exited bout can never be answered any more.
    expect(strike.claimReaction()).toBe(false);
    clock.advance(ENEMY_ATTACK_WINDUP_MS * 2);
    expect(impacts).toEqual([]);
  });

  test('cancellation is idempotent and leaks no timer', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    strike.announce('quick_attack', () => {});

    expect(strike.cancel()).toBe(true);
    expect(strike.cancel()).toBe(false);
    expect(strike.cancel()).toBe(false);
    expect(clock.live).toBe(0);
  });

  test('delayed-impact window: a cancel after the impact resolves cannot resolve again', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    const impacts: string[] = [];
    strike.announce('quick_attack', (landing) => impacts.push(landing));

    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(impacts).toEqual(['quick_attack']);
    // The impact has fired; the controller holds nothing and a late cancel is a no-op.
    expect(strike.pending).toBeNull();
    expect(strike.cancel()).toBe(false);
    expect(strike.claimReaction()).toBe(false);
    clock.advance(ENEMY_ATTACK_WINDUP_MS * 3);
    expect(impacts).toEqual(['quick_attack']);
  });

  test('a cancelled then re-announced strike lands once, with the new action', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    const impacts: string[] = [];
    strike.announce('quick_attack', (landing) => impacts.push(landing));
    strike.cancel();
    strike.announce('power_attack', (landing) => impacts.push(landing));

    expect(clock.live).toBe(1);
    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(impacts).toEqual(['power_attack']);
  });

  test("the player's reaction evade never queues Valéria's counter", () => {
    // The reaction always answers an OPPONENT strike, so the attacker is not the
    // player: a player who evaded Valéria can never chain into another counter.
    expect(queuesCounterOnEvade(false, { bossMechanic: 'counter_dodge', dodgeChance: 0.4 })).toBe(
      false,
    );
    expect(queuesCounterOnEvade(true, { bossMechanic: 'counter_dodge', dodgeChance: 0.4 })).toBe(
      true,
    );
  });
});

// ── §D. The shipped wiring ─────────────────────────────────────────────────

describe('§D — the shipped scene keeps the lifecycle in step', () => {
  test('the reaction refusal order is stamina → claim → stance → cue', () => {
    const stamina = reactionBody.indexOf('player.stamina < DODGE_STAMINA_COST');
    const claim = reactionBody.indexOf('claimReaction()');
    const cue = reactionBody.indexOf('setReactionTaken(action)');
    const dodgeStance = reactionBody.indexOf(
      "applyDefensiveAction(clearDefensiveStance(prev), 'dodge')",
    );

    expect(stamina).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(stamina);
    expect(cue).toBeGreaterThan(claim);
    expect(dodgeStance).toBeGreaterThan(claim);
  });

  test('the reaction handler refuses to act in a settled bout', () => {
    // The latch check is the handler's first statement: no stamina, stance or
    // profile write can precede it.
    const guard = reactionBody.indexOf('if (isMatchOver.current) return;');
    const firstWrite = reactionBody.indexOf('setReactionTaken');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstWrite);
    expect(reactionBody).not.toContain('statsRef.current.goldEarned');
  });

  test('the impact clears the cue BEFORE it re-checks the latch and resolves', () => {
    const cueReset = impactBody.indexOf('setReactionTaken(null)');
    const latch = impactBody.indexOf('if (isMatchOver.current) return;');
    const resolve = impactBody.indexOf("executeTurnRef.current('opponent', landing)");

    expect(cueReset).toBeGreaterThan(-1);
    expect(latch).toBeGreaterThan(cueReset);
    expect(resolve).toBeGreaterThan(latch);
  });

  test('the canceller drops the strike, the cue and the reaction together', () => {
    const cancelBody = duelCode.slice(
      duelCode.indexOf('const cancelPendingEnemyAttack = useCallback('),
      duelCode.indexOf('const announceEnemyAttack = useCallback('),
    );
    expect(cancelBody).toContain('strikeRef.current?.cancel()');
    expect(cancelBody).toContain('setPendingEnemyAttack(null)');
    expect(cancelBody).toContain('setReactionTaken(null)');
  });

  test('both outcome branches cancel the strike, and an unmount cancels both controllers', () => {
    // Called from the victory branch and from the defeat branch.
    expect(duelCode.split('cancelPendingEnemyAttack();').length - 1).toBe(2);
    const unmount = duelSource.slice(
      duelSource.indexOf('// No blow may outlive the scene'),
      duelSource.indexOf('// OPPONENT AI TURN STRATEGY ENGINE'),
    );
    expect(unmount).toContain('clearTimeout(resolutionTimerRef.current)');
    expect(unmount).toContain('strikeRef.current?.cancel()');
    expect(unmount).toContain('playerStrikeRef.current?.cancel()');
  });

  test('the resolution still reads the two stances the cue names', () => {
    // The cue is only synchronised if these are the reads the impact performs.
    expect(duelCode).toContain('defender.isInvulnerable && Math.random() < 0.75');
    expect(duelCode).toContain('const isBlocked = defender.isBlocking;');
  });

  test('the HUD can only paint the cue while a strike is actually pending', () => {
    // Structural, not incidental: the cue lives inside `pendingEnemyAttack &&`.
    const gate = hudSource.indexOf('{pendingEnemyAttack && (');
    const cue = hudSource.indexOf('{reactionCue ? (');
    expect(gate).toBeGreaterThan(-1);
    expect(cue).toBeGreaterThan(gate);
    expect(hudSource.split('{reactionCue ? (').length - 1).toBe(1);
  });
});

// ── §E. The cue, rendered from the shipped HUD ─────────────────────────────

const fighter = (overrides: Record<string, unknown>) =>
  ({
    id: 'c8-79c',
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

function renderHud(opts: {
  pendingEnemyAttack: 'quick_attack' | 'power_attack' | null;
  reactionTaken: PendingReaction | null;
  playerStamina?: number;
}): string {
  return renderToStaticMarkup(
    React.createElement(CombatHUD, {
      player: fighter({
        id: 'p',
        name: 'Dimachaerus',
        isPlayer: true,
        stamina: opts.playerStamina ?? 60,
      }),
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
      pendingEnemyAttack: opts.pendingEnemyAttack,
      pendingPlayerAttack: null,
      reactionTaken: opts.reactionTaken,
      onReactToPendingAttack: () => {},
    }),
  );
}

describe('§E — the rendered cue cannot outlive its window', () => {
  test('a claimed reaction with no pending strike paints no cue at all', () => {
    // The "no stale reaction cue into a later turn" contract, observed on the
    // shipped component: the state is still set, the cue is not shown.
    const html = renderHud({ pendingEnemyAttack: null, reactionTaken: 'dodge' });
    expect(html).not.toContain('data-reaction-taken');
    expect(html).not.toContain('data-reaction-kind');
    expect(html).not.toContain('data-windup-cue');
    expect(html).not.toContain('data-reaction="dodge"');
  });

  test('the cue names the dodge that was spent, and offers no second answer', () => {
    const html = renderHud({ pendingEnemyAttack: 'power_attack', reactionTaken: 'dodge' });
    expect(html).toContain('data-reaction-kind="dodge"');
    expect(html.toLowerCase()).toContain('chance to slip the blow');
    // One reaction per announcement: the controls are gone.
    expect(html).not.toContain('data-reaction="dodge"');
    expect(html).not.toContain('data-reaction="shield_block"');
  });

  test('below the dodge cost the dodge control is disabled, so no claim can be misreported', () => {
    const html = renderHud({
      pendingEnemyAttack: 'quick_attack',
      reactionTaken: null,
      playerStamina: DODGE_STAMINA_COST - 1,
    });
    const dodgeButton = html.slice(html.indexOf('data-reaction="dodge"'));
    expect(dodgeButton.slice(0, 400)).toContain('disabled');
    // Nothing is claimed while the strike is unanswered.
    expect(html).not.toContain('data-reaction-taken');
  });
});
