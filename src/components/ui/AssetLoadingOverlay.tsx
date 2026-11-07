import React, { useState, useEffect } from 'react';
import { useProgress, Html } from '@react-three/drei';
import { Shield, Sparkles } from 'lucide-react';
import { TITLE_BACKDROP_CLASS } from '../../utils/startupAssets';

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
      className={`fixed inset-0 z-50 ${TITLE_BACKDROP_CLASS} flex flex-col items-center justify-center text-amber-100 select-none transition-opacity duration-500 pointer-events-auto ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-600/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-yellow-500/10 rounded-full blur-2xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600/40 to-neutral-950 border border-amber-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)]">
          <Shield className="w-7 h-7 text-amber-300 animate-pulse" />
        </div>
        <h2 className="mt-5 font-serif font-black text-lg sm:text-xl text-amber-200 uppercase tracking-widest flex items-center gap-1.5">
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
          className="absolute bottom-5 z-20 rounded-lg border border-amber-500/70 bg-neutral-950/90 px-4 py-2 text-xs font-mono uppercase tracking-wider text-amber-100 shadow-lg"
        >
          Continue in background
        </button>
      )}

      <div
        data-loading-progress="true"
        className="absolute left-1/2 -translate-x-1/2 z-10 text-center"
        style={{
          bottom: 'max(5.5vh, calc(env(safe-area-inset-bottom, 0px) + 28px))',
          width: 'min(72vw, 420px)',
        }}
      >
        <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.25em] text-amber-100/90">
          {knowsCount ? `Loading · ${roundedPct}%` : 'Loading'}
        </p>
        <div
          role="progressbar"
          aria-label="Loading 3D assets"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={knowsCount ? roundedPct : undefined}
          className="h-1 w-full overflow-hidden rounded-full border border-amber-700/60 bg-neutral-950/85 shadow-[0_0_12px_rgba(180,83,9,0.2)]"
        >
          {knowsCount ? (
            <div
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-amber-700 via-amber-300 to-amber-500 transition-transform duration-300"
              style={{ transform: `scaleX(${roundedPct / 100})` }}
            />
          ) : (
            <div className="wait-sweep h-full w-1/3 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
          )}
        </div>
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
