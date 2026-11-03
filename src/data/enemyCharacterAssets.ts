import type { CharacterModelType } from '../types/game';

/**
 * The shipped rigged character assets that may be assigned to an opponent.
 *
 * Keep this catalogue separate from player appearance/customization data:
 * an opponent's model is selected by its own FighterState.characterModel key.
 * Alternative models remain demand-loaded by GladiatorMesh; this module only
 * resolves a stable key to a public asset path and does not preload anything.
 */
export type EnemyGlbModelType = Exclude<CharacterModelType, 'procedural_gladiator'>;

export const ENEMY_CHARACTER_ASSETS: Readonly<Record<EnemyGlbModelType, string>> = {
  roman_warrior: '/models/arena_roman.glb',
  amazonian: '/models/amazonian.glb',
  retiarius: '/models/netfighter.glb',
  minotaur: '/models/minotaur.glb',
  dimachaerus: '/models/dimachaerus.glb',
};

/** Resolve an opponent model key. Unknown/absent keys safely use the Roman rig. */
export function getEnemyCharacterAsset(model: CharacterModelType | null | undefined): string {
  if (model && model !== 'procedural_gladiator' && Object.prototype.hasOwnProperty.call(ENEMY_CHARACTER_ASSETS, model)) {
    return ENEMY_CHARACTER_ASSETS[model];
  }
  return ENEMY_CHARACTER_ASSETS.roman_warrior;
}
