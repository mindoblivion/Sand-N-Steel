// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const hookSource = readFileSync(new URL('./useInteriorInput.ts', import.meta.url), 'utf8');

const INTERIORS = [
  'ColosseumInterior.tsx',
  'ForgeInterior.tsx',
  'BathhouseInterior.tsx',
  'BountyHallInterior.tsx',
  'TavernInterior.tsx',
  'GladiatorAcademyInterior.tsx',
] as const;

describe('useInteriorInput — unified interior controls & input release', () => {
  test('resets keyboard, touch, pointer, and knob transform on blur, hidden visibility, unmount, and lock', () => {
    expect(hookSource).toContain('keysRef.current = {};');
    expect(hookSource).toContain('touchIdRef.current = null;');
    expect(hookSource).toContain('pointerIdRef.current = null;');
    expect(hookSource).toContain('stickRef.current = { x: 0, y: 0 };');
    expect(hookSource).toContain("joystickKnobRef.current.style.transform = 'translate3d(0px, 0px, 0)'");
    expect(hookSource).toContain("window.addEventListener('blur', resetAllInputs)");
    expect(hookSource).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)");
    expect(hookSource).toContain("if (document.visibilityState !== 'visible')");
    expect(hookSource).toContain('if (locked) {');
    expect(hookSource).toContain('resetAllInputs();');
  });

  test('isolates single touch ownership, supports non-touch pointer fallback, and respects e.cancelable', () => {
    expect(hookSource).toContain('if (e.cancelable) e.preventDefault();');
    expect(hookSource).toContain('if (lockedRef.current || touchIdRef.current !== null) return;');
    expect(hookSource).toContain("if (e.pointerType === 'touch') return;");
    expect(hookSource).toContain('setPointerCapture(e.pointerId)');
    expect(hookSource).toContain('joystickKnobRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`');
  });

  test('all six 3D interiors use useInteriorInput with DOM-transform knob and safe-area margins', () => {
    for (const file of INTERIORS) {
      const src = readFileSync(new URL(`../components/3d/${file}`, import.meta.url), 'utf8');
      expect(src).toContain('useInteriorInput');
      expect(src).toContain('joystickKnobRef');
      expect(src).toContain('will-change-transform');
      expect(src).toContain('safe-area-inset');
      expect(src).not.toContain('setKnobPos');
    }
  });
});
