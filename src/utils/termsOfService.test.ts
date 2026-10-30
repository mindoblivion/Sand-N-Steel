/**
 * termsOfService.test.ts — `/terms` is a store-facing page, so it is tested like one.
 *
 * What this suite protects, and why each one matters to Google Play / the App Store
 * review rather than only to the game:
 *   • the page exists at a single public address and renders with no account;
 *   • every section of `src/data/termsOfService.ts` is actually on the page (text that
 *     lives in a data file and is never rendered is a compliance hole, not a typo);
 *   • the footer carries the contact address, the effective date and the cross-links a
 *     reviewer follows (`/privacy`, `/delete-account`, back to the game);
 *   • a player can reach it from inside the app — the title screen and Settings — since
 *     a terms page nobody can open is the failure Play's in-app requirement targets;
 *   • the wording repeats only facts the code supports (single-player, no real-money
 *     purchases, saves on the device).
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TERMS_LAST_UPDATED,
  TERMS_OF_SERVICE_SECTIONS,
} from '../data/termsOfService';
import { CONTACT_EMAIL, DEVELOPER_NAME } from '../data/privacyPolicy';
import { TermsOfServicePage } from '../components/legal/LegalPages';
import { PUBLIC_PAGE_PATHS, resolvePublicPage } from '../components/legal/publicPages';

const source = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Rendered once: the page has no state and no data dependencies. */
const markup = renderToStaticMarkup(React.createElement(TermsOfServicePage));

describe('the /terms page', () => {
  test('it is one public address, reachable with or without a trailing slash', () => {
    expect(PUBLIC_PAGE_PATHS.terms).toBe('/terms');
    expect(resolvePublicPage('/terms')).toBe('terms');
    expect(resolvePublicPage('/terms/')).toBe('terms');
    // …and it is not accidentally reachable at some near-miss address.
    for (const other of ['/term', '/Terms', '/terms/extra']) {
      expect(resolvePublicPage(other), other).toBe(null);
    }
  });

  test('every section of the data file is rendered, heading and body', () => {
    expect(TERMS_OF_SERVICE_SECTIONS.length).toBeGreaterThan(5);
    // React escapes `'` and `&` in the markup; undo only those, so the comparison is
    // against the sentence as written rather than against its HTML encoding.
    const text = markup
      .replace(/&amp;/g, '&')
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"');
    for (const section of TERMS_OF_SERVICE_SECTIONS) {
      expect(text, section.heading).toContain(section.heading);
      expect(section.body.length).toBeGreaterThan(0);
      for (const paragraph of section.body) {
        // The opening of THIS paragraph — enough to prove it reached the page in order.
        expect(text, section.heading).toContain(paragraph.slice(0, 40));
      }
    }
  });

  test('the footer names the publisher, the address, the date, and the other pages', () => {
    expect(markup).toContain(CONTACT_EMAIL);
    expect(markup).toContain(`mailto:${CONTACT_EMAIL}`);
    expect(markup).toContain(TERMS_LAST_UPDATED);
    expect(markup).toContain(DEVELOPER_NAME);
    expect(markup).toContain('href="/privacy"');
    expect(markup).toContain('href="/delete-account"');
    expect(markup).toContain('href="/"');
    // The effective date is a real date, not a leftover placeholder.
    expect(TERMS_LAST_UPDATED).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });

  test('a player can open it from the title screen and from Settings', () => {
    const title = source('../components/hub/TitleScreen.tsx');
    expect(title).toContain("assetUrl('/terms')");
    expect(title).toContain('data-title-action="terms"');
    // Opened in a new tab, like the policy, so reading it cannot disturb a session.
    expect(title).toContain('target="_blank"');

    const settings = source('../components/hub/SettingsModal.tsx');
    expect(settings).toContain("assetUrl('/terms')");
    expect(settings).toContain('label="Terms of service"');
    expect(settings).toContain('target="_blank"');
  });

  test('it ships from the legal chunk, not the game chunk', () => {
    const main = source('../main.tsx');
    // Dynamic, exactly like the other two public pages.
    expect(main).toContain("void import('./components/legal/LegalPages')");
    expect(main).not.toContain("import { TermsOfServicePage }");
    expect(main).toContain('pages.TermsOfServicePage');
  });
});

describe('the terms text', () => {
  const body = TERMS_OF_SERVICE_SECTIONS.map((section) => section.body.join(' ')).join(' ');
  const headings = TERMS_OF_SERVICE_SECTIONS.map((section) => section.heading);

  test('it covers what a store reviewer looks for', () => {
    for (const topic of [
      'Your account',
      'Your gladiator is saved on your device',
      'No warranty',
      'Limitation of liability',
      'Children',
      'Changes to these terms',
      'Contact',
    ]) {
      expect(headings, topic).toContain(topic);
    }
  });

  test('it claims only what the code supports', () => {
    // Single-player, no real-money purchases, saves on the device, backup opt-in.
    expect(body).toContain('single-player');
    expect(body).toContain('no real-money purchases');
    expect(body).toContain('stored on your own device');
    expect(body).toContain('Google Drive');
    // Nothing in the game sells anything for money, so nothing here may promise a
    // refund policy, a subscription or a price.
    for (const token of ['$', 'USD', 'subscription fee', 'refund policy']) {
      expect(body, token).not.toContain(token);
    }
  });

  test('the publisher and the address agree with the privacy policy', () => {
    expect(body).toContain(DEVELOPER_NAME);
    expect(body).toContain(CONTACT_EMAIL);
    // One source of truth: the terms import both rather than restating them.
    const data = source('../data/termsOfService.ts');
    expect(data).toContain("import { CONTACT_EMAIL, DEVELOPER_NAME } from './privacyPolicy'");
  });
});
