/**
 * LADDER-1E Part 5 — the race card (PreRacePanel).
 *
 * The card is rendered server-side at every state (the diceTrail pattern:
 * `.ts` with `React.createElement` — bun's `.ts` transform rejects JSX),
 * and the assertions read the rendered markup through the panel's
 * `data-race-field` attributes.  The panel's selected rung is session
 * state (`useState`, default District), so a static render always shows
 * the District-selected card; the League-selected rows render through the
 * same code paths (the same rows, fed by the League values), and those
 * values are pinned by the pure helpers — `resolveQualifyingSlot`,
 * `formatRacePlace`, `fortunasHandRatesText`, `resolveRaceTier` — in their
 * own suites.  What this suite pins here: the District render at every
 * profile state, the lock opening, and the panel staying read-only.
 *
 * Run with: `bun test src/components/hub/preRacePanel.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { PlayerProfile } from '../../types/game';
import { createNewProfile } from '../../services/storage';
import { PreRacePanel } from './PreRacePanel';

const render = (profile: PlayerProfile): string =>
  renderToStaticMarkup(
    React.createElement(PreRacePanel, {
      profile,
      onLeave: () => undefined,
      onStartRace: () => undefined,
    }),
  );

/** The League rung button's opening tag, for the lock assertions. */
const leagueButtonTag = (html: string): string => {
  const match = html.match(/<button[^>]*data-race-rung="league"[^>]*>/);
  if (!match) throw new Error('the League rung button must render');
  return match[0];
};

/** A profile with the given per-rung racing record (merged onto a fresh profile). */
const withRacing = (racing: PlayerProfile['racing']): PlayerProfile => ({
  ...createNewProfile('Ladder Racer'),
  racing,
});

describe('PreRacePanel — LADDER-1E Part 5: per-rung bests for the selected rung', () => {
  test('a fresh profile shows no best time and no District finish', () => {
    const html = render(createNewProfile('Ladder Racer'));
    expect(html).toContain('No recorded lap');
    expect(html).toContain('No District finish yet');
  });

  test('a District finish shows the best finish beside the team best time', () => {
    // The best time stays keyed by TEAM SIZE (bestTimes[2]) — the key
    // does not change — and the rung's best finish sits beside it.
    const html = render(withRacing({ districtBestFinish: 2, bestTimes: { 2: 15000 } }));
    expect(html).toContain('00:15.0');
    expect(html).toContain('data-race-field="rung-best-finish"');
    expect(html).toContain('>2nd<');
  });

  test('a District win shows 1st; a malformed finish shows no finish at all', () => {
    const win = render(withRacing({ districtBestFinish: 1 }));
    expect(win).toContain('>1st<');
    for (const bad of [0, -1, 1.5, Number.NaN, 'first' as unknown as number]) {
      const html = render(withRacing({ districtBestFinish: bad }));
      expect(html).toContain('No District finish yet');
      expect(html).toContain('Starting last');
    }
  });
});

describe('PreRacePanel — LADDER-1E Part 5: the lock opens, and the opened state shows', () => {
  test('a fresh profile sees the League locked, with the plain-language requirement', () => {
    const html = render(createNewProfile('Ladder Racer'));
    const button = leagueButtonTag(html);
    expect(button).toContain('aria-disabled="true"');
    expect(button).toMatch(/\sdisabled=""/);
    expect(html).toContain('Top-2 finish in a District race');
  });

  test('a District top-2 opens the League — the button is enabled and names the laps', () => {
    const html = render(withRacing({ districtBestFinish: 2 }));
    const button = leagueButtonTag(html);
    expect(button).toContain('aria-disabled="false"');
    expect(button).not.toMatch(/\sdisabled=""/);
    expect(html).toContain('5 laps · 4 rivals');
  });

  test('a District 3rd keeps the League locked', () => {
    const html = render(withRacing({ districtBestFinish: 3 }));
    expect(leagueButtonTag(html)).toContain('aria-disabled="true"');
  });
});

describe('PreRacePanel — LADDER-1E Part 5: Fortuna\'s Hand rates and the qualifying slot', () => {
  test('the card prints the Hand rates for the selected rung, from the Hand\'s own table', () => {
    const html = render(createNewProfile('Ladder Racer'));
    expect(html).toContain('data-race-field="fortunas-hand"');
    expect(html).toContain('Fortuna');
    expect(html).toContain('District');
    expect(html).toContain('rivals behind +4%, ahead -3%');
  });

  test('no finish at the rung: the player starts last', () => {
    const html = render(createNewProfile('Ladder Racer'));
    expect(html).toContain('data-race-field="qualifying-slot"');
    expect(html).toContain('Starting last — no finish at this rung yet');
  });

  test('a District 2nd qualifies the player P3', () => {
    const html = render(withRacing({ districtBestFinish: 2 }));
    expect(html).toContain('Starting P3 — best District finish 2nd');
  });

  test('a District win qualifies the player P1, on the front row', () => {
    const html = render(withRacing({ districtBestFinish: 1 }));
    expect(html).toContain('Starting P1 — best District finish 1st');
  });
});

describe('PreRacePanel — LADDER-1E Part 5: the purse figures are the code\'s table', () => {
  test('a Biga shows the 80g base and the +20g victory bonus — never the shorthand', () => {
    const html = render(createNewProfile('Ladder Racer'));
    expect(html).toContain('80g');
    expect(html).toContain('+20g');
    expect(html).not.toContain('100g');
  });

  test('a Triga shows the 120g base and the +30g victory bonus', () => {
    const html = render(withRacing({
      unlocked: [2, 3],
      selected: 3,
      bestTimes: { 3: 14000 },
    }));
    expect(html).toContain('120g');
    expect(html).toContain('+30g');
    expect(html).toContain('00:14.0');
  });
});

describe('PreRacePanel — read-only (the panel writes nothing)', () => {
  test('the panel imports no storage and calls no save writer', () => {
    const panel = readFileSync(new URL('./PreRacePanel.tsx', import.meta.url), 'utf8');
    for (const forbidden of ['saveProfile', 'localStorage', 'sessionStorage', 'indexedDB', 'settleRaceCompletion']) {
      expect(panel, `PreRacePanel.tsx must not reference ${forbidden}`).not.toContain(forbidden);
    }
    // The new Part 5 reads are pure helpers and the tier config — no new
    // data source, no writer.
    expect(panel).toContain('resolveRaceTier(');
    expect(panel).toContain('fortunasHandRatesText(');
    expect(panel).toContain('resolveQualifyingSlot(');
  });
});
