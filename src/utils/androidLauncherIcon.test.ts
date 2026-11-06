// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = read('../../android/app/src/main/AndroidManifest.xml');
const adaptive = read('../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
const adaptiveRound = read('../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
const foreground = read('../../android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml');
const legacy = read('../../android/app/src/main/res/mipmap-anydpi/ic_launcher.xml');
const legacyRound = read('../../android/app/src/main/res/mipmap-anydpi/ic_launcher_round.xml');

describe('native Sand & Steel launcher branding', () => {
  test('the Android application and round icon resolve to adaptive launcher resources', () => {
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
    for (const icon of [adaptive, adaptiveRound]) {
      expect(icon).toContain('android:drawable="@drawable/ic_launcher_foreground"');
      expect(icon).toContain('android:drawable="@drawable/ic_launcher_background"');
      expect(icon).not.toContain('@mipmap/ic_launcher_foreground');
    }
  });

  test('adaptive foreground contains the branded gladius and laurel, not the template robot', () => {
    expect(foreground).toContain('#c9902f');
    expect(foreground).toContain('M256,130 C264,152 276,168 282,186');
    expect(foreground).toContain('M248,396 L230,440');
    expect(foreground).not.toContain('M66.94,46.02');
    expect(foreground).not.toContain('#26A69A');
  });

  test('legacy Android launcher resources use the same branded artwork', () => {
    for (const icon of [legacy, legacyRound]) {
      expect(icon).toContain('#141110');
      expect(icon).toContain('#c9902f');
      expect(icon).toContain('M256,130 C264,152 276,168 282,186');
      expect(icon).not.toContain('M66.94,46.02');
      expect(icon).not.toContain('#26A69A');
    }
  });
});
