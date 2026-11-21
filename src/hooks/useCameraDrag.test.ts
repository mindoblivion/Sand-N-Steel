// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { shouldDecayCameraYawOnMove } from './useCameraDrag';

const useCameraDragSource = readFileSync(
  new URL('./useCameraDrag.ts', import.meta.url),
  'utf8',
);

const cityCameraSource = readFileSync(
  new URL('../components/3d/city/CityCamera.tsx', import.meta.url),
  'utf8',
);

const blueprintCameraSource = readFileSync(
  new URL('../components/3d/city/BlueprintCamera.tsx', import.meta.url),
  'utf8',
);

const cityHubSource = readFileSync(
  new URL('../components/3d/city/CityHubScene.tsx', import.meta.url),
  'utf8',
);

const duelSceneSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);

describe('camera yaw recentering', () => {
  test('the default decay gate only opens while moving and not dragging', () => {
    expect(shouldDecayCameraYawOnMove(false, false, true)).toBe(false);
    expect(shouldDecayCameraYawOnMove(true, false, true)).toBe(true);
    expect(shouldDecayCameraYawOnMove(true, true, true)).toBe(false);
    expect(shouldDecayCameraYawOnMove(false, true, true)).toBe(false);
  });

  test('a scene can disable auto-recentering without disabling camera drag', () => {
    expect(shouldDecayCameraYawOnMove(true, false, false)).toBe(false);
    expect(cityCameraSource).toMatch(/autoDecayOnMove:\s*false/);
    expect(cityCameraSource).toContain('yawSensitivity: CAMERA_DRAG_BASE_YAW_SENSITIVITY');
    expect(cityCameraSource).toContain('pitchSensitivity: CAMERA_DRAG_BASE_PITCH_SENSITIVITY');
  });
});

describe('Phase 1 — camera focus-loss & modal isolation', () => {
  test('blur and visibilitychange release active drag state without snapping yaw/pitch back to 0', () => {
    expect(useCameraDragSource).toContain('const handleInputInterruption = () => {');
    const fnStart = useCameraDragSource.indexOf('const handleInputInterruption = () => {');
    const fnEnd = useCameraDragSource.indexOf("window.addEventListener('pointerdown'", fnStart);
    const interruptionBlock = useCameraDragSource.slice(fnStart, fnEnd);

    expect(interruptionBlock).toContain('clearActiveDrag()');
    expect(interruptionBlock).not.toContain('yawOffsetRef.current = 0');
    expect(interruptionBlock).not.toContain('pitchOffsetRef.current = 0');
    expect(useCameraDragSource).toContain("window.addEventListener('blur', handleInputInterruption)");
    expect(useCameraDragSource).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)");
  });

  test('camera drag ignores interactive UI, dialogs, and disabled overlays', () => {
    expect(useCameraDragSource).toContain("target.closest('[role=\"dialog\"]')");
    expect(useCameraDragSource).toContain("target.closest('[aria-modal=\"true\"]')");
    expect(useCameraDragSource).toContain("target.closest('.pointer-events-auto')");
    expect(useCameraDragSource).toContain('if (disabledRef.current) return;');

    expect(cityCameraSource).toContain('disabled?: boolean;');
    expect(cityCameraSource).toContain('disabled,');
    expect(blueprintCameraSource).toContain('disabled?: boolean;');
    expect(blueprintCameraSource).toContain('disabled,');
    expect(duelSceneSource).toContain('disabled={withdrawConfirmOpen}');
  });

  test('CityHubScene locks camera on overlays, guards all door panels on action, and reads live bodyWeightLbRef', () => {
    expect(cityHubSource).toContain('const isOverlayOpen =');
    expect(cityHubSource).toContain('disabled={isOverlayOpen}');
    expect(cityHubSource).toContain('bodyWeightLbRef.current = playerProfile.appearance.bodyWeightLb;');
    expect(cityHubSource).toContain('resolveCityStrideSpeed(3.8 * mag, bodyWeightLbRef.current)');
    expect(cityHubSource).toContain('if (inputLockedRef.current || cityPanelInputLockedRef.current) return;');
    expect(cityHubSource).toContain('bountyHallPanel || bathhousePanel || academyPanel');
  });
});
