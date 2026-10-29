/**
 * privacyPolicy.ts — the privacy policy's text, in ONE data file.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 * Google Play requires every app that creates accounts to publish a privacy
 * policy at a stable, public URL.  The game serves it itself, at `/privacy`
 * (`src/components/legal/LegalPages.tsx`), so the wording lives here as data:
 * changing a sentence is a change to this file alone and never touches a
 * component.
 *
 * ── Every claim below is a code fact, not a promise ──────────────────────
 *   • the sign-in account is the only identity the game holds, and it is
 *     Firebase Authentication's (`src/services/googleAuth.ts`,
 *     `emailAuth.ts`, `facebookAuth.ts`, `appleAuth.ts`, `microsoftAuth.ts`)
 *     — email + password, Google, Facebook, Apple, Microsoft;
 *   • the gladiator lives in `localStorage` under
 *     `sand_and_steel_gladiator_save_v2` (`src/services/storage.ts`) and is
 *     never uploaded on its own;
 *   • the cloud backup is written **only** when the player taps it, into the
 *     player's own Google Drive (`src/services/googleDrive.ts`);
 *   • there is no analytics library, no advertising SDK and no data sale
 *     anywhere in `src/` — the only third parties are Google Firebase
 *     (authentication) and Google Drive (the player-directed backup).
 *
 * ── The developer-supplied facts ─────────────────────────────────────────
 * `DEVELOPER_NAME`, `CONTACT_EMAIL` and `POLICY_LAST_UPDATED` are the three
 * things the policy cannot derive from code: who publishes the game, where a
 * privacy or deletion request reaches them, and when the text last changed.
 * They are set here, in this file alone.
 * `src/components/legal/LegalPages.tsx` re-uses `CONTACT_EMAIL` for deletion
 * requests rather than declaring a second address.
 */

/** Developer: the name that publishes the game. */
export const DEVELOPER_NAME = 'Phatass';

/** Developer: the address that privacy and deletion requests reach. */
export const CONTACT_EMAIL = 'phatass731@gmail.com';

/** Developer: the date this policy last changed. */
export const POLICY_LAST_UPDATED = '29 October 2026';

/** One section of the policy: a heading and its paragraphs, in order. */
export interface PrivacyPolicySection {
  heading: string;
  body: readonly string[];
}

/** The paragraph above the sections: what this document is. */
export const PRIVACY_POLICY_INTRO =
  `Sand & Steel is a single-player gladiator game. This page says, in plain words, what ` +
  `the game collects, what it never collects, where your saves live and how long anything ` +
  `is kept. It is written from the game's own code: if the code said something else, this ` +
  `page would too.`;

/**
 * The retention statement, in ONE place.
 *
 * The deletion page quotes it word for word, so the public deletion page and the
 * policy can never disagree about how long data is kept.
 */
export const RETENTION_STATEMENT =
  `We keep your account details — the email address, display name and user IDs your ` +
  `sign-in gives us — for as long as your account exists, and no longer. Deleting your ` +
  `account deletes the account itself, and it deletes the Google Drive backup only if you ` +
  `tick that option when you confirm, because that file is yours and we ask rather than ` +
  `assume. Saves on your device stay on your device until you erase them in the app or ` +
  `clear your browser's data.`;

export const PRIVACY_POLICY_SECTIONS: readonly PrivacyPolicySection[] = [
  {
    heading: 'What we collect',
    body: [
      `Only what a sign-in account needs: the email address on the account, the display ` +
        `name your sign-in provider gives us, and user IDs (your Firebase user ID and your ` +
        `provider's own account ID).`,
      `Sign-in is handled by Google Firebase Authentication. You can sign in with an email ` +
        `address and password, or with Google, Facebook, Apple or Microsoft. We never see ` +
        `your password: it goes to Firebase, not to us.`,
      `Nothing else is collected. The game holds no name, no address, no phone number, no ` +
        `payment details, no contacts, no photos and no location.`,
    ],
  },
  {
    heading: 'What we never do',
    body: [
      `No analytics. No advertising. No tracking. Your data is never sold, rented or shared ` +
        `for marketing, and there is nothing in the game that reports on how you play.`,
      `The only third parties involved are Google Firebase, which handles signing in, and ` +
        `Google Drive, which holds the backup you ask for.`,
    ],
  },
  {
    heading: 'Where your game saves live',
    body: [
      `Your gladiator, your progress and your settings are stored on your own device, in the ` +
        `browser's local storage. They are not uploaded anywhere by themselves.`,
      `A cloud backup is created only when you tap the backup button, and it is written to ` +
        `your own Google Drive, under your Google account, at your direction. It is your ` +
        `file: we keep no copy of it, and we cannot read it unless you ask us to help with a ` +
        `problem.`,
    ],
  },
  {
    heading: 'How long we keep it',
    body: [RETENTION_STATEMENT],
  },
  {
    heading: 'Deleting your account and your data',
    body: [
      `You can delete your account at any time, yourself, in the game: open Settings (the ` +
        `gear on the title screen or in the city), choose the Game section, and choose ` +
        `"Delete account". You sign in again to confirm it is you, and then you confirm what ` +
        `is removed.`,
      `The steps, what is deleted and how to ask us to do it for you are on the account ` +
        `deletion page: /delete-account`,
    ],
  },
  {
    heading: 'Children',
    body: [
      `Sand & Steel is not directed at children, and we do not knowingly collect data from ` +
        `them. If you believe a child has created an account, write to us and we will remove ` +
        `it.`,
    ],
  },
  {
    heading: 'Changes to this policy',
    body: [
      `If this policy changes, the date at the top of this page changes with it. If a change ` +
        `affects what is collected, it will be said here in plain words rather than buried in ` +
        `a revision.`,
      `Questions, or a request about your data: write to ${CONTACT_EMAIL}.`,
    ],
  },
];

/** Who publishes the game and where to write, as one sentence both pages can show. */
export const PRIVACY_CONTACT_LINE = `Sand & Steel is published by ${DEVELOPER_NAME}. Write to ${CONTACT_EMAIL}.`;
