/**
 * CF-6 — boss moments get boss treatment (bosses only).
 *
 * Run with: `bun test src/utils/bossPresentation.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  THE ACCEPTANCE CORE — boss gating, as an explicit positive AND an
 *       explicit NEGATIVE: each of the four moments is entitled for its own
 *       boss, for its own boss only, and a standard opponent (the roster swept
 *       in full, plus hand-built shapes) owns NONE of them, so none of the four
 *       effects can be produced in a standard duel.
 *   §B  rage — a CF-1 trauma of exactly +0.5 into the existing `impactRef`, the
 *       CF-3 `playCrowdSwell()`, and a HUD vignette prop carrying a timestamp
 *       with a 700 ms CSS animation that is pointer-events-none and animates
 *       opacity only.
 *   §C  the telegraph glow — #ff2222 at 2 Hz through `GladiatorMesh`'s EXISTING
 *       emissive path (not a second highlight system), on while `telegraphText`
 *       is set, cleared when it clears, and the telegraph's own timing untouched
 *       so the player still has exactly one full turn.
 *   §D  the phase switch — `playWeaponDraw()`'s sweep-and-ping shape driven
 *       against a recording fake `AudioContext`, called only for the boss — and
 *       the WHITE FLASH that was SKIPPED, with the reason pinned as a fact of the
 *       shipped mesh rather than a preference.
 *   §E  the counter-dodge — a CF-4 `sand` burst at the boss's own position when
 *       `pendingCounterRef` is set, and only for the counter_dodge boss.
 *   §F  the mechanics themselves — telegraph ~30 %, rage 50 %, phase switch 50 %,
 *       the counter's own evade roll, and every damage/timeout constant, all
 *       byte-identical to the merged tree.
 *
 * The wiring is asserted by reading the shipped sources with comments stripped
 * (the house pattern: prose can neither satisfy nor defeat a check), because
 * `DuelScene` is a React/three component the sandbox cannot mount. The four
 * moments' GATING is asserted BEHAVIOURALLY, through the pure gate the scene
 * actually calls.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  BOSS_RAGE_TRAUMA,
  BOSS_VIGNETTE_MS,
  TELEGRAPH_GLOW_COLOR,
  TELEGRAPH_GLOW_HZ,
  TELEGRAPH_GLOW_MAX,
  TELEGRAPH_GLOW_MIN,
  bossPresentationMoments,
  bossPresentsMoment,
  telegraphGlowIntensity,
} from './bossPresentation';
import {
  SoundFXEngine,
  WEAPON_DRAW_NOISE_GAIN,
  WEAPON_DRAW_PING_HZ,
  WEAPON_DRAW_SECONDS,
  WEAPON_DRAW_SWEEP_FROM_HZ,
  WEAPON_DRAW_SWEEP_TO_HZ,
} from '../audio/soundEffects';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from '../data/opponents';
import type { BossMechanic } from '../types/game';

// ── Sources ────────────────────────────────────────────────────────────────
const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const source = (rel: string): string => readFileSync(path(rel), 'utf8');
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const DUEL_SCENE = stripComments(source('../../src/components/duel/DuelScene.tsx'));
const GLADIATOR_MESH = stripComments(source('../../src/components/3d/GladiatorMesh.tsx'));
const COMBAT_HUD = stripComments(source('../../src/components/ui/CombatHUD.tsx'));
const SOUND_EFFECTS = stripComments(source('../../src/audio/soundEffects.ts'));
const INDEX_CSS = source('../../src/index.css');

/** Every boss mechanic the design names, in the order the gate table holds them. */
const MECHANICS: BossMechanic[] = [
  'rage_mode_colossus',
  'heavy_telegraph',
  'phase_weapon_switch',
  'counter_dodge',
];

/** The boss that owns each mechanic, found in the shipped roster by data. */
const bossFor = (mechanic: BossMechanic) =>
  ALL_OPPONENTS.find((o) => o.isBoss === true && o.bossMechanic === mechanic);

/** The body of one `if (...)` block, from the `{` after its test to its close. */
const blockAfter = (code: string, marker: string): string => {
  const at = code.indexOf(marker);
  if (at < 0) return '';
  const open = code.indexOf('{', at);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(at, i + 1);
    }
  }
  return '';
};

// ── A recording fake Web Audio context (the C-8.66C / CF-3 technique) ──────
type ParamCall = { kind: 'set' | 'ramp' | 'exp' | 'cancel'; value: number; time: number };

class FakeParam {
  value = 0;
  calls: ParamCall[] = [];
  setValueAtTime(value: number, time: number) {
    this.calls.push({ kind: 'set', value, time });
    this.value = value;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push({ kind: 'ramp', value, time });
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.calls.push({ kind: 'exp', value, time });
    this.value = value;
  }
  cancelScheduledValues(time: number) {
    this.calls.push({ kind: 'cancel', value: Number.NaN, time });
  }
}

class FakeGain {
  gain = new FakeParam();
  connect() {}
}

class FakeFilter {
  type = '';
  frequency = new FakeParam();
  connect() {}
}

class FakeSource {
  buffer: { length: number } | null = null;
  loop = false;
  started = false;
  stoppedAt: number | null = null;
  connect() {}
  start() {
    this.started = true;
  }
  stop(time: number) {
    this.stoppedAt = time;
  }
}

class FakeOscillator {
  type = '';
  frequency = new FakeParam();
  started = false;
  stoppedAt: number | null = null;
  connect() {}
  start() {
    this.started = true;
  }
  stop(time: number) {
    this.stoppedAt = time;
  }
}

class FakeBuffer {
  constructor(public channelCount: number, public length: number, public sampleRate: number) {}
  getChannelData(): Float32Array {
    return new Float32Array(this.length);
  }
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = {};
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  sources: FakeSource[] = [];
  oscillators: FakeOscillator[] = [];
  resume() {
    return Promise.resolve();
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter() {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createOscillator() {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createBuffer(channelCount: number, length: number, sampleRate: number) {
    return new FakeBuffer(channelCount, length, sampleRate);
  }
}

const hadWindow = typeof (globalThis as { window?: unknown }).window !== 'undefined';
const originalWindow = (globalThis as { window?: unknown }).window;

const createEngineWithFakeAudio = (): { engine: SoundFXEngine; ctx: FakeAudioContext } => {
  const ctx = new FakeAudioContext();
  const Ctor = function AudioContextStub() {
    return ctx;
  } as unknown as typeof AudioContext;
  (globalThis as { window?: unknown }).window = { AudioContext: Ctor };
  const engine = new SoundFXEngine();
  engine.getAudioContext();
  return { engine, ctx };
};

afterEach(() => {
  if (hadWindow) (globalThis as { window?: unknown }).window = originalWindow;
  else delete (globalThis as { window?: unknown }).window;
});

// ══════════════════════════════════════════════════════════════════════════
// §A — the acceptance core: boss gating, positive and NEGATIVE
// ══════════════════════════════════════════════════════════════════════════
describe('CF-6 §A — boss gating', () => {
  test('each of the four bosses presents its own moment', () => {
    for (const mechanic of MECHANICS) {
      const boss = bossFor(mechanic);
      expect(boss).toBeDefined();
      expect(bossPresentsMoment(boss, mechanic)).toBe(true);
    }
  });

  test('a boss presents its own moment and no other boss’s', () => {
    for (const mechanic of MECHANICS) {
      const boss = bossFor(mechanic)!;
      for (const other of MECHANICS) {
        expect(bossPresentsMoment(boss, other)).toBe(mechanic === other);
      }
    }
  });

  test('NEGATIVE: no standard opponent presents any boss moment', () => {
    const standard = ALL_OPPONENTS.filter((o) => o.isBoss !== true);
    // The roster really does have standard opponents to sweep — otherwise this
    // negative would be vacuous.
    expect(standard.length).toBeGreaterThan(3);
    for (const opponent of standard) {
      for (const mechanic of MECHANICS) {
        expect(bossPresentsMoment(opponent, mechanic)).toBe(false);
      }
      // …and the identity read is empty too: zero effects, not one.
      expect(bossPresentationMoments(opponent)).toEqual([]);
    }
  });

  test('NEGATIVE: the shipped standard opponents that carry a mechanic-less config', () => {
    // Marcus (the tutorial), Flaccus, Cassius, Drusus and the Doctore's Test are
    // the standard duels a new player actually fights.
    for (const id of ['opp_marcus', 'opp_flaccus', 'opp_hoplite', 'opp_centurion_drusus']) {
      const opponent = ALL_OPPONENTS.find((o) => o.id === id)!;
      expect(opponent.isBoss).not.toBe(true);
      expect(bossPresentationMoments(opponent)).toEqual([]);
    }
    expect(DOCTORE_TEST_OPPONENT.isBoss).not.toBe(true);
    expect(bossPresentationMoments(DOCTORE_TEST_OPPONENT)).toEqual([]);
  });

  test('NEGATIVE: a non-boss carrying a boss mechanic still presents nothing', () => {
    for (const mechanic of MECHANICS) {
      const impostor = { isBoss: false, bossMechanic: mechanic };
      for (const other of MECHANICS) {
        expect(bossPresentsMoment(impostor, other)).toBe(false);
      }
      expect(bossPresentationMoments(impostor)).toEqual([]);
    }
  });

  test('NEGATIVE: isBoss alone, with no mechanic, presents nothing', () => {
    expect(bossPresentationMoments({ isBoss: true })).toEqual([]);
    for (const mechanic of MECHANICS) {
      expect(bossPresentsMoment({ isBoss: true }, mechanic)).toBe(false);
    }
  });

  test('a missing opponent is safe and presents nothing', () => {
    for (const mechanic of MECHANICS) {
      expect(bossPresentsMoment(undefined, mechanic)).toBe(false);
      expect(bossPresentsMoment(null, mechanic)).toBe(false);
    }
    expect(bossPresentationMoments(undefined)).toEqual([]);
    expect(bossPresentationMoments(null)).toEqual([]);
  });

  test('the roster’s four moment owners are exactly the four LADDER bosses', () => {
    // D-1 — a FEATURE bout is a boss but owns NO presentation moment, so the
    // owners are the LADDER's four; the feature five are asserted separately.
    const ladderBosses = ALL_OPPONENTS.filter(
      (o) => o.isBoss === true && o.featureBout !== true
    );
    const owners = ALL_OPPONENTS.filter((o) => bossPresentationMoments(o).length > 0);
    expect(owners.map((o) => o.id).sort()).toEqual(ladderBosses.map((o) => o.id).sort());
    expect(owners).toHaveLength(4);
    // Each owns exactly ONE moment — no boss gets a second boss's moment.
    for (const owner of owners) expect(bossPresentationMoments(owner)).toHaveLength(1);
    // …and every FEATURE boss presents nothing at all, though it is a boss.
    const featureBosses = ALL_OPPONENTS.filter((o) => o.featureBout === true);
    expect(featureBosses).toHaveLength(5);
    for (const bout of featureBosses) {
      expect(bout.isBoss).toBe(true);
      expect(bossPresentationMoments(bout)).toEqual([]);
      for (const mechanic of MECHANICS) expect(bossPresentsMoment(bout, mechanic)).toBe(false);
      // Its OWN mechanic owns no moment either — the data is inert this slice.
      expect(bossPresentationMoments({ isBoss: true, bossMechanic: bout.bossMechanic })).toEqual([]);
    }
  });

  test('every presentation site in the duel is behind the gate', () => {
    const gates = DUEL_SCENE.match(/bossPresentsMoment\(/g) ?? [];
    // Four moments, four calls: rage, phase switch, counter, telegraph glow.
    expect(gates).toHaveLength(4);
    expect(DUEL_SCENE).toContain("bossPresentsMoment(opponent, 'rage_mode_colossus')");
    expect(DUEL_SCENE).toContain("bossPresentsMoment(opponent, 'phase_weapon_switch')");
    expect(DUEL_SCENE).toContain("bossPresentsMoment(opponent, 'counter_dodge')");
    expect(DUEL_SCENE).toContain("bossPresentsMoment(opponent, 'heavy_telegraph')");
  });

  test('no effect is reachable outside its gate', () => {
    // Each effect appears exactly once in the scene, and each time inside the
    // block its own gate opens.
    expect((DUEL_SCENE.match(/sounds\.playWeaponDraw\(\)/g) ?? []).length).toBe(1);
    const phaseSite = DUEL_SCENE.indexOf('sounds.playWeaponDraw();');
    expect(
      blockAfter(DUEL_SCENE, "if (bossPresentsMoment(opponent, 'phase_weapon_switch'))"),
    ).toContain('sounds.playWeaponDraw();');
    expect(phaseSite).toBeGreaterThan(-1);

    expect((DUEL_SCENE.match(/setBossVignettePulse\(Date\.now\(\)\)/g) ?? []).length).toBe(1);
    expect(
      blockAfter(DUEL_SCENE, "if (bossPresentsMoment(opponent, 'rage_mode_colossus'))"),
    ).toContain('setBossVignettePulse(Date.now());');

    // The counter's burst is the scene's fourth `burst('sand'` — the three CF-4
    // call sites are untouched — and it sits inside the counter gate.
    expect((DUEL_SCENE.match(/burst\('sand'/g) ?? []).length).toBe(2);
    expect(
      blockAfter(DUEL_SCENE, "if (bossPresentsMoment(opponent, 'counter_dodge'))"),
    ).toContain("burst('sand'");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §B — rage
// ══════════════════════════════════════════════════════════════════════════
describe('CF-6 §B — the rage effect', () => {
  test('the briefing’s numbers', () => {
    expect(BOSS_RAGE_TRAUMA).toBe(0.5);
    expect(BOSS_VIGNETTE_MS).toBe(700);
  });

  test('the rage effect adds exactly +0.5 trauma to the existing impact ref', () => {
    const block = blockAfter(DUEL_SCENE, "if (bossPresentsMoment(opponent, 'rage_mode_colossus'))");
    expect(block).toContain(
      'impactRef.current.trauma = Math.min(1, impactRef.current.trauma + BOSS_RAGE_TRAUMA);',
    );
    // ADDED to the CF-1 system, never a second one: no new shake ref, no timer.
    expect(DUEL_SCENE.match(/trauma:/g) ?? []).toHaveLength(1);
    expect(block).not.toContain('setTimeout');
  });

  test('it swells the crowd through CF-3’s own engine', () => {
    const block = blockAfter(DUEL_SCENE, "if (bossPresentsMoment(opponent, 'rage_mode_colossus'))");
    expect(block).toContain('sounds.playCrowdSwell();');
    // The engine method the block calls is CF-3's, unchanged.
    expect(SOUND_EFFECTS).toContain('public playCrowdSwell(): void {');
  });

  test('it sets the HUD vignette prop with a timestamp', () => {
    const block = blockAfter(DUEL_SCENE, "if (bossPresentsMoment(opponent, 'rage_mode_colossus'))");
    expect(block).toContain('setBossVignettePulse(Date.now());');
    expect(DUEL_SCENE).toContain(
      'const [bossVignettePulse, setBossVignettePulse] = useState<number | undefined>(undefined);',
    );
    expect(DUEL_SCENE).toContain('bossVignettePulse={bossVignettePulse}');
  });

  test('it fires after the mechanic, so rage itself is already resolved', () => {
    const at = DUEL_SCENE.indexOf('rageActivatedRef.current = true;');
    const gate = DUEL_SCENE.indexOf("if (bossPresentsMoment(opponent, 'rage_mode_colossus'))");
    expect(at).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(at);
    expect(DUEL_SCENE).toContain("setOpp((prev) => ({ ...prev, isRaged: true }));");
  });

  test('the HUD renders it as one keyed, non-interactive, opacity-only 700 ms pulse', () => {
    expect(COMBAT_HUD).toContain('bossVignettePulse?: number;');
    expect(COMBAT_HUD).toContain('{bossVignettePulse !== undefined && (');
    expect(COMBAT_HUD).toContain('key={bossVignettePulse}');
    expect(COMBAT_HUD).toContain('className="boss-vignette-pulse"');
    // The 700 ms animation, its opacity-only keyframes and pointer-events: none.
    expect(INDEX_CSS).toContain('@keyframes boss-vignette-pulse');
    expect(INDEX_CSS).toMatch(/animation:\s*boss-vignette-pulse 700ms/);
    const cssBlock = INDEX_CSS.slice(INDEX_CSS.indexOf('@keyframes boss-vignette-pulse'));
    expect(cssBlock).toContain('pointer-events: none;');
    const frames = cssBlock.slice(0, cssBlock.indexOf('.boss-vignette-pulse'));
    // Every declared property is opacity: the house motion law.
    const declared = frames.match(/[a-z-]+\s*:/g) ?? [];
    expect(declared.every((d) => d.trim() === 'opacity:')).toBe(true);
    // The HUD's own div carries no inline interaction either.
    expect(COMBAT_HUD).toContain('aria-hidden="true"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §C — the telegraph glow
// ══════════════════════════════════════════════════════════════════════════
describe('CF-6 §C — the telegraph glow', () => {
  test('the colour and rate are the briefing’s', () => {
    expect(TELEGRAPH_GLOW_COLOR).toBe('#ff2222');
    expect(TELEGRAPH_GLOW_HZ).toBe(2);
    expect(TELEGRAPH_GLOW_MIN).toBeGreaterThan(0);
    expect(TELEGRAPH_GLOW_MAX).toBe(0.8);
  });

  test('the pulse is a continuous 2 Hz sine between its floor and ceiling', () => {
    // A 2 Hz pulse repeats every 0.5 s.
    for (const t of [0, 0.13, 0.4, 1.7, 12.345]) {
      expect(telegraphGlowIntensity(t)).toBeCloseTo(telegraphGlowIntensity(t + 0.5), 9);
    }
    // Its extremes are the design's, within a sampled step.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 2000; i += 1) {
      const v = telegraphGlowIntensity(i / 1000);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(max).toBeCloseTo(TELEGRAPH_GLOW_MAX, 2);
    expect(min).toBeCloseTo(TELEGRAPH_GLOW_MIN, 2);
    // Two crests per second: sampled at 1/100 s over 4 s, the local maxima above
    // the band's midpoint are the crests — eight of them, not nine and not six.
    const midpoint = (TELEGRAPH_GLOW_MIN + TELEGRAPH_GLOW_MAX) / 2;
    let crests = 0;
    for (let i = 1; i < 399; i += 1) {
      const prev = telegraphGlowIntensity((i - 1) / 100);
      const cur = telegraphGlowIntensity(i / 100);
      const next = telegraphGlowIntensity((i + 1) / 100);
      if (cur > prev && cur >= next && cur > midpoint) crests += 1;
    }
    expect(crests).toBeGreaterThanOrEqual(8);
    expect(crests).toBeLessThanOrEqual(8);
    for (let i = 0; i < 500; i += 1) {
      const v = telegraphGlowIntensity(i / 97);
      expect(v).toBeGreaterThanOrEqual(TELEGRAPH_GLOW_MIN - 1e-9);
      expect(v).toBeLessThanOrEqual(TELEGRAPH_GLOW_MAX + 1e-9);
    }
    // A frame the clock could not measure is the trough, not a flash.
    expect(telegraphGlowIntensity(Number.NaN)).toBe(TELEGRAPH_GLOW_MIN);
    expect(telegraphGlowIntensity(Infinity)).toBe(TELEGRAPH_GLOW_MIN);
  });

  test('the duel passes it for the boss only, while telegraphText is set', () => {
    const at = DUEL_SCENE.indexOf('telegraphGlow={');
    expect(at).toBeGreaterThan(-1);
    const prop = DUEL_SCENE.slice(at, DUEL_SCENE.indexOf('}', at) + 1);
    expect(prop).toContain('Boolean(opp.telegraphText)');
    expect(prop).toContain("bossPresentsMoment(opponent, 'heavy_telegraph')");
    // The player's mesh is untouched: no glow prop on it at all.
    expect(DUEL_SCENE).toContain(
      '<GladiatorMesh fighter={player} isLeftyMode={isLeftyMode} impactRef={impactRef} />',
    );
  });

  test('the mesh consumes it through the EXISTING emissive path', () => {
    expect(GLADIATOR_MESH).toContain('telegraphGlow?: boolean;');
    // The one emissive write in the rigged path now carries all three modes.
    expect((GLADIATOR_MESH.match(/\.emissive\.copy\(/g) ?? []).length).toBe(1);
    expect(GLADIATOR_MESH).toContain('TELEGRAPH_GLOW_COLOR_VALUE');
    expect(GLADIATOR_MESH).toContain('telegraphGlowIntensity(');
    // No second highlight system: no additional material flag, no new mesh. The
    // emissive intensity has exactly two writers — the mode change and the pulse.
    expect(GLADIATOR_MESH.match(/emissiveIntensity =/g) ?? []).toHaveLength(2);
    expect(GLADIATOR_MESH).not.toContain('onBeforeCompile');
    // A landed blow always wins, so the two can never fight over a material.
    expect(GLADIATOR_MESH).toContain('const isTelegraphing = !isHit && telegraphGlow === true;');
  });

  test('it clears when telegraphText clears', () => {
    // The prop is derived from `opp.telegraphText` on every render, and the
    // telegraph site is the ONLY writer of that field.
    const clears = DUEL_SCENE.match(/telegraphText: undefined/g) ?? [];
    expect(clears.length).toBeGreaterThanOrEqual(3);
    const sets = DUEL_SCENE.match(/telegraphText: 'HEAVY ATTACK INCOMING'/g) ?? [];
    expect(sets).toHaveLength(1);
    // The emissive mode falls back to resting (0) the moment the prop is false.
    expect(GLADIATOR_MESH).toContain('const emissiveMode = isHit ? 2 : isTelegraphing ? 1 : 0;');
    expect(GLADIATOR_MESH).toContain('HIT_FLASH_RESET_COLOR');
  });

  test('the telegraph’s own timing is untouched — one full turn to answer', () => {
    // The announce branch still only arms the pending heavy and posts the text.
    const announce = blockAfter(DUEL_SCENE, "else if (actionType === 'telegraph')");
    expect(announce).toContain('pendingHeavyAttackRef.current = true;');
    expect(announce).not.toContain('setTimeout');
    expect(announce).not.toContain('glow');
    // The resolution still comes from the AI effect's own branch, unchanged.
    expect(DUEL_SCENE).toContain(
      "if (opponent.bossMechanic === 'heavy_telegraph' && pendingHeavyAttackRef.current) {",
    );
    expect(DUEL_SCENE).toContain('telegraph: 1450,');
    // No new timer, flag or delay anywhere the glow is wired.
    const glowSites = DUEL_SCENE.match(/telegraphGlow=[\s\S]{0,200}?\}\s*\/>/g) ?? [];
    expect(glowSites).toHaveLength(1);
    expect(glowSites[0]).not.toContain('setTimeout');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §D — the phase switch
// ══════════════════════════════════════════════════════════════════════════
describe('CF-6 §D — the phase switch', () => {
  test('the draw is a 0.25 s high-passed noise sweep plus a 1200 Hz sine ping', () => {
    expect(WEAPON_DRAW_SECONDS).toBe(0.25);
    expect(WEAPON_DRAW_PING_HZ).toBe(1200);
    expect(WEAPON_DRAW_SWEEP_TO_HZ).toBeGreaterThan(WEAPON_DRAW_SWEEP_FROM_HZ);
    expect(WEAPON_DRAW_NOISE_GAIN).toBeGreaterThan(0);

    const { engine, ctx } = createEngineWithFakeAudio();
    engine.playWeaponDraw();

    // One noise source, one highpass, one ping oscillator — nothing else.
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.filters).toHaveLength(1);
    expect(ctx.oscillators).toHaveLength(1);

    // The sweep: a high-pass whose corner rises over the draw's own 0.25 s.
    const filter = ctx.filters[0];
    expect(filter.type).toBe('highpass');
    expect(filter.frequency.calls[0]).toEqual({ kind: 'set', value: WEAPON_DRAW_SWEEP_FROM_HZ, time: 0 });
    expect(filter.frequency.calls[1]).toEqual({
      kind: 'exp',
      value: WEAPON_DRAW_SWEEP_TO_HZ,
      time: WEAPON_DRAW_SECONDS,
    });

    // The noise source is started and stopped inside the draw's window.
    const noise = ctx.sources[0];
    expect(noise.buffer).not.toBeNull();
    expect(noise.started).toBe(true);
    expect(noise.stoppedAt).toBeCloseTo(WEAPON_DRAW_SECONDS, 9);

    // The ping: a sine at 1200 Hz, struck at the same instant.
    const ping = ctx.oscillators[0];
    expect(ping.type).toBe('sine');
    expect(ping.frequency.calls[0]).toEqual({ kind: 'set', value: WEAPON_DRAW_PING_HZ, time: 0 });
    expect(ping.started).toBe(true);
  });

  test('a muted engine plays nothing', () => {
    const { engine, ctx } = createEngineWithFakeAudio();
    engine.isMuted = true;
    engine.playWeaponDraw();
    expect(ctx.sources).toHaveLength(0);
    expect(ctx.oscillators).toHaveLength(0);
    expect(ctx.filters).toHaveLength(0);
  });

  test('it is called once, inside the phase-switch effect, for the boss only', () => {
    expect((DUEL_SCENE.match(/sounds\.playWeaponDraw\(\)/g) ?? []).length).toBe(1);
    const effect = DUEL_SCENE.slice(DUEL_SCENE.indexOf('phaseSwitchedRef.current = true;'));
    expect(effect).toContain('sounds.playWeaponDraw();');
    const gate = effect.indexOf("if (bossPresentsMoment(opponent, 'phase_weapon_switch'))");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(effect.indexOf('sounds.playWeaponDraw();'));
  });

  test('the white flash was SKIPPED, and this is why (the mesh has no colour override)', () => {
    // The mesh's flash is the fixed red hit reaction, fired only by an action
    // transition to 'hit'. There is no colour prop and no second trigger.
    expect(GLADIATOR_MESH).toContain("const HIT_FLASH_COLOR = new THREE.Color('#ff0000');");
    expect(GLADIATOR_MESH).toContain("if (fighter.action === 'hit' && lastActionRef.current !== 'hit')");
    expect(GLADIATOR_MESH).not.toContain('flashColor');
    expect(GLADIATOR_MESH).not.toContain('flashTint');
    // …so the phase-switch effect adds no flash: it does not fake a hit pose and
    // does not touch the flash timer.
    const from = DUEL_SCENE.indexOf('phaseSwitchedRef.current = true;');
    const effect = DUEL_SCENE.slice(from, DUEL_SCENE.indexOf('}, [', from));
    expect(effect).toContain('sounds.playWeaponDraw();');
    expect(effect).not.toContain('hitFlashTimer');
    expect(effect).not.toContain("action: 'hit'");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §E — the counter-dodge
// ══════════════════════════════════════════════════════════════════════════
describe('CF-6 §E — the counter-dodge', () => {
  test('a sand burst fires at the boss’s own position when the counter is queued', () => {
    const block = blockAfter(DUEL_SCENE, "if (bossPresentsMoment(opponent, 'counter_dodge'))");
    expect(block).toContain("impactParticlesRef.current?.burst('sand', [");
    expect(block).toContain('defender.position[0],');
    expect(block).toContain('defender.position[1] + 1.2,');
    expect(block).toContain('defender.position[2],');
    // Sand is CF-4's own recipe: no direction argument, no new pool.
    expect(block).not.toContain('burstDir');
    expect(block).not.toContain('new THREE');
  });

  test('it fires on the queue, with the evaded boss as the defender', () => {
    // The gate sits in the same branch that sets `pendingCounterRef`, i.e. the
    // turn Valéria's passive dodge actually succeeded.
    const queue = blockAfter(DUEL_SCENE, 'if (isActorPlayer && opponent.bossMechanic === \'counter_dodge\')');
    expect(queue).toContain('pendingCounterRef.current = true;');
    expect(queue).toContain("if (bossPresentsMoment(opponent, 'counter_dodge'))");
    expect(queue.indexOf('pendingCounterRef.current = true;')).toBeLessThan(
      queue.indexOf("if (bossPresentsMoment(opponent, 'counter_dodge'))"),
    );
  });

  test('the counter itself is unchanged', () => {
    expect(DUEL_SCENE).toContain('Math.random() < opponent.dodgeChance');
    expect(DUEL_SCENE).toContain("if (opponent.bossMechanic === 'counter_dodge' && pendingCounterRef.current) {");
    expect(DUEL_SCENE).toContain("counterStrikeRef.current = true;");
    expect(DUEL_SCENE).toContain("executeCombatTurn('opponent', 'quick_attack');");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §F — the mechanics themselves: triggers, rates, damage, timing
// ══════════════════════════════════════════════════════════════════════════
describe('CF-6 §F — mechanics, rates and timing unchanged', () => {
  test('the telegraph announce rate is still ~30 % and its own guards are unchanged', () => {
    expect(DUEL_SCENE).toContain('Math.random() < 0.30');
    expect(DUEL_SCENE).toContain("opponent.bossMechanic === 'heavy_telegraph' &&");
    expect(DUEL_SCENE).toContain('!pendingHeavyAttackRef.current &&');
    expect(DUEL_SCENE).toContain('dist <= effectiveRange &&');
    expect(DUEL_SCENE).toContain('opp.stamina >= oppHeavyCost &&');
  });

  test('the rage and phase-switch thresholds are still 50 %', () => {
    expect(DUEL_SCENE).toContain(
      'shouldActivateRage(opponent.bossMechanic, opp.health, opp.stats.healthMax, rageActivatedRef.current)',
    );
    expect(DUEL_SCENE).toContain('const threshold = opp.stats.healthMax * 0.5;');
  });

  test('the CF-5 pace table and the AI delay are byte-identical', () => {
    expect(DUEL_SCENE).toContain('quick_attack: 880,');
    expect(DUEL_SCENE).toContain('power_attack: 1300,');
    expect(DUEL_SCENE).toContain('telegraph: 1450,');
    expect(DUEL_SCENE).toContain('cast_net: 880,');
    expect(DUEL_SCENE).toContain('const AI_TURN_DELAY_MS = 750;');
    expect(DUEL_SCENE).toContain('const AI_TURN_DELAY_AFTER_TELEGRAPH_MS = 900;');
    expect(DUEL_SCENE).toContain('const TURN_RESOLUTION_DEATH_MS = 1600;');
  });

  test('the CF-1 hit-stop and trauma tables are byte-identical', () => {
    expect(DUEL_SCENE).toContain('telegraphedHeavy: 200,');
    expect(DUEL_SCENE).toContain('quick: 0.25,');
    expect(DUEL_SCENE).toContain('power: 0.45,');
    expect(DUEL_SCENE).toContain('crit: 0.7,');
    expect(DUEL_SCENE).toContain('playerHit: 0.2,');
    expect(DUEL_SCENE).toContain('const CAMERA_SHAKE_TRAUMA_DECAY = 1.6;');
  });

  test('the damage pipeline is not touched by any boss presentation', () => {
    // One damage formula, one call, and no boss-presentation token inside it.
    expect((DUEL_SCENE.match(/calculateAttackDamage\(/g) ?? []).length).toBe(2);
    const call = DUEL_SCENE.slice(DUEL_SCENE.indexOf('const rawDamage = calculateAttackDamage('));
    const body = call.slice(0, call.indexOf(');') + 2);
    expect(body).not.toContain('bossPresentsMoment');
    expect(body).not.toContain('trauma');
    expect(body).not.toContain('Vignette');
    // The boss palmae's own helpers are untouched.
    expect(DUEL_SCENE).toContain('applyPitBellowerDrain(prev.stamina, bellowerDrain)');
    expect(DUEL_SCENE).toContain('applyPyreBrandHeal(prev.health, prev.stats.healthMax, pyreHeal)');
  });

  test('no profile field, save write or handedness change was introduced', () => {
    // The presentation module cannot reach a save, a clock or the storage layer.
    const module_ = stripComments(source('../../src/utils/bossPresentation.ts'));
    expect(module_).not.toContain('localStorage');
    expect(module_).not.toContain('sessionStorage');
    expect(module_).not.toContain('saveProfile');
    expect(module_).not.toContain('performance.now');
    expect(module_).not.toContain('Math.random');
    expect(DUEL_SCENE).not.toContain('isLeftyMode={telegraphGlow');
    expect(DUEL_SCENE).toContain(
      '<GladiatorMesh fighter={player} isLeftyMode={isLeftyMode} impactRef={impactRef} />',
    );
  });
});
