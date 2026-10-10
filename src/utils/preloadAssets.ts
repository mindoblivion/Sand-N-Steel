import { useGLTF } from '@react-three/drei';

/**
 * Core 3D Model Asset Registry
 * Central registry for all key 3D glTF/GLB models used across the Sand & Steel Gladiator RPG.
 */
export const CORE_3D_ASSETS = [
  '/models/arena_roman.glb',
] as const;

export type Core3DAssetPath = typeof CORE_3D_ASSETS[number];

let isPreloaded = false;

/**
 * Preload core game assets into Drei/Three.js memory cache.
 * Triggers right after the player clicks on the Title Screen to start or continue,
 * ensuring models, geometry buffers, and textures are warm in GPU/browser memory
 * prior to rendering the 3D City Hub or Colosseum duel arena.
 */
export function preloadCoreGameAssets(): void {
  if (isPreloaded) return;
  isPreloaded = true;

  try {
    for (const assetPath of CORE_3D_ASSETS) {
      // Drei useGLTF.preload queues the fetch and parses the buffer into Three.js cache
      useGLTF.preload(assetPath);
    }
  } catch (err) {
    console.warn('[AssetPreloader] Warning during 3D asset preloading:', err);
  }
}

/**
 * Returns whether preloading has been triggered
 */
export function hasTriggeredPreload(): boolean {
  return isPreloaded;
}
