// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = read('../../android/app/src/main/AndroidManifest.xml');
const adaptive = read('../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
const adaptiveRound = read('../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
const pwaManifest = read('../../public/manifest.webmanifest');
const iconGenerator = read('../../scripts/generateIconAssets.cjs');
const iconSource = read('../../public/icons/icon-source.svg');
const packageJson = JSON.parse(read('../../package.json'));

describe('native Sand & Steel launcher branding', () => {
  test('Android and PWA icon generator uses the approved SVG master', () => {
    expect(iconGenerator).toContain("../public/icons/icon-source.svg");
    expect(iconGenerator).not.toContain("file_00000000445881f587bb682b9f8ef1bb_a38986d0.png");
    expect(iconGenerator).toContain('resize(canvasSize, canvasSize, { fit: \'contain\' })');
    expect(iconSource).toContain('aria-label="Sand and Steel, two gladiators flanking the wordmark"');
    expect(iconSource).toContain('sand&amp;steel');
    expect(iconSource).toContain('<g transform="translate(512 0) scale(-1 1)"');
    const centeredScale = iconSource.match(/<g transform="([^"]+)">/);
    expect(centeredScale?.[1]).toBe('translate(51.2 51.2) scale(.8)');
    // Check representative outer points of the helmet, plume, shield and boots
    // after the 80% center-preserving transform against Android's 66% safe circle.
    const safeRadius = 512 * 0.66 / 2;
    const sourcePoints = [[110, 135], [163, 73], [75, 260], [121, 401]];
    for (const [x, y] of sourcePoints) {
      const transformedX = 51.2 + x * 0.8;
      const transformedY = 51.2 + y * 0.8;
      expect(Math.hypot(transformedX - 256, transformedY - 256)).toBeLessThan(safeRadius);
    }
    expect(packageJson.scripts.build).toContain('node scripts/generateIconAssets.cjs && vite build');
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
