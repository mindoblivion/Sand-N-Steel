/**
 * Decide whether the global Three.js loading overlay should be visible.
 *
 * useProgress starts idle at 0%, which is not a loading event. A completed
 * 100% result is retained by Drei after onLoad, so keep it visible briefly
 * for the fade-out; active work always takes precedence over stale progress.
 */
export function resolveAssetLoadingOverlayVisibility(
  active: boolean,
  progress: number,
  hasErrors: boolean,
): { shouldRender: boolean; assetsLoaded: boolean } {
  if (hasErrors) return { shouldRender: true, assetsLoaded: false };
  if (active) return { shouldRender: true, assetsLoaded: false };
  if (Number.isFinite(progress) && progress >= 99) {
    return { shouldRender: true, assetsLoaded: true };
  }
  return { shouldRender: false, assetsLoaded: false };
}
