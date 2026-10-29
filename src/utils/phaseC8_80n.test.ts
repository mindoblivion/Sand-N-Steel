/**
 * Phase C-8.80N — phone duel composition (layout invariants).
 *
 * The defect: the duel's 3D canvas was full-viewport and the HUD was an overlay on
 * top of it, so on a phone the bottom panel sat exactly where the two fighters
 * project. Measured at 400x800 before this phase, the top block ran to y=227 and the
 * stacked chronicle + tactic dashboard began at y=290 and ended at y=818 — while the
 * cinematic camera put the opponent at 341-427 and the player at 506-616 in that same
 * 800px canvas. Neither fighter had a single visible pixel.
 *
 * The fix is composition, not camera and not combat: DuelScene now renders a
 * `.duel-stage` (canvas + the instrumentation HUD that overlays it) and a
 * `.duel-command` panel as siblings, and the phone media queries make the stage the
 * region ABOVE the panel (portrait) or BESIDE it (short landscape) — so the canvas is
 * shorter and the projection follows it, instead of the panel painting over the
 * fighters.
 *
 * WHAT THIS SUITE PINS:
 *   §A the composition — the panel is DuelScene's sibling of the stage, not a HUD
 *      child, and every layout hook the media queries target exists exactly once;
 *   §B nothing was removed — all five tactics, the movement strip, the chronicle
 *      (still scrollable, still the shipped five-entry slice) and every control;
 *   §C the framing contract, computed from the camera rig's own constants parsed out
 *      of DuelScene, the spawn/movement values from `duelGeometry`, and the HUD and
 *      panel heights measured live in the preview browser. The stage height each
 *      phone viewport yields is DERIVED from those measured heights, and both
 *      fighters' projected bands are required to sit inside it, below the top HUD;
 *   §D the CSS contract — the two phone blocks exist, the desktop defaults keep the
 *      old overlay, and the chrome that was compacted is bounded;
 *   §E the scope guard — no camera, combat, canvas or timing value moved.
 *
 * The §C measurements were taken in the preview browser on the real duel, with the
 * viewport supplied by an iframe of exactly 400x800 / 375x812 / 812x375 (an iframe is
 * its own media-query viewport). They are the top HUD's bottom edge and the command
 * panel's height; the harness banner is excluded by deriving the stage from the real
 * viewport height, and the panel height used here (407) is the pre-compaction figure,
 * i.e. the conservative one.
 *
 * Run with: bun test src/utils/phaseC8_80n.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DUEL_OPENING_SEPARATION_M,
  DUEL_SPAWN_OFFSET_Z,
  DUEL_MOVE_STEP_M,
  DUEL_MIN_GAP_M,
} from './duelGeometry';
import { PLAYER_ATTACK_WINDUP_MS, ENEMY_ATTACK_WINDUP_MS } from './combatCalculations';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const sceneSource = read('../components/duel/DuelScene.tsx');
const hudSource = read('../components/ui/CombatHUD.tsx');
const panelSource = read('../components/ui/TurnActionPanel.tsx');
const css = read('../index.css');

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

const PORTRAIT = '(max-width: 520px) and (orientation: portrait)';
const LANDSCAPE = '(orientation: landscape) and (max-height: 520px)';
// C-8.80P — the wide composition: desktop stacks too, because a bottom panel could
// never clear the player's feet. REBASED (C-8.80Q): the same gate now starts at 768px
// wide, where the overlay was measured to hide the player by 139...254px.
const WIDE = '(min-width: 768px) and (min-height: 521px)';
const portrait = mediaBlock(css, PORTRAIT) ?? '';
const landscape = mediaBlock(css, LANDSCAPE) ?? '';
const wide = mediaBlock(css, WIDE) ?? '';

/** The declaration body of one flat selector inside a block. */
const ruleBody = (block: string, selector: string): string | null => {
  const at = block.indexOf(`${selector} {`);
  if (at < 0) return null;
  const open = block.indexOf('{', at);
  const close = block.indexOf('}', open);
  return block.slice(open + 1, close).replace(/\s+/g, ' ').trim();
};

const bareBlock = (block: string) => block.replace(/\/\*[\s\S]*?\*\//g, '');

/** Pull `name = <number>` out of a source expression. */
const numeric = (source: string, name: string): number => {
  const match = source.match(new RegExp(`${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
  if (!match) throw new Error(`could not parse ${name}`);
  return Number(match[1]);
};

// ── §A. The composition ─────────────────────────────────────────────────────

describe('C-8.80N §A the stage and the command panel are separate regions', () => {
  test('DuelScene renders a `.duel-root` with a stage and a command sibling', () => {
    expect(sceneSource).toContain('duel-root');
    expect(sceneSource).toContain('<div className="duel-stage">');
    expect(sceneSource).toContain('<div className="duel-command">');
  });

  test('the canvas and the HUD live inside the stage; the panel does not', () => {
    const stageAt = sceneSource.indexOf('<div className="duel-stage">');
    const canvasAt = sceneSource.indexOf('<WebGLReadyGuard');
    const hudAt = sceneSource.indexOf('<CombatHUD');
    const panelAt = sceneSource.indexOf('<div className="duel-command">');
    expect(stageAt).toBeGreaterThan(-1);
    expect(canvasAt).toBeGreaterThan(stageAt);
    expect(hudAt).toBeGreaterThan(canvasAt);
    expect(panelAt).toBeGreaterThan(hudAt);
  });

  test('CombatHUD no longer renders the command panel', () => {
    expect(hudSource).not.toContain('TurnActionPanel');
    expect(hudSource).not.toContain('tactic-grid');
    expect(hudSource).not.toContain('combat-log-items');
  });

  test('DuelScene renders the panel itself, with the props that drive it', () => {
    const at = sceneSource.indexOf('<TurnActionPanel');
    expect(at).toBeGreaterThan(-1);
    const props = sceneSource.slice(at, sceneSource.indexOf('/>', at));
    for (const prop of ['distance=', 'isPlayerTurn=', 'isExecuting=', 'combatLog=', 'onExecuteAction=']) {
      expect(props).toContain(prop);
    }
  });

  test('every layout hook the media queries target exists exactly once', () => {
    for (const hook of ['tactic-panel', 'chronicle-card', 'chronicle-range', 'tactic-strip']) {
      expect(panelSource.split(`className="${hook}`).length - 1).toBe(1);
    }
  });

  test('the HUD overlay keeps its own positioning and its cue layer', () => {
    expect(hudSource).toContain('combat-hud absolute inset-0 pointer-events-none flex flex-col');
    expect(hudSource.split('pointer-events-none z-30').length - 1).toBe(2);
  });
});

// ── §B. What must survive the recomposition ─────────────────────────────────

describe('C-8.80N §B every core action and readout is still there', () => {
  test('all five tactics, the movement strip and the withdraw action are rendered', () => {
    for (const label of [
      'Quick Strike',
      'Power Slash',
      'Shield Guard',
      'Dodge',
      'Arena Taunt',
      // REBASED (MO-2): the three movement controls keep their names; each one's
      // parenthesised delta is its own `tactic-dx` span (hidden on a portrait phone
      // so the strip still fits one row) and stays in the control's `title`.
      'Advance',
      'Retreat',
      'Catch Breath',
    ]) {
      expect(panelSource).toContain(label);
    }
    for (const delta of ['(+1.8m)', '(-1.8m)', '+40 Stamina']) {
      expect(panelSource).toContain(delta);
    }
    expect(hudSource).toContain('data-withdraw="true"');
  });

  test('the chronicle keeps its five-entry slice and stays scrollable', () => {
    expect(panelSource).toContain('combatLog.slice(-5)');
    expect(panelSource).toContain('combat-log-items');
    expect(panelSource).toContain('overflow-y-auto');
  });

  test('the health and stamina readouts and the crowd meter are still rendered', () => {
    for (const hook of ['vital-health-bar', 'vital-stamina-bar', 'hype-meter']) {
      expect(hudSource.split(hook).length - 1).toBeGreaterThanOrEqual(1);
    }
    expect(hudSource).toContain('player.health');
    expect(hudSource).toContain('opponent.stamina');
  });

  test('the cue layer and the reaction controls are untouched', () => {
    expect(hudSource).toContain('data-windup-cue');
    expect(hudSource).toContain('data-reaction="shield_block"');
    expect(hudSource).toContain('data-reaction="dodge"');
    expect(hudSource).toContain('min-h-[44px]');
  });
});

// ── §C. The framing contract ────────────────────────────────────────────────

/**
 * The cinematic rig's own numbers, parsed from DuelScene rather than restated: the
 * camera sits `baseDist` behind the fighters' midpoint at `baseHeight`, and looks at
 * their midpoint 1.2 units up. With a fixed vertical FOV the fighters' projected
 * positions are the same FRACTION of the canvas height at every width — which is why
 * the fix is about how tall the canvas is, not how wide.
 */
const BASE_DIST = numeric(sceneSource, 'baseDist');
const BASE_HEIGHT = numeric(sceneSource, 'baseHeight');
const LOOK_Y = numeric(sceneSource, 'lookY');
const FOV = Number((sceneSource.match(/fov:\s*(\d+)/) ?? [])[1]);
const tanHalfFov = Math.tan((FOV * Math.PI) / 180 / 2);

/** Vertical NDC of a world point for a camera at (0, baseHeight, midZ + dist) looking at (0, LOOK_Y, midZ). */
const ndcY = (midZ: number, worldY: number, worldZ: number): number => {
  const camY = BASE_HEIGHT;
  const camZ = midZ + BASE_DIST;
  const fz = midZ - camZ;
  const fy = LOOK_Y - camY;
  const flen = Math.hypot(fy, fz);
  const f = { y: fy / flen, z: fz / flen };
  // right = +X, up = right × forward = (0, -f.z, f.y)
  const u = { y: -f.z, z: f.y };
  const vy = worldY - camY;
  const vz = worldZ - camZ;
  const zView = vy * f.y + vz * f.z;
  const yView = vy * u.y + vz * u.z;
  return yView / (zView * tanHalfFov);
};

const FIGHTER_TOP_Y = 1.101; // the rendered height of arena_roman (C-8.80E)
const fracOf = (midZ: number, worldZ: number) => ({
  head: (1 - ndcY(midZ, FIGHTER_TOP_Y, worldZ)) / 2,
  feet: (1 - ndcY(midZ, 0, worldZ)) / 2,
});

/** Opening (3.6m apart) and one Advance (1.8m), on the shipped geometry. */
const OPENING = { midZ: 0, playerZ: DUEL_SPAWN_OFFSET_Z, oppZ: -DUEL_SPAWN_OFFSET_Z };
const CLOSE = { midZ: -DUEL_SPAWN_OFFSET_Z / 2, playerZ: 0, oppZ: -DUEL_SPAWN_OFFSET_Z };

/**
 * Measured in the preview browser (the figures this phase's report quotes): the top
 * HUD block's bottom edge, measured from the top of the stage, and the command
 * panel's height. `stageH` is derived — the real viewport height minus the panel in
 * portrait, the whole viewport height in landscape (where the panel is a column).
 */
// REBASED (C-8.80P) on the post-fix measurements: the portrait panel is 338px
// (was 407/420), the desktop one 267px and its HUD compaction puts the top block at
// 188.5px. The stage is still DERIVED — viewport minus the panel where the two stack,
// the full height in short landscape where the panel is a column.
const MEASURED = [
  { label: '400x800 portrait', stageH: 800 - 338, overlayBottom: 155.5 },
  { label: '375x812 portrait', stageH: 812 - 338, overlayBottom: 155.5 },
  { label: '812x375 landscape', stageH: 375, overlayBottom: 120 },
  { label: '1280x800 desktop', stageH: 800 - 267, overlayBottom: 188.5 },
];

describe('C-8.80N §C both fighters project inside the unobscured stage', () => {
  test('the camera rig is the one this contract was measured against', () => {
    expect(BASE_DIST).toBe(8.5);
    expect(BASE_HEIGHT).toBe(5.2);
    expect(LOOK_Y).toBe(1.2);
    expect(FOV).toBe(45);
  });

  test('the opening is the 3.6m engagement distance C-8.80J designed', () => {
    expect(DUEL_OPENING_SEPARATION_M).toBe(3.6);
    expect(DUEL_SPAWN_OFFSET_Z).toBe(1.8);
    expect(DUEL_MOVE_STEP_M).toBe(1.8);
    expect(DUEL_MIN_GAP_M).toBe(1.2);
  });

  for (const v of MEASURED) {
    test(`${v.label}: neither fighter is behind the top HUD or the panel`, () => {
      for (const pose of [OPENING, CLOSE]) {
        const opp = fracOf(pose.midZ, pose.oppZ);
        const player = fracOf(pose.midZ, pose.playerZ);
        // Below the top HUD block …
        expect(opp.head * v.stageH).toBeGreaterThan(v.overlayBottom);
        expect(player.head * v.stageH).toBeGreaterThan(v.overlayBottom);
        // … and inside the stage, not behind the panel.
        expect(player.feet * v.stageH).toBeLessThanOrEqual(v.stageH);
        expect(opp.feet * v.stageH).toBeLessThanOrEqual(v.stageH);
      }
    });
  }

  test('the player is a meaningful figure, not a few pixels of canvas', () => {
    const p = fracOf(OPENING.midZ, OPENING.playerZ);
    expect(Math.round((p.feet - p.head) * (800 - 338))).toBeGreaterThanOrEqual(50);
  });

  test('the opponent is legible at opening distance', () => {
    const o = fracOf(OPENING.midZ, OPENING.oppZ);
    expect(Math.round((o.feet - o.head) * (800 - 407))).toBeGreaterThanOrEqual(38);
  });

  test('the projection is aspect-independent, which is why the stage height is the lever', () => {
    const a = fracOf(OPENING.midZ, OPENING.playerZ);
    expect(a.head).toBeCloseTo(0.63, 2);
    expect(a.feet).toBeCloseTo(0.77, 2);
  });
});

// ── §D. The CSS contract ────────────────────────────────────────────────────

describe('C-8.80N §D the responsive rules', () => {
  // REBASED (C-8.80P): the absolute overlay is still the DEFAULT — it is what
  // viewports narrower than 768px still get — but from 768x521 the two regions stack,
  // because measured at 1280x800 the player projected to 506...616 while the panel
  // began at 445: the player was behind it for its whole height, and the foot line at
  // 77% of the stage means no bottom panel could ever clear it. C-8.80Q measured the
  // same defect at every width from 768 to 1023 and moved the gate down to 768.
  test('the overlay is still the default; the wide block stacks the two regions', () => {
    expect(css).toContain('.duel-stage {\n  position: absolute;\n  inset: 0;\n}');
    const command = css.slice(css.indexOf('.duel-command {'));
    expect(command.slice(0, 200)).toContain('position: absolute');
    expect(wide).not.toBe('');
    expect(ruleBody(wide, '.duel-root')).toContain('flex-direction: column');
    expect(ruleBody(wide, '.duel-stage')).toContain('flex: 1 1 auto');
    expect(ruleBody(wide, '.duel-command')).toContain('position: relative');
  });

  test('portrait stacks the stage above the panel', () => {
    expect(ruleBody(portrait, '.duel-root')).toContain('flex-direction: column');
    expect(ruleBody(portrait, '.duel-stage')).toContain('position: relative');
    expect(ruleBody(portrait, '.duel-stage')).toContain('flex: 1 1 auto');
    expect(ruleBody(portrait, '.duel-command')).toContain('position: relative');
  });

  test('short landscape puts the panel in a column beside the stage', () => {
    expect(ruleBody(landscape, '.duel-root')).toContain('flex-direction: row');
    expect(ruleBody(landscape, '.duel-stage')).toContain('flex: 1 1 auto');
    expect(ruleBody(landscape, '.duel-command')).toContain('width: 28.75rem');
    expect(ruleBody(landscape, '.duel-command')).toContain('overflow-y: auto');
  });

  test('the phone blocks keep every control and drop only chrome', () => {
    for (const block of [portrait, landscape]) {
      const bare = bareBlock(block);
      const hidden = [...bare.matchAll(/([^{}]+)\{\s*display: none;/g)].map((m) => m[1].trim());
      expect(hidden.length).toBeGreaterThan(0);
      for (const selector of hidden) {
        expect(selector).not.toContain('button');
        expect(selector).not.toContain('tactic-strip');
        expect(selector).not.toContain('combat-log-items');
      }
      // Both phone blocks hide the tactic blurbs; the cards keep their stats.
      expect(block).toContain('.duel-command .tactic-desc');
    }
  });

  test('the chronicle stays bounded and scrollable on phones', () => {
    expect(ruleBody(portrait, '.duel-command .combat-log-items')).toBe('max-height: 2.25rem;');
    expect(ruleBody(landscape, '.duel-command .combat-log-items')).toBe('max-height: 1.5rem;');
    expect(panelSource).toContain('overflow-y-auto');
  });

  test('the portrait block does not force the landscape layout', () => {
    expect(portrait).not.toContain('flex-direction: row');
    // REBASED (C-8.80P): the portrait block now tightens the tactic grid's GAPS
    // (``.tactic-grid { gap }`` and its cards' padding); what it must never do is
    // re-flow the columns, which is what the landscape and wide blocks change.
    expect(portrait).not.toContain('grid-template-columns');
  });
});

// ── §E. Scope guard ─────────────────────────────────────────────────────────

describe('C-8.80N §E no camera, combat, canvas or timing value changed', () => {
  test('the camera rig keeps its three modes, its look-at and its shake', () => {
    expect(sceneSource).toContain('baseDist = 4.2;');
    expect(sceneSource).toContain('baseDist = 11.0;');
    expect(sceneSource).toContain('camera.lookAt(lookX, lookY, midZ);');
    expect(sceneSource).toContain('CAMERA_SHAKE_TRAUMA_DECAY');
  });

  test('the spawn is derived and the turn window is untouched', () => {
    expect(sceneSource).toContain('DUEL_SPAWN_OFFSET_Z');
    expect(sceneSource).toContain('1100');
  });

  test('the wind-up cues, the DPR cap and the canvas options are untouched', () => {
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(sceneSource).toContain('dpr={[1, 2]}');
    expect(sceneSource).toContain('fov: 45');
    expect(sceneSource).toContain('frameloop={frameloopMode}');
  });

  test('the panel still computes its numbers from the shared combat module', () => {
    expect(panelSource).toContain("from '../../utils/combatCalculations'");
    for (const name of ['getStaminaCost', 'calculateHitChance', 'calculateAttackDamage', 'isAttackInRange']) {
      expect(panelSource).toContain(name);
    }
  });

  test('the touch floors survive the recomposition', () => {
    // The reaction targets (two) and Withdraw (one) keep their 44px floor, and
    // Settings its 48px one — all in the HUD. The panel's movement strip keeps its
    // own shipped padding; no phone rule resizes a control.
    expect(hudSource.split('min-h-[44px]').length - 1).toBe(3);
    expect(hudSource).toContain('min-h-[48px]');
    // REBASED (MO-2): the movement strip's buttons now carry the same 44px floor as
    // every other HUD control, ahead of their unchanged shipped padding.
    expect(panelSource).toContain('min-h-[44px] px-3 py-1.5 rounded-lg border text-xs font-serif font-bold');
  });
});
