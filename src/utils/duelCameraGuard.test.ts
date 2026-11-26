/**
 * ===========================================================================
 * PHASE1-CAMGUARD — Duel camera guard pins. The floor function, the framing
 * grid (both fighters' heads inside the frustum across modes, pitches,
 * separations, and yaws), and the occlusion sweep (floor + shipped
 * `resolveCameraCollision` composed, with the loge case as the control).
 *
 * Test-local angle math: fighter head y 1.10, rig lookAt y 1.2, fov 45 →
 * vertical half-FOV 22.5°, horizontal half-FOV 36.4° at 16:9 landscape.
 * A fighter is framed iff its head is within both.
 *
 * Run with: bun test src/utils/duelCameraGuard.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import { resolveCameraCollision } from './cameraCollision';
import type { Collider } from './collisionShapes';
import { DUEL_ARENA_COLLIDERS } from './duelArenaColliders';
import {
  DUEL_CAMERA_MIN_BEYOND_FIGHTER,
  duelCameraFloorDistance,
} from './duelCameraGuard';

type Vec3 = { x: number; y: number; z: number };

const HEAD_Y = 1.1; // fighter visible height (GladiatorMesh.tsx, arena_roman 1.102)
const LOOK_Y = 1.2; // the rig's lookAt height (DuelScene.tsx)
const VERTICAL_HALF_FOV_DEG = 22.5; // fov 45
const HORIZONTAL_HALF_FOV_DEG = 36.4; // fov 45 at 16:9 landscape

// ── Test-local rig math (mirrors DuelCameraRig, DuelScene.tsx) ─────────────

type CameraMode = 'cinematic' | 'over_shoulder' | 'isometric';
const MODES: Record<CameraMode, { baseDist: number; baseHeight: number }> = {
  cinematic: { baseDist: 8.5, baseHeight: 5.2 },
  over_shoulder: { baseDist: 4.2, baseHeight: 2.8 },
  isometric: { baseDist: 11.0, baseHeight: 9.0 },
};

/** The rig's desired camera position for a midpoint at the origin. */
function rigDesired(
  mode: CameraMode,
  pitch: number,
  separation: number,
  yaw: number,
  useFloor = true,
): Vec3 & { dist: number } {
  const { baseDist, baseHeight } = MODES[mode];
  const height = Math.max(1.5, Math.min(14, baseHeight + pitch));
  const currentDist = Math.max(3.5, Math.min(16, baseDist + pitch * 0.4));
  const dist = useFloor
    ? duelCameraFloorDistance(currentDist, separation)
    : currentDist;
  return {
    x: Math.sin(yaw) * dist,
    y: height,
    z: Math.cos(yaw) * dist,
    dist,
  };
}

// ── Test-local angle math ────────────────────────────────────────────────────

function elevationDeg(d: Vec3): number {
  return (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI;
}

/** |elevation(head − cam) − elevation(lookAt − cam)|, in degrees. */
function verticalAngleDeg(cam: Vec3, lookAt: Vec3, head: Vec3): number {
  const view = { x: lookAt.x - cam.x, y: lookAt.y - cam.y, z: lookAt.z - cam.z };
  const toHead = { x: head.x - cam.x, y: head.y - cam.y, z: head.z - cam.z };
  return Math.abs(elevationDeg(toHead) - elevationDeg(view));
}

/** |angle between the XZ projections of (lookAt − cam) and (head − cam)|. */
function horizontalAngleDeg(cam: Vec3, lookAt: Vec3, head: Vec3): number {
  const vx = lookAt.x - cam.x;
  const vz = lookAt.z - cam.z;
  const hx = head.x - cam.x;
  const hz = head.z - cam.z;
  return (
    (Math.abs(Math.atan2(vx * hz - vz * hx, vx * hx + vz * hz)) * 180) / Math.PI
  );
}

function framed(cam: Vec3, lookAt: Vec3, head: Vec3): boolean {
  return (
    verticalAngleDeg(cam, lookAt, head) <= VERTICAL_HALF_FOV_DEG &&
    horizontalAngleDeg(cam, lookAt, head) <= HORIZONTAL_HALF_FOV_DEG
  );
}

// ── Test-local expanded-collider check (margin 0.35, the shipped value) ────

const MARGIN = 0.35;

function distToSegment(px: number, pz: number, seg: Extract<Collider, { type: 'segment' }>): number {
  const dx = seg.x2 - seg.x1;
  const dz = seg.z2 - seg.z1;
  const lenSq = dx * dx + dz * dz;
  let t = ((px - seg.x1) * dx + (pz - seg.z1) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (seg.x1 + t * dx), pz - (seg.z1 + t * dz));
}

function isOutsideExpanded(p: Vec3, collider: Collider): boolean {
  // On the expanded boundary counts as outside: the resolver parks the
  // camera exactly on the margin-expanded face (e.g. the loge case resolves
  // to z −17.25, the expanded rect's own face). The epsilon only absorbs
  // floating-point noise at that boundary.
  const EPS = 1e-9;
  if (collider.type === 'rect') {
    return (
      p.x <= collider.cx - collider.hw - MARGIN + EPS ||
      p.x >= collider.cx + collider.hw + MARGIN - EPS ||
      p.z <= collider.cz - collider.hd - MARGIN + EPS ||
      p.z >= collider.cz + collider.hd + MARGIN - EPS
    );
  }
  if (collider.type === 'circle') {
    return (
      Math.hypot(p.x - collider.cx, p.z - collider.cz) >=
      collider.r + MARGIN - EPS
    );
  }
  return distToSegment(p.x, p.z, collider) >= MARGIN - EPS;
}

// ── §1 — the floor ──────────────────────────────────────────────────────────

describe('PHASE1-CAMGUARD §1 — the floor', () => {
  test('the constant is 2.5', () => {
    expect(DUEL_CAMERA_MIN_BEYOND_FIGHTER).toBe(2.5);
  });

  test('spawn raises over-shoulder from 4.2 to 6.0', () => {
    expect(duelCameraFloorDistance(4.2, 7)).toBe(6.0);
  });

  test('spear range is the no-op boundary', () => {
    expect(duelCameraFloorDistance(4.2, 3.4)).toBe(4.2);
    expect(duelCameraFloorDistance(4.2, 2)).toBe(4.2);
  });

  test('cinematic and isometric are inert at every separation', () => {
    expect(duelCameraFloorDistance(8.5, 7)).toBe(8.5);
    expect(duelCameraFloorDistance(11, 7)).toBe(11);
  });
});

// ── §2 — the framing defect, measured ───────────────────────────────────────

describe('PHASE1-CAMGUARD §2 — the framing defect', () => {
  test('spawn over-shoulder, unfloored: the near fighter is 46.8° off-axis', () => {
    // The defect, before the fix: the player's head is entirely out of frame.
    const cam = rigDesired('over_shoulder', 0, 7, 0, false);
    const lookAt = { x: 0, y: LOOK_Y, z: 0 };
    const playerHead = { x: 0, y: HEAD_Y, z: 3.5 };
    expect(verticalAngleDeg(cam, lookAt, playerHead)).toBeCloseTo(46.8, 0);
    expect(framed(cam, lookAt, playerHead)).toBe(false);
  });

  test('spawn over-shoulder, floored: the near fighter is 19.3° off-axis', () => {
    const cam = rigDesired('over_shoulder', 0, 7, 0);
    const lookAt = { x: 0, y: LOOK_Y, z: 0 };
    const playerHead = { x: 0, y: HEAD_Y, z: 3.5 };
    expect(cam.dist).toBe(6.0);
    expect(verticalAngleDeg(cam, lookAt, playerHead)).toBeCloseTo(19.3, 0);
    expect(framed(cam, lookAt, playerHead)).toBe(true);
  });

  test('spawn over-shoulder, side yaw: 39.8° unfloored, 30.3° floored', () => {
    const lookAt = { x: 0, y: LOOK_Y, z: 0 };
    const playerHead = { x: 0, y: HEAD_Y, z: 3.5 };
    const unfloored = rigDesired('over_shoulder', 0, 7, Math.PI / 2, false);
    const floored = rigDesired('over_shoulder', 0, 7, Math.PI / 2);
    expect(horizontalAngleDeg(unfloored, lookAt, playerHead)).toBeCloseTo(39.8, 0);
    expect(horizontalAngleDeg(floored, lookAt, playerHead)).toBeCloseTo(30.3, 0);
    expect(framed(floored, lookAt, playerHead)).toBe(true);
  });
});

// ── §3 — the framing grid ───────────────────────────────────────────────────

describe('PHASE1-CAMGUARD §3 — the framing grid', () => {
  test('both fighters stay framed across modes, pitches, separations, yaws', () => {
    const modes: CameraMode[] = ['cinematic', 'over_shoulder', 'isometric'];
    const pitches = [-1.8, 0, 3.5];
    const separations = [1.2, 2, 3.4, 5.4, 7];
    const yaws = [0, Math.PI / 2, Math.PI];
    for (const mode of modes) {
      for (const pitch of pitches) {
        for (const s of separations) {
          for (const yaw of yaws) {
            const cam = rigDesired(mode, pitch, s, yaw);
            const lookAt = { x: 0, y: LOOK_Y, z: 0 };
            const playerHead = { x: 0, y: HEAD_Y, z: s / 2 };
            const oppHead = { x: 0, y: HEAD_Y, z: -s / 2 };
            const vPlayer = verticalAngleDeg(cam, lookAt, playerHead);
            const vOpp = verticalAngleDeg(cam, lookAt, oppHead);
            const hPlayer = horizontalAngleDeg(cam, lookAt, playerHead);
            const hOpp = horizontalAngleDeg(cam, lookAt, oppHead);
            const isResidual =
              mode === 'over_shoulder' &&
              pitch === 3.5 &&
              s === 7 &&
              (yaw === 0 || yaw === Math.PI);
            if (isResidual) {
              // §7 Q2 — the accepted residual: full pitch-up at spawn, the
              // near fighter's head is 24.0° off-axis, 1.5° over. Pinned to
              // its computed value so any change is visible, not silent.
              expect(Math.max(vPlayer, vOpp)).toBeCloseTo(24.0, 0);
              expect(Math.min(vPlayer, vOpp)).toBeLessThanOrEqual(
                VERTICAL_HALF_FOV_DEG,
              );
              expect(Math.max(hPlayer, hOpp)).toBeLessThanOrEqual(
                HORIZONTAL_HALF_FOV_DEG,
              );
            } else {
              expect(
                [vPlayer, vOpp, hPlayer, hOpp].every((a, i) =>
                  i < 2
                    ? a <= VERTICAL_HALF_FOV_DEG
                    : a <= HORIZONTAL_HALF_FOV_DEG,
                ),
              ).toBe(true);
            }
          }
        }
      }
    }
  });
});

// ── §4 — the occlusion sweep ────────────────────────────────────────────────

describe('PHASE1-CAMGUARD §4 — the occlusion sweep', () => {
  // Compose floor + shipped resolver, exactly as the rig does.
  function resolvedCam(
    mode: CameraMode,
    pitch: number,
    separation: number,
    yaw: number,
    midX: number,
    midZ: number,
  ): Vec3 & { floor: number } {
    const desired = rigDesired(mode, pitch, separation, yaw);
    const floor = separation / 2 + DUEL_CAMERA_MIN_BEYOND_FIGHTER;
    const head = { x: midX, y: LOOK_Y, z: midZ };
    const out = resolveCameraCollision(
      head,
      { x: midX + desired.x, y: desired.y, z: midZ + desired.z },
      DUEL_ARENA_COLLIDERS,
    );
    return { ...out, floor };
  }

  test('the resolved camera never lands inside an expanded collider', () => {
    const modes: CameraMode[] = ['cinematic', 'over_shoulder', 'isometric'];
    const pitches = [-1.8, 0, 0.25, 0.65, 3.5];
    const separations = [1.2, 3.4, 7];
    const yaws = [0, Math.PI / 2, Math.PI];
    const midpoints: [number, number][] = [
      [0, 0],
      [0, -6.9],
      [0, 6.9],
      [1.8, -6.9],
      [-1.8, 6.9],
    ];
    for (const mode of modes) {
      for (const pitch of pitches) {
        for (const s of separations) {
          for (const yaw of yaws) {
            for (const [midX, midZ] of midpoints) {
              const p = resolvedCam(mode, pitch, s, yaw, midX, midZ);
              for (const collider of DUEL_ARENA_COLLIDERS) {
                expect(isOutsideExpanded(p, collider)).toBe(true);
              }
              // The pull-in never violates the floor.
              expect(Math.hypot(p.x - midX, p.z - midZ)).toBeGreaterThanOrEqual(
                p.floor - 1e-9,
              );
            }
          }
        }
      }
    }
  });

  test('the loge case resolves to z −17.25, still above the floor', () => {
    // Mid (0, −6.9), isometric, yaw π, pitch 0: desired z −17.9, inside the
    // expanded rect (z ≥ −17.25); the resolver stops at the rect boundary.
    for (const pitch of [0, 0.25]) {
      const p = resolvedCam('isometric', pitch, 7, Math.PI, 0, -6.9);
      expect(p.z).toBeGreaterThanOrEqual(-17.25 - 1e-9);
      expect(Math.hypot(p.x - 0, p.z - -6.9)).toBeGreaterThanOrEqual(
        p.floor - 1e-9,
      );
    }
  });

  test('the control: without the guard the loge case sits inside the canopy', () => {
    // Canopy box (DuelArena.tsx §5): x ±5.4, y 9.15–9.65, z −22.8…−17.6.
    // The brief's control range 0.125–0.65 starts 0.025 below the canopy
    // floor (H = 9.125 < 9.15 at pitch 0.125), so the control samples
    // 0.25–0.5, where the camera is strictly inside the box.
    for (const pitch of [0.25, 0.4, 0.5]) {
      const cam = rigDesired('isometric', pitch, 7, Math.PI, false);
      // Mid (0, −6.9): the desired position is mid + the rig offset.
      const pos = { x: cam.x, y: cam.y, z: -6.9 + cam.z };
      expect(Math.abs(pos.x)).toBeLessThanOrEqual(5.4);
      expect(pos.y).toBeGreaterThanOrEqual(9.15);
      expect(pos.y).toBeLessThanOrEqual(9.65);
      expect(pos.z).toBeGreaterThanOrEqual(-22.8);
      expect(pos.z).toBeLessThanOrEqual(-17.6);
      // And the guard moves it out: the resolved position is outside the
      // expanded rect.
      const resolved = resolvedCam('isometric', pitch, 7, Math.PI, 0, -6.9);
      expect(resolved.z).toBeGreaterThanOrEqual(-17.25 - 1e-9);
    }
  });
});
