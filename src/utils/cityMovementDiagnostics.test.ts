// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { createCityMovementDiagnosticSnapshot } from './cityMovementDiagnostics';

const base = {
  capturedAtMs: 1234,
  currentPosition: [0, 0, 0] as [number, number, number],
  nextPosition: [0.38, 0, 0] as [number, number, number],
  playerYaw: Math.PI / 2,
  cameraYaw: Math.PI,
  frameDeltaSeconds: 0.1,
  rawInputX: 1,
  rawInputZ: 0,
  touchX: 1,
  touchZ: 0,
  keysPressed: { w: false, a: false, s: false, d: false },
  inputLocked: false,
  panelLocked: false,
  touchActive: true,
  speed: 3.8,
  worldDirectionX: 1,
  worldDirectionZ: 0,
  expectedDistance: 0.38,
};

describe('city movement diagnostic snapshots', () => {
  test('records an unconstrained stride without reporting a collision', () => {
    const snapshot = createCityMovementDiagnosticSnapshot(base);
    expect(snapshot.actualDistance).toBeCloseTo(0.38, 8);
    expect(snapshot.movementRatio).toBeCloseTo(1, 8);
    expect(snapshot.collisionLimited).toBe(false);
    expect(snapshot.touchActive).toBe(true);
    expect(snapshot.cameraYaw).toBe(Math.PI);
  });

  test('flags a materially shortened movement step as collision-limited', () => {
    const snapshot = createCityMovementDiagnosticSnapshot({
      ...base,
      nextPosition: [0.12, 0, 0],
    });
    expect(snapshot.actualDistance).toBeCloseTo(0.12, 8);
    expect(snapshot.movementRatio).toBeCloseTo(0.12 / 0.38, 8);
    expect(snapshot.collisionLimited).toBe(true);
  });

  test('does not divide by zero when no movement is expected', () => {
    const snapshot = createCityMovementDiagnosticSnapshot({
      ...base,
      nextPosition: [0, 0, 0],
      rawInputX: 0,
      touchX: 0,
      touchActive: false,
      expectedDistance: 0,
      speed: 0,
    });
    expect(snapshot.movementRatio).toBeNull();
    expect(snapshot.collisionLimited).toBe(false);
  });

  test('preserves input-lock and keyboard state for lifecycle diagnosis', () => {
    const snapshot = createCityMovementDiagnosticSnapshot({
      ...base,
      inputLocked: true,
      panelLocked: true,
      touchActive: false,
      keysPressed: { w: true, a: false, s: true, d: false },
    });
    expect(snapshot.inputLocked).toBe(true);
    expect(snapshot.panelLocked).toBe(true);
    expect(snapshot.keysPressed).toEqual({ w: true, a: false, s: true, d: false });
  });
});
