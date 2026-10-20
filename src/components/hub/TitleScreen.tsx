import React, { useRef, useEffect, useState } from 'react';
import { PlayerProfile } from '../../types/game';
import { sounds } from '../../audio/soundEffects';
import { armTitleAudioUnlock } from '../../audio/titleAudio';
import { preloadTapStage } from '../../utils/preloadAssets';
import { useTitlePhaseBackdrop } from '../../hooks/useTitlePhaseBackdrop';
import { TITLE_BACKDROP_CLASS } from '../../utils/startupAssets';
import { TitleAccountPanel } from './TitleAccountPanel';

interface TitleScreenProps {
  savedProfile: PlayerProfile | null;
  onContinueAdventure: () => void;
  onNewCharacter: () => void;
  onOpenDriveSync: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onOpenSettings?: () => void;
  onGoogleSignIn: () => void;
  isGoogleLoading: boolean;
  onFacebookSignIn: () => void;
  isFacebookLoading: boolean;
  onAppleSignIn: () => void;
  isAppleLoading: boolean;
  onMicrosoftSignIn: () => void;
  isMicrosoftLoading: boolean;
  onEmailSignIn: () => void;
}

/** Small CSS-animated Roman vexillum banner for the title screen atmosphere. */
const FlagBanner: React.FC<{
  className?: string;
  style?: React.CSSProperties;
  width?: number;
}> = ({ className, style, width = 40 }) => (
  <svg
    className={className}
    style={style}
    width={width}
    height={Math.round(width * 1.4)}
    viewBox="0 0 40 56"
    fill="none"
    aria-hidden="true"
    preserveAspectRatio="xMidYMid meet"
  >
    <line x1="2" y1="3" x2="38" y2="3" stroke="#9e7b43" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="2" cy="3" r="1.5" fill="#c4a44a" />
    <circle cx="38" cy="3" r="1.5" fill="#c4a44a" />
    <path d="M6 4 L6 38 L13 34 L20 38 L27 34 L34 38 L34 4 Z" fill="#8e251b" opacity="0.7" />
    <circle cx="20" cy="20" r="3" fill="#c4a44a" opacity="0.35" />
  </svg>
);

/** Fixed dust particle descriptors — varied drift vectors, sizes and timing. */
const DUST_PARTICLES = [
  { left: 15, size: 2, dx: 8, dy: -70, dur: 11, delay: 0, opacity: 0.3 },
  { left: 25, size: 3, dx: -5, dy: -90, dur: 14, delay: 2, opacity: 0.25 },
  { left: 35, size: 2, dx: 12, dy: -60, dur: 10, delay: 4, opacity: 0.35 },
  { left: 45, size: 2.5, dx: -8, dy: -80, dur: 13, delay: 1, opacity: 0.3 },
  { left: 55, size: 2, dx: 10, dy: -75, dur: 12, delay: 3, opacity: 0.3 },
  { left: 65, size: 3, dx: -6, dy: -85, dur: 15, delay: 5, opacity: 0.25 },
  { left: 75, size: 2, dx: 7, dy: -65, dur: 11, delay: 2.5, opacity: 0.3 },
  { left: 85, size: 2.5, dx: -10, dy: -70, dur: 14, delay: 6, opacity: 0.25 },
  { left: 20, size: 1.5, dx: 5, dy: -95, dur: 16, delay: 7, opacity: 0.2 },
  { left: 70, size: 1.5, dx: -3, dy: -100, dur: 17, delay: 8, opacity: 0.2 },
];

/**
 * START-1 — the title screen, at the designed hierarchy.
 *
 * ONE primary action: Play for a fresh profile, Continue for a returning one. The
 * account form and every OAuth button sit behind a single "Account" entry, so nothing
 * asks for input before the player has chosen to give it.
 *
 * The backdrop is the shared `.title-backdrop` rule (WebP primary, PNG fallback) that
 * `index.html` also paints as the boot shell, so the splash → title hand-off shows the
 * same picture twice rather than a blank frame between them. The phase it is painted in
 * comes from `useTitlePhaseBackdrop` — the dawn variant today, the real resolver later.
 */
export const TitleScreen: React.FC<TitleScreenProps> = ({
  savedProfile,
  onContinueAdventure,
  onNewCharacter,
  onOpenDriveSync,
  onToggleMute,
  isMuted,
  onOpenSettings,
  onGoogleSignIn,
  isGoogleLoading,
  onFacebookSignIn,
  isFacebookLoading,
  onAppleSignIn,
  isAppleLoading,
  onMicrosoftSignIn,
  isMicrosoftLoading,
  onEmailSignIn,
}) => {
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // Guards against double-fire if the player taps the primary action twice quickly.
  const startedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // START-1b resolves the real phase here; today this is the dawn variant.
  const phase = useTitlePhaseBackdrop();

  /**
   * The ONE primary action. A returning gladiator continues; a fresh one starts
   * creation. Unchanged from the tap-to-start behaviour it replaces, except that the
   * preload it triggers is now stage 2 (stage 1 ran when the title mounted).
   */
  const handlePrimaryAction = async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Attempt fullscreen. Orientation is left to the device's own controls.
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      // Graceful fail
    }

    sounds.playClick();
    preloadTapStage();

    if (savedProfile) onContinueAdventure();
    else onNewCharacter();
  };

  const handleOpenAccount = () => {
    sounds.playClick();
    setIsAccountOpen(true);
  };

  const handleCloseAccount = () => {
    sounds.playClick();
    setIsAccountOpen(false);
  };

  // Audio beat: the title paints silent, and the player's first tap anywhere unlocks
  // audio with the title motif as the first sound. Re-arms after any interruption.
  useEffect(() => armTitleAudioUnlock(), []);

  // Pause CSS animations when the tab is hidden; resume when visible.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onVisibilityChange = () => {
      el.classList.toggle('title-anim-paused', document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const primaryLabel = savedProfile ? 'Continue' : 'Play';

  return (
    <div
      ref={containerRef}
      data-title-phase={phase.id}
      className={`${TITLE_BACKDROP_CLASS} relative w-full h-full min-h-screen flex flex-col items-center justify-center overflow-hidden`}
    >
        {/* Subtle darkening for readability — the same layer the boot shell paints. */}
        <div className="absolute inset-0 bg-black/20"></div>

        {/* ── Path A atmospheric overlays (pointer-events: none, CSS-only) ── */}

        {/* The phase's own light. Dawn today; START-1b swaps in the resolved phase. */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: phase.tint }} />

        {/* Warm light pulse — slow radial glow, like sunlight through the Colosseum */}
        <div
          className="title-warm-light absolute inset-0 pointer-events-none"
          style={{ background: phase.warmLightGradient }}
        />

        {/* Fluttering flag banners — positioned along upper Colosseum structure */}
        <div className="absolute inset-0 pointer-events-none">
          <FlagBanner
            className="title-flag absolute"
            style={{ left: '11%', top: '5%', '--flag-dur': '5s' } as React.CSSProperties}
            width={36}
          />
          <FlagBanner
            className="title-flag absolute"
            style={{ right: '13%', top: '7%', '--flag-dur': '7s' } as React.CSSProperties}
            width={40}
          />
          <FlagBanner
            className="title-flag absolute"
            style={{ left: '5%', top: '20%', '--flag-dur': '6.5s' } as React.CSSProperties}
            width={28}
          />
        </div>

        {/* Drifting dust particles — tiny, behind controls, non-interactive */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {DUST_PARTICLES.map((p, i) => (
            <div
              key={i}
              className="title-dust absolute rounded-full"
              style={
                {
                  left: `${p.left}%`,
                  bottom: '0',
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  background: 'rgba(255, 220, 170, 0.5)',
                  '--dx': `${p.dx}px`,
                  '--dy': `${p.dy}px`,
                  '--dust-dur': `${p.dur}s`,
                  '--dust-delay': `${p.delay}s`,
                  '--dust-opacity': `${p.opacity}`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        {/* THE ONE PRIMARY ACTION — positioned over the baked "PRESS TO START" artwork */}
        <div className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center" style={{ bottom: '14%' }}>
          <button
            type="button"
            data-title-action={savedProfile ? 'continue' : 'play'}
            onClick={handlePrimaryAction}
            className="px-10 py-3.5 rounded-full font-serif font-bold text-base uppercase tracking-[0.2em] text-amber-50 bg-gradient-to-r from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] hover:from-[#5c1010] hover:to-[#7a2020] shadow-[0_0_20px_rgba(107,26,26,0.5)] border border-[#8b2a2a]/60 active:scale-95 transition-all cursor-pointer"
          >
            {primaryLabel}
          </button>

          {/* The single Account entry — every sign-in path lives behind it. */}
          <button
            type="button"
            data-title-action="account"
            onClick={handleOpenAccount}
            className="mt-4 px-4 py-1.5 rounded-full font-serif text-[11px] uppercase tracking-[0.25em] text-amber-200/80 border border-amber-800/40 hover:text-amber-100 hover:border-amber-600/60 transition-colors cursor-pointer"
          >
            Account
          </button>
        </div>

        {/* Version label */}
        <div className="absolute bottom-2 left-2 z-10 font-serif text-[10px] text-amber-200/40 tracking-wider pointer-events-none select-none">
          Alpha 1.0
        </div>

        {/* The account panel: the existing auth screen and the existing social
            buttons, mounted unchanged, only once the player asks for them. */}
        {isAccountOpen && (
          <TitleAccountPanel
            onClose={handleCloseAccount}
            onGoogleSignIn={onGoogleSignIn}
            isGoogleLoading={isGoogleLoading}
            onFacebookSignIn={onFacebookSignIn}
            isFacebookLoading={isFacebookLoading}
            onAppleSignIn={onAppleSignIn}
            isAppleLoading={isAppleLoading}
            onMicrosoftSignIn={onMicrosoftSignIn}
            isMicrosoftLoading={isMicrosoftLoading}
            onEmailSignIn={onEmailSignIn}
          />
        )}
    </div>
  );
};
