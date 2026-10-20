/**
 * SF-1 — the quality preset and the city's adaptive DPR engine.
 *
 * Run with: bun test src/utils/adaptiveDpr.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the tier table: three presets, one row each, every band's numbers on the
 *      DPR_STEP grid, Balanced's ceiling the studio budget's own 1.5, and the dust
 *      budget (Cinematic 90 / Balanced 60 / Swift 0);
 *   §B the trimmed EMA: a 30-frame window with its two worst samples dropped, so one
 *      hitch or a garbage collection cannot move the picture;
 *   §C the engine (`stepAdaptiveDpr`) — pure and total: it steps by exactly one
 *      DPR_STEP, never leaves the tier's band, never twice inside DWELL_MS, needs the
 *      sustain and the dwell BOTH before it moves, treats a transition's frames as
 *      no evidence at all, and ignores a frame it cannot measure;
 *   §D the hook and the city scene — the wiring: the engine lives in a ref and
 *      publishes only on a change, the Canvas's `dpr` prop is the scene's own state
 *      (the old constant is gone), the dust is one element whose count is the
 *      tier's, and the drifting atmosphere obeys the motion switch;
 *   §E the settings side — the preset resolves three ways (a name the design uses, a
 *      record written before SF-1, and the first-run default that consults the
 *      cheap-device heuristic), and `getEffectiveAtmosphereMotion` is how Swift and
 *      the player's own motion switch coexist.
 *
 * The pure module is imported and driven; the hook and the scene are read from
 * their shipped sources (a React hook needs a renderer and a frame loop, neither of
 * which exists in the suite), which is this repo's idiom for wiring.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CITY_TIERS,
  DPR_STEP,
  DWELL_MS,
  EMA_ALPHA,
  EMA_TRIM,
  EMA_WINDOW,
  POST_TRANSITION_MS,
  SAMPLE_CLAMP_MS,
  STEP_DOWN_MS,
  STEP_DOWN_SUSTAIN_MS,
  STEP_UP_MS,
  STEP_UP_SUSTAIN_MS,
  createAdaptiveDprState,
  stepAdaptiveDpr,
  trimmedEma,
} from '../hooks/useAdaptiveDpr';
import type { AdaptiveDprState } from '../hooks/useAdaptiveDpr';
import {
  CHEAP_DEVICE_CORES,
  CHEAP_DEVICE_DPR,
  DEFAULT_SETTINGS,
  QUALITY_PRESETS,
  getEffectiveAtmosphereMotion,
  isCheapDevice,
  resolveQualityPreset,
  resolveSettings,
} from '../services/settings';
import type { QualityPreset, Settings } from '../services/settings';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** A source with its comments stripped, so prose cannot satisfy (or defeat) a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const sceneSrc = load('../components/3d/city/CityHubScene.tsx');
const hookSrc = load('../hooks/useAdaptiveDpr.ts');
const settingsSrc = load('../services/settings.ts');
const modalSrc = load('../components/hub/SettingsModal.tsx');

const sceneCode = code(sceneSrc);
const hookCode = code(hookSrc);
const settingsCode = code(settingsSrc);
const modalCode = code(modalSrc);

/** On the engine's own grid? */
const onGrid = (value: number): boolean => Math.abs(value / DPR_STEP - Math.round(value / DPR_STEP)) < 1e-9;

/** Drive the pure engine over `frames` frames of `frameMs`, recording every step. */
function run(
  tier: QualityPreset,
  frames: number,
  frameMs: number,
  from?: AdaptiveDprState,
): { state: AdaptiveDprState; changes: Array<{ atMs: number; dpr: number }>; clockMs: number } {
  let state = from ?? createAdaptiveDprState(tier);
  const changes: Array<{ atMs: number; dpr: number }> = [];
  let clockMs = 0;
  for (let index = 0; index < frames; index += 1) {
    clockMs += frameMs;
    const next = stepAdaptiveDpr(state, tier, frameMs);
    if (next.dpr !== state.dpr) changes.push({ atMs: clockMs, dpr: next.dpr });
    state = next;
  }
  return { state, changes, clockMs };
}

// ══════════════════════════════════════════════════════════════════════════
// A. The tier table
// ══════════════════════════════════════════════════════════════════════════

describe('A. The tier table — one row per preset', () => {
  test('there is exactly one row per preset, and the presets are the design\u2019s three', () => {
    expect(Object.keys(CITY_TIERS).sort()).toEqual(['balanced', 'cinematic', 'swift']);
    expect([...QUALITY_PRESETS]).toEqual(['cinematic', 'balanced', 'swift']);
    for (const preset of QUALITY_PRESETS) expect(CITY_TIERS[preset]).toBeDefined();
  });

  test('every band holds its start, and every number sits on the DPR_STEP grid', () => {
    for (const preset of QUALITY_PRESETS) {
      const { min, max, start } = CITY_TIERS[preset].dpr;
      expect(min, preset).toBeLessThanOrEqual(start);
      expect(start, preset).toBeLessThanOrEqual(max);
      for (const value of [min, max, start]) expect(onGrid(value), `${preset} ${value}`).toBe(true);
    }
    expect(DPR_STEP).toBe(0.25);
  });

  test('Balanced tops out at the studio budget’s 1.5 — the slice’s own reason to exist', () => {
    // The old Canvas constant was `dpr={[1, 2]}`: a device reporting 2 rendered 2.
    expect(CITY_TIERS.balanced.dpr.max).toBe(1.5);
    expect(CITY_TIERS.balanced.dpr.start).toBe(1.5);
    expect(CITY_TIERS.cinematic.dpr.max).toBe(2);
  });

  test('the ceilings descend from Cinematic to Swift, and Swift starts at its floor', () => {
    expect(CITY_TIERS.cinematic.dpr.max).toBeGreaterThan(CITY_TIERS.balanced.dpr.max);
    expect(CITY_TIERS.balanced.dpr.max).toBeGreaterThan(CITY_TIERS.swift.dpr.max);
    // Swift means "this device is struggling": it must not open above the tier below it.
    expect(CITY_TIERS.swift.dpr.start).toBe(CITY_TIERS.swift.dpr.min);
    expect(CITY_TIERS.swift.dpr.start).toBe(1);
    expect(CITY_TIERS.cinematic.dpr.min).toBe(CITY_TIERS.balanced.dpr.max);
  });

  test('the dust budget descends with the tier, and Cinematic is the count the city had', () => {
    expect(CITY_TIERS.cinematic.sparkles).toBe(90);
    expect(CITY_TIERS.balanced.sparkles).toBe(60);
    expect(CITY_TIERS.swift.sparkles).toBe(0);
    expect(CITY_TIERS.cinematic.sparkles).toBeGreaterThan(CITY_TIERS.balanced.sparkles);
    expect(CITY_TIERS.balanced.sparkles).toBeGreaterThan(CITY_TIERS.swift.sparkles);
  });

  test('the engine’s numbers are the ones the design names', () => {
    expect(EMA_WINDOW).toBe(30);
    expect(EMA_TRIM).toBe(2);
    expect(EMA_ALPHA).toBeCloseTo(2 / (EMA_WINDOW - EMA_TRIM + 1), 12);
    expect(SAMPLE_CLAMP_MS).toBe(100);
    expect(STEP_DOWN_MS).toBe(17.5);
    expect(STEP_UP_MS).toBe(12);
    expect(STEP_DOWN_SUSTAIN_MS).toBe(1500);
    expect(STEP_UP_SUSTAIN_MS).toBe(5000);
    expect(DWELL_MS).toBe(3000);
    expect(POST_TRANSITION_MS).toBe(1000);
    // The band's boundaries are multiples of the step, which is what lets a step
    // land exactly on a floor and never one past it.
    for (const value of [STEP_DOWN_SUSTAIN_MS, STEP_UP_SUSTAIN_MS, DWELL_MS, POST_TRANSITION_MS]) {
      expect(onGrid(value)).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The trimmed EMA
// ══════════════════════════════════════════════════════════════════════════

describe('B. The trimmed EMA — one hitch is not a verdict', () => {
  test('an empty window has no reading, and one sample is itself', () => {
    expect(trimmedEma([])).toBeNull();
    expect(trimmedEma([16.7])).toBeCloseTo(16.7, 12);
    expect(trimmedEma([16.7, 16.7])).toBeCloseTo(16.7, 12);
  });

  test('the two worst samples are dropped, so two stalls cannot move the reading', () => {
    expect(trimmedEma([16, 16, 16, 900, 900])).toBeCloseTo(16, 9);
    expect(trimmedEma([8, 8, 8, 8, 400, 500])).toBeCloseTo(8, 9);
  });

  test('the survivors are averaged in arrival order — an EMA is order-sensitive', () => {
    const forward = trimmedEma([10, 30, 12, 14]) as number;
    const reversed = trimmedEma([14, 12, 30, 10]) as number;
    expect(forward).toBeCloseTo(10 + EMA_ALPHA * 2, 9);
    expect(reversed).toBeCloseTo(12 - EMA_ALPHA * 2, 9);
    expect(forward).not.toBeCloseTo(reversed, 6);
  });

  test('at least one sample always survives the trim', () => {
    for (const window of [[5], [5, 9], [5, 9, 40], [5, 9, 40, 900]]) {
      expect(trimmedEma(window), JSON.stringify(window)).not.toBeNull();
    }
    // Three equally bad samples: the trim cannot empty the window.
    expect(trimmedEma([200, 200, 200])).toBeCloseTo(200, 9);
  });

  test('it does not mutate the window it is given', () => {
    const window = [16, 16, 900, 16];
    trimmedEma(window);
    expect(window).toEqual([16, 16, 900, 16]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The engine
// ══════════════════════════════════════════════════════════════════════════

describe('C. stepAdaptiveDpr — pure, total, and banded', () => {
  test('a fresh engine is at its tier’s start, with no history and no step', () => {
    for (const preset of QUALITY_PRESETS) {
      const state = createAdaptiveDprState(preset);
      expect(state.dpr, preset).toBe(CITY_TIERS[preset].dpr.start);
      expect(state.samples).toEqual([]);
      expect(state.ema).toBeNull();
      expect(state.overMs).toBe(0);
      expect(state.underMs).toBe(0);
      expect(state.dwellMs).toBe(0);
      expect(state.suspended).toBe(false);
    }
  });

  test('a smooth 60 fps device holds its tier’s start and never steps', () => {
    const { state, changes } = run('balanced', 1200, 1000 / 60);
    expect(changes).toEqual([]);
    expect(state.dpr).toBe(CITY_TIERS.balanced.dpr.start);
    // 16.7 ms is under STEP_DOWN_MS, so nothing is over budget…
    expect(state.overMs).toBe(0);
    // …and over STEP_UP_MS, so nothing is under it either: a tier's start holds.
    expect(state.dpr).toBe(1.5);
  });

  test('a sustained 30 fps device is stepped down one DPR_STEP at a time to the floor, then held', () => {
    const tier = 'balanced';
    const band = CITY_TIERS[tier].dpr;
    expect(band.min).toBe(1);
    const { state, changes } = run(tier, 1000, 1000 / 30);

    expect(changes.map((change) => change.dpr)).toEqual([1.25, 1]);
    for (const change of changes) expect(onGrid(change.dpr)).toBe(true);
    // Never twice inside the dwell, and never before the sustain and dwell are both met.
    for (let index = 0; index < changes.length; index += 1) {
      const previous = index === 0 ? 0 : changes[index - 1].atMs;
      // (a float sum of 1/30 s frames lands a hair under the round number)
      expect(changes[index].atMs - previous).toBeGreaterThanOrEqual(DWELL_MS - 1e-6);
      // (the dwell is a float sum of 1/30 s frames, hence the tiny epsilon)
      expect(changes[index].atMs).toBeGreaterThanOrEqual(Math.max(STEP_DOWN_SUSTAIN_MS, DWELL_MS) - 1e-6);
    }
    // 33 s of 30 fps is far more evidence than two steps need: the floor is the end.
    expect(state.dpr).toBe(band.min);
    expect(state.overMs).toBeGreaterThanOrEqual(STEP_DOWN_SUSTAIN_MS);
  });

  test('a device that recovers under 12 ms is stepped back up, and stops at the ceiling', () => {
    const tier = 'balanced';
    const band = CITY_TIERS[tier].dpr;
    const slow = run(tier, 1000, 1000 / 30).state;
    expect(slow.dpr).toBe(band.min);

    const { state, changes } = run(tier, 2000, 8, slow);
    expect(changes.map((change) => change.dpr)).toEqual([1.25, 1.5]);
    for (let index = 0; index < changes.length; index += 1) {
      const previous = index === 0 ? 0 : changes[index - 1].atMs;
      expect(changes[index].atMs - previous).toBeGreaterThanOrEqual(STEP_UP_SUSTAIN_MS);
    }
    // 8 ms at 1.5 is still 8 ms: nothing further is owed, and the band's ceiling holds.
    expect(state.dpr).toBe(band.max);
    expect(state.underMs).toBeGreaterThan(STEP_UP_SUSTAIN_MS);
  });

  test('the DPR never leaves the tier’s band, whatever the frames do', () => {
    const script: number[] = [];
    for (let index = 0; index < 900; index += 1) {
      // A deliberately chaotic trace: stalls, 200 fps frames, and long runs of both.
      const phase = index % 97;
      script.push(phase < 20 ? 4 : phase < 40 ? 200 : phase < 60 ? 33.3 : Math.max(1, Math.sin(index) * 40 + 40));
    }
    for (const preset of QUALITY_PRESETS) {
      const band = CITY_TIERS[preset].dpr;
      let state = createAdaptiveDprState(preset);
      for (const frame of script) {
        state = stepAdaptiveDpr(state, preset, frame);
        expect(state.dpr, `${preset} @${frame}`).toBeGreaterThanOrEqual(band.min);
        expect(state.dpr, `${preset} @${frame}`).toBeLessThanOrEqual(band.max);
        expect(onGrid(state.dpr), `${preset} ${state.dpr}`).toBe(true);
      }
      // A chaotic 8 ms stretch has to be able to walk Swift to its ceiling and no further.
      let fast = createAdaptiveDprState(preset);
      for (let index = 0; index < 1400; index += 1) fast = stepAdaptiveDpr(fast, preset, 6);
      expect(fast.dpr, preset).toBe(band.max);
    }
  });

  test('one long frame is clamped and never steps on its own', () => {
    const tier: QualityPreset = 'cinematic';
    const single = stepAdaptiveDpr(createAdaptiveDprState(tier), tier, 5000);
    expect(single.dpr).toBe(CITY_TIERS[tier].dpr.start);
    expect(single.samples).toEqual([SAMPLE_CLAMP_MS]);
    expect(single.ema).toBeCloseTo(SAMPLE_CLAMP_MS, 9);
    expect(single.overMs).toBe(SAMPLE_CLAMP_MS);
    expect(single.overMs).toBeLessThan(STEP_DOWN_SUSTAIN_MS);
    expect(single.dwellMs).toBeLessThan(DWELL_MS);

    // And the trim swallows it: two smooth frames later the reading is smooth again.
    const recovered = run(tier, 60, 1000 / 60, single);
    expect(recovered.changes).toEqual([]);
    expect(recovered.state.overMs).toBe(0);
    expect(recovered.state.ema as number).toBeLessThan(STEP_DOWN_MS);
  });

  test('a frame that cannot be measured is not a frame at all', () => {
    const start = run('swift', 300, 1000 / 30).state;
    expect(start.overMs).toBeGreaterThan(0);
    for (const garbage of [NaN, Infinity, -Infinity, 0, -12.5]) {
      const next = stepAdaptiveDpr(start, 'swift', garbage);
      expect(next, String(garbage)).toBe(start);
      expect(next.samples).toEqual(start.samples);
      expect(next.overMs).toBe(start.overMs);
      expect(next.dwellMs).toBe(start.dwellMs);
    }
  });

  test('a transition’s frames are no evidence, and the timers start clean afterwards', () => {
    const tier: QualityPreset = 'balanced';
    const busy = run(tier, 200, 1000 / 30).state;
    expect(busy.overMs).toBeGreaterThan(0);

    const held = stepAdaptiveDpr(busy, tier, 1000 / 30, true);
    expect(held.suspended).toBe(true);
    expect(held.dpr).toBe(busy.dpr);
    expect(held.overMs).toBe(0);
    expect(held.underMs).toBe(0);
    expect(held.samples).toEqual(busy.samples);

    // While suspended the state is not even rebuilt, so the loop allocates nothing.
    const again = stepAdaptiveDpr(held, tier, 1000 / 30, true);
    expect(again).toBe(held);

    // The first real frame after it is measured normally: the two sustain timers
    // restart clean, while the dwell carries over because no change happened while the
    // transition ran.
    const resumed = stepAdaptiveDpr(held, tier, 1000 / 30, false);
    expect(resumed.suspended).toBe(false);
    expect(resumed.dwellMs).toBeCloseTo(held.dwellMs + 1000 / 30, 6);
    expect(resumed.ema).not.toBeNull();
    // …but the measured window survives a suspension, which is a transition's own frames
    // being ignored rather than the device being forgotten.
    expect(resumed.samples.length).toBe(busy.samples.length);
  });

  test('every step is exactly one DPR_STEP, and nothing else ever moves the value', () => {
    const { changes } = run('cinematic', 1000, 1000 / 30);
    expect(changes.length).toBeGreaterThan(0);
    let previous = CITY_TIERS.cinematic.dpr.start;
    for (const change of changes) {
      expect(Math.abs(change.dpr - previous)).toBeCloseTo(DPR_STEP, 9);
      previous = change.dpr;
    }
    // A step zeroes both sustain timers, so the next step needs its evidence afresh.
    const stepped = run('cinematic', 91, 1000 / 30).state;
    if (stepped.dpr !== CITY_TIERS.cinematic.dpr.start) {
      expect(stepped.overMs).toBeGreaterThanOrEqual(0);
      expect(stepped.dwellMs).toBeLessThan(DWELL_MS);
    }
  });

  test('an under-budget run needs STEP_UP_SUSTAIN_MS, which is longer than the dwell', () => {
    // 5 s of evidence is the design's promise: a slow device is not handed pixels back
    // because a menu was open for three seconds.
    expect(STEP_UP_SUSTAIN_MS).toBeGreaterThan(DWELL_MS);
    const slow = run('balanced', 1000, 1000 / 30).state;
    // The dwell is over: three seconds of evidence is not enough on its own…
    const threeSeconds = run('balanced', Math.ceil(DWELL_MS / 8), 8, slow);
    expect(threeSeconds.changes).toEqual([]);
    // …five seconds of it is, with the window's own settle time allowed for.
    const fiveSeconds = run('balanced', Math.ceil(STEP_UP_SUSTAIN_MS / 8) + 60, 8, slow);
    expect(fiveSeconds.changes.length).toBe(1);
    expect(fiveSeconds.changes[0].dpr).toBe(1.25);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The hook and the city scene
// ══════════════════════════════════════════════════════════════════════════

describe('D. The wiring — one holder of the value', () => {
  test('the engine runs inside the Canvas, from the frame loop', () => {
    expect(hookCode).toContain("from '@react-three/fiber'");
    expect(hookCode).toContain('useFrame(');
    expect(hookCode.match(/useFrame\(/g)?.length).toBe(1);
    expect(sceneCode).toContain('<CityAdaptiveDpr');
    expect(sceneCode.indexOf('<CityAdaptiveDpr')).toBeGreaterThan(sceneCode.indexOf('<Canvas'));
    expect(sceneSrc).toContain('useAdaptiveDpr');
  });

  test('no React work happens per frame — the state is a ref and a step is published once', () => {
    expect(hookCode).toContain('useRef<AdaptiveDprState>');
    expect(hookCode).toContain('stateRef.current');
    expect(hookCode).toContain('publishRef.current');
    // The publication is guarded by an actual change, so a steady device renders nothing.
    expect(hookCode).toContain('if (next.dpr !== state.dpr) publishRef.current(next.dpr)');
    // …and the callback is held in a ref, so an inline arrow cannot reset the engine.
    expect(hookCode).toContain('publishRef.current = onDprChange');
  });

  test('the Canvas’s dpr is the scene’s own state, and the old constant is gone', () => {
    expect(sceneCode).toContain('dpr={cityDpr}');
    expect(sceneCode).not.toContain('dpr={[1, 2]}');
    expect(sceneCode).toContain('useState<number>');
    expect(sceneSrc).toContain('CITY_TIERS[qualityPreset].dpr.start');
    // One holder: the value the engine publishes is the one the Canvas follows.
    expect(sceneCode).toContain('onDprChange={setCityDpr}');
  });

  test('the tier is the player’s setting, and it is read, never written, by the scene', () => {
    expect(sceneCode).toContain('useSettings()');
    expect(sceneCode).toContain('settings.qualityPreset');
    expect(sceneCode).toContain('tier={qualityPreset}');
    expect(sceneCode).toContain('CITY_TIERS[qualityPreset]');
    // The scene applies the tier the moment it changes; the engine never applies it.
    expect(sceneCode).toContain('}, [qualityPreset]);');
    expect(hookCode).not.toContain('setSettings');
  });

  test('the tier also carries the dust budget, through one element', () => {
    expect(sceneCode).toContain('cityTier.sparkles');
    expect(sceneCode).toContain('count={sparklesCount}');
    // One element, always mounted: the tier changes its vertex count, never the
    // number of objects in the scene — so the draw-call count does not depend on it.
    expect(sceneCode.match(/<DreiSparkles/g)?.length).toBe(1);
    expect(sceneCode).not.toContain('{sparklesCount > 0 &&');
    expect(sceneSrc).toContain('DreiSparkles');
  });

  test('the drifting atmosphere obeys the motion switch, and Swift forces that switch off', () => {
    expect(sceneCode).toContain('getEffectiveAtmosphereMotion(settings)');
    expect(sceneCode).toContain('atmosphericMotion ? cityTier.sparkles : 0');
    expect(sceneCode).toContain('<group visible={atmosphericMotion}>');
    expect(sceneCode).toContain('<SandDrift />');
  });

  test('adaptation is suspended for the mounting warm-up and for a fast travel', () => {
    // Two transitions: mount, and the one the player drives.
    expect(sceneCode.match(/suspendAdaptation\(\);/g)?.length).toBe(2);
    expect(sceneCode).toContain('POST_TRANSITION_MS');
    expect(sceneCode).toContain('adaptationSuspendedRef');
    expect(sceneCode).toContain('suspendedRef={adaptationSuspendedRef}');
    expect(hookCode).toContain('suspendedRef.current');
    // The ref is read per frame, so a transition costs no render.
    expect(hookSrc).toContain('Read per frame, so it costs no render.');
  });

  test('SF-1 owns no second store and touches no save', () => {
    expect(hookCode).not.toContain('localStorage');
    expect(hookCode).not.toContain('PROFILE_STORAGE_KEY');
    expect(hookCode).not.toContain('SETTINGS_STORAGE_KEY');
    expect(hookCode).not.toContain('services/storage');
    // The preset's type comes from the settings module, which is the one owner.
    expect(hookCode).toContain("from '../services/settings'");
    expect(settingsCode).toContain("qualityPreset: 'balanced'");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The settings side — the preset, three ways in
// ══════════════════════════════════════════════════════════════════════════

describe('E. The preset — a name, a legacy spelling, or a first-run default', () => {
  test('a name the design uses is the name that comes back', () => {
    for (const preset of QUALITY_PRESETS) expect(resolveQualityPreset(preset)).toBe(preset);
  });

  test('a record written before SF-1 keeps its choice — high is Cinematic, low is Swift', () => {
    expect(resolveQualityPreset('high')).toBe('cinematic');
    expect(resolveQualityPreset('low')).toBe('swift');
  });

  test('anything else falls to the default, which is Balanced on a normal device', () => {
    for (const value of ['nonsense', '', 42, true, null, undefined, ['cinematic'], { preset: 'swift' }]) {
      expect(resolveQualityPreset(value), JSON.stringify(value)).toBe('balanced');
    }
    expect(DEFAULT_SETTINGS.qualityPreset).toBe('balanced');
    expect(resolveQualityPreset('high', { devicePixelRatio: 3, hardwareConcurrency: 4 })).toBe('cinematic');
  });

  test('the cheap-device heuristic needs BOTH a dense screen and few cores', () => {
    expect(isCheapDevice({ devicePixelRatio: 3, hardwareConcurrency: 4 })).toBe(true);
    expect(isCheapDevice({ devicePixelRatio: 2.51, hardwareConcurrency: 4 })).toBe(true);
    expect(isCheapDevice({ devicePixelRatio: 4, hardwareConcurrency: 2 })).toBe(true);
    // Exactly the threshold is NOT past it: the rule is `dpr > 2.5`.
    expect(isCheapDevice({ devicePixelRatio: CHEAP_DEVICE_DPR, hardwareConcurrency: 4 })).toBe(false);
    expect(isCheapDevice({ devicePixelRatio: 3, hardwareConcurrency: CHEAP_DEVICE_CORES + 1 })).toBe(false);
    // A browser that withholds a fact is not evidence of a cheap device.
    expect(isCheapDevice({})).toBe(false);
    expect(isCheapDevice({ devicePixelRatio: 3 })).toBe(false);
    expect(isCheapDevice({ hardwareConcurrency: 4 })).toBe(false);
    expect(isCheapDevice({ devicePixelRatio: 3, hardwareConcurrency: 0 })).toBe(false);
  });

  test('the heuristic is a FIRST-RUN default, never a policy over the player’s choice', () => {
    const cheap = { devicePixelRatio: 3, hardwareConcurrency: 4 };
    expect(resolveSettings({}, false, cheap).qualityPreset).toBe('swift');
    expect(resolveSettings(null, false, cheap).qualityPreset).toBe('swift');
    expect(resolveSettings(undefined, false, cheap).qualityPreset).toBe('swift');
    // A stored choice wins, on a cheap device exactly as on any other…
    expect(resolveSettings({ qualityPreset: 'cinematic' }, false, cheap).qualityPreset).toBe('cinematic');
    expect(resolveSettings({ qualityPreset: 'balanced' }, false, cheap).qualityPreset).toBe('balanced');
    // …and a legacy spelling is a choice too, so it is translated rather than overridden.
    expect(resolveSettings({ qualityPreset: 'low' }, false, cheap).qualityPreset).toBe('swift');
    expect(resolveSettings({ qualityPreset: 'high' }, false, cheap).qualityPreset).toBe('cinematic');
    // A damaged value is not a choice, so the first-run default applies again.
    expect(resolveSettings({ qualityPreset: 'ultra' }, false, cheap).qualityPreset).toBe('swift');
  });

  test('resolution is still total: a preset always comes out, whatever the record is', () => {
    const records: unknown[] = [42, 'nope', [], {}, { qualityPreset: {} }, { qualityPreset: [] }, NaN];
    for (const record of records) {
      const resolved: Settings = resolveSettings(record, false, {});
      expect((QUALITY_PRESETS as readonly string[]).includes(resolved.qualityPreset), JSON.stringify(record)).toBe(true);
    }
  });

  test('the device facts are read from the device, and never invented', () => {
    expect(settingsCode).toContain('readDeviceProfile');
    expect(settingsCode).toContain('window.devicePixelRatio');
    expect(settingsCode).toContain('navigator?.hardwareConcurrency');
    expect(settingsCode).toContain('loadSettings');
    // A missing window (or a browser withholding the facts) is an empty profile, and an
    // empty profile is Balanced.
    expect(settingsCode).toContain("typeof window === 'undefined'");
  });

  test('Swift forces the atmosphere motion off, and the player’s own toggle comes back', () => {
    const drift: Settings = { ...DEFAULT_SETTINGS, atmosphereMotion: true };
    expect(getEffectiveAtmosphereMotion({ ...drift, qualityPreset: 'swift' })).toBe(false);
    expect(getEffectiveAtmosphereMotion({ ...drift, qualityPreset: 'balanced' })).toBe(true);
    expect(getEffectiveAtmosphereMotion({ ...drift, qualityPreset: 'cinematic' })).toBe(true);

    const still: Settings = { ...DEFAULT_SETTINGS, atmosphereMotion: false };
    expect(getEffectiveAtmosphereMotion({ ...still, qualityPreset: 'cinematic' })).toBe(false);

    // The reader is a reader: Swift overrides the toggle while it is active and the
    // stored choice is untouched, which is what makes leaving Swift restore it.
    const record: Settings = { ...DEFAULT_SETTINGS, atmosphereMotion: true, qualityPreset: 'swift' };
    expect(getEffectiveAtmosphereMotion(record)).toBe(false);
    expect(record.atmosphereMotion).toBe(true);
    expect(settingsSrc).toContain("settings.qualityPreset === 'swift' ? false : settings.atmosphereMotion");
  });

  test('the panel offers the row the new consumer made wired', () => {
    expect(modalCode).toContain('qualityOptions');
    expect(modalCode).toContain("{ value: 'cinematic', label: 'Cinematic' }");
    expect(modalCode).toContain("{ value: 'balanced', label: 'Balanced' }");
    expect(modalCode).toContain("{ value: 'swift', label: 'Swift' }");
    expect(modalCode).toContain('value={settings.qualityPreset}');
    expect(modalCode).toContain('onChange={(qualityPreset) => set({ qualityPreset })}');
    expect(modalCode).toContain('label="Picture Quality"');
    // It is written the moment it is chosen, like every other row in this panel.
    expect(modalSrc).toContain('updateSettings');
  });
});
