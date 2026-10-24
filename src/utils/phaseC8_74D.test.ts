/**
 * Short-landscape combat HUD viewport fit (C-8.74D-A).
 *
 * The defect this pins: at 812x375 the duel HUD stacked 160.1px of header over a
 * 331px panel, so the panel ended 120.9px below the fold and the movement strip
 * (Advance / Retreat / Catch Breath) was entirely unreachable — even with no cue
 * on screen. The fix is landscape-only chrome: the five tactic cards go in one
 * row of five instead of two rows of four, and the dashboard's own padding and
 * gaps tighten. No control's size, no cue, no timing and no combat rule changed.
 *
 * This suite reads the shipped sources, the way the other phase suites here do:
 *   §A the landscape block exists and carries exactly the two new rules
 *   §B the components expose the hooks those rules target
 *   §C the base (portrait/desktop) grid is untouched — the fix cannot leak
 *   §D the scope guard: cues, reaction targets, movement controls, timings
 *   §E the rules are unlayered and free of !important, as this block requires
 *
 * Run with: bun test src/utils/phaseC8_74D.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const panelSource = readFileSync(
  new URL('../components/ui/TurnActionPanel.tsx', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);

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

const LANDSCAPE = '(orientation: landscape) and (max-height: 520px)';
const landscape = mediaBlock(css, LANDSCAPE) ?? '';

/** The declaration body of one flat selector inside a block. */
const ruleBody = (block: string, selector: string): string | null => {
  const at = block.indexOf(`${selector} {`);
  if (at < 0) return null;
  const open = block.indexOf('{', at);
  const close = block.indexOf('}', open);
  return block.slice(open + 1, close).replace(/\s+/g, ' ').trim();
};

describe('C-8.74D-A §A the landscape rules', () => {
  test('the short-landscape block still exists', () => {
    expect(landscape.length).toBeGreaterThan(0);
  });

  test('the tactic grid becomes one row of five', () => {
    expect(ruleBody(landscape, '.combat-hud .tactic-grid')).toBe(
      'grid-template-columns: repeat(5, minmax(0, 1fr));',
    );
  });

  test('the dashboard chrome tightens without touching controls', () => {
    expect(ruleBody(landscape, '.combat-hud .tactic-dashboard')).toBe(
      'gap: 0.3rem; padding: 0.5rem;',
    );
  });

  test('the five columns are the only grid property the rule sets', () => {
    const body = ruleBody(landscape, '.combat-hud .tactic-grid') ?? '';
    expect(body).not.toContain('gap');
    expect(body).not.toContain('padding');
  });

  test('the pre-existing compaction rules are still present', () => {
    for (const selector of [
      '.combat-hud',
      '.combat-top',
      '.combat-hud .vital-card',
      '.combat-hud .hype-meter',
      '.combat-hud .tactic-desc',
      '.combat-hud .combat-log-items',
    ]) {
      expect(ruleBody(landscape, selector)).not.toBeNull();
    }
  });
});

describe('C-8.74D-A §B the hooks the rules target', () => {
  test('the command grid carries `tactic-grid` on top of its base classes', () => {
    const line = panelSource
      .split('\n')
      .find((l) => l.includes('tactic-grid') && l.includes('<div'));
    expect(line).toBeDefined();
    expect(line).toContain('grid grid-cols-2 sm:grid-cols-4');
  });

  test('the dashboard card carries `tactic-dashboard` on top of its base classes', () => {
    const line = panelSource
      .split('\n')
      .find((l) => l.includes('tactic-dashboard') && l.includes('<div'));
    expect(line).toBeDefined();
    expect(line).toContain('p-2 sm:p-3.5');
    expect(line).toContain('gap-2 sm:gap-2.5');
  });

  test('both hooks are applied exactly once', () => {
    const count = (needle: string) =>
      panelSource.split('\n').filter((l) => l.includes('<div') && l.includes(needle)).length;
    expect(count('tactic-grid')).toBe(1);
    expect(count('tactic-dashboard')).toBe(1);
  });
});

describe('C-8.74D-A §C the fix cannot leak into portrait or desktop', () => {
  test('every new rule lives inside the short-landscape block', () => {
    const without = css.replace(landscape, '');
    expect(without).not.toContain('.tactic-grid');
    expect(without).not.toContain('.tactic-dashboard');
  });

  test('no other media query mentions the hooks', () => {
    const queries = [...css.matchAll(/@media\s+([^{]+)\{/g)].map((m) => m[1].trim());
    const withHooks = queries.filter((query) => {
      const body = mediaBlock(css, query) ?? '';
      return body.includes('.tactic-grid') || body.includes('.tactic-dashboard');
    });
    expect(withHooks).toEqual([LANDSCAPE]);
  });

  test('the base grid stays two columns on mobile and four from `sm`', () => {
    expect(panelSource).toContain(
      'className="tactic-grid grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2"',
    );
  });
});

describe('C-8.74D-A §D scope guard — no control, cue or timing changed', () => {
  test('the reaction targets keep their 44px minimum', () => {
    // REBASED (C-8.80B): a third 44px touch target — the Withdraw action in the top bar —
    // joined the two reaction buttons. The contract is unchanged, so it is now also named
    // per control: each reaction target's own class list still carries the 44px floor.
    expect(hudSource.split('min-h-[44px]').length - 1).toBe(3);
    for (const reaction of ['shield_block', 'dodge']) {
      const at = hudSource.indexOf(`data-reaction="${reaction}"`);
      expect(at).toBeGreaterThan(-1);
      expect(hudSource.slice(at, at + 400)).toContain('min-h-[44px]');
    }
  });

  test('the C-8.74C-H cue stacking is untouched', () => {
    expect(hudSource.split('pointer-events-none z-30').length - 1).toBe(2);
    expect(hudSource).not.toContain('z-40');
  });

  test('the cue timings are still the shared constants', () => {
    expect(hudSource).toContain('ENEMY_ATTACK_WINDUP_MS');
    expect(hudSource).toContain('PLAYER_ATTACK_WINDUP_MS');
  });

  test('every movement control and tactic is still rendered', () => {
    for (const label of [
      'Quick Strike',
      'Power Slash',
      'Shield Guard',
      'Dodge',
      'Arena Taunt',
      'Advance (+1.8m)',
      'Retreat (-1.8m)',
      'Catch Breath (+40 SP)',
    ]) {
      expect(panelSource).toContain(label);
    }
  });

  test('no rule hides a control or forces scrolling', () => {
    // The shipped block hides exactly one thing — the tactic blurbs — and no
    // control: not the movement strip, not a tactic card, not a cue.
    const hidden = [...landscape.matchAll(/([^{}]+)\{\s*display: none;/g)].map((m) => m[1].trim());
    expect(hidden).toEqual(['.combat-hud .tactic-desc']);
    expect(landscape).not.toContain('overflow');
    expect(landscape).not.toContain('position: fixed');
  });
});

describe('C-8.74D-A §E the block keeps its unlayered contract', () => {
  test('no !important is needed or used', () => {
    expect(landscape).not.toContain('!important');
  });

  test('the landscape block is not nested inside @layer base', () => {
    const layerStart = css.indexOf('@layer base');
    const landscapeAt = css.indexOf(`@media ${LANDSCAPE}`);
    expect(layerStart).toBeGreaterThan(-1);
    expect(landscapeAt).toBeGreaterThan(layerStart);
    // Everything between the layer's opening brace and its close must not
    // contain the landscape block: check the layer body by brace matching.
    const open = css.indexOf('{', layerStart);
    let depth = 0;
    let layerEnd = -1;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) {
          layerEnd = i;
          break;
        }
      }
    }
    expect(layerEnd).toBeGreaterThan(open);
    expect(landscapeAt).toBeGreaterThan(layerEnd);
  });
});
