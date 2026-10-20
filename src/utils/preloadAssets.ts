import { useGLTF } from '@react-three/drei';

/**
 * Core 3D Model Asset Registry
 * Central registry for all key 3D glTF/GLB models used across the Sand & Steel Gladiator RPG.
 */
// Only the default character model is preloaded at startup. The four
// alternative character models (amazonian, netfighter, minotaur, dimachaerus)
// load on demand via useGLTF(modelUrl) when their archetype is selected.
export const CORE_3D_ASSETS = [
  '/models/arena_roman.glb',
] as const;

export type Core3DAssetPath = typeof CORE_3D_ASSETS[number];

/**
 * START-1 — the two-stage preload. WIRING ONLY.
 *
 * The startup sequence warms the 3D payload in two beats instead of one: stage 1 when
 * the title mounts (the player is reading the title, not waiting), stage 2 on the
 * Play/Continue tap (the player has committed, and the destination is loading).
 *
 * The TIER CONTENTS do not change in this slice — both stages read the same
 * `CORE_3D_ASSETS` list they always did, so what is fetched, and when the fetch starts
 * relative to the title, is what a later slice's tier split will actually decide.
 */
export const PRELOAD_STAGES = {
  1: CORE_3D_ASSETS,
  2: CORE_3D_ASSETS,
} as const;

export type PreloadStage = keyof typeof PRELOAD_STAGES;

const triggered: Record<PreloadStage, boolean> = { 1: false, 2: false };

/**
 * Warm one preload stage into Drei/Three.js cache. Idempotent per stage, so a
 * remounted title (or a tap after a previous tap) cannot queue the same work twice.
 */
export function preloadAssetsForStage(stage: PreloadStage): void {
  if (triggered[stage]) return;
  triggered[stage] = true;

  try {
    for (const assetPath of PRELOAD_STAGES[stage]) {
      // Drei useGLTF.preload queues the fetch and parses the buffer into Three.js cache
      useGLTF.preload(assetPath);
    }
  } catch (err) {
    console.warn('[AssetPreloader] Warning during 3D asset preloading:', err);
  }
}

/** Stage 1 — at title mount. */
export function preloadTitleStage(): void {
  preloadAssetsForStage(1);
}

/** Stage 2 — on the Play/Continue tap. */
export function preloadTapStage(): void {
  preloadAssetsForStage(2);
}

/**
 * Returns whether any preload stage has been triggered
 */
export function hasTriggeredPreload(): boolean {
  return triggered[1] || triggered[2];
}
