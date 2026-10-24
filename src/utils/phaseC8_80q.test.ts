/**
 * Phase C-8.80Q — intermediate-width duel composition (768...1023px), layout invariants.
 *
 * The gap C-8.80P left: its stacked composition was gated at `min-width: 1024px`, so
 * every width from 768 to 1023 still used the absolute overlay — the stage was the whole
 * viewport and the panel lay across its bottom edge. Measured live on the real HUD
 * (same-origin iframe at exact CSS sizes, chronicle at its five-entry cap):
 *
 *   viewport     stage   panel   panel top   player's feet   feet BEHIND the panel
 *   768x1024     1024    451.5     572.5          788.6           -216.1
 *   800x1024     1024    451.5     572.5          788.6           -216.1
 *    900x800      800    437.5     362.5          616.1           -253.6
 *    960x800      800    395.0     405.0          616.1           -211.1
 *   1023x768      768    375.0     393.0          591.4           -198.4
 *
 * A bottom panel can never clear a foot line at 77.01% of the canvas, which is the same
 * structural finding C-8.80P made at 1280x800 — so the fix is the same composition, not a
 * new one: the wide gate now starts at 768px. Measured after the change, both fighters are
 * inside the unobscured stage at all five sizes (opponent's head 19.7...132.7px below the
 * top HUD, player's feet 112.3...173.2px above the panel; see §C).
 *
 * The second, narrower defect: five cards across a 728px panel are 82.4px each, and their
 * own label/value rows ("Shield Guard" beside "NO COST") could not fit one line, so every
 * card clipped horizontally by 5...19px at 768 and 800 wide (0 from 880px). §B pins the
 * tier that fixes it using two precedents that already exist — the blurbs are dropped
 * (portrait and short landscape both do) and those rows wrap.
 *
 * Run with: bun test src/utils/phaseC8_80q.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const css = read('../index.css');
const sceneSource = read('../components/duel/DuelScene.tsx');
const panelSource = read('../components/ui/TurnActionPanel.tsx');
const geometrySource = read('../utils/duelGeometry.ts');

/** Return the body of the first `@media <query>` block, brace-matched. */
const mediaBlock = (source: string, query: string): string | null => {
  const at = source.indexOf(`@media ${query}`);
  if (at < 0) return null;
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
};

const ruleBody = (block: string, selector: string): string | null => {
  const at = block.indexOf(`${selector} {`);
  if (at < 0) return null;
  const open = block.indexOf('{', at);
  const close = block.indexOf('}', open);
  return block.slice(open + 1, close).replace(/\s+/g, ' ').trim();
};

const bare = (block: string) => block.replace(/\/\*[\s\S]*?\*\//g, '');

const PORTRAIT = '(max-width: 520px) and (orientation: portrait)';
const LANDSCAPE = '(orientation: landscape) and (max-height: 520px)';
const WIDE = '(min-width: 768px) and (min-height: 521px)';
const NARROW = '(min-width: 768px) and (max-width: 879px) and (min-height: 521px)';

const portrait = mediaBlock(css, PORTRAIT) ?? '';
const landscape = mediaBlock(css, LANDSCAPE) ?? '';
const wide = mediaBlock(css, WIDE) ?? '';
const narrow = mediaBlock(css, NARROW) ?? '';

// ── The measured constants ──────────────────────────────────────────────────
// Projection fractions: the rig's own constants (baseDist 8.5, baseHeight 5.2,
// lookAt y 1.2, vertical fov 45) with the ±1.8 spawn offsets. A vertical fov makes
// these fractions independent of width, which is why the same table serves every size.
const OPP_HEAD = 0.4263;
const PLAYER_FEET = 0.7701;

/** Top-block bottom edge from the stage top, measured: 188.5 with the wide chrome. */
const HUD_WIDE = 188.5;

/** Panel heights measured live AFTER the change, chronicle at its cap. */
const PANEL = {
  '768x1024': 270.5,
  '800x1024': 267,
  '850x800': 267,
  '880x800': 281,
  '900x800': 281,
  '960x800': 279.5,
  '1023x768': 279.5,
  '1024x768': 279.5,
  '1280x800': 267,
} as const;

/** Panel heights measured live BEFORE it (the overlay), for the control. */
const PANEL_BEFORE = {
  '768x1024': 451.5,
  '800x1024': 451.5,
  '900x800': 437.5,
  '960x800': 395,
  '1023x768': 375,
} as const;

const REQUIRED = [
  [768, 1024],
  [800, 1024],
  [900, 800],
  [960, 800],
  [1023, 768],
  [1024, 768],
  [1280, 800],
] as const;

// ── §A. The gate ───────────────────────────────────────────────────────────

describe('C-8.80Q §A the stacked composition now starts at 768px', () => {
  test('the wide block is gated at 768 and still requires 521px of height', () => {
    expect(wide).not.toBe('');
    expect(WIDE).toContain('min-width: 768px');
    expect(WIDE).toContain('min-height: 521px');
  });

  test('it is the same composition, not a second one', () => {
    expect(ruleBody(wide, '.duel-root')).toContain('flex-direction: column');
    expect(ruleBody(wide, '.duel-command')).toContain('position: relative');
    expect(ruleBody(wide, '.duel-command .tactic-grid')).toContain(
      'grid-template-columns: repeat(5, minmax(0, 1fr))',
    );
  });

  test('the gate cannot collide with the short-landscape row or the portrait column', () => {
    // 520 max height versus 521 min height, and 768 min width versus 520 max width:
    // no viewport can satisfy both of either pair.
    expect(WIDE).toContain('min-height: 521px');
    expect(LANDSCAPE).toContain('max-height: 520px');
    expect(WIDE).toContain('min-width: 768px');
    expect(PORTRAIT).toContain('max-width: 520px');
  });

  test('the default beneath 768px is untouched — the overlay is still absolute', () => {
    expect(css).toContain('.duel-stage {\n  position: absolute;\n  inset: 0;\n}');
    const command = css.slice(css.indexOf('.duel-command {'));
    expect(command.slice(0, 200)).toContain('position: absolute');
  });
});

// ── §B. The narrow tier ────────────────────────────────────────────────────

describe('C-8.80Q §B the 768...879px command grid', () => {
  test('the tier exists, inside the band the wide block now covers', () => {
    expect(narrow).not.toBe('');
    expect(NARROW).toContain('min-width: 768px');
    expect(NARROW).toContain('max-width: 879px');
    expect(NARROW).toContain('min-height: 521px');
  });

  test('it hides the blurb — the same rule portrait and short landscape already use', () => {
    expect(ruleBody(narrow, '.duel-command .tactic-desc')).toBe('display: none;');
    // Precedent: the same hook is dropped by both blocks that predate this tier.
    expect(ruleBody(portrait, '.duel-command .tactic-desc')).toBe('display: none;');
    expect(ruleBody(landscape, '.duel-command .tactic-desc')).toBe('display: none;');
  });

  test('it wraps only the cards’ own rows, and changes no size or colour', () => {
    const rows = ruleBody(narrow, '.duel-command .tactic-grid > button > div.flex');
    expect(rows).toBe('flex-wrap: wrap; row-gap: 1px;');
    for (const forbidden of ['font-size', 'line-height', 'opacity', 'color:', 'height', 'width']) {
      expect(bare(narrow)).not.toContain(forbidden);
    }
    // The ONE hidden thing in the tier is the blurb, asserted above.
    expect([...bare(narrow).matchAll(/display:\s*none/g)].length).toBe(1);
  });

  test('the two rows it wraps are the shipped markup, and nothing else is targeted', () => {
    // The cards' name row and stat row both carry `flex items-center justify-between`.
    const rows = panelSource.split('\n').filter((l) => l.includes('justify-between'));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((l) => l.includes('flex'))).toBe(true);
    // Exactly two declarations, one per selector: no control, strip or log rule here.
    const selectors = [...bare(narrow).matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    expect(selectors).toEqual([
      '.duel-command .tactic-desc',
      '.duel-command .tactic-grid > button > div.flex',
    ]);
  });

  test('no control, readout or history entry is removed anywhere in the band', () => {
    for (const block of [wide, narrow]) {
      expect(block).not.toContain('tactic-strip');
      expect(block).not.toContain('.combat-log-items');
      expect(block).not.toContain('chronicle-range');
      expect(block).not.toContain('button {');
    }
    for (const label of ['Quick Strike', 'Power Slash', 'Shield Guard', 'Dodge', 'Arena Taunt']) {
      expect(panelSource).toContain(label);
    }
  });

  test('880px and above keeps the blurb — measured clean there', () => {
    // 880x800 measured 0 clipping with the blurb shown (cards 104.8px), so the tier
    // deliberately stops below it.
    expect(ruleBody(narrow, '.duel-command .tactic-desc')).not.toBeNull();
    expect(WIDE).not.toContain('max-width');
  });
});

// ── §C. The measured clearances ────────────────────────────────────────────

describe('C-8.80Q §C both fighters stay inside the unobscured stage', () => {
  for (const [w, h] of REQUIRED) {
    const key = `${w}x${h}` as keyof typeof PANEL;
    test(`${key}: opponent clears the HUD, player clears the panel`, () => {
      const stageH = h - PANEL[key];
      // The top HUD ends 188.5px below the stage top; the opponent's head must clear it.
      expect(OPP_HEAD * stageH - HUD_WIDE).toBeGreaterThanOrEqual(15);
      // The player's feet must land above the panel — the defect this phase fixed.
      expect(PLAYER_FEET * stageH).toBeLessThan(stageH);
      expect(stageH - PLAYER_FEET * stageH).toBeGreaterThanOrEqual(100);
    });
  }

  test('the pre-C-8.80Q overlay fails the same predicate — the control', () => {
    for (const [w, h] of REQUIRED.filter(([ww]) => ww <= 1023)) {
      const key = `${w}x${h}` as keyof typeof PANEL_BEFORE;
      // Overlay: the stage is the whole viewport, the panel starts at vh - panelH.
      const panelTop = h - PANEL_BEFORE[key];
      expect(Math.round(PLAYER_FEET * h)).toBeGreaterThan(panelTop);
    }
  });

  test('the tier at the band’s worst height still clears both edges', () => {
    // Measured at 768x768 (not required, but inside the tier's gate): panel 270.5,
    // stage 497.5, opponent's head 23.6px below the HUD.
    const stageH = 768 - 270.5;
    expect(OPP_HEAD * stageH - HUD_WIDE).toBeGreaterThanOrEqual(20);
    expect(stageH - PLAYER_FEET * stageH).toBeGreaterThanOrEqual(100);
  });

  test('the accepted phone and desktop sizes are recorded, not re-derived', () => {
    // Measured after this change and unchanged from C-8.80P: 375x667 stage 329,
    // 400x720 stage 382, 812x375 row stage 375, 1280x800 stage 533 / panel 267.
    expect(PANEL['1280x800']).toBe(267);
    expect(PANEL['1024x768']).toBe(PANEL['1023x768']);
    expect(ruleBody(portrait, '.duel-root')).toContain('flex-direction: column');
    expect(ruleBody(landscape, '.duel-root')).toContain('flex-direction: row');
  });
});

// ── §D. Scope guard ────────────────────────────────────────────────────────

describe('C-8.80Q §D layout only — no camera, spawn, timing or combat value moved', () => {
  test('the camera rig and the opening separation are untouched', () => {
    expect(sceneSource).toContain('let baseDist = 8.5;');
    expect(sceneSource).toContain('let baseHeight = 5.2;');
    expect(geometrySource).toContain('export const DUEL_OPENING_SEPARATION_M = 3.6;');
    expect(geometrySource).toContain('export const DUEL_MOVE_STEP_M = 1.8;');
  });

  test('neither block can affect combat: no motion, no stacking, no canvas rule', () => {
    // They are re-flow rules only. (`.vital-stamina-bar` is a bar HEIGHT inside the wide
    // block's chrome — a surface the HUD already sizes, never a combat value.)
    for (const forbidden of ['transition', 'animation', '@keyframes', '<canvas', 'z-index', 'pointer-events']) {
      expect(bare(narrow)).not.toContain(forbidden);
      expect(bare(wide)).not.toContain(forbidden);
    }
  });

  test('the only file hooks the tier adds are already-shipped class names', () => {
    for (const hook of ['tactic-desc', 'tactic-grid']) {
      expect(panelSource).toContain(hook);
    }
  });
});
