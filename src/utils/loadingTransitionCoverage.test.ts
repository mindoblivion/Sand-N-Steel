/**
 * START-1 — loading-cover transition coverage.
 *
 * Pins the selected Colosseum loading artwork and live asset-progress treatment
 * to the actual lazy scene / building transition boundaries in App.tsx. The
 * global overlay handles Drei asset activity after a scene mounts; WaitSurface
 * handles the Suspense interval before the destination scene is ready.
 *
 * This is a source wiring guard, not a visual or device-performance test.
 *
 * Run with: bun test src/utils/loadingTransitionCoverage.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const appSrc = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const overlaySrc = readFileSync(new URL('../components/ui/AssetLoadingOverlay.tsx', import.meta.url), 'utf8');
const waitSrc = readFileSync(new URL('../components/ui/WaitSurface.tsx', import.meta.url), 'utf8');
const destinationsSrc = readFileSync(new URL('../components/ui/waitSurfaceLines.ts', import.meta.url), 'utf8');

describe('START-1 — loading artwork and progress across scene transitions', () => {
  test('the global asset overlay stays mounted over the game screen tree', () => {
    expect(appSrc).toContain("import { AssetLoadingOverlay } from './components/ui/AssetLoadingOverlay'");
    expect(appSrc).toContain('<AssetLoadingOverlay />');
    expect(overlaySrc).toContain('useProgress()');
    expect(overlaySrc).toContain('COLOSSEUM_LOADING_CLASS');
    expect(overlaySrc).toContain('data-loading-progress="true"');
    expect(overlaySrc).toContain('role="progressbar"');
  });

  test('every principal lazy destination has its named WaitSurface fallback', () => {
    const fallbacks = [...appSrc.matchAll(/fallback=\{<WaitSurface destination="([^"]+)"(?: rotate=\{false\})? \/>\}/g)]
      .map((match) => match[1]);
    const expected = ['character_creation', 'city_hub', 'school_hub', 'arena', 'circus'];
    for (const destination of expected) {
      expect(fallbacks, `missing WaitSurface fallback for ${destination}`).toContain(destination);
      expect(destinationsSrc, `missing destination copy for ${destination}`).toContain(`${destination}:`);
    }
  });

  test('building interiors use the city destination while they load', () => {
    const interiors = [
      'TavernInterior',
      'ColosseumInterior',
      'ForgeInterior',
      'BountyHallInterior',
      'BathhouseInterior',
      'GladiatorAcademyInterior',
    ];
    for (const interior of interiors) {
      const at = appSrc.indexOf(`<${interior}`);
      expect(at, `${interior} is mounted in App.tsx`).toBeGreaterThanOrEqual(0);
      const before = appSrc.slice(Math.max(0, at - 260), at);
      expect(before, `${interior} must have the city WaitSurface fallback`).toContain('fallback={<WaitSurface destination="city_hub" />}>');
    }
  });

  test('WaitSurface uses the same loading artwork and live determinate / indeterminate progress', () => {
    expect(waitSrc).toContain('COLOSSEUM_LOADING_CLASS');
    expect(waitSrc).toContain('useProgress()');
    expect(waitSrc).toContain('data-wait-surface={destination}');
    expect(waitSrc).toContain('data-loading-progress="true"');
    expect(waitSrc).toContain('role="progressbar"');
    expect(waitSrc).toContain('aria-valuenow={knowsCount ? pct : undefined}');
    expect(waitSrc).toContain('wait-sweep');
  });
});
