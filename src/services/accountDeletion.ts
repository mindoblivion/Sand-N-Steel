/**
 * accountDeletion.ts — the deletion contract, with every provider left outside it.
 *
 * ── Why this module exists, and why it holds no Firebase import ───────────
 * Google Play requires an app that creates accounts to let the player delete the
 * account from inside the app.  That flow has a strict shape — confirm who you are,
 * then remove the things the player chose to remove, in an order that can never
 * leave a half-deleted account behind — and this module states that shape, and is
 * what the suite pins.
 *
 * It deliberately imports **no** Firebase module and touches **no** real session:
 * the steps arrive as an injected `DeletionSteps` record, and the provider wiring
 * (in `src/components/hub/DeleteAccountModal.tsx`) is the only place that knows
 * about Firebase at all.  So the suite drives the whole order with fake steps and
 * never comes near a real account — which is this workstream's studio rule, and the
 * reason the contract is split from the wiring.
 *
 * ── The order, and why it is this order ──────────────────────────────────
 *   1. `reauthenticate`  — Firebase refuses a sensitive operation on a stale
 *      session (`auth/requires-recent-login`), so the player confirms it is them
 *      first.  Nothing has been deleted yet, so a refusal costs nothing.
 *   2. `deleteDriveSave` — the player's own Drive backup, deleted while the
 *      re-authenticated session can still reach Drive, and **only** when the player
 *      ticked that box.  A failure here still leaves the account intact.
 *   3. `deleteUser`      — the account itself.
 *   4. `eraseLocalData`  — this device's local saves, and only AFTER the account is
 *      gone: a failed deletion must never leave a live account on a wiped device.
 *   5. `signOut`         — the session ends.  A hiccup here is swallowed: the
 *      account is already deleted, and reporting a failure then would be a lie.
 */

import { PROFILE_STORAGE_KEY } from './storage';

/**
 * The keys a device-local wipe removes: the gladiator save, and nothing else.
 *
 * Player preferences live under their own key (`sand_and_steel_settings_v1`, owned
 * by `services/settings.ts`) and are not account data, so erasing device data does
 * not touch them.  The key itself is imported rather than re-typed, so this list
 * cannot drift away from the key `storage.ts` writes.
 */
export const LOCAL_SAVE_KEYS: readonly string[] = [PROFILE_STORAGE_KEY];

/** Remove one key, and never throw: a browser refusing storage must not turn a
 *  completed deletion into an error. */
function removeLocalKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage is unavailable on this device; there is nothing else to remove.
  }
}

/**
 * Wipe this device's local save data — the guest's "Erase this device's data", and
 * the local half of a signed-in deletion.
 *
 * `remove` is injectable so the suite can drive it against a recording store; the
 * default is this device's own `localStorage`, and the wipe is pure bookkeeping —
 * no network, no Drive, no account.
 */
export function eraseLocalDeviceData(remove: (key: string) => void = removeLocalKey): void {
  for (const key of LOCAL_SAVE_KEYS) remove(key);
}

/**
 * The part of the signed-in account the deletion UI needs.
 *
 * Deliberately not Firebase's `User`: the dialog takes this shape, so it can be
 * reasoned about (and its copy checked) without a session of any kind.
 */
export interface SignedInUserSummary {
  /** The address on the account, for the "this is the account you are deleting" line. */
  email: string | null;
  /** Firebase provider ids, in the account's own order (`password`, `google.com`, …). */
  providerIds: readonly string[];
}

/** How this account has to confirm it is the player: a typed password, or a provider popup. */
export type ReauthMethod = 'password' | 'popup';

/**
 * Re-confirmation method for an account.
 *
 * An email + password account re-enters its password; every other account
 * re-confirms through its own provider's popup.  An account carrying both is asked
 * for the password, because that needs no popup and no third-party round trip.
 */
export function reauthMethodForProviderIds(providerIds: readonly string[]): ReauthMethod {
  return providerIds.includes('password') ? 'password' : 'popup';
}

/** The provider's own name, for plain-language copy ("Continue with Google"). */
export function reauthProviderLabel(providerIds: readonly string[]): string {
  if (providerIds.includes('password')) return 'your email and password';
  if (providerIds.includes('google.com')) return 'Google';
  if (providerIds.includes('facebook.com')) return 'Facebook';
  if (providerIds.includes('apple.com')) return 'Apple';
  if (providerIds.includes('microsoft.com')) return 'Microsoft';
  return 'your sign-in provider';
}

/**
 * Whether this account can reach a Google Drive backup at all.
 *
 * Only a Google sign-in carries Drive access (`googleAuth.ts` asks for the Drive
 * scopes at sign-in), so only a Google account is offered the cloud-save tick — an
 * account with no Drive connection is never asked to delete something it cannot
 * reach.
 */
export function accountCanDeleteDriveSave(providerIds: readonly string[]): boolean {
  return providerIds.includes('google.com');
}

/** The account is stale: the player confirms it is them, then tries once more. */
export const REAUTH_REQUIRED_MESSAGE = "Sign in again to confirm it's you.";

/**
 * What the player reads when the flow fails — this flow's rule is **plain words,
 * never a raw code**.
 *
 * Every branch is a sentence a player can act on.  Two of them hand the job to the
 * developer's own address, which is the honest answer when a provider cannot be
 * re-confirmed inside the app.
 */
const DELETION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'auth/requires-recent-login': REAUTH_REQUIRED_MESSAGE,
  'auth/user-token-expired': REAUTH_REQUIRED_MESSAGE,
  'auth/user-disabled': REAUTH_REQUIRED_MESSAGE,
  'auth/wrong-password': "That password doesn't match. Try again.",
  'auth/invalid-credential': "That password doesn't match. Try again.",
  'auth/invalid-login-credentials': "That password doesn't match. Try again.",
  'auth/user-mismatch': "The account you signed in with isn't the one you're deleting. Try again.",
  'auth/popup-closed-by-user': 'The confirmation window closed before it finished. Try again.',
  'auth/cancelled-popup-request': 'The confirmation window closed before it finished. Try again.',
  'auth/popup-blocked': 'Your browser blocked the confirmation window. Allow pop-ups, then try again.',
  'auth/network-request-failed': 'No connection. Check your network and try again.',
  'auth/too-many-requests': 'Too many attempts just now. Wait a moment and try again.',
  'auth/operation-not-allowed':
    "This sign-in method can't be confirmed in the app. Write to us and we'll delete the account for you.",
  'account-deletion/password-required': 'Enter your password to confirm it is you.',
  'account-deletion/not-signed-in': "You're not signed in any more. Sign in again, then try once more.",
  'account-deletion/unsupported-provider':
    "We can't confirm this sign-in method in the app. Write to us and we'll delete the account for you.",
};

/** One sentence the player can act on, for any failure — and never the raw code. */
export function deletionErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code in DELETION_ERROR_MESSAGES) {
    return DELETION_ERROR_MESSAGES[code];
  }
  return 'Something went wrong and nothing was deleted. Try again.';
}

/**
 * The steps the flow drives, in the order it drives them.
 *
 * `deleteDriveSave` is optional because the player may not have ticked the box (and
 * because an account with no Drive connection has nothing to delete there); the
 * other steps are unconditional.
 */
export interface DeletionSteps {
  /** Confirm it is the player, before anything is removed. */
  reauthenticate: () => Promise<void>;
  /** Delete the player's own Drive backup, through the existing Drive service. */
  deleteDriveSave?: () => Promise<void>;
  /** Delete the sign-in account itself. */
  deleteUser: () => Promise<void>;
  /** Wipe this device's local saves. */
  eraseLocalData: () => void;
  /** End the provider session. */
  signOut: () => Promise<void>;
}

/** What actually happened, so the confirmation can say exactly that and no more. */
export interface DeletionOutcome {
  accountDeleted: boolean;
  driveSaveDeleted: boolean;
  localDataErased: boolean;
}

/**
 * Run the deletion, in the one order that is safe (see the module header).
 *
 * Throws only before step 3 completes — a refusal to re-confirm, a Drive failure or
 * anything else means **nothing was deleted**, and the caller reports that in plain
 * words.  Once the account is gone the remaining steps are reported, not thrown.
 */
export async function runAccountDeletion(
  steps: DeletionSteps,
  options: { deleteDriveSave: boolean },
): Promise<DeletionOutcome> {
  // 1. Confirm it is the player. Nothing has been removed yet.
  await steps.reauthenticate();

  // 2. The Drive backup, while the confirmed session can still reach Drive.
  let driveSaveDeleted = false;
  if (options.deleteDriveSave && steps.deleteDriveSave) {
    await steps.deleteDriveSave();
    driveSaveDeleted = true;
  }

  // 3. The account itself.
  await steps.deleteUser();

  // 4. This device's local saves — only now that the account is gone.
  steps.eraseLocalData();

  // 5. Sign out. The account is already deleted, so a hiccup here is not a failure
  //    and must never be reported as one.
  try {
    await steps.signOut();
  } catch {
    // The session will end on its own; the deletion has already succeeded.
  }

  return { accountDeleted: true, driveSaveDeleted, localDataErased: true };
}
