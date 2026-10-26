/**
 * CF-5 — turn pacing by action weight.
 *
 * Run with: `bun test src/utils/duelTurnPacing.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the duration table as IMPLEMENTED — each `CombatActionType` resolves to
 *       its design value, the whole union is covered, the weight order holds,
 *       and a fight-ending turn resolves to 1600 whatever the action was;
 *   §B  the opponent's think time — 750 ms normally, 900 ms on the AI turn that
 *       follows a resolved telegraphed heavy, and back to 750 the turn after;
 *   §C  a full standard duel's total resolution time stays inside a sane bound
 *       against the old flat 1100 ms (the design allows roughly +8 % for
 *       power-heavy pacing, so growth is BOUNDED, not merely observed);
 *   §D  the pacing is presentation only: the table feeds no formula, the timer
 *       it scales still only resets, resets nothing on a killing turn and hands
 *       the turn over, and `combatCalculations.ts` knows nothing about it.
 *
 * The duration table and both resolvers are IMPORTED from `DuelScene` — the
 * module that owns the timer — so the values asserted here are the shipped ones
 * and not a restatement of them. The source checks read the same file to prove
 * the wiring order (the marker is read before the timer is scheduled and cleared
 * as the turn is taken), which a pure call cannot show.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { aiTurnDelayMs, turnResolutionMs } from '../components/duel/DuelScene';
import type { CombatActionType } from '../components/ui/TurnActionPanel';

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): string => readFileSync(join(SRC_DIR, path), 'utf8');
const duel = read('components/duel/DuelScene.tsx');

/** Source with comments removed, so prose can never satisfy (or defeat) a check. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** Every `.ts`/`.tsx` under src/, as repo-relative paths. */
const sourceFiles = (dir = SRC_DIR, prefix = ''): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full, `${prefix}${entry}/`);
    return /\.tsx?$/.test(entry) ? [`${prefix}${entry}`] : [];
  });

/** Every action the duel can resolve, in the union's own order. */
const ACTION_TYPES: CombatActionType[] = [
  'quick_attack',
  'power_attack',
  'shield_block',
  'dodge',
  'advance',
  'retreat',
  'taunt',
  'rest',
  'telegraph',
  'cast_net',
  // D-2 — the beast's crouch (a beast-hunt boss action that resolves nothing).
  'beast_crouch',
  // D-4 — the Cotta pair's Exposed recovery (also resolves nothing).
  'brothers_recovery',
];

/**
 * The design's table, written out as the specification this suite measures.
 * `cast_net` is absent from the CF-5 design (CH-3b's net postdates it), so a
 * Director ruling gave it the `quick_attack` weight — 880 ms — because the net
 * throw is an offensive action with a throw animation and a land/miss
 * resolution, not an 800 ms utility beat.
 */
const DESIGN_MS: Record<CombatActionType, number> = {
  quick_attack: 880,
  power_attack: 1300,
  telegraph: 1450,
  advance: 800,
  retreat: 800,
  shield_block: 800,
  dodge: 800,
  taunt: 800,
  rest: 800,
  cast_net: 880,
  // D-2 — a read, not a resolution: between the quick weight and the wind-up.
  beast_crouch: 1000,
  // D-4 — AUTHORED pacing: the pair's Exposed recovery is a read, so it takes the
  // same weight as the beast's crouch.
  brothers_recovery: 1000,
};

const DEATH_MS = 1600;
const AI_DELAY_MS = 750;
const AI_DELAY_AFTER_HEAVY_MS = 900;

// ── §A THE DURATION TABLE AS IMPLEMENTED ────────────────────────────────────
describe('CF-5 §A the duration table', () => {
  test('every action type resolves to its design value', () => {
    for (const actionType of ACTION_TYPES) {
      expect({ actionType, ms: turnResolutionMs(actionType) }).toEqual({
        actionType,
        ms: DESIGN_MS[actionType],
      });
    }
  });

  test('the table covers the whole action union and nothing is a fallback', () => {
    // Every id in the union has a row, and every row is a real, usable hold —
    // no `undefined` can reach `setTimeout` even for an action the design never
    // weighted (the net throw, which took the quick weight by Director ruling).
    // 10 through CH-3b's net throw; D-2's `beast_crouch` is the eleventh.
    // 11 through D-2's `beast_crouch`; D-4's `brothers_recovery` is the twelfth.
    expect(ACTION_TYPES.length).toBe(12);
    for (const actionType of ACTION_TYPES) {
      const ms = turnResolutionMs(actionType);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThan(0);
    }
    expect(new Set(ACTION_TYPES).size).toBe(ACTION_TYPES.length);
  });

  test('the weights are ordered light → heavy, with the death beat above all', () => {
    const utility = turnResolutionMs('advance');
    const quick = turnResolutionMs('quick_attack');
    const power = turnResolutionMs('power_attack');
    const telegraph = turnResolutionMs('telegraph');
    expect(utility).toBeLessThan(quick);
    expect(quick).toBeLessThan(power);
    expect(power).toBeLessThan(telegraph);
    expect(telegraph).toBeLessThan(DEATH_MS);
  });

  test('all six positional / defensive / utility actions share one 800 ms beat', () => {
    const utility: CombatActionType[] = [
      'advance',
      'retreat',
      'shield_block',
      'dodge',
      'taunt',
      'rest',
    ];
    expect(utility.map((a) => turnResolutionMs(a))).toEqual([800, 800, 800, 800, 800, 800]);
  });

  test('a fight-ending turn holds 1600 ms whatever the action was', () => {
    for (const actionType of ACTION_TYPES) {
      expect({ actionType, ms: turnResolutionMs(actionType, true) }).toEqual({
        actionType,
        ms: DEATH_MS,
      });
    }
    // …and the flag defaults to "the fight goes on", so an unchanged call site
    // keeps the action's own weight.
    expect(turnResolutionMs('quick_attack', false)).toBe(880);
    expect(turnResolutionMs('power_attack', false)).toBe(1300);
  });

  test('the resolution hold is independent of WHO acted', () => {
    // The resolver takes no actor: pacing is the action's weight, and the same
    // action holds the same time for the player and for the AI.
    expect(turnResolutionMs.length).toBeLessThanOrEqual(2); // (actionType, fightEnded = false)
    expect(turnResolutionMs('power_attack')).toBe(turnResolutionMs('power_attack', false));
  });
});

// ── §B THE OPPONENT'S THINK TIME ────────────────────────────────────────────
describe('CF-5 §B the AI delay', () => {
  test('750 ms normally, 900 ms after a resolved telegraphed heavy', () => {
    expect(aiTurnDelayMs(false)).toBe(AI_DELAY_MS);
    expect(aiTurnDelayMs(true)).toBe(AI_DELAY_AFTER_HEAVY_MS);
  });

  test('the longer beat is ONE turn: 900, then straight back to 750', () => {
    // The scene's marker is a boolean read once and cleared as the turn is
    // taken, so replaying that lifecycle is exactly this fold.
    let aftermath = true;
    const sequence: number[] = [];
    for (let turn = 0; turn < 3; turn += 1) {
      sequence.push(aiTurnDelayMs(aftermath));
      aftermath = false;
    }
    expect(sequence).toEqual([900, 750, 750]);
  });

  test('a fight that never telegraphs never waits longer than 750', () => {
    const sequence = Array.from({ length: 12 }, () => aiTurnDelayMs(false));
    expect(sequence).toEqual(Array.from({ length: 12 }, () => AI_DELAY_MS));
  });

  test('the marker is read before the timer is scheduled and cleared as it fires', () => {
    // Read at effect time…
    const read = duel.indexOf('const aiDelayMs = aiTurnDelayMs(telegraphAftermathRef.current);');
    const schedule = duel.indexOf('const aiTimer = setTimeout(() => {');
    expect(read).toBeGreaterThan(-1);
    expect(schedule).toBeGreaterThan(read);
    // …and cleared INSIDE the callback, before the AI chooses anything, so the
    // turn after it reads `false` and waits 750 again.
    const clear = duel.indexOf('telegraphAftermathRef.current = false;', schedule);
    const choose = duel.indexOf('const dist = Math.abs(player.position[2] - opp.position[2]);', schedule);
    expect(clear).toBeGreaterThan(schedule);
    expect(clear).toBeLessThan(choose);
    // The delay the timer actually uses is the resolved one, not a literal.
    expect(duel).toMatch(/\}, aiDelayMs\);/);
    expect(duel).not.toMatch(/\}, 750\);/);
  });

  test('only the telegraphed-heavy branch sets the marker', () => {
    // D-3 rebased this count, not weakened it: Varro's false telegraph resolves
    // from its own branch in the same AI effect, and it too has just spent a
    // full telegraph turn, so it takes the same longer beat.
    // D-4 rebased this count, not weakened it: the Cotta pair's Crossing heavy is
    // announced and resolved from its own branch in the same AI effect, and it has
    // just spent the same full telegraph turn, so it takes the same longer beat.
    expect(duel.match(/telegraphAftermathRef\.current = true;/g)?.length).toBe(3);
    const falseTelegraph = duel.indexOf("opponent.bossMechanic === 'false_telegraph' && pendingHeavyAttackRef.current");
    // D-4 — each resolution marker is asserted INSIDE its own branch, since the
    // Cotta pair's branch now precedes Varro's in the same effect.
    const falseSet = duel.indexOf('telegraphAftermathRef.current = true;', falseTelegraph);
    expect(falseTelegraph).toBeGreaterThan(-1);
    expect(falseSet).toBeGreaterThan(falseTelegraph);
    const heavy = duel.indexOf("opponent.bossMechanic === 'heavy_telegraph' && pendingHeavyAttackRef.current");
    const set = duel.indexOf('telegraphAftermathRef.current = true;', heavy);
    const landing = duel.indexOf('telegraphLandingRef.current = true;', heavy);
    // Set on the same resolution that takes the long hit-stop, one line after it.
    expect(set).toBeGreaterThan(landing);
    expect(set - landing).toBeLessThan(400);
    // The telegraph's ANNOUNCE branch does not set it — only its resolution does.
    const announce = duel.indexOf("else if (actionType === 'telegraph')");
    const castNet = duel.indexOf("else if (actionType === 'cast_net')");
    expect(announce).toBeGreaterThan(-1);
    expect(castNet).toBeGreaterThan(announce);
    expect(duel.slice(announce, castNet)).not.toContain('telegraphAftermathRef');
  });
});

// ── §C A FULL FIGHT'S TOTAL TIME STAYS WITHIN A SANE BOUND ──────────────────
describe('CF-5 §C full-fight duration', () => {
  const repeat = (actionType: CombatActionType, count: number): CombatActionType[] =>
    Array.from({ length: count }, () => actionType);

  /**
   * A standard non-boss duel: 24 turns (12 each side), and each side's mix is
   * the one the shipped AI ladder uses for an unconfigured opponent — roughly
   * `chooseAIStandardAction`'s 46 % quick / 26 % power / 18 % block / 10 %
   * dodge, rounded to whole turns.
   */
  const STANDARD_FIGHT: CombatActionType[] = [
    ...repeat('quick_attack', 6),
    ...repeat('power_attack', 3),
    ...repeat('shield_block', 2),
    ...repeat('dodge', 1),
    ...repeat('quick_attack', 6),
    ...repeat('power_attack', 3),
    ...repeat('shield_block', 2),
    ...repeat('dodge', 1),
  ];

  /** The power-heaviest mix a standard fight plausibly produces (5 of 12). */
  const POWER_HEAVY_FIGHT: CombatActionType[] = [
    ...repeat('power_attack', 5),
    ...repeat('quick_attack', 6),
    ...repeat('shield_block', 1),
    ...repeat('power_attack', 5),
    ...repeat('quick_attack', 6),
    ...repeat('shield_block', 1),
  ];

  /** A boss fight with Goliath's ~30 % telegraph rate and its heavy landings. */
  const TELEGRAPH_HEAVY_FIGHT: CombatActionType[] = [
    ...repeat('telegraph', 4),
    ...repeat('power_attack', 2),
    ...repeat('quick_attack', 6),
    ...repeat('telegraph', 4),
    ...repeat('power_attack', 2),
    ...repeat('quick_attack', 6),
  ];

  const totalHold = (turns: CombatActionType[]): number =>
    turns.reduce((sum, actionType) => sum + turnResolutionMs(actionType), 0);

  /** The AI's think time for a fight: 750 ms a turn, +150 on an aftermath turn. */
  const totalAiDelay = (turns: CombatActionType[], telegraphResolutions: number): number => {
    const aiTurns = turns.length / 2;
    return aiTurns * AI_DELAY_MS + telegraphResolutions * (AI_DELAY_AFTER_HEAVY_MS - AI_DELAY_MS);
  };

  const growth = (turns: CombatActionType[]): number => totalHold(turns) / (turns.length * 1100);

  test('the standard duel is FASTER than the old flat 1100 ms, and bounded either way', () => {
    const before = STANDARD_FIGHT.length * 1100;
    const after = totalHold(STANDARD_FIGHT);
    expect(STANDARD_FIGHT.length).toBe(24);
    expect(before).toBe(26400);
    expect(after).toBe(23160);
    // A bound in both directions: the pacing may not run away from the old value
    // in either direction — this is a re-weighting, not a new speed of game.
    expect(growth(STANDARD_FIGHT)).toBeGreaterThan(0.85);
    expect(growth(STANDARD_FIGHT)).toBeLessThanOrEqual(1.08);
  });

  test('the power-heaviest standard mix still grows by no more than the ~8 % design allows', () => {
    // The design's own note: longer power turns slow overall fight pace ~8 %.
    // That is a CEILING for a plausible standard fight, not a target.
    const g = growth(POWER_HEAVY_FIGHT);
    expect(g).toBeGreaterThan(0.9);
    expect(g).toBeLessThanOrEqual(1.08);
    expect(totalHold(POWER_HEAVY_FIGHT)).toBeLessThanOrEqual(
      POWER_HEAVY_FIGHT.length * 1100 * 1.08,
    );
  });

  test('a telegraph-heavy boss fight, aftermath beats included, stays inside the same bound', () => {
    const holds = totalHold(TELEGRAPH_HEAVY_FIGHT);
    const delays = totalAiDelay(TELEGRAPH_HEAVY_FIGHT, 8); // 8 telegraph resolutions
    const before = TELEGRAPH_HEAVY_FIGHT.length * 1100 + totalAiDelay(TELEGRAPH_HEAVY_FIGHT, 0);
    const after = holds + delays;
    expect(after / before).toBeLessThanOrEqual(1.08);
    // The telegraph is the longest beat in the game, so this is the widest the
    // hand-off can stretch a fight without a death.
    expect(holds / (TELEGRAPH_HEAVY_FIGHT.length * 1100)).toBeGreaterThan(1);
  });

  test('a standard duel’s whole hand-off stays under 45 s of turn pacing', () => {
    const total = totalHold(STANDARD_FIGHT) + totalAiDelay(STANDARD_FIGHT, 0);
    expect(total).toBe(32160);
    expect(total).toBeLessThan(45000);
    // The old pacing was also inside the bound — this is a pacing change, not a
    // fix for a broken duration.
    expect(STANDARD_FIGHT.length * 1100 + 12 * AI_DELAY_MS).toBe(35400);
  });

  test('no single turn can exceed the longest design beat without a death', () => {
    for (const actionType of ACTION_TYPES) {
      expect(turnResolutionMs(actionType)).toBeLessThanOrEqual(1450);
    }
    const worstFight = Array.from({ length: 24 }, () => 'telegraph' as CombatActionType);
    expect(totalHold(worstFight)).toBeLessThanOrEqual(24 * 1450);
  });
});

// ── §D THE PACING IS PRESENTATION, NOT GAME LOGIC ───────────────────────────
describe('CF-5 §D the timing seam is the only thing that moved', () => {
  test('the resolution timer is scheduled from the table, exactly once', () => {
    expect(duel.match(/\}, turnResolutionMs\(actionType, fightEnded\)\);/g)?.length).toBe(1);
    // The old fixed hold is no longer a timer argument anywhere, and no 1100 ms
    // literal survives in the scene at all — `cast_net` now carries 880.
    expect(duel).not.toMatch(/\}, 1100\);/);
    expect(duel.match(/turnResolutionMs\(/g)?.length).toBe(1); // the one call site
  });

  test('the timer still only resets the animations and hands the turn over', () => {
    const schedule = duel.indexOf('}, turnResolutionMs(actionType, fightEnded));');
    const open = duel.lastIndexOf('setTimeout(() => {', schedule);
    const body = duel.slice(open, schedule);
    expect(body).toMatch(/setIsExecuting\(false\);/);
    expect(body).toMatch(/setIsPlayerTurn\(!isActorPlayer\);/);
    expect(body).toMatch(/action: 'idle'/);
    // A killing turn still returns before the turn is toggled.
    expect(body).toMatch(/if \(opp\.health <= 0 \|\| player\.health <= 0\) \{\s*return;/);
  });

  test('the fight-ended reading is a read of the damage arithmetic, never a write', () => {
    // One declaration and exactly two reads — each the same subtraction the
    // damage branches apply (the main blow, then the optional twin).
    expect(duel.match(/let fightEnded = false;/g)?.length).toBe(1);
    expect(duel.match(/fightEnded = defender\.health/g)?.length).toBe(1);
    expect(duel.match(/fightEnded = fightEnded \|\|/g)?.length).toBe(1);
    expect(duel).toMatch(/fightEnded = defender\.health - rawDamage <= 0;/);
    expect(duel).toMatch(/fightEnded = fightEnded \|\| defender\.health - rawDamage - bonusDamage <= 0;/);
    // It never writes health, stamina or any outcome of its own.
    expect(duel).not.toMatch(/fightEnded[^\n]*health\s*:/);
    expect(duel).not.toMatch(/setPlayer\([^)]*fightEnded/);
  });

  test('the damage formula module knows nothing about turn pacing', () => {
    const calculations = read('utils/combatCalculations.ts');
    expect(calculations).not.toMatch(/turnResolution|TURN_RESOLUTION|aiTurnDelay|fightEnded/);
    expect(calculations).not.toMatch(/1100/);
  });

  test('no other scene or module schedules a duel resolution', () => {
    // The table lives in the duel scene and is consumed there; the two helpers
    // are exported for this suite, not for a second timing system — so a repo
    // sweep finds exactly the scene and this suite, comments stripped.
    const named = sourceFiles()
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .filter((file) => /turnResolutionMs|aiTurnDelayMs/.test(code(read(file))));
    expect(named).toEqual(['components/duel/DuelScene.tsx']);
  });
});
