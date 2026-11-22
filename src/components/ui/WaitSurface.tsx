import React, { Suspense, useCallback, useEffect, useState } from 'react';
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
 * This shell contains no Three.js/Drei imports. Its progress reader is loaded only
 * when the surface is actually mounted as a destination fallback.
 */
export interface WaitSurfaceProps {
  destination: WaitDestinationId;
  rotate?: boolean;
}

export const WAIT_ROTATE_MS = 2600;

const WaitSurfaceProgressOverlay = React.lazy(() =>
  import('./WaitSurfaceProgressOverlay').then((module) => ({ default: module.WaitSurfaceProgressOverlay })),
);

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

const ProgressFallback: React.FC = () => (
  <>
    <div data-loading-cover="true" className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-end pointer-events-none bg-gradient-to-t from-neutral-950 via-neutral-950/95 to-transparent pt-12 pb-[max(2.5vh,calc(env(safe-area-inset-bottom,0px)+12px))]" style={{ height: '34%', minHeight: '160px' }} />
    <div data-loading-progress="true" className="absolute left-1/2 -translate-x-1/2 z-20 text-center px-4" style={{ bottom: 'max(4vh, calc(env(safe-area-inset-bottom, 0px) + 24px))', width: 'min(82vw, 440px)' }}>
      <div role="progressbar" aria-label="Loading game assets" aria-valuemin={0} aria-valuemax={100} className="relative w-full p-[3px] rounded-xl bg-gradient-to-b from-amber-900/90 via-amber-950 to-neutral-950 border-2 border-amber-600/70 shadow-[0_0_20px_rgba(217,119,6,0.35)] backdrop-blur-md">
        <div className="relative h-2.5 sm:h-3 w-full overflow-hidden rounded-lg bg-neutral-950/90 border border-amber-950">
          <div className="wait-sweep h-full w-2/5 rounded-md bg-gradient-to-r from-transparent via-yellow-300 to-transparent shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
        </div>
      </div>
      <p className="mt-2.5 text-[11px] font-mono uppercase tracking-[0.22em] text-amber-200/90 font-semibold drop-shadow-md">Preparing the world…</p>
    </div>
  </>
);

export const WaitSurface: React.FC<WaitSurfaceProps> = ({ destination, rotate = true }) => {
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

  return (
    <div data-wait-surface={destination} role="status" aria-live="polite" className={`fixed inset-0 z-[95] ${COLOSSEUM_LOADING_CLASS} flex flex-col items-center justify-between text-amber-100 select-none px-6 ${hidden ? 'wait-anim-paused' : ''}`}>
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 65% 50% at 50% 50%, rgba(245,158,11,0.12) 0%, transparent 70%)' }} />
      <div className="relative z-10 flex flex-col items-center max-w-md w-full text-center mt-auto mb-auto pb-24">
        <p className="font-serif text-lg sm:text-xl text-amber-200/90 leading-snug drop-shadow-md">{line}</p>
        <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-amber-600/90 font-serif">{gloss}</p>
        <button type="button" data-wait-acta="cycle" onClick={cycleLine} className="mt-6 min-h-[3.5rem] w-full px-4 py-3 rounded-2xl border border-amber-900/60 bg-neutral-950/75 backdrop-blur-md text-left cursor-pointer transition-colors hover:border-amber-600/70 focus:outline-none focus:border-amber-500/80 shadow-lg">
          <span className="block text-[10px] uppercase tracking-[0.3em] text-amber-500/90 font-serif mb-1">From the Acta</span>
          <span className="block text-xs text-amber-100/90 italic leading-relaxed">{keeperLineAt(lineIndex)}</span>
        </button>
      </div>
      <Suspense fallback={<ProgressFallback />}>
        <WaitSurfaceProgressOverlay />
      </Suspense>
    </div>
  );
};
