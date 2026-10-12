import { OAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { auth } from './googleAuth';

const appleProvider = new OAuthProvider('apple.com');
appleProvider.setCustomParameters({ locale: 'en' });

/**
 * Trigger Sign in with Apple popup via Firebase.
 * Reuses the Firebase auth instance already initialised in googleAuth.ts.
 */
export const appleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithPopup(auth, appleProvider);
    const credential = OAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Apple access token.');
    }
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error) {
    console.error('[AppleAuth] Sign-in error:', error);
    throw error;
  }
};
