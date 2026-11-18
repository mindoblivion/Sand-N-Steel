/**
 * Resolve whether a wait surface can display a measured Three.js asset percentage.
 *
 * The global loader retains its last progress/count after a request completes.
 * React.lazy/Suspense can then wait for a screen chunk while that old count still
 * exists. Only an actively running loader represents work for the current wait.
 */
export function resolveWaitSurfaceProgress(
  active: boolean,
  total: number,
  progress: number,
): { knowsCount: boolean; pct: number } {
  const knowsCount = active && Number.isFinite(total) && total > 0 && Number.isFinite(progress);
  return {
    knowsCount,
    pct: knowsCount ? Math.min(100, Math.max(0, Math.round(progress))) : 0,
  };
}
