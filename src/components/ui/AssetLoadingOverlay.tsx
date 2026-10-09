import React, { useState, useEffect } from 'react';
import { useProgress, Html } from '@react-three/drei';
import { Shield, Sparkles } from 'lucide-react';

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
  const [timedOut, setTimedOut] = useState(false);

  // Safety timeout: Never trap user for more than 4 seconds
  useEffect(() => {
    if (!active) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [active]);

  // Cycle tips every 2.4s
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % LORE_TIPS.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [active]);

  if ((!active && progress === 100) || timedOut || (errors && errors.length > 0)) return null;

  const roundedPct = Math.min(100, Math.max(0, Math.round(progress)));
  const cleanItemName = item
    ? item.split('/').pop()?.replace(/[-_]/g, ' ').replace('.glb', '')
    : 'Gladiator 3D Environment';

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/95 backdrop-blur-md text-amber-100 select-none transition-opacity duration-500 pointer-events-auto ${
        active ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* BACKGROUND DESERT GLOW EMBERS */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-600/15 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-yellow-500/10 rounded-full blur-2xl"></div>
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center">
        {/* ROTATING DUAL GOLD SPINNER WITH CENTER SHIELD */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-6 flex items-center justify-center">
          {/* Outer Gold Ring */}
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-400 border-r-amber-500/60 animate-spin"></div>
          {/* Inner Reverse Ring */}
          <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-yellow-300 border-l-amber-600/80 animate-[spin_1.5s_linear_infinite_reverse]"></div>
          {/* Center Glow */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-amber-600/40 to-neutral-950 border border-amber-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)]">
            <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-amber-300 animate-pulse" />
          </div>
        </div>

        {/* LOADING TITLE & PROGRESS PERCENTAGE */}
        <h2 className="font-serif font-black text-lg sm:text-xl text-amber-200 uppercase tracking-widest mb-1 flex items-center gap-1.5">
          <span>Entering The Arena</span>
          <Sparkles className="w-4 h-4 text-yellow-400 animate-spin" />
        </h2>

        <div className="text-2xl sm:text-3xl font-serif font-black text-amber-400 font-mono tracking-wider mb-3">
          {roundedPct}%
        </div>

        {/* METALLIC PROGRESS BAR */}
        <div className="w-full h-3 bg-neutral-900 border border-amber-700/60 rounded-full overflow-hidden p-0.5 shadow-inner mb-3">
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-300 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(250,204,21,0.7)]"
            style={{ width: `${roundedPct}%` }}
          ></div>
        </div>

        {/* CURRENT ASSET & LOADED COUNTER */}
        <div className="text-[11px] font-mono text-amber-400/80 mb-2 truncate max-w-[280px]">
          {total > 0 ? `Loading asset (${loaded}/${total}): ${cleanItemName}` : `Loading 3D World...`}
        </div>

        {/* LORE / FLAVOR TIP */}
        <p className="text-xs text-neutral-400 italic min-h-[36px] flex items-center justify-center">
          "{LORE_TIPS[tipIndex]}"
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
        <div className="w-8 h-8 rounded-full border-2 border-transparent border-t-amber-400 border-r-amber-500 animate-spin mb-2"></div>
        <span className="font-serif font-bold text-xs uppercase tracking-wider">Loading 3D Mesh...</span>
      </div>
    </Html>
  );
};
