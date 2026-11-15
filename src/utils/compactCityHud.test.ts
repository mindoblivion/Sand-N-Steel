// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const city = readFileSync('src/components/3d/city/CityHubScene.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

describe('compact city HUD on short landscape screens', () => {
  test('keeps the primary controls but removes secondary labels and the fame counter', () => {
    expect(city).toContain('data-city-top-header="true"');
    expect(city).toContain('data-city-footer="true"');
    expect(city).toContain('data-city-footer-item="true"');
    expect(city).toContain('city-utility-label');
    expect(city).toContain('city-footer-label');
    expect(city).toContain('city-fame-counter');
    expect(css).toContain('.city-utility-label,');
    expect(css).toContain('.city-footer-label {');
    expect(css).toContain('display: none;');
  });

  test('limits compaction to short landscape viewports and preserves 48px touch targets', () => {
    expect(css).toContain('@media (orientation: landscape) and (max-height: 520px)');
    expect(city).toContain('min-h-[48px]');
  });

  test('icon-only utility buttons retain accessible names and explanatory titles', () => {
    expect(city).toContain('aria-label="City Map & Fast Travel"');
    expect(city).toContain('title="Google Drive Cloud Saves"');
    expect(city).toContain('title={isMuted ? \'Unmute Audio\' : \'Mute Audio\'}');
  });
});


describe('portrait phone city HUD and Colosseum gate', () => {
  test('removes nonessential dawn and visitor chrome and static ambient warriors', () => {
    expect(city).toContain('<PhaseMedallion');
    expect(city).not.toContain('AMBIENT_CHARACTERS.map');
    expect(city).toContain('data-city-visitors-button="true"');
    expect(css).toContain('[data-city-phase-medallion="true"]');
    expect(css).toContain('[data-city-visitors-button="true"]');
  });

  test('constrains right-side utilities and turns the bottom bar into icon navigation', () => {
    expect(city).toContain('data-city-utility-panel="true"');
    expect(city).toContain('aria-label="Return to Main Menu"');
    expect(city).toContain('city-main-menu-mobile');
    expect(css).toContain('@media (max-width: 480px) and (orientation: portrait)');
    expect(css).toContain('[data-city-footer="true"] .city-footer-label');
  });

  test('gate opens a confirmation and routes into the tournament board, not the empty arena', () => {
    expect(city).toContain('if (nearbyLoc?.id === \'colosseum\') setColosseumPanel(true)');
    expect(city).toContain('onOpenTab(\'tournament\')');
    expect(city).not.toContain('onEnterArena');
    expect(city).not.toContain('handleColosseumFight');
  });
});
