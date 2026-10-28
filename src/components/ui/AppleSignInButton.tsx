import React from 'react';
import { sounds } from '../../audio/soundEffects';

interface AppleSignInButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
  className?: string;
  compact?: boolean;
}

/**
 * Reusable "Continue with Apple" button with the official Apple logo mark.
 */
export const AppleSignInButton: React.FC<AppleSignInButtonProps> = ({
  onClick,
  isLoading = false,
  label = 'Continue with Apple',
  loadingLabel = 'Connecting…',
  className = '',
  compact = false,
}) => {
  const handleClick = () => {
    sounds.playClick();
    onClick();
  };

  // UI-1 (B-9) — compact is a 48×48 target (the old 36px square was under the floor),
  // and the full pill carries the 48dp minimum height.
  const layoutClass = compact
    ? 'flex items-center justify-center w-12 h-12 min-h-[48px] min-w-[48px] rounded-full shadow-lg active:scale-90 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait'
    : 'flex items-center justify-center gap-3 min-h-[48px] px-5 py-3 rounded-full font-semibold text-xs sm:text-sm shadow-xl active:scale-95 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      aria-label={isLoading ? loadingLabel : label}
      className={`${layoutClass} bg-black hover:bg-neutral-900 text-white border border-neutral-700 ${className}`}
    >
      <svg className={compact ? 'w-5 h-5 shrink-0' : 'w-4 h-4 shrink-0'} viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      {!compact && <span>{isLoading ? loadingLabel : label}</span>}
    </button>
  );
};
