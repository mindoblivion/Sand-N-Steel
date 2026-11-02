// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const hub = readFileSync('src/components/hub/GladiatorSchoolHub.tsx', 'utf8');

describe('mobile hub code splitting', () => {
  test('the six tab surfaces are loaded on demand, not in the initial hub chunk', () => {
    for (const name of ['TournamentTab', 'TrainingTab', 'ShopTab', 'GearTab', 'StatsTab', 'LibraryTab']) {
      expect(hub).toContain(`const ${name} = React.lazy(() => import('./${name}').then((module) => ({ default: module.${name} })));`);
      expect(hub).not.toContain(`import { ${name} } from './${name}';`);
    }
  });

  test('tab loading has a bounded, accessible placeholder', () => {
    expect(hub).toContain('min-h-[12rem]');
    expect(hub).toContain('aria-busy="true"');
    expect(hub).toContain('<React.Suspense fallback={');
  });

  test('the facilities panel remains eager and stays above every tab', () => {
    expect(hub).toContain('<FacilitiesPanel profile={playerProfile} onBuyFacility={onBuyFacility} />');
    expect(hub.indexOf('<FacilitiesPanel')).toBeLessThan(hub.indexOf("activeTab === 'tournament'"));
  });

  test('the help manual is loaded only when opened', () => {
    expect(hub).toContain("const HelpModal = React.lazy(() => import('./HelpModal').then((module) => ({ default: module.HelpModal })));" );
    expect(hub).toContain('<React.Suspense fallback={null}>');
  });
});
