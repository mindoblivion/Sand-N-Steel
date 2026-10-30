/**
 * termsOfService.ts — the terms of service text, in ONE data file.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 * The game serves its own terms at `/terms` (`src/components/legal/LegalPages.tsx`),
 * so a store listing has a stable, public address to point at, and every player can
 * read them without signing in.  The wording is data, exactly like the privacy
 * policy: changing a sentence is a change to this file alone.
 *
 * ── Every claim below is a code fact, not a promise ──────────────────────
 *   • the game is single-player: there is no matchmaking, no PvP and no server-side
 *     game state anywhere in `src/`;
 *   • the account is Google Firebase Authentication's (`src/services/googleAuth.ts`
 *     and friends), and the gladiator lives in `localStorage`
 *     (`src/services/storage.ts`), uploaded nowhere on its own;
 *   • the cloud backup is written only on the player's tap, into the player's own
 *     Google Drive (`src/services/googleDrive.ts`);
 *   • there is **no real-money purchase anywhere**: gold, gear, chariot parts and
 *     storefront offers are all bought with in-game gold (`src/utils/storefrontPurchase.ts`,
 *     `src/utils/chariotLoadout.ts`, `src/utils/visitorPurchase.ts`), and no billing
 *     SDK is installed;
 *   • there is no analytics library and no advertising SDK.
 *
 * `DEVELOPER_NAME`, `CONTACT_EMAIL` and the effective date are the facts terms cannot
 * derive from code, and they are imported from `privacyPolicy.ts` rather than
 * restated, so the two documents cannot disagree about who to write to.
 */

import { CONTACT_EMAIL, DEVELOPER_NAME } from './privacyPolicy';

/** Developer: the date these terms last changed. */
export const TERMS_LAST_UPDATED = '29 October 2026';

/** One section of the terms: a heading and its paragraphs, in order. */
export interface TermsSection {
  heading: string;
  body: readonly string[];
}

/** The paragraph above the sections: what this document is. */
export const TERMS_OF_SERVICE_INTRO =
  `These are the rules for playing Sand & Steel. They are written in plain words, and ` +
  `they describe what the game actually does rather than what it might do one day.`;

export const TERMS_OF_SERVICE_SECTIONS: readonly TermsSection[] = [
  {
    heading: 'Agreeing to these terms',
    body: [
      `By playing Sand & Steel you agree to these terms. If you do not agree with them, ` +
        `please do not use the game.`,
      `These terms apply to the game itself, on every platform it is published on — the ` +
        `web, Android, iOS, Windows and macOS — and they apply whether you play as a guest ` +
        `or signed in.`,
    ],
  },
  {
    heading: 'Who publishes the game',
    body: [
      `Sand & Steel is published by ${DEVELOPER_NAME}. Questions about these terms, or ` +
        `anything else, can be sent to ${CONTACT_EMAIL}.`,
    ],
  },
  {
    heading: 'Your account',
    body: [
      `You can play as a guest, with no account at all, and everything works: the gladiator, ` +
        `the arena, the city and the races. An account exists only so a gladiator can be ` +
        `carried between devices, and it is created through Google Firebase Authentication ` +
        `(email and password, Google, Facebook, Apple or Microsoft).`,
      `You are responsible for the sign-in you use and for keeping its password to yourself. ` +
        `Use an account and a sign-in you are entitled to use.`,
      `You can delete your account at any time, in the game (Settings → Game → Delete ` +
        `account) or from the public deletion page at /delete-account.`,
    ],
  },
  {
    heading: 'Your gladiator is saved on your device',
    body: [
      `Your save — the gladiator, their record, gold, gear and progress — is stored on your ` +
        `own device, in this browser or this app's storage. It is not held on a server of ` +
        `ours, and it is never uploaded on its own.`,
      `If you choose the cloud backup, the save is written to your own Google Drive, on your ` +
        `say-so. Clearing your browser data, uninstalling the app or losing the device takes ` +
        `the save with it; the backup is the way to keep it, and it is worth doing.`,
    ],
  },
  {
    heading: 'Gold, gear and purchases',
    body: [
      `Everything in Sand & Steel is bought with in-game gold, which you earn by fighting, ` +
        `racing and winning. There are no real-money purchases, no loot boxes, no paid ` +
        `currency and no subscriptions: no billing service is used by the game at all, so ` +
        `there is nothing to refund and nothing to cancel.`,
      `In-game gold, gear and progress have no cash value, cannot be transferred to another ` +
        `player, and cannot be exchanged for money.`,
    ],
  },
  {
    heading: 'Playing fairly',
    body: [
      `Sand & Steel is single-player: there is no matchmaking, no player-versus-player and no ` +
        `shared world, so how you play cannot spoil anyone else's game.`,
      `Please do not use the game to break the law, do not attack or overload the services it ` +
        `relies on (for example the sign-in service), and do not redistribute the game or its ` +
        `assets as your own.`,
    ],
  },
  {
    heading: 'The game and its content',
    body: [
      `The game's art, models, audio, text, code and the Sand & Steel name belong to their ` +
        `maker and are protected by copyright. Playing the game gives you a personal, ` +
        `non-exclusive licence to play it — not ownership of it, and not permission to sell, ` +
        `re-publish or re-brand it.`,
      `Anything you create yourself — your gladiator's name, their look, their choices — is ` +
        `yours; it lives in your own save.`,
    ],
  },
  {
    heading: 'Changes and availability',
    body: [
      `Sand & Steel is being built in the open and is still growing: mechanics, items, balance ` +
        `and the city itself can change between releases, and a save may be adjusted to fit a ` +
        `new version.`,
      `The game runs offline, but an account sign-in and the cloud backup need a connection, ` +
        `so those two features are only as available as the network and the sign-in service. ` +
        `We may update the game, and we may stop publishing it on a platform — if that ever ` +
        `happens, the copy on your device keeps working.`,
    ],
  },
  {
    heading: 'No warranty',
    body: [
      `The game is provided as it is. We work to keep it correct and your saves safe, but we ` +
        `cannot promise it will always run without a fault, or that a device, a browser store ` +
        `or an uninstall will never lose a save — keep the cloud backup if the record matters ` +
        `to you.`,
    ],
  },
  {
    heading: 'Limitation of liability',
    body: [
      `To the extent the law allows, ${DEVELOPER_NAME} is not liable for indirect or ` +
        `consequential losses arising from playing the game, including lost progress. Nothing ` +
        `in these terms limits a right you have under the consumer law that applies where you ` +
        `live.`,
    ],
  },
  {
    heading: 'Children',
    body: [
      `Sand & Steel is not directed at children, and it is not designed to collect anything ` +
        `from them. If you believe a child has created an account, write to ${CONTACT_EMAIL} ` +
        `and the account will be removed.`,
    ],
  },
  {
    heading: 'Ending these terms',
    body: [
      `You can stop at any time: delete your account and erase the save on your device, and ` +
        `nothing is left behind (the deletion page says exactly what is removed).`,
      `We may end access for someone who attacks the game or its services, or who uses it to ` +
        `harm others.`,
    ],
  },
  {
    heading: 'Changes to these terms',
    body: [
      `If these terms change, the date at the top of this page changes with it, and a change ` +
        `that affects you will be said here in plain words rather than buried in a revision.`,
    ],
  },
  {
    heading: 'Contact',
    body: [
      `Sand & Steel is published by ${DEVELOPER_NAME}. Write to ${CONTACT_EMAIL} about these ` +
        `terms, your account or your data — the privacy policy is at /privacy and the account ` +
        `deletion page is at /delete-account.`,
    ],
  },
];
