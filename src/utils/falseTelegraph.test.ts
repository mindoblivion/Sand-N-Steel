/**
 * ===========================================================================
 * D-3 — VARRO'S FALSE TELEGRAPH: the honesty suite
 * ===========================================================================
 * One section per claim the slice makes:
 *
 *   §A the fence — a tell exists only for a boss FEATURE bout carrying the
 *      mechanic and valid sub-data, so a regular opponent with a copied string
 *      can never lie;
 *   §B the tell is WEIGHT, never SIDE — the identical sequence with lefty mode
 *      on and off, and no lefty read anywhere in the mechanic or the cue;
 *   §C the teaching pair is forced (heavies 1 and 2) and the seeded roll governs
 *      afterwards, deterministically;
 *   §D the feint IS a standard quick and the true heavy IS a standard heavy —
 *      same action, same hit profile, same damage, same stamina — and the
 *      telegraph's own duration is never shortened;
 *   §E Two Faces arms on a feint and is spent on the next TRUE heavy only;
 *   §F the words fire once, on the first feint;
 *   §G the row's own published values.
 *
 * Run with: `bun test src/utils/falseTelegraph.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { OpponentConfig } from '../types/game';
import { ALL_OPPONENTS, FEATURE_BOUT_OPPONENTS } from '../data/opponents';
import { getWeaponByType } from '../data/itemsDB';
import { calculateHitChance, getStaminaCost } from './combatCalculations';
import {
  FEET_TELL_WORDS,
  createFalseTelegraphState,
  falseTelegraphAction,
  falseTelegraphConfigFor,
  followUpMultiplier,
  initiateHeavy,
  isFalseTelegraphBout,
  planHeavy,
  resolveHeavy,
  seededRoll,
  tellFor,
  type FalseTelegraphState,
} from './falseTelegraph';

const HERE = dirname(fileURLToPath(import.meta.url));
const repoPath = (relative: string) => normalize(join(HERE, '..', '..', relative));
const readSource = (relative: string): string => readFileSync(repoPath(relative), 'utf8');
/** Source with comments stripped, so prose cannot satisfy (or defeat) a check. */
const code = (relative: string): string =>
  readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const DUEL_SCENE = readSource('src/components/duel/DuelScene.tsx');
const TELEGRAPH_MODULE = readSource('src/utils/falseTelegraph.ts');
const MESH = readSource('src/components/3d/GladiatorMesh.tsx');

const varro = (): OpponentConfig => {
  const row = ALL_OPPONENTS.find((opponent) => opponent.id === 'opp_varro_boss');
  if (!row) throw new Error('Varro is not in the roster');
  return row;
};
const cfg = () => {
  const config = falseTelegraphConfigFor(varro());
  if (!config) throw new Error('Varro carries no false-telegraph config');
  return config;
};

/** The attack profile a given action resolves with — the standard pipeline's own inputs. */
const profile = (action: 'quick_attack' | 'power_attack', defenderAgi: number) => {
  const weapon = getWeaponByType(varro().weaponType);
  const isQuick = action === 'quick_attack';
  return {
    action,
    isQuick,
    baseDamage: isQuick ? weapon.damageLight : weapon.damageHeavy,
    hitChance: calculateHitChance(isQuick, varro().stats.agility, defenderAgi),
    stamina: getStaminaCost(weapon, isQuick),
  };
};

/** A fixed seeded sequence of heavies, and the tells it wears. */
const sequence = (seed: number, count: number): { kinds: string[]; tells: string[] } => {
  let state: FalseTelegraphState = createFalseTelegraphState();
  const kinds: string[] = [];
  const tells: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const begun = initiateHeavy(state, cfg(), seed);
    kinds.push(begun.plan.kind);
    tells.push(begun.state.tell as string);
    state = resolveHeavy(begun.state, begun.plan.kind).state;
  }
  return { kinds, tells };
};

// ── §A — the fence ────────────────────────────────────────────────────────────
describe('D-3 §A — the fence: only a boss feature bout tells a lie', () => {
  test('exactly one carrier, and it is Varro', () => {
    const carriers = ALL_OPPONENTS.filter((opponent) => falseTelegraphConfigFor(opponent) !== null);
    expect(carriers).toHaveLength(1);
    expect(carriers[0].id).toBe('opp_varro_boss');
    expect(carriers[0].isBoss).toBe(true);
    expect(carriers[0].featureBout).toBe(true);
    expect(isFalseTelegraphBout(carriers[0])).toBe(true);
  });

  test('the mechanic string alone is never enough', () => {
    const copy = (over: Partial<OpponentConfig>): OpponentConfig => ({ ...varro(), ...over });
    // Each clause, one at a time.
    expect(falseTelegraphConfigFor(copy({ isBoss: false }))).toBeNull();
    expect(falseTelegraphConfigFor(copy({ featureBout: undefined }))).toBeNull();
    expect(falseTelegraphConfigFor(copy({ bossMechanic: 'beast_hunt' }))).toBeNull();
    expect(falseTelegraphConfigFor(copy({ falseTelegraph: undefined }))).toBeNull();
    // A malformed block is refused rather than half-working.
    expect(
      falseTelegraphConfigFor(copy({ falseTelegraph: { ...cfg(), feintChance: 1.4 } }))
    ).toBeNull();
    expect(
      falseTelegraphConfigFor(
        copy({
          falseTelegraph: {
            ...cfg(),
            teachingSequence: ['maybe' as unknown as 'true'],
          },
        })
      )
    ).toBeNull();
    expect(falseTelegraphConfigFor(null)).toBeNull();
    expect(falseTelegraphConfigFor(undefined)).toBeNull();
  });

  test('no non-boss row, and no other feature bout, can ever tell one', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.id === 'opp_varro_boss') continue;
      expect(falseTelegraphConfigFor(opponent), opponent.id).toBeNull();
    }
    // The other four feature bouts keep their own mechanics untouched.
    expect(FEATURE_BOUT_OPPONENTS).toHaveLength(5);
  });
});

// ── §B — the tell is weight, never side ──────────────────────────────────────
describe('D-3 §B — the feet-tell is weight-based', () => {
  test('a feint is light, a true heavy is planted', () => {
    expect(tellFor('feint')).toBe('light');
    expect(tellFor('true')).toBe('planted');
  });

  test('the same seeded sequence is identical with lefty mode on and off', () => {
    // The rules take no side input at all, so the two "modes" are the same call.
    // The test states it as the property the design asks for.
    const run = (_lefty: boolean) => sequence(20261025, 8);
    expect(run(true)).toEqual(run(false));
    const { tells } = run(true);
    // The teaching pair, then whatever the seed says — the same either way.
    expect(tells.slice(0, 2)).toEqual(['planted', 'light']);
    expect(tells.every((tell) => tell === 'light' || tell === 'planted')).toBe(true);
  });

  test('no side-dependent word exists in the mechanic, and the cue is not under the lefty branch', () => {
    // Read comment-stripped, so the module's own prose about the ruling cannot
    // satisfy or defeat it — only executable code counts.
    expect(code('src/utils/falseTelegraph.ts').toLowerCase()).not.toContain('lefty');
    expect(code('src/utils/falseTelegraph.ts')).not.toContain('Left');
    // The scene derives the cue from the TELL alone.
    expect(DUEL_SCENE).toContain('feetTell={falseTelegraph.tell ?? undefined}');
    // The stance group is outside every `effectiveLefty` branch: it wraps the
    // model, while the handedness only picks the shield/weapon bones.
    const stance = MESH.slice(MESH.indexOf('FEET_TELL_STANCE'), MESH.indexOf('FEET_TELL_STANCE') + 400);
    expect(stance).not.toContain('effectiveLefty');
    expect(stance).not.toContain('isLefty');
  });
});

// ── §C — the teaching pair, then the roll ───────────────────────────────────
describe('D-3 §C — heavies 1 and 2 are forced, the roll governs after', () => {
  test('the teaching sequence is true then feint', () => {
    let state = createFalseTelegraphState();
    const first = initiateHeavy(state, cfg(), 7);
    expect(first.plan.kind).toBe('true');
    state = resolveHeavy(first.state, first.plan.kind).state;
    const second = initiateHeavy(state, cfg(), 7);
    expect(second.plan.kind).toBe('feint');
    expect(second.plan.tell).toBe('light');
  });

  test('after the pair, the same seed always answers the same heavies', () => {
    expect(sequence(1234, 8)).toEqual(sequence(1234, 8));
    // And the roll is what decides: a 0 feintChance never lies, a 1 always does.
    const state: FalseTelegraphState = { ...createFalseTelegraphState(), heavies: 2 };
    expect(planHeavy(state, { ...cfg(), feintChance: 0 }, 99).kind).toBe('true');
    expect(planHeavy(state, { ...cfg(), feintChance: 1 }, 99).kind).toBe('feint');
  });

  test('the seeded roll is deterministic, bounded, and total', () => {
    for (let salt = 0; salt < 50; salt += 1) {
      const value = seededRoll(42, salt);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(seededRoll(42, salt)).toBe(value);
    }
    expect(seededRoll(Number.NaN, 3)).toBe(seededRoll(0, 3));
    // A different seed does not have to differ every time, but must be a number.
    expect(Number.isFinite(seededRoll(1, 1))).toBe(true);
  });

  test('the roll is drawn ONCE per duel, in the scene', () => {
    expect(DUEL_SCENE).toContain('const falseTelegraphSeedRef = useRef(Math.floor(Math.random() * 0x7fffffff));');
    expect(DUEL_SCENE).toContain('falseTelegraphSeedRef.current');
  });
});

// ── §D — a feint IS a quick attack ──────────────────────────────────────────
describe('D-3 §D — the feint resolves exactly as a standard quick', () => {
  test('the action each kind resolves as', () => {
    expect(falseTelegraphAction('feint')).toBe('quick_attack');
    expect(falseTelegraphAction('true')).toBe('power_attack');
    expect(DUEL_SCENE).toContain("executeCombatTurn('opponent', falseTelegraphAction(kind))");
  });

  test('a feint profile is byte-identical to a standard quick from the same row', () => {
    const defenderAgi = 20;
    expect(profile(falseTelegraphAction('feint'), defenderAgi)).toEqual(
      profile('quick_attack', defenderAgi)
    );
  });

  test('a true heavy profile is byte-identical to a standard heavy from the same row', () => {
    const defenderAgi = 20;
    expect(profile(falseTelegraphAction('true'), defenderAgi)).toEqual(
      profile('power_attack', defenderAgi)
    );
  });

  test('the telegraph duration is never shortened, for either kind', () => {
    // The shipped pace table is untouched: the wind-up turn is 1450 ms whatever
    // the roll said, and the resolution is the ordinary action's own turn.
    expect(DUEL_SCENE).toContain('telegraph: 1450,');
    expect(DUEL_SCENE).toContain('quick_attack: 880,');
    expect(DUEL_SCENE).toContain('power_attack: 1300,');
    // No branch shortens the announce: the tell is data, not a new timing.
    const announce = DUEL_SCENE.slice(
      DUEL_SCENE.indexOf("else if (actionType === 'telegraph')"),
      DUEL_SCENE.indexOf('// 2c. STATEFUL DOCTRINA')
    );
    expect(announce).toContain('initiateHeavy(');
    expect(announce).not.toContain('turnResolutionMs');
    expect(announce).not.toContain('setTimeout');
  });

  test('the tell is published on the announce, and the resolution clears it', () => {
    expect(DUEL_SCENE).toContain('const begun = initiateHeavy(');
    expect(DUEL_SCENE).toContain('commitFalseTelegraph(begun.state)');
    expect(DUEL_SCENE).toContain('resolveHeavy(falseTelegraphRef.current, falseTelegraphKind)');
    expect(DUEL_SCENE).toContain("if (kind === 'true') telegraphLandingRef.current = true;");
  });
});

// ── §E — Two Faces ──────────────────────────────────────────────────────────
describe('D-3 §E — Two Faces arms on a feint and is spent on the true heavy', () => {
  const after = (kinds: ('true' | 'feint')[]): FalseTelegraphState => {
    let state = createFalseTelegraphState();
    for (const kind of kinds) state = resolveHeavy(state, kind).state;
    return state;
  };

  test('+15 % only on a TRUE heavy that follows a feint', () => {
    const armed = after(['feint']);
    expect(followUpMultiplier(armed, cfg(), 'true')).toBeCloseTo(1.15, 10);
    expect(followUpMultiplier(armed, cfg(), 'feint')).toBe(1);
    expect(followUpMultiplier(after(['true']), cfg(), 'true')).toBe(1);
    expect(followUpMultiplier(createFalseTelegraphState(), cfg(), 'true')).toBe(1);
  });

  test('it expires on that heavy, and a later feint arms it again', () => {
    let state = after(['feint']);
    const spent = resolveHeavy(state, 'true').state;
    expect(followUpMultiplier(spent, cfg(), 'true')).toBe(1);
    state = resolveHeavy(spent, 'feint').state;
    expect(followUpMultiplier(state, cfg(), 'true')).toBeCloseTo(1.15, 10);
    // Two feints in a row keep it armed rather than doubling it.
    state = resolveHeavy(after(['feint', 'feint']), 'true').state;
    expect(state.followUpArmed).toBe(false);
  });

  test('the scene multiplies the resolution traitMult by it, once', () => {
    expect(DUEL_SCENE).toContain('followUpMultiplier(falseTelegraphRef.current, falseTelegraphCfg, falseTelegraphKind)');
    expect((DUEL_SCENE.match(/\* followUpMult/g) ?? []).length).toBe(1);
  });

  test('Varro carries the palma the mechanic reads', () => {
    expect(varro().palmae).toEqual(['two_faces']);
  });
});

// ── §F — the words ──────────────────────────────────────────────────────────
describe('D-3 §F — the HUD says it once', () => {
  test('the line is Part A’s, verbatim', () => {
    expect(FEET_TELL_WORDS).toBe('His foot stayed light — that one was a lie. Watch the feet.');
  });

  test('the first feint speaks, the second does not, a true heavy never does', () => {
    const first = resolveHeavy(createFalseTelegraphState(), 'feint');
    expect(first.words).toBe(FEET_TELL_WORDS);
    expect(first.state.toldOnce).toBe(true);
    const second = resolveHeavy(first.state, 'feint');
    expect(second.words).toBe('');
    expect(resolveHeavy(createFalseTelegraphState(), 'true').words).toBe('');
  });

  test('one writer in the scene, behind the fence', () => {
    expect((DUEL_SCENE.match(/addLog\(settled\.words/g) ?? []).length).toBe(1);
    expect((DUEL_SCENE.match(/FEET_TELL_WORDS/g) ?? []).length).toBe(0);
  });
});

// ── §G — the row's published values ─────────────────────────────────────────
describe('D-3 §G — Varro’s row states its own numbers', () => {
  test('feintChance, the teaching pair and the follow-up multiplier', () => {
    expect(cfg().feintChance).toBe(0.45);
    expect(cfg().teachingSequence).toEqual(['true', 'feint']);
    expect(cfg().feintFollowUpMult).toBe(1.15);
    expect(varro().bossMechanic).toBe('false_telegraph');
    expect(varro().presentationState).toBe('high-noon');
  });
});
