// @ts-ignore - bun:test is available at runtime via bun test
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CAMERA_COLLISION_MARGIN,
  CAMERA_COLLISION_MIN_DISTANCE,
  CAMERA_HEAD_HEIGHT,
  resolveCameraCollision,
  type CameraVec3,
} from "./cameraCollision";

const head: CameraVec3 = { x: 0, y: CAMERA_HEAD_HEIGHT, z: 0 };
const desired: CameraVec3 = { x: 0, y: 4.4, z: -10 };

describe("camera collision constants", () => {
  test("literals are pinned", () => {
    expect(CAMERA_COLLISION_MARGIN).toBe(0.35);
    expect(CAMERA_COLLISION_MIN_DISTANCE).toBe(1.2);
    expect(CAMERA_HEAD_HEIGHT).toBe(1.6);
  });
});

describe("resolveCameraCollision", () => {
  test("no colliders returns the desired position at equal coordinates", () => {
    const result = resolveCameraCollision(head, desired, []);
    expect(result).toEqual(desired);
    expect(result).not.toBe(desired);
  });

  test("rect hit pulls the camera in front of the expanded rect", () => {
    const result = resolveCameraCollision(head, desired, [
      { type: "rect", id: "building", cx: 0, cz: -6, hw: 2, hd: 2 },
    ]);
    expect(result.z).toBeCloseTo(-3.65, 2);
    expect(result.y).toBeCloseTo(2.62, 2);
    expect(result.x).toBeCloseTo(0, 8);
  });

  test("circle hit stops outside r + margin", () => {
    // Circle at (0,-5) radius 1, expanded to 1.35, first touched at t = 0.365.
    const result = resolveCameraCollision(head, desired, [
      { type: "circle", id: "pillar", cx: 0, cz: -5, r: 1 },
    ]);
    expect(result.z).toBeCloseTo(-3.65, 2);
    const distanceFromCenter = Math.hypot(result.x, result.z + 5);
    expect(distanceFromCenter).toBeGreaterThanOrEqual(1 + CAMERA_COLLISION_MARGIN - 1e-9);
  });

  test("segment wall hit pulls the camera before the wall by the margin", () => {
    // Wall across z = -5 crossed at t = 0.5, backed off by 0.35 / 10 of XZ.
    const result = resolveCameraCollision(head, desired, [
      { type: "segment", id: "wall", x1: -3, z1: -5, x2: 3, z2: -5 },
    ]);
    expect(result.z).toBeCloseTo(-4.65, 2);
  });

  test("nearest of two colliders wins", () => {
    const result = resolveCameraCollision(head, desired, [
      { type: "rect", id: "far", cx: 0, cz: -8, hw: 2, hd: 1 },
      { type: "rect", id: "near", cx: 0, cz: -5, hw: 2, hd: 1 },
    ]);
    // The near rect expanded face sits at z = -3.65.
    expect(result.z).toBeCloseTo(-3.65, 2);
  });

  test("colliders beyond desired or behind head leave the position unchanged", () => {
    const beyond = resolveCameraCollision(head, desired, [
      { type: "rect", id: "beyond", cx: 0, cz: -20, hw: 2, hd: 2 },
    ]);
    expect(beyond).toEqual(desired);

    const behind = resolveCameraCollision(head, desired, [
      { type: "rect", id: "behind", cx: 0, cz: 6, hw: 2, hd: 2 },
    ]);
    expect(behind).toEqual(desired);
  });

  test("head inside a large collider pushes out to exactly the min distance", () => {
    const bigHead: CameraVec3 = { x: 0, y: CAMERA_HEAD_HEIGHT, z: -6 };
    const result = resolveCameraCollision(bigHead, desired, [
      { type: "rect", id: "inside", cx: 0, cz: -6, hw: 10, hd: 10 },
    ]);
    const distance = Math.hypot(
      result.x - bigHead.x,
      result.y - bigHead.y,
      result.z - bigHead.z,
    );
    expect(distance).toBeCloseTo(CAMERA_COLLISION_MIN_DISTANCE, 8);
  });

  test("degenerate desired==head returns unchanged with no NaN", () => {
    const same: CameraVec3 = { x: 1, y: 2, z: 3 };
    const result = resolveCameraCollision(same, same, [
      { type: "rect", id: "any", cx: 0, cz: 0, hw: 100, hd: 100 },
    ]);
    expect(result).toEqual(same);
    expect(Number.isNaN(result.x + result.y + result.z)).toBe(false);
  });

  test("module has no randomness source", () => {
    const source = readFileSync("src/utils/cameraCollision.ts", "utf8");
    expect(source).not.toContain("Math.random");
  });
});
