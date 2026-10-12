import { FacebookAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { auth } from './googleAuth';

const fbProvider = new FacebookAuthProvider();
fbProvider.setCustomParameters({ display: 'popup' });

/**
 * Trigger Facebook Sign-In popup via Firebase.
 * Reuses the Firebase auth instance already initialised in googleAuth.ts.
 */
export const facebookSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithPopup(auth, fbProvider);
    const credential = FacebookAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Facebook access token.');
    }
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error) {
    console.error('[FacebookAuth] Sign-in error:', error);
    throw error;
  }
};
