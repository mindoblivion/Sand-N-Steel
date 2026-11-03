/**
 * Temporary evidence probe for the gladiator appearance phase.
 * Reads the shipped humanoid GLB without mutating it or the save.
 * Remove after the rig/geometry decision is recorded.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

test('report shipped gladiator geometry and rig capabilities', async () => {
  const path = fileURLToPath(new URL('../../public/models/arena_roman.glb', import.meta.url));
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(
    new Uint8Array(readFileSync(path)),
  );
  const root = doc.getRoot();
  const meshes = root.listMeshes().map((mesh) => ({
    name: mesh.getName(),
    primitives: mesh.listPrimitives().map((primitive) => ({
      morphTargets: primitive.listTargets().map((target) => target.getName()),
      semantics: Object.keys(primitive.listAttributes().reduce((out, attr) => {
        out[attr.getName()] = true;
        return out;
      }, {} as Record<string, boolean>)),
    })),
  }));
  const skins = root.listSkins().map((skin) => ({
    name: skin.getName(),
    joints: skin.listJoints().map((joint) => joint.getName()),
  }));
  const scaleAnimationTargets = root.listAnimations().flatMap((animation) =>
    animation.listChannels()
      .filter((channel) => channel.getTargetPath() === 'scale')
      .map((channel) => ({
        animation: animation.getName(),
        node: channel.getTargetNode()?.getName() ?? null,
      })),
  );
  const nodes = root.listNodes().map((node) => ({
    name: node.getName(),
    mesh: node.getMesh()?.getName() ?? null,
    skin: node.getSkin()?.getName() ?? null,
    scale: node.getScale(),
    translation: node.getTranslation(),
  }));
  console.log('GLADIATOR_APPEARANCE_AUDIT ' + JSON.stringify({
    meshes: meshes.length,
    morphTargetCount: meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, primitive) => n + primitive.morphTargets.length, 0), 0),
    meshDetails: meshes,
    skins,
    scaleAnimationTargets,
    nodes,
  }));
  expect(root.listSkins().length).toBeGreaterThan(0);
});
