// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { HAPTIC_ACTION_TAP_MS, HAPTIC_HIT_LANDED_MS, vibrate } from './haptics';
import { getSettings, updateSettings } from '../services/settings';

const panel = readFileSync('src/components/ui/TurnActionPanel.tsx', 'utf8');
const settingsModal = readFileSync('src/components/hub/SettingsModal.tsx', 'utf8');

describe('PHASE1-TOUCH — the tap tick', () => {
  test('the tick is 10 ms — shorter than the hit, so it reads as a tap', () => {
    expect(HAPTIC_ACTION_TAP_MS).toBe(10);
    expect(HAPTIC_HIT_LANDED_MS).toBe(15);
  });

  test('exactly one call site, in the panel, on the dispatch path only', () => {
    // The tick fires from the panel's one dispatch path — the wrapped
    // onExecuteAction — which every tactic button routes through. One call
    // site, not one per button. (The statement regex, not a bare substring:
    // the wrapper comment above mentions vibrate() too.)
    expect(panel.match(/^\s+vibrate\(HAPTIC_ACTION_TAP_MS\);$/gm)?.length).toBe(1);
    // The beast target buttons choose a target, they do not dispatch — so
    // they never buzz.
    expect(panel).toContain("onClick={() => setTarget('master')}");
    expect(panel).toContain("onClick={() => setTarget('beast')}");
  });

  test('the SettingsModal says what the duel does, and what Lefty Mode does now', () => {
    expect(settingsModal).toContain('Duel: tap the tactic panel to act, drag the sand to orbit the camera, and pinch to zoom');
    expect(settingsModal).toContain('Duel lefty: the tactic panel mirrors, so the buttons sit under your left thumb.');
    expect(settingsModal).toContain('The duel panel mirrors, too.');
    expect(settingsModal).toContain('A short buzz when your blade lands, and a tick when you tap a tactic.');
  });
});

describe('haptics — vibrate() honours the setting and the device', () => {
  const calls: unknown[] = [];
  const original = (navigator as Navigator & { vibrate?: unknown }).vibrate;

  afterEach(() => {
    // Leave the suite's setting and navigator exactly as found.
    updateSettings({ vibration: true });
    (navigator as Navigator & { vibrate?: unknown }).vibrate = original;
    calls.length = 0;
  });

  test('the tap tick buzzes once, for 10 ms, with vibration on', () => {
    (navigator as unknown as { vibrate: (p: unknown) => boolean }).vibrate = (p: unknown) => {
      calls.push(p);
      return true;
    };
    updateSettings({ vibration: true });
    vibrate(HAPTIC_ACTION_TAP_MS);
    expect(calls).toEqual([10]);
    expect(getSettings().vibration).toBe(true);
  });

  test('vibration off means silence, even with a device that can buzz', () => {
    (navigator as unknown as { vibrate: (p: unknown) => boolean }).vibrate = (p: unknown) => {
      calls.push(p);
      return true;
    };
    updateSettings({ vibration: false });
    vibrate(HAPTIC_ACTION_TAP_MS);
    expect(calls).toEqual([]);
  });

  test('no vibrate API means silence, never a throw', () => {
    (navigator as unknown as { vibrate?: unknown }).vibrate = undefined;
    updateSettings({ vibration: true });
    expect(() => vibrate(HAPTIC_ACTION_TAP_MS)).not.toThrow();
  });
});
