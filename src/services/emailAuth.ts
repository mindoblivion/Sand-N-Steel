import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { auth } from './googleAuth';

/**
 * Register a new account with email & password via Firebase Auth.
 */
export const emailRegister = async (
  email: string,
  password: string
): Promise<User> => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
};

/**
 * Sign in an existing account with email & password via Firebase Auth.
 */
export const emailSignIn = async (
  email: string,
  password: string
): Promise<User> => {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
};

/**
 * Sign out the current Firebase user.
 */
export const emailSignOut = async () => {
  await signOut(auth);
};
