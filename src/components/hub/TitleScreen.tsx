import React, { useRef, useEffect, useState } from 'react';
import { PlayerProfile } from '../../types/game';
import { sounds } from '../../audio/soundEffects';
import { preloadCoreGameAssets } from '../../utils/preloadAssets';
import { GoogleSignInButton } from '../ui/GoogleSignInButton';
import { FacebookSignInButton } from '../ui/FacebookSignInButton';
import { AppleSignInButton } from '../ui/AppleSignInButton';
import { MicrosoftSignInButton } from '../ui/MicrosoftSignInButton';
import { emailSignIn, emailRegister } from '../../services/emailAuth';

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
  // Email/password auth state (inline section above the guest button)
  const [emailMode, setEmailMode] = useState<'signin' | 'register'>('signin');
  const [emailVal, setEmailVal] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  // Guards against double-fire if the user clicks multiple controls in quick succession.
  const startedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePlayAsGuest = async () => {
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
    preloadCoreGameAssets();

    if (savedProfile) onContinueAdventure();
    else onNewCharacter();
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    if (!emailVal.trim() || !passwordVal) {
      setEmailError('Please enter your email and password.');
      return;
    }
    if (emailMode === 'register' && passwordVal !== confirmPasswordVal) {
      setEmailError('Passwords do not match.');
      return;
    }
    if (emailMode === 'register' && passwordVal.length < 6) {
      setEmailError('Password must be at least 6 characters.');
      return;
    }

    setIsEmailLoading(true);
    try {
      if (emailMode === 'register') {
        await emailRegister(emailVal.trim(), passwordVal);
      } else {
        await emailSignIn(emailVal.trim(), passwordVal);
      }
      sounds.playClick();
      onEmailSignIn();
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/email-already-in-use') {
        setEmailError('An account with this email already exists.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setEmailError('Incorrect email or password.');
      } else if (code === 'auth/invalid-email') {
        setEmailError('Invalid email address.');
      } else if (code === 'auth/weak-password') {
        setEmailError('Password is too weak. Use at least 6 characters.');
      } else if (code === 'auth/network-request-failed') {
        setEmailError('Network error. Check your connection.');
      } else {
        setEmailError(err?.message ?? 'Authentication failed. Please try again.');
      }
    } finally {
      setIsEmailLoading(false);
    }
  };

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

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundImage: 'url(/title_screen.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
        {/* Subtle darkening for readability */}
        <div className="absolute inset-0 bg-black/20"></div>

        {/* ── Path A atmospheric overlays (pointer-events: none, CSS-only) ── */}

        {/* Warm light pulse — slow radial glow, like sunlight through the Colosseum */}
        <div
          className="title-warm-light absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 55% 45% at 50% 22%, rgba(255,180,80,0.35) 0%, transparent 70%)',
          }}
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

        {/* Email/password sign-in section — separate, above the guest button */}
        <form
          onSubmit={handleEmailSubmit}
          className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5 w-[260px]"
          style={{ bottom: '23%' }}
        >
          {/* Mode toggle */}
          <div className="flex gap-3 mb-0.5 font-serif text-xs uppercase tracking-wider">
            <button
              type="button"
              onClick={() => { sounds.playClick(); setEmailMode('signin'); setEmailError(null); setConfirmPasswordVal(''); }}
              className={emailMode === 'signin' ? 'text-amber-300 underline' : 'text-amber-700/70'}
            >
              Sign In
            </button>
            <span className="text-amber-700/50">|</span>
            <button
              type="button"
              onClick={() => { sounds.playClick(); setEmailMode('register'); setEmailError(null); }}
              className={emailMode === 'register' ? 'text-amber-300 underline' : 'text-amber-700/70'}
            >
              Register
            </button>
          </div>

          <input
            type="email"
            placeholder="Email"
            value={emailVal}
            onChange={(e) => setEmailVal(e.target.value)}
            autoComplete="email"
            className="w-full px-3 py-2 rounded-lg bg-black/55 border border-[#8b2a2a]/40 text-amber-50 placeholder-amber-700/60 text-xs focus:outline-none focus:border-amber-600/60 transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={passwordVal}
            onChange={(e) => setPasswordVal(e.target.value)}
            autoComplete={emailMode === 'signin' ? 'current-password' : 'new-password'}
            className="w-full px-3 py-2 rounded-lg bg-black/55 border border-[#8b2a2a]/40 text-amber-50 placeholder-amber-700/60 text-xs focus:outline-none focus:border-amber-600/60 transition-colors"
          />
          {emailMode === 'register' && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPasswordVal}
              onChange={(e) => setConfirmPasswordVal(e.target.value)}
              autoComplete="new-password"
              className="w-full px-3 py-2 rounded-lg bg-black/55 border border-[#8b2a2a]/40 text-amber-50 placeholder-amber-700/60 text-xs focus:outline-none focus:border-amber-600/60 transition-colors"
            />
          )}

          {emailError && (
            <p className="text-red-400 text-[10px] text-center leading-tight">{emailError}</p>
          )}

          <button
            type="submit"
            disabled={isEmailLoading}
            className="w-full px-5 py-2 rounded-full font-serif font-bold text-xs uppercase tracking-wider text-amber-50 bg-gradient-to-r from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] hover:from-[#5c1010] hover:to-[#7a2020] shadow-[0_0_15px_rgba(107,26,26,0.5)] border border-[#8b2a2a]/60 active:scale-95 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {isEmailLoading
              ? 'Please wait…'
              : emailMode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        {/* "Play as Guest" button — positioned over the baked "PRESS TO START" artwork */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ bottom: '14%' }}
          onClick={(e) => {
            e.stopPropagation();
            startedRef.current = true;
          }}
        >
          <button
            type="button"
            onClick={handlePlayAsGuest}
            className="px-8 py-3 rounded-full font-serif font-bold text-sm uppercase tracking-wider text-amber-50 bg-gradient-to-r from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] hover:from-[#5c1010] hover:to-[#7a2020] shadow-[0_0_20px_rgba(107,26,26,0.5)] border border-[#8b2a2a]/60 active:scale-95 transition-all cursor-pointer"
          >
            Play as Guest
          </button>
        </div>

        {/* Social sign-in icons — stay at bottom */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-row items-center gap-3">
          <GoogleSignInButton
            onClick={onGoogleSignIn}
            isLoading={isGoogleLoading}
            compact
          />
          <FacebookSignInButton
            onClick={onFacebookSignIn}
            isLoading={isFacebookLoading}
            compact
          />
          <AppleSignInButton
            onClick={onAppleSignIn}
            isLoading={isAppleLoading}
            compact
          />
          <MicrosoftSignInButton
            onClick={onMicrosoftSignIn}
            isLoading={isMicrosoftLoading}
            compact
          />
        </div>
    </div>
  );
};
