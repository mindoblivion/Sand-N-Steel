// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const hud = readFileSync('src/components/ui/CombatHUD.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

describe('compact combat HUD on short landscape phones', () => {
  test('hides secondary utility labels and timer without hiding combat-critical information', () => {
    expect(hud).toContain('combat-utility-label');
    expect(hud).toContain('combat-weapon-label');
    expect(hud).toContain('combat-match-timer');
    expect(hud).toContain('playerStaminaPct');
    expect(hud).toContain('opponentStaminaPct');
    expect(hud).toContain('CROWD HYPE');
    expect(css).toContain('.combat-hud .combat-match-timer');
    expect(css).toContain('display: none;');
  });

  test('compaction only applies to short landscape viewports and preserves touch targets', () => {
    expect(css).toContain('@media (orientation: landscape) and (max-height: 520px)');
    expect(hud).toContain('min-h-[48px] min-w-[48px]');
  });

  test('icon-only controls keep accessible names', () => {
    expect(hud).toContain('aria-label={`Camera view: ${cameraMode.replace');
    expect(hud).toContain('aria-label="Game Settings"');
    expect(hud).toContain('aria-label="Controls and instructions"');
    expect(hud).toContain('aria-label={isMuted ? \'Unmute sound\' : \'Mute sound\'}');
  });
});
