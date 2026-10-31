// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import * as THREE from 'three';
import {
  ARENA_CROWD_SILHOUETTE_COUNT,
  buildArenaCrowdSilhouettePlacement,
  fillArenaCrowdInstances,
} from '../components/3d/DuelArena';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('../components/3d/DuelArena.tsx', import.meta.url)),
  'utf8',
);

describe('arena crowd instancing', () => {
  test('keeps all 56 original silhouettes in their original order', () => {
    const crowd = buildArenaCrowdSilhouettePlacement();
    expect(ARENA_CROWD_SILHOUETTE_COUNT).toBe(56);
    expect(crowd).toHaveLength(56);
    expect(crowd[0]).toEqual({
      position: [22.2, 7.8, 0],
      size: [1.2, 1.4, 0.8],
      color: '#991b1b',
    });
    expect(crowd[1]).toEqual({
      position: [25.8, 11.2, 0],
      size: [1.4, 1.5, 0.8],
      color: '#b45309',
    });
    const angle = (1 / 28) * Math.PI * 2;
    expect(crowd[2].position[0]).toBeCloseTo(Math.cos(angle) * 22.2, 12);
    expect(crowd[2].position[2]).toBeCloseTo(Math.sin(angle) * 22.2, 12);
    expect(crowd[2].color).toBe('#78350f');
    expect(crowd[3].color).toBe('#e5e5e5');
  });

  test('placement is deterministic and finite', () => {
    const first = buildArenaCrowdSilhouettePlacement();
    const second = buildArenaCrowdSilhouettePlacement();
    expect(second).toEqual(first);
    for (const spectator of first) {
      expect(spectator.position.every(Number.isFinite)).toBe(true);
      expect(spectator.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    }
  });

  test('fills one 56-instance mesh with the original transforms and colours', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geometry, material, ARENA_CROWD_SILHOUETTE_COUNT);
    try {
      fillArenaCrowdInstances(mesh, buildArenaCrowdSilhouettePlacement());
      expect(mesh.count).toBe(56);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.frustumCulled).toBe(false);

      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      mesh.getMatrixAt(0, matrix);
      matrix.decompose(position, rotation, scale);
      expect(position.x).toBeCloseTo(22.2, 5);
      expect(position.y).toBeCloseTo(7.8, 5);
      expect(position.z).toBeCloseTo(0, 5);
      expect(scale.x).toBeCloseTo(1.2, 5);
      expect(scale.y).toBeCloseTo(1.4, 5);
      expect(scale.z).toBeCloseTo(0.8, 5);

      const color = new THREE.Color();
      mesh.getColorAt(0, color);
      expect(color.getHexString()).toBe('991b1b');
      mesh.getColorAt(1, color);
      expect(color.getHexString()).toBe('b45309');
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });

  test('DuelArena renders the crowd as one instanced mesh, not 56 separate meshes', () => {
    expect(source).toContain('<instancedMesh');
    expect(source).toContain('<ArenaCrowd />');
    expect(source).not.toContain('Array.from({ length: 28 })');
    expect(source).not.toContain('key={`crowd-${ci}`}');
  });
});
