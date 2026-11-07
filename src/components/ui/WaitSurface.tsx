import React, { useCallback, useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import {
  keeperLineAt,
  nextKeeperIndex,
  waitDestination,
  type WaitDestinationId,
} from './waitSurfaceLines';
import { TITLE_BACKDROP_CLASS } from '../../utils/startupAssets';

/**
 * START-1 — the shared-art destination wait surface.
 *
 * City, arena, circus and building transitions all retain the player's supplied
 * Sand & Steel artwork. Progress stays honest: a measured asset percentage when
 * the loader has a count, otherwise an indeterminate sweep at the bottom edge.
 */

export interface WaitSurfaceProps {
  destination: WaitDestinationId;
  /** Rotate the Acta line on its own while the wait runs. Defaults to on. */
  rotate?: boolean;
}

export const WAIT_ROTATE_MS = 2600;

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
  const { progress, loaded, total } = useProgress();
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
  const knowsCount = total > 0;
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div
      data-wait-surface={destination}
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[95] ${TITLE_BACKDROP_CLASS} flex flex-col items-center justify-center text-amber-100 select-none px-6 ${hidden ? 'wait-anim-paused' : ''}`}
    >
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 50% 58%, rgba(245,158,11,0.12) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center max-w-md w-full text-center">
        <p className="font-serif text-lg sm:text-xl text-amber-200/90 leading-snug">{line}</p>
        <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-amber-600/90 font-serif">
          {gloss}
        </p>

        <button
          type="button"
          data-wait-acta="cycle"
          onClick={cycleLine}
          className="mt-7 min-h-[3.5rem] w-full px-4 py-3 rounded-2xl border border-amber-900/50 bg-black/55 text-left cursor-pointer transition-colors hover:border-amber-700/60 focus:outline-none focus:border-amber-600/70"
        >
          <span className="block text-[10px] uppercase tracking-[0.3em] text-amber-500/90 font-serif mb-1">
            From the Acta
          </span>
          <span className="block text-xs text-amber-100/90 italic leading-relaxed">
            {keeperLineAt(lineIndex)}
          </span>
        </button>
      </div>

      <div
        data-loading-progress="true"
        className="absolute left-1/2 -translate-x-1/2 z-10 text-center"
        style={{
          bottom: 'max(5.5vh, calc(env(safe-area-inset-bottom, 0px) + 28px))',
          width: 'min(72vw, 420px)',
        }}
      >
        <div
          role="progressbar"
          aria-label="Loading game assets"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={knowsCount ? pct : undefined}
          className="h-1 w-full overflow-hidden rounded-full border border-amber-700/60 bg-neutral-950/85 shadow-[0_0_12px_rgba(180,83,9,0.2)]"
        >
          {knowsCount ? (
            <div
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-amber-700 via-amber-300 to-amber-500 transition-transform duration-300"
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          ) : (
            <div className="wait-sweep h-full w-1/3 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
          )}
        </div>
        <p className="mt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-amber-200/85">
          {knowsCount ? `Loading asset ${loaded} of ${total} · ${pct}%` : 'Preparing the world…'}
        </p>
      </div>
    </div>
  );
};
