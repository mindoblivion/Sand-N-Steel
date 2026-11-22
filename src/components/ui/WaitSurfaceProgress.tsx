import React from 'react';
import { useProgress } from '@react-three/drei/core/Progress';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { resolveWaitSurfaceProgress } from './waitSurfaceProgress';

function reload(): void {
  try {
    window.location.reload();
  } catch {
    // fallback
  }
}

/** The Drei-backed portion is loaded only while a destination wait surface is mounted. */
export const WaitSurfaceProgress: React.FC = () => {
  const { active, progress, loaded, total, errors } = useProgress();
  const hasErrors = errors && errors.length > 0;

  if (hasErrors) {
    return (
      <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-neutral-950/95 px-6 text-center" role="alert" aria-live="assertive">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600/40 to-neutral-950 border border-amber-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)] mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-400 animate-pulse" />
        </div>
        <h1 className="font-serif text-xl sm:text-2xl text-amber-200">Asset download failed</h1>
        <p className="mt-3 max-w-sm text-xs text-neutral-300 leading-relaxed">
          Part of the game was missing or the download failed. Your gladiator and save data on this device are untouched &mdash; loading again usually clears it.
        </p>
        <button
          type="button"
          data-failure-action="retry"
          onClick={reload}
          className="mt-6 inline-flex items-center gap-2 min-h-[48px] px-6 py-3 rounded-full bg-gradient-to-r from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] border border-[#8b2a2a]/60 font-serif font-bold text-xs uppercase tracking-wider text-amber-50 shadow-[0_0_20px_rgba(107,26,26,0.5)] cursor-pointer active:scale-95 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try again</span>
        </button>
      </div>
    );
  }

  const { knowsCount, pct } = resolveWaitSurfaceProgress(active, total, progress);
  return (
    <>
      <div
        data-loading-cover="true"
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-end pointer-events-none bg-gradient-to-t from-neutral-950 via-neutral-950/95 to-transparent pt-12 pb-[max(2.5vh,calc(env(safe-area-inset-bottom,0px)+12px))]"
        style={{ height: '34%', minHeight: '160px' }}
      />
      <div
        data-loading-progress="true"
        className="absolute left-1/2 -translate-x-1/2 z-20 text-center px-4"
        style={{ bottom: 'max(4vh, calc(env(safe-area-inset-bottom, 0px) + 24px))', width: 'min(82vw, 440px)' }}
      >
        <div
          role="progressbar"
          aria-label="Loading game assets"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={knowsCount ? pct : undefined}
          className="relative w-full p-[3px] rounded-xl bg-gradient-to-b from-amber-900/90 via-amber-950 to-neutral-950 border-2 border-amber-600/70 shadow-[0_0_20px_rgba(217,119,6,0.35)] backdrop-blur-md"
        >
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-amber-400 pointer-events-none" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-amber-400 pointer-events-none" />
          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-amber-400 pointer-events-none" />
          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-amber-400 pointer-events-none" />
          <div className="relative h-2.5 sm:h-3 w-full overflow-hidden rounded-lg bg-neutral-950/90 border border-amber-950">
            {knowsCount ? (
              <div className="h-full w-full origin-left rounded-md bg-gradient-to-r from-amber-700 via-yellow-400 to-amber-500 shadow-[0_0_12px_rgba(251,191,36,0.8)] transition-transform duration-300 ease-out" style={{ transform: `scaleX(${pct / 100})` }} />
            ) : (
              <div className="wait-sweep h-full w-2/5 rounded-md bg-gradient-to-r from-transparent via-yellow-300 to-transparent shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
            )}
          </div>
        </div>
        <p className="mt-2.5 text-[11px] font-mono uppercase tracking-[0.22em] text-amber-200/90 font-semibold drop-shadow-md">
          {knowsCount ? `Loading asset ${loaded} of ${total} · ${pct}%` : 'Preparing the world…'}
        </p>
      </div>
    </>
  );
};
