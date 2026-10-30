import React, { useEffect } from 'react';
import { assetUrl } from '../../utils/assetUrl';
import {
  CONTACT_EMAIL,
  POLICY_LAST_UPDATED,
  PRIVACY_CONTACT_LINE,
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_SECTIONS,
  RETENTION_STATEMENT,
} from '../../data/privacyPolicy';
import {
  TERMS_LAST_UPDATED,
  TERMS_OF_SERVICE_INTRO,
  TERMS_OF_SERVICE_SECTIONS,
} from '../../data/termsOfService';

/**
 * Developer: the address a deletion request is sent to.  It is the SAME placeholder
 * the privacy policy carries (`src/data/privacyPolicy.ts`) — set BOTH to the real
 * address before publishing, because this is the address a store listing points at.
 */
export const DELETION_REQUEST_EMAIL = CONTACT_EMAIL;

/** The in-app route, written once here so the page and the game's copy agree. */
export const DELETION_IN_APP_PATH = 'Settings → Game → Delete account';

/**
 * The two public pages, at `/delete-account` and `/privacy`.
 *
 * ── Why they are components of their own ─────────────────────────────────
 * Every other screen in this game needs a session and a save; these two need
 * neither.  Google Play requires an app that creates accounts to publish a deletion
 * route and a privacy policy at stable public URLs, so both pages:
 *   • render **without any account** — nothing here reads auth, a profile or storage;
 *   • render in a **production build** too (`src/main.tsx` routes to them before the
 *     game is mounted, unconditionally);
 *   • live in their own module, dynamically imported from `main.tsx`, so neither
 *     page ships in the game's own chunk.
 *
 * The wording is data (`src/data/privacyPolicy.ts`), so a copy change never touches a
 * component.  The deletion page's own copy is written from what the code does:
 * `services/accountDeletion.ts` wipes this device's local save, deletes the sign-in
 * account, and removes the Drive backup only on the player's opt-in — and
 * `DeleteAccountModal.tsx` is the in-app flow these steps describe.
 *
 * ── Two page-level details worth knowing ─────────────────────────────────
 * `index.html` sets `overflow-hidden select-none` on `<body>` for the game's sake, so
 * each page is its own `fixed inset-0 overflow-y-auto select-text` scroll container:
 * a legal document has to scroll and its text has to be selectable.
 */
const LegalPageFrame: React.FC<{ title: string; lede?: string; children: React.ReactNode }> = ({
  title,
  lede,
  children,
}) => (
  <div className="fixed inset-0 overflow-y-auto select-text bg-neutral-950 text-neutral-200">
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14 flex flex-col gap-8">
      <header className="flex flex-col gap-2 border-b border-amber-700/40 pb-5">
        <span className="font-serif text-xs uppercase tracking-[0.3em] text-amber-500/80">
          Sand &amp; Steel
        </span>
        <h1 className="font-serif font-black text-2xl sm:text-4xl text-amber-200 leading-tight">{title}</h1>
        {lede && <p className="text-sm sm:text-base text-neutral-300 leading-relaxed">{lede}</p>}
      </header>
      <main className="flex flex-col gap-8">{children}</main>
    </div>
  </div>
);

const LegalSection: React.FC<{ heading: string; children: React.ReactNode }> = ({ heading, children }) => (
  <section className="flex flex-col gap-3">
    <h2 className="font-serif font-bold text-lg sm:text-xl text-amber-100">{heading}</h2>
    <div className="flex flex-col gap-3">{children}</div>
  </section>
);

const LegalParagraph: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm sm:text-base text-neutral-300 leading-relaxed">{children}</p>
);

/** A bulleted or numbered list drawn with its own markers, so no list-style reset can hide them. */
const LegalList: React.FC<{ items: readonly string[]; ordered?: boolean }> = ({ items, ordered = false }) => (
  <ul className="flex flex-col gap-2">
    {items.map((item, index) => (
      <li
        key={`${index}-${item.slice(0, 24)}`}
        className="flex gap-3 text-sm sm:text-base text-neutral-300 leading-relaxed"
      >
        <span aria-hidden="true" className="shrink-0 text-amber-500/80 font-mono">
          {ordered ? `${index + 1}.` : '•'}
        </span>
        <span className="min-w-0">{item}</span>
      </li>
    ))}
  </ul>
);

const LegalFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <footer className="flex flex-col gap-2 border-t border-amber-700/40 pt-5 text-xs sm:text-sm text-neutral-400">
    {children}
  </footer>
);

const LegalLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    className="text-amber-300 hover:text-amber-200 underline decoration-dotted underline-offset-4 transition-colors"
  >
    {children}
  </a>
);

/** `/privacy` — the policy, rendered from `src/data/privacyPolicy.ts`. */
export const PrivacyPolicyPage: React.FC = () => {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Privacy policy — Sand & Steel';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <LegalPageFrame title="Privacy policy" lede={PRIVACY_POLICY_INTRO}>
      {PRIVACY_POLICY_SECTIONS.map((section) => (
        <LegalSection key={section.heading} heading={section.heading}>
          {section.body.map((paragraph, index) => (
            <LegalParagraph key={index}>{paragraph}</LegalParagraph>
          ))}
        </LegalSection>
      ))}

      <LegalFooter>
        <p>{PRIVACY_CONTACT_LINE}</p>
        <p>
          Contact:{' '}
          <LegalLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink>
        </p>
        <p>Last updated: {POLICY_LAST_UPDATED}</p>
        <p>
          Terms of service: <LegalLink href={assetUrl('/terms')}>the terms of service</LegalLink>
        </p>
        <p>
          Deleting your account: <LegalLink href={assetUrl('/delete-account')}>the account deletion page</LegalLink>
        </p>
        <p>
          <LegalLink href={assetUrl('/')}>Back to the game</LegalLink>
        </p>
      </LegalFooter>
    </LegalPageFrame>
  );
};

/**
 * `/terms` — the terms of service, rendered from `src/data/termsOfService.ts`.
 *
 * A store listing needs a public terms address and a player needs to be able to read
 * the rules without an account, so this page is built exactly like the policy above:
 * the same frame, the same section list, the wording held as data.
 */
export const TermsOfServicePage: React.FC = () => {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Terms of service — Sand & Steel';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <LegalPageFrame title="Terms of service" lede={TERMS_OF_SERVICE_INTRO}>
      {TERMS_OF_SERVICE_SECTIONS.map((section) => (
        <LegalSection key={section.heading} heading={section.heading}>
          {section.body.map((paragraph, index) => (
            <LegalParagraph key={index}>{paragraph}</LegalParagraph>
          ))}
        </LegalSection>
      ))}

      <LegalFooter>
        <p>
          Contact:{' '}
          <LegalLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink>
        </p>
        <p>Last updated: {TERMS_LAST_UPDATED}</p>
        <p>
          <LegalLink href={assetUrl('/privacy')}>Privacy policy</LegalLink>
          {' · '}
          <LegalLink href={assetUrl('/delete-account')}>Account deletion</LegalLink>
        </p>
        <p>
          <LegalLink href={assetUrl('/')}>Back to the game</LegalLink>
        </p>
      </LegalFooter>
    </LegalPageFrame>
  );
};

/**
 * `/delete-account` — the public deletion-request page.  This is the URL a store
 * listing is given, so it explains the whole path without requiring a sign-in and
 * without the game running: the in-app steps, what is deleted, how long anything is
 * kept, and where to write if the player cannot sign in.
 */
export const DeleteAccountPage: React.FC = () => {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Delete your account — Sand & Steel';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <LegalPageFrame
      title="Delete your account"
      lede="Sand & Steel keeps your account in Google Firebase Authentication and your saves on your own device. You can delete your account and its data yourself, in the game, at any time — and you do not need to sign in to read this page."
    >
      <LegalSection heading="Delete it yourself, in the game">
        <LegalList
          ordered
          items={[
            'Open Sand & Steel.',
            'On the title screen or in the city, open Settings (the gear).',
            'Choose the Game section.',
            `Choose "Delete account" — the route is ${DELETION_IN_APP_PATH}.`,
            "Sign in again to confirm it's you, then confirm what is removed.",
          ]}
        />
        <LegalParagraph>
          The Game section offers Delete account only while you are signed in. A player with no account
          sees &quot;Erase this device&apos;s data&quot; there instead, which erases the gladiators saved on
          that device.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="If you can't sign in">
        <LegalParagraph>
          Write to {DELETION_REQUEST_EMAIL}, from any address, and tell us the email address on the
          account. We will delete the account and its data for you and reply to confirm it is done.
        </LegalParagraph>
      </LegalSection>

      <LegalSection heading="What is deleted">
        <LegalList
          items={[
            'Your sign-in account — the email address, the display name and the user IDs behind it — is deleted from Google Firebase Authentication. This cannot be undone.',
            'The gladiator profiles saved on the device you delete from are erased. Saves on any other device are not touched.',
            'Your cloud backup in your own Google Drive is deleted as well, if you tick that box when you confirm. That file is yours, so we ask rather than assume.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="What is kept, and for how long">
        <LegalParagraph>{RETENTION_STATEMENT}</LegalParagraph>
      </LegalSection>

      <LegalSection heading="Reading this without the game">
        <LegalParagraph>
          This page needs no account and no sign-in: it is here for the store listing, and for anyone who
          wants to read the steps before opening the game. The privacy policy is at /privacy.
        </LegalParagraph>
      </LegalSection>

      <LegalFooter>
        <p>
          Deletion requests: <LegalLink href={`mailto:${DELETION_REQUEST_EMAIL}`}>{DELETION_REQUEST_EMAIL}</LegalLink>
        </p>
        <p>
          <LegalLink href={assetUrl('/privacy')}>Privacy policy</LegalLink>
        </p>
        <p>
          <LegalLink href={assetUrl('/')}>Back to the game</LegalLink>
        </p>
      </LegalFooter>
    </LegalPageFrame>
  );
};
