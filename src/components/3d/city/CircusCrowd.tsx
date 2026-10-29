import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { seeded } from '../../../utils/arenaInteriorTextures';

/**
 * CircusCrowd.tsx — CM-1 "The Circus Crowd": the East Circus Arena's cavea,
 * populated.
 *
 * The AI-2 "Living Cavea" idiom from `DuelArena.tsx`, transplanted to the
 * circus: TWO `THREE.InstancedMesh` (bodies, then heads), one seeded PRNG
 * stream (`CIRCUS_CROWD_SEED`), AI-2's eight tunic colours, per-instance
 * colours through `setColorAt`, `castShadow = false` on both meshes, and
 * zero new lights. Scenery only: no race state, no physics, no clock reads.
 *
 * Placement is computed in the arena's own local frame (the frame
 * `EastCircusArena` mounts the GLB in) and carried to world space with
 * `circusLocalToWorld` — the same scale 0.20 / yaw PI/2 / position
 * [52.34, 0.00, 43.80] the arena ships. Five seeded rings sit on the cavea,
 * the ring between the track edge and the outer wall, at d = 2.0 + r*1.6
 * from the track edge and y = 0.5 + r*0.75. The carceres sector is skipped.
 */

// ── The brief's literals ────────────────────────────────────────────────

/** The crowd's one seed: the same 600 people arrive on every mount. */
export const CIRCUS_CROWD_SEED = 7;
/** Spectators in the crowd. */
export const CIRCUS_CROWD_COUNT = 600;
/** Seeded rings on the cavea. */
export const CIRCUS_CROWD_RINGS = 5;
/** Spectators per ring. */
export const CIRCUS_CROWD_PER_RING = CIRCUS_CROWD_COUNT / CIRCUS_CROWD_RINGS;

/**
 * Per-instance tunic colours — AI-2's eight, verbatim from DuelArena's
 * CROWD_TUNIC_COLORS. Never invented, never reordered.
 */
export const CIRCUS_CROWD_TUNIC_COLORS = [
  '#991b1b',
  '#f5f5f4',
  '#78350f',
  '#b45309',
  '#e5e5e5',
  '#3f3a34',
  '#8a6f4d',
  '#5b6b7a',
] as const;

/** The two head tones, alternating by seeded coin — AI-2's CROWD_HEAD_COLORS. */
export const CIRCUS_CROWD_HEAD_COLORS = ['#b45309', '#e5e5e5'] as const;

/** The body box — 1.2 x 1.4 x 0.8, AI-2's shipped body geometry. */
export const CIRCUS_CROWD_BODY_SIZE = [1.2, 1.4, 0.8] as const;
/** The head box — 0.55^3. */
export const CIRCUS_CROWD_HEAD_SIZE = [0.55, 0.55, 0.55] as const;
/** How far the head's centre sits above the body's — AI-2's CROWD_HEAD_LIFT. */
export const CIRCUS_CROWD_HEAD_LIFT = 0.95;
/** Seeded scale envelope — AI-2's 0.92..1.08. */
export const CIRCUS_CROWD_SCALE_MIN = 0.92;
export const CIRCUS_CROWD_SCALE_MAX = 1.08;

// ── The arena transform (EastCircusArena's approved placement) ───────────

/** Approved placement, verbatim: position [52.34, 0.00, 43.80]. */
export const CIRCUS_ARENA_POSITION = [52.34, 0.0, 43.8] as const;
/** Approved placement, verbatim: yaw PI/2. */
export const CIRCUS_ARENA_YAW = Math.PI / 2;
/** Approved placement, verbatim: scale 0.20. */
export const CIRCUS_ARENA_SCALE = 0.2;

/**
 * Arena-local -> world. three.js `rotation={[0, yaw, 0]}` is R_y(yaw):
 * x' = x*cos(yaw) + z*sin(yaw), z' = -x*sin(yaw) + z*cos(yaw); the group's
 * scale and position apply around it.
 */
export function circusLocalToWorld(
  local: readonly [number, number, number],
): [number, number, number] {
  const s = CIRCUS_ARENA_SCALE;
  const c = Math.cos(CIRCUS_ARENA_YAW);
  const n = Math.sin(CIRCUS_ARENA_YAW);
  return [
    s * (local[0] * c + local[2] * n) + CIRCUS_ARENA_POSITION[0],
    s * local[1] + CIRCUS_ARENA_POSITION[1],
    s * (-local[0] * n + local[2] * c) + CIRCUS_ARENA_POSITION[2],
  ];
}

// ── The track edge, in arena-local units ────────────────────────────────

/**
 * The sand track's edge, arena-local, derived by inverting the transform
 * above over EastCircusArena's documented world measurements:
 *   world X 43.940..60.740 -> localZ -42..42   (transverse)
 *   world Z -24.600..43.800 -> localX 0..342   (longitudinal; 0 = carceres end)
 */
export const CIRCUS_TRACK_LOCAL = {
  xMin: 0,
  xMax: 342,
  zHalf: 42,
  /**
   * Rounded-rectangle corner radius of the track edge itself. The brief
   * documents the track as a plain rectangle, so 0: the offset curve rounds
   * the rectangle's sharp corners at radius `d`, keeping every spectator at
   * least `d` from the track — and outside its documented bounding box.
   */
  cornerRadius: 0,
} as const;

/** Ring offset from the track edge: d = 2.0 + r*1.6. */
export const CIRCUS_RING_OFFSET_BASE = 2.0;
export const CIRCUS_RING_OFFSET_STEP = 1.6;
/** Ring height: y = 0.5 + r*0.75. */
export const CIRCUS_RING_Y_BASE = 0.5;
export const CIRCUS_RING_Y_STEP = 0.75;

/**
 * The carceres sector. The brief's "local Z > 40.0" is the world-Z threshold
 * 40.0: the carceres block begins at world Z 43.8, so 40.0 is the conservative
 * cut just south of the track's carceres end. Converted to the local frame's
 * longitudinal axis (worldZ = 43.8 - 0.2*localX) that cut is localX < 19.
 */
export const CIRCUS_CARCERES_WORLD_Z = 40.0;
export const CIRCUS_CARCERES_LOCAL_X_MIN =
  (43.8 - CIRCUS_CARCERES_WORLD_Z) / CIRCUS_ARENA_SCALE;

/** True for arena-local points in the carceres sector (skipped). */
export function isCarceresSectorLocal(localX: number): boolean {
  return localX < CIRCUS_CARCERES_LOCAL_X_MIN;
}

/**
 * The point on the rounded-rectangle offset curve at distance `d` from the
 * track edge, in the direction `theta` from the track's centre. Returns
 * arena-local (longitudinal, transverse). The curve is the track's rounded
 * rectangle (corner radius `cornerRadius`) offset outward by `d`.
 */
export function circusOffsetCurvePoint(theta: number, d: number): [number, number] {
  const t = CIRCUS_TRACK_LOCAL;
  const hw = t.zHalf + d;
  const x0 = t.xMin - d;
  const x1 = t.xMax + d;
  const r = t.cornerRadius + d;
  const cx = (t.xMin + t.xMax) / 2;
  const dx = Math.cos(theta);
  const dz = Math.sin(theta);
  let best = Number.POSITIVE_INFINITY;
  // The two straights along the track: z = +/-hw, x in [x0 + r, x1 - r].
  if (dz !== 0) {
    for (const s of [1, -1]) {
      const tt = (s * hw) / dz;
      const px = cx + tt * dx;
      if (tt > 0 && px >= x0 + r && px <= x1 - r && tt < best) best = tt;
    }
  }
  // The two ends: x = x0 (carceres) and x = x1 (far), z in [-(hw - r), hw - r].
  if (dx !== 0) {
    for (const xe of [x0, x1]) {
      const tt = (xe - cx) / dx;
      const pz = tt * dz;
      if (tt > 0 && pz >= -(hw - r) && pz <= hw - r && tt < best) best = tt;
    }
  }
  // The four corner arcs, radius r.
  for (const qx of [x0 + r, x1 - r]) {
    for (const qz of [hw - r, -(hw - r)]) {
      const ox = cx - qx;
      const oz = -qz;
      const b = ox * dx + oz * dz;
      const cc = ox * ox + oz * oz - r * r;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      for (const tt of [-b - sq, -b + sq]) {
        if (tt <= 0 || tt >= best) continue;
        const px = cx + tt * dx;
        const pz = tt * dz;
        const inX = qx <= cx ? px <= qx : px >= qx;
        const inZ = qz >= 0 ? pz >= qz : pz <= qz;
        if (inX && inZ) best = tt;
      }
    }
  }
  // The centre is strictly inside the convex curve, so a hit always exists.
  const hit = best === Number.POSITIVE_INFINITY ? 0 : best;
  return [cx + hit * dx, hit * dz];
}

/** One placed spectator: arena-local and world positions plus dress. */
export interface CircusCrowdSpectator {
  /** Arena-local position (the `circusLocalToWorld` input frame). */
  localX: number;
  localY: number;
  localZ: number;
  /** World position (metres). */
  x: number;
  y: number;
  z: number;
  /** Seating ring, 0..4. */
  ring: number;
  /** Seeded scale, 0.92..1.08. */
  scale: number;
  /** Seeded yaw. */
  yaw: number;
  /** One of the eight tunic colours. */
  tunic: string;
  /** One of the two head tones. */
  head: string;
}

/**
 * The 600 spectators: five seeded rings on the cavea. Each ring walks 120
 * seeded angles around the rounded-rectangle offset curve at its distance
 * from the track edge; the carceres sector is skipped (with deterministic
 * top-up, so the count stays exactly 600). Tunic, head tone, yaw and scale
 * all come from the one seeded stream — no wall-clock reads.
 */
export function buildCircusCrowdPlacement(): CircusCrowdSpectator[] {
  const rand = seeded(CIRCUS_CROWD_SEED);
  const spectators: CircusCrowdSpectator[] = [];
  for (let ring = 0; ring < CIRCUS_CROWD_RINGS; ring += 1) {
    const d = CIRCUS_RING_OFFSET_BASE + ring * CIRCUS_RING_OFFSET_STEP;
    const localY = CIRCUS_RING_Y_BASE + ring * CIRCUS_RING_Y_STEP;
    let placed = 0;
    let guard = 0;
    while (placed < CIRCUS_CROWD_PER_RING && guard < CIRCUS_CROWD_PER_RING * 64) {
      guard += 1;
      const theta = rand() * Math.PI * 2;
      const [localX, localZ] = circusOffsetCurvePoint(theta, d);
      if (isCarceresSectorLocal(localX)) continue;
      const [x, y, z] = circusLocalToWorld([localX, localY, localZ]);
      const scale =
        CIRCUS_CROWD_SCALE_MIN + rand() * (CIRCUS_CROWD_SCALE_MAX - CIRCUS_CROWD_SCALE_MIN);
      const yaw = rand() * Math.PI * 2;
      const tunic =
        CIRCUS_CROWD_TUNIC_COLORS[Math.floor(rand() * CIRCUS_CROWD_TUNIC_COLORS.length)];
      const head = CIRCUS_CROWD_HEAD_COLORS[rand() < 0.5 ? 0 : 1];
      spectators.push({ localX, localY, localZ, x, y, z, ring, scale, yaw, tunic, head });
      placed += 1;
    }
  }
  return spectators;
}

/**
 * Fill the two instanced meshes from the placement — AI-2's fill idiom: one
 * dummy Object3D, per-instance colours, body feet on the seat, head
 * `CIRCUS_CROWD_HEAD_LIFT` above the body centre.
 */
export function fillCircusCrowdInstances(
  bodies: THREE.InstancedMesh,
  heads: THREE.InstancedMesh,
  spectators: CircusCrowdSpectator[],
): void {
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const bodyHalf = CIRCUS_CROWD_BODY_SIZE[1] / 2;
  spectators.forEach((s, i) => {
    dummy.position.set(s.x, s.y + bodyHalf * s.scale, s.z);
    dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.setScalar(s.scale);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, tint.set(s.tunic));
    dummy.position.y += CIRCUS_CROWD_HEAD_LIFT * s.scale;
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, tint.set(s.head));
  });
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
}

/**
 * Build exactly the two instanced meshes the crowd draws: bodies, then heads.
 * Both carry `castShadow = false` (600 shadow casters buy nothing here) and
 * `frustumCulled = false` (the instances span the arena; the base geometry's
 * bounds would cull them wrongly).
 */
export function createCircusCrowdMeshes(
  spectators: CircusCrowdSpectator[] = buildCircusCrowdPlacement(),
): { bodies: THREE.InstancedMesh; heads: THREE.InstancedMesh } {
  const bodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(...CIRCUS_CROWD_BODY_SIZE),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    CIRCUS_CROWD_COUNT,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(...CIRCUS_CROWD_HEAD_SIZE),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    CIRCUS_CROWD_COUNT,
  );
  bodies.castShadow = false;
  heads.castShadow = false;
  bodies.frustumCulled = false;
  heads.frustumCulled = false;
  fillCircusCrowdInstances(bodies, heads, spectators);
  return { bodies, heads };
}

/**
 * The crowd component. Seeded once per mount, filled once per mount; no
 * lights, no race state, no clock. Mounts next to `EastCircusArena`.
 */
export const CircusCrowd: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const spectators = useMemo(() => buildCircusCrowdPlacement(), []);
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const { bodies, heads } = createCircusCrowdMeshes(spectators);
    group.add(bodies, heads);
    return () => {
      group.remove(bodies, heads);
      bodies.geometry.dispose();
      (bodies.material as THREE.Material).dispose();
      heads.geometry.dispose();
      (heads.material as THREE.Material).dispose();
    };
  }, [spectators]);
  return <group ref={groupRef} />;
};
