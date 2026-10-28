/**
 * CF-3 — the crowd becomes a crowd: the hype payoff and the crowd audio bed.
 *
 * Run with: `bun test src/utils/crowdHype.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  tier-crossing detection — upward crossings at 40 and 75 fire a level,
 *       a swell and a pulse (driven through a recording engine); downward ones
 *       only set the level; and there is NO event at the boundary reached from
 *       below, because the tier rule is CombatHUD's own strict `>` — hype 40 is
 *       still LOW and 75 is still HIGH. The HUD's expression is read from its
 *       source so the two can never drift apart.
 *   §B  the gain table and the bed's lifecycle — 0.015 / 0.04 / 0.075 with
 *       0.4 s ramps, one looping 2 s brown-noise source through a 500 Hz
 *       lowpass, an idempotent start, a stop that ramps out and stops the
 *       source, no swell without a running bed, and total no-ops while muted.
 *   §C  the celebration bounce — a 0.12 peak inside a 600 ms decaying two-hop
 *       curve that is exactly 0 before and after, and the pulse-counter step
 *       that starts it (and only when the counter CHANGES).
 *   §D  the wiring — updateCrowdHype holds the crossing, the crit branch
 *       swells, the bed is started on mount and stopped on unmount, the arena
 *       receives the pulse ref, and every hype number in the scene is still
 *       byte-identical to what it was before CF-3.
 *   §E  the arena's structure — both crowd rings in ONE group, the walls,
 *       braziers and loge outside it, and the crowd's own geometry unchanged.
 *
 * The audio tests run against a RECORDING fake AudioContext (no real Web
 * Audio in bun) installed as `window.AudioContext`; nothing here plays a sound.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CROWD_BOUNCE_AMPLITUDE,
  CROWD_BOUNCE_DURATION_MS,
  CROWD_HYPE_TIER_HIGH,
  CROWD_HYPE_TIER_MAX,
  createCrowdBounce,
  crowdBounceOffset,
  crowdHypeTier,
  detectCrowdHypeCrossing,
  stepCrowdBounce,
} from './crowdHype';
import { CROWD_BED_GAINS, SoundFXEngine, type CrowdBedLevel } from '../audio/soundEffects';
// C-8.70C — the opening hype's one reader, so the seed's numbers are still pinned.
import { modeCrowdStartHype } from '../data/boutModes';

// ── Sources ────────────────────────────────────────────────────────────────
const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const source = (rel: string): string => readFileSync(path(rel), 'utf8');
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const DUEL_SCENE = source('../../src/components/duel/DuelScene.tsx');
const DUEL_ARENA = source('../../src/components/3d/DuelArena.tsx');
const COMBAT_HUD = source('../../src/components/ui/CombatHUD.tsx');

// ── A recording fake Web Audio context ─────────────────────────────────────
type ParamCall = { kind: 'set' | 'ramp' | 'cancel'; value: number; time: number };

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
  cancelScheduledValues(time: number) {
    this.calls.push({ kind: 'cancel', value: Number.NaN, time });
  }
  /** The last value the engine asked the param to reach. */
  get lastTarget(): number | null {
    for (let i = this.calls.length - 1; i >= 0; i -= 1) {
      const call = this.calls[i];
      if (call.kind !== 'cancel') return call.value;
    }
    return null;
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
  buffer: { length?: number } | null = null;
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

class FakeBuffer {
  channels: Float32Array[];
  constructor(channelCount: number, public length: number, public sampleRate: number) {
    this.channels = Array.from({ length: channelCount }, () => new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
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
  buffers: FakeBuffer[] = [];
  resume() {
    return Promise.resolve();
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBiquadFilter() {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }
  createBufferSource() {
    const src = new FakeSource();
    this.sources.push(src);
    return src;
  }
  createBuffer(channelCount: number, length: number, sampleRate: number) {
    const buffer = new FakeBuffer(channelCount, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }
}

const hadWindow = typeof (globalThis as { window?: unknown }).window !== 'undefined';
const originalWindow = (globalThis as { window?: unknown }).window;

/**
 * Install a fake `window.AudioContext` whose constructor always answers with
 * ONE context, and hand back the engine that owns it. Two engine instances
 * would otherwise build two contexts and every assertion would read the wrong
 * one — which is exactly what this helper exists to prevent.
 */
const createEngineWithFakeAudio = (): { engine: SoundFXEngine; ctx: FakeAudioContext } => {
  const ctx = new FakeAudioContext();
  const AudioContextCtor = function AudioContextStub() {
    return ctx;
  } as unknown as typeof AudioContext;
  (globalThis as { window?: unknown }).window = { AudioContext: AudioContextCtor };
  const engine = new SoundFXEngine();
  engine.getAudioContext();
  return { engine, ctx };
};

afterEach(() => {
  if (hadWindow) (globalThis as { window?: unknown }).window = originalWindow;
  else delete (globalThis as { window?: unknown }).window;
});

// The bed's node order is levelGain then swellGain in `createGain` order.
const bedNodes = (ctx: FakeAudioContext) => ({
  level: ctx.gains[0],
  swell: ctx.gains[1],
});

// ══════════════════════════════════════════════════════════════════════════
// §A — tier-crossing detection
// ══════════════════════════════════════════════════════════════════════════
describe('CF-3 §A — tier crossing detection', () => {
  test('the boundaries are the HUD’s own and unchanged', () => {
    expect(CROWD_HYPE_TIER_HIGH).toBe(40);
    expect(CROWD_HYPE_TIER_MAX).toBe(75);
    // The HUD's expression, read from its source: strict on both sides.
    expect(COMBAT_HUD).toContain("crowdHype > 75 ? 'MAX' : crowdHype > 40 ? 'HIGH' : 'LOW'");
  });

  test('the tier reading matches the HUD at every boundary', () => {
    expect(crowdHypeTier(0)).toBe(0);
    expect(crowdHypeTier(25)).toBe(0); // the duel's opening hype is LOW
    expect(crowdHypeTier(39)).toBe(0);
    expect(crowdHypeTier(40)).toBe(0); // exactly 40 is still LOW
    expect(crowdHypeTier(41)).toBe(1);
    expect(crowdHypeTier(74)).toBe(1);
    expect(crowdHypeTier(75)).toBe(1); // exactly 75 is still HIGH
    expect(crowdHypeTier(76)).toBe(2);
    expect(crowdHypeTier(100)).toBe(2);
  });

  test('no event at the boundary reached from below or from above', () => {
    // Crossing 40 upward only happens on the value that PASSES it.
    expect(detectCrowdHypeCrossing(39, 40)).toBeNull();
    expect(detectCrowdHypeCrossing(40, 40)).toBeNull();
    expect(detectCrowdHypeCrossing(25, 40)).toBeNull();
    // ... and the same at 75.
    expect(detectCrowdHypeCrossing(74, 75)).toBeNull();
    expect(detectCrowdHypeCrossing(75, 75)).toBeNull();
    // Arriving exactly ON the boundary from above is likewise no crossing.
    expect(detectCrowdHypeCrossing(41, 40)).toEqual({ level: 0, upward: false });
    expect(detectCrowdHypeCrossing(76, 75)).toEqual({ level: 1, upward: false });
  });

  test('upward crossings at 40 and 75 are the only upward events', () => {
    expect(detectCrowdHypeCrossing(40, 41)).toEqual({ level: 1, upward: true });
    expect(detectCrowdHypeCrossing(75, 76)).toEqual({ level: 2, upward: true });
    // A jump that clears both tiers reports the tier it lands in.
    expect(detectCrowdHypeCrossing(25, 80)).toEqual({ level: 2, upward: true });
    // Ordinary increments inside a tier are silent.
    expect(detectCrowdHypeCrossing(25, 33)).toBeNull();
    expect(detectCrowdHypeCrossing(60, 68)).toBeNull();
    expect(detectCrowdHypeCrossing(90, 98)).toBeNull();
  });

  test('downward crossings lower the level and are never “upward”', () => {
    expect(detectCrowdHypeCrossing(41, 40)).toEqual({ level: 0, upward: false });
    expect(detectCrowdHypeCrossing(60, 30)).toEqual({ level: 0, upward: false });
    expect(detectCrowdHypeCrossing(76, 60)).toEqual({ level: 1, upward: false });
    expect(detectCrowdHypeCrossing(90, 10)).toEqual({ level: 0, upward: false });
  });

  test('a crossing is pure — same inputs, same answer, nothing mutated', () => {
    const prev = 40;
    const next = 41;
    expect(detectCrowdHypeCrossing(prev, next)).toEqual(detectCrowdHypeCrossing(prev, next));
    expect(prev).toBe(40);
    expect(next).toBe(41);
  });

  test('the scene fires level + swell + pulse only on an upward crossing', () => {
    const code = stripComments(DUEL_SCENE);
    const block = code.slice(
      code.indexOf('const updateCrowdHype = useCallback'),
      code.indexOf('}, []);', code.indexOf('const updateCrowdHype = useCallback')),
    );
    expect(block).toContain('detectCrowdHypeCrossing(prev, next)');
    expect(block).toContain('sounds.setCrowdLevel(crossing.level);');
    expect(block).toContain('if (crossing.upward) {');
    expect(block).toContain('sounds.playCrowdSwell();');
    expect(block).toContain('crowdPulseRef.current += 1;');
    // The level call is OUTSIDE the upward guard, so a downward crossing still
    // lowers the bed — and neither swell nor pulse appears outside the guard.
    const guarded = block.slice(block.indexOf('if (crossing.upward) {'));
    expect(guarded.indexOf('sounds.setCrowdLevel')).toBe(-1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §B — the gain table and the bed's lifecycle
// ══════════════════════════════════════════════════════════════════════════
describe('CF-3 §B — crowd bed gains and lifecycle', () => {
  let ctx: FakeAudioContext;
  let engine: SoundFXEngine;

  beforeEach(() => {
    ({ engine, ctx } = createEngineWithFakeAudio());
  });

  test('the gain table is exactly 0.015 / 0.04 / 0.075', () => {
    expect([...CROWD_BED_GAINS]).toEqual([0.015, 0.04, 0.075]);
  });

  test('start builds one looping 2 s source through a 500 Hz lowpass', () => {
    engine.startCrowdBed();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.filters).toHaveLength(1);
    const [src] = ctx.sources;
    expect(src.started).toBe(true);
    expect(src.loop).toBe(true);
    expect(ctx.buffers).toHaveLength(1);
    expect(ctx.buffers[0].length).toBe(ctx.sampleRate * 2);
    expect(ctx.filters[0].type).toBe('lowpass');
    expect(ctx.filters[0].frequency.calls[0].value).toBe(500);
  });

  test('the bed fades in to the LOW gain over 0.4 s', () => {
    ctx.currentTime = 10;
    engine.startCrowdBed();
    const { level } = bedNodes(ctx);
    expect(level.gain.calls[0]).toEqual({ kind: 'set', value: 0, time: 10 });
    expect(level.gain.calls[1]).toEqual({ kind: 'ramp', value: 0.015, time: 10.4 });
    // The swell layer starts at neutral.
    expect(bedNodes(ctx).swell.gain.calls[0]).toEqual({ kind: 'set', value: 1, time: 10 });
  });

  test('the brown-noise buffer is finite, non-silent and bounded', () => {
    engine.startCrowdBed();
    const data = ctx.buffers[0].getChannelData(0);
    let peak = 0;
    let energy = 0;
    for (let i = 0; i < data.length; i += 1) {
      expect(Number.isFinite(data[i])).toBe(true);
      peak = Math.max(peak, Math.abs(data[i]));
      energy += data[i] * data[i];
    }
    expect(energy).toBeGreaterThan(0);
    // 3.5× an integrated white signal stays well inside the [-1, 1] rails.
    expect(peak).toBeLessThanOrEqual(1);
  });

  test('start is idempotent — a second call adds no source', () => {
    engine.startCrowdBed();
    engine.startCrowdBed();
    engine.startCrowdBed();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.filters).toHaveLength(1);
  });

  test('each level ramps to its table gain over 0.4 s', () => {
    ctx.currentTime = 2;
    engine.startCrowdBed();
    const { level } = bedNodes(ctx);
    const table: CrowdBedLevel[] = [0, 1, 2];
    const expected = [0.015, 0.04, 0.075];
    table.forEach((tier, index) => {
      level.gain.calls.length = 0;
      ctx.currentTime = 5 + index;
      engine.setCrowdLevel(tier);
      expect(level.gain.lastTarget).toBe(expected[index] as number);
      const ramp = level.gain.calls.find((call) => call.kind === 'ramp');
      expect(ramp?.time).toBeCloseTo(5 + index + 0.4, 10);
    });
  });

  test('an out-of-range level clamps into the table', () => {
    engine.startCrowdBed();
    const { level } = bedNodes(ctx);
    engine.setCrowdLevel(7 as CrowdBedLevel);
    expect(level.gain.lastTarget).toBe(0.075);
    engine.setCrowdLevel(-3 as CrowdBedLevel);
    expect(level.gain.lastTarget).toBe(0.015);
  });

  test('the swell raises the bed 1.8× for 350 ms and returns', () => {
    ctx.currentTime = 3;
    engine.startCrowdBed();
    const { swell } = bedNodes(ctx);
    swell.gain.calls.length = 0;
    engine.playCrowdSwell();
    const ramps = swell.gain.calls.filter((call) => call.kind === 'ramp');
    expect(ramps).toHaveLength(2);
    expect(ramps[0].value).toBeCloseTo(1.8, 10);
    expect(ramps[1].value).toBe(1);
    expect(ramps[1].time - 3).toBeCloseTo(0.35, 10);
  });

  test('the swell is skipped when the bed is not running', () => {
    const { swell } = bedNodesAfterStart();
    swell.gain.calls.length = 0;
    engine.playCrowdSwell();
    expect(swell.gain.calls).toHaveLength(0);
  });

  /** A bed that has been started and stopped, with its swell node to inspect. */
  function bedNodesAfterStart() {
    engine.startCrowdBed();
    const nodes = bedNodes(ctx);
    engine.stopCrowdBed();
    return nodes;
  }

  test('stop ramps out and stops the source', () => {
    ctx.currentTime = 4;
    engine.startCrowdBed();
    const { level } = bedNodes(ctx);
    engine.stopCrowdBed();
    expect(level.gain.lastTarget).toBe(0);
    expect(level.gain.calls[level.gain.calls.length - 1].time).toBeCloseTo(4.4, 10);
    expect(ctx.sources[0].stoppedAt).toBeCloseTo(4.4, 10);
  });

  test('stop is safe when nothing is running, and a later start works again', () => {
    engine.stopCrowdBed();
    expect(ctx.sources).toHaveLength(0);
    engine.startCrowdBed();
    expect(ctx.sources).toHaveLength(1);
    engine.stopCrowdBed();
    engine.startCrowdBed();
    expect(ctx.sources).toHaveLength(2);
  });

  test('muted: start, level and swell are all no-ops', () => {
    engine.setMuted(true);
    engine.startCrowdBed();
    expect(ctx.sources).toHaveLength(0);
    expect(ctx.filters).toHaveLength(0);
    expect(ctx.gains).toHaveLength(0);
    engine.setCrowdLevel(1);
    expect(ctx.gains).toHaveLength(0);
    engine.playCrowdSwell();
    expect(ctx.gains).toHaveLength(0);
  });

  test('muting a running bed tears it down; unmuting restores it', () => {
    engine.startCrowdBed();
    expect(ctx.sources).toHaveLength(1);
    engine.setMuted(true);
    // The one running source was told to stop, so nothing keeps playing.
    expect(ctx.sources[0].stoppedAt).not.toBeNull();
    // Level and swell are inert while muted.
    engine.playCrowdSwell();
    engine.setCrowdLevel(2);
    engine.setMuted(false);
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.sources[1].started).toBe(true);
  });

  test('unmount (stopCrowdBed) leaves nothing running and no swell behind', () => {
    engine.startCrowdBed();
    engine.setCrowdLevel(2);
    engine.stopCrowdBed();
    const { swell } = bedNodes(ctx);
    const before = swell.gain.calls.length;
    engine.playCrowdSwell();
    expect(swell.gain.calls.length).toBe(before);
    expect(ctx.sources[0].stoppedAt).not.toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §C — the celebration bounce
// ══════════════════════════════════════════════════════════════════════════
describe('CF-3 §C — the crowd bounce', () => {
  test('it is 0 before the pulse and exactly 0 once it has settled', () => {
    expect(crowdBounceOffset(-1)).toBe(0);
    expect(crowdBounceOffset(0)).toBe(0);
    expect(crowdBounceOffset(CROWD_BOUNCE_DURATION_MS)).toBe(0);
    expect(crowdBounceOffset(CROWD_BOUNCE_DURATION_MS + 250)).toBe(0);
    expect(crowdBounceOffset(Number.NaN)).toBe(0);
    expect(crowdBounceOffset(Number.POSITIVE_INFINITY)).toBe(0);
  });

  test('its peak is the design amplitude, 0.12', () => {
    let peak = 0;
    let peakAt = 0;
    for (let ms = 0; ms <= CROWD_BOUNCE_DURATION_MS; ms += 0.5) {
      const value = crowdBounceOffset(ms);
      if (value > peak) {
        peak = value;
        peakAt = ms;
      }
    }
    expect(peak).toBeCloseTo(CROWD_BOUNCE_AMPLITUDE, 6);
    // The first hop's crown, a quarter of the way in.
    expect(peakAt).toBeCloseTo(CROWD_BOUNCE_DURATION_MS / 4, 1);
    expect(crowdBounceOffset(150)).toBeCloseTo(0.12, 12);
    // Never above the amplitude anywhere in the curve.
    expect(peak).toBeLessThanOrEqual(CROWD_BOUNCE_AMPLITUDE + 1e-12);
  });

  test('it is a decaying two-hop bounce, not a single lift', () => {
    const first = crowdBounceOffset(150);
    const second = crowdBounceOffset(450);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(first); // decays
    // A dip between the hops: the crowd comes back down before rising again.
    expect(crowdBounceOffset(300)).toBeLessThan(second);
  });

  test('a pulse change starts a bounce; a steady counter does not', () => {
    const bounce = createCrowdBounce(0);
    // Nothing playing yet.
    expect(stepCrowdBounce(bounce, 0, 16)).toBe(0);
    expect(bounce.ageMs).toBeNull();

    // The counter changes → the bounce starts.
    const started = stepCrowdBounce(bounce, 1, 16);
    expect(bounce.ageMs).toBe(16);
    expect(started).toBeGreaterThan(0);

    // A steady counter keeps running the same bounce.
    const next = stepCrowdBounce(bounce, 1, 16);
    expect(bounce.ageMs).toBe(32);
    expect(next).toBeGreaterThan(started);
  });

  test('the bounce settles to 0 and clears itself inside 600 ms', () => {
    const bounce = createCrowdBounce(0);
    stepCrowdBounce(bounce, 1, 16);
    let frames = 1;
    let value = 0;
    while (bounce.ageMs !== null && frames < 200) {
      value = stepCrowdBounce(bounce, 1, 16);
      frames += 1;
    }
    expect(bounce.ageMs).toBeNull();
    expect(value).toBe(0);
    // ~38 frames of 16 ms, comfortably inside the 600 ms budget.
    expect(frames).toBeLessThanOrEqual(Math.ceil(CROWD_BOUNCE_DURATION_MS / 16) + 1);
  });

  test('a new pulse mid-bounce restarts the curve', () => {
    const bounce = createCrowdBounce(0);
    stepCrowdBounce(bounce, 1, 16);
    for (let i = 0; i < 30; i += 1) stepCrowdBounce(bounce, 1, 16);
    const late = stepCrowdBounce(bounce, 2, 16); // a second celebration
    expect(bounce.ageMs).toBe(16);
    // It restarted at the head of the curve, not where the old bounce had got to.
    expect(late).toBeCloseTo(crowdBounceOffset(16), 12);
  });

  test('a bad frame delta cannot move the crowd', () => {
    const bounce = createCrowdBounce(0);
    const value = stepCrowdBounce(bounce, 1, Number.NaN);
    expect(bounce.ageMs).toBe(0);
    expect(value).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §D — the wiring, and the hype numbers
// ══════════════════════════════════════════════════════════════════════════
describe('CF-3 §D — DuelScene wiring', () => {
  test('the bed is started on mount at the opening tier and stopped on unmount', () => {
    const code = stripComments(DUEL_SCENE);
    const start = code.indexOf('sounds.startCrowdBed();');
    expect(start).toBeGreaterThan(-1);
    const effect = code.slice(code.lastIndexOf('useEffect(', start), code.indexOf('}, []);', start));
    expect(effect).toContain('sounds.setCrowdLevel(crowdHypeTier(crowdHypeRef.current));');
    expect(effect).toContain('return () => sounds.stopCrowdBed();');
    // The opening hype is the LOW tier, i.e. level 0 — the same 25 the scene starts on.
    expect(crowdHypeTier(25)).toBe(0);
  });

  test('a crit calls the swell inside the existing isCrit branch', () => {
    const code = stripComments(DUEL_SCENE);
    const critAt = code.indexOf('if (isCrit) {');
    expect(critAt).toBeGreaterThan(-1);
    const branch = code.slice(critAt, code.indexOf('} else {', critAt));
    expect(branch).toContain('sounds.playCrowdSwell();');
    expect(branch).toContain('sounds.playHeavyImpact();');
  });

  test('the arena receives the pulse ref', () => {
    // D-3 rebased this pin, not weakened it: the arena now also receives the
    // loge-banner allegiance, so the mount is written across several lines.
    expect(DUEL_SCENE).toContain('<DuelArena');
    expect(DUEL_SCENE).toContain('crowdPulseRef={crowdPulseRef}');
    expect(DUEL_SCENE).toContain('bannerAllegiance={');
  });

  test('the hype numbers are byte-identical to before CF-3', () => {
    // The opening value, the ref mirror and the peak seed. C-8.70C rebased the
    // three source pins onto the MODE's reader (Sand/Steel still 25); the numbers
    // themselves are asserted through that reader so they cannot drift.
    expect(DUEL_SCENE).toContain('const [crowdHype, setCrowdHype] = useState(openingHype);');
    expect(DUEL_SCENE).toContain('const crowdHypeRef = useRef(openingHype);');
    expect(DUEL_SCENE).toContain('crowdHypePeak: openingHype,');
    expect(modeCrowdStartHype('sand')).toBe(25);
    expect(modeCrowdStartHype('steel')).toBe(25);
    expect(modeCrowdStartHype('invictus')).toBe(40);
    // Every award site, verbatim.
    expect(DUEL_SCENE).toContain('updateCrowdHype((prev) => Math.min(100, prev + (isCrit ? 18 + critHype : 8)));');
    expect(DUEL_SCENE).toContain('const tauntHype = 20 + applyPalmaEvent(playerMods.block, \'taunt\').hypeAdd;');
    expect(DUEL_SCENE).toContain('updateCrowdHype((prev) => Math.min(100, prev + tauntHype));');
    expect(DUEL_SCENE).toContain('updateCrowdHype((prev) => Math.min(100, prev + TWIN_FANGS_LANDED_HYPE));');
    // D-2 — the beast's flight is the fourth award site, and its magnitude is the
    // beast row's own authored value (the taunt's +20), not a constant added here.
    expect(DUEL_SCENE).toContain('updateCrowdHype((prev) => Math.min(100, prev + beastCfg.flightHype));');
    // The peak helper is still the one consumer of the record.
    expect(DUEL_SCENE).toContain('updateHypePeak(statsRef.current.crowdHypePeak, next)');
    // D-3 — a panoply break is the fifth award site, and its magnitude is the row's
    // own `breakHype`, not a constant added here.
    expect(DUEL_SCENE).toContain('updateCrowdHype((prev) => Math.min(100, prev + panoplyCfg.breakHype));');
    // CF-3 added no hype value of its own: it left three award sites. D-2's
    // beast-flight award is the fourth and D-3's panoply break the fifth, both
    // named above so the count cannot drift silently.
    const awards = stripComments(DUEL_SCENE).match(/updateCrowdHype\(\(prev\)/g) ?? [];
    expect(awards).toHaveLength(5);
  });

  test('the scene does not award hype anywhere CF-3 introduced', () => {
    const code = stripComments(DUEL_SCENE);
    const crossingBlock = code.slice(
      code.indexOf('const updateCrowdHype = useCallback'),
      code.indexOf('}, []);', code.indexOf('const updateCrowdHype = useCallback')),
    );
    // The crossing reacts; it never writes hype.
    expect(crossingBlock).not.toContain('Math.min(100');
    expect(crossingBlock).toContain('setCrowdHype(next);');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §E — the arena's structure
// ══════════════════════════════════════════════════════════════════════════
describe('CF-3 §E — DuelArena structure', () => {
  const code = stripComments(DUEL_ARENA);

  test('both crowd rings live in one group driven by the pulse', () => {
    expect(code).toContain('<group ref={crowdGroupRef}>');
    expect(code).toContain('crowdPulseRef?: React.RefObject<number>;');
    expect(code).toContain('stepCrowdBounce(');
    expect(code).toContain('group.position.y =');
  });

  test('the group wraps the crowd and nothing else', () => {
    // Against the RAW source: the section markers are JSX comments, which
    // `stripComments` removes along with the text they carry.
    const open = DUEL_ARENA.indexOf('<group ref={crowdGroupRef}>');
    const braziers = DUEL_ARENA.indexOf('4. ROARING BRONZE ARENA FIRE BRAZIERS');
    expect(open).toBeGreaterThan(-1);
    expect(braziers).toBeGreaterThan(open);
    const crowd = DUEL_ARENA.slice(open, braziers);
    // The crowd's own pieces are inside ...
    expect(crowd).toContain('const rad1 = 22.2;');
    expect(crowd).toContain('const rad2 = 25.8;');
    expect(crowd).toContain('length: 28');
    // ... and no arena element is: no brazier light, no wall/cavea cylinder,
    // no loge, no gate.
    expect(crowd).not.toContain('pointLight');
    expect(crowd).not.toContain('cylinderGeometry');
    expect(crowd).not.toContain('IMPERIAL EMPEROR');
    expect(crowd).not.toContain('PORTA TRIUMPHALIS');
    expect(crowd).not.toContain('boxGeometry args={[10, 3.6, 4.5]}');
  });

  test('the group is balanced — one wrapper, one per-spectator group', () => {
    const open = DUEL_ARENA.indexOf('<group ref={crowdGroupRef}>');
    const braziers = DUEL_ARENA.indexOf('4. ROARING BRONZE ARENA FIRE BRAZIERS');
    const crowd = DUEL_ARENA.slice(open, braziers);
    const opens = (crowd.match(/<group\b/g) ?? []).length;
    const closes = (crowd.match(/<\/group>/g) ?? []).length;
    expect(opens).toBe(2); // the wrapper + the per-spectator template
    expect(closes).toBe(2);
  });

  test('only the crowd group’s Y is animated, and the 56 meshes are unchanged', () => {
    // One and only one position assignment in the whole arena.
    const assignments = code.match(/\.position\.y\s*=/g) ?? [];
    expect(assignments).toHaveLength(1);
    // The crowd's own geometry: two boxes per spectator, 28 spectators.
    expect(code).toContain('<boxGeometry args={[1.2, 1.4, 0.8]} />');
    expect(code).toContain('<boxGeometry args={[1.4, 1.5, 0.8]} />');
    expect(code).toContain('Math.cos(angle) * rad1, 7.8, Math.sin(angle) * rad1');
    expect(code).toContain('Math.cos(angle) * rad2, 11.2, Math.sin(angle) * rad2');
    // Materials untouched.
    expect(code).toContain("ci % 3 === 0 ? '#991b1b' : ci % 2 === 0 ? '#f5f5f4' : '#78350f'");
    expect(code).toContain("ci % 2 === 0 ? '#b45309' : '#e5e5e5'");
  });

  test('the arena still renders every non-crowd element', () => {
    expect(code).toContain('cylinderGeometry args={[20.2, 20.2, 5.0, 36, 1, true]}'); // podium wall
    expect(code).toContain('cylinderGeometry args={[24, 20.6, 3.2, 36, 1, true]}'); // cavea tier 1
    expect(code).toContain('cylinderGeometry args={[28, 24.2, 4.0, 36, 1, true]}'); // cavea tier 2
    expect(code).toContain('arena-torch-');
    expect(code).toContain('arena-gate-');
    expect(code).toContain('imp-col-');
  });
});
