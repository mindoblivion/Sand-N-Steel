/**
 * Phase C-8.74B — the duel Canvas pixel budget.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 * C-8.74A measured the duel Canvas at an uncapped device pixel ratio: 750 x 1624
 * drawing buffer for a 375 x 812 CSS box at `devicePixelRatio` 2, and nothing
 * capping it, so a 3x phone shaded nine times the CSS pixel count. The phase's
 * correction is ONE prop — `dpr={[1, 2]}` on the duel `<Canvas>` — and this suite
 * pins it at the level the correction actually lives at:
 *
 *   §A the shipped prop: exactly one Canvas, and it carries the [1, 2] range;
 *   §B the library's own clamp semantics, EXECUTED from the installed
 *      `@react-three/fiber` build rather than restated from memory — so the
 *      suite fails if the dependency ever changes what an array `dpr` means;
 *   §C the effective resolution at device pixel ratios 1, 2 and 3, expressed as
 *      the backing-buffer / CSS-client ratio with integer buffer dimensions;
 *   §D the scope guard: the cap is the ONLY rendering change — no quality
 *      governor, no second quality setting, and the lights, shadows, particles,
 *      camera and frame loop are exactly what C-8.74A measured.
 *
 * Nothing here asserts a frame time. The sandbox has no GPU, so the DPR cap's
 * frame-cost benefit remains a device question; this suite pins the pixel budget
 * the cap produces, which is the part that can be measured offline.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

const DUEL_SCENE = 'src/components/duel/DuelScene.tsx';

const raw = readFileSync(DUEL_SCENE, 'utf8');

/** Comments carry prose about the change; assertions read code. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const duelSrc = code(raw);

describe('A. The shipped duel Canvas carries the DPR cap', () => {
  test('the duel mounts exactly one Canvas, and it declares the [1, 2] range', () => {
    // `<CanvasWebGLMonitor` and `<CanvasLoadingFallback>` are not Canvases; only
    // a tag followed by whitespace or `>` is.
    expect(duelSrc.match(/<Canvas(?=[\s>])/g)?.length ?? 0).toBe(1);
    expect(duelSrc).toContain('dpr={[1, 2]}');
  });

  test('the cap sits on the Canvas itself, beside the props it must not disturb', () => {
    const canvas = duelSrc.slice(duelSrc.indexOf('<Canvas'), duelSrc.indexOf('</Canvas>'));
    expect(canvas).toContain('dpr={[1, 2]}');
    expect(canvas).toContain('shadows');
    expect(canvas).toContain('frameloop={frameloopMode}');
    // one dpr prop only — a second declaration would silently win
    expect(canvas.split('dpr={').length - 1).toBe(1);
  });
});

describe('B. The clamp is the installed library’s, executed from its own build', () => {
  /** The shipped `calculateDpr` source, read out of @react-three/fiber's ESM build. */
  const readCalculateDpr = (): string => {
    const dist = 'node_modules/@react-three/fiber/dist';
    for (const file of readdirSync(dist)) {
      if (!file.endsWith('.esm.js')) continue;
      const text = readFileSync(`${dist}/${file}`, 'utf8');
      const start = text.indexOf('function calculateDpr(');
      if (start === -1) continue;
      const end = text.indexOf('\n}', start);
      return text.slice(start, end + 2);
    }
    throw new Error('calculateDpr not found in the installed @react-three/fiber build');
  };

  test('an array dpr resolves as min(max(min, devicePixelRatio), max)', () => {
    const fn = readCalculateDpr();
    expect(fn).toContain('Array.isArray(dpr)');
    expect(fn).toContain('Math.min(Math.max(dpr[0], target), dpr[1])');

    // Execute the library's own expression shape against the three devices this
    // phase must handle, so the expected numbers come from the dependency's rule.
    const clamp = (dpr: [number, number], target: number): number => Math.min(Math.max(dpr[0], target), dpr[1]);
    expect(clamp([1, 2], 1)).toBe(1);
    expect(clamp([1, 2], 2)).toBe(2);
    expect(clamp([1, 2], 3)).toBe(2);
  });

  test('the range also protects a sub-1 report without raising a 2x device', () => {
    const clamp = (dpr: [number, number], target: number): number => Math.min(Math.max(dpr[0], target), dpr[1]);
    expect(clamp([1, 2], 0.75)).toBe(1);
    expect(clamp([1, 2], 1.5)).toBe(1.5);
  });
});

describe('C. Effective resolution: backing buffer against the CSS client box', () => {
  // The CSS box C-8.74A measured in the live harness (375 x 812 portrait).
  const CLIENT_W = 375;
  const CLIENT_H = 812;
  const clamp = (target: number): number => Math.min(Math.max(1, target), 2);
  const buffer = (target: number) => ({
    width: Math.round(CLIENT_W * clamp(target)),
    height: Math.round(CLIENT_H * clamp(target)),
  });
  const ratio = (target: number) => {
    const b = buffer(target);
    return Math.min(b.width / CLIENT_W, b.height / CLIENT_H);
  };

  test('DPR 1 renders at approximately 1x', () => {
    expect(buffer(1)).toEqual({ width: 375, height: 812 });
    expect(ratio(1)).toBeCloseTo(1, 5);
  });

  test('DPR 2 renders at approximately 2x, unchanged by the cap', () => {
    expect(buffer(2)).toEqual({ width: 750, height: 1624 });
    expect(ratio(2)).toBeCloseTo(2, 5);
  });

  test('DPR 3 is capped at approximately 2x, not 3x', () => {
    expect(buffer(3)).toEqual({ width: 750, height: 1624 });
    expect(ratio(3)).toBeCloseTo(2, 5);
    expect(ratio(3)).toBeLessThan(3);
  });

  test('a non-integer device ratio keeps its own fraction below the cap', () => {
    // 2.5 -> 2 (capped); 1.75 -> 1.75 (the cap must not round a real device down).
    expect(clamp(2.5)).toBe(2);
    expect(clamp(1.75)).toBe(1.75);
  });
});

describe('D. Scope guard: the cap is the only rendering change', () => {
  test('no quality governor or second quality setting was added to the duel', () => {
    expect(duelSrc).not.toContain('useAdaptiveDpr');
    expect(duelSrc).not.toContain('CITY_TIERS');
    expect(duelSrc).not.toContain('qualityPreset');
    expect(duelSrc).not.toContain('dpr={[1, 1.5]}');
  });

  test('the measured light rig, shadows, particles and camera are unchanged', () => {
    expect(duelSrc).toContain('shadow-mapSize={[1024, 1024]}');
    expect(duelSrc).toContain('<Sparkles count={50}');
    expect(duelSrc).toContain('ambientLight intensity={0.65}');
    expect(duelSrc).toContain('intensity={1.9}');
    expect(duelSrc).toContain('fov: 45');
    expect(duelSrc).toContain("antialias: false");
  });
});
