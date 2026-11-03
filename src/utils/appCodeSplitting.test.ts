// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

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
