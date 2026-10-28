/**
 * A5 — THE CODEX, rendered: the Library rack's Codex page.
 *
 * Run with: `bun test src/utils/codexSurface.test.tsx`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the tab exists in the SAME rack beside The Road and Triumphs, and opening
 *       it renders the Codex (no new navigation entry, no StatsTab button);
 *   §B  all five pages render with their percentage and their laurel mark — and
 *       the mark is lit only on a page at 100%;
 *   §C  touched vs untouched: a defeated rival and an owned part read as counted,
 *       an unfought rival and a missing armour piece read as dimmed and name the
 *       shop that sells them; a rival's mark is an INITIALS seal, never art;
 *   §D  the honest counts are printed, and the pages a later slice owns are
 *       ABSENT — no Fragments page, no horse-tier section, no best-hype column.
 *
 * `react-dom/server` only: no browser, no storage, no save.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { LibraryTab } from '../components/hub/LibraryTab';
import { CodexPage } from '../components/hub/CodexPage';
import { HUB_LOCATIONS } from './cityCollisions';
import { buildCodex } from './codex';

const profileWith = (patch: Partial<PlayerProfile>): PlayerProfile => ({
  ...createNewProfile('Codex Surface Tester'),
  ...patch,
});

const markupOf = (element: React.ReactElement): string => renderToStaticMarkup(element);

/** The visible words of a markup string: tags stripped, whitespace collapsed. */
const textOf = (markup: string): string =>
  markup
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const pageMarkup = (profile: PlayerProfile): string => markupOf(<CodexPage profile={profile} />);

describe('A5 §A — the Library rack\'s Codex page', () => {
  test('the tab sits beside The Road and Triumphs, and opens the Codex', () => {
    const rack = markupOf(<LibraryTab profile={profileWith({})} />);
    for (const label of ['The Road', 'Triumphs', 'Codex']) {
      expect(textOf(rack)).toContain(label);
    }
    // The Codex content is behind its own tab: the rack opens on The Road …
    expect(rack).not.toContain('data-codex');

    // … and routed onto the Codex page, it renders.
    const open = markupOf(<LibraryTab profile={profileWith({})} page="codex" />);
    expect(open).toContain('data-codex');
    expect(textOf(open)).toContain('The Codex');
  });
});

describe('A5 §B — five pages, each with its percentage and its laurel', () => {
  test('every shipped page renders, with the derivation\'s own numbers', () => {
    const profile = profileWith({
      defeatedOpponentIds: ['opp_marcus', 'opp_goliath_boss'],
      records: { codexLocations: ['colosseum', 'records_house'] },
    });
    const codex = buildCodex(profile);
    const markup = pageMarkup(profile);

    for (const page of codex.pages) {
      expect(markup).toContain(`data-codex-page="${page.id}"`);
    }
    // The five page ids, in the shipped order.
    const ids = [...markup.matchAll(/data-codex-page="([a-z]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(['gladiators', 'bosses', 'horses', 'arms', 'city']);
    // The rendered percentages are the derivation's, page by page.
    for (const page of codex.pages) {
      const block = markup.slice(markup.indexOf(`data-codex-page="${page.id}"`));
      expect(block).toContain(`data-codex-percent="${page.percent}"`);
      expect(block).toContain(`data-codex-laurel="${page.laurel ? 'true' : 'false'}"`);
    }
    expect(markup).toContain(`data-codex-percent="${codex.percent}"`);
    expect(markup).toContain(`data-codex-marks="${codex.laurelCount}"`);
    expect(textOf(markup)).toContain(`Laurels: ${codex.laurelCount} / 5`);
  });

  test('a page at 100% shows its laurel; no page at rest does', () => {
    const atRest = pageMarkup(profileWith({}));
    expect(atRest).not.toContain('data-codex-laurel="true"');

    const visited = profileWith({
      records: { codexLocations: HUB_LOCATIONS.map((location) => location.id) },
    });
    const markup = pageMarkup(visited);
    const city = markup.slice(markup.indexOf('data-codex-page="city"'));
    expect(city).toContain('data-codex-laurel="true"');
    expect(textOf(city)).toContain('Laurel');
    // The other four pages are untouched.
    expect(markup).toContain('data-codex-laurel="false"');
  });
});

describe('A5 §C — counted rows, dimmed rows, and the initials seal', () => {
  test('a defeated rival counts and an unfought one does not', () => {
    const markup = pageMarkup(profileWith({ defeatedOpponentIds: ['opp_marcus'] }));
    const marcus = markup.slice(markup.indexOf('data-codex-entry="opp_marcus"'));
    expect(marcus.slice(0, 400)).toContain('data-codex-found="true"');
    const hoplite = markup.slice(markup.indexOf('data-codex-entry="opp_hoplite"'));
    expect(hoplite.slice(0, 400)).toContain('data-codex-found="false"');
    expect(textOf(hoplite.slice(0, 900))).toContain('Not yet');
  });

  test('a missing armour piece names the shop that sells it', () => {
    const markup = pageMarkup(profileWith({}));
    const golden = markup.slice(markup.indexOf('data-codex-entry="chest_golden_muscled"'));
    expect(golden.slice(0, 700)).toContain('data-codex-found="false"');
    expect(textOf(golden.slice(0, 900))).toContain('Armor & Leather Workshop');
  });

  test('a rival\'s mark is an initials seal, not invented portrait art', () => {
    const markup = pageMarkup(profileWith({}));
    const marcus = markup.slice(markup.indexOf('data-codex-entry="opp_marcus"'));
    expect(marcus.slice(0, 700)).toContain('data-codex-seal');
    expect(textOf(marcus.slice(0, 900))).toContain('MT');
    // No <img> and no background image anywhere in the Codex.
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('url(');
  });
});

describe('A5 §D — the honest counts, and the pages that are deliberately absent', () => {
  test('no Fragments page, no horse-tier section, no best-hype column', () => {
    const markup = pageMarkup(profileWith({}));
    const text = textOf(markup);
    expect(text.toLowerCase()).not.toContain('fragments');
    expect(text.toLowerCase()).not.toContain('horse tier');
    expect(text.toLowerCase()).not.toContain('best hype');
    expect(markup).not.toContain('data-codex-page="fragments"');
    expect(markup).not.toContain('data-codex-group="horse_tiers"');
    expect(markup).not.toContain('data-codex-column');
  });

  test('the bounty board is on the Gladiators page and the Deserter is not a boss', () => {
    const markup = pageMarkup(profileWith({}));
    expect(textOf(markup)).toContain('The Bounty Board');
    expect(markup).toContain('data-codex-entry="opp_bounty_deserter"');
    const bosses = markup.slice(
      markup.indexOf('data-codex-page="bosses"'),
      markup.indexOf('data-codex-page="horses"'),
    );
    expect(bosses).not.toContain('opp_bounty_deserter');
  });
});
