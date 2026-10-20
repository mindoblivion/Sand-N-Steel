/**
 * settings.test.ts — C-8.70B §SET-1: the settings module's own contract.
 *
 * Run with: bun test src/utils/settings.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A `resolveSettings` — pure and total: an empty record resolves to the
 *      defaults, a partial record merges, a damaged one falls back field by field,
 *      the legacy lefty key is read only when the record is silent about lefty, and
 *      `screenMotion`'s ABSENCE survives resolution (the resolver never invents it);
 *   §B `getCameraShakeMultiplier` — the whole table, the reduced-motion cap included;
 *   §C the derived readers the scenes consume — the brightness exposure, the city
 *      camera's three framings (with the design's ≥18% readability floor applied to
 *      Far) and the drag-sensitivity scale;
 *   §D storage — the record round-trips, lefty mirrors the legacy key, and the
 *      settings path is **byte-safe for the player's save**: cycling every field
 *      leaves the profile key's stored value character-for-character what it was;
 *   §E the wiring — every scene that consumes a setting, the race's freeze gate and
 *      the duel's two haptic call sites, read out of the shipped sources so a later
 *      edit cannot quietly unhook one.
 *
 * The storage sections drive a recording store (the `start1.test.ts` idiom) rather
 * than a browser's own, so nothing here touches a real save.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  BRIGHTNESS_EXPOSURE,
  CAMERA_SENSITIVITY_MAX,
  CAMERA_SENSITIVITY_MIN,
  CITY_CAMERA_DISTANCES,
  CITY_CAMERA_FAR_REQUESTED,
  CITY_CAMERA_SUBJECT_SCREEN_FLOOR,
  DEFAULT_SETTINGS,
  MUSIC_VOLUME_DEFAULT,
  SETTINGS_STORAGE_KEY,
  applyBrightness,
  cityCameraSubjectScreenFraction,
  getBrightnessExposure,
  getCameraSensitivityScale,
  getCameraShakeMultiplier,
  getEffectiveScreenMotion,
  getSettings,
  loadSettings,
  resolveSettings,
  saveSettings,
  subscribeSettings,
  updateSettings,
} from '../services/settings';
import type { CameraShake, Settings, ScreenMotion } from '../services/settings';

/** The player's own record: this slice must never move a byte of it. */
const PROFILE_KEY = 'sand_and_steel_gladiator_save_v2';
const LEGACY_LEFTY_KEY = 'sand_and_steel_lefty_mode';

/** A recording `localStorage`, so no real browser storage is involved. */
function recordingStore() {
  const values: Record<string, string> = {};
  return {
    values,
    getItem: (key: string) => (key in values ? values[key] : null),
    setItem: (key: string, value: string) => {
      values[key] = String(value);
    },
    removeItem: (key: string) => {
      delete values[key];
    },
  };
}

let store: ReturnType<typeof recordingStore>;

beforeEach(() => {
  store = recordingStore();
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
});

const source = (path: string) => readFileSync(path, 'utf8');

describe('A. resolveSettings — pure and total', () => {
  test('an empty record resolves to exactly the defaults', () => {
    expect(resolveSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  test('the defaults are the design’s values', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      qualityPreset: 'balanced',
      brightness: 'standard',
      cityCamDistance: 'standard',
      raceCamDistance: 'standard',
      atmosphereMotion: true,
      musicVolume: 0.8,
      sfxVolume: 1.0,
      crowdVolume: 1.0,
      muted: false,
      lefty: false,
      cameraSensitivity: 5,
      vibration: true,
      cameraShake: 'reduced',
      enhancedColor: false,
    });
    expect(MUSIC_VOLUME_DEFAULT).toBe(0.8);
  });

  test('a partial record merges over the defaults, field by field', () => {
    const resolved = resolveSettings({ brightness: 'bright', musicVolume: 0.25, vibration: false });
    expect(resolved.brightness).toBe('bright');
    expect(resolved.musicVolume).toBe(0.25);
    expect(resolved.vibration).toBe(false);
    expect(resolved.cityCamDistance).toBe(DEFAULT_SETTINGS.cityCamDistance);
    expect(resolved.cameraShake).toBe(DEFAULT_SETTINGS.cameraShake);
  });

  test('a damaged record resolves to the defaults rather than reaching a consumer', () => {
    for (const garbage of ['nonsense', 42, [1, 2, 3], true, NaN]) {
      expect(resolveSettings(garbage)).toEqual(DEFAULT_SETTINGS);
    }
    const damaged = resolveSettings({
      brightness: 'purple',
      cityCamDistance: 7,
      atmosphereMotion: 'yes',
      musicVolume: 'loud',
      muted: 1,
      cameraSensitivity: null,
      cameraShake: {},
      enhancedColor: 'true',
    });
    expect(damaged).toEqual(DEFAULT_SETTINGS);
  });

  test('numbers are clamped to their own bounds, and the sensitivity stays whole', () => {
    expect(resolveSettings({ musicVolume: 5 }).musicVolume).toBe(1);
    expect(resolveSettings({ musicVolume: -2 }).musicVolume).toBe(0);
    expect(resolveSettings({ sfxVolume: Infinity }).sfxVolume).toBe(1.0);
    expect(resolveSettings({ cameraSensitivity: 42 }).cameraSensitivity).toBe(CAMERA_SENSITIVITY_MAX);
    expect(resolveSettings({ cameraSensitivity: 0 }).cameraSensitivity).toBe(CAMERA_SENSITIVITY_MIN);
    expect(resolveSettings({ cameraSensitivity: 5.6 }).cameraSensitivity).toBe(6);
  });

  test('the legacy lefty key is read only when the record says nothing about lefty', () => {
    // Record silent → the legacy key decides, both ways round.
    expect(resolveSettings({}, true).lefty).toBe(true);
    expect(resolveSettings({}, false).lefty).toBe(false);
    // Record explicit → the record wins, both ways round.
    expect(resolveSettings({ lefty: false }, true).lefty).toBe(false);
    expect(resolveSettings({ lefty: true }, false).lefty).toBe(true);
    // A damaged lefty falls back to the legacy key rather than to a wrong answer.
    expect(resolveSettings({ lefty: 'yes' }, true).lefty).toBe(true);
  });

  test('screenMotion’s absence is preserved — the resolver does not invent it', () => {
    const resolved = resolveSettings({ brightness: 'dim' });
    expect('screenMotion' in resolved).toBe(false);
    expect(resolved.screenMotion).toBeUndefined();
    expect('screenMotion' in DEFAULT_SETTINGS).toBe(false);
    // A value the design names is carried…
    expect(resolveSettings({ screenMotion: 'reduced' }).screenMotion).toBe('reduced');
    // …and anything else stays absent, which is what lets the OS decide.
    expect('screenMotion' in resolveSettings({ screenMotion: 'purple' })).toBe(false);
  });
});

describe('B. getCameraShakeMultiplier — the whole table', () => {
  const shake = (level: CameraShake, motion?: ScreenMotion, osReduced = false): number =>
    getCameraShakeMultiplier({ ...DEFAULT_SETTINGS, cameraShake: level, screenMotion: motion }, osReduced);

  test('full / reduced / off are 1 / 0.4 / 0', () => {
    expect(shake('full', 'full')).toBe(1);
    expect(shake('reduced', 'full')).toBe(0.4);
    expect(shake('off', 'full')).toBe(0);
  });

  test('the reduced-motion cap holds the shake at 0.4 whatever the shake row says', () => {
    expect(shake('full', 'reduced')).toBe(0.4);
    expect(shake('full', 'off')).toBe(0.4);
    // Absence means the OS decides, and an OS that asks for less motion caps it too.
    expect(shake('full', undefined, true)).toBe(0.4);
    expect(shake('reduced', 'reduced')).toBe(0.4);
    expect(shake('off', 'reduced')).toBe(0);
    // No cap, and no OS preference: the row's own value.
    expect(shake('full', undefined, false)).toBe(1);
    expect(shake('reduced', undefined, false)).toBe(0.4);
  });

  test('the effective screen motion is the stored value, or the OS’s own preference', () => {
    expect(getEffectiveScreenMotion(DEFAULT_SETTINGS, false)).toBe('full');
    expect(getEffectiveScreenMotion(DEFAULT_SETTINGS, true)).toBe('reduced');
    expect(getEffectiveScreenMotion({ ...DEFAULT_SETTINGS, screenMotion: 'off' }, false)).toBe('off');
  });
});

describe('C. The readers the scenes consume', () => {
  test('brightness is 0.9 / 1.0 / 1.1, and the helper writes it onto the renderer', () => {
    expect(BRIGHTNESS_EXPOSURE).toEqual({ dim: 0.9, standard: 1.0, bright: 1.1 });
    expect(getBrightnessExposure(DEFAULT_SETTINGS)).toBe(1.0);
    const renderer = { toneMappingExposure: 0 };
    applyBrightness(renderer, { ...DEFAULT_SETTINGS, brightness: 'bright' });
    expect(renderer.toneMappingExposure).toBe(1.1);
    applyBrightness(renderer, { ...DEFAULT_SETTINGS, brightness: 'dim' });
    expect(renderer.toneMappingExposure).toBe(0.9);
  });

  test('the city camera keeps the gladiator at or above the 18% floor at every preset', () => {
    expect(CITY_CAMERA_DISTANCES.standard).toBe(5.5);
    expect(CITY_CAMERA_DISTANCES.near).toBe(7);
    // Far is the design's 11.5 — capped by the design's OWN readability clause.
    expect(CITY_CAMERA_DISTANCES.far).toBeLessThanOrEqual(CITY_CAMERA_FAR_REQUESTED);
    for (const distance of Object.values(CITY_CAMERA_DISTANCES)) {
      expect(cityCameraSubjectScreenFraction(distance)).toBeGreaterThanOrEqual(
        CITY_CAMERA_SUBJECT_SCREEN_FLOOR,
      );
    }
    // The floor is what caps it: 11.5 would read below 18%.
    expect(cityCameraSubjectScreenFraction(CITY_CAMERA_FAR_REQUESTED)).toBeLessThan(
      CITY_CAMERA_SUBJECT_SCREEN_FLOOR,
    );
  });

  test('the drag-sensitivity scale is 1.0 at the default and moves one way', () => {
    expect(getCameraSensitivityScale(DEFAULT_SETTINGS)).toBeCloseTo(1.0, 10);
    expect(getCameraSensitivityScale({ ...DEFAULT_SETTINGS, cameraSensitivity: 1 })).toBeCloseTo(0.6, 10);
    expect(getCameraSensitivityScale({ ...DEFAULT_SETTINGS, cameraSensitivity: 10 })).toBeCloseTo(1.5, 10);
    const scales = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((cameraSensitivity) =>
      getCameraSensitivityScale({ ...DEFAULT_SETTINGS, cameraSensitivity }),
    );
    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]).toBeGreaterThan(scales[index - 1]);
    }
  });
});

describe('D. Storage — the record round-trips, and the save is untouched', () => {
  test('a saved record loads back as the same resolved values', () => {
    const next: Settings = {
      ...DEFAULT_SETTINGS,
      // SF-1 renamed the presets: 'high' is now Cinematic.
      qualityPreset: 'cinematic',
      brightness: 'dim',
      cityCamDistance: 'far',
      raceCamDistance: 'near',
      atmosphereMotion: false,
      musicVolume: 0.35,
      sfxVolume: 0.5,
      crowdVolume: 0.5,
      muted: true,
      lefty: true,
      cameraSensitivity: 8,
      vibration: false,
      cameraShake: 'off',
      enhancedColor: true,
    };
    const saved = saveSettings(next);
    expect(loadSettings()).toEqual(saved);
    expect(loadSettings()).toEqual(next);
    // One key, and it holds the record the module wrote.
    expect(JSON.parse(store.values[SETTINGS_STORAGE_KEY])).toEqual(saved);
  });

  test('screenMotion survives a round-trip, and its absence stays absent', () => {
    saveSettings({ ...DEFAULT_SETTINGS, screenMotion: 'off' });
    expect(loadSettings().screenMotion).toBe('off');
    expect(JSON.parse(store.values[SETTINGS_STORAGE_KEY]).screenMotion).toBe('off');

    saveSettings({ ...DEFAULT_SETTINGS });
    expect('screenMotion' in JSON.parse(store.values[SETTINGS_STORAGE_KEY])).toBe(false);
    expect(loadSettings().screenMotion).toBeUndefined();
  });

  test('saving lefty writes the record AND mirrors the legacy key', () => {
    saveSettings({ ...DEFAULT_SETTINGS, lefty: true });
    expect(store.values[LEGACY_LEFTY_KEY]).toBe('true');
    expect(JSON.parse(store.values[SETTINGS_STORAGE_KEY]).lefty).toBe(true);

    saveSettings({ ...DEFAULT_SETTINGS, lefty: false });
    expect(store.values[LEGACY_LEFTY_KEY]).toBe('false');

    // Lefty chosen before this slice (legacy key only) is still Lefty after it:
    // a record that says nothing about lefty reads the legacy key.
    delete store.values[SETTINGS_STORAGE_KEY];
    store.values[LEGACY_LEFTY_KEY] = 'true';
    expect(loadSettings().lefty).toBe(true);
  });

  test('the cache and its listeners follow every write', () => {
    saveSettings({ ...DEFAULT_SETTINGS, musicVolume: 0.1 });
    expect(getSettings().musicVolume).toBe(0.1);
    let notified = 0;
    const unsubscribe = subscribeSettings(() => {
      notified += 1;
    });
    updateSettings({ musicVolume: 0.9 });
    expect(notified).toBe(1);
    expect(getSettings().musicVolume).toBe(0.9);
    unsubscribe();
    updateSettings({ musicVolume: 0.2 });
    expect(notified).toBe(1);
  });

  test('cycling EVERY field through saveSettings leaves the save byte-identical', () => {
    const profile = JSON.stringify({
      name: 'Testus',
      level: 3,
      gold: 420,
      isLeftyMode: true,
      isLeftyModeNote: 'the legacy field this slice must not touch',
      inventory: [{ id: 'gladius' }],
    });
    store.setItem(PROFILE_KEY, profile);
    const before = store.getItem(PROFILE_KEY);

    // Every field of the record, each one changed to a different legal value.
    const variations: Array<Partial<Settings>> = [
      // SF-1 renamed the presets: 'high' is now Cinematic.
      { qualityPreset: 'cinematic' },
      { brightness: 'bright' },
      { cityCamDistance: 'far' },
      { raceCamDistance: 'near' },
      { atmosphereMotion: false },
      { musicVolume: 0.15 },
      { sfxVolume: 0.2 },
      { crowdVolume: 0.3 },
      { muted: true },
      { lefty: true },
      { cameraSensitivity: 9 },
      { vibration: false },
      { screenMotion: 'off' },
      { cameraShake: 'full' },
      { enhancedColor: true },
    ];
    for (const variation of variations) {
      saveSettings({ ...loadSettings(), ...variation });
      // The save is compared after every single write, not only at the end.
      expect(store.getItem(PROFILE_KEY), JSON.stringify(variation)).toBe(before);
    }
    // …and after a full cycle back to the defaults.
    saveSettings({ ...DEFAULT_SETTINGS });
    expect(store.getItem(PROFILE_KEY)).toBe(before);

    // A reload resolves from the settings record alone.
    expect(loadSettings().lefty).toBe(false);
    expect(Object.keys(store.values).sort()).toEqual(
      [PROFILE_KEY, SETTINGS_STORAGE_KEY, LEGACY_LEFTY_KEY].sort(),
    );
  });

  test('a store that refuses to answer is not an error state', () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveSettings({ ...DEFAULT_SETTINGS, musicVolume: 0.2 })).not.toThrow();
    expect(loadSettings().musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });

  test('the settings module names no save path', () => {
    // The module's own doc comment explains what it never touches, so the tokens
    // are looked for in the executable source: comments stripped, code kept.
    const code = source('src/services/settings.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const token of [
      'sand_and_steel_gladiator_save',
      'saveProfile',
      'loadSavedProfile',
      'PROFILE_STORAGE_KEY',
    ]) {
      expect(code, token).not.toContain(token);
    }
    expect(SETTINGS_STORAGE_KEY).toBe('sand_and_steel_settings_v1');
  });
});

describe('E. The wiring — every consumer, read out of the shipped sources', () => {
  test('App owns one panel, passes the context, and freezes the race', () => {
    const app = source('src/App.tsx');
    expect(app).toContain("import { SettingsModal } from './components/hub/SettingsModal';");
    expect(app).toContain("onOpenHelp={() => handleOpenSettings('controls', 'duel')}");
    expect(app).toContain("onOpenSettings={() => handleOpenSettings(undefined, 'race')}");
    expect(app).toContain('frozen={settingsOpen}');
    expect(app).toContain('context={settingsContext}');
    // Lefty and mute come from the record, and the toggle writes no save.
    expect(app).toContain('const isLeftyMode = settings.lefty;');
    expect(app).toContain('const isMuted = settings.muted;');
    expect(app).toContain('updateSettings({ lefty: !settings.lefty });');
    expect(app).toContain('updateSettings({ muted: !settings.muted });');
    expect(app).toContain('sounds.setMuted(settings.muted);');
    expect(app).toContain('music.setVolume(settings.musicVolume);');
    // The old profile-writing lefty toggle is gone.
    expect(app).not.toContain('isLeftyMode: nextLefty');
  });

  test('the race HUD offers the gear, and the freeze gates the loop, the clock and Esc', () => {
    const race = source('src/components/3d/RaceScene.tsx');
    expect(race).toContain('data-race-action="settings"');
    expect(race).toContain('const racing = raceState === \'racing\' && !frozen;');
    expect(race).toContain('if (!frozen) {');
    expect(race).toContain('pausedAtRef');
    expect(race).toContain('if (raceState !== \'countdown\' || frozen) return;');
    expect(race).toContain('if (frozen) return;\n    const handleKeyDown');
    // The state machine itself is untouched by the gate.
    expect(race).not.toContain('raceTransition');
  });

  test('the brightness helper is mounted in all four canvases', () => {
    for (const path of [
      'src/components/3d/city/CityHubScene.tsx',
      'src/components/duel/DuelScene.tsx',
      'src/components/3d/RaceScene.tsx',
      'src/components/3d/GladiatorPreview.tsx',
    ]) {
      expect(source(path), path).toContain('<SceneBrightness />');
    }
    expect(source('src/components/3d/SceneBrightness.tsx')).toContain('applyBrightness(gl, getSettings())');
  });

  test('the race camera reads its own row, through the addendum\u2019s attachment point', () => {
    const race = source('src/components/3d/RaceScene.tsx');
    expect(race).toContain('preset={resolveChaseDistancePreset(chaseDistancePreset)}');
    // The row itself, in the panel's Picture & Camera section.
    expect(source('src/components/hub/SettingsModal.tsx')).toContain('label="Race Camera Distance"');
    // …and App is what passes the stored value in.
    const app = source('src/App.tsx');
    expect(app).toContain('chaseDistancePreset={settings.raceCamDistance}');
  });

  test('the city camera reads both of its rows', () => {
    const camera = source('src/components/3d/city/CityCamera.tsx');
    expect(camera).toContain('CITY_CAMERA_DISTANCES[settings.cityCamDistance]');
    expect(camera).toContain('getCameraSensitivityScale(settings)');
    expect(camera).toContain('useSettings()');
  });

  test('the duel orbits at the sensitivity and buzzes exactly twice', () => {
    const duel = source('src/components/duel/DuelScene.tsx');
    expect(duel).toContain('getCameraSensitivityScale(useSettings())');
    expect(duel.match(/vibrate\(/g)?.length).toBe(2);
    expect(duel).toContain('vibrate(HAPTIC_HIT_LANDED_MS)');
    expect(duel).toContain('vibrate(HAPTIC_DEFEAT_PATTERN)');
    expect(duel).toContain('if (isActorPlayer) vibrate(HAPTIC_HIT_LANDED_MS);');
  });

  test('haptics is the only place the device is touched, and it reads the setting', () => {
    const haptics = source('src/utils/haptics.ts');
    expect(haptics).toContain('getSettings().vibration');
    expect(haptics).toContain("typeof navigator.vibrate !== 'function'");
    expect(haptics).toContain('HAPTIC_HIT_LANDED_MS = 15');
    expect(haptics).toContain('[30, 40, 30]');
    // No other module calls navigator.vibrate.
    for (const path of ['src/App.tsx', 'src/components/duel/DuelScene.tsx', 'src/components/3d/RaceScene.tsx']) {
      expect(source(path), path).not.toContain('navigator.vibrate');
    }
  });

  test('the panel is one menu, with no Apply and nothing under 10px', () => {
    const modal = source('src/components/hub/SettingsModal.tsx');
    /** The panel's executable source: the doc comments talk ABOUT these rules. */
    const modalCode = modal.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // Five sections, and the design's own labels.
    for (const label of ['Picture & Camera', 'Controls', 'Sound', 'Game', 'Accessibility']) {
      expect(modal, label).toContain(`label: '${label}'`);
    }
    // No Apply anywhere, and Done is the one footer action.
    expect(modalCode).not.toContain('Apply');
    expect(modal).toContain('>\n            <span>Done</span>');
    // The 48dp floor for controls, the 56dp floor for the full-row cards, and no
    // text-[Npx] rule below the 10px floor.
    expect(modal).toContain('min-h-[48px]');
    expect(modal).toContain('min-h-[56px]');
    // UI-1 moved the header ✕ onto the shared close class, which is the same 48×48
    // target this assertion has always pinned: the shape lives in one place now.
    expect(modal).toContain('CLOSE_BUTTON_CLASS');
    expect(source('src/components/ui/controlStyles.ts')).toContain('w-12 h-12');
    expect(modal).toContain("width: 'min(940px, 94vw)'");
    expect(modal).toMatch(/sm:flex-row/);
    expect(modalCode.match(/text-\[\d+px\]/g) ?? []).toEqual([]);
    // The gear mark is static: the undefined animate-spin-slow class is gone.
    expect(modalCode).not.toContain('animate-spin-slow');
    // Reset is menu-only and armed in the panel, never through window.confirm.
    expect(modal).toContain("context === 'menu'");
    expect(modal).toContain('Tap again to erase everything');
    expect(modal).not.toContain('window.confirm');
    expect(modal).toContain('RESET_ARM_MS');
  });

  test('every entry point asks App for the panel', () => {
    const entryPoints: Array<[string, string]> = [
      ['src/components/hub/TitleScreen.tsx', 'data-title-action="settings"'],
      ['src/components/hub/CharacterCreation.tsx', 'onOpenSettings?: () => void;'],
      ['src/components/hub/GladiatorSchoolHub.tsx', 'title="Game Settings"'],
      ['src/components/3d/city/CityHubScene.tsx', 'title="Game Settings (Touch, Sound, Picture)"'],
      ['src/components/ui/CombatHUD.tsx', 'title="Game Settings"'],
    ];
    for (const [path, anchor] of entryPoints) {
      const code = source(path);
      expect(code, path).toContain(anchor);
      expect(code, path).toContain('onOpenSettings');
    }
    // The city's old 16px icon-only button is gone.
    expect(source('src/components/3d/city/CityHubScene.tsx')).not.toContain(
      'title="Game Settings (Lefty Mode, Audio, Controls)"',
    );
  });

  test('the music engine’s own default is the designed 0.8', () => {
    expect(source('src/audio/musicEngine.ts')).toContain('private volume: number = 0.8;');
    // The effect engine gained the persisted mute without losing the flip.
    const sfx = source('src/audio/soundEffects.ts');
    expect(sfx).toContain('public setMuted(muted: boolean)');
    expect(sfx).toContain('public toggleMute(): boolean');
  });
});
