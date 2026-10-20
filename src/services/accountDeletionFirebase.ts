/**
 * accountDeletionFirebase.ts — the provider wiring for the deletion contract.
 *
 * `accountDeletion.ts` states WHAT the flow does and in which order, with no
 * Firebase import at all; this module is the only place that knows HOW, so the
 * suite can drive the order with fake steps and never touch a real account.  It is
 * the whole of the provider half of the in-app deletion flow:
 *
 *   • **Re-confirmation.**  Firebase refuses a sensitive operation on a stale
 *     session (`auth/requires-recent-login`), so the flow re-authenticates first:
 *     an email + password account re-enters its password
 *     (`EmailAuthProvider.credential` → `reauthenticateWithCredential`), and every
 *     other account re-confirms through **its own** provider's popup
 *     (`reauthenticateWithPopup` with the matching `AuthProvider`).  A Google
 *     confirmation also carries the Drive scopes the sign-in asks for, so it hands
 *     the Drive client a fresh token for the cloud-save step.
 *   • **The Drive backup.**  Deleted through the EXISTING Drive service
 *     (`listDriveSaves` + `deleteDriveSaveFile`) — no second Drive client.
 *   • **The account**, and then this device's local saves, through the pure
 *     contract's own steps.
 *
 * Nothing here reads or writes the player's save except the local wipe the contract
 * asks for.
 */

import {
  EmailAuthProvider,
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  deleteUser as firebaseDeleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  type AuthProvider,
} from 'firebase/auth';
import { DRIVE_SCOPES, auth, setAccessToken } from './googleAuth';
import { deleteDriveSaveFile, listDriveSaves } from './googleDrive';
import {
  eraseLocalDeviceData,
  reauthMethodForProviderIds,
  runAccountDeletion,
  type SignedInUserSummary,
} from './accountDeletion';
import type { DeletionOutcome } from './accountDeletion';

/** One of the flow's own failures, carrying a code the copy maps to plain words. */
function deletionError(code: string): Error {
  const error = new Error(code) as Error & { code?: string };
  error.code = code;
  return error;
}

/**
 * The provider that re-confirms this account, or `null` when none can.
 *
 * Google's carries the same Drive scopes the sign-in asks for (`DRIVE_SCOPES`), so
 * one popup both confirms the player and refreshes the Drive token the cloud-save
 * delete needs.
 */
function popupProviderFor(providerId: string): AuthProvider | null {
  switch (providerId) {
    case 'google.com': {
      const provider = new GoogleAuthProvider();
      for (const scope of DRIVE_SCOPES) provider.addScope(scope);
      return provider;
    }
    case 'facebook.com':
      return new FacebookAuthProvider();
    case 'apple.com':
      return new OAuthProvider('apple.com');
    case 'microsoft.com':
      return new OAuthProvider('microsoft.com');
    default:
      return null;
  }
}

/** The signed-in account, in the shape the dialog shows. */
export function currentSignedInUser(): SignedInUserSummary | null {
  const user = auth.currentUser;
  if (!user) return null;
  return { email: user.email, providerIds: user.providerData.map((provider) => provider.providerId) };
}

/** Re-confirm the signed-in player, by the method their account actually uses. */
export async function reauthenticateSignedInUser(password?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw deletionError('account-deletion/not-signed-in');

  const providerIds = user.providerData.map((provider) => provider.providerId);

  if (reauthMethodForProviderIds(providerIds) === 'password') {
    if (!user.email || !password) throw deletionError('account-deletion/password-required');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return;
  }

  const provider = popupProviderFor(providerIds[0] ?? '');
  if (!provider) throw deletionError('account-deletion/unsupported-provider');

  const result = await reauthenticateWithPopup(user, provider);
  // A fresh Google confirmation hands the Drive client a usable token.
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) setAccessToken(credential.accessToken);
}

/**
 * Delete the signed-in account, in the contract's one safe order.  Resolves with
 * what actually happened; rejects (and deletes nothing) if the player cannot be
 * re-confirmed, or if the Drive backup could not be removed.
 */
export async function deleteSignedInAccount(options: {
  /** The password for an email + password account; ignored by a popup account. */
  password?: string;
  /** The player's own opt-in: also remove the cloud backup from their Drive. */
  deleteDriveSave: boolean;
}): Promise<DeletionOutcome> {
  return runAccountDeletion(
    {
      reauthenticate: () => reauthenticateSignedInUser(options.password),
      deleteDriveSave: async () => {
        const saves = await listDriveSaves();
        for (const save of saves) await deleteDriveSaveFile(save.id);
      },
      deleteUser: async () => {
        const user = auth.currentUser;
        if (!user) throw deletionError('account-deletion/not-signed-in');
        await firebaseDeleteUser(user);
      },
      eraseLocalData: () => eraseLocalDeviceData(),
      signOut: async () => {
        await signOut(auth);
      },
    },
    { deleteDriveSave: options.deleteDriveSave },
  );
}
