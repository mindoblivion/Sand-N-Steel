import React from 'react';
import { sounds } from '../../audio/soundEffects';

interface AppleSignInButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
  className?: string;
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
      className={`flex items-center justify-center gap-3 bg-black hover:bg-neutral-900 text-white px-5 py-3 rounded-full font-semibold text-xs sm:text-sm shadow-xl active:scale-95 transition-all cursor-pointer border border-neutral-700 disabled:opacity-60 disabled:cursor-wait ${className}`}
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      <span>{isLoading ? loadingLabel : label}</span>
    </button>
  );
};
