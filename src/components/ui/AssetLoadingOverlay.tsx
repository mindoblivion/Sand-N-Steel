import React, { useState, useEffect } from 'react';
import { useProgress, Html } from '@react-three/drei';
import { Shield, Sparkles } from 'lucide-react';
import { COLOSSEUM_LOADING_CLASS } from '../../utils/startupAssets';

const LORE_TIPS = [
  'Tempering Roman steel & forging the Gladius...',
  'Constructing the monumental Ishtar Town Gate...',
  'Rigging Roman Warrior skeleton & combat animations...',
  'Preparing the Sand Arena & crowd amphitheater...',
  'Offering tributes to the Gods for arena favor...',
  'Tuning weapon physics and deflection hitboxes...',
];

export const AssetLoadingOverlay: React.FC = () => {
  const { active, progress, item, loaded, total, errors } = useProgress();
  const [tipIndex, setTipIndex] = useState(0);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [dismissedForRecovery, setDismissedForRecovery] = useState(false);
  useEffect(() => {
    if (!active) {
      setRecoveryAvailable(false);
      setDismissedForRecovery(false);
      return;
    }

    setRecoveryAvailable(false);
    setDismissedForRecovery(false);
    const recoveryTimer = setTimeout(() => setRecoveryAvailable(true), 30000);
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % LORE_TIPS.length);
    }, 2400);
    return () => {
      clearTimeout(recoveryTimer);
      clearInterval(interval);
    };
  }, [active]);

  if ((!active && progress === 100) || (errors && errors.length > 0)) return null;

  const roundedPct = Math.min(100, Math.max(0, Math.round(progress)));
  const cleanItemName = item
    ? item.split('/').pop()?.replace(/[-_]/g, ' ').replace('.glb', '')
    : 'Gladiator 3D Environment';
  const knowsCount = total > 0;

  if (dismissedForRecovery) return null;

  return (
    <div
      data-asset-loading-overlay="true"
      className={`fixed inset-0 z-50 ${COLOSSEUM_LOADING_CLASS} flex flex-col items-center justify-center text-amber-100 select-none transition-opacity duration-500 pointer-events-auto ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-600/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-yellow-500/10 rounded-full blur-2xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center mb-16">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600/40 to-neutral-950 border border-amber-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)]">
          <Shield className="w-7 h-7 text-amber-300 animate-pulse" />
        </div>
        <h2 className="mt-5 font-serif font-black text-lg sm:text-xl text-amber-200 uppercase tracking-widest flex items-center gap-1.5 drop-shadow-md">
          <span>Entering The Arena</span>
          <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
        </h2>
        <p className="mt-3 text-[11px] font-mono text-amber-100/85 truncate max-w-[280px]">
          {total > 0 ? `Loading asset (${loaded}/${total}): ${cleanItemName}` : cleanItemName}
        </p>
        <p className="mt-4 text-xs text-neutral-200/90 italic min-h-[36px] flex items-center justify-center">
          “{LORE_TIPS[tipIndex]}”
        </p>
      </div>

      {recoveryAvailable && (
        <button
          type="button"
          onClick={() => setDismissedForRecovery(true)}
          className="absolute z-30 rounded-lg border border-amber-500/70 bg-neutral-950/90 px-4 py-2 text-xs font-mono uppercase tracking-wider text-amber-100 shadow-lg"
          style={{ bottom: 'calc(max(4vh, calc(env(safe-area-inset-bottom, 0px) + 24px)) + 52px)' }}
        >
          Continue in background
        </button>
      )}

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
          aria-label="Loading 3D assets"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={knowsCount ? roundedPct : undefined}
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
                style={{ transform: `scaleX(${roundedPct / 100})` }}
              />
            ) : (
              <div className="wait-sweep h-full w-2/5 rounded-md bg-gradient-to-r from-transparent via-yellow-300 to-transparent shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
            )}
          </div>
        </div>

        <p className="mt-2.5 text-[11px] font-mono uppercase tracking-[0.22em] text-amber-200/90 font-semibold drop-shadow-md">
          {knowsCount ? `Loading · ${roundedPct}%` : 'Loading'}
        </p>
      </div>
    </div>
  );
};

// In-Canvas 3D Loading Fallback (for React Suspense inside <Canvas>)
export const CanvasLoadingFallback: React.FC = () => {
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center bg-neutral-950/80 border border-amber-600/50 p-4 rounded-2xl backdrop-blur-md shadow-2xl text-amber-200 pointer-events-none">
        <div className="w-8 h-8 rounded-full border-2 border-transparent border-t-amber-400 border-r-amber-500 animate-spin mb-2" />
        <span className="font-serif font-bold text-xs uppercase tracking-wider">Loading 3D Mesh...</span>
      </div>
    </Html>
  );
};
