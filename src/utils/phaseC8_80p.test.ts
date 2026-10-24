/**
 * Phase C-8.80P — short-viewport and desktop duel composition (layout invariants).
 *
 * The two defects this pins were both measured in the preview browser on the real
 * duel, not inferred:
 *
 *  1. SHORT PORTRAIT. The top HUD block ends at 155.5px from the stage top and the
 *     opponent's head projects to 42.63% of the stage height, so a portrait panel
 *     taller than (viewport - 364.8) puts that head behind the HUD. Measured, the
 *     panel was 420px with the chronicle at its cap: the opponent was 27.6px covered
 *     at 400x720, 10.6px at 760, and 50.2px at the 375x667 floor. C-8.80P's portrait
 *     chrome takes the panel to 338px, and a `max-height: 720px` tier drops the crowd
 *     meter (the last, lowest 29.5px of the HUD) where the stage cannot carry it.
 *
 *  2. DESKTOP. Measured at 1280x800, the stage was the whole viewport and the panel
 *     covered 445...800, while the player projects into 63.3%-77.0% of the canvas =
 *     506...616: the PLAYER was behind the panel for its whole height. No bottom
 *     overlay can clear a foot line at 77% of the canvas, so from 1024x521 the two
 *     regions stack, the tactic grid goes to five columns in one row (panel 355 ->
 *     267px) and the top chrome tightens (206.5 -> 188.5px).
 *
 * WHAT THIS SUITE PINS:
 *   §A the portrait budget — the rules that make 338px, and the clearance they buy at
 *      every required portrait viewport, with the pre-C-8.80P panel as the control;
 *   §B the short-viewport chrome tier — the crowd meter and nothing else, no control,
 *      no orientation lock;
 *   §C the wide composition — the stack, the five-column grid, the measured
 *      clearances at 1280x800 / 1024x768, and that short landscape stays a ROW;
 *      C-8.80Q widened this block's gate from 1024px to 768px (phaseC8_80q.test.ts);
 *   §D the controls and the chronicle survive every block;
 *   §E the scope guard — no camera, spacing, timing, combat or save value moved.
 *
 * Run with: bun test src/utils/phaseC8_80p.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const css = read('../index.css');
const sceneSource = read('../components/duel/DuelScene.tsx');
const hudSource = read('../components/ui/CombatHUD.tsx');
const panelSource = read('../components/ui/TurnActionPanel.tsx');

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

/** The declaration body of one flat selector inside a block. */
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
const WIDE = '(min-width: 768px) and (min-height: 521px)'; // C-8.80Q widened this
const SHORT = '(max-height: 720px)';

const portrait = mediaBlock(css, PORTRAIT) ?? '';
const landscape = mediaBlock(css, LANDSCAPE) ?? '';
const wide = mediaBlock(css, WIDE) ?? '';
const short = mediaBlock(css, SHORT) ?? '';

// ── The measured constants ──────────────────────────────────────────────────
// Projection fractions come from the rig's own constants (baseDist 8.5, baseHeight
// 5.2, lookAt y 1.2, vertical fov 45) and the spawn offsets of `duelGeometry` (±1.8);
// they are the same figures C-8.80N verified against eight rendered samples.
const OPP_HEAD = 0.4263;
const OPP_FEET = 0.5334;
const PLAYER_HEAD = 0.633;
const PLAYER_FEET = 0.7701;

/** Command-panel heights measured live, before and after this phase. */
const PANEL_BEFORE = 420; // pre-C-8.80P, chronicle at its own cap
const PORTRAIT_PANEL = 338; // C-8.80P portrait chrome, chronicle at its 2.25rem cap
const DESKTOP_PANEL = 267; // C-8.80P wide composition, 1280x800
const DESKTOP_PANEL_1024 = 279.5; // same rules at 1024x768 (narrower cards)

/** Top-block bottom edge, measured from the stage top. */
const HUD_PORTRAIT = 155.5;
const HUD_PORTRAIT_SHORT = 122; // with the crowd meter gone (max-height: 720px)
const HUD_DESKTOP = 188.5; // C-8.80P wide chrome (was 206.5)

// ── §A. The portrait budget ─────────────────────────────────────────────────

describe('C-8.80P §A the portrait panel budget', () => {
  test('the portrait block drops the duplicated range row', () => {
    expect(ruleBody(portrait, '.duel-command .chronicle-range')).toBe('display: none;');
  });

  test('the chronicle keeps five entries in a scroll container, shorter cap', () => {
    // The cap is chrome; the shipped `slice(-5)` and `overflow-y-auto` are untouched.
    expect(ruleBody(portrait, '.duel-command .combat-log-items')).toBe('max-height: 2.25rem;');
    expect(panelSource).toContain('combatLog.slice(-5)');
    expect(panelSource).toContain('overflow-y-auto');
  });

  test('the panel paddings and gaps are the ones measured at 338px', () => {
    expect(ruleBody(portrait, '.duel-command')).toContain('padding: 0 0.5rem 0.375rem;');
    expect(ruleBody(portrait, '.duel-command .tactic-panel')).toContain('gap: 0.25rem;');
    expect(ruleBody(portrait, '.duel-command .chronicle-card')).toBe('padding: 0.25rem 0.5rem;');
    expect(ruleBody(portrait, '.duel-command .tactic-dashboard')).toBe('padding: 0.25rem; gap: 0.25rem;');
    expect(ruleBody(portrait, '.duel-command .tactic-grid')).toBe('gap: 0.25rem;');
    expect(ruleBody(portrait, '.duel-command .tactic-grid > button')).toBe('padding: 0.375rem;');
  });

  test('the movement strip keeps its full-size buttons', () => {
    // Only the strip's own top padding tightens; its buttons are untouched, so the
    // three controls stay 46px tall (measured) instead of dropping under 44px.
    expect(ruleBody(portrait, '.duel-command .tactic-strip')).toBe('padding-top: 0.125rem;');
    expect(bare(portrait)).not.toContain('.tactic-strip button');
  });

  // Every required portrait viewport, with the panel at its worst case (338) and the
  // HUD at its measured height for that height band.
  const PORTRAITS = [
    { label: '375x667', vh: 667, hud: HUD_PORTRAIT_SHORT },
    { label: '400x700', vh: 700, hud: HUD_PORTRAIT_SHORT },
    { label: '400x720', vh: 720, hud: HUD_PORTRAIT_SHORT },
    { label: '400x740', vh: 740, hud: HUD_PORTRAIT },
    { label: '400x760', vh: 760, hud: HUD_PORTRAIT },
    { label: '400x780', vh: 780, hud: HUD_PORTRAIT },
    { label: '400x800', vh: 800, hud: HUD_PORTRAIT },
  ];

  for (const v of PORTRAITS) {
    test(`${v.label}: both fighters clear the HUD and the panel`, () => {
      const stageH = v.vh - PORTRAIT_PANEL;
      // The opponent's head — the topmost point of either fighter — clears the HUD …
      expect(OPP_HEAD * stageH - v.hud).toBeGreaterThanOrEqual(15);
      // … both fighters' feet are inside the stage, i.e. above the panel …
      expect(OPP_FEET * stageH).toBeLessThanOrEqual(stageH);
      expect(PLAYER_FEET * stageH).toBeLessThanOrEqual(stageH);
      // … and the player's head clears the HUD too.
      expect(PLAYER_HEAD * stageH - v.hud).toBeGreaterThanOrEqual(15);
    });
  }

  test('the pre-C-8.80P panel fails the same predicate — the control', () => {
    // 400x720 with the shipped 420px panel: the opponent's head sat 27.6px BEHIND
    // the HUD. This is the reported defect, reproduced from its own numbers.
    const stageH = 720 - PANEL_BEFORE;
    expect(OPP_HEAD * stageH - HUD_PORTRAIT).toBeLessThan(0);
    expect(Math.round((OPP_HEAD * stageH - HUD_PORTRAIT) * 10) / 10).toBe(-27.6);
    // 375x667 fails by half a head.
    const small = 667 - PANEL_BEFORE;
    expect(Math.round((OPP_HEAD * small - HUD_PORTRAIT) * 10) / 10).toBe(-50.2);
  });

  test('the portrait panel is shorter than the pre-fix one at every log length', () => {
    expect(PORTRAIT_PANEL).toBeLessThan(PANEL_BEFORE);
    // The live measurements at 400x720: 333 with one chronicle line, 338 at the cap.
    expect(PORTRAIT_PANEL - 333).toBeLessThanOrEqual(5);
  });
});

// ── §B. The short-viewport chrome tier ──────────────────────────────────────

describe('C-8.80P §B short viewports shed the crowd meter only', () => {
  test('the tier exists and hides exactly one surface', () => {
    expect(short).not.toBe('');
    const hidden = [...bare(short).matchAll(/([^{}]+)\{\s*display: none;/g)].map((m) => m[1].trim());
    expect(hidden).toEqual(['.combat-hud .hype-meter']);
  });

  test('no button, strip or log container is hidden by it', () => {
    for (const selector of [...bare(short).matchAll(/([^{}]+)\{\s*display: none;/g)].map((m) => m[1].trim())) {
      expect(selector).not.toContain('button');
      expect(selector).not.toContain('tactic-strip');
      expect(selector).not.toContain('combat-log-items');
    }
  });

  test('the health, stamina, turn, cue and utility layers stay', () => {
    // Nothing in the tier touches the vitals, the turn banner, the cue layers or the
    // utility row: the meter is the only hook it names.
    for (const keep of ['vital-card', 'vital-health-bar', 'tactic-dashboard', 'combat-top', 'data-hud-label']) {
      expect(short).not.toContain(keep);
    }
  });

  test('the meter is still rendered, and the block is height-only', () => {
    // Hidden by CSS at short heights, never removed from the component.
    expect(hudSource).toContain('hype-meter');
    expect(hudSource).toContain('CROWD FAVOR');
    expect(short).not.toContain('orientation');
  });

  test('the tiers do not overlap the wide block', () => {
    // 720px is reachable on a wide viewport, and the wide block starts at 521, so
    // both apply there: the meter keeps its desktop padding rule, and the tier's
    // `display: none` still wins because nothing re-declares display.
    expect(wide).not.toContain('display: none');
    expect(short).toContain('display: none');
  });
});

// ── §C. The wide composition ────────────────────────────────────────────────

describe('C-8.80P §C the wide composition', () => {
  test('the two regions stack instead of overlapping', () => {
    expect(ruleBody(wide, '.duel-root')).toContain('flex-direction: column');
    expect(ruleBody(wide, '.duel-stage')).toContain('position: relative');
    expect(ruleBody(wide, '.duel-stage')).toContain('flex: 1 1 auto');
    expect(ruleBody(wide, '.duel-command')).toContain('position: relative');
    expect(ruleBody(wide, '.duel-command')).toContain('flex: 0 0 auto');
  });

  test('the tactic grid goes to five columns in one row', () => {
    expect(ruleBody(wide, '.duel-command .tactic-grid')).toBe(
      'grid-template-columns: repeat(5, minmax(0, 1fr));',
    );
  });

  test('the chrome tightens without removing anything', () => {
    expect(ruleBody(wide, '.combat-hud .vital-card')).toBe('padding: 0.5rem 0.75rem;');
    expect(ruleBody(wide, '.combat-hud .vital-health-bar')).toBe('height: 0.75rem;');
    expect(ruleBody(wide, '.combat-hud .vital-stamina-bar')).toBe('height: 0.375rem;');
    expect(bare(wide)).not.toContain('display: none');
    expect(wide).not.toContain('tactic-desc');
    expect(wide).not.toContain('hype-meter { display');
  });

  test('the two wide viewports put both fighters between the chrome bands', () => {
    for (const v of [
      { label: '1280x800', vh: 800, panel: DESKTOP_PANEL },
      { label: '1280x720', vh: 720, panel: DESKTOP_PANEL },
      { label: '1024x768', vh: 768, panel: DESKTOP_PANEL_1024 },
    ]) {
      const stageH = v.vh - v.panel;
      // At 720 tall the crowd meter is gone (the short tier), so the HUD is shorter.
      const hud = v.vh <= 720 ? HUD_DESKTOP - 40.5 : HUD_DESKTOP;
      expect(OPP_HEAD * stageH - hud).toBeGreaterThanOrEqual(15);
      expect(PLAYER_FEET * stageH).toBeLessThanOrEqual(stageH);
      expect(PLAYER_HEAD * stageH - hud).toBeGreaterThanOrEqual(15);
    }
  });

  test('the pre-C-8.80P desktop overlay is the control it was measured against', () => {
    // Stage = full viewport, panel across the bottom from 445: the player's band
    // 506...616 sat entirely behind it. Reproduced from the recorded figures.
    const panelTop = 800 - 355;
    expect(PLAYER_HEAD * 800).toBeGreaterThan(panelTop);
    expect(PLAYER_FEET * 800).toBeGreaterThan(panelTop);
    expect(Math.round(PLAYER_HEAD * 800)).toBe(506);
    expect(Math.round(PLAYER_FEET * 800)).toBe(616);
    // The opponent was NOT covered — which is why the report said "the player".
    expect(Math.round(OPP_FEET * 800)).toBeLessThan(panelTop);
  });

  test('short landscape keeps its row, and the two blocks are disjoint', () => {
    expect(ruleBody(landscape, '.duel-root')).toContain('flex-direction: row');
    expect(ruleBody(landscape, '.duel-command')).toContain('width: 28.75rem');
    expect(ruleBody(landscape, '.duel-command .tactic-grid')).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr))',
    );
    // 520 (landscape max) and 521 (wide min) cannot both match.
    expect(WIDE).toContain('min-height: 521px');
    expect(LANDSCAPE).toContain('max-height: 520px');
  });

  test('the 812x375 row composition is unchanged by this phase', () => {
    // Measured live: stage 352x375, opponent's head at 159.9 against the HUD's 119.8.
    expect(OPP_HEAD * 375 - 119.8).toBeGreaterThan(30);
    expect(PLAYER_FEET * 375).toBeLessThanOrEqual(375);
  });
});

// ── §D. Nothing was removed ─────────────────────────────────────────────────

describe('C-8.80P §D every control and readout survives', () => {
  test('all five tactics, the strip and the chronicle are still rendered', () => {
    for (const label of [
      'Quick Strike',
      'Power Slash',
      'Shield Guard',
      'Dodge',
      'Arena Taunt',
      'Advance (+1.8m)',
      'Retreat (-1.8m)',
      'Catch Breath (+40 SP)',
      'ARENA CHRONICLE',
      'YOUR TURN — CHOOSE TACTIC',
    ]) {
      expect(panelSource).toContain(label);
    }
  });

  test('no responsive block hides a control or forces a page scroll', () => {
    for (const block of [portrait, landscape, wide, short]) {
      const hidden = [...bare(block).matchAll(/([^{}]+)\{\s*display: none;/g)].map((m) => m[1].trim());
      for (const selector of hidden) {
        expect(selector).not.toContain('button');
        expect(selector).not.toContain('tactic-strip');
      }
    }
    expect(css).not.toContain('screen.orientation.lock');
  });

  test('the vital readouts the brief requires are still present', () => {
    expect(hudSource).toContain('vital-health-bar');
    expect(hudSource).toContain('vital-stamina-bar');
    expect(hudSource).toContain('combat-top');
    expect(hudSource).toContain('data-hud-label');
  });

  test('no !important was needed anywhere', () => {
    expect(portrait).not.toContain('!important');
    expect(wide).not.toContain('!important');
    expect(short).not.toContain('!important');
  });

  test('the composition hooks are still DuelScene siblings', () => {
    expect(sceneSource).toContain('<div className="duel-stage">');
    expect(sceneSource).toContain('<div className="duel-command">');
    const stageAt = sceneSource.indexOf('<div className="duel-stage">');
    const panelAt = sceneSource.indexOf('<div className="duel-command">');
    expect(stageAt).toBeGreaterThan(-1);
    expect(panelAt).toBeGreaterThan(stageAt);
  });
});

// ── §E. Scope guard ─────────────────────────────────────────────────────────

describe('C-8.80P §E no camera, combat, timing or save value moved', () => {
  test('the camera rig is byte-identical to the one C-8.80N measured', () => {
    expect(sceneSource).toContain('let baseDist = 8.5;');
    expect(sceneSource).toContain('let baseHeight = 5.2;');
    expect(sceneSource).toContain('baseDist = 4.2;');
    expect(sceneSource).toContain('baseDist = 11.0;');
    expect(sceneSource).toContain('camera.lookAt(');
  });

  test('spawn, movement, timing and damage constants are untouched', () => {
    expect(sceneSource).toContain('DUEL_SPAWN_OFFSET_Z');
    expect(sceneSource).toContain('resolveAdvanceTargetZ');
    expect(sceneSource).toContain('ENEMY_ATTACK_WINDUP_MS');
    expect(sceneSource).toContain('PLAYER_ATTACK_WINDUP_MS');
    expect(sceneSource).toContain('RAGE_DAMAGE_MULTIPLIER');
  });

  test('this phase changed no combat or persistence module', () => {
    // The phase's only production edits are the CSS and one comment block in
    // DuelScene; the layout rules name no gameplay hook.
    for (const block of [portrait, wide, short]) {
      // `vital-stamina-bar` is a class name, not a value: the blocks style it and
      // never declare stamina, damage or storage behaviour.
      expect(bare(block)).not.toContain('damage');
      expect(bare(block)).not.toContain('localStorage');
      expect(bare(block)).not.toContain('setStamina');
      expect(bare(block)).not.toContain('applyStaminaRegen');
      // Every declaration in these blocks is a layout/chrome property.
      // Declarations only: a name, a value and its terminator — selectors end in `{`.
      const props = [...bare(block).matchAll(/([a-z][a-z-]*)\s*:\s*[^;{}]+;/g)].map((m) => m[1]);
      const allowed = new Set([
        'display', 'position', 'inset', 'left', 'right', 'bottom', 'height', 'width',
        'min-height', 'max-height', 'min-width', 'flex', 'flex-direction', 'padding',
        'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'margin',
        'margin-bottom', 'margin-top', 'gap', 'overflow-y', 'grid-template-columns',
      ]);
      for (const prop of props) expect(allowed.has(prop)).toBe(true);
    }
  });
});
