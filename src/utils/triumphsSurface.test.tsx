/**
 * P2 — TRIUMPHS: the two surfaces, rendered.
 *
 * Run with: `bun test src/utils/triumphsSurface.test.tsx`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the Library's Triumphs page — the four honours with their fame prices, the
 *       unowned state and its buy control, the owned state (a title owned, a title
 *       owned AND displayed, the statue's own line), and the refusal wording a
 *       player who cannot afford them reads;
 *   §B  the derived rank on the character sheet — `deriveRank`'s answer at two
 *       different fame levels, with the stored `rank` field deliberately stale in
 *       both profiles so a sheet printing the stored value would fail;
 *   §C  the character sheet's owned-Triumphs list, and its empty state;
 *   §D  the naming law on both rendered surfaces — no text a player reads says
 *       "Laurel" (that word is the palma's);
 *   §E  the wiring read out of the shipped sources — the page lives inside the
 *       Library's own page list, adds no navigation entry, and App's handler is the
 *       one write (`purchaseLaurel`, then `setProfile` + `saveProfile`).
 *
 * The components are rendered with `react-dom/server`; no browser is involved and
 * no storage is read or written.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { LibraryTab } from '../components/hub/LibraryTab';
import { StatsTab } from '../components/hub/StatsTab';
import { TriumphsPage } from '../components/hub/TriumphsPage';
import { purchaseLaurel } from './laurels';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): string => readFileSync(join(SOURCE_DIR, path), 'utf8');

const markupOf = (element: React.ReactElement): string => renderToStaticMarkup(element);

/** The visible words of a markup string: icons and tags stripped, whitespace collapsed. */
const textOf = (markup: string): string =>
  markup
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const profileWith = (patch: Partial<PlayerProfile>): PlayerProfile => ({
  ...createNewProfile('Surface Tester'),
  ...patch,
});

const library = (profile: PlayerProfile): string => markupOf(<LibraryTab profile={profile} />);
const sheet = (profile: PlayerProfile): string =>
  markupOf(<StatsTab profile={profile} onAllocatePoint={() => {}} />);

// ── §A the Triumphs page ───────────────────────────────────────────────────
describe('P2 §A — the Library’s Triumphs page', () => {
  test('the page is reachable inside the Library rack, beside the Road', () => {
    const markup = library(profileWith({ fame: 0 }));
    // Both page tabs are in the rack; the Road opens by default, so the Triumphs
    // page's own content is behind its tab and the rack is what proves it exists.
    expect(markup).toContain('The Road');
    expect(markup).toContain('Triumphs');
  });

  test('the unowned page lists all four honours with their fame prices', () => {
    // The page is the second tab, so it is rendered directly for its own state.
    const markup = markupOf(<TriumphsPage profile={profileWith({ fame: 0 })} />);
    const text = textOf(markup);

    expect(markup).toContain('data-triumphs-page');
    for (const name of ['Crowd Favourite', 'Champion of the Sands', 'Living Legend', 'Ludus Statue']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('300 Fame');
    expect(text).toContain('800 Fame');
    expect(text).toContain('2,000 Fame');
    expect(text).toContain('1,200 Fame');

    // Nothing is owned, so every card offers a buy control and shows no owned copy.
    expect(markup.split('data-buy-triumph').length - 1).toBe(4);
    expect(markup.split('data-owned="true"').length - 1).toBe(0);
    expect(text).not.toContain('Your statue stands at the ludus.');
    // And the player's own record is on the page: rank and fame.
    expect(markup).toContain('data-rank="Rookie"');
    expect(text).toContain('Fame: 0');
  });

  test('a player who cannot afford them reads the refusal on every card', () => {
    const markup = markupOf(
      <TriumphsPage
        profile={profileWith({ fame: 100 })}
        onPurchase={() => ({ ok: true, profile: createNewProfile('x') })}
      />,
    );
    expect(markup.split('data-triumph-refusal').length - 1).toBe(4);
    expect(textOf(markup).split('Not enough fame.').length - 1).toBe(4);
    // No control can be pressed into a refused buy.
    expect(markup.split('disabled').length - 1).toBeGreaterThanOrEqual(4);
  });

  test('an owned title shows as owned, and the displayed one says so', () => {
    const bought = purchaseLaurel(profileWith({ fame: 5000 }), 'title_crowd_favourite');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const markup = markupOf(<TriumphsPage profile={bought.profile} />);
    const text = textOf(markup);

    expect(markup).toContain('data-triumph="title_crowd_favourite" data-owned="true"');
    expect(markup.split('data-owned="true"').length - 1).toBe(1);
    // The card offers no way to buy it again…
    expect(markup).not.toContain('data-buy-triumph="title_crowd_favourite"');
    // …and says it is the title on the record.
    expect(text).toContain('Owned · shown on your record');
    // The three it does not own still offer one.
    expect(markup.split('data-buy-triumph').length - 1).toBe(3);
    expect(text).toContain('Fame: 4,700');
  });

  test('the owned statue prints the design’s own line', () => {
    const bought = purchaseLaurel(profileWith({ fame: 5000 }), 'statue_ludus');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const markup = markupOf(<TriumphsPage profile={bought.profile} />);
    expect(markup).toContain('data-triumph="statue_ludus" data-owned="true"');
    expect(textOf(markup)).toContain('Your statue stands at the ludus.');
  });
});

// ── §B the derived rank on the character sheet ─────────────────────────────
describe('P2 §B — the character sheet shows the DERIVED rank', () => {
  test('a fresh gladiator reads Rookie', () => {
    const markup = sheet(profileWith({ fame: 0, currentTier: 1 }));
    expect(markup).toContain('data-rank="Rookie"');
    expect(textOf(markup)).toContain('Rank Rookie');
  });

  test('the same sheet at a Champion’s fame reads Champion, from a stale stored rank', () => {
    const markup = sheet(
      profileWith({ fame: 700, currentTier: 3, rank: 'Rookie' }),
    );
    // The stored field still says Rookie — nothing advances it — and the sheet
    // must print the derived rank, not that field.
    expect(markup).toContain('data-rank="Champion"');
    expect(textOf(markup)).toContain('Rank Champion');
    expect(textOf(markup)).not.toContain('Rookie');
  });

  test('a Veteran’s fame and tier read Veteran, again over a stale stored rank', () => {
    const markup = sheet(profileWith({ fame: 315, currentTier: 2, rank: 'Legend' }));
    expect(markup).toContain('data-rank="Veteran"');
    expect(textOf(markup)).not.toContain('Legend');
  });

  test('fame is printed beside the rank', () => {
    const markup = sheet(profileWith({ fame: 1234, currentTier: 1 }));
    expect(markup).toContain('data-fame="1234"');
    expect(textOf(markup)).toContain('1,234');
  });
});

// ── §C the owned Triumphs on the character sheet ───────────────────────────
describe('P2 §C — the character sheet’s career area lists the Triumphs owned', () => {
  test('nothing owned says so', () => {
    const markup = sheet(profileWith({ fame: 0 }));
    expect(textOf(markup)).toContain('No Triumphs yet.');
    expect(markup).not.toContain('data-owned-triumph');
    expect(markup).not.toContain('data-statue-line');
  });

  test('owned titles and the statue are listed by name, with the statue’s line', () => {
    const profile = profileWith({
      fame: 0,
      laurels: { titles: ['title_crowd_favourite', 'title_living_legend'], statue: true },
    });
    const markup = sheet(profile);
    const text = textOf(markup);

    expect(markup).toContain('data-owned-triumph="title_crowd_favourite"');
    expect(markup).toContain('data-owned-triumph="title_living_legend"');
    expect(markup).toContain('data-owned-triumph="statue_ludus"');
    expect(text).toContain('Crowd Favourite');
    expect(text).toContain('Living Legend');
    expect(text).toContain('Your statue stands at the ludus.');
    expect(text).not.toContain('No Triumphs yet.');
    // The one it does not own is not listed.
    expect(text).not.toContain('Champion of the Sands');
  });
});

// ── §D the naming law, rendered ────────────────────────────────────────────
describe('P2 §D — no rendered text calls the umbrella a “Laurel”', () => {
  test('the Triumphs page and the sheet print no word reserved for the palma', () => {
    const owned = profileWith({
      fame: 4200,
      laurels: { titles: ['title_champion_of_the_sands'], statue: true },
    });
    // The page is rendered directly: the Library rack opens on the Road, whose own
    // pre-existing copy legitimately speaks of the palma's laurel ("the laurel
    // hill") and is not the surface this naming law governs.
    for (const markup of [sheet(owned), markupOf(<TriumphsPage profile={owned} />)]) {
      expect(textOf(markup).toLowerCase()).not.toContain('laurel');
    }
  });
});

// ── §E the wiring ──────────────────────────────────────────────────────────
describe('P2 §E — the wiring, from the shipped sources', () => {
  const code = (path: string): string =>
    read(path)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

  test('the page is inside the Library’s rack and adds no navigation entry', () => {
    const libraryTab = code('components/hub/LibraryTab.tsx');
    expect(libraryTab).toContain("{ id: 'triumphs', label: 'Triumphs' }");
    expect(libraryTab).toContain('<TriumphsPage');

    // The hub's own tab row is untouched: no Triumphs tab key anywhere in it.
    const hub = code('components/hub/GladiatorSchoolHub.tsx');
    expect(hub).not.toMatch(/key: 'triumphs'/);
    const tabKeys = [...hub.matchAll(/\{ key: '([a-z_]+)', label:/g)].map((match) => match[1]);
    expect(tabKeys).toEqual(['tournament', 'training', 'shop', 'gear', 'stats', 'library']);
  });

  test('App’s handler is the one write: the pure transaction, then the save pair', () => {
    const app = code('App.tsx');
    const handler = app.slice(app.indexOf('const handlePurchaseTriumph'));
    const body = handler.slice(0, handler.indexOf('};') + 2);

    expect(body).toContain('purchaseLaurel(profile, laurelId)');
    expect(body).toContain('if (!result.ok) return result;');
    expect(body).toContain('setProfile(result.profile);');
    expect(body).toContain('saveProfile(result.profile);');
    // A refusal path returns before either write.
    expect(body.indexOf('if (!result.ok)')).toBeLessThan(body.indexOf('setProfile'));

    // And the hub is handed it, the library passes it on, the page calls it.
    expect(app).toContain('onPurchaseTriumph={handlePurchaseTriumph}');
    expect(code('components/hub/GladiatorSchoolHub.tsx')).toContain(
      '<LibraryTab profile={playerProfile} onPurchaseTriumph={onPurchaseTriumph} />',
    );
  });
});
