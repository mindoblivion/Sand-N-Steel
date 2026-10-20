import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff, MonitorX, AlertTriangle, X } from 'lucide-react';

/**
 * START-1 — the failure surfaces.
 *
 * Three ways the startup sequence can fail to reach the game, each answered in plain
 * language with a way forward. None of them is a dead end, and none of them blames the
 * player:
 *
 *  - `OfflineNotice`     — the service-worker shell served the app with no connection;
 *  - `LoadFailureScreen` — a chunk or asset for a destination failed to arrive, named by
 *                          the tier that failed (city / arena / circus);
 *  - `NoWebGLScreen`     — the device cannot run 3D at all. No jargon, no diagnostics
 *                          dump, and a retry that reloads.
 */

/** Reload the app — the one honest recovery for every failure here. */
function reload(): void {
  try {
    window.location.reload();
  } catch {
    // A browser that refuses the reload leaves the surface (and its button) in place.
  }
}

/**
 * Is the device offline? Seeded from `navigator.onLine` and then driven by the browser's
 * own online/offline events, which are the authority on the state rather than a guess
 * from a failed request.
 */
export function useOfflineState(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) setOffline(true);

    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return offline;
}

/**
 * The offline surface. Deliberately NOT a full-screen gate: the shell may still hold
 * enough of the game to play, so this is a notice the player can dismiss (and which
 * clears itself the moment the connection returns) with a Retry that reloads.
 */
export const OfflineNotice: React.FC = () => {
  const offline = useOfflineState();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!offline) setDismissed(false);
  }, [offline]);

  if (!offline || dismissed) return null;

  return (
    <div
      data-failure-surface="offline"
      role="alert"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,26rem)] rounded-2xl border border-amber-800/60 bg-neutral-950/95 backdrop-blur-sm px-4 py-3 shadow-2xl text-amber-100"
    >
      <div className="flex items-start gap-3">
        <WifiOff className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
        <div className="flex-1">
          <p className="font-serif text-sm text-amber-200">You are offline</p>
          <p className="mt-1 text-[11px] text-neutral-300 leading-relaxed">
            The game is running from what was already saved on this device. Anything that
            needs the network — a cloud save, a sign-in — will wait until you are back.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              data-failure-action="retry"
              onClick={reload}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] border border-[#8b2a2a]/60 font-serif font-bold text-[11px] uppercase tracking-wider text-amber-50 cursor-pointer active:scale-95 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              data-failure-action="dismiss"
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 rounded-full border border-neutral-700 font-serif text-[11px] uppercase tracking-wider text-neutral-300 cursor-pointer hover:border-amber-700/60 hover:text-amber-200 transition-colors"
            >
              Keep playing
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss offline notice"
          onClick={() => setDismissed(true)}
          className="text-amber-700/80 hover:text-amber-300 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/**
 * A destination failed to load — the chunk or one of its assets never arrived. Names
 * the tier that failed so the player (and a report) knows which part of the game is
 * missing, and offers the only recovery that really works: load it again.
 */
export const LoadFailureScreen: React.FC<{ tierLabel: string; detail?: string }> = ({
  tierLabel,
  detail,
}) => (
  <div
    data-failure-surface="load"
    role="alert"
    className="w-full h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-neutral-950 text-amber-100 px-6 text-center"
  >
    <AlertTriangle className="w-8 h-8 text-amber-500/80 mb-4" />
    <h1 className="font-serif text-xl sm:text-2xl text-amber-200">
      {tierLabel} did not load
    </h1>
    <p className="mt-3 max-w-sm text-xs text-neutral-300 leading-relaxed">
      Part of the game was missing or the download was interrupted. Your gladiator and
      everything saved on this device are untouched — loading again usually clears it.
    </p>
    {detail && (
      <p className="mt-3 max-w-sm text-[10px] font-mono text-neutral-500 break-words">{detail}</p>
    )}
    <button
      type="button"
      data-failure-action="retry"
      onClick={reload}
      className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] border border-[#8b2a2a]/60 font-serif font-bold text-xs uppercase tracking-wider text-amber-50 shadow-[0_0_20px_rgba(107,26,26,0.5)] cursor-pointer active:scale-95 transition-all"
    >
      <RefreshCw className="w-4 h-4" />
      <span>Try again</span>
    </button>
  </div>
);

/**
 * The device cannot run the game at all. Plain words, no WebGL, no GPU, no
 * "hardware acceleration" — and a retry, so it is never a dead end.
 */
export const NoWebGLScreen: React.FC = () => (
  <div
    data-failure-surface="no-webgl"
    role="alert"
    className="w-full h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-neutral-950 text-amber-100 px-6 text-center"
  >
    <MonitorX className="w-8 h-8 text-amber-500/80 mb-4" />
    <h1 className="font-serif text-xl sm:text-2xl text-amber-200">
      This device can&rsquo;t run Sand &amp; Steel
    </h1>
    <p className="mt-3 max-w-sm text-xs text-neutral-300 leading-relaxed">
      The game draws a 3D world, and this browser isn&rsquo;t giving us the graphics it
      needs. That is about the device, not about your gladiator &mdash; nothing has been
      lost.
    </p>
    <p className="mt-3 max-w-sm text-[11px] text-neutral-400 leading-relaxed">
      Trying again sometimes helps. If it doesn&rsquo;t, opening the game in another browser
      or on another device should work.
    </p>
    <button
      type="button"
      data-failure-action="retry"
      onClick={reload}
      className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] border border-[#8b2a2a]/60 font-serif font-bold text-xs uppercase tracking-wider text-amber-50 shadow-[0_0_20px_rgba(107,26,26,0.5)] cursor-pointer active:scale-95 transition-all"
    >
      <RefreshCw className="w-4 h-4" />
      <span>Try again</span>
    </button>
  </div>
);
