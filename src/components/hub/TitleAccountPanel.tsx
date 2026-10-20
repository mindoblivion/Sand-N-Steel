import React from 'react';
import { EmailAuthScreen } from './EmailAuthScreen';
import { GoogleSignInButton } from '../ui/GoogleSignInButton';
import { FacebookSignInButton } from '../ui/FacebookSignInButton';
import { AppleSignInButton } from '../ui/AppleSignInButton';
import { MicrosoftSignInButton } from '../ui/MicrosoftSignInButton';

/**
 * START-1 — the title screen's single "Account" entry point.
 *
 * The title hierarchy has ONE primary action (Play / Continue). Everything that used to
 * stand in front of it — the email/password form and all four OAuth buttons — lives
 * behind this one entry, so no form is presented before the player has decided to make
 * an account at all.
 *
 * Nothing about authentication changed: the email form is the repo's existing
 * `EmailAuthScreen` component, and the social buttons are the existing `*SignInButton`
 * components, both mounted unchanged, with the same handlers the title screen has always
 * passed them.
 */

export interface TitleAccountPanelProps {
  onClose: () => void;
  onGoogleSignIn: () => void;
  isGoogleLoading: boolean;
  onFacebookSignIn: () => void;
  isFacebookLoading: boolean;
  onAppleSignIn: () => void;
  isAppleLoading: boolean;
  onMicrosoftSignIn: () => void;
  isMicrosoftLoading: boolean;
  /** Called after a successful email sign-in, exactly as the title screen called it. */
  onEmailSignIn: () => void;
}

export const TitleAccountPanel: React.FC<TitleAccountPanelProps> = ({
  onClose,
  onGoogleSignIn,
  isGoogleLoading,
  onFacebookSignIn,
  isFacebookLoading,
  onAppleSignIn,
  isAppleLoading,
  onMicrosoftSignIn,
  isMicrosoftLoading,
  onEmailSignIn,
}) => (
  <div data-title-account-panel="1">
    {/* The email/password half — the repo's own auth screen, unmodified. */}
    <EmailAuthScreen onAuthSuccess={onEmailSignIn} onBack={onClose} />

    {/* The social half — the same four buttons, in the same row, above the panel. */}
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-row items-center gap-3">
      <GoogleSignInButton onClick={onGoogleSignIn} isLoading={isGoogleLoading} compact />
      <FacebookSignInButton onClick={onFacebookSignIn} isLoading={isFacebookLoading} compact />
      <AppleSignInButton onClick={onAppleSignIn} isLoading={isAppleLoading} compact />
      <MicrosoftSignInButton onClick={onMicrosoftSignIn} isLoading={isMicrosoftLoading} compact />
    </div>
  </div>
);
