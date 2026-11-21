export interface CityMovementDiagnosticSnapshot {
  capturedAtMs: number;
  position: [number, number, number];
  playerYaw: number;
  cameraYaw: number;
  frameDeltaMs: number;
  rawInput: { x: number; z: number };
  touchInput: { x: number; z: number };
  keysPressed: { w: boolean; a: boolean; s: boolean; d: boolean };
  inputLocked: boolean;
  panelLocked: boolean;
  touchActive: boolean;
  speed: number;
  worldDirection: { x: number; z: number };
  expectedDistance: number;
  actualDistance: number;
  movementRatio: number | null;
  collisionLimited: boolean;
}

export interface CityMovementDiagnosticInput {
  capturedAtMs: number;
  currentPosition: [number, number, number];
  nextPosition: [number, number, number];
  playerYaw: number;
  cameraYaw: number;
  frameDeltaSeconds: number;
  rawInputX: number;
  rawInputZ: number;
  touchX: number;
  touchZ: number;
  keysPressed: { w: boolean; a: boolean; s: boolean; d: boolean };
  inputLocked: boolean;
  panelLocked: boolean;
  touchActive: boolean;
  speed: number;
  worldDirectionX: number;
  worldDirectionZ: number;
  expectedDistance: number;
}

export function createCityMovementDiagnosticSnapshot(
  input: CityMovementDiagnosticInput,
): CityMovementDiagnosticSnapshot {
  const actualDistance = Math.hypot(
    input.nextPosition[0] - input.currentPosition[0],
    input.nextPosition[2] - input.currentPosition[2],
  );
  const movementRatio =
    input.expectedDistance > 0.0001 ? actualDistance / input.expectedDistance : null;

  return {
    capturedAtMs: input.capturedAtMs,
    position: [...input.nextPosition],
    playerYaw: input.playerYaw,
    cameraYaw: input.cameraYaw,
    frameDeltaMs: input.frameDeltaSeconds * 1000,
    rawInput: { x: input.rawInputX, z: input.rawInputZ },
    touchInput: { x: input.touchX, z: input.touchZ },
    keysPressed: { ...input.keysPressed },
    inputLocked: input.inputLocked,
    panelLocked: input.panelLocked,
    touchActive: input.touchActive,
    speed: input.speed,
    worldDirection: { x: input.worldDirectionX, z: input.worldDirectionZ },
    expectedDistance: input.expectedDistance,
    actualDistance,
    movementRatio,
    collisionLimited:
      input.expectedDistance > 0.02 && actualDistance < input.expectedDistance * 0.85,
  };
}
