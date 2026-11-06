// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

import { ENEMY_CHARACTER_ASSETS } from './enemyCharacterAssets';

describe('shipped character GLB structural integrity', () => {
  test('every playable rigged character parses with a skinned mesh, joints, and animation clips', async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

    for (const [character, assetPath] of Object.entries(ENEMY_CHARACTER_ASSETS)) {
      const filePath = resolve(process.cwd(), 'public', assetPath.slice(1));
      const document = await io.readBinary(new Uint8Array(readFileSync(filePath)));
      const root = document.getRoot();
      const meshes = root.listMeshes();
      const skins = root.listSkins();
      const animations = root.listAnimations();
      const joints = skins.flatMap((skin) => skin.listJoints());
      const jointNames = joints.map((joint) => joint.getName()).filter(Boolean);
      const clipNames = animations.map((animation) => animation.getName()).filter(Boolean);
      // A GLB can contain both a mesh and a skin without actually binding them
      // together. The runtime needs at least one node that references both.
      const skinnedMeshNodes = root.listNodes().filter((node) => node.getMesh() && node.getSkin());

      // These are the exact named joints consumed by the current renderer for
      // hand attachment, body scaling, and damage placement.
      const requiredJoints = [
        'hand_l', 'hand_r', 'pelvis', 'spine_01',
        'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r',
      ];
      for (const name of requiredJoints) {
        expect(jointNames, `${character}: missing renderer joint ${name}`).toContain(name);
      }

      // One existing candidate per action category is sufficient because the
      // runtime resolver checks candidates in order. This prevents its generic
      // first-clip fallback from silently masking a missing combat animation.
      const requiredActionClips = [
        'Fighting_Idle', 'Walk', 'Sword_Attack', 'Sword_Regular_C',
        'Defend', 'Roll', 'Hit_Chest', 'Death_A',
      ];
      for (const name of requiredActionClips) {
        expect(clipNames, `${character}: missing action clip ${name}`).toContain(name);
      }
      expect(meshes.length, `${character}: expected at least one mesh`).toBeGreaterThan(0);
      expect(skins.length, `${character}: expected at least one skin`).toBeGreaterThan(0);
      expect(skinnedMeshNodes.length, `${character}: expected a node binding a mesh to a skin`).toBeGreaterThan(0);
      expect(joints.length, `${character}: expected at least one skin joint`).toBeGreaterThan(0);
      expect(animations.length, `${character}: expected at least one animation clip`).toBeGreaterThan(0);

      console.info(`[character-rig-audit] ${character}`, JSON.stringify({
        assetPath,
        meshes: meshes.length,
        skins: skins.length,
        skinnedMeshNodes: skinnedMeshNodes.length,
        joints: joints.length,
        animations: animations.length,
        jointNames,
        clipNames,
      }));
    }
  });
});
