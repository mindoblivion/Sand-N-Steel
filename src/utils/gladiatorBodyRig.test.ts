// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getGladiatorBodyRigProfile } from './gladiatorBodyRig';

describe('gladiator body rig profile', () => {
  test('legacy and invalid weight resolve to the neutral rig', () => {
    expect(getGladiatorBodyRigProfile(undefined)).toEqual({ coreScale: 1, limbScale: 1 });
    expect(getGladiatorBodyRigProfile(Number.NaN)).toEqual({ coreScale: 1, limbScale: 1 });
  });

  test('light builds subtly reduce transverse core and limb width only', () => {
    const profile = getGladiatorBodyRigProfile(140);
    expect(profile.coreScale).toBe(0.985);
    expect(profile.limbScale).toBe(0.975);
    expect(profile.coreScale).toBeLessThan(1);
    expect(profile.limbScale).toBeLessThan(1);
  });

  test('heavy builds broaden core and limbs without changing segment length', () => {
    const profile = getGladiatorBodyRigProfile(300);
    expect(profile.coreScale).toBe(1.035);
    expect(profile.limbScale).toBe(1.06);
    expect(profile.coreScale).toBeGreaterThan(1);
    expect(profile.limbScale).toBeGreaterThan(1);
  });

  test('body profile is monotonic and bounded by normalized weight', () => {
    const light = getGladiatorBodyRigProfile(160);
    const neutral = getGladiatorBodyRigProfile(180);
    const heavy = getGladiatorBodyRigProfile(240);
    expect(light.coreScale).toBeLessThan(neutral.coreScale);
    expect(neutral.coreScale).toBeLessThan(heavy.coreScale);
    expect(light.limbScale).toBeLessThan(neutral.limbScale);
    expect(neutral.limbScale).toBeLessThan(heavy.limbScale);
    expect(getGladiatorBodyRigProfile(1)).toEqual(getGladiatorBodyRigProfile(140));
    expect(getGladiatorBodyRigProfile(900)).toEqual(getGladiatorBodyRigProfile(300));
  });
});

test('the shipped humanoid rig supports transverse-only appearance deformation', async () => {
  const path = fileURLToPath(new URL('../../public/models/arena_roman.glb', import.meta.url));
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(
    new Uint8Array(readFileSync(path)),
  );
  const root = doc.getRoot();
  expect(root.listSkins()).toHaveLength(1);
  expect(root.listSkins()[0].listJoints()).toHaveLength(66);
  const morphTargets = root.listMeshes().flatMap((mesh) =>
    mesh.listPrimitives().flatMap((primitive) => primitive.listTargets()),
  );
  expect(morphTargets).toHaveLength(0);
  const scaleTracks = root.listAnimations().flatMap((animation) =>
    animation.listChannels().filter((channel) => channel.getTargetPath() === 'scale'),
  );
  expect(root.listAnimations()).toHaveLength(178);
  expect(scaleTracks).toHaveLength(0);
});
