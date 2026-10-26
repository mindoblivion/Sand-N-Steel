/**
 * Phase C-8.70C (Slice C-D) — boss phases and explainable defeats.
 *
 * Pins, in order of the staged prompt:
 *   §A  Phase 1 reproduces today's behaviour for all four bosses.
 *   §B  The 50 % threshold; the transition fires once and NEVER interrupts a
 *       telegraphed action in flight (addendum D).
 *   §C  The telegraph floor, at every boss / phase / mode.
 *   §D  The AUTHORED Phase 2 values, anchored to each boss's base row.
 *   §E  "Why you fell" from synthetic logs, boss and non-boss.
 *   §F  Boss-only gating (no mechanic reachable from a non-boss).
 *   §G  The engine wiring the above relies on.
 *
 * Run with: bun test src/utils/phaseC8_70c.test.ts  (and repo-wide `bun test`)
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_OPPONENTS } from '../data/opponents';
import { OpponentConfig } from '../types/game';
import {
  AURELIUS_PHASE1_RAGE_THRESHOLD,
  AURELIUS_PHASE2_RAGE_THRESHOLD,
  BOSS_PHASE_HP_THRESHOLD,
  GOLIATH_PHASE1_TELEGRAPH_CHANCE,
  IGNIS_PHASE2_AGGRESSION_DELTA,
  IGNIS_PHASE2_BLOCK_CHANCE_DELTA,
  TELEGRAPH_FLOOR_SECONDS,
  VALERIA_PHASE1_COUNTER_WINDOW_TURNS,
  VALERIA_PHASE2_COUNTER_WINDOW_TURNS,
  bossPhaseForHealth,
  bossPhaseParams,
  clampTelegraphSeconds,
  nextBossPhase,
} from '../data/bossPhases';
import { shouldActivateRage } from './combatCalculations';
import {
  WHY_YOU_FELL_MAX_LINES,
  buildWhyYouFell,
  countActionMix,
  dominantClassOfMix,
  formatDuelClock,
  type DuelCombatEvent,
} from './duelBreakdown';

const bosses = ALL_OPPONENTS.filter((o) => o.isBoss === true);
const nonBosses = ALL_OPPONENTS.filter((o) => o.isBoss !== true);

const bossById = (id: string): OpponentConfig => {
  const found = ALL_OPPONENTS.find((o) => o.id === id);
  if (!found) throw new Error(`missing opponent ${id}`);
  return found;
};

const GOLIATH = bossById('opp_goliath_boss');
const IGNIS = bossById('opp_ignis_boss');
const VALERIA = bossById('opp_valeria_boss');
const AURELIUS = bossById('opp_aurelius_boss');

const src = (path: string) =>
  readFileSync(path.startsWith('/') ? path : join(process.cwd(), path), 'utf8');
/** Comments stripped, so prose can never satisfy (or defeat) a check. */
const code = (path: string) =>
  src(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

// ── §A Phase 1 is today's behaviour ────────────────────────────────────────

describe('C-8.70C §A — Phase 1 reproduces the shipped behaviour', () => {
  test('the 50 % phase threshold is the prompt\'s default', () => {
    expect(BOSS_PHASE_HP_THRESHOLD).toBe(0.5);
  });

  test('Goliath Phase 1: the shipped 0.30 telegraph rate, no chain', () => {
    const p1 = bossPhaseParams(GOLIATH, 1);
    expect(p1).not.toBeNull();
    expect(GOLIATH_PHASE1_TELEGRAPH_CHANCE).toBe(0.3);
    expect(p1!.heavyTelegraphChance).toBe(0.3);
    expect(p1!.heavyChain).toBe(false);
    // Phase 1 exposes no other mechanic's parameter.
    expect(p1!.aggression).toBeUndefined();
    expect(p1!.counterWindowTurns).toBeUndefined();
    expect(p1!.rageThreshold).toBeUndefined();
  });

  test('Ignis Phase 1: his own published base row and base weapon', () => {
    const p1 = bossPhaseParams(IGNIS, 1)!;
    expect(p1.weaponType).toBe(IGNIS.weaponType);
    expect(p1.weaponType).toBe('dual_blades');
    expect(p1.aggression).toBe(IGNIS.aggression);
    expect(p1.aggression).toBe(0.85);
    expect(p1.blockChance).toBe(IGNIS.blockChance);
    expect(p1.blockChance).toBe(0.45);
  });

  test('Valéria Phase 1: her own passive dodge and a single counter', () => {
    const p1 = bossPhaseParams(VALERIA, 1)!;
    expect(p1.passiveDodgeChance).toBe(VALERIA.dodgeChance);
    expect(p1.passiveDodgeChance).toBe(0.75);
    expect(VALERIA_PHASE1_COUNTER_WINDOW_TURNS).toBe(1);
    expect(p1.counterWindowTurns).toBe(1);
  });

  test('Aurelius Phase 1: rage at 50 % HP, exactly as shouldActivateRage has always fired', () => {
    const p1 = bossPhaseParams(AURELIUS, 1)!;
    expect(AURELIUS_PHASE1_RAGE_THRESHOLD).toBe(0.5);
    expect(p1.rageThreshold).toBe(0.5);
    // The shipped function's own default is the same threshold.
    expect(shouldActivateRage('rage_mode_colossus', 240, 480, false)).toBe(true);
    expect(shouldActivateRage('rage_mode_colossus', 241, 480, false)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', 240, 480, false, p1.rageThreshold)).toBe(true);
  });

  test('every boss starts in Phase 1 at full health', () => {
    for (const boss of bosses) {
      expect(bossPhaseForHealth(boss, boss.stats.healthMax, boss.stats.healthMax)).toBe(1);
    }
  });
});

// ── §B Threshold and the transition rule ───────────────────────────────────

describe('C-8.70C §B — phase threshold transitions', () => {
  test('Phase 2 begins at or below 50 %, and not above it', () => {
    const max = AURELIUS.stats.healthMax; // 480
    expect(bossPhaseForHealth(AURELIUS, max, max)).toBe(1);
    expect(bossPhaseForHealth(AURELIUS, 241, max)).toBe(1);
    expect(bossPhaseForHealth(AURELIUS, 240, max)).toBe(2);
    expect(bossPhaseForHealth(AURELIUS, 1, max)).toBe(2);
  });

  test('unusable HP, a dead boss, a non-boss and a mechanic-less boss all stay in Phase 1', () => {
    expect(bossPhaseForHealth(AURELIUS, 0, 480)).toBe(1);
    expect(bossPhaseForHealth(AURELIUS, NaN, 480)).toBe(1);
    expect(bossPhaseForHealth(AURELIUS, 100, 0)).toBe(1);
    for (const opponent of nonBosses) {
      expect(bossPhaseForHealth(opponent, 1, opponent.stats.healthMax)).toBe(1);
    }
    expect(bossPhaseForHealth({ isBoss: true }, 1, 100)).toBe(1);
  });

  test('the transition fires once and never regresses', () => {
    const open = { isExecuting: false, telegraphInFlight: false };
    expect(nextBossPhase(1, GOLIATH, 170, 170, open)).toBe(1);
    const afterCrossing = nextBossPhase(1, GOLIATH, 80, 170, open);
    expect(afterCrossing).toBe(2);
    // A second evaluation cannot fire again, and HP only falls from here.
    expect(nextBossPhase(afterCrossing, GOLIATH, 80, 170, open)).toBe(2);
    expect(nextBossPhase(2, GOLIATH, 10, 170, open)).toBe(2);
    // A boss that is somehow back above the threshold does not regress.
    expect(nextBossPhase(2, GOLIATH, 170, 170, open)).toBe(2);
  });

  test('ADDENDUM D — a phase transition never interrupts a telegraphed action in flight', () => {
    // Mid-resolution: hold Phase 1.
    expect(nextBossPhase(1, GOLIATH, 80, 170, { isExecuting: true, telegraphInFlight: false })).toBe(1);
    // A wind-up already announced: hold Phase 1 until it lands.
    expect(nextBossPhase(1, GOLIATH, 80, 170, { isExecuting: false, telegraphInFlight: true })).toBe(1);
    // Both, same answer.
    expect(nextBossPhase(1, GOLIATH, 80, 170, { isExecuting: true, telegraphInFlight: true })).toBe(1);
    // Once the action is finished, the phase turns.
    expect(nextBossPhase(1, GOLIATH, 80, 170, { isExecuting: false, telegraphInFlight: false })).toBe(2);
    // Every boss obeys the same gate.
    for (const boss of bosses) {
      const half = boss.stats.healthMax * 0.4;
      expect(
        nextBossPhase(1, boss, half, boss.stats.healthMax, { isExecuting: false, telegraphInFlight: true }),
      ).toBe(1);
    }
  });
});

// ── §C The telegraph floor ─────────────────────────────────────────────────

describe('C-8.70C §C — the telegraph floor holds in every boss, phase and mode', () => {
  test('the floor is the prompt\'s 0.8 s and is defined once', () => {
    expect(TELEGRAPH_FLOOR_SECONDS).toBe(0.8);
    const hits = walk(join(process.cwd(), 'src'))
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) => /export const TELEGRAPH_FLOOR_SECONDS/.test(readFileSync(file, 'utf8')));
    expect(hits).toHaveLength(1);
    expect(hits[0].endsWith(join('data', 'bossPhases.ts'))).toBe(true);
  });

  test('clamp: a telegraph may be set TO the floor, never below it', () => {
    expect(clampTelegraphSeconds(TELEGRAPH_FLOOR_SECONDS)).toBe(TELEGRAPH_FLOOR_SECONDS);
    expect(clampTelegraphSeconds(0.79)).toBe(TELEGRAPH_FLOOR_SECONDS);
    expect(clampTelegraphSeconds(0.4)).toBe(TELEGRAPH_FLOOR_SECONDS);
    expect(clampTelegraphSeconds(0)).toBe(TELEGRAPH_FLOOR_SECONDS);
    expect(clampTelegraphSeconds(-3)).toBe(TELEGRAPH_FLOOR_SECONDS);
    expect(clampTelegraphSeconds(NaN)).toBe(TELEGRAPH_FLOOR_SECONDS);
    expect(clampTelegraphSeconds(Infinity)).toBe(TELEGRAPH_FLOOR_SECONDS);
    expect(clampTelegraphSeconds(1.4)).toBe(1.4);
  });

  test('every telegraph parameter of every boss in every phase resolves at or above the floor', () => {
    for (const boss of bosses) {
      for (const phase of [1, 2] as const) {
        const params = bossPhaseParams(boss, phase);
        expect(params).not.toBeNull();
        expect(params!.telegraphSeconds).toBeGreaterThanOrEqual(TELEGRAPH_FLOOR_SECONDS);
        expect(params!.telegraphSeconds).toBe(clampTelegraphSeconds(params!.telegraphSeconds));
      }
    }
  });

  test('Goliath\'s chained second heavy lands at the same full telegraph duration', () => {
    const p1 = bossPhaseParams(GOLIATH, 1)!;
    const p2 = bossPhaseParams(GOLIATH, 2)!;
    expect(p2.telegraphSeconds).toBe(p1.telegraphSeconds);
    expect(p1.telegraphSeconds).toBeGreaterThanOrEqual(TELEGRAPH_FLOOR_SECONDS);
  });
});

// ── §D Phase 2 intensifies the signature mechanic only ─────────────────────

describe('C-8.70C §D — Phase 2 values, anchored and flagged', () => {
  test('Goliath Phase 2 chains the heavy and adds no new number', () => {
    const p1 = bossPhaseParams(GOLIATH, 1)!;
    const p2 = bossPhaseParams(GOLIATH, 2)!;
    expect(p1.heavyChain).toBe(false);
    expect(p2.heavyChain).toBe(true);
    expect(p2.heavyTelegraphChance).toBe(p1.heavyTelegraphChance);
    expect(p2.telegraphSeconds).toBe(p1.telegraphSeconds);
  });

  test('AUTHORED — Ignis Phase 2 row is his base row shifted, plus the mace', () => {
    const p2 = bossPhaseParams(IGNIS, 2)!;
    expect(p2.weaponType).toBe(IGNIS.phase2WeaponType);
    expect(p2.weaponType).toBe('mace');
    expect(p2.aggression).toBeCloseTo(Math.min(1, IGNIS.aggression + IGNIS_PHASE2_AGGRESSION_DELTA), 10);
    expect(p2.blockChance).toBeCloseTo(
      Math.max(0, IGNIS.blockChance + IGNIS_PHASE2_BLOCK_CHANCE_DELTA),
      10,
    );
    // The two published rows, measured: base 0.85 / 0.45 → authored 0.95 / 0.30.
    expect(p2.aggression).toBeCloseTo(0.95, 10);
    expect(p2.blockChance).toBeCloseTo(0.3, 10);
  });

  test('AUTHORED — Valéria Phase 2 widens her counter window', () => {
    const p1 = bossPhaseParams(VALERIA, 1)!;
    const p2 = bossPhaseParams(VALERIA, 2)!;
    expect(p2.counterWindowTurns).toBe(VALERIA_PHASE2_COUNTER_WINDOW_TURNS);
    expect(p2.counterWindowTurns!).toBeGreaterThan(p1.counterWindowTurns!);
    // Her counter's damage source is her existing attack — no new damage field.
    expect(JSON.stringify(p2)).not.toContain('damage');
  });

  test('AUTHORED — Aurelius Phase 2 lowers his rage threshold (rage arrives sooner)', () => {
    const p2 = bossPhaseParams(AURELIUS, 2)!;
    expect(p2.rageThreshold).toBe(AURELIUS_PHASE2_RAGE_THRESHOLD);
    expect(p2.rageThreshold!).toBeGreaterThan(AURELIUS_PHASE1_RAGE_THRESHOLD);
    const max = AURELIUS.stats.healthMax;
    // At 70 % HP: no rage in Phase 1, rage in Phase 2.
    expect(shouldActivateRage('rage_mode_colossus', max * 0.7, max, false, 0.5)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', max * 0.7, max, false, p2.rageThreshold)).toBe(true);
  });

  test('every Phase 2 constant that the prompt does not publish is flagged AUTHORED', () => {
    const source = src('src/data/bossPhases.ts');
    for (const name of [
      'IGNIS_PHASE2_AGGRESSION_DELTA',
      'IGNIS_PHASE2_BLOCK_CHANCE_DELTA',
      'VALERIA_PHASE2_COUNTER_WINDOW_TURNS',
      'AURELIUS_PHASE2_RAGE_THRESHOLD',
    ]) {
      const index = source.indexOf(`export const ${name}`);
      expect(index).toBeGreaterThan(-1);
      // The doc block immediately above the constant says AUTHORED.
      const before = source.slice(Math.max(0, index - 900), index);
      expect(before).toContain('AUTHORED');
    }
    // The three the prompt leaves entirely open also say, in words, that they
    // are not design values.
    for (const name of [
      'IGNIS_PHASE2_AGGRESSION_DELTA',
      'VALERIA_PHASE2_COUNTER_WINDOW_TURNS',
      'AURELIUS_PHASE2_RAGE_THRESHOLD',
    ]) {
      const index = source.indexOf(`export const ${name}`);
      // Normalized so a comment's line wrapping cannot hide the phrase.
      const before = source
        .slice(Math.max(0, index - 900), index)
        .replace(/\s*\*\s*/g, ' ')
        .replace(/\s+/g, ' ');
      expect(before).toContain('NOT a design value');
    }
    // The published Phase 1 values are NOT flagged as authored.
    const phase1Index = source.indexOf('export const GOLIATH_PHASE1_TELEGRAPH_CHANCE');
    const phase1Block = source.slice(Math.max(0, phase1Index - 400), phase1Index);
    expect(phase1Block).toContain('shipped');
    expect(phase1Block).not.toContain('AUTHORED');
  });
});

// ── §E Why you fell ────────────────────────────────────────────────────────

const ev = (
  actor: 'player' | 'opponent',
  action: DuelCombatEvent['action'],
  outcome: DuelCombatEvent['outcome'],
  damage = 0,
  atSeconds = 10,
  mechanic?: DuelCombatEvent['mechanic'],
): DuelCombatEvent => ({ actor, action, outcome, damage, atSeconds, mechanic });

describe('C-8.70C §E — "why you fell" from synthetic logs', () => {
  test('a boss defeat names the signed heavy mechanic with a plausible total', () => {
    const events: DuelCombatEvent[] = [
      ev('opponent', 'heavy_slam', 'landed', 82, 12, 'heavy_telegraph'),
      ev('opponent', 'heavy_slam', 'landed', 71, 26, 'heavy_telegraph'),
      ev('opponent', 'heavy_slam', 'landed', 61, 38, 'heavy_telegraph'),
      ev('opponent', 'quick_attack', 'landed', 14, 8),
      ev('player', 'power_attack', 'blocked', 3, 6),
      ev('player', 'power_attack', 'blocked', 3, 20),
      ev('player', 'quick_attack', 'landed', 12, 30),
    ];
    const lines = buildWhyYouFell({
      opponentName: 'Goliath the Pit Behemoth',
      isBoss: true,
      events,
      crowdPeak: 78,
      crowdTurnedAtSeconds: null,
    });
    expect(lines.length).toBeLessThanOrEqual(WHY_YOU_FELL_MAX_LINES);
    expect(lines[0]).toContain('heavy slam');
    expect(lines[0]).toContain('214');
    expect(lines[0]).toContain('3 times');
    // The heavy IS the top damage class, so the mechanic is folded in once.
    expect(lines.filter((line) => line.includes('heavy slam')).length).toBe(1);
    // The player's most-used action is the power attack, and both met his block.
    expect(lines[lines.length - 1]).toContain('power attacks');
    expect(lines[lines.length - 1]).toContain('met his block 2 times');
  });

  test('a mechanic that landed but is not the top damage class gets its own line', () => {
    const events: DuelCombatEvent[] = [
      ev('opponent', 'quick_attack', 'landed', 40, 10, 'rage_mode_colossus'),
      ev('opponent', 'quick_attack', 'landed', 40, 18, 'rage_mode_colossus'),
      ev('opponent', 'counter', 'landed', 20, 22, 'counter_dodge'),
      ev('player', 'quick_attack', 'landed', 15, 12),
    ];
    const lines = buildWhyYouFell({
      opponentName: 'Aurelius the Invincible Titan',
      isBoss: true,
      events,
      crowdPeak: 90,
      crowdTurnedAtSeconds: null,
    });
    expect(lines[0]).toContain('quick strike');
    expect(lines[0]).toContain('80');
    expect(lines[1]).toContain('rage');
    expect(lines[1]).toContain('landed 2 times');
    expect(lines.length).toBeLessThanOrEqual(WHY_YOU_FELL_MAX_LINES);
  });

  test('a non-boss defeat never shows a mechanic line', () => {
    const events: DuelCombatEvent[] = [
      ev('opponent', 'quick_attack', 'landed', 30, 9),
      ev('opponent', 'quick_attack', 'landed', 30, 15),
      // Even a stray mechanic tag cannot produce the line off a non-boss.
      ev('opponent', 'heavy_slam', 'landed', 25, 20, 'heavy_telegraph'),
      ev('player', 'quick_attack', 'missed', 0, 12),
    ];
    const lines = buildWhyYouFell({
      opponentName: 'Marcus the Rookie',
      isBoss: false,
      events,
      crowdPeak: 20,
      crowdTurnedAtSeconds: null,
    });
    expect(lines.some((line) => line.includes('landed'))).toBe(false);
    expect(lines.some((line) => line.includes('never warmed'))).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(WHY_YOU_FELL_MAX_LINES);
  });

  test('the crowd turning is reported at its own clock reading', () => {
    const lines = buildWhyYouFell({
      opponentName: 'Goliath the Pit Behemoth',
      isBoss: true,
      events: [ev('opponent', 'quick_attack', 'landed', 40, 10), ev('player', 'dodge', 'none', 0, 12)],
      crowdPeak: 62,
      crowdTurnedAtSeconds: 41,
    });
    expect(lines).toContain('The crowd turned cold at 0:41.');
  });

  test('four candidate items are capped at three lines', () => {
    const events: DuelCombatEvent[] = [
      ev('opponent', 'quick_attack', 'landed', 45, 10, 'rage_mode_colossus'),
      ev('opponent', 'counter', 'landed', 30, 20, 'counter_dodge'),
      ev('opponent', 'counter', 'landed', 30, 25, 'counter_dodge'),
      ev('player', 'shield_block', 'none', 0, 12),
      ev('player', 'shield_block', 'none', 0, 22),
    ];
    const lines = buildWhyYouFell({
      opponentName: 'Valéria the Viper Queen',
      isBoss: true,
      events,
      crowdPeak: 30,
      crowdTurnedAtSeconds: 18,
    });
    expect(lines).toHaveLength(WHY_YOU_FELL_MAX_LINES);
    // The counters dealt the most damage (60), so they lead.
    expect(lines[0]).toContain("counter dealt 60 of the damage");
    // Top mechanic is the counter too (2 landed vs the rage's 1), and it is not
    // the heavy, so it earns its own line rather than being folded away.
    expect(lines[1]).toContain('counter landed 2 times');
    expect(lines[2]).toContain('The crowd turned cold at 0:18.');
    // The player's line is what the cap drops, and it is the fourth item.
    expect(lines.some((line) => line.includes('shield blocks'))).toBe(false);
  });

  test('an empty log yields no lines, and every attack outcome is recorded honestly', () => {
    expect(buildWhyYouFell({ opponentName: 'Nobody', isBoss: false, events: [], crowdPeak: 25, crowdTurnedAtSeconds: null })).toEqual([]);
    const lines = buildWhyYouFell({
      opponentName: 'Goliath the Pit Behemoth',
      isBoss: true,
      events: [
        ev('opponent', 'heavy_slam', 'evaded', 0, 10, 'heavy_telegraph'),
        ev('opponent', 'heavy_slam', 'missed', 0, 20, 'heavy_telegraph'),
        ev('player', 'quick_attack', 'out_of_range', 0, 12),
      ],
      crowdPeak: 55,
      crowdTurnedAtSeconds: null,
    });
    // No damage and no landed mechanic → only the player's mix remains.
    expect(lines).toEqual(['Your quick attacks were your most-used action (1 time).']);
  });

  test('the mix counter and its dominant class are the single definition of "most-used"', () => {
    const events: DuelCombatEvent[] = [
      ev('player', 'quick_attack', 'landed', 5),
      ev('player', 'quick_attack', 'landed', 5),
      ev('player', 'power_attack', 'landed', 9),
      ev('opponent', 'quick_attack', 'landed', 5),
    ];
    const mix = countActionMix(events, 'player');
    expect(mix).toEqual({ quick_attack: 2, power_attack: 1 });
    expect(dominantClassOfMix(mix)).toBe('quick_attack');
    // Ties resolve deterministically by the canonical order.
    expect(dominantClassOfMix({ power_attack: 2, quick_attack: 2 })).toBe('quick_attack');
    expect(dominantClassOfMix({})).toBeNull();
    expect(formatDuelClock(41)).toBe('0:41');
    expect(formatDuelClock(125)).toBe('2:05');
  });

  test('the dominant-class computation exists exactly once in the shipped source', () => {
    const hits = walk(join(process.cwd(), 'src'))
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) => /export function dominantClassOfMix/.test(readFileSync(file, 'utf8')));
    expect(hits).toHaveLength(1);
    expect(hits[0].endsWith(join('utils', 'duelBreakdown.ts'))).toBe(true);
  });
});

// ── §F Boss-only gating ────────────────────────────────────────────────────

describe('C-8.70C §F — boss mechanics stay on isBoss opponents', () => {
  test('every opponent carrying a bossMechanic is a boss', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.bossMechanic) expect(opponent.isBoss).toBe(true);
    }
    expect(bosses).toHaveLength(4);
    expect(nonBosses.length).toBeGreaterThan(0);
  });

  test('bossPhaseParams refuses every non-boss in every phase', () => {
    for (const opponent of nonBosses) {
      expect(bossPhaseParams(opponent, 1)).toBeNull();
      expect(bossPhaseParams(opponent, 2)).toBeNull();
    }
    expect(nonBosses.some((o) => o.bossMechanic)).toBe(false);
  });

  test('every boss resolves parameters in both phases', () => {
    for (const boss of bosses) {
      expect(bossPhaseParams(boss, 1)).not.toBeNull();
      expect(bossPhaseParams(boss, 2)).not.toBeNull();
    }
  });

  test('`bossMechanic:` is assigned only in the opponent roster (grep-assert)', () => {
    const assigners = walk(join(process.cwd(), 'src'))
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) => /\bbossMechanic:\s*['"]/.test(code(file)))
      .map((file) => file.replace(process.cwd() + '/', ''));
    expect(assigners).toEqual(['src/data/opponents.ts']);
  });
});

// ── §G Engine wiring ──────────────────────────────────────────────────────

describe('C-8.70C §G — the engine wiring the checks above rely on', () => {
  const duel = code('src/components/duel/DuelScene.tsx');

  test('DuelScene reads the phase table and the single transition rule', () => {
    expect(duel).toContain('nextBossPhase(');
    expect(duel).toContain('bossPhaseParams(');
    expect(duel).toContain("from '../../data/bossPhases'");
    expect(duel).toContain('TELEGRAPH_FLOOR_SECONDS');
  });

  test('the transition is gated on isExecuting and on a telegraph in flight', () => {
    expect(duel).toMatch(/telegraphInFlight\s*=/);
    expect(duel).toContain('isExecuting,');
    expect(duel).toMatch(/nextBossPhase\(bossPhase,[\s\S]{0,160}isExecuting/);
  });

  test('the floored telegraph duration is applied at the point of use', () => {
    expect(duel).toMatch(/telegraphSeconds\s*\?\?\s*TELEGRAPH_FLOOR_SECONDS/);
    expect(duel).toMatch(/aiDelayMs = telegraphInFlight[\s\S]{0,220}TELEGRAPH_FLOOR_SECONDS/);
    expect(duel).toContain('}, aiDelayMs);');
    // No bare 750 ms literal is left for the telegraph's own landing delay.
    expect(duel).not.toContain('}, 750);');
  });

  test('the defeat breakdown is computed from the in-memory log on defeat only', () => {
    expect(duel).toContain('duelEventsRef');
    expect(duel).toContain('buildWhyYouFell({');
    expect(duel).toContain('statsRef.current.whyYouFell =');
    expect(duel).toContain('recordEvent(');
    // Victory never writes it.
    const victory = duel.slice(duel.indexOf('if (opp.health <= 0) {'), duel.indexOf('} else if (player.health <= 0) {'));
    expect(victory).not.toContain('whyYouFell');
  });

  test('the phase marker and the banner are presented, and nothing is persisted', () => {
    expect(duel).toContain('bossPhase={bossPhase}');
    expect(duel).toContain('bossPhaseBannerText');
    expect(code('src/components/ui/CombatHUD.tsx')).toContain('PHASE II');
    expect(code('src/components/hub/DuelResultModal.tsx')).toContain('whyYouFell');
    // A save never carries the breakdown.
    expect(code('src/services/storage.ts')).not.toContain('whyYouFell');
    expect(duel).not.toContain('saveProfile');
  });
});
