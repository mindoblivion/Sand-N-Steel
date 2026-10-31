/**
 * CF-4 — pooled impact particles (sparks + sand).
 *
 * Run with: `bun test src/utils/impactParticles.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the pool budget: 128 particles, ONE `THREE.Points` with one geometry and
 *       one material (therefore exactly one draw call), the briefed PointsMaterial,
 *       and a component that renders that single object and nothing else;
 *   §B  the recipes: spark 14, sand 10, crit 28 + 6 gold, with their colours,
 *       speed bands, gravity and life;
 *   §C  a burst's shape: slot count, spawn point, speed band, the cone's axis
 *       (sparks along the blow, sand upward) and the colour lerp;
 *   §D  gravity/life integration per recipe (−4 / 0.35 s, −1.5 / 0.5 s, crit 0.5 s);
 *   §E  dead particles parked at y = −10, slots reused, a full pool recycled
 *       in place rather than grown;
 *   §F  ZERO per-frame allocation in the update path — the typed arrays keep their
 *       identity and the pool its shape across 600 steps, and the integration
 *       function's own source contains no allocating construct;
 *   §G  the call-site wiring out of `DuelScene`: blocked → spark, unblocked → sand,
 *       crit → crit instead of sand, nothing else — and the component mounted only
 *       inside the duel's Suspense boundary, nowhere else in the tree;
 *   §H  combat outcomes and timing untouched: the hit-stop table, the resolution
 *       window and combatCalculations.ts say nothing about particles, and each
 *       burst is ADDED beside the feedback line it belongs to, replacing none.
 *
 * Tolerances: the pool's arrays are `Float32Array`, so a stored value carries
 * float32 rounding (~1e-7 relative). Comparisons of stored values therefore use
 * precision 4, and epsilon bounds on speeds/colours use 1e-4 — both far below the
 * quantities being asserted (a 2.2–3.6 speed band, a 0.35 s life) and far above
 * the storage's own rounding.
 *
 * No renderer is involved and no browser storage is read or written: the pool,
 * the recipes and the integration step are pure, so the behaviour is driven
 * directly rather than through a Canvas the sandbox cannot draw.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  CRIT_GOLD_COLOR,
  DEFAULT_IMPACT_DIRECTION,
  IMPACT_MAX_STEP_SECONDS,
  IMPACT_PARKED_Y,
  IMPACT_POOL_SIZE,
  IMPACT_RECIPES,
  createImpactPoints,
  createImpactPool,
  integrateImpactPool,
  spawnImpact,
  type ImpactPool,
} from '../components/3d/ImpactParticles';

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): string => readFileSync(join(SRC_DIR, path), 'utf8');

/** Source with comments removed, so prose can never satisfy (or defeat) a check. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** Every `.ts`/`.tsx` under src/, as repo-relative paths. */
const sourceFiles = (dir = SRC_DIR, prefix = ''): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full, `${prefix}${entry}/`);
    return /\.tsx?$/.test(entry) ? [`${prefix}${entry}`] : [];
  });

/** A deterministic PRNG (LCG), so a burst is reproducible. */
const seeded = (seed = 12345): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const liveIndices = (pool: ImpactPool): number[] => {
  const indices: number[] = [];
  for (let i = 0; i < IMPACT_POOL_SIZE; i += 1) if (pool.life[i] > 0) indices.push(i);
  return indices;
};

const liveCount = (pool: ImpactPool): number => liveIndices(pool).length;

const speedOf = (pool: ImpactPool, index: number): number => {
  const i3 = index * 3;
  return Math.hypot(pool.velocity[i3], pool.velocity[i3 + 1], pool.velocity[i3 + 2]);
};

/** Integrates `frames` fixed 1/60 s steps. */
const step = (pool: ImpactPool, frames: number): void => {
  for (let i = 0; i < frames; i += 1) integrateImpactPool(pool, 1 / 60);
};

const channels = (hex: string): [number, number, number] => {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
};

const EPS = 1e-4;
const STORE = 4;

// ── §A THE POOL BUDGET ───────────────────────────────────────────────────────
describe('CF-4 §A pool budget, one Points, one draw call', () => {
  test('the pool is one pre-allocated 128-particle buffer', () => {
    const pool = createImpactPool();
    expect(IMPACT_POOL_SIZE).toBe(128);
    expect(pool.position.length).toBe(IMPACT_POOL_SIZE * 3);
    expect(pool.velocity.length).toBe(IMPACT_POOL_SIZE * 3);
    expect(pool.color.length).toBe(IMPACT_POOL_SIZE * 3);
    expect(pool.life.length).toBe(IMPACT_POOL_SIZE);
    expect(pool.gravity.length).toBe(IMPACT_POOL_SIZE);
  });

  test('one THREE.Points, one geometry, one material — one draw call', () => {
    const { points } = createImpactPoints();
    expect(points instanceof THREE.Points).toBe(true);
    expect(points.isPoints).toBe(true);
    // A single material (not an array) means one draw call for this object.
    expect(Array.isArray(points.material)).toBe(false);
    const material = points.material as THREE.PointsMaterial;
    expect(material instanceof THREE.PointsMaterial).toBe(true);
    const geometry = points.geometry as THREE.BufferGeometry;
    expect(geometry instanceof THREE.BufferGeometry).toBe(true);
    expect(geometry.getAttribute('position').count).toBe(IMPACT_POOL_SIZE);
    expect(geometry.getAttribute('color').count).toBe(IMPACT_POOL_SIZE);
    // Exactly the two attributes the brief names, and no index buffer.
    expect(Object.keys(geometry.attributes).sort()).toEqual(['color', 'position']);
    expect(geometry.getIndex()).toBeNull();
  });

  test('the pool array IS the geometry attribute array (no per-frame copy)', () => {
    const { points, pool } = createImpactPoints();
    expect((points.geometry.getAttribute('position') as THREE.BufferAttribute).array).toBe(
      pool.position,
    );
    expect((points.geometry.getAttribute('color') as THREE.BufferAttribute).array).toBe(pool.color);
  });

  test('the material is the briefed PointsMaterial', () => {
    const material = createImpactPoints().points.material as THREE.PointsMaterial;
    expect(material.size).toBe(0.06);
    expect(material.sizeAttenuation).toBe(true);
    expect(material.vertexColors).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
  });

  test('frustum culling is off, so a burst that leaves the initial bounds still draws', () => {
    expect(createImpactPoints().points.frustumCulled).toBe(false);
  });

  test('the component renders that one object and no other scene object', () => {
    const source = code(read('components/3d/ImpactParticles.tsx'));
    expect(source.match(/<primitive/g)?.length).toBe(1);
    expect(source.match(/<points/g)).toBeNull();
    expect(source.match(/<mesh/g)).toBeNull();
    expect(source.match(/new THREE\.Points\(/g)?.length).toBe(1);
    expect(source.match(/new THREE\.BufferGeometry\(/g)?.length).toBe(1);
    expect(source.match(/new THREE\.PointsMaterial\(/g)?.length).toBe(1);
    // Its whole returned tree is that object.
    expect(source).toContain('return <primitive object={points} />;');
  });

  test('the step is clamped so a stalled tab cannot teleport a burst', () => {
    expect(IMPACT_MAX_STEP_SECONDS).toBe(0.1);
    const source = code(read('components/3d/ImpactParticles.tsx'));
    expect(source).toContain('delta > IMPACT_MAX_STEP_SECONDS ? IMPACT_MAX_STEP_SECONDS : delta');
  });
});

// ── §B RECIPES ───────────────────────────────────────────────────────────────
describe('CF-4 §B recipe counts, colours, gravity and life', () => {
  test('spark: 14 particles, #fff7cc → #f97316, 2.2–3.6, gravity −4, 0.35 s', () => {
    const spark = IMPACT_RECIPES.spark;
    expect(spark.count).toBe(14);
    expect(spark.goldCount).toBe(0);
    expect(spark.colorFrom).toBe('#fff7cc');
    expect(spark.colorTo).toBe('#f97316');
    expect(spark.speedMin).toBe(2.2);
    expect(spark.speedMax).toBe(3.6);
    expect(spark.gravity).toBe(-4);
    expect(spark.life).toBe(0.35);
    expect(spark.axis).toBe('impact');
  });

  test('sand: 10 particles, #c29b62, 0.6–1.2 upward, gravity −1.5, 0.5 s', () => {
    const sand = IMPACT_RECIPES.sand;
    expect(sand.count).toBe(10);
    expect(sand.goldCount).toBe(0);
    expect(sand.colorFrom).toBe('#c29b62');
    expect(sand.colorTo).toBe('#c29b62');
    expect(sand.speedMin).toBe(0.6);
    expect(sand.speedMax).toBe(1.2);
    expect(sand.gravity).toBe(-1.5);
    expect(sand.life).toBe(0.5);
    expect(sand.axis).toBe('up');
  });

  test('crit: 28 spark-recipe particles + 6 gold, life 0.5 s', () => {
    const crit = IMPACT_RECIPES.crit;
    expect(crit.count).toBe(28);
    expect(crit.goldCount).toBe(6);
    expect(crit.count + crit.goldCount).toBe(34);
    expect(crit.life).toBe(0.5);
    expect(crit.gravity).toBe(-4);
    // The spark recipe, with the wider cone and the longer life.
    expect(crit.colorFrom).toBe(IMPACT_RECIPES.spark.colorFrom);
    expect(crit.colorTo).toBe(IMPACT_RECIPES.spark.colorTo);
    expect(crit.speedMin).toBe(IMPACT_RECIPES.spark.speedMin);
    expect(crit.speedMax).toBe(IMPACT_RECIPES.spark.speedMax);
    expect(crit.coneDegrees).toBeGreaterThan(IMPACT_RECIPES.spark.coneDegrees);
    expect(CRIT_GOLD_COLOR).toBe('#fbbf24');
  });

  test('every recipe fits inside the pool', () => {
    expect(IMPACT_RECIPES.spark.count).toBeLessThanOrEqual(IMPACT_POOL_SIZE);
    expect(IMPACT_RECIPES.sand.count).toBeLessThanOrEqual(IMPACT_POOL_SIZE);
    expect(IMPACT_RECIPES.crit.count + IMPACT_RECIPES.crit.goldCount).toBeLessThanOrEqual(
      IMPACT_POOL_SIZE,
    );
  });
});

// ── §C A BURST'S SHAPE ───────────────────────────────────────────────────────
describe('CF-4 §C burst shape', () => {
  const POINT: [number, number, number] = [0, 1.2, -3.5];

  test('a spark burst fills exactly 14 slots at the impact point', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'spark', POINT, [0, 0, -1], seeded());
    expect(liveCount(pool)).toBe(14);
    for (const index of liveIndices(pool)) {
      const i3 = index * 3;
      expect(pool.position[i3]).toBeCloseTo(POINT[0], STORE);
      expect(pool.position[i3 + 1]).toBeCloseTo(POINT[1], STORE);
      expect(pool.position[i3 + 2]).toBeCloseTo(POINT[2], STORE);
      expect(pool.life[index]).toBeCloseTo(0.35, STORE);
      expect(pool.gravity[index]).toBe(-4);
    }
  });

  test('spark speeds sit inside 2.2–3.6 and the cone follows the blow', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'spark', POINT, [0, 0, -1], seeded());
    const cosCone = Math.cos((IMPACT_RECIPES.spark.coneDegrees * Math.PI) / 180);
    for (const index of liveIndices(pool)) {
      const speed = speedOf(pool, index);
      expect(speed).toBeGreaterThanOrEqual(2.2 - EPS);
      expect(speed).toBeLessThanOrEqual(3.6 + EPS);
      // Axis is −Z (the blow's own direction), so every spark travels that way.
      expect(pool.velocity[index * 3 + 2]).toBeLessThan(0);
      // …and inside the 42° cone: forward component ≥ cos(42°) of the speed.
      expect(-pool.velocity[index * 3 + 2]).toBeGreaterThanOrEqual(speed * cosCone - EPS);
    }
  });

  test('sand fountains upward whatever direction is passed', () => {
    const pool = createImpactPool();
    // A direction is passed but ignored: sand's own recipe axis is 'up'.
    spawnImpact(pool, 'sand', POINT, [0, 0, -1], seeded());
    expect(liveCount(pool)).toBe(10);
    for (const index of liveIndices(pool)) {
      const speed = speedOf(pool, index);
      expect(pool.velocity[index * 3 + 1]).toBeGreaterThan(0);
      expect(speed).toBeGreaterThanOrEqual(0.6 - EPS);
      expect(speed).toBeLessThanOrEqual(1.2 + EPS);
      expect(pool.gravity[index]).toBe(-1.5);
      expect(pool.life[index]).toBeCloseTo(0.5, STORE);
    }
  });

  test('crit fills 34 slots, six of them exactly gold', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'crit', POINT, [0, 0, -1], seeded());
    expect(liveCount(pool)).toBe(34);
    const gold = channels(CRIT_GOLD_COLOR);
    let goldCount = 0;
    for (const index of liveIndices(pool)) {
      const i3 = index * 3;
      expect(pool.life[index]).toBeCloseTo(0.5, STORE);
      expect(pool.gravity[index]).toBe(-4);
      if (
        Math.abs(pool.color[i3] - gold[0]) < EPS &&
        Math.abs(pool.color[i3 + 1] - gold[1]) < EPS &&
        Math.abs(pool.color[i3 + 2] - gold[2]) < EPS
      ) {
        goldCount += 1;
      }
    }
    expect(goldCount).toBe(6);
  });

  test('a spark colour is a lerp between the recipe pair', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'spark', POINT, [0, 0, -1], seeded());
    const from = channels(IMPACT_RECIPES.spark.colorFrom);
    const to = channels(IMPACT_RECIPES.spark.colorTo);
    for (const index of liveIndices(pool)) {
      const i3 = index * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = pool.color[i3 + channel];
        const low = Math.min(from[channel], to[channel]);
        const high = Math.max(from[channel], to[channel]);
        expect(value).toBeGreaterThanOrEqual(low - EPS);
        expect(value).toBeLessThanOrEqual(high + EPS);
      }
    }
  });

  test('the default axis is +Z and a degenerate axis falls back to it', () => {
    expect(DEFAULT_IMPACT_DIRECTION).toEqual([0, 0, 1]);
    const pool = createImpactPool();
    spawnImpact(pool, 'spark', POINT, [0, 0, 0], seeded());
    for (const index of liveIndices(pool)) {
      expect(pool.velocity[index * 3 + 2]).toBeGreaterThan(0);
    }
  });

  test('repeated bursts leave the pool arrays identity untouched', () => {
    const pool = createImpactPool();
    const refs = [pool.position, pool.velocity, pool.color, pool.life, pool.gravity];
    for (let i = 0; i < 50; i += 1) {
      spawnImpact(pool, i % 3 === 0 ? 'crit' : 'spark', POINT, [0, 0, 1]);
    }
    expect([pool.position, pool.velocity, pool.color, pool.life, pool.gravity]).toEqual(refs);
    expect(pool.position.length).toBe(IMPACT_POOL_SIZE * 3);
  });
});

// ── §D GRAVITY / LIFE INTEGRATION ────────────────────────────────────────────
describe('CF-4 §D gravity and life integration', () => {
  const POINT: [number, number, number] = [0, 1.2, 0];
  const firstLive = (pool: ImpactPool): number => liveIndices(pool)[0];

  test('spark: velocity falls by −4 · dt per step and the burst dies at 0.35 s', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'spark', POINT, [0, 0, 1], seeded());
    const index = firstLive(pool);
    const before = pool.velocity[index * 3 + 1];
    integrateImpactPool(pool, 1 / 60);
    expect(pool.velocity[index * 3 + 1]).toBeCloseTo(before - 4 / 60, STORE);

    const timed = createImpactPool();
    spawnImpact(timed, 'spark', POINT, [0, 0, 1], seeded());
    step(timed, 20);
    expect(liveCount(timed)).toBe(14);
    step(timed, 2);
    expect(liveCount(timed)).toBe(0);
  });

  test('sand: velocity falls by −1.5 · dt per step and the burst dies at 0.5 s', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'sand', POINT, [0, 0, 1], seeded());
    const index = firstLive(pool);
    const before = pool.velocity[index * 3 + 1];
    integrateImpactPool(pool, 1 / 60);
    expect(pool.velocity[index * 3 + 1]).toBeCloseTo(before - 1.5 / 60, STORE);

    const timed = createImpactPool();
    spawnImpact(timed, 'sand', POINT, [0, 0, 1], seeded());
    step(timed, 29);
    expect(liveCount(timed)).toBe(10);
    step(timed, 3);
    expect(liveCount(timed)).toBe(0);
  });

  test('crit: gravity −4 and the whole 34-particle burst dies at 0.5 s', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'crit', POINT, [0, 0, 1], seeded());
    const index = firstLive(pool);
    const before = pool.velocity[index * 3 + 1];
    integrateImpactPool(pool, 1 / 60);
    expect(pool.velocity[index * 3 + 1]).toBeCloseTo(before - 4 / 60, STORE);

    const timed = createImpactPool();
    spawnImpact(timed, 'crit', POINT, [0, 0, 1], seeded());
    step(timed, 29);
    expect(liveCount(timed)).toBe(34);
    step(timed, 3);
    expect(liveCount(timed)).toBe(0);
  });

  test('position advances by velocity · dt (semi-implicit Euler)', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'spark', POINT, [0, 0, 1], seeded());
    const index = firstLive(pool);
    const i3 = index * 3;
    const dt = 1 / 60;
    // Rebuild what one step must produce, in the step's own order of operations.
    const vy = pool.velocity[i3 + 1] - 4 * dt;
    const expectedY = POINT[1] + vy * dt;
    integrateImpactPool(pool, dt);
    expect(pool.position[i3 + 1]).toBeCloseTo(expectedY, STORE);
    expect(pool.life[index]).toBeCloseTo(0.35 - dt, STORE);
  });

  test('gravity differs per particle, so sand and sparks share the pool', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'spark', POINT, [0, 0, 1], seeded());
    spawnImpact(pool, 'sand', POINT, [0, 0, 1], seeded());
    const gravities = new Set<number>();
    for (const index of liveIndices(pool)) gravities.add(pool.gravity[index]);
    expect([...gravities].sort((a, b) => a - b)).toEqual([-4, -1.5]);
  });
});

// ── §E DEAD PARTICLES ────────────────────────────────────────────────────────
describe('CF-4 §E dead particles parked at y = −10', () => {
  test('a fresh pool is entirely dead and parked', () => {
    const pool = createImpactPool();
    expect(liveCount(pool)).toBe(0);
    for (let i = 0; i < IMPACT_POOL_SIZE; i += 1) {
      expect(pool.position[i * 3 + 1]).toBe(IMPACT_PARKED_Y);
      expect(pool.life[i]).toBe(0);
    }
  });

  test('every particle is parked once the burst is spent', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'spark', [0, 5, 0], [0, 0, 1], seeded());
    step(pool, 25);
    expect(liveCount(pool)).toBe(0);
    for (let i = 0; i < IMPACT_POOL_SIZE; i += 1) {
      expect(pool.position[i * 3 + 1]).toBe(IMPACT_PARKED_Y);
    }
  });

  test('a spent burst frees its slots, and the next burst reuses them', () => {
    const pool = createImpactPool();
    spawnImpact(pool, 'spark', [0, 5, 0], [0, 0, 1], seeded());
    expect(liveCount(pool)).toBe(14);
    step(pool, 25);
    expect(liveCount(pool)).toBe(0);
    // The next burst lands entirely inside the same pre-allocated pool: 14 live
    // slots again, no growth, and no slot outside the budget.
    spawnImpact(pool, 'spark', [0, 5, 0], [0, 0, 1], seeded());
    expect(liveCount(pool)).toBe(14);
    expect(liveIndices(pool).every((index) => index >= 0 && index < IMPACT_POOL_SIZE)).toBe(true);
    expect(pool.position.length).toBe(IMPACT_POOL_SIZE * 3);
    // Two bursts' worth of slots can coexist without the pool growing.
    spawnImpact(pool, 'spark', [0, 5, 0], [0, 0, 1], seeded());
    expect(liveCount(pool)).toBe(28);
    expect(pool.life.length).toBe(IMPACT_POOL_SIZE);
  });

  test('an over-full pool recycles in place instead of growing', () => {
    const pool = createImpactPool();
    for (let i = 0; i < 12; i += 1) spawnImpact(pool, 'spark', [0, 1, 0], [0, 0, 1], seeded(i + 1));
    expect(liveCount(pool)).toBe(IMPACT_POOL_SIZE);
    expect(pool.position.length).toBe(IMPACT_POOL_SIZE * 3);
    expect(pool.velocity.length).toBe(IMPACT_POOL_SIZE * 3);
    expect(pool.color.length).toBe(IMPACT_POOL_SIZE * 3);
    // Recycled slots are live and inside the pool, never beyond it.
    for (let i = 0; i < IMPACT_POOL_SIZE; i += 1) expect(pool.life[i]).toBeGreaterThan(0);
  });
});

// ── §F ZERO PER-FRAME ALLOCATION ─────────────────────────────────────────────
describe('CF-4 §F the update path allocates nothing', () => {
  const POINT: [number, number, number] = [0, 1.2, 0];

  test('600 steps keep every array identity and the pool shape', () => {
    const pool = createImpactPool();
    const refs = {
      position: pool.position,
      velocity: pool.velocity,
      color: pool.color,
      life: pool.life,
      gravity: pool.gravity,
    };
    const sizes = [
      pool.position.byteLength,
      pool.velocity.byteLength,
      pool.color.byteLength,
      pool.life.byteLength,
      pool.gravity.byteLength,
    ];
    const keys = Object.keys(pool).sort();

    for (let frame = 0; frame < 600; frame += 1) {
      if (frame % 17 === 0) {
        spawnImpact(pool, frame % 2 === 0 ? 'spark' : 'sand', POINT, [0, 0, 1]);
      }
      integrateImpactPool(pool, 1 / 60);
    }

    expect(pool.position).toBe(refs.position);
    expect(pool.velocity).toBe(refs.velocity);
    expect(pool.color).toBe(refs.color);
    expect(pool.life).toBe(refs.life);
    expect(pool.gravity).toBe(refs.gravity);
    expect([
      pool.position.byteLength,
      pool.velocity.byteLength,
      pool.color.byteLength,
      pool.life.byteLength,
      pool.gravity.byteLength,
    ]).toEqual(sizes);
    // The loop added no field and grew no array.
    expect(Object.keys(pool).sort()).toEqual(keys);
  });

  test('integrateImpactPool carries no allocating construct', () => {
    const source = code(read('components/3d/ImpactParticles.tsx'));
    const start = source.indexOf('export function integrateImpactPool');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n}', start);
    const body = source.slice(start, end);
    expect(body.length).toBeGreaterThan(100);

    expect(body).not.toMatch(/\bnew\s/);
    expect(body).not.toMatch(/\[\s*\]/);
    expect(body).not.toMatch(/\{\s*\}/);
    expect(body).not.toMatch(/Float32Array\(/);
    expect(body).not.toMatch(/Array\(/);
    expect(body).not.toMatch(/\.(map|filter|slice|concat|push|reduce|forEach|splice)\(/);
    expect(body).not.toMatch(/Math\.random/);
    // It is a fixed-size walk over the pre-allocated pool.
    expect(body).toContain('i < IMPACT_POOL_SIZE');
  });

  test('the component keeps the pool in useMemo and holds no particle state', () => {
    const source = code(read('components/3d/ImpactParticles.tsx'));
    expect(source).toContain('const { points, pool } = useMemo(createImpactPoints, []);');
    expect(source.match(/useState/g)).toBeNull();
    expect(source).toContain('useImperativeHandle(');
    expect(source.match(/useFrame\(/g)?.length).toBe(1);
  });
});

// ── §G CALL-SITE WIRING ──────────────────────────────────────────────────────
describe('CF-4 §G the duel call sites', () => {
  const duel = read('components/duel/DuelScene.tsx');

  test('exactly four bursts: the three outcomes plus CF-6’s boss counter dust', () => {
    // REBASED (not weakened) by CF-6: the boss moment layer adds ONE call site —
    // Valéria's counter-dodge kicks up sand at her own position — so the four
    // calls are spark 1, crit 1, and sand 2 (one outcome, one boss-gated). The
    // outcome trio is still exactly one call per outcome, asserted below.
    expect(duel.match(/impactParticlesRef\.current\?\.burst\(/g)?.length).toBe(4);
    expect(duel.match(/\.burst\('spark'/g)?.length).toBe(1);
    expect(duel.match(/\.burst\('sand'/g)?.length).toBe(2);
    expect(duel.match(/\.burst\('crit'/g)?.length).toBe(1);
    // The fourth is the boss's, and it is behind CF-6's gate.
    const counter = duel.slice(
      duel.indexOf("if (bossPresentsMoment(opponent, 'counter_dodge'))"),
    );
    expect(counter.indexOf("burst('sand'")).toBeGreaterThan(-1);
  });

  test('blocked → spark, and only spark, inside the isBlocked branch', () => {
    const blockedStart = duel.indexOf('if (isBlocked) {\n              sounds.playBlock();');
    expect(blockedStart).toBeGreaterThan(-1);
    // The blocked branch runs to the crit branch's own guard; nested `} else {`
    // blocks inside it mean the branch cannot be sliced on the first `else`.
    const critGuard = duel.indexOf('if (isCrit) {', blockedStart);
    expect(critGuard).toBeGreaterThan(blockedStart);
    const blockedBlock = duel.slice(blockedStart, critGuard);
    expect(blockedBlock).toContain("burst('spark'");
    expect(blockedBlock).not.toContain("burst('sand'");
    expect(blockedBlock).not.toContain("burst('crit'");
  });

  test('crit → crit (instead of sand), unblocked → sand', () => {
    const critStart = duel.indexOf('if (isCrit) {');
    expect(critStart).toBeGreaterThan(-1);
    const critEnd = duel.indexOf('} else {', critStart);
    expect(critEnd).toBeGreaterThan(critStart);
    const critBlock = duel.slice(critStart, critEnd);
    expect(critBlock).toContain("burst('crit'");
    expect(critBlock).not.toContain("burst('sand'");

    const sandEnd = duel.indexOf('// Track stats', critEnd);
    expect(sandEnd).toBeGreaterThan(critEnd);
    const sandBlock = duel.slice(critEnd, sandEnd);
    expect(sandBlock).toContain("burst('sand'");
    expect(sandBlock).not.toContain("burst('crit'");
  });

  test('each burst is added beside its existing feedback line, replacing nothing', () => {
    // BLOCKED: existing block sound, chronicle entry and damage text remain.
    expect(duel).toContain('sounds.playBlock();');
    expect(duel).toContain('blockedStrikeLog(');
    const blockedText = "spawnDamageText(`BLOCKED -${rawDamage}`, 'blocked', defender.position);";
    expect(duel).toContain(blockedText);
    expect(duel.indexOf("burst('spark'")).toBeGreaterThan(duel.indexOf(blockedText));
    // CRIT: existing heavy-impact sound, log and damage text remain.
    expect(duel).toContain('sounds.playHeavyImpact();');
    expect(duel).toContain("addLog(strikeLine, 'crit');");
    const critText = "spawnDamageText(`-${rawDamage} CRIT!`, 'crit', defender.position);";
    expect(duel).toContain(critText);
    expect(duel.indexOf("burst('crit'")).toBeGreaterThan(duel.indexOf(critText));
    // NORMAL HIT: existing slash sound, log and damage text remain.
    expect(duel).toContain('sounds.playSlash();');
    expect(duel).toContain("addLog(strikeLine, isActorPlayer ? 'player' : 'opponent');");
    const hitText = "spawnDamageText(`-${rawDamage}`, 'damage', defender.position);";
    expect(duel).toContain(hitText);
    expect(duel.indexOf("burst('sand'")).toBeGreaterThan(duel.indexOf(hitText));
  });
  test('the handle is a ref and the impact point is the defender + 1.2 m', () => {
    expect(duel).toContain('const impactParticlesRef = useRef<ImpactParticlesHandle>(null);');
    expect(duel).not.toMatch(/useState[^\n]*[Pp]article/);
    expect(duel).toContain('defender.position[1] + 1.2,');
    // The cone axis is the blow's own direction along Z (away from the attacker).
    expect(duel).toContain('Math.sign(defender.position[2] - attacker.position[2]) || 1,');
  });

  test('the pool is mounted inside the Canvas’s existing Suspense boundary', () => {
    expect(duel).toContain(
      "import { ImpactParticles, type ImpactParticlesHandle } from '../3d/ImpactParticles';",
    );
    const open = duel.indexOf('<Suspense fallback={<CanvasLoadingFallback />}>');
    const mount = duel.indexOf('<ImpactParticles ref={impactParticlesRef} />');
    const close = duel.indexOf('</Suspense>', open);
    expect(open).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(open);
    expect(mount).toBeLessThan(close);
    // The mount is the only JSX use (`<ImpactParticlesHandle>` in the ref's type
    // is not a mount).
    expect(duel.match(/<ImpactParticles\s/g)?.length).toBe(1);
  });

  test('no other screen, scene or service mounts it — the duel is its only home', () => {
    const importers = sourceFiles()
      .filter((file) => file !== 'components/3d/ImpactParticles.tsx')
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .filter((file) => /from\s+'[^']*ImpactParticles'/.test(read(file)));
    expect(importers).toEqual(['components/duel/DuelScene.tsx']);
  });
});

// ── §H COMBAT OUTCOMES AND TIMING UNTOUCHED ──────────────────────────────────
describe('CF-4 §H combat outcomes and timing are unchanged', () => {
  const duel = read('components/duel/DuelScene.tsx');

  test('the hit-stop table and the resolution window are the shipped ones', () => {
    expect(duel).toMatch(/quick:\s*60,/);
    expect(duel).toMatch(/power:\s*110,/);
    expect(duel).toMatch(/crit:\s*170,/);
    expect(duel).toMatch(/blocked:\s*40,/);
    expect(duel).toMatch(/twin:\s*35,/);
    expect(duel).toMatch(/telegraphedHeavy:\s*200,/);
    // CF-5 replaced the fixed 1100 ms hold with the weight-scaled table, so the
    // resolution window is pinned through the shipped call instead.
    // C-8.70C rebased this pin (not weakened): the one scheduling call now passes
    // the bout mode, whose Sand default keeps the shipped table exact.
    expect(duel.match(/\}, turnResolutionMs\(actionType, fightEnded, boutMode\)\);/g)?.length).toBe(1);
  });

  test('the damage formula module knows nothing about particles', () => {
    const calculations = read('utils/combatCalculations.ts');
    expect(calculations).not.toMatch(/particle/i);
    expect(calculations).not.toMatch(/ImpactParticles/);
    expect(calculations).not.toMatch(/burst/);
  });

  test('each call is a fire-and-forget statement, never assigned or awaited', () => {
    // Four call sites since CF-6 (the boss counter-dodge dust is the fourth);
    // every one still a bare statement.
    const calls = duel.match(/[^\n]*impactParticlesRef\.current\?\.burst\([^\n]*/g) ?? [];
    expect(calls.length).toBe(4);
    for (const line of calls) {
      expect(line.trim().startsWith('impactParticlesRef.current?.burst(')).toBe(true);
      expect(line).not.toContain('await');
      expect(line).not.toContain('=');
    }
  });

  test('the wiring touches no combat state, timer or calculation', () => {
    // Declaration + the ref prop + the four call sites (CF-6 added the boss
    // counter-dodge's): nothing else.
    expect((duel.match(/impactParticlesRef/g) ?? []).length).toBe(6);
  });
});
