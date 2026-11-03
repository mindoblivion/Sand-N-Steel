export const CORE_3D_ASSETS = ['/models/arena_roman.glb'] as const;
export type Core3DAssetPath = typeof CORE_3D_ASSETS[number];
export const PRELOAD_STAGES = { 1: CORE_3D_ASSETS, 2: CORE_3D_ASSETS } as const;
export type PreloadStage = keyof typeof PRELOAD_STAGES;

type DreiPreloadModule = { useGLTF: { preload: (assetPath: string) => void } };
type DreiLoader = () => Promise<DreiPreloadModule>;
const loadDrei: DreiLoader = () => import('@react-three/drei');
const triggered: Record<PreloadStage, boolean> = { 1: false, 2: false };

/** Load Drei only when a preload is requested, keeping its 3D runtime out of the initial application chunk. */
export function preloadAssetsForStage(stage: PreloadStage, loadModule: DreiLoader = loadDrei): void {
  if (triggered[stage]) return;
  triggered[stage] = true;
  void loadModule()
    .then(({ useGLTF }) => {
      for (const assetPath of PRELOAD_STAGES[stage]) useGLTF.preload(assetPath);
    })
    .catch((err: unknown) => {
      // Permit a later title/tap event to retry after transient chunk or asset failures.
      triggered[stage] = false;
      console.warn('[AssetPreloader] Warning during 3D asset preloading:', err);
    });
}
export function preloadTitleStage(): void { preloadAssetsForStage(1); }
export function preloadTapStage(): void { preloadAssetsForStage(2); }
export function hasTriggeredPreload(): boolean { return triggered[1] || triggered[2]; }
