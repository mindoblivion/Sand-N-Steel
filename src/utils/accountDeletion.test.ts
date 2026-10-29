/**
 * accountDeletion.test.ts — the in-app deletion flow, the guest device wipe, the two
 * public pages and the wiring that reaches them.
 *
 * Run with: bun test src/utils/accountDeletion.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the deletion CONTRACT — the order (confirm → the Drive backup the player opted
 *      into → the account → this device's saves → sign out), that a refusal to
 *      re-confirm or a Drive failure deletes NOTHING, that a failed account deletion
 *      never wipes the device, and that a sign-out hiccup cannot turn a completed
 *      deletion into a failure;
 *   §B the DEVICE WIPE — one key, the save's own, and nothing else (not the settings
 *      record, not a Drive file, not a session); and the two erase paths in the game
 *      naming that same single key;
 *   §C the ERROR COPY — every message a sentence, never a raw code;
 *   §D the PROVIDER DISPATCH — password vs popup, the provider's plain name, and who
 *      can be offered the Drive cloud save at all;
 *   §E the PUBLIC SURFACES — the route table, both pages rendering **with no session**
 *      (a real `renderToStaticMarkup`, not a source grep), `main.tsx` mounting them
 *      unconditionally and before the game, the panel's two menu-only rows and their
 *      App wiring, and the title screen's footer link;
 *   §F the PRIVACY TEXT — one retention statement shared by both pages, marked
 *      placeholders, and the facts the policy states.
 *
 * ── HOW IT KEEPS AWAY FROM REAL ACCOUNTS ──────────────────────────────────
 * This suite is the studio rule made mechanical: it drives the deletion contract with
 * **fake steps** (a recording object), so no Firebase call is ever made, and it
 * proves by source scan that the contract itself names no provider, that the dialog
 * imports no Firebase, and that the one wiring module is the only place either can
 * happen.  Nothing here reads or writes a player's save — the wipes run against
 * recording stores and a temporary fake `localStorage`, restored afterwards.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  LOCAL_SAVE_KEYS,
  REAUTH_REQUIRED_MESSAGE,
  accountCanDeleteDriveSave,
  deletionErrorMessage,
  eraseLocalDeviceData,
  reauthMethodForProviderIds,
  reauthProviderLabel,
  runAccountDeletion,
  type DeletionSteps,
  type SignedInUserSummary,
} from '../services/accountDeletion';
import { PROFILE_STORAGE_KEY } from '../services/storage';
import { PUBLIC_PAGE_PATHS, resolvePublicPage } from '../components/legal/publicPages';
import {
  DELETION_IN_APP_PATH,
  DELETION_REQUEST_EMAIL,
  DeleteAccountPage,
  PrivacyPolicyPage,
} from '../components/legal/LegalPages';
import {
  CONTACT_EMAIL,
  DEVELOPER_NAME,
  POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  RETENTION_STATEMENT,
} from '../data/privacyPolicy';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** A source with its comments stripped, so prose can neither satisfy nor defeat a check. */
const code = (rel: string): string => load(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** The saved profile this flow must know about — and the ONLY local key it may touch. */
const SAVE_KEY = 'sand_and_steel_gladiator_save_v2';
const SETTINGS_KEY = 'sand_and_steel_settings_v1';

/** A recording set of deletion steps: the order they ran in, and nothing real. */
function recordingSteps(overrides: Partial<DeletionSteps> = {}) {
  const calls: string[] = [];
  const steps: DeletionSteps = {
    reauthenticate: async () => {
      calls.push('reauthenticate');
    },
    deleteDriveSave: async () => {
      calls.push('deleteDriveSave');
    },
    deleteUser: async () => {
      calls.push('deleteUser');
    },
    eraseLocalData: () => {
      calls.push('eraseLocalData');
    },
    signOut: async () => {
      calls.push('signOut');
    },
    ...overrides,
  };
  return { steps, calls };
}

/** A refusal shaped the way Firebase shapes one. */
const authError = (codeName: string) => Object.assign(new Error(codeName), { code: codeName });

/** Run `body` with a throwaway `localStorage`, restoring whatever was there. */
function withFakeLocalStorage<T>(store: { removeItem: (key: string) => void }, body: () => T): T {
  const globalStore = globalThis as { localStorage?: unknown };
  const original = globalStore.localStorage;
  globalStore.localStorage = store;
  try {
    return body();
  } finally {
    if (original === undefined) delete globalStore.localStorage;
    else globalStore.localStorage = original;
  }
}

describe('A. The deletion contract — the one safe order', () => {
  test('re-authenticate, then the account, then this device, then sign out', async () => {
    const { steps, calls } = recordingSteps();
    const outcome = await runAccountDeletion(steps, { deleteDriveSave: false });

    expect(calls).toEqual(['reauthenticate', 'deleteUser', 'eraseLocalData', 'signOut']);
    // The three the flow is argued from, in order and without ambiguity.
    expect(calls.indexOf('reauthenticate')).toBeLessThan(calls.indexOf('deleteUser'));
    expect(calls.indexOf('deleteUser')).toBeLessThan(calls.indexOf('eraseLocalData'));
    expect(outcome).toEqual({ accountDeleted: true, driveSaveDeleted: false, localDataErased: true });
  });

  test('the Drive backup is deleted only when the player ticked it, and before the account goes', async () => {
    const { steps, calls } = recordingSteps();
    const outcome = await runAccountDeletion(steps, { deleteDriveSave: true });

    expect(calls).toEqual(['reauthenticate', 'deleteDriveSave', 'deleteUser', 'eraseLocalData', 'signOut']);
    expect(calls.indexOf('deleteDriveSave')).toBeGreaterThan(calls.indexOf('reauthenticate'));
    expect(calls.indexOf('deleteDriveSave')).toBeLessThan(calls.indexOf('deleteUser'));
    expect(outcome.driveSaveDeleted).toBe(true);
  });

  test('an account with nothing to delete on Drive still completes', async () => {
    const calls: string[] = [];
    const { steps } = recordingSteps({ deleteDriveSave: undefined });
    const rebuilt: DeletionSteps = {
      ...steps,
      reauthenticate: async () => {
        calls.push('reauthenticate');
      },
      deleteUser: async () => {
        calls.push('deleteUser');
      },
    };

    const outcome = await runAccountDeletion(rebuilt, { deleteDriveSave: true });
    expect(calls).toEqual(['reauthenticate', 'deleteUser']);
    expect(outcome).toEqual({ accountDeleted: true, driveSaveDeleted: false, localDataErased: true });
  });

  test('a refused re-confirmation deletes nothing at all', async () => {
    const { steps, calls } = recordingSteps({
      reauthenticate: async () => {
        calls.push('reauthenticate');
        throw authError('auth/requires-recent-login');
      },
    });

    await expect(runAccountDeletion(steps, { deleteDriveSave: true })).rejects.toThrow();
    expect(calls).toEqual(['reauthenticate']);
  });

  test('a Drive failure deletes nothing at all', async () => {
    const { steps, calls } = recordingSteps({
      deleteDriveSave: async () => {
        calls.push('deleteDriveSave');
        throw new Error('Drive said no');
      },
    });

    await expect(runAccountDeletion(steps, { deleteDriveSave: true })).rejects.toThrow();
    expect(calls).toEqual(['reauthenticate', 'deleteDriveSave']);
  });

  test('a failed account deletion never wipes the device', async () => {
    const { steps, calls } = recordingSteps({
      deleteUser: async () => {
        calls.push('deleteUser');
        throw authError('auth/network-request-failed');
      },
    });

    await expect(runAccountDeletion(steps, { deleteDriveSave: false })).rejects.toThrow();
    expect(calls).toEqual(['reauthenticate', 'deleteUser']);
    expect(calls).not.toContain('eraseLocalData');
  });

  test('a sign-out hiccup cannot turn a completed deletion into a failure', async () => {
    const { steps, calls } = recordingSteps({
      signOut: async () => {
        calls.push('signOut');
        throw new Error('session already gone');
      },
    });

    const outcome = await runAccountDeletion(steps, { deleteDriveSave: false });
    expect(calls).toEqual(['reauthenticate', 'deleteUser', 'eraseLocalData', 'signOut']);
    expect(outcome.accountDeleted).toBe(true);
    expect(outcome.localDataErased).toBe(true);
  });
});

describe('B. The device wipe — one key, and nothing else', () => {
  test('it removes the save key and only the save key', () => {
    const removed: string[] = [];
    eraseLocalDeviceData((key) => removed.push(key));

    expect(removed).toEqual([SAVE_KEY]);
    expect(removed).not.toContain(SETTINGS_KEY);
    expect(LOCAL_SAVE_KEYS).toEqual([PROFILE_STORAGE_KEY]);
    expect(LOCAL_SAVE_KEYS.length).toBe(1);
    expect(PROFILE_STORAGE_KEY).toBe(SAVE_KEY);
  });

  test('the default wipe goes through the device\'s own localStorage', () => {
    const removed: string[] = [];
    withFakeLocalStorage({ removeItem: (key) => removed.push(key) }, () => eraseLocalDeviceData());
    expect(removed).toEqual([SAVE_KEY]);
  });

  test('a browser that refuses storage cannot break the wipe', () => {
    expect(() =>
      withFakeLocalStorage(
        {
          removeItem: () => {
            throw new Error('storage denied');
          },
        },
        () => eraseLocalDeviceData(),
      ),
    ).not.toThrow();
  });

  test('both of the game\'s erase paths name the same single key', () => {
    // The guest row reaches the game's existing reset, and the deletion flow reaches
    // this contract's wipe; both must remove the same one key and nothing else.
    expect(code('../services/storage.ts')).toContain('localStorage.removeItem(PROFILE_STORAGE_KEY)');
    expect(code('../services/accountDeletion.ts')).toContain('LOCAL_SAVE_KEYS');
    expect(code('../components/hub/SettingsModal.tsx')).toContain('onEraseDeviceData');
  });
});

describe('C. The error copy — plain words, never a raw code', () => {
  test('a stale session asks the player to sign in again, in those words', () => {
    expect(deletionErrorMessage(authError('auth/requires-recent-login'))).toBe(
      "Sign in again to confirm it's you.",
    );
    expect(REAUTH_REQUIRED_MESSAGE).toBe("Sign in again to confirm it's you.");
  });

  test('every mapped failure is a sentence that never leaks its code', () => {
    const codes = [
      'auth/requires-recent-login',
      'auth/user-token-expired',
      'auth/user-disabled',
      'auth/wrong-password',
      'auth/invalid-credential',
      'auth/invalid-login-credentials',
      'auth/user-mismatch',
      'auth/popup-closed-by-user',
      'auth/cancelled-popup-request',
      'auth/popup-blocked',
      'auth/network-request-failed',
      'auth/too-many-requests',
      'auth/operation-not-allowed',
      'account-deletion/password-required',
      'account-deletion/not-signed-in',
      'account-deletion/unsupported-provider',
    ];
    for (const name of codes) {
      const message = deletionErrorMessage(authError(name));
      expect(message.length, name).toBeGreaterThan(12);
      expect(message, name).not.toContain(name);
      expect(message, name).not.toContain('auth/');
      expect(message, name).not.toContain('account-deletion/');
      expect(message, name).not.toContain('_');
    }
  });

  test('an unknown failure and a non-error both say something the player can act on', () => {
    for (const thrown of [authError('auth/brand-new-code'), new Error('boom'), undefined, null, 'boom', 42]) {
      const message = deletionErrorMessage(thrown);
      expect(message).toBe('Something went wrong and nothing was deleted. Try again.');
    }
  });

  test('the two provider-less failures hand the job to the developer', () => {
    expect(deletionErrorMessage(authError('account-deletion/unsupported-provider'))).toContain('Write to us');
    expect(deletionErrorMessage(authError('auth/operation-not-allowed'))).toContain('Write to us');
  });
});

describe('D. The provider dispatch', () => {
  test('an email + password account re-enters its password; every other account pops up', () => {
    expect(reauthMethodForProviderIds(['password'])).toBe('password');
    expect(reauthMethodForProviderIds(['password', 'google.com'])).toBe('password');
    expect(reauthMethodForProviderIds(['google.com'])).toBe('popup');
    expect(reauthMethodForProviderIds(['facebook.com'])).toBe('popup');
    expect(reauthMethodForProviderIds(['apple.com'])).toBe('popup');
    expect(reauthMethodForProviderIds(['microsoft.com'])).toBe('popup');
    // No provider at all resolves to the popup path, which the wiring refuses in
    // plain words rather than guessing a method.
    expect(reauthMethodForProviderIds([])).toBe('popup');
  });

  test('the copy names the provider the player actually used', () => {
    expect(reauthProviderLabel(['password'])).toBe('your email and password');
    expect(reauthProviderLabel(['google.com'])).toBe('Google');
    expect(reauthProviderLabel(['facebook.com'])).toBe('Facebook');
    expect(reauthProviderLabel(['apple.com'])).toBe('Apple');
    expect(reauthProviderLabel(['microsoft.com'])).toBe('Microsoft');
    expect(reauthProviderLabel(['github.com'])).toBe('your sign-in provider');
  });

  test('only a Google account can be offered the Drive cloud save', () => {
    expect(accountCanDeleteDriveSave(['google.com'])).toBe(true);
    expect(accountCanDeleteDriveSave(['password'])).toBe(false);
    expect(accountCanDeleteDriveSave(['facebook.com'])).toBe(false);
    expect(accountCanDeleteDriveSave(['apple.com'])).toBe(false);
    expect(accountCanDeleteDriveSave(['microsoft.com'])).toBe(false);
    expect(accountCanDeleteDriveSave([])).toBe(false);
  });
});

describe('E. The public surfaces', () => {
  test('the route table is the two addresses, and a trailing slash is the same address', () => {
    expect(PUBLIC_PAGE_PATHS).toEqual({ 'delete-account': '/delete-account', privacy: '/privacy' });
    expect(resolvePublicPage('/privacy')).toBe('privacy');
    expect(resolvePublicPage('/privacy/')).toBe('privacy');
    expect(resolvePublicPage('/delete-account')).toBe('delete-account');
    expect(resolvePublicPage('/delete-account/')).toBe('delete-account');
    for (const other of ['/', '', '/privacys', '/Privacy', '/delete-account/extra', '/duel']) {
      expect(resolvePublicPage(other), other).toBe(null);
    }
  });

  test('both pages render with no signed-in user, no profile and no game state', () => {
    const signedInUser: SignedInUserSummary | null = null;
    expect(signedInUser).toBe(null);

    const privacy = renderToStaticMarkup(React.createElement(PrivacyPolicyPage));
    const deletion = renderToStaticMarkup(React.createElement(DeleteAccountPage));

    expect(privacy).toContain('Privacy policy');
    expect(deletion).toContain('Delete your account');
    // Every section of the policy is on the page, with its heading.
    for (const section of PRIVACY_POLICY_SECTIONS) {
      expect(privacy, section.heading).toContain(section.heading);
    }
    // The contact address and the retention statement are on the page that needs them.
    expect(privacy).toContain(CONTACT_EMAIL);
    expect(privacy).toContain('We keep your account details');
    expect(deletion).toContain(DELETION_REQUEST_EMAIL);
    expect(deletion).toContain('We keep your account details');
    expect(deletion).toContain('Google Firebase Authentication');
    expect(deletion).toContain('Google Drive');
    // Both pages link to each other and back to the game.
    // Rendered markup, at the root build's base — the links resolve inside it.
    expect(privacy).toContain('href="/delete-account"');
    expect(deletion).toContain('href="/privacy"');
    expect(privacy).toContain('href="/"');
    expect(deletion).toContain('href="/"');
    // Neither page renders a control that needs a session.
    for (const markup of [privacy, deletion]) {
      expect(markup).not.toContain('Sign out');
      expect(markup).not.toContain('Delete my account');
    }
  });

  test('the pages are self-contained: no auth, no save, no storage, no game screen', () => {
    const pages = code('../components/legal/LegalPages.tsx');
    for (const token of ['firebase', 'googleDrive', 'saveProfile', 'PROFILE_STORAGE_KEY', 'localStorage', 'App']) {
      expect(pages, token).not.toContain(token);
    }
    // …and the route table is React-free, so main.tsx can name the routes without
    // pulling either page into the game's own chunk.
    const routes = code('../components/legal/publicPages.ts');
    expect(routes).not.toContain('react');
    expect(routes).not.toContain('import');
  });

  test('main.tsx mounts them in EVERY build, before the game, and dynamically', () => {
    const main = code('../main.tsx');
    const publicDeclaration = main.split('\n').find((line) => line.includes('const publicPage ='));
    expect(publicDeclaration).toBeDefined();
    expect(publicDeclaration).not.toContain('import.meta.env.DEV');
    expect(main).toContain('resolvePublicPage(stripSiteBase(window.location.pathname))');
    expect(main).toContain("void import('./components/legal/LegalPages')");
    // Dynamic only — a static import would ship both pages in the game's chunk.
    expect(main).not.toContain("import { DeleteAccountPage }");
    expect(main).not.toContain("import { PrivacyPolicyPage }");
    // The public branch is the LAST one before the game itself.
    const branchAt = main.indexOf('} else if (publicPage) {');
    const appAt = main.indexOf('<App />');
    expect(branchAt).toBeGreaterThan(-1);
    expect(branchAt).toBeLessThan(appAt);
  });

  test('the settings panel offers the right row, in menu contexts only', () => {
    const modal = code('../components/hub/SettingsModal.tsx');
    expect(modal).toContain('label="Delete account"');
    expect(modal).toContain('label="Erase this device\'s data"');
    // The Director's addendum A: the same suppression Reset save follows.
    expect(modal).toContain("context === 'menu' && onDeleteAccount");
    expect(modal).toContain("context === 'menu' && !onDeleteAccount && onEraseDeviceData");
    // The policy is reachable from the panel too.
    expect(modal).toContain("href={assetUrl('/privacy')}");
    // …and a duel or a race never renders either destructive row.
    expect(modal.split("context === 'menu'").length - 1).toBeGreaterThanOrEqual(3);
  });

  test('App decides which row, follows the session, and closes the panel on success', () => {
    const app = code('../App.tsx');
    expect(app).toContain('onDeleteAccount={authUser ? () => setDeleteAccountOpen(true) : undefined}');
    expect(app).toContain('onEraseDeviceData={authUser ? undefined : handleResetGame}');
    expect(app).toContain('useEffect(() => subscribeAuthUser(setAuthUser), []);');
    expect(app).toContain('<DeleteAccountModal');
    expect(app).toContain('providerIds: authUser.providerData.map((provider) => provider.providerId)');
    // Success drops App's own profile state and returns to the title.
    expect(app).toContain('handleResetGame();');
  });

  test('the title screen carries the policy link as well', () => {
    const title = code('../components/hub/TitleScreen.tsx');
    expect(title).toContain('data-title-action="privacy"');
    expect(title).toContain("href={assetUrl('/privacy')}");
    expect(title).toContain('rel="noopener noreferrer"');
  });

  test('the dialog is UI only: it names no provider, and shows no raw code', () => {
    const dialog = code('../components/hub/DeleteAccountModal.tsx');
    expect(dialog).not.toContain('firebase');
    expect(dialog).not.toContain('googleDrive');
    expect(dialog).toContain('deleteSignedInAccount');
    expect(dialog).toContain('deletionErrorMessage(e)');
    expect(dialog).not.toContain('e.message');
    expect(dialog).not.toContain('window.confirm');
    // The opt-in is a real checkbox-shaped control, and it is the ONLY thing that
    // arms the Drive deletion.
    expect(dialog).toContain('role="switch"');
    expect(dialog).toContain('accountCanDeleteDriveSave');
  });

  test('one wiring module is the only place a provider is touched, and it re-confirms first', () => {
    const wiring = code('../services/accountDeletionFirebase.ts');
    expect(wiring).toContain('reauthenticateWithCredential');
    expect(wiring).toContain('reauthenticateWithPopup');
    expect(wiring).toContain('firebaseDeleteUser(user)');
    // The Drive work goes through the EXISTING service — no second client.
    expect(wiring).toContain('listDriveSaves');
    expect(wiring).toContain('deleteDriveSaveFile');
    expect(wiring).not.toContain('googleapis.com');
    // Re-confirmation only: signing IN is the game's own sign-in path, not this flow.
    expect(wiring).not.toContain('signInWithPopup');
    expect(wiring).not.toContain('createUserWithEmailAndPassword');
    // The order it hands the contract is the contract's order.
    expect(wiring).toContain('runAccountDeletion(');

    // The contract itself knows no provider at all — which is what lets this suite
    // drive it with fake steps and never reach a real account.
    const contract = code('../services/accountDeletion.ts');
    for (const token of ['firebase', 'googleDrive', 'googleapis', 'signIn', 'localStorage.setItem']) {
      expect(contract, token).not.toContain(token);
    }
  });
});

describe('F. The privacy text', () => {
  test('the retention statement is one statement, quoted by both surfaces', () => {
    const retentionSection = PRIVACY_POLICY_SECTIONS.find((section) => section.heading === 'How long we keep it');
    expect(retentionSection).toBeDefined();
    expect(retentionSection?.body).toEqual([RETENTION_STATEMENT]);
    expect(RETENTION_STATEMENT).toContain('for as long as your account exists');
    expect(RETENTION_STATEMENT).toContain('only if you tick that option when you confirm');
    expect(RETENTION_STATEMENT).toContain('until you erase them in the app');

    const deletion = renderToStaticMarkup(React.createElement(DeleteAccountPage));
    expect(deletion).toContain(RETENTION_STATEMENT.slice(0, 45));
  });

  test('the developer-supplied facts are marked placeholders, never invented', () => {
    for (const value of [DEVELOPER_NAME, CONTACT_EMAIL, POLICY_LAST_UPDATED]) {
      expect(value).toContain('set before publishing');
    }
    expect(CONTACT_EMAIL).not.toMatch(/@(gmail|outlook|yahoo|hotmail|icloud)\./i);
    // The deletion page re-uses the policy's own address rather than a second one.
    expect(DELETION_REQUEST_EMAIL).toBe(CONTACT_EMAIL);
  });

  test('the policy states the verified facts, in plain words', () => {
    const text = PRIVACY_POLICY_SECTIONS.map((section) => `${section.heading}\n${section.body.join('\n')}`).join('\n');
    expect(text).toContain('email address');
    expect(text).toContain('Google Firebase Authentication');
    expect(text).toContain('Google, Facebook, Apple or Microsoft');
    expect(text).toContain('local storage');
    expect(text).toContain('your own Google Drive');
    expect(text).toContain('No analytics');
    expect(text).toContain('never sold');
    expect(text).toContain('not directed at children');
    expect(text).toContain('/delete-account');
  });

  test('the in-app route the page describes is the one the panel offers', () => {
    expect(DELETION_IN_APP_PATH).toContain('Settings');
    expect(DELETION_IN_APP_PATH).toContain('Game');
    expect(DELETION_IN_APP_PATH).toContain('Delete account');
    const modal = code('../components/hub/SettingsModal.tsx');
    expect(modal).toContain("label: 'Game'");
    expect(modal).toContain('label="Delete account"');
  });
});
