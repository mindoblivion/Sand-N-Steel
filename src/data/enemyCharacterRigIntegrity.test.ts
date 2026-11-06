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

      // Keep this structural gate deliberately separate from renderer compatibility:
      // exact grip bones, physique bones, and action-name mapping need their own audit.
      expect(meshes.length, `${character}: expected at least one mesh`).toBeGreaterThan(0);
      expect(skins.length, `${character}: expected at least one skin`).toBeGreaterThan(0);
      expect(joints.length, `${character}: expected at least one skin joint`).toBeGreaterThan(0);
      expect(animations.length, `${character}: expected at least one animation clip`).toBeGreaterThan(0);

      console.info(`[character-rig-audit] ${character}`, JSON.stringify({
        assetPath,
        meshes: meshes.length,
        skins: skins.length,
        joints: joints.length,
        animations: animations.length,
        jointNames,
        clipNames,
      }));
    }
  });
});
