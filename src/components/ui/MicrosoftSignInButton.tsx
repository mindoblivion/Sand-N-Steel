import React from 'react';
import { sounds } from '../../audio/soundEffects';

interface MicrosoftSignInButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
  className?: string;
  compact?: boolean;
}

/**
 * Reusable "Continue with Microsoft" button with the official four-square Microsoft mark.
 */
export const MicrosoftSignInButton: React.FC<MicrosoftSignInButtonProps> = ({
  onClick,
  isLoading = false,
  label = 'Continue with Microsoft',
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
      className={`${layoutClass} bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-400 ${className}`}
    >
      <svg className={compact ? 'w-5 h-5 shrink-0' : 'w-4 h-4 shrink-0'} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#7FBA00" d="M13 1h10v10H13z" />
        <path fill="#00A4EF" d="M1 13h10v10H1z" />
        <path fill="#FFB900" d="M13 13h10v10H13z" />
      </svg>
      {!compact && <span>{isLoading ? loadingLabel : label}</span>}
    </button>
  );
};
