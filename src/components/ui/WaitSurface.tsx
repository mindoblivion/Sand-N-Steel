import React, { useCallback, useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import {
  keeperLineAt,
  nextKeeperIndex,
  waitDestination,
  type WaitDestinationId,
} from './waitSurfaceLines';

/**
 * START-1 — the wait surface.
 *
 * Replaces the bare "Loading City Hub…" text (and its siblings) at every Suspense
 * fallback that serves a destination load. It shows three things and nothing else:
 *
 *  - where the player is going, in the fiction, with a plain gloss;
 *  - one line from the Acta, which rotates and can be tapped to move on;
 *  - honest progress — a real asset count when the loader knows one, and an
 *    indeterminate indicator when it does not. Never a fake percentage.
 *
 * Motion follows the house rules: transform and opacity only, no bare spinner, paused
 * while the tab is hidden, and stilled entirely under `prefers-reduced-motion` (the
 * Acta line still rotates on a tap, so the surface is never frozen mid-thought).
 */

export interface WaitSurfaceProps {
  destination: WaitDestinationId;
  /** Rotate the Acta line on its own while the wait runs. Defaults to on. */
  rotate?: boolean;
}

/** How long each Acta line is held before the next one. */
export const WAIT_ROTATE_MS = 2600;

/** True when the player has asked the system for less motion. */
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

/** True while the tab is in the background, for every pausable behaviour. */
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

  // Rotate the Acta line, unless the player asked for less motion or the tab is hidden.
  // A tap-to-cycle control is always available, so this only affects the ambient case.
  useEffect(() => {
    if (!rotate || reducedMotion || hidden) return;
    const timer = window.setInterval(() => setLineIndex((index) => nextKeeperIndex(index)), WAIT_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotate, reducedMotion, hidden]);

  const cycleLine = useCallback(() => setLineIndex((index) => nextKeeperIndex(index)), []);

  // Honest progress: a real count when the loader has one, otherwise no number at all.
  const knowsCount = total > 0;
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div
      data-wait-surface={destination}
      role="status"
      aria-live="polite"
      className={`relative w-full h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-neutral-950 text-amber-100 select-none px-6 ${
        hidden ? 'wait-anim-paused' : ''
      }`}
    >
      {/* A faint sand glow behind the copy — the arena's light, not a spinner. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 50% 58%, rgba(245,158,11,0.12) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center max-w-md w-full text-center">
        {/* WHERE YOU ARE GOING — the fiction, then the plain gloss of it. */}
        <p className="font-serif text-lg sm:text-xl text-amber-200/90 leading-snug">{line}</p>
        <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-amber-600/80 font-serif">
          {gloss}
        </p>

        {/* PROGRESS — a real asset count where the loader knows one, otherwise an
            indeterminate sweep. Nothing here ever invents a number. */}
        <div className="mt-7 w-full max-w-xs">
          <div className="h-px w-full bg-amber-900/40 overflow-hidden">
            {knowsCount ? (
              <div
                className="h-px w-full bg-gradient-to-r from-amber-700 via-amber-400 to-amber-300 origin-left transition-transform duration-300"
                style={{ transform: `scaleX(${pct / 100})` }}
              />
            ) : (
              <div className="wait-sweep h-px w-1/3 bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />
            )}
          </div>
          <p className="mt-3 text-[11px] font-mono text-amber-700/90">
            {knowsCount ? `Loading asset ${loaded} of ${total}` : 'Working…'}
          </p>
        </div>

        {/* THE ACTA — the keeper's line. Tap to move on. */}
        <button
          type="button"
          data-wait-acta="cycle"
          onClick={cycleLine}
          className="mt-7 min-h-[3.5rem] w-full px-4 py-3 rounded-2xl border border-amber-900/40 bg-black/30 text-left cursor-pointer transition-colors hover:border-amber-700/60 focus:outline-none focus:border-amber-600/70"
        >
          <span className="block text-[10px] uppercase tracking-[0.3em] text-amber-700/80 font-serif mb-1">
            From the Acta
          </span>
          <span className="block text-xs text-amber-200/80 italic leading-relaxed">
            {keeperLineAt(lineIndex)}
          </span>
        </button>
      </div>
    </div>
  );
};
