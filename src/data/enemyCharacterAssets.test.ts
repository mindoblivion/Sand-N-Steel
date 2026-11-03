// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ENEMY_CHARACTER_ASSETS,
  getEnemyCharacterAsset,
} from './enemyCharacterAssets';

describe('enemy character asset catalogue', () => {
  test('maps every rigged character model key to its shipped GLB', () => {
    expect(ENEMY_CHARACTER_ASSETS).toEqual({
      roman_warrior: '/models/arena_roman.glb',
      amazonian: '/models/amazonian.glb',
      retiarius: '/models/netfighter.glb',
      minotaur: '/models/minotaur.glb',
      dimachaerus: '/models/dimachaerus.glb',
    });
  });

  test('every catalogue entry resolves to a tracked public asset', () => {
    for (const assetPath of Object.values(ENEMY_CHARACTER_ASSETS)) {
      expect(existsSync(resolve(process.cwd(), 'public', assetPath.slice(1)))).toBe(true);
    }
  });

  test('resolves known opponent keys without changing their identity', () => {
    for (const [model, assetPath] of Object.entries(ENEMY_CHARACTER_ASSETS)) {
      expect(getEnemyCharacterAsset(model as keyof typeof ENEMY_CHARACTER_ASSETS)).toBe(assetPath);
    }
  });

  test('uses the known Roman rig for procedural, absent, and invalid runtime keys', () => {
    expect(getEnemyCharacterAsset('procedural_gladiator')).toBe('/models/arena_roman.glb');
    expect(getEnemyCharacterAsset(undefined)).toBe('/models/arena_roman.glb');
    expect(getEnemyCharacterAsset(null)).toBe('/models/arena_roman.glb');
    expect(getEnemyCharacterAsset('not-a-model' as never)).toBe('/models/arena_roman.glb');
  });
});
