import React, { useCallback, useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  keeperLineAt,
  nextKeeperIndex,
  waitDestination,
  type WaitDestinationId,
} from './waitSurfaceLines';
import { COLOSSEUM_LOADING_CLASS } from '../../utils/startupAssets';

/**
 * START-1 — the Colosseum destination wait surface.
 *
 * City, arena, circus and building transitions use the supplied Colosseum loading
 * screen artwork through COLOSSEUM_LOADING_CLASS. A dark lower overlay hides the artwork's
 * baked-in loading bar and percentage text, replaced by live progress: a measured asset
 * percentage when the loader has a count, otherwise an indeterminate metallic sweep.
 */

export interface WaitSurfaceProps {
  destination: WaitDestinationId;
  /** Rotate the Acta line on its own while the wait runs. Defaults to on. */
  rotate?: boolean;
}

export const WAIT_ROTATE_MS = 2600;

function reload(): void {
  try {
    window.location.reload();
  } catch {
    // fallback
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  return hidden;
}

export const WaitSurface: React.FC<WaitSurfaceProps> = ({ destination, rotate = true }) => {
  const { progress, loaded, total, errors } = useProgress();
  const [lineIndex, setLineIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const hidden = useDocumentHidden();
  const { line, gloss } = waitDestination(destination);

  useEffect(() => {
    if (!rotate || reducedMotion || hidden) return;
    const timer = window.setInterval(() => setLineIndex((index) => nextKeeperIndex(index)), WAIT_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotate, reducedMotion, hidden]);

  const cycleLine = useCallback(() => setLineIndex((index) => nextKeeperIndex(index)), []);
  const hasErrors = errors && errors.length > 0;
  const knowsCount = total > 0;
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div
      data-wait-surface={destination}
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[95] ${COLOSSEUM_LOADING_CLASS} flex flex-col items-center justify-between text-amber-100 select-none px-6 ${hidden ? 'wait-anim-paused' : ''}`}
    >
      {/* Dark ambient vignette & central golden torch glow */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 65% 50% at 50% 50%, rgba(245,158,11,0.12) 0%, transparent 70%)',
        }}
      />

      {/* Destination & Acta lore quote panel or Asset Failure State */}
      <div className="relative z-10 flex flex-col items-center max-w-md w-full text-center mt-auto mb-auto pb-24">
        {hasErrors ? (
          <>
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600/40 to-neutral-950 border border-amber-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)] mb-4">
              <AlertTriangle className="w-7 h-7 text-amber-400 animate-pulse" />
            </div>
            <h1 className="font-serif text-xl sm:text-2xl text-amber-200">
              Asset download failed
            </h1>
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
          </>
        ) : (
          <>
            <p className="font-serif text-lg sm:text-xl text-amber-200/90 leading-snug drop-shadow-md">{line}</p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-amber-600/90 font-serif">
              {gloss}
            </p>

            <button
              type="button"
              data-wait-acta="cycle"
              onClick={cycleLine}
              className="mt-6 min-h-[3.5rem] w-full px-4 py-3 rounded-2xl border border-amber-900/60 bg-neutral-950/75 backdrop-blur-md text-left cursor-pointer transition-colors hover:border-amber-600/70 focus:outline-none focus:border-amber-500/80 shadow-lg"
            >
              <span className="block text-[10px] uppercase tracking-[0.3em] text-amber-500/90 font-serif mb-1">
                From the Acta
              </span>
              <span className="block text-xs text-amber-100/90 italic leading-relaxed">
                {keeperLineAt(lineIndex)}
              </span>
            </button>
          </>
        )}
      </div>

      {/* Dark lower overlay panel obscuring artwork's baked-in loading bar & 72% text */}
      <div
        data-loading-cover="true"
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-end pointer-events-none bg-gradient-to-t from-neutral-950 via-neutral-950/95 to-transparent pt-12 pb-[max(2.5vh,calc(env(safe-area-inset-bottom,0px)+12px))]"
        style={{
          height: '34%',
          minHeight: '160px',
        }}
      />

      {/* Live progress indicator with premium Roman metallic-gold bar & ornamental frame */}
      {!hasErrors && (
        <div
          data-loading-progress="true"
          className="absolute left-1/2 -translate-x-1/2 z-20 text-center px-4"
          style={{
            bottom: 'max(4vh, calc(env(safe-area-inset-bottom, 0px) + 24px))',
            width: 'min(82vw, 440px)',
          }}
        >
          <div
            role="progressbar"
            aria-label="Loading game assets"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={knowsCount ? pct : undefined}
            className="relative w-full p-[3px] rounded-xl bg-gradient-to-b from-amber-900/90 via-amber-950 to-neutral-950 border-2 border-amber-600/70 shadow-[0_0_20px_rgba(217,119,6,0.35)] backdrop-blur-md"
          >
            {/* Corner ornamental brackets */}
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-amber-400 pointer-events-none" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-amber-400 pointer-events-none" />
            <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-amber-400 pointer-events-none" />
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-amber-400 pointer-events-none" />

            {/* Inner metallic track */}
            <div className="relative h-2.5 sm:h-3 w-full overflow-hidden rounded-lg bg-neutral-950/90 border border-amber-950">
              {knowsCount ? (
                <div
                  className="h-full w-full origin-left rounded-md bg-gradient-to-r from-amber-700 via-yellow-400 to-amber-500 shadow-[0_0_12px_rgba(251,191,36,0.8)] transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${pct / 100})` }}
                />
              ) : (
                <div className="wait-sweep h-full w-2/5 rounded-md bg-gradient-to-r from-transparent via-yellow-300 to-transparent shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
              )}
            </div>
          </div>

          <p className="mt-2.5 text-[11px] font-mono uppercase tracking-[0.22em] text-amber-200/90 font-semibold drop-shadow-md">
            {knowsCount ? `Loading asset ${loaded} of ${total} · ${pct}%` : 'Preparing the world…'}
          </p>
        </div>
      )}
    </div>
  );
};
