/**
 * MO-1 — the screen-motion tokens, utilities and their contract.
 *
 * Run with: bun test src/utils/motionTokens.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the tokens: the seven durations and the four easings, at exactly the
 *      values the design names, read out of `index.css`'s own `:root`;
 *   §B the utilities: `.anim-panel` (with its per-origin variants), `.anim-screen`,
 *      `.anim-stagger`, `.anim-stamp` and `.btn-press` — and the concurrency law
 *      as a mechanic rather than a hope: every keyframe in the section animates
 *      `transform`/`opacity` only, the stagger's delay is clamped at its 8th step,
 *      and no `transition-all` (nor a bare `transition: all`) exists anywhere in
 *      the section;
 *   §C `.animate-fadeIn` resolves to the panel token — the house 220 ms it already
 *      used, now spelled as the token;
 *   §D the `[data-motion="reduced"]` block: the SAME four reductions the OS path
 *      applies, with the 60% arithmetic derived from §A's own base values;
 *   §E the app-wide `prefers-reduced-motion` block, checked through one shared
 *      predicate so "the same reductions" is an assertion and not a claim;
 *   §F the wiring: `motion-paused` freezes the utilities, the settings→attribute
 *      resolver is pure and never invents a value, and `App` is where the two root
 *      attributes are written.
 *
 * The suite reads the shipped sources — `src/index.css` for the CSS contract and
 * `src/App.tsx` for the root wiring — and drives the shipped pure resolver with
 * real `Settings` records, so nothing here restates a value the app owns.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { DEFAULT_SETTINGS, resolveMotionAttribute, resolveSettings } from '../services/settings';
import type { ScreenMotion, Settings } from '../services/settings';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const css = load('../index.css');
const appSrc = load('../App.tsx');

/** The MO-1 section, which is where every new declaration lives. */
const MOTION_MARKER = 'SCREEN MOTION (MO-1)';
const motionSection = ((): string => {
  const start = css.indexOf(MOTION_MARKER);
  expect(start, 'the Screen Motion section exists').toBeGreaterThan(-1);
  return css.slice(start);
})();

/**
 * The section with its comments stripped, so prose cannot satisfy (or defeat) a
 * check. The slice above deliberately starts *inside* the section's own header
 * comment (at the MO-1 marker), so the leading partial comment goes first.
 */
const motionCode = motionSection
  .replace(/^[\s\S]*?\*\//, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** The four numbers of a cubic-bezier token. */
const curveNumbers = (value: string): number[] =>
  (tight(value).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** The body of the first block whose opening brace follows `needle`. */
function block(source: string, needle: string): string {
  const start = source.indexOf(needle);
  expect(start, `${needle} exists`).toBeGreaterThan(-1);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${needle}`);
}

/** Every plain `:root { … }` block's declarations, as one bag. */
const baseTokens = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]).join('\n');

/** One custom property's declared value, out of a bag of declarations. */
function token(name: string, bag: string = baseTokens): string {
  const match = bag.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  expect(match, `--${name} is declared`).not.toBeNull();
  return (match as RegExpMatchArray)[1].trim();
}

/** A token value with whitespace removed, so the comparison is value-exact. */
const tight = (value: string): string => value.replace(/\s+/g, '');

/** The design's durations, in the order the section declares them. */
const DURATIONS = ['dur-press', 'dur-micro', 'dur-panel', 'dur-screen', 'dur-ceremony', 'dur-phase'];

/** 60% of a duration token, as the reduced blocks must state it. */
const sixtyPercent = (value: string): string => `${Math.round(parseFloat(value) * 0.6)}ms`;

/**
 * The four reductions, asserted identically against both reduced-motion paths —
 * so "the same reductions" holds as a property, not as a coincidence of two
 * blocks that happen to look alike.
 */
function expectReductions(declarations: string, pressRule: string, label: string): void {
  for (const name of DURATIONS) {
    expect(token(name, declarations), `${label}: ${name} at 60%`).toBe(sixtyPercent(token(name)));
  }
  expect(token('stagger-step', declarations), `${label}: staggers are simultaneous`).toBe('0ms');
  expect(
    [tight(token('ease-out')), 'var(--ease-out)'],
    `${label}: the spring resolves to the plain ease-out`,
  ).toContain(tight(token('ease-spring', declarations)));
  expect(pressRule, `${label}: press is an opacity flash, not a scale`).toContain('transform: none');
  const opacity = pressRule.match(/opacity:\s*([\d.]+)/);
  expect(opacity, `${label}: the press flash states an opacity`).not.toBeNull();
  expect(parseFloat((opacity as RegExpMatchArray)[1]), `${label}: the flash dims`).toBeLessThan(1);
}

/** A Settings record with one screen motion, so the resolver is driven for real. */
const withMotion = (screenMotion?: ScreenMotion): Settings =>
  screenMotion === undefined ? { ...DEFAULT_SETTINGS } : { ...DEFAULT_SETTINGS, screenMotion };

// ══════════════════════════════════════════════════════════════════════════
// A. The tokens
// ══════════════════════════════════════════════════════════════════════════

describe('A. The tokens exist, at the design’s own values', () => {
  test('the seven durations are exactly the design’s', () => {
    expect(token('dur-press')).toBe('90ms');
    expect(token('dur-micro')).toBe('160ms');
    expect(token('dur-panel')).toBe('220ms');
    expect(token('dur-screen')).toBe('420ms');
    expect(token('dur-ceremony')).toBe('700ms');
    expect(token('dur-phase')).toBe('1200ms');
    expect(token('stagger-step')).toBe('45ms');
    // every one is a real CSS time, so a typo cannot pass as a value
    for (const name of [...DURATIONS, 'stagger-step']) {
      expect(token(name), name).toMatch(/^\d+(\.\d+)?m?s$/);
    }
  });

  test('the four easings are exactly the design’s', () => {
    expect(tight(token('ease-out'))).toBe('cubic-bezier(0.22,1,0.36,1)');
    expect(tight(token('ease-inout'))).toBe('cubic-bezier(0.65,0,0.35,1)');
    expect(tight(token('ease-in'))).toBe('cubic-bezier(0.5,0,0.75,0)');
    expect(tight(token('ease-spring'))).toBe('cubic-bezier(0.34,1.4,0.64,1)');
    for (const name of ['ease-out', 'ease-inout', 'ease-in', 'ease-spring']) {
      expect(tight(token(name)), name).toMatch(/^cubic-bezier\((\d+(\.\d+)?,){3}\d+(\.\d+)?\)$/);
    }
  });

  test('the spring is the only overshooting curve, so the swap has something to remove', () => {
    const spring = curveNumbers(token('ease-spring'));
    expect(spring).toEqual([0.34, 1.4, 0.64, 1]);
    // the spring's own y1 exceeds 1 — that overshoot is what reducing removes
    expect(spring[1]).toBeGreaterThan(1);
    for (const name of ['ease-out', 'ease-inout', 'ease-in']) {
      const curve = curveNumbers(token(name));
      expect(curve[1], name).toBeLessThanOrEqual(1);
      expect(curve[3], name).toBeLessThanOrEqual(1);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The utilities, and the concurrency law
// ══════════════════════════════════════════════════════════════════════════

describe('B. The utility classes, and the law they are built to', () => {
  test('every utility ships, and reads its duration from a token', () => {
    for (const selector of ['.anim-panel {', '.anim-screen {', '.anim-stagger > * {', '.anim-stamp {', '.btn-press {']) {
      expect(motionSection, selector).toContain(selector);
    }
    expect(block(motionSection, '.anim-panel {')).toContain('var(--dur-panel)');
    expect(block(motionSection, '.anim-screen {')).toContain('var(--dur-screen)');
    expect(block(motionSection, '.anim-stagger > * {')).toContain('var(--dur-micro)');
    expect(block(motionSection, '.anim-stamp {')).toContain('var(--ease-spring)');
  });

  test('.anim-stamp runs on the ceremony beat, not the panel token', () => {
    const stamp = block(motionSection, '.anim-stamp {');
    expect(stamp).toContain('var(--dur-ceremony)');
    expect(stamp, 'the panel token is the old, wrong retime').not.toContain('var(--dur-panel)');
    // and the token it names is the design's 700 ms, not a second number
    expect(token('dur-ceremony')).toBe('700ms');
  });

  test('.anim-panel has one variant per origin, all four reachable through data-origin', () => {
    const variants = motionSection.match(/\.anim-panel\[data-origin="\w+"\]\s*\{\s*animation-name:\s*[\w-]+;\s*\}/g);
    expect(variants, 'the per-origin variants are declared').not.toBeNull();
    const origins = (variants as string[]).map((v) => v.match(/data-origin="(\w+)"/)![1]);
    expect(origins.sort()).toEqual(['bottom', 'center', 'left', 'right', 'top']);
    // each variant names its own keyframes, and every one of them is declared
    for (const blockText of variants as string[]) {
      const name = blockText.match(/animation-name:\s*([\w-]+)/)![1];
      expect(motionSection, `@keyframes ${name}`).toContain(`@keyframes ${name} {`);
    }
    // the default (no attribute) is the bottom variant, the modal case
    expect(block(motionSection, '.anim-panel {')).toContain('animation: anim-panel-in ');
  });

  test('the stagger’s delay is clamped at the 8th step, which is what bounds concurrency', () => {
    const stagger = block(motionSection, '.anim-stagger > * {');
    expect(stagger).toContain('animation-delay: calc(var(--stagger-step) * min(var(--i, 0), 7))');
    // the clamp is a real ceiling: step 7 is the largest delay any child can hold
    const step = parseFloat(token('stagger-step'));
    expect(step * 7).toBe(315);
    // and the header's arithmetic, restated against the shipped tokens
    const panel = parseFloat(token('dur-panel'));
    expect(8 + Math.ceil(panel / step) - 1).toBeLessThanOrEqual(12);
  });

  test('the law: transform and opacity only, never transition-all', () => {
    expect(motionCode).not.toContain('transition-all');
    expect(motionCode).not.toMatch(/transition:\s*all/);
    expect(motionCode).not.toMatch(/transition-property:\s*all/);

    // every keyframe in the section animates compositor-only properties
    const names = [...motionSection.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((m) => m[1]);
    expect(names.length, 'the section declares its keyframes').toBeGreaterThanOrEqual(6);
    for (const name of names) {
      const body = block(motionSection, `@keyframes ${name} {`);
      const properties = body
        .replace(/(from|to|[\d.]+%)\s*\{/g, ';')
        .replace(/\}/g, ';')
        .split(';')
        .map((declaration) => declaration.trim().split(':')[0].trim())
        .filter(Boolean);
      expect(properties.length, `${name} declares something`).toBeGreaterThan(0);
      expect([...new Set(properties)].sort(), `${name} animates transform/opacity only`).toEqual(
        properties.every((p) => p === 'opacity') ? ['opacity'] : ['opacity', 'transform'],
      );
    }

    // the press transition names its properties rather than catching everything
    const press = block(motionSection, '.btn-press {');
    expect(press).toContain('transition-property: transform, opacity, color');
    expect(press).toContain('transition-duration: var(--dur-micro)');
    // no geometry is animated or transitioned anywhere in the section
    for (const property of ['width', 'height', 'top:', 'left:', 'margin']) {
      expect(motionCode, property).not.toContain(property);
    }
  });

  test('the panel travels 12 px and starts at 0.97, on every origin', () => {
    const travels: Array<[string, string]> = [
      ['anim-panel-in', 'translate3d(0, 12px, 0)'],
      ['anim-panel-in-top', 'translate3d(0, -12px, 0)'],
      ['anim-panel-in-left', 'translate3d(-12px, 0, 0)'],
      ['anim-panel-in-right', 'translate3d(12px, 0, 0)'],
    ];
    for (const [name, travel] of travels) {
      const from = block(motionSection, `@keyframes ${name} {`);
      expect(from, name).toContain(travel);
      expect(from, `${name} starts at the design’s scale`).toContain('scale(0.97)');
      expect(from, `${name} keeps the old 0.985`).not.toContain('scale(0.985)');
    }
    // the centre variant is the same scale with no travel — all five origins agree
    const center = block(motionSection, '@keyframes anim-panel-in-center {');
    expect(center).toContain('scale(0.97)');
    expect(center).not.toContain('translate3d');
    // no origin keeps a 10 px or 14 px travel
    const panelFrames = motionSection.slice(
      motionSection.indexOf('@keyframes anim-panel-in {'),
      motionSection.indexOf('.anim-panel {'),
    );
    for (const stale of ['10px', '14px']) {
      expect(panelFrames, stale).not.toContain(stale);
    }
  });

  test('the press presses in at 0.95 on the press token and releases on the micro one', () => {
    // the reduced blocks below redefine `:active`, so the base rules are read above them
    const baseCode = motionCode.slice(0, motionCode.indexOf('[data-motion="reduced"] {'));
    const press = block(baseCode, '.btn-press {');
    expect(press).toContain('transition-duration: var(--dur-micro)');
    expect(press, 'release is not the press token').not.toContain('var(--dur-press)');
    const active = block(baseCode, '.btn-press:active {');
    expect(active).toContain('transform: scale(0.95)');
    expect(active).toContain('transition-duration: var(--dur-press)');
    // and the downstroke really is the shorter of the two
    expect(parseFloat(token('dur-press'))).toBeLessThan(parseFloat(token('dur-micro')));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The house precedent, codified
// ══════════════════════════════════════════════════════════════════════════

describe('C. .animate-fadeIn is retimed onto the panel token', () => {
  test('the modal precedent reads the token, at the same 220 ms', () => {
    const body = block(css, '.animate-fadeIn {');
    expect(body).toContain('var(--dur-panel)');
    expect(body).not.toContain('0.22s'); // the literal it replaces
    expect(token('dur-panel')).toBe('220ms');
    // the curve is not part of the codification: the feel is the shipped one
    expect(body).toContain('ease-out');
    expect(body).toContain('forwards');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The player's own setting
// ══════════════════════════════════════════════════════════════════════════

describe('D. [data-motion="reduced"] — the player’s setting', () => {
  test('the block applies the four reductions', () => {
    expectReductions(
      block(css, '[data-motion="reduced"] {'),
      block(css, '[data-motion="reduced"] .btn-press:active {'),
      'the root attribute',
    );
  });

  test('the 60% figures are the base tokens’ own, not a second set of numbers', () => {
    // every reduced duration is exactly 60% of the token §A pinned
    expect(token('dur-panel', block(css, '[data-motion="reduced"] {'))).toBe('132ms');
    expect(token('dur-screen', block(css, '[data-motion="reduced"] {'))).toBe('252ms');
    expect(token('dur-ceremony', block(css, '[data-motion="reduced"] {'))).toBe('420ms');
    // and the override block is in the MOTION section, not a stray copy elsewhere
    expect(motionSection).toContain('[data-motion="reduced"] {');
  });

  test('an explicit `full` is not over-ridden by anything MO-1 ships', () => {
    // no block keys on `full`, so choosing full motion leaves the base tokens in place
    expect(css).not.toContain('[data-motion="full"] {');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The operating system's own preference
// ══════════════════════════════════════════════════════════════════════════

describe('E. The app-wide prefers-reduced-motion block', () => {
  test('it exists in the motion section and carries the same four reductions', () => {
    const media = block(motionSection, '@media (prefers-reduced-motion: reduce)');
    expect(media.length).toBeGreaterThan(0);
    expectReductions(
      block(motionSection, ':root:not([data-motion="full"]) {'),
      block(motionSection, ':root:not([data-motion="full"]) .btn-press:active {'),
      'the OS query',
    );
  });

  test('it governs only while the player has not asked for full motion', () => {
    // the guard is on the OS path, so absence (no attribute) still reduces
    expect(motionSection).toContain(':root:not([data-motion="full"]) {');
    // and the two paths state the same numbers — compared, not eyeballed
    const attribute = block(css, '[data-motion="reduced"] {');
    const media = block(motionSection, ':root:not([data-motion="full"]) {');
    for (const name of [...DURATIONS, 'stagger-step', 'ease-spring']) {
      expect(tight(token(name, media)), name).toBe(tight(token(name, attribute)));
    }
  });

  test('the reductions are applied to the utilities, not only declared', () => {
    // the utilities read the tokens, so redefining a token really does retime them
    expect(block(motionSection, '.anim-panel {')).toContain('var(--dur-panel)');
    expect(block(motionSection, '.anim-stamp {')).toContain('var(--ease-spring)');
    // and the title screen's own `animation: none` block is deliberately untouched
    expect(css).toContain('.title-flag,\n  .title-warm-light,\n  .title-dust {\n    animation: none;');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. The wiring
// ══════════════════════════════════════════════════════════════════════════

describe('F. The wiring: the root attribute and the pause-on-hidden class', () => {
  test('pause-on-hidden freezes every motion utility, following the title screen’s precedent', () => {
    const pause = block(motionSection, '.motion-paused .anim-panel');
    expect(pause).toContain('animation-play-state: paused');
    const pauseStart = motionSection.indexOf('.motion-paused .anim-panel');
    const selectorList = motionSection.slice(pauseStart, motionSection.indexOf('{', pauseStart));
    for (const selector of [
      '.motion-paused .anim-screen',
      '.motion-paused .anim-stagger > *',
      '.motion-paused .anim-stamp',
      '.motion-paused .animate-fadeIn',
    ]) {
      expect(selectorList, selector).toContain(selector);
    }
    // the class hangs off the root, so a descendant selector is what reaches the utilities
    expect(css).toContain('title-anim-paused'); // the precedent this follows
  });

  test('the settings→attribute resolver is pure, and never invents a value', () => {
    expect(resolveMotionAttribute(withMotion())).toBeNull();
    expect('screenMotion' in DEFAULT_SETTINGS).toBe(false);
    // a silent record stays silent, even after the module's own resolution
    expect(resolveMotionAttribute(resolveSettings({}))).toBeNull();
    expect(resolveMotionAttribute(resolveSettings({ screenMotion: 'purple' }))).toBeNull();
    // a chosen value is carried verbatim — `off` included, so a later slice can still it
    expect(resolveMotionAttribute(withMotion('full'))).toBe('full');
    expect(resolveMotionAttribute(withMotion('reduced'))).toBe('reduced');
    expect(resolveMotionAttribute(withMotion('off'))).toBe('off');
    // and it is total over the module's own resolution
    expect(resolveMotionAttribute(resolveSettings({ screenMotion: 'reduced' }))).toBe('reduced');
  });

  test('App writes both root attributes from the settings record', () => {
    expect(appSrc).toContain('resolveMotionAttribute(settings)');
    expect(appSrc).toContain('document.documentElement');
    expect(appSrc).toContain("setAttribute('data-motion', motion)");
    // absence REMOVES the attribute rather than defaulting it
    expect(appSrc).toContain("removeAttribute('data-motion')");
    // one small effect, keyed on the setting alone
    expect(appSrc).toContain('[settings.screenMotion]');
    // and the pause-on-hidden class is driven by visibilitychange, like the title's own
    expect(appSrc).toContain("classList.toggle('motion-paused', document.hidden)");
    expect(appSrc).toContain("document.addEventListener('visibilitychange'");
    expect(appSrc).toContain("document.removeEventListener('visibilitychange'");
  });
});
