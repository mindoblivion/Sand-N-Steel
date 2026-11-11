// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const assetLoadingSrc = readFileSync(new URL('../components/ui/AssetLoadingOverlay.tsx', import.meta.url), 'utf8');
const waitSurfaceSrc = readFileSync(new URL('../components/ui/WaitSurface.tsx', import.meta.url), 'utf8');

describe('Loading and Asset Failure Recovery Flow (Audit PR)', () => {
  test('AssetLoadingOverlay checks useProgress errors and presents retry action instead of hiding silently', () => {
    expect(assetLoadingSrc).toContain('errors');
    expect(assetLoadingSrc).toContain('hasErrors');
    expect(assetLoadingSrc).toContain('Asset Download Failed');
    expect(assetLoadingSrc).toContain('Try again');
    expect(assetLoadingSrc).toContain('reload()');
  });

  test('WaitSurface checks useProgress errors and presents retry action instead of spinning infinitely', () => {
    expect(waitSurfaceSrc).toContain('errors');
    expect(waitSurfaceSrc).toContain('hasErrors');
    expect(waitSurfaceSrc).toContain('Asset download failed');
    expect(waitSurfaceSrc).toContain('Try again');
  });

  test('Both loading surfaces preserve Colosseum backdrop class and avoid touching local saves', () => {
    expect(assetLoadingSrc).toContain('COLOSSEUM_LOADING_CLASS');
    expect(waitSurfaceSrc).toContain('COLOSSEUM_LOADING_CLASS');
    expect(assetLoadingSrc).not.toContain('localStorage');
    expect(waitSurfaceSrc).not.toContain('localStorage');
  });
});
