/**
 * CF-4 — impact particles (sparks + sand), pooled.
 *
 * ── WHY IT IS BUILT THIS WAY ──────────────────────────────────────────────
 * One `THREE.Points` with one pre-allocated buffer of `IMPACT_POOL_SIZE`
 * particles: one geometry, one material, **one draw call**, no per-burst object
 * creation and no React state. `DuelScene` holds a ref to the imperative
 * `burst()` handle and calls it from the branches that already resolved the
 * blow; the frame loop only walks the fixed-size arrays.
 *
 * The house pattern is `GladiatorMesh`'s: the module scope owns every temp —
 * `_axis`, `_dir`, `_tangentA/B`, the scratch `THREE.Color`s — so neither the
 * spawn path nor the integration loop allocates. `createImpactPool` /
 * `createImpactPoints` allocate exactly once per component instance (inside
 * `useMemo`), and `integrateImpactPool` touches nothing but the typed arrays it
 * is handed, which is what makes the zero-allocation claim testable without a GPU.
 *
 * DEAD PARTICLES: a particle with no life left is parked at
 * `y = IMPACT_PARKED_Y` (−10, far below the arena floor) and skipped by the
 * integration loop; the pool never shrinks or grows. A full pool recycles its
 * oldest slot (round-robin cursor) instead of allocating.
 *
 * EMISSION AXIS (the brief's implementer choice, documented): sparks and crit
 * sparks open their cone along a caller-supplied impact direction — `DuelScene`
 * passes the blow's own axis, i.e. from the attacker toward the defender, so the
 * spray is biased **away from the attacker**. With no direction the cone points
 * at world +Z. Sand is the exception: it always fountains along world up (a dust
 * kick, not a ricochet), which is the recipe's own `axis: 'up'`.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** The whole budget: 128 pre-allocated particles, shared by every burst. */
export const IMPACT_POOL_SIZE = 128;

/** Where a dead particle sits — below the arena floor, so it is never on screen. */
export const IMPACT_PARKED_Y = -10;

/**
 * Ceiling on one frame's integration step. A backgrounded tab hands back a delta
 * of several seconds; without the clamp a burst would teleport off-screen on the
 * first frame after the tab returns.
 */
export const IMPACT_MAX_STEP_SECONDS = 0.1;

export type ImpactKind = 'spark' | 'sand' | 'crit';

export interface ImpactRecipe {
  /** Particles emitted by one burst (for `crit`: the spark-recipe part). */
  count: number;
  /** Extra gold particles a `crit` adds on top of its spark part. */
  goldCount: number;
  speedMin: number;
  speedMax: number;
  /** Downward acceleration, world units / s². */
  gravity: number;
  /** Seconds of life. */
  life: number;
  /** Half-angle of the emission cone, in degrees. */
  coneDegrees: number;
  /** `impact` = the caller's blow axis; `up` = world +Y (a dust fountain). */
  axis: 'impact' | 'up';
  colorFrom: string;
  colorTo: string;
}

const SPARK_RECIPE: ImpactRecipe = {
  count: 14,
  goldCount: 0,
  speedMin: 2.2,
  speedMax: 3.6,
  gravity: -4,
  life: 0.35,
  coneDegrees: 42,
  axis: 'impact',
  colorFrom: '#fff7cc',
  colorTo: '#f97316',
};

const SAND_RECIPE: ImpactRecipe = {
  count: 10,
  goldCount: 0,
  speedMin: 0.6,
  speedMax: 1.2,
  gravity: -1.5,
  life: 0.5,
  coneDegrees: 38,
  axis: 'up',
  colorFrom: '#c29b62',
  colorTo: '#c29b62',
};

// A crit is the spark recipe with a longer life and a wider cone, plus the gold
// flakes that carry the crit read.
const CRIT_RECIPE: ImpactRecipe = {
  ...SPARK_RECIPE,
  count: 28,
  goldCount: 6,
  life: 0.5,
  coneDegrees: 55,
};

export const IMPACT_RECIPES: Record<ImpactKind, ImpactRecipe> = {
  spark: SPARK_RECIPE,
  sand: SAND_RECIPE,
  crit: CRIT_RECIPE,
};

/** The crit's extra flakes. */
export const CRIT_GOLD_COLOR = '#fbbf24';

/** Cone axis used when a caller passes no direction: straight down the +Z axis. */
export const DEFAULT_IMPACT_DIRECTION: readonly [number, number, number] = [0, 0, 1];

/**
 * The pool's storage. Every array is allocated once, sized to the budget:
 * `life[i] <= 0` marks a free slot, and `position` / `color` ARE the geometry's
 * attribute arrays (no copy per frame).
 */
export interface ImpactPool {
  /** xyz per particle — the geometry's `position` attribute array. */
  position: Float32Array;
  velocity: Float32Array;
  /** rgb per particle — the geometry's `color` attribute array. */
  color: Float32Array;
  /** Seconds of life left; `<= 0` means the slot is free. */
  life: Float32Array;
  /** Per-particle gravity, so sand and sparks can share the pool. */
  gravity: Float32Array;
  /** Round-robin slot cursor used when the pool is full. */
  cursor: number;
  /** Set by a spawn, cleared by the renderer once the colours are uploaded. */
  colorDirty: boolean;
}

export function createImpactPool(): ImpactPool {
  const position = new Float32Array(IMPACT_POOL_SIZE * 3);
  // Every slot starts dead AND parked, so the very first frame draws nothing.
  for (let i = 0; i < IMPACT_POOL_SIZE; i += 1) {
    position[i * 3 + 1] = IMPACT_PARKED_Y;
  }
  return {
    position,
    velocity: new Float32Array(IMPACT_POOL_SIZE * 3),
    color: new Float32Array(IMPACT_POOL_SIZE * 3),
    life: new Float32Array(IMPACT_POOL_SIZE),
    gravity: new Float32Array(IMPACT_POOL_SIZE),
    cursor: 0,
    colorDirty: true,
  };
}

// ── Module-scope temps (the GladiatorMesh house pattern): the ONLY scratch
// objects the spawn path uses. Nothing here is ever allocated per call.
const _axis = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tangentA = new THREE.Vector3();
const _tangentB = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3(1, 0, 0);
const _colorFrom = new THREE.Color();
const _colorTo = new THREE.Color();
const _colorMix = new THREE.Color();

/**
 * Writes a unit vector inside the cone of `coneRadians` around `_axis` into
 * `_dir`. Uniform over the cone's solid angle (cos θ is sampled linearly), so the
 * spray has no clump at its centre.
 */
function sampleCone(coneRadians: number, random: () => number): void {
  const cosMax = Math.cos(coneRadians);
  const cosTheta = 1 - random() * (1 - cosMax);
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const phi = random() * Math.PI * 2;

  if (Math.abs(_axis.y) < 0.99) {
    _tangentA.copy(_up).cross(_axis).normalize();
  } else {
    _tangentA.copy(_side).cross(_axis).normalize();
  }
  _tangentB.copy(_axis).cross(_tangentA).normalize();

  _dir
    .copy(_axis)
    .multiplyScalar(cosTheta)
    .addScaledVector(_tangentA, Math.cos(phi) * sinTheta)
    .addScaledVector(_tangentB, Math.sin(phi) * sinTheta);
}

/** First free slot; a full pool recycles the oldest. Never allocates. */
function takeSlot(pool: ImpactPool): number {
  for (let i = 0; i < IMPACT_POOL_SIZE; i += 1) {
    const index = (pool.cursor + i) % IMPACT_POOL_SIZE;
    if (pool.life[index] <= 0) {
      pool.cursor = (index + 1) % IMPACT_POOL_SIZE;
      return index;
    }
  }
  const index = pool.cursor;
  pool.cursor = (pool.cursor + 1) % IMPACT_POOL_SIZE;
  return index;
}

/** Emits `count` particles of one recipe/colour pair from `position`. */
function emit(
  pool: ImpactPool,
  count: number,
  recipe: ImpactRecipe,
  colorFrom: string,
  colorTo: string,
  position: readonly [number, number, number],
  random: () => number,
): void {
  _colorFrom.set(colorFrom);
  _colorTo.set(colorTo);
  const coneRadians = (recipe.coneDegrees * Math.PI) / 180;

  for (let n = 0; n < count; n += 1) {
    const index = takeSlot(pool);
    const i3 = index * 3;

    pool.position[i3] = position[0];
    pool.position[i3 + 1] = position[1];
    pool.position[i3 + 2] = position[2];

    sampleCone(coneRadians, random);
    const speed = recipe.speedMin + random() * (recipe.speedMax - recipe.speedMin);
    pool.velocity[i3] = _dir.x * speed;
    pool.velocity[i3 + 1] = _dir.y * speed;
    pool.velocity[i3 + 2] = _dir.z * speed;

    pool.life[index] = recipe.life;
    pool.gravity[index] = recipe.gravity;

    // Spark colours are a random lerp of the recipe's pair, so a burst reads as
    // white-hot cores cooling into orange; sand's pair is one colour.
    _colorMix.copy(_colorFrom).lerp(_colorTo, random());
    pool.color[i3] = _colorMix.r;
    pool.color[i3 + 1] = _colorMix.g;
    pool.color[i3 + 2] = _colorMix.b;
  }
}

/**
 * Spawns one burst. `direction` is the cone axis for spark/crit (sand ignores it
 * and fountains upward); omit it for the default +Z. `random` is injectable so a
 * test can make the burst deterministic.
 */
export function spawnImpact(
  pool: ImpactPool,
  kind: ImpactKind,
  position: readonly [number, number, number],
  direction: readonly [number, number, number] = DEFAULT_IMPACT_DIRECTION,
  random: () => number = Math.random,
): void {
  const recipe = IMPACT_RECIPES[kind];

  if (recipe.axis === 'up') {
    _axis.copy(_up);
  } else {
    _axis.set(direction[0], direction[1], direction[2]);
    if (_axis.lengthSq() < 1e-8) _axis.set(0, 0, 1);
    else _axis.normalize();
  }

  emit(pool, recipe.count, recipe, recipe.colorFrom, recipe.colorTo, position, random);
  if (recipe.goldCount > 0) {
    emit(pool, recipe.goldCount, recipe, CRIT_GOLD_COLOR, CRIT_GOLD_COLOR, position, random);
  }

  pool.colorDirty = true;
}

/**
 * One integration step: semi-implicit Euler (velocity first, then position) over
 * the whole fixed-size pool. Returns whether any particle moved, so the caller
 * flags the GPU upload only when something actually changed.
 *
 * ALLOCATION-FREE BY CONSTRUCTION: this function reads and writes the typed
 * arrays it is handed and nothing else — no `new`, no literal, no array method
 * that returns a collection. `impactParticles.test.ts` pins both that source
 * shape and the array identities across 600 steps.
 */
export function integrateImpactPool(pool: ImpactPool, dt: number): boolean {
  const position = pool.position;
  const velocity = pool.velocity;
  const life = pool.life;
  const gravity = pool.gravity;
  let changed = false;

  for (let i = 0; i < IMPACT_POOL_SIZE; i += 1) {
    const remaining = life[i];
    if (remaining <= 0) continue;

    const i3 = i * 3;
    const left = remaining - dt;
    if (left <= 0) {
      // Dead: park it below the arena and free the slot.
      life[i] = 0;
      position[i3 + 1] = IMPACT_PARKED_Y;
      changed = true;
      continue;
    }
    life[i] = left;

    velocity[i3 + 1] += gravity[i] * dt;
    position[i3] += velocity[i3] * dt;
    position[i3 + 1] += velocity[i3 + 1] * dt;
    position[i3 + 2] += velocity[i3 + 2] * dt;
    changed = true;
  }

  return changed;
}

/** The one THREE.Points the duel scene owns — one geometry, one material, one draw call. */
export interface ImpactPointsObjects {
  points: THREE.Points;
  pool: ImpactPool;
}

export function createImpactPoints(): ImpactPointsObjects {
  const pool = createImpactPool();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pool.position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(pool.color, 3));

  const material = new THREE.PointsMaterial({
    size: 0.06,
    sizeAttenuation: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });

  const points = new THREE.Points(geometry, material);
  // The buffer's positions live below the floor until a burst moves them, and a
  // Points' bounding sphere is computed from data and never updated per frame —
  // so culling would hide a burst that left the initial bounds.
  points.frustumCulled = false;
  points.name = 'impact-particles';

  return { points, pool };
}

export interface ImpactParticlesHandle {
  /**
   * Fire one burst. `position` is the impact point; `direction` is the spark
   * cone's axis (the blow's own direction, so sparks spray away from the
   * attacker). Sand ignores it.
   */
  burst(
    kind: ImpactKind,
    position: [number, number, number],
    direction?: [number, number, number],
  ): void;
}

/**
 * Mount inside the duel's Canvas (inside its Suspense boundary). Renders nothing
 * until `burst()` is called; no state, no re-render.
 */
export const ImpactParticles = forwardRef<ImpactParticlesHandle>(function ImpactParticles(
  _props,
  ref,
) {
  const { points, pool } = useMemo(createImpactPoints, []);
  const positionAttribute = useMemo(
    () => points.geometry.getAttribute('position') as THREE.BufferAttribute,
    [points],
  );
  const colorAttribute = useMemo(
    () => points.geometry.getAttribute('color') as THREE.BufferAttribute,
    [points],
  );

  useEffect(
    () => () => {
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    },
    [points],
  );

  useImperativeHandle(
    ref,
    () => ({
      burst(kind, position, direction) {
        spawnImpact(pool, kind, position, direction);
      },
    }),
    [pool],
  );

  useFrame((_, delta) => {
    const step = delta > IMPACT_MAX_STEP_SECONDS ? IMPACT_MAX_STEP_SECONDS : delta;
    if (integrateImpactPool(pool, step)) positionAttribute.needsUpdate = true;
    if (pool.colorDirty) {
      colorAttribute.needsUpdate = true;
      pool.colorDirty = false;
    }
  });

  return <primitive object={points} />;
});
