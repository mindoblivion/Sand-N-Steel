// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { shouldDecayCameraYawOnMove } from './useCameraDrag';

const cityCameraSource = readFileSync(
  new URL('../components/3d/city/CityCamera.tsx', import.meta.url),
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
