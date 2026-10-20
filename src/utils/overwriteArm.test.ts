/**
 * overwriteArm.test.ts — the New Character overwrite dialog's two-step arm.
 *
 * Run with: bun test src/utils/overwriteArm.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the window itself — `OVERWRITE_ARM_WINDOW_MS` is three seconds and it is the
 *      ONE place the length is defined;
 *   §B `overwriteArmIsLive` — pure and clock-driven: never armed is never live, an arm
 *      is live for exactly the window (the boundary is inclusive) and dead one
 *      millisecond past it, and an arm is only ever ended by time passing;
 *   §C the dialog's own wiring — the first tap ARMS, the SECOND within the window
 *      proceeds, a lapse only disarms (it never proceeds and never closes), Cancel and
 *      Escape change nothing, and the confirmation is the game's own modal — never
 *      `window.confirm` — with >=48dp controls;
 *   §D it is a view: nothing in the dialog writes, erases or migrates a save.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { OVERWRITE_ARM_WINDOW_MS, overwriteArmIsLive } from './overwriteArm';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** A source with its comments stripped, so prose can neither satisfy nor defeat a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

describe('§A the window', () => {
  test('the arm lasts three seconds, and it is defined once, here', () => {
    expect(OVERWRITE_ARM_WINDOW_MS).toBe(3000);
    const modal = code(load('../components/hub/NewCharacterOverwriteModal.tsx'));
    expect(modal.match(/\b3000\b/g) ?? []).toEqual([]); // the modal reads the constant, never a bare number
  });
});

describe('§B overwriteArmIsLive — pure, and driven by the clock', () => {
  test('never armed is never live', () => {
    expect(overwriteArmIsLive(null, 0)).toBe(false);
    expect(overwriteArmIsLive(null, Date.now())).toBe(false);
  });

  test('a fresh arm is live, and stays live up to and including the boundary', () => {
    const armedAt = 1_000_000;
    expect(overwriteArmIsLive(armedAt, armedAt)).toBe(true);
    expect(overwriteArmIsLive(armedAt, armedAt + 1)).toBe(true);
    expect(overwriteArmIsLive(armedAt, armedAt + OVERWRITE_ARM_WINDOW_MS - 1)).toBe(true);
    expect(overwriteArmIsLive(armedAt, armedAt + OVERWRITE_ARM_WINDOW_MS)).toBe(true);
  });

  test('one millisecond past the window the arm is dead', () => {
    const armedAt = 1_000_000;
    expect(overwriteArmIsLive(armedAt, armedAt + OVERWRITE_ARM_WINDOW_MS + 1)).toBe(false);
    expect(overwriteArmIsLive(armedAt, armedAt + 60_000)).toBe(false);
  });

  test('only time ends an arm — a clock that steps backwards does not disarm it', () => {
    const armedAt = 1_000_000;
    expect(overwriteArmIsLive(armedAt, armedAt - 5_000)).toBe(true);
  });

  test('a lapsed arm is one the caller has cleared (null), and clearing is enough', () => {
    expect(overwriteArmIsLive(null, 9_999_999)).toBe(false);
  });
});

describe('§C the dialog\'s two-step wiring', () => {
  const modal = load('../components/hub/NewCharacterOverwriteModal.tsx');
  const modalCode = code(modal);

  test('it arms on the first tap and proceeds only on a live second tap', () => {
    expect(modalCode).toContain('const handleConfirmTap = () => {');
    // Not live -> arm and stop, right there.
    expect(modalCode).toContain('if (!overwriteArmIsLive(armedAt, Date.now())) {');
    expect(modalCode).toContain('setArmedAt(Date.now());');
    expect(modalCode).toContain('return;');
    // Live -> the only place creation is allowed to start.
    expect(modalCode).toContain('onConfirm();');
  });

  test('a lapse only disarms: it never proceeds and never closes the dialog', () => {
    const lapse = modalCode.slice(
      modalCode.indexOf('if (armedAt === null) return;'),
      modalCode.indexOf('}, [armedAt]);'),
    );
    expect(lapse).toContain('setArmedAt(null)');
    expect(lapse).not.toContain('onConfirm');
    expect(lapse).not.toContain('onCancel');
    expect(lapse).toContain('OVERWRITE_ARM_WINDOW_MS');
  });

  test('the armed state is legible, and the copy names what is erased', () => {
    expect(modalCode).toContain("data-overwrite-armed={armed ? '1' : '0'}");
    expect(modal).toContain('Tap again to erase');
    expect(modal).toContain('and start over');
    // A deliberate two-step, with a comfortable control height on both choices.
    expect(modal).toContain('min-h-[52px]');
    expect(modalCode).toContain('data-overwrite-action="cancel"');
    expect(modalCode).toContain('data-overwrite-action="confirm"');
  });

  test('cancelling changes nothing: Cancel and Escape both just dismiss', () => {
    expect(modalCode).toContain('onCancel()');
    expect(modalCode).toContain("event.key !== 'Escape'");
    const cancelFn = modalCode.slice(
      modalCode.indexOf('const handleCancel = useCallback'),
      modalCode.indexOf('const handleConfirmTap'),
    );
    expect(cancelFn).not.toContain('onConfirm');
  });

  test('it is the game\'s own modal, never window.confirm', () => {
    expect(modalCode).not.toContain('window.confirm');
    expect(modalCode).toContain('role="dialog"');
  });

  test('the copy degrades honestly when the stored save cannot be read', () => {
    expect(modalCode).toContain('const name = existing.name;');
    expect(modal).toContain('could not be read');
  });
});

describe('§D it is a view, not a save writer', () => {
  const modalCode = code(load('../components/hub/NewCharacterOverwriteModal.tsx'));

  test('nothing in the dialog reaches storage', () => {
    for (const token of ['saveProfile', 'clearSavedProfile', 'localStorage', 'removeItem', 'setItem', 'PROFILE_STORAGE_KEY']) {
      expect(modalCode, token).not.toContain(token);
    }
  });

  test('it reads the existing gladiator through the tolerant summary TYPE only', () => {
    expect(modalCode).toContain('StoredProfileSummary');
    // The only thing it imports from the storage module is the type.
    expect(modalCode).toContain("import type { StoredProfileSummary } from '../../services/storage';");
  });
});

describe('§E the title releases its latch when the tap does not leave the title', () => {
  const title = code(load('../components/hub/TitleScreen.tsx'));

  test('the primary action is available again after a tap that stayed on the title', () => {
    // The latch exists to stop a double-fire.  It must not outlive a tap that did not
    // navigate, or cancelling the overwrite confirmation would leave the button dead and
    // the player could never start over without reloading.
    expect(title).toContain('if (startedRef.current) return;');
    expect(title).toContain('if (savedProfile) onContinueAdventure();');
    expect(title).toContain('else onNewCharacter();');
    const release = title.slice(
      title.indexOf('else onNewCharacter();'),
      title.indexOf('};', title.indexOf('else onNewCharacter();')),
    );
    expect(release).toContain('if (!savedProfile) {');
    expect(release).toContain('startedRef.current = false;');
  });
});
