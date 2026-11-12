import React, { useState, useEffect } from 'react';
import { useProgress } from '@react-three/drei';
import { Shield, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react';
import { COLOSSEUM_LOADING_CLASS } from '../../utils/startupAssets';

interface LoreTip {
  category: 'Lore' | 'Combat Tip' | 'Arena Wisdom' | 'Historical Note';
  text: string;
}

const LORE_TIPS: LoreTip[] = [
  { category: 'Lore', text: 'Tempering Roman steel in the subterranean forges of the Ludus produces blades capable of cleaving heavy wooden shields.' },
  { category: 'Combat Tip', text: 'Heavy power attacks deal devastating damage but consume significant stamina. Watch your breathing.' },
  { category: 'Arena Wisdom', text: 'The crowd\'s hype fuels your momentum and increases prize purses. Play to the amphitheater when you have the upper hand.' },
  { category: 'Historical Note', text: 'The Retiarius relies on agility and weighted nets to entangle heavy opponents, compensating for a lack of armor.' },
  { category: 'Lore', text: 'The monumental Ishtar Town Gate marks the boundary between the bustling Metropolis and the sacred training grounds.' },
  { category: 'Combat Tip', text: 'Perfect blocks parry incoming blows and preserve stamina, turning defense into an instant counter-attack opportunity.' },
  { category: 'Arena Wisdom', text: 'If the crowd turns cold, your fame gains diminish. Keep the pressure high and strike with precision.' },
  { category: 'Historical Note', text: 'Murmillo gladiators wear distinct helmet crests reminiscent of a fish (mormyr) and carry large scutum shields.' },
  { category: 'Lore', text: 'Offerings at the Shrine of Fortuna before entering the Colosseum can alter your combat fortune in mysterious ways.' },
  { category: 'Combat Tip', text: 'Managing body weight is crucial: lighter gladiators strike swiftly, while heavier brawlers absorb tremendous blunt trauma.' },
  { category: 'Arena Wisdom', text: 'Watch your opponent\'s wind-up stance. Anticipating a heavy strike allows you to dodge or shield in time.' },
  { category: 'Historical Note', text: 'Dimachaeri fight with two swords simultaneously, blinding opponents with lightning-fast dual strikes.' },
];

function reload(): void {
  try {
    window.location.reload();
  } catch {
    // fallback
  }
}

export const AssetLoadingOverlay: React.FC = () => {
  const { active, progress, item, loaded, total, errors } = useProgress();
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * LORE_TIPS.length));
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
    }, 3200);
    return () => {
      clearTimeout(recoveryTimer);
      clearInterval(interval);
    };
  }, [active]);

  const hasErrors = errors && errors.length > 0;
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    if (!active && (progress >= 99 || progress === 100) && !hasErrors) {
      setAssetsLoaded(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 700);
      return () => clearTimeout(timer);
    } else {
      setAssetsLoaded(false);
      setShouldRender(true);
    }
  }, [active, progress, hasErrors]);

  if (!shouldRender && !hasErrors) return null;

  const roundedPct = Math.min(100, Math.max(0, Math.round(progress)));
  const cleanItemName = item
    ? item.split('/').pop()?.replace(/[-_]/g, ' ').replace('.glb', '')
    : 'Gladiator 3D Environment';
  const knowsCount = total > 0;

  const getDescriptiveLabel = (url: string | undefined): string => {
    if (!url) return 'Preparing Roman Metropolis';
    const lower = url.toLowerCase();
    if (lower.includes('arena') || lower.includes('colosseum') || lower.includes('circus') || lower.includes('city')) {
      return 'Loading 3D Arenas & Architecture';
    }
    if (lower.includes('weapon') || lower.includes('armor') || lower.includes('chariot') || lower.includes('shield')) {
      return 'Equipping Armory & Equipment';
    }
    if (lower.includes('texture') || lower.includes('img') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.webp')) {
      return 'Pre-caching Textures & Surfaces';
    }
    if (lower.endsWith('.ogg') || lower.endsWith('.mp3') || lower.includes('audio')) {
      return 'Tuning Acoustic Ambience';
    }
    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      return 'Rigging Gladiator 3D Models';
    }
    return 'Loading Game Assets';
  };

  const descriptiveLabel = getDescriptiveLabel(item);

  if (dismissedForRecovery) return null;

  return (
    <div
      data-asset-loading-overlay="true"
      className={`fixed inset-0 z-50 ${COLOSSEUM_LOADING_CLASS} flex flex-col items-center justify-center text-amber-100 select-none transition-opacity duration-700 ease-out pointer-events-auto ${assetsLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-600/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-yellow-500/10 rounded-full blur-2xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center mb-16">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600/40 to-neutral-950 border border-amber-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)]">
          {hasErrors ? (
            <AlertTriangle className="w-7 h-7 text-amber-400 animate-pulse" />
          ) : (
            <Shield className="w-7 h-7 text-amber-300 animate-pulse" />
          )}
        </div>
        <h2 className="mt-5 font-serif font-black text-lg sm:text-xl text-amber-200 uppercase tracking-widest flex items-center gap-1.5 drop-shadow-md">
          <span>{hasErrors ? 'Asset Download Failed' : descriptiveLabel}</span>
          {!hasErrors && <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />}
        </h2>
        {hasErrors ? (
          <>
            <p className="mt-3 text-xs text-neutral-300 leading-relaxed">
              Part of the game was missing or the download failed. Your gladiator and save data on this device are untouched.
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
            <p className="mt-3 text-[11px] font-mono text-amber-100/85 truncate max-w-[280px]">
              {total > 0 ? `Loading (${loaded}/${total}): ${cleanItemName}` : cleanItemName}
            </p>
            <div className="mt-4 flex flex-col items-center gap-1.5 min-h-[50px] justify-center">
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-600/50 text-amber-300 font-bold">
                {LORE_TIPS[tipIndex].category}
              </span>
              <p className="text-xs text-neutral-200/90 italic leading-relaxed">
                “{LORE_TIPS[tipIndex].text}”
              </p>
            </div>
          </>
        )}
      </div>

      {!hasErrors && recoveryAvailable && (
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
      )}
    </div>
  );
};

