import { OAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { auth } from './googleAuth';

const microsoftProvider = new OAuthProvider('microsoft.com');
microsoftProvider.setCustomParameters({ locale: 'en' });

/**
 * Trigger Sign in with Microsoft popup via Firebase.
 * Reuses the Firebase auth instance already initialised in googleAuth.ts.
 */
export const microsoftSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithPopup(auth, microsoftProvider);
    const credential = OAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Microsoft access token.');
    }
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error) {
    console.error('[MicrosoftAuth] Sign-in error:', error);
    throw error;
  }
};
