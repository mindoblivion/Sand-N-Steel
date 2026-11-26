// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const panel = readFileSync('src/components/ui/TurnActionPanel.tsx', 'utf8');
const hud = readFileSync('src/components/ui/CombatHUD.tsx', 'utf8');
const duel = readFileSync('src/components/duel/DuelScene.tsx', 'utf8');

describe('PHASE1-TOUCH — the duel panel mirrors as one unit in Lefty Mode', () => {
  test('the mirror is one class, on the rows, gated on isLeftyMode', () => {
    expect(panel).toContain("const mirror = isLeftyMode ? 'flex-row-reverse' : ''");
    // The mirror is applied to the turn banner and the secondary strip — the
    // two inner rows. The root row and the grid reverse by their own
    // conditionals, below, so the count here is exactly two.
    expect(panel.split('${mirror}').length - 1).toBe(2);
    expect(panel).toContain("data-duel-panel={isLeftyMode ? 'lefty' : 'righty'}");
  });

  test('the outer row reverses: chronicle and dashboard swap sides on wide layouts', () => {
    expect(panel).toContain("isLeftyMode ? 'md:flex-row-reverse' : 'md:flex-row'");
  });

  test('the action grid reverses by direction, and each card stays left-to-right inside', () => {
    expect(panel).toContain("isLeftyMode ? '[direction:rtl]' : ''");
    // Six action cards (quick, power, shield, dodge, net, taunt), each pinned
    // ltr so the mirror moves the card, never the card's own header/footer.
    // (Attribute lines only — the prop comment above mentions dir="ltr" too.)
    expect(panel.match(/^\s+dir="ltr"$/gm)?.length).toBe(6);
  });

  test('no button label or function moves under the mirror', () => {
    // Every action still dispatches its own action, with its own label — via
    // the panel's one dispatch path (PHASE1-TOUCH Part 4): the prop wrapped,
    // so the buttons still call onExecuteAction(...) and the tick fires
    // inside the wrapper. The shield card's title is the weapon's brace
    // title, not a literal — it renders {bracePresentation.title} and
    // dispatches shield_block.
    for (const [action, label] of [
      ['quick_attack', 'Quick Strike'],
      ['power_attack', 'Power Slash'],
      ['dodge', 'Dodge'],
      ['cast_net', 'Cast the Net'],
      ['taunt', 'Arena Taunt'],
    ] as const) {
      expect(panel).toContain(`onExecuteAction('${action}'`);
      expect(panel).toContain(label);
    }
    expect(panel).toContain("onExecuteAction('shield_block')");
    expect(panel).toContain('{bracePresentation.title}');
    // The prop is declared once, renamed once at the destructure, wrapped
    // once, forwarded once, and called from the ten buttons — sixteen
    // mentions, and the wrapper is the only definition.
    expect(panel.split('onExecuteAction').length - 1).toBe(16);
    expect(panel.split('const onExecuteAction').length - 1).toBe(1);
    // And the secondary strip's own labels are untouched.
    for (const label of ['Advance (+1.8m)', 'Retreat (-1.8m)', 'Sidestep', 'Catch Breath (+40 SP)']) {
      expect(panel).toContain(label);
    }
    // The mirror is classes only: no onClick, no label, no dispatch is
    // conditional on isLeftyMode anywhere in the panel.
    const leftyUses = panel.split('isLeftyMode').length - 1;
    // prop + default + mirror const + root row + data attribute + grid = 6.
    expect(leftyUses).toBe(6);
  });

  test('the flag reaches the panel through the HUD, from the scene', () => {
    expect(hud).toContain('isLeftyMode?: boolean');
    expect(hud).toContain('isLeftyMode={isLeftyMode}');
    expect(duel).toContain('isLeftyMode={isLeftyMode}');
  });
});
