/**
 * ===========================================================================
 * D-5 — HERMAS'S LONG MEMORY, pinned.
 * ===========================================================================
 * The suite drives the PURE module the duel calls — the fence, the LIVE
 * OFFENSIVE-MIX COUNTER (built new in this slice: there was none in the tree),
 * the two thresholds, the counter-shift values and their caps, the balanced-mix
 * rule, the words the HUD and the result screen print — plus the source-level
 * wiring that makes the duel, the arena, the result modal and the tavern's deep
 * card use them. Every number is read from the row or from the module, never
 * restated from the prompt.
 *
 * Run with: `bun test src/utils/longMemory.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OpponentConfig } from '../types/game';
import { ALL_OPPONENTS, FEATURE_BOUT_OPPONENTS, LADDER_OPPONENTS } from '../data/opponents';
import { BOSS_PRESENTATION_DELTAS, bossSceneDeltas } from '../data/bossPresentationStates';
import {
  applyLongMemoryRead,
  createLongMemoryState,
  dodgeShareOf,
  dueLongMemoryReads,
  isLongMemoryBout,
  longMemoryBaseProfile,
  longMemoryBlockChance,
  longMemoryConfigFor,
  longMemoryIntelLine,
  longMemoryProfile,
  longMemoryResultLines,
  notePlayerAction,
  offensiveClassOf,
  readOffensiveMix,
  type LongMemoryState,
} from './longMemory';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');
const read = (path: string): string => readFileSync(join(SRC, path), 'utf8');
/** Comments stripped: prose can neither satisfy nor defeat a check. */
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const DUEL = code('components/duel/DuelScene.tsx');
const ARENA = code('components/3d/DuelArena.tsx');
const MODAL = code('components/hub/DuelResultModal.tsx');
const TAB = code('components/hub/TournamentTab.tsx');
const MODULE = code('utils/longMemory.ts');

const hermas = (): OpponentConfig => {
  const row = ALL_OPPONENTS.find((opponent) => opponent.id === 'opp_hermas_boss');
  if (!row) throw new Error('the Hermas row is missing from the roster');
  return row;
};
const cfg = () => {
  const config = longMemoryConfigFor(hermas());
  if (!config) throw new Error('the Hermas row no longer reads a mix');
  return config;
};
const base = () => longMemoryBaseProfile(hermas());

/** A mix of `power` power attacks and `quick` quick ones, through the counter. */
function mix(power: number, quick: number): LongMemoryState {
  let state = createLongMemoryState();
  for (let i = 0; i < power; i += 1) state = notePlayerAction(state, 'power_attack');
  for (let i = 0; i < quick; i += 1) state = notePlayerAction(state, 'quick_attack');
  return state;
}

/** Drive every threshold the row declares, in order, over a fixed mix. */
function readAll(state: LongMemoryState): LongMemoryState {
  let current = state;
  for (const threshold of cfg().readAtHealthFractions) {
    current = applyLongMemoryRead(cfg(), base(), current, threshold).state;
  }
  return current;
}

// ════════════════════════════════════════════════════════════════════════════
// §A — the fence
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §A — the long memory exists only on Hermas', () => {
  test('the row is a boss Feature Bout carrying the mechanic and its own sub-data', () => {
    const row = hermas();
    expect(row.isBoss).toBe(true);
    expect(row.featureBout).toBe(true);
    expect(row.bossMechanic).toBe('the_long_memory');
    expect(longMemoryConfigFor(row)).toBe(row.longMemory as never);
    expect(isLongMemoryBout(row)).toBe(true);
  });

  test('no other row in the game reads a mix', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.id === 'opp_hermas_boss') continue;
      expect(longMemoryConfigFor(opponent), opponent.id).toBeNull();
      expect(isLongMemoryBout(opponent), opponent.id).toBe(false);
    }
    expect(longMemoryConfigFor(null)).toBeNull();
    expect(longMemoryConfigFor(undefined)).toBeNull();
  });

  test('the sub-data on any other shape of row is inert', () => {
    const row = hermas();
    const copy = { ...row, id: 'synthetic', longMemory: row.longMemory } as OpponentConfig;
    // A standard man with the numbers: nothing.
    expect(longMemoryConfigFor({ ...copy, isBoss: undefined, featureBout: undefined })).toBeNull();
    // A ladder boss (no feature flag): nothing.
    expect(longMemoryConfigFor({ ...copy, featureBout: undefined })).toBeNull();
    // A feature bout carrying a different mechanic: nothing.
    expect(
      longMemoryConfigFor({ ...copy, bossMechanic: 'beast_hunt' as OpponentConfig['bossMechanic'] })
    ).toBeNull();
    // The mechanic string with no sub-data at all: nothing.
    expect(longMemoryConfigFor({ ...copy, longMemory: undefined })).toBeNull();
  });

  test('malformed sub-data is refused rather than half-working', () => {
    const good = cfg();
    const withData = (patch: Partial<typeof good>): OpponentConfig => ({
      ...hermas(),
      longMemory: { ...good, ...patch },
    });
    // Thresholds must be a non-empty, strictly descending list inside (0, 1).
    expect(longMemoryConfigFor(withData({ readAtHealthFractions: [] }))).toBeNull();
    expect(longMemoryConfigFor(withData({ readAtHealthFractions: [0.33, 0.66] }))).toBeNull();
    expect(longMemoryConfigFor(withData({ readAtHealthFractions: [0.66, 0.66] }))).toBeNull();
    expect(longMemoryConfigFor(withData({ readAtHealthFractions: [0] }))).toBeNull();
    expect(longMemoryConfigFor(withData({ readAtHealthFractions: [1] }))).toBeNull();
    // The dominance line must be a majority but not a certainty.
    expect(longMemoryConfigFor(withData({ dominanceThreshold: 0.5 }))).toBeNull();
    expect(longMemoryConfigFor(withData({ dominanceThreshold: 1 }))).toBeNull();
    // No per-adoption move may exceed the cap, and Old Craft is part of a move.
    expect(
      longMemoryConfigFor(withData({ blockChanceDelta: { power: 0.2, quick: -0.15 } }))
    ).toBeNull();
    expect(longMemoryConfigFor(withData({ oldCraftBlockChancePerAdoption: 0.2 }))).toBeNull();
    expect(longMemoryConfigFor(withData({ maxDeltaPerAdoption: 0 }))).toBeNull();
    // The clamp must be a real interval inside (0, 1).
    expect(longMemoryConfigFor(withData({ clamp: { min: 0.05, max: 1 } }))).toBeNull();
    expect(longMemoryConfigFor(withData({ clamp: { min: 0.6, max: 0.5 } }))).toBeNull();
    // The shipped row passes the same predicate.
    expect(longMemoryConfigFor(hermas())).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — the live offensive-mix counter (NEW in this slice)
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §B — the live mix counter', () => {
  test('a fresh bout counts nothing and has read nothing', () => {
    const state = createLongMemoryState();
    expect(state.mix).toEqual({ quick: 0, power: 0 });
    expect(state.reads).toEqual([]);
  });

  test('only the two attacks are offensive; every other action is not', () => {
    expect(offensiveClassOf('quick_attack')).toBe('quick');
    expect(offensiveClassOf('power_attack')).toBe('power');
    const others = [
      'shield_block',
      'dodge',
      'advance',
      'retreat',
      'taunt',
      'rest',
      'telegraph',
      'cast_net',
      'beast_crouch',
      'brothers_recovery',
    ] as const;
    for (const action of others) {
      expect(offensiveClassOf(action), action).toBeNull();
      expect(notePlayerAction(createLongMemoryState(), action).mix, action).toEqual({
        quick: 0,
        power: 0,
      });
    }
  });

  test('it counts each attack once, and treats its input as immutable', () => {
    const empty = createLongMemoryState();
    const one = notePlayerAction(empty, 'power_attack');
    const two = notePlayerAction(one, 'quick_attack');
    expect(empty.mix).toEqual({ quick: 0, power: 0 });
    expect(one.mix).toEqual({ quick: 0, power: 1 });
    expect(two.mix).toEqual({ quick: 1, power: 1 });
  });

  test('a class is dominant only when it EXCEEDS the threshold', () => {
    const config = cfg();
    expect(readOffensiveMix(mix(0, 0), config)).toMatchObject({ total: 0, dominant: null });
    // Exactly three-in-five is NOT past three-in-five.
    expect(readOffensiveMix(mix(3, 2), config)).toMatchObject({ powerShare: 0.6, dominant: null });
    expect(readOffensiveMix(mix(2, 3), config)).toMatchObject({ quickShare: 0.6, dominant: null });
    // One step past it is.
    expect(readOffensiveMix(mix(4, 2), config)).toMatchObject({ dominant: 'power' });
    expect(readOffensiveMix(mix(2, 4), config)).toMatchObject({ dominant: 'quick' });
    // A 50/50 blend is neither.
    expect(readOffensiveMix(mix(5, 5), config)).toMatchObject({
      total: 10,
      quickShare: 0.5,
      powerShare: 0.5,
      dominant: null,
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — when he looks
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §C — the two thresholds', () => {
  const max = () => hermas().stats.healthMax;

  test('he looks at 66 % and again at 33 %, each once, in that order', () => {
    const config = cfg();
    const state = createLongMemoryState();
    const high = config.readAtHealthFractions[0];
    const low = config.readAtHealthFractions[1];
    expect(max() * high).toBe(297);
    expect(max() * low).toBe(148.5);

    expect(dueLongMemoryReads(config, state, max(), max())).toEqual([]);
    expect(dueLongMemoryReads(config, state, max() * high + 0.5, max())).toEqual([]);
    expect(dueLongMemoryReads(config, state, max() * high, max())).toEqual([high]);

    const once = applyLongMemoryRead(config, base(), state, high).state;
    expect(dueLongMemoryReads(config, once, max() * high, max())).toEqual([]);
    expect(dueLongMemoryReads(config, once, max() * low, max())).toEqual([low]);
    const twice = applyLongMemoryRead(config, base(), once, low).state;
    expect(dueLongMemoryReads(config, twice, 1, max())).toEqual([]);
    expect(twice.reads.map((read) => read.threshold)).toEqual([high, low]);
  });

  test('one blow can cross both, and both are then due in the row’s order', () => {
    const config = cfg();
    expect(dueLongMemoryReads(config, createLongMemoryState(), 10, max())).toEqual(
      config.readAtHealthFractions
    );
  });

  test('unusable health readings are ignored', () => {
    const config = cfg();
    const state = createLongMemoryState();
    expect(dueLongMemoryReads(config, state, Number.NaN, max())).toEqual([]);
    expect(dueLongMemoryReads(config, state, 10, 0)).toEqual([]);
    expect(dueLongMemoryReads(config, state, 10, Number.POSITIVE_INFINITY)).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — the counter-shift values, as landed
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §D — the shift, the caps, and the untouched base', () => {
  test('the published power pattern is B4’s; the quick mirror is AUTHORED', () => {
    const config = cfg();
    // B4 publishes +0.10 blockChance for the power-spam pattern.
    expect(config.blockChanceDelta.power).toBe(0.1);
    // Nothing publishes a quick mirror, so this one is authored — and the ROW
    // says so, in its own comment.
    expect(config.blockChanceDelta.quick).toBe(-0.15);
    expect(read('data/opponents.ts')).toContain('blockChanceDelta.quick −0.15 — AUTHORED');
    // Both sit inside the published cap.
    expect(Math.abs(config.blockChanceDelta.quick)).toBeLessThanOrEqual(
      config.maxDeltaPerAdoption
    );
    expect(config.maxDeltaPerAdoption).toBe(0.15);
    expect(config.clamp).toEqual({ min: 0.05, max: 0.95 });
  });

  test('power spam: block rises 0.65 → 0.80 → 0.95 and the dodge share falls', () => {
    const row = hermas();
    const config = cfg();
    const first = applyLongMemoryRead(config, base(), mix(7, 3), 0.66);
    expect(first.adaptation.adapted).toBe('power');
    expect(first.adaptation.blockBefore).toBe(row.blockChance);
    expect(first.adaptation.blockAfter).toBeCloseTo(0.8, 10);
    expect(first.adaptation.oldCraft).toBe(config.oldCraftBlockChancePerAdoption);
    expect(first.adaptation.dodgeShareBefore).toBeCloseTo(1 - row.blockChance, 10);
    expect(first.adaptation.dodgeShareAfter).toBeCloseTo(0.2, 10);

    const second = applyLongMemoryRead(config, base(), first.state, 0.33);
    expect(second.adaptation.blockBefore).toBeCloseTo(0.8, 10);
    expect(second.adaptation.blockAfter).toBeCloseTo(0.95, 10);
    expect(second.adaptation.dodgeShareAfter).toBeCloseTo(0.05, 10);
    // The published example's illustrative numbers are nowhere in the shipped run.
    expect(second.adaptation.words).not.toContain('0.70');
  });

  test('quick spam: the authored mirror — block falls and the dodge share rises', () => {
    const config = cfg();
    const first = applyLongMemoryRead(config, base(), mix(3, 7), 0.66);
    expect(first.adaptation.adapted).toBe('quick');
    expect(first.adaptation.blockBefore).toBeCloseTo(0.65, 10);
    expect(first.adaptation.blockAfter).toBeCloseTo(0.55, 10);
    expect(first.adaptation.dodgeShareAfter).toBeCloseTo(0.45, 10);

    const second = applyLongMemoryRead(config, base(), first.state, 0.33);
    expect(second.adaptation.blockAfter).toBeCloseTo(0.45, 10);
    expect(second.adaptation.dodgeShareAfter).toBeCloseTo(0.55, 10);
    // The mirror is a real fall, not a rounding artefact: two adoptions of 0.10.
    expect(second.adaptation.blockBefore - second.adaptation.blockAfter).toBeCloseTo(0.1, 10);
  });

  test('no single adoption moves a value more than the cap, and the clamp holds', () => {
    const config = cfg();
    let state = mix(20, 1);
    for (let i = 0; i < 12; i += 1) {
      const read = applyLongMemoryRead(config, base(), state, 0.66 - i * 0.01);
      state = read.state;
      const moved = Math.abs(read.adaptation.blockAfter - read.adaptation.blockBefore);
      expect(moved).toBeLessThanOrEqual(config.maxDeltaPerAdoption + 1e-12);
      expect(read.adaptation.blockAfter).toBeGreaterThanOrEqual(config.clamp.min);
      expect(read.adaptation.blockAfter).toBeLessThanOrEqual(config.clamp.max);
    }
    // It stops at the clamp ceiling rather than running past it.
    expect(longMemoryBlockChance(config, base(), state)).toBe(config.clamp.max);
  });

  test('an adoption lands on a clean value, not a float residue', () => {
    // 0.65 − 0.10 twice must read 0.45, not 0.45000000000000007.
    expect(longMemoryProfile(cfg(), base(), readAll(mix(2, 6))).blockChance).toBe(0.45);
    expect(longMemoryProfile(cfg(), base(), readAll(mix(9, 1))).blockChance).toBe(0.95);
  });

  test('Hermas’s base profile never changes — only the effective block value', () => {
    const row = hermas();
    const before = JSON.stringify(row);
    const state = readAll(mix(9, 1));
    const profile = longMemoryProfile(cfg(), base(), state);
    expect(JSON.stringify(hermas())).toBe(before);
    expect(profile.aggression).toBe(row.aggression);
    expect(profile.dodgeChance).toBe(row.dodgeChance);
    expect(row.stats.healthMax).toBe(450);
    // The clamp keeps the effective value legal whatever the row asked for.
    expect(profile.dodgeShare).toBeCloseTo(dodgeShareOf(profile.blockChance), 12);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — the balanced-mix rule
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §E — a balanced blend is never answered', () => {
  test('a 50/50 synthetic mix produces a Hermas identical to his row at every threshold', () => {
    const row = hermas();
    const config = cfg();
    const state = readAll(mix(5, 5));
    expect(state.reads).toHaveLength(config.readAtHealthFractions.length);
    for (const read of state.reads) {
      expect(read.adapted).toBeNull();
      expect(read.blockAfter).toBe(read.blockBefore);
      expect(read.oldCraft).toBe(0);
      expect(read.words).toBe('');
    }
    const profile = longMemoryProfile(config, base(), state);
    expect(profile.blockChance).toBe(row.blockChance);
    expect(profile.aggression).toBe(row.aggression);
    expect(profile.dodgeChance).toBe(row.dodgeChance);
    expect(profile.dodgeShare).toBeCloseTo(1 - row.blockChance, 12);
  });

  test('exactly-on-the-line mixes are balanced too, and one more is not', () => {
    const config = cfg();
    // 6/4 is exactly 60 % power, 4/6 exactly 60 % quick: neither is "past".
    expect(readOffensiveMix(mix(6, 4), config).powerShare).toBeCloseTo(0.6, 12);
    expect(readOffensiveMix(mix(4, 6), config).quickShare).toBeCloseTo(0.6, 12);
    expect(applyLongMemoryRead(config, base(), mix(6, 4), 0.66).adaptation.adapted).toBeNull();
    expect(applyLongMemoryRead(config, base(), mix(4, 6), 0.66).adaptation.adapted).toBeNull();
    // One more quick (7 of 11 = 63.6 %) is past it.
    expect(readOffensiveMix(mix(4, 7), config).dominant).toBe('quick');
    expect(applyLongMemoryRead(config, base(), mix(4, 7), 0.66).adaptation.adapted).toBe('quick');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — the words, with the ACTUAL numbers
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §F — the announcement prints his real row values', () => {
  test('the power read names power, the block pair and the dodge share', () => {
    const read = applyLongMemoryRead(cfg(), base(), mix(7, 3), 0.66).adaptation;
    expect(read.words).toContain('seen enough of your power attacks');
    expect(read.words).toContain('Block 0.65 → 0.80');
    expect(read.words).toContain('dodge share 35% → 20%');
    expect(read.words).toContain('Old Craft');
  });

  test('the quick read names quick strikes and the mirrored move', () => {
    const read = applyLongMemoryRead(cfg(), base(), mix(3, 7), 0.66).adaptation;
    expect(read.words).toContain('seen enough of your quick strikes');
    expect(read.words).toContain('Block 0.65 → 0.55');
    expect(read.words).toContain('dodge share 35% → 45%');
  });

  test('the staged prompt’s illustrative numbers never appear', () => {
    const rows = [
      applyLongMemoryRead(cfg(), base(), mix(7, 3), 0.66).adaptation,
      applyLongMemoryRead(cfg(), base(), mix(3, 7), 0.66).adaptation,
    ];
    for (const read of rows) {
      expect(read.words).not.toContain('0.60 → 0.70');
      expect(read.words).not.toContain('0.60');
      expect(read.words).not.toContain('0.70');
    }
  });

  test('the numbers in the words come from the module, not from a string literal', () => {
    // The words are built from the before/after pairs; no bare decimal pair is
    // typed into the module's prose.
    expect(MODULE).toContain('Block ${two(blockBefore)} → ${two(blockAfter)}');
    expect(MODULE).not.toContain('Block 0.65');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — presentation: the dusk state, property-only
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §G — the dusk state costs no draw call', () => {
  test('dusk is a deepened dusk: lower and redder than dawn, braziers raised', () => {
    const dusk = BOSS_PRESENTATION_DELTAS.dusk;
    const dawn = BOSS_PRESENTATION_DELTAS.dawn;
    expect(dusk).toBeDefined();
    expect(dawn).toBeDefined();
    expect(dusk!.sunIntensity!).toBeLessThan(dawn!.sunIntensity!);
    expect(dusk!.ambientIntensity!).toBeLessThan(dawn!.ambientIntensity!);
    expect(dusk!.emberEmissive!).toBeGreaterThan(3);
    expect(bossSceneDeltas(hermas())).toBe(dusk);
    // …and only a feature boss with a table entry asks for anything.
    expect(bossSceneDeltas(ALL_OPPONENTS[0])).toBeNull();
  });

  test('the arena reads the dusk tone and the ember property, and adds no mesh', () => {
    expect(ARENA).toContain("bannerAllegiance === 'dusk'");
    expect(ARENA).toContain('emberEmissive ?? 3');
    // The mesh count is the pre-D-5 one: this state changes two material colours
    // and one emissive intensity on meshes the arena already draws.
    expect((ARENA.match(/<mesh/g) ?? []).length).toBe(32);
    // The scene passes both, on the same two props.
    expect(DUEL).toContain("? 'dusk'");
    // DAY/NIGHT T1 REBASE: the authored delta still WINS on the ember property (the
    // left side of the `??` is unchanged); the row's own scaled value is only the
    // fallback when the opponent authors nothing. +0 meshes either way.
    expect(DUEL).toContain('emberEmissive={sceneDeltas?.emberEmissive ?? duelLight.emberEmissive}');
  });

  test('"his banner beside the player’s" is the one heraldic cloth’s tones', () => {
    // A second cloth would be +1 draw call, which the slice's budget forbids; the
    // state is carried by the canopy/trim colours the arena already draws.
    expect(read('data/bossPresentationStates.ts')).toContain('SECOND cloth');
    expect(ARENA).toContain('#4c0519');
    expect(ARENA).toContain('#a16207');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — the result screen's lines, computed at result time
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §H — the adaptation log explains both outcomes in numbers', () => {
  test('a power-led bout reads twice and ends with the guard he holds', () => {
    const lines = longMemoryResultLines(cfg(), base(), readAll(mix(9, 1)));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('At 66% HP');
    expect(lines[0]).toContain('% power');
    expect(lines[0]).toContain('block 0.65 → 0.80');
    expect(lines[1]).toContain('block 0.80 → 0.95');
    expect(lines[2]).toContain('his block ends the bout at 0.95');
    expect(lines[2]).toContain('base 0.65');
  });

  test('a balanced bout says plainly that there was nothing to read', () => {
    const lines = longMemoryResultLines(cfg(), base(), readAll(mix(5, 5)));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('nothing to read');
    expect(lines[0]).toContain('past 60%');
    expect(lines[2]).toContain('found nothing to answer');
    expect(lines[2]).toContain('0.65');
  });

  test('the share printed is the class it names, balanced reads included', () => {
    // 4 power / 7 quick = 63.6 % quick — a quick read, labelled quick.
    const quick = applyLongMemoryRead(cfg(), base(), mix(4, 7), 0.66).adaptation;
    expect(quick.line).toContain('(64% quick)');
    // 4/6 is exactly 60 % quick: balanced, and still labelled with its own share.
    const even = applyLongMemoryRead(cfg(), base(), mix(4, 6), 0.66).adaptation;
    expect(even.line).toContain('(60% quick)');
    expect(even.line).toContain('nothing to read');
    // 6/4 = exactly 60 % power: balanced, labelled power.
    const evenPower = applyLongMemoryRead(cfg(), base(), mix(6, 4), 0.66).adaptation;
    expect(evenPower.line).toContain('(60% power)');
  });

  test('a bout that never crossed a threshold has nothing to log', () => {
    expect(longMemoryResultLines(cfg(), base(), createLongMemoryState())).toEqual([]);
  });

  test('the log is in-memory only: it rides DuelStatistics, never a save field', () => {
    expect(DUEL).toContain('statsRef.current.adaptationLines = longMemoryResultLines(');
    expect((DUEL.match(/statsRef\.current\.adaptationLines =/g) ?? []).length).toBe(2);
    expect(MODAL).toContain('stats.adaptationLines');
    expect(MODAL).toContain('data-long-memory-lines');
    // The module cannot write anything anywhere.
    for (const token of ['localStorage', 'sessionStorage', 'saveProfile', 'useState', 'Math.random', 'Date.']) {
      expect(MODULE, token).not.toContain(token);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §I — the wiring
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §I — the duel counts, reads and announces through the module', () => {
  test('the mix is counted from the action dispatch, for player attacks at the master', () => {
    expect(DUEL).toContain('longMemoryConfigFor(opponent)');
    expect(DUEL).toContain('commitLongMemory(notePlayerAction(longMemoryRef.current, actionType))');
    // C-8.70C rebased this pin, not weakened: the counter now runs in EVERY duel
    // (the grudge record READS it at result time instead of counting a second
    // one), so the dispatch no longer gates the count on Hermas's own config. The
    // property this test exists to pin — exactly one count per player attack at
    // the master, taken from the action dispatch — is unchanged.
    expect(DUEL).toContain("if (isActorPlayer && target === 'master')");
    expect(DUEL).not.toContain('if (longMemoryCfg && isActorPlayer');
    // No second combat log: the counter is a count, and the log is untouched.
    expect(DUEL).not.toContain('offensiveMixLog');
  });

  test('his live blockChance reaches the AI’s chooser and nothing else moves', () => {
    expect(DUEL).toContain('longMemoryBlockChance(longMemoryCfg, longMemoryBase, longMemoryRef.current)');
    expect(DUEL).toContain('chooseAIStandardAction(aiAggression, aiBlockChance)');
    // C-8.70C rebased this fallback (not weakened): Hermas reads the MODE's
    // composed guard, which on Sand is his own published block value.
    // PITCH A1 — that read is now `boutProfile.blockChance`: the mode's composed
    // guard with an ill omen's +0.05 applied after it (identity without one).
    expect(DUEL).toContain(': boutProfile.blockChance;');
    expect(DUEL).toContain('blockChance: boutProfile.blockChance }');
    // Aggression is not an adaptation input: only the block value moves.
    expect(DUEL).not.toContain('longMemoryAggression');
  });

  test('each threshold fires once, deferred while a telegraph stands', () => {
    expect(DUEL).toContain('dueLongMemoryReads(');
    expect(DUEL).toContain('applyLongMemoryRead(longMemoryCfg, longMemoryBase, state, threshold)');
    expect(DUEL).toContain('if (opp.telegraphText || pendingHeavyAttackRef.current) return;');
    expect(DUEL).toContain('if (opp.health <= 0) return;');
  });

  test('the announcement is a HUD line, on the surface the touch layout compacts', () => {
    expect(DUEL).toContain('addLog(read.adaptation.words, ');
    // The words ride the duel log the panel prints (`.combat-log-items`) — the
    // same block `src/index.css` compacts for a short landscape phone, so the
    // announcement reaches the touch HUD without a second surface.
    expect(read('components/ui/TurnActionPanel.tsx')).toContain('combat-log-items');
    expect(read('index.css')).toContain('.combat-hud .combat-log-items');
  });

  test('the tavern’s deep card prints his base values and labels the unknown', () => {
    expect(TAB).toContain('opp.longMemory');
    expect(TAB).toContain('longMemoryIntelLine(');
    const line = longMemoryIntelLine(cfg(), base());
    expect(line).toContain('Base block 0.65');
    expect(line).toContain('dodge share 35%');
    expect(line).toContain('66% and 33%');
    expect(line).toContain('past 60%');
    expect(line).toContain('UNKNOWN: whether he reads you at all');
    expect(longMemoryIntelLine(null, base())).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §J — the roster-wide honesty re-run, over the FINAL nine-mechanic table
// ════════════════════════════════════════════════════════════════════════════
describe('D-5 §J — the whole roster, after every D-slice', () => {
  const LADDER_MECHANICS = [
    'heavy_telegraph',
    'phase_weapon_switch',
    'counter_dodge',
    'rage_mode_colossus',
  ];
  const FEATURE_MECHANICS = [
    'beast_hunt',
    'false_telegraph',
    'unbroken_panoply',
    'yoked_brothers',
    'the_long_memory',
  ];

  test('the nine mechanics in the game resolve only on isBoss rows, once each', () => {
    for (const mechanic of [...LADDER_MECHANICS, ...FEATURE_MECHANICS]) {
      const carriers = ALL_OPPONENTS.filter((opponent) => opponent.bossMechanic === mechanic);
      expect(carriers.length, mechanic).toBe(1);
      expect(carriers[0].isBoss, mechanic).toBe(true);
    }
    // No non-boss row carries a mechanic at all.
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.isBoss === true) continue;
      expect(opponent.bossMechanic, opponent.id).toBeUndefined();
    }
  });

  test('every FEATURE mechanic additionally requires the feature flag', () => {
    for (const mechanic of FEATURE_MECHANICS) {
      const carrier = ALL_OPPONENTS.find((opponent) => opponent.bossMechanic === mechanic);
      expect(carrier?.featureBout, mechanic).toBe(true);
      // …and no ladder boss carries one.
      for (const ladder of LADDER_OPPONENTS) {
        expect(ladder.bossMechanic, ladder.id).not.toBe(mechanic as never);
      }
    }
    const ladder = LADDER_OPPONENTS.filter((opponent) => opponent.isBoss === true);
    for (const boss of ladder) {
      expect(FEATURE_MECHANICS, boss.id).not.toContain(boss.bossMechanic as never);
      expect(boss.featureBout, boss.id).toBeUndefined();
    }
  });

  test('all seventeen rows survive a full power-spam bout byte-identical', () => {
    const before = JSON.stringify(ALL_OPPONENTS);
    const state = readAll(mix(9, 1));
    const profile = longMemoryProfile(cfg(), base(), state);
    expect(profile.blockChance).toBe(0.95);
    expect(JSON.stringify(ALL_OPPONENTS)).toBe(before);
    expect(ALL_OPPONENTS.length).toBe(17);
    expect(LADDER_OPPONENTS.length).toBe(12);
    expect(FEATURE_BOUT_OPPONENTS.length).toBe(5);
  });

  test('Hermas’s published base stats are exactly the D-1 row', () => {
    const row = hermas();
    expect(row.stats).toEqual({
      strength: 31,
      agility: 24,
      staminaMax: 195,
      staminaRegen: 30,
      defense: 17,
      healthMax: 450,
    });
    expect(row.aggression).toBe(0.7);
    expect(row.blockChance).toBe(0.65);
    expect(row.dodgeChance).toBe(0.5);
    expect(row.presentationState).toBe('dusk');
  });
});
