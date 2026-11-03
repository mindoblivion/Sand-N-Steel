// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { hasTriggeredPreload, preloadAssetsForStage } from './preloadAssets';

const app = readFileSync('src/App.tsx', 'utf8');

const lazyModules = [
  'CharacterCreation',
  'NewCharacterOverwriteModal',
  'DuelResultModal',
  'DeviceChoosingPanel',
  'GoogleDriveSyncModal',
  'SettingsModal',
  'DeleteAccountModal',
  'OathBeat',
  'DayBanner',
];

describe('mobile app screen and modal code splitting', () => {
  test('conditional screens and overlays are lazy-loaded', () => {
    for (const name of lazyModules) {
      expect(app).toContain(`const ${name} = React.lazy(() => import(`);
      expect(app).not.toContain(`import { ${name} } from './components/`);
    }
  });

  test('character creation keeps a dark full-screen loading surface', () => {
    expect(app).toContain('min-h-[100dvh] bg-neutral-950');
    expect(app).toContain('<CharacterCreation');
  });

  test('critical overlays block input while their first chunk loads', () => {
    expect(app).toContain('fixed inset-0 z-[80] bg-neutral-950/95');
    expect(app).toContain('<DuelResultModal');
    expect(app).toContain('<OathBeat');
  });

  test('settings and cloud-save modals are not mounted until requested', () => {
    expect(app).toContain('{settingsOpen && (');
    expect(app).toContain('{showDriveSync && (');
    expect(app).toContain('{deleteAccountOpen && authUser && (');
  });
});

describe('3D asset preloader code splitting', () => {
  test('Drei is loaded dynamically when a preload stage is requested', () => {
    const preloader = readFileSync('src/utils/preloadAssets.ts', 'utf8');
    expect(preloader).not.toContain("import { useGLTF } from '@react-three/drei'");
    expect(preloader).toContain("import('@react-three/drei')");
    expect(preloader).toContain('useGLTF.preload(assetPath)');
  });

  test('a rejected preload resets its latch and a later attempt succeeds', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(hasTriggeredPreload()).toBe(false);
      preloadAssetsForStage(1, () => Promise.reject(new Error('transient chunk failure')));
      expect(hasTriggeredPreload()).toBe(true);

      // Flush the rejected loader and its catch handler.
      await Promise.resolve();
      await Promise.resolve();
      expect(hasTriggeredPreload()).toBe(false);

      const preloadedAssets: string[] = [];
      preloadAssetsForStage(1, () => Promise.resolve({
        useGLTF: { preload: (path: string) => { preloadedAssets.push(path); } },
      }));
      await Promise.resolve();
      await Promise.resolve();

      expect(preloadedAssets).toEqual(['/models/arena_roman.glb']);
      expect(hasTriggeredPreload()).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
  
  test('a synchronous useGLTF.preload failure also releases the stage for retry', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    let attempts = 0;
    const preloadedAssets: string[] = [];
    try {
      preloadAssetsForStage(2, async () => {
        attempts += 1;
        return { useGLTF: { preload: () => { throw new Error('transient preload failure'); } } };
      });
      await Promise.resolve();
      await Promise.resolve();

      preloadAssetsForStage(2, async () => {
        attempts += 1;
        return { useGLTF: { preload: (path: string) => { preloadedAssets.push(path); } } };
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(attempts).toBe(2);
      expect(preloadedAssets).toEqual(['/models/arena_roman.glb']);
    } finally {
      warn.mockRestore();
    }
  });
});
