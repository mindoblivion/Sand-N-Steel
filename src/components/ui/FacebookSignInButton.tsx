import React from 'react';
import { sounds } from '../../audio/soundEffects';

interface FacebookSignInButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
  className?: string;
}

/**
 * Reusable "Continue with Facebook" button with the official Facebook "f" mark.
 */
export const FacebookSignInButton: React.FC<FacebookSignInButtonProps> = ({
  onClick,
  isLoading = false,
  label = 'Continue with Facebook',
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
      className={`flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166FE5] text-white px-5 py-3 rounded-full font-semibold text-xs sm:text-sm shadow-xl active:scale-95 transition-all cursor-pointer border border-[#1877F2] disabled:opacity-60 disabled:cursor-wait ${className}`}
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
      <span>{isLoading ? loadingLabel : label}</span>
    </button>
  );
};
