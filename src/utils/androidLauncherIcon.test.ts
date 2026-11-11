// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = read('../../android/app/src/main/AndroidManifest.xml');
const adaptive = read('../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
const adaptiveRound = read('../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
const pwaManifest = read('../../public/manifest.webmanifest');
const iconGenerator = read('../../scripts/generateIconAssets.cjs');

describe('native Sand & Steel launcher branding', () => {
  test('adaptive foreground square fits inside Android circular safe zone', () => {
    const ratioMatch = iconGenerator.match(/const ADAPTIVE_SAFE_ZONE_RATIO = ([0-9.]+);/);
    expect(ratioMatch).not.toBeNull();
    const ratio = Number(ratioMatch?.[1]);
    // Android safe zone is a circle: the square diagonal must not exceed its diameter.
    expect(ratio * Math.sqrt(2)).toBeLessThanOrEqual(0.66);
    expect(iconGenerator).toContain('const ADAPTIVE_EDGE_CROP_RATIO = 0.04;');
  });

  test('the Android application and round icon resolve to adaptive launcher resources', () => {
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
    for (const icon of [adaptive, adaptiveRound]) {
      expect(icon).toContain('android:drawable="@mipmap/ic_launcher_foreground"');
      expect(icon).toContain('android:drawable="@drawable/ic_launcher_background"');
    }
  });

  test('every density folder contains legacy icons and adaptive foreground/background resources', () => {
    const densities = ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
    for (const d of densities) {
      const basePath = `../../android/app/src/main/res/mipmap-${d}`;
      const sq = new URL(`${basePath}/ic_launcher.png`, import.meta.url);
      const rnd = new URL(`${basePath}/ic_launcher_round.png`, import.meta.url);
      const fg = new URL(`${basePath}/ic_launcher_foreground.png`, import.meta.url);
      const bg = new URL(`${basePath}/ic_launcher_background.png`, import.meta.url);

      expect(existsSync(sq)).toBe(true);
      expect(existsSync(rnd)).toBe(true);
      expect(existsSync(fg)).toBe(true);
      expect(existsSync(bg)).toBe(true);

      expect(readFileSync(sq).byteLength).toBeGreaterThan(100);
      expect(readFileSync(rnd).byteLength).toBeGreaterThan(100);
      expect(readFileSync(fg).byteLength).toBeGreaterThan(100);
      expect(readFileSync(bg).byteLength).toBeGreaterThan(100);
    }
  });

  test('PWA manifest icon paths resolve to actual image assets on disk', () => {
    expect(pwaManifest).toContain('/icons/icon-192.png');
    expect(pwaManifest).toContain('/icons/icon-512.png');
    expect(pwaManifest).toContain('/icons/icon-maskable-512.png');

    const icon192 = new URL('../../public/icons/icon-192.png', import.meta.url);
    const icon512 = new URL('../../public/icons/icon-512.png', import.meta.url);
    const maskable512 = new URL('../../public/icons/icon-maskable-512.png', import.meta.url);
    const appleIcon = new URL('../../public/icons/apple-touch-icon.png', import.meta.url);

    expect(existsSync(icon192)).toBe(true);
    expect(existsSync(icon512)).toBe(true);
    expect(existsSync(maskable512)).toBe(true);
    expect(existsSync(appleIcon)).toBe(true);
  });

  test('no obsolete or stale vector launcher icon references remain active', () => {
    const oldForeground = new URL('../../android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml', import.meta.url);
    const oldLegacyXml = new URL('../../android/app/src/main/res/mipmap-anydpi/ic_launcher.xml', import.meta.url);

    expect(existsSync(oldForeground)).toBe(false);
    expect(existsSync(oldLegacyXml)).toBe(false);
  });
});
