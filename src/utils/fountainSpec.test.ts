/**
 * Plaza fountain replacement — scale, PBR breakdown and collider.
 *
 * Run with: bun test src/utils/fountainSpec.test.ts
 *
 * The imperial fountain replaced the old three-tier placeholder monument at the
 * centre of the forum plaza. Its real-world dimensions and material breakdown
 * live in `fountainSpec.ts` so the rendered build (`CivicFountain.tsx`) and the
 * 2D collision registry cannot drift apart; this suite pins both, plus the
 * modular assembly the brief requires (five parts under one root).
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FOUNTAIN_COLLISION, FOUNTAIN_PBR, FOUNTAIN_SPEC } from './fountainSpec';
import { CITY_COLLIDERS, PLAYER_RADIUS } from './collisionShapes';
import { resolveCityMovement } from './cityCollisions';

const fountainSource = readFileSync('src/components/3d/city/CivicFountain.tsx', 'utf8');
const avenueSource = readFileSync('src/components/3d/city/ProcessionAvenue.tsx', 'utf8');

const fountainCollider = CITY_COLLIDERS.find((collider) => collider.id === 'fountain');

describe('A. real-world scale (brief step D)', () => {
  test('total height, base diameter and statue height match the brief', () => {
    expect(FOUNTAIN_SPEC.totalHeight).toBe(6.5);
    expect(FOUNTAIN_SPEC.baseDiameter).toBe(8.0);
    expect(FOUNTAIN_SPEC.baseRadius * 2).toBe(FOUNTAIN_SPEC.baseDiameter);
    expect(FOUNTAIN_SPEC.statueHeight).toBe(2.2);
    expect(FOUNTAIN_SPEC.baseWallHeight).toBe(1.0);
  });

  test('the statue stands on the upper bowl and tops out at the total height', () => {
    expect(FOUNTAIN_SPEC.statueBaseY + FOUNTAIN_SPEC.statueHeight).toBeCloseTo(FOUNTAIN_SPEC.totalHeight, 6);
    // The statue starts inside the top basin, whose floor is 4.20, and its rim (4.52)
    // is above the statue's base — the emperor stands in the bowl, as in the hero art.
    expect(FOUNTAIN_SPEC.statueBaseY).toBeGreaterThan(4.2);
    expect(FOUNTAIN_SPEC.tiers.top.rimY).toBeGreaterThan(FOUNTAIN_SPEC.statueBaseY);
  });

  test('water surfaces sit below their basin rims and inside their walls', () => {
    expect(FOUNTAIN_SPEC.water.base.y).toBeLessThan(FOUNTAIN_SPEC.baseWallTop);
    expect(FOUNTAIN_SPEC.water.middle.y).toBeLessThan(FOUNTAIN_SPEC.tiers.middle.rimY);
    expect(FOUNTAIN_SPEC.water.top.y).toBeLessThan(FOUNTAIN_SPEC.tiers.top.rimY);
    expect(FOUNTAIN_SPEC.water.base.radius).toBeLessThan(FOUNTAIN_SPEC.baseRadius);
    expect(FOUNTAIN_SPEC.water.middle.radius).toBeLessThan(FOUNTAIN_SPEC.tiers.middle.radius);
    expect(FOUNTAIN_SPEC.water.top.radius).toBeLessThan(FOUNTAIN_SPEC.tiers.top.radius);
  });

  test('the tiers stack without passing each other', () => {
    const { water, tiers, baseWallTop } = FOUNTAIN_SPEC;
    expect(baseWallTop).toBeLessThan(water.middle.y);
    expect(water.middle.y).toBeLessThan(tiers.middle.rimY);
    expect(tiers.middle.rimY).toBeLessThan(tiers.top.rimY);
    expect(tiers.top.rimY).toBeLessThan(FOUNTAIN_SPEC.statueBaseY + FOUNTAIN_SPEC.statueHeight);
  });
});

describe('B. PBR breakdown (brief step C)', () => {
  test('marble is a dielectric at the sheet roughness values', () => {
    expect(FOUNTAIN_PBR.polishedMarble.roughness).toBe(0.3);
    expect(FOUNTAIN_PBR.polishedMarble.metalness).toBe(0.0);
    expect(FOUNTAIN_PBR.weatheredMarble.roughness).toBe(0.75);
    expect(FOUNTAIN_PBR.weatheredMarble.metalness).toBe(0.0);
  });

  test('water and the bronze statue variant follow the sheet', () => {
    expect(FOUNTAIN_PBR.water.roughness).toBe(0.08);
    expect(FOUNTAIN_PBR.water.metalness).toBe(0.0);
    expect(FOUNTAIN_PBR.bronzePatina.metalness).toBe(1.0);
    expect(FOUNTAIN_PBR.bronzePatina.roughness).toBeGreaterThanOrEqual(0.55);
    expect(FOUNTAIN_PBR.bronzePatina.roughness).toBeLessThanOrEqual(0.7);
  });
});

describe('C. collision (brief step D: one cylinder, no mesh collider)', () => {
  test('the registered cylinder is the base, at the spec radius', () => {
    expect(fountainCollider).toMatchObject({ type: 'circle', id: 'fountain', cx: 0, cz: 0 });
    expect(fountainCollider?.type === 'circle' && fountainCollider.r).toBe(FOUNTAIN_SPEC.baseRadius);
    expect(FOUNTAIN_COLLISION.base.radius).toBe(FOUNTAIN_SPEC.baseRadius);
    expect(FOUNTAIN_COLLISION.base.height).toBe(FOUNTAIN_SPEC.baseWallHeight);
    expect(CITY_COLLIDERS.filter((collider) => collider.id === 'fountain')).toHaveLength(1);
  });

  test('upper tiers are recorded but lie inside the base footprint', () => {
    expect(FOUNTAIN_COLLISION.tiers.length).toBe(2);
    for (const tier of FOUNTAIN_COLLISION.tiers) {
      // A 2D resolver at ground level can never be reached by these boxes.
      expect(tier.halfExtent).toBeLessThan(FOUNTAIN_SPEC.baseRadius);
      expect(tier.baseY).toBeGreaterThan(FOUNTAIN_SPEC.baseWallHeight);
    }
  });

  test('the real resolver stops a player at the new 4 m radius', () => {
    const boundary = FOUNTAIN_SPEC.baseRadius + PLAYER_RADIUS;
    const blocked = resolveCityMovement([5, 0, 0], -1, 0, 3.8, 0.5);
    expect(blocked[0]).toBeGreaterThanOrEqual(boundary);
    // Walking out of the boundary is always allowed.
    const free = resolveCityMovement([boundary + 0.1, 0, 0], 1, 0, 3.8, 0.5);
    expect(free[0]).toBeGreaterThan(boundary + 0.1);
  });
});

describe('D. the assembly is modular and the plaza mounts it', () => {
  test('five separable parts hang from one root', () => {
    for (const part of ['FountainBasePool', 'FountainColumnTier', 'FountainTopBasin', 'FountainStatue', 'FountainWater']) {
      expect(fountainSource).toContain(`export const ${part}`);
      expect(fountainSource).toContain(`<${part}`);
    }
    expect(fountainSource).toContain('name="Fountain_Root"');
    expect(fountainSource).toContain('export const CivicFountain');
  });

  test('every repeated ornament is instanced rather than duplicated', () => {
    expect(fountainSource).toContain('THREE.InstancedMesh');
    expect(fountainSource).toContain('computeBoundingSphere');
    // No per-ornament JSX loops: the file uses instancing for the repetitions.
    expect(fountainSource).not.toContain('.map((angle) => (\n      <mesh');
  });

  test('the plaza mounts the new fountain and the old monument is gone', () => {
    expect(avenueSource).toContain('<CivicFountain />');
    expect(avenueSource).toContain("import { CivicFountain } from './CivicFountain';");
    expect(avenueSource).not.toContain('CENTRAL PLAZA MONUMENTAL NAVE FOUNTAIN');
    expect(avenueSource).not.toContain('Tier 1 - Outer Marble Water Basin');
  });
});
