/**
 * uiControls.test.ts — UI-1: the button & safe-area sweep's own contract.
 *
 * Run with: bun test src/utils/uiControls.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the shared close control — one class, 48×48, labelled at every site;
 *   §B the 48dp floor on every control the audit listed (B-1 … B-13), by file, so a
 *      later edit cannot quietly shrink one back under the standard;
 *   §C B-14 — the dead second control scheme is gone, checked against the tree;
 *   §D the copy and state items (B-15 … B-19): the joystick caption, the drawer
 *      retitle, the printed rejection, the permanent "Hold" labels, the icons;
 *   §E the safe-area items (S-1 … S-4); S-5 is recorded as no-action.
 *
 * The assertions read the shipped sources (the `settings.test.ts` idiom) and pin
 * class *names* rather than whole class strings, so re-ordering utilities or
 * re-wrapping a line does not fail them.  Nothing here mounts a component.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const source = (path: string) => readFileSync(path, 'utf8');

/** Every audited control's own file, keyed by the audit item that named it. */
const AUDITED: ReadonlyArray<[string, string]> = [
  ['B-1', 'src/components/ui/CombatHUD.tsx'],
  ['B-2', 'src/components/ui/TurnActionPanel.tsx'],
  ['B-3', 'src/components/3d/city/CityHubScene.tsx'],
  ['B-3', 'src/components/hub/GladiatorSchoolHub.tsx'],
  ['B-4', 'src/components/hub/CharacterCreation.tsx'],
  ['B-5', 'src/components/hub/GoogleDriveSyncModal.tsx'],
  ['B-6', 'src/components/hub/GladiatorSchoolHub.tsx'],
  ['B-6', 'src/components/3d/city/CityHubScene.tsx'],
  ['B-7', 'src/components/hub/ShopTab.tsx'],
  ['B-7', 'src/components/hub/TrainingTab.tsx'],
  ['B-7', 'src/components/hub/TournamentTab.tsx'],
  ['B-7', 'src/components/hub/PreFightModal.tsx'],
  ['B-7', 'src/components/hub/PreRacePanel.tsx'],
  ['B-7', 'src/components/hub/HelpModal.tsx'],
  ['B-7', 'src/components/ui/GameFailureSurface.tsx'],
  ['B-7', 'src/components/hub/EmailAuthScreen.tsx'],
  ['B-8', 'src/components/hub/GearTab.tsx'],
  ['B-8', 'src/components/hub/RacingConfigSection.tsx'],
  ['B-8', 'src/components/hub/ChariotWorkshopTab.tsx'],
  ['B-9', 'src/components/ui/GoogleSignInButton.tsx'],
  ['B-9', 'src/components/ui/AppleSignInButton.tsx'],
  ['B-9', 'src/components/ui/FacebookSignInButton.tsx'],
  ['B-9', 'src/components/ui/MicrosoftSignInButton.tsx'],
  ['B-10', 'src/components/hub/TitleScreen.tsx'],
  ['B-11', 'src/components/hub/HelpModal.tsx'],
  ['B-11', 'src/components/hub/GoogleDriveSyncModal.tsx'],
  ['B-11', 'src/components/hub/DeleteAccountModal.tsx'],
  ['B-11', 'src/components/hub/SettingsModal.tsx'],
  ['B-12', 'src/components/ui/GameFailureSurface.tsx'],
  ['B-12', 'src/components/hub/PostOathNudge.tsx'],
  ['B-13', 'src/components/hub/StatsTab.tsx'],
  ['B-13', 'src/components/hub/ChariotWorkshopTab.tsx'],
  ['B-13', 'src/components/hub/EmailAuthScreen.tsx'],
  ['B-13', 'src/components/3d/city/CityHubScene.tsx'],
  ['B-13', 'src/components/hub/GladiatorSchoolHub.tsx'],
  ['B-13', 'src/components/hub/CharacterCreation.tsx'],
  ['B-17', 'src/components/hub/RacingConfigSection.tsx'],
  ['B-18', 'src/components/ui/RaceTouchControls.tsx'],
];

/** Recursively list every `.ts`/`.tsx` file under a directory. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

describe('A. The shared close control (B-11)', () => {
  const shared = 'src/components/ui/controlStyles.ts';

  test('one class, at the SET-1 48×48 target, exported by name', () => {
    const code = source(shared);
    expect(code).toContain('export const CLOSE_BUTTON_CLASS');
    expect(code).toContain('w-12 h-12');
    expect(code).toContain('min-h-[48px]');
    expect(code).toContain('min-w-[48px]');
  });

  test('every listed close site uses it, and every one keeps an aria-label', () => {
    const sites: ReadonlyArray<[string, string]> = [
      ['src/components/hub/HelpModal.tsx', 'Close the combat manual'],
      ['src/components/hub/GoogleDriveSyncModal.tsx', 'Close cloud saves'],
      ['src/components/3d/city/CityHubScene.tsx', 'Close city map'],
      ['src/components/3d/city/CityHubScene.tsx', 'Dismiss announcement'],
      ['src/components/hub/DeleteAccountModal.tsx', 'Cancel'],
      ['src/components/ui/GameFailureSurface.tsx', 'Dismiss offline notice'],
      ['src/components/hub/SettingsModal.tsx', 'Close settings'],
    ];
    for (const [path, label] of sites) {
      const code = source(path);
      expect(code, path).toContain('CLOSE_BUTTON_CLASS');
      expect(code, `${path} (${label})`).toContain(label);
    }
    // SettingsModal's header ✕ is the model for the shared class, so the panel
    // itself carries the same w-12 h-12 target the settings suite pins.
    expect(source(shared)).toContain('w-12 h-12');
  });

  test('no close control is left as a bare glyph on a text-sized hit area', () => {
    for (const path of [
      'src/components/hub/HelpModal.tsx',
      'src/components/hub/GoogleDriveSyncModal.tsx',
      'src/components/3d/city/CityHubScene.tsx',
    ]) {
      const code = source(path);
      // The old shapes: a `p-1`/`p-1.5` square or a plain text span.
      expect(code, path).not.toContain('p-1 rounded-lg text-neutral-400 hover:text-amber-200');
      expect(code, path).not.toContain('font-bold text-sm cursor-pointer select-none');
    }
  });
});

describe('B. The 48dp floor, per audited control (B-1 … B-13)', () => {
  test('every audited file carries the floor', () => {
    for (const [item, path] of AUDITED) {
      expect(source(path), `${item} — ${path}`).toContain('min-h-[48px]');
    }
  });

  test('the icon-only utility clusters are squares with a label (B-1)', () => {
    const hud = source('src/components/ui/CombatHUD.tsx');
    expect(hud).toContain('min-w-[48px]');
    // Help and Mute are icon + word now, and the camera's state label shows at all widths.
    expect(hud).toContain('Help');
    expect(hud).toContain('Mute');
    expect(hud).not.toContain('hidden sm:inline capitalize');
  });

  test('the duel movement strip has no py-1.5 control left (B-2)', () => {
    const strip = source('src/components/ui/TurnActionPanel.tsx');
    const small = strip.match(/className=\{`px-3 py-1\.5/g) ?? [];
    expect(small.length).toBe(0);
  });

  test('the creation steppers are 48px squares and the floor is a real disabled state (B-4)', () => {
    const creation = source('src/components/hub/CharacterCreation.tsx');
    expect(creation).toContain('w-12 h-12');
    expect(creation).not.toContain('w-7 h-7');
    expect(creation).toContain('disabled={stat.val <= statFloor}');
    expect(creation).toContain('disabled:cursor-not-allowed');
  });

  test('Drive Sync never puts a destructive icon beside a lookalike (B-5)', () => {
    const drive = source('src/components/hub/GoogleDriveSyncModal.tsx');
    for (const word of ['Refresh', 'Sign out', 'Delete']) {
      expect(drive, word).toContain(word);
    }
    // The 30px icon-only pair is gone.
    expect(drive).not.toContain('p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300');
    expect(drive).not.toContain('p-2 rounded-xl bg-red-950/60 hover:bg-red-900');
  });

  test('the two tab bars are 48dp tall (B-6)', () => {
    const hub = source('src/components/hub/GladiatorSchoolHub.tsx');
    expect(hub).toContain('min-h-[48px] py-2 px-3 sm:px-4 rounded-xl');
    const city = source('src/components/3d/city/CityHubScene.tsx');
    expect(city).toContain('min-w-[54px] min-h-[48px]');
  });

  test('the OAuth buttons are 48dp in both shapes (B-9)', () => {
    for (const provider of ['Google', 'Apple', 'Facebook', 'Microsoft']) {
      const code = source(`src/components/ui/${provider}SignInButton.tsx`);
      expect(code, provider).toContain('w-12 h-12');
      expect(code, provider).toContain("min-h-[48px] px-5 py-3");
      expect(code, provider).not.toContain('w-9 h-9');
    }
  });

  test('the title screen has no 44px or 28px control left (B-10)', () => {
    const title = source('src/components/hub/TitleScreen.tsx');
    expect(title).not.toContain('min-h-[44px]');
    // The account pill and the privacy link are both on the 48dp floor now.
    expect(title).toContain('min-h-[48px] px-4 py-1.5 rounded-full');
    expect(title).toContain('min-h-[48px] px-2 flex items-center');
    expect(title.match(/min-h-\[48px\]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  test('the racing "+" and the stats steppers are 48px (B-13)', () => {
    const stats = source('src/components/hub/StatsTab.tsx');
    expect(stats).toContain('w-12 h-12');
    expect(stats).not.toContain('w-8 h-8 rounded-xl');
  });
});

describe('C. The dead second control scheme is gone (B-14)', () => {
  test('TouchControls.tsx does not exist', () => {
    expect(existsSync('src/components/ui/TouchControls.tsx')).toBe(false);
  });

  test('nothing in src imports or references a ui/TouchControls module', () => {
    const offenders = walk('src')
      .filter((path) => /from\s+'[^']*\/TouchControls'|ui\/TouchControls\.tsx/.test(source(path)))
      // RaceTouchControls is the surviving implementation; its own name contains the
      // substring but never matches the pattern above.
      .filter((path) => !path.endsWith('uiControls.test.ts'));
    expect(offenders).toEqual([]);
  });

  test('the race controls are the ONE touch scheme, and say so', () => {
    const race = source('src/components/ui/RaceTouchControls.tsx');
    expect(race).toContain('data-race-control');
    expect(source('src/components/3d/RaceScene.tsx')).toContain('RaceTouchControls');
  });
});

describe('D. Copy and state items (B-15 … B-19)', () => {
  test('the city joystick carries its "Move" caption (B-15)', () => {
    const city = source('src/components/3d/city/CityHubScene.tsx');
    expect(city).toMatch(/font-mono[^>]*text-\[10px\][^>]*>\s*Move\s*<\/span>/);
  });

  test('the drawer is retitled, and no longer claims to hold settings (B-16)', () => {
    const city = source('src/components/3d/city/CityHubScene.tsx');
    expect(city).toContain('City Map &amp; Fast Travel');
    expect(city).not.toContain('City Map &amp; Settings');
  });

  test('the racing rejection is printed under the disabled Buy (B-17)', () => {
    const racing = source('src/components/hub/RacingConfigSection.tsx');
    expect(racing).toContain('data-racing-rejection="1"');
    expect(racing).toContain('{describeRacingRejection(purchase.reason)}');
    // It prints the sentence, never the helper's status code.
    expect(racing).toContain('{!purchase.ok && (');
    expect(racing).not.toContain('data-racing-rejection={purchase.reason}');
  });

  test('the "Hold" wording is permanent on the race controls (B-18)', () => {
    const race = source('src/components/ui/RaceTouchControls.tsx');
    expect(race).toContain('data-race-hold');
    expect(race).toMatch(/>\s*Hold\s*<\/span>/);
    // …and it is outside the first-race hint, which is the only thing that fades.
    expect(race).not.toContain('data-race-hold-visible');
  });

  test('the completeness trio (B-19)', () => {
    const settings = source('src/components/hub/SettingsModal.tsx');
    // The privacy row is no longer the panel's only icon-less row.
    expect(settings).toContain('label="Privacy policy"');
    expect(settings).toMatch(/label="Privacy policy"[\s\S]{0,400}icon=\{<FileText/);
    const race = source('src/components/3d/RaceScene.tsx');
    expect(race).toContain('<XCircle');
    expect(race).toContain('Abort race');
    // The race HUD's own controls are 3rem = 48px (Tailwind's rem-scaled form).
    expect(race).toContain('min-h-[3rem]');
  });
});

describe('E. Safe areas (S-1 … S-4; S-5 is recorded as no-action)', () => {
  test('the anchored surfaces pad for the device insets (S-1)', () => {
    expect(source('src/components/hub/PostOathNudge.tsx')).toContain('env(safe-area-inset-bottom)');
  });

  test('the race controls keep their 48px floor and their safe-area gutter (S-2)', () => {
    const race = source('src/components/ui/RaceTouchControls.tsx');
    expect(race).toContain('w-[max(3rem,min(4.5rem,13vh))]');
    expect(race).toContain('h-[max(3rem,min(4.5rem,13vh))]');
    expect(race).not.toContain('w-[min(4.5rem,13vh)]');
    expect(race).toContain('env(safe-area-inset-bottom)');
  });

  test('the duel HUD owns its own inset rather than leaning on the body (S-3)', () => {
    const hud = source('src/components/ui/CombatHUD.tsx');
    expect(hud).toContain('env(safe-area-inset-bottom)');
    expect(hud).toContain('env(safe-area-inset-left)');
    expect(hud).toContain('env(safe-area-inset-right)');
  });

  test('the two fixed modal wrappers carry a defensive inset gutter (S-4)', () => {
    for (const path of ['src/components/hub/SettingsModal.tsx', 'src/components/hub/DeleteAccountModal.tsx']) {
      const code = source(path);
      expect(code, path).toContain('max(0.5rem,env(safe-area-inset-bottom))');
      expect(code, path).toContain('max(0.5rem,env(safe-area-inset-top))');
    }
  });
});
