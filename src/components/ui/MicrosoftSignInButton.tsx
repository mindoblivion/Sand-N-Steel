import React from 'react';
import { sounds } from '../../audio/soundEffects';

interface MicrosoftSignInButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
  className?: string;
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
}) => {
  const handleClick = () => {
    sounds.playClick();
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={`flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-800 px-5 py-3 rounded-full font-semibold text-xs sm:text-sm shadow-xl active:scale-95 transition-all cursor-pointer border border-neutral-400 disabled:opacity-60 disabled:cursor-wait ${className}`}
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#7FBA00" d="M13 1h10v10H13z" />
        <path fill="#00A4EF" d="M1 13h10v10H1z" />
        <path fill="#FFB900" d="M13 13h10v10H13z" />
      </svg>
      <span>{isLoading ? loadingLabel : label}</span>
    </button>
  );
};
