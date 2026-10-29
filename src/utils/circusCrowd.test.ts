// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import * as THREE from 'three';
import {
  CIRCUS_ARENA_POSITION,
  CIRCUS_CROWD_BODY_SIZE,
  CIRCUS_CROWD_COUNT,
  CIRCUS_CROWD_HEAD_COLORS,
  CIRCUS_CROWD_HEAD_SIZE,
  CIRCUS_CROWD_PER_RING,
  CIRCUS_CROWD_RINGS,
  CIRCUS_CROWD_SCALE_MAX,
  CIRCUS_CROWD_SCALE_MIN,
  CIRCUS_CROWD_SEED,
  CIRCUS_CROWD_TUNIC_COLORS,
  buildCircusCrowdPlacement,
  circusLocalToWorld,
  createCircusCrowdMeshes,
  isCarceresSectorLocal,
} from '../components/3d/city/CircusCrowd';

/** AI-2's eight tunic colours, verbatim from DuelArena's CROWD_TUNIC_COLORS. */
const AI2_TUNIC_COLORS = [
  '#991b1b',
  '#f5f5f4',
  '#78350f',
  '#b45309',
  '#e5e5e5',
  '#3f3a34',
  '#8a6f4d',
  '#5b6b7a',
] as const;

// EastCircusArena's documented world measurements.
const SHELL = { xMin: 38.38, xMax: 66.3, yMin: 0, yMax: 4.06, zMin: -30.157, zMax: 43.8 };
const TRACK = { xMin: 43.94, xMax: 60.74, zMin: -24.6, zMax: 43.8 };
const CARCERES = { xMin: 43.34, xMax: 61.34, zMin: 43.8, zMax: 46.0 };

const closeTo = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

describe('CM-1 Circus Crowd literals', () => {
  test('seed is 7', () => {
    expect(CIRCUS_CROWD_SEED).toBe(7);
  });

  test('count is 600 across 5 rings of 120', () => {
    expect(CIRCUS_CROWD_COUNT).toBe(600);
    expect(CIRCUS_CROWD_RINGS).toBe(5);
    expect(CIRCUS_CROWD_PER_RING).toBe(120);
  });

  test('tunic colours are AI-2\u2019s eight, verbatim', () => {
    expect([...CIRCUS_CROWD_TUNIC_COLORS]).toEqual([...AI2_TUNIC_COLORS]);
    expect(CIRCUS_CROWD_TUNIC_COLORS.length).toBe(8);
  });

  test('geometry dims: bodies 1.2x1.4x0.8, heads 0.55^3', () => {
    expect([...CIRCUS_CROWD_BODY_SIZE]).toEqual([1.2, 1.4, 0.8]);
    expect([...CIRCUS_CROWD_HEAD_SIZE]).toEqual([0.55, 0.55, 0.55]);
  });

  test('scale envelope is 0.92..1.08', () => {
    expect(CIRCUS_CROWD_SCALE_MIN).toBe(0.92);
    expect(CIRCUS_CROWD_SCALE_MAX).toBe(1.08);
  });
});

describe('circusLocalToWorld', () => {
  test('the arena origin maps to its documented position', () => {
    const [x, y, z] = circusLocalToWorld([0, 0, 0]);
    expect(closeTo(x, 52.34)).toBe(true);
    expect(closeTo(y, 0)).toBe(true);
    expect(closeTo(z, 43.8)).toBe(true);
  });

  test('yaw PI/2: local +X runs toward -worldZ (the track far end)', () => {
    // localX 342 = the track's far end -> world Z -24.6 (documented).
    const [, , z] = circusLocalToWorld([342, 0, 0]);
    expect(closeTo(z, -24.6, 1e-6)).toBe(true);
  });

  test('local +Z runs toward +worldX (the track transverse edge)', () => {
    // localZ 42 = the track's transverse edge -> world X 60.74 (documented).
    const [x] = circusLocalToWorld([0, 0, 42]);
    expect(closeTo(x, 60.74, 1e-6)).toBe(true);
  });

  test('the carceres block maps onto its documented footprint', () => {
    // localX -11..0 -> world Z 43.8..46.0 (documented carceres Z range).
    const [, , z0] = circusLocalToWorld([0, 0, 0]);
    const [, , z1] = circusLocalToWorld([-11, 0, 0]);
    expect(closeTo(z0, 43.8, 1e-6)).toBe(true);
    expect(closeTo(z1, 46.0, 1e-6)).toBe(true);
  });

  test('uses the arena constants', () => {
    expect([...CIRCUS_ARENA_POSITION]).toEqual([52.34, 0.0, 43.8]);
  });
});

describe('buildCircusCrowdPlacement', () => {
  const spectators = buildCircusCrowdPlacement();

  test('places exactly 600 spectators', () => {
    expect(spectators.length).toBe(600);
  });

  test('is deterministic', () => {
    expect(buildCircusCrowdPlacement()).toEqual(spectators);
  });

  test('fills five rings of 120', () => {
    for (let r = 0; r < 5; r += 1) {
      expect(spectators.filter((s) => s.ring === r).length).toBe(120);
    }
  });

  test('ring heights follow y = 0.5 + r*0.75', () => {
    for (const s of spectators) {
      expect(s.localY).toBeCloseTo(0.5 + s.ring * 0.75, 12);
      expect(s.y).toBeCloseTo((0.5 + s.ring * 0.75) * 0.2, 12);
    }
  });

  test('world positions are the local positions through circusLocalToWorld', () => {
    for (const s of spectators) {
      const [x, y, z] = circusLocalToWorld([s.localX, s.localY, s.localZ]);
      expect(s.x).toBeCloseTo(x, 12);
      expect(s.y).toBeCloseTo(y, 12);
      expect(s.z).toBeCloseTo(z, 12);
    }
  });

  test('every spectator is inside the shell', () => {
    for (const s of spectators) {
      expect(s.x).toBeGreaterThanOrEqual(SHELL.xMin);
      expect(s.x).toBeLessThanOrEqual(SHELL.xMax);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(4.5);
      expect(s.z).toBeGreaterThanOrEqual(SHELL.zMin);
      expect(s.z).toBeLessThanOrEqual(SHELL.zMax);
    }
  });

  test('no spectator stands on the track', () => {
    for (const s of spectators) {
      const onTrack =
        s.x >= TRACK.xMin && s.x <= TRACK.xMax && s.z >= TRACK.zMin && s.z <= TRACK.zMax;
      expect(onTrack).toBe(false);
    }
  });

  test('no spectator is in the carceres sector', () => {
    for (const s of spectators) {
      // The brief's world-Z cut, 40.0, sits ahead of the carceres (43.8..46.0).
      expect(s.z).toBeLessThanOrEqual(40.0);
      const onCarceres =
        s.x >= CARCERES.xMin &&
        s.x <= CARCERES.xMax &&
        s.z >= CARCERES.zMin &&
        s.z <= CARCERES.zMax;
      expect(onCarceres).toBe(false);
      expect(isCarceresSectorLocal(s.localX)).toBe(false);
    }
  });

  test('dress comes from the seeded palette', () => {
    const tunics = new Set<string>(AI2_TUNIC_COLORS);
    const heads = new Set<string>(CIRCUS_CROWD_HEAD_COLORS);
    for (const s of spectators) {
      expect(tunics.has(s.tunic)).toBe(true);
      expect(heads.has(s.head)).toBe(true);
      expect(s.scale).toBeGreaterThanOrEqual(0.92);
      expect(s.scale).toBeLessThanOrEqual(1.08);
      expect(s.yaw).toBeGreaterThanOrEqual(0);
      expect(s.yaw).toBeLessThan(Math.PI * 2);
    }
  });
});

describe('createCircusCrowdMeshes', () => {
  test('builds exactly two InstancedMeshes — bodies, then heads', () => {
    const meshes = createCircusCrowdMeshes();
    expect(Object.keys(meshes).sort()).toEqual(['bodies', 'heads']);
    expect(meshes.bodies).toBeInstanceOf(THREE.InstancedMesh);
    expect(meshes.heads).toBeInstanceOf(THREE.InstancedMesh);
  });

  test('each mesh holds 600 instances with castShadow off', () => {
    const { bodies, heads } = createCircusCrowdMeshes();
    for (const mesh of [bodies, heads]) {
      expect(mesh.count).toBe(600);
      expect(mesh.castShadow).toBe(false);
    }
  });

  test('geometries match the brief dims', () => {
    const { bodies, heads } = createCircusCrowdMeshes();
    const bb = (bodies.geometry as THREE.BoxGeometry).parameters as { width: number; height: number; depth: number };
    const hb = (heads.geometry as THREE.BoxGeometry).parameters as { width: number; height: number; depth: number };
    expect([bb.width, bb.height, bb.depth]).toEqual([1.2, 1.4, 0.8]);
    expect([hb.width, hb.height, hb.depth]).toEqual([0.55, 0.55, 0.55]);
  });

  test('per-instance colours are set', () => {
    const { bodies, heads } = createCircusCrowdMeshes();
    expect(bodies.instanceColor).not.toBeNull();
    expect(heads.instanceColor).not.toBeNull();
    expect(bodies.instanceColor!.count).toBe(600);
    expect(heads.instanceColor!.count).toBe(600);
  });
});
