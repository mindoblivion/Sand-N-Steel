/**
 * cameraCollision.ts - CAM-COLLIDE "The Camera Stays Out of the Walls".
 *
 * Pure resolver that keeps the city chase camera out of building colliders.
 * It runs between the desired camera position and the frame loop's lerp in
 * CityCamera.tsx: given the player's head position and the desired camera
 * position, it returns the first collision-free point along the head->desired
 * ray, so the lerp eases toward a safe spot instead of swinging through
 * geometry. Camera feel is unchanged: no smoothing, no settings, no
 * formula changes - just a shorter ray when a building is in the way.
 *
 * Pure math: no THREE dependency, plain {x, y, z} in and out, collider types
 * from collisionShapes.ts only. Fully deterministic: no randomness source.
 *
 * KNOWN LIMITATION: colliders are 2D (XZ plane, no height data), so the
 * resolver works on the XZ plane only. This is conservative for low
 * obstacles (the camera may pull in earlier than strictly needed) but
 * correct for buildings, which is what this slice targets. Do NOT invent
 * height data here; height-aware colliders are out of scope.
 */

import type {
  CircleCollider,
  Collider,
  RectCollider,
  SegmentCollider,
} from "./collisionShapes";

/** Safety margin (world units) kept between the camera ray and colliders. */
export const CAMERA_COLLISION_MARGIN = 0.35;
/** Minimum 3D distance the resolved camera position keeps from the head. */
export const CAMERA_COLLISION_MIN_DISTANCE = 1.2;
/** Head height above the player origin used as the ray origin. */
export const CAMERA_HEAD_HEIGHT = 1.6;

/** Plain 3D vector - deliberately not a THREE type. */
export interface CameraVec3 {
  x: number;
  y: number;
  z: number;
}

/** Sentinel for "this collider is not touched by the segment". */
const MISS = Number.POSITIVE_INFINITY;
/** Epsilon for near-parallel ray/slab tests. */
const PARALLEL_EPS = 1e-12;
/**
 * Resolve the camera position against building colliders.
 *
 * Casts a 2D ray on the XZ plane from the head to the desired camera
 * position, finds the smallest t in [0, 1] where it first touches a collider
 * expanded by CAMERA_COLLISION_MARGIN, and lerps the full 3D head->desired
 * vector to that t. If the result would sit closer than
 * CAMERA_COLLISION_MIN_DISTANCE to the head, it is pushed out to exactly
 * that distance along the ray. With no hit (or a degenerate ray), the
 * desired position is returned at equal coordinates.
 */
export function resolveCameraCollision(
  head: CameraVec3,
  desired: CameraVec3,
  colliders: Collider[],
): CameraVec3 {
  // 1. Degenerate: desired equals head - nothing to resolve, no NaN.
  if (head.x === desired.x && head.y === desired.y && head.z === desired.z) {
    return desired;
  }

  // 2. 2D segment on the XZ plane from head to desired.
  const dx = desired.x - head.x;
  const dz = desired.z - head.z;
  const rayLengthXZ = Math.hypot(dx, dz);
  // A purely vertical camera move has no XZ extent and cannot cross a 2D
  // collider, so there is nothing to resolve.
  let tHit = MISS;
  if (rayLengthXZ > 0) {
    for (const collider of colliders) {
      const t =
        collider.type === "rect"
          ? rectEntryT(head.x, head.z, dx, dz, collider)
          : collider.type === "circle"
            ? circleEntryT(head.x, head.z, dx, dz, collider)
            : segmentEntryT(head.x, head.z, dx, dz, rayLengthXZ, collider);
      // Colliders past the desired point (t > 1) or entirely behind the
      // head never intersect this frame's segment.
      if (t <= 1 && t < tHit) {
        tHit = t;
      }
    }
  }

  // 4. No hit: the desired position is safe as-is.
  if (tHit === MISS) {
    return { x: desired.x, y: desired.y, z: desired.z };
  }

  // 5. Hit: full 3D lerp along the head->desired ray to the first touch.
  // A negative tHit means the head starts inside a collider; Math.max(0, ...)
  // then parks the camera at the head and the floor below pushes it out.
  const dirX = desired.x - head.x;
  const dirY = desired.y - head.y;
  const dirZ = desired.z - head.z;
  const tSafe = Math.max(0, tHit);
  const safe: CameraVec3 = {
    x: head.x + dirX * tSafe,
    y: head.y + dirY * tSafe,
    z: head.z + dirZ * tSafe,
  };
  // 6. Floor: never park the camera closer than the minimum distance.
  const safeDist = Math.hypot(safe.x - head.x, safe.y - head.y, safe.z - head.z);
  if (safeDist < CAMERA_COLLISION_MIN_DISTANCE) {
    // rayDist > 0 here: the degenerate case returned early above.
    const rayDist = Math.hypot(dirX, dirY, dirZ);
    const k = CAMERA_COLLISION_MIN_DISTANCE / rayDist;
    return {
      x: head.x + dirX * k,
      y: head.y + dirY * k,
      z: head.z + dirZ * k,
    };
  }
  return safe;
}

/**
 * First ray parameter where the XZ ray enters the margin-expanded rect
 * (2D slab test). Returns MISS when the segment cannot touch the rect.
 * A negative result means the head starts inside the expanded rect.
 */
function rectEntryT(
  hx: number,
  hz: number,
  dx: number,
  dz: number,
  rect: RectCollider,
): number {
  const minX = rect.cx - rect.hw - CAMERA_COLLISION_MARGIN;
  const maxX = rect.cx + rect.hw + CAMERA_COLLISION_MARGIN;
  const minZ = rect.cz - rect.hd - CAMERA_COLLISION_MARGIN;
  const maxZ = rect.cz + rect.hd + CAMERA_COLLISION_MARGIN;

  let tNear = -MISS;
  let tFar = MISS;

  if (Math.abs(dx) < PARALLEL_EPS) {
    if (hx < minX || hx > maxX) {
      return MISS;
    }
  } else {
    const t1 = (minX - hx) / dx;
    const t2 = (maxX - hx) / dx;
    tNear = Math.max(tNear, Math.min(t1, t2));
    tFar = Math.min(tFar, Math.max(t1, t2));
  }

  if (Math.abs(dz) < PARALLEL_EPS) {
    if (hz < minZ || hz > maxZ) {
      return MISS;
    }
  } else {
    const t1 = (minZ - hz) / dz;
    const t2 = (maxZ - hz) / dz;
    tNear = Math.max(tNear, Math.min(t1, t2));
    tFar = Math.min(tFar, Math.max(t1, t2));
  }

  if (tNear > tFar || tFar < 0 || tNear > 1) {
    return MISS;
  }
  return tNear;
}
/**
 * First ray parameter where the XZ ray touches the margin-expanded circle
 * (quadratic ray-circle test against r + MARGIN). Returns MISS when the ray
 * misses. A negative result means the head starts inside the expanded circle.
 */
function circleEntryT(
  hx: number,
  hz: number,
  dx: number,
  dz: number,
  circle: CircleCollider,
): number {
  const radius = circle.r + CAMERA_COLLISION_MARGIN;
  const relX = hx - circle.cx;
  const relZ = hz - circle.cz;
  const a = dx * dx + dz * dz;
  const halfB = relX * dx + relZ * dz;
  const c = relX * relX + relZ * relZ - radius * radius;
  // a > 0 here: the caller skips vertical-only rays before reaching this.
  const discriminant = halfB * halfB - a * c;
  if (discriminant < 0) {
    return MISS;
  }
  const tEnter = (-halfB - Math.sqrt(discriminant)) / a;
  const tExit = (-halfB + Math.sqrt(discriminant)) / a;
  if (tEnter > 1 || tExit < 0) {
    return MISS;
  }
  // Both roots at or past t = 0 mean the head starts outside the circle;
  // otherwise the head is already inside and the entry is behind the ray.
  return tEnter >= 0 ? tEnter : tExit;
}

/**
 * First ray parameter where the XZ ray crosses the segment collider, backed
 * off along the ray by MARGIN / rayLengthXZ (never below 0). Returns MISS
 * when the crossing is outside the collider or behind the head.
 */
function segmentEntryT(
  hx: number,
  hz: number,
  dx: number,
  dz: number,
  rayLengthXZ: number,
  wall: SegmentCollider,
): number {
  const segDX = wall.x2 - wall.x1;
  const segDZ = wall.z2 - wall.z1;
  const denom = dx * segDZ - dz * segDX;
  if (Math.abs(denom) < PARALLEL_EPS) {
    return MISS;
  }
  const relX = wall.x1 - hx;
  const relZ = wall.z1 - hz;
  const t = (relX * segDZ - relZ * segDX) / denom;
  const u = (relX * dz - relZ * dx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return MISS;
  }
  // Pull the camera just in front of the wall by the margin distance.
  return Math.max(0, t - CAMERA_COLLISION_MARGIN / rayLengthXZ);
}
