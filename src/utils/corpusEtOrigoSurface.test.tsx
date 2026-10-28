/**
 * PITCH A4 — the Corpus et Origo surfaces, server-rendered.
 *
 * The pure rules are pinned by `corpusEtOrigo.test.ts`; this suite renders the REAL
 * `StatsTab` and `HelpModal` so two claims are proved on markup rather than read out
 * of a source file:
 *
 *   §A  a gladiator whose identity is recorded shows his Build, his Origo with its
 *       favoured god, the province's flavour line, and his Vitium;
 *   §B  a save written before this slice renders the stated defaults — Even / no
 *       province / None — and NO value is invented for it;
 *   §C  the help modal's two new glossary entries, word for word.
 *
 * `.tsx`, not `.ts`: it renders JSX and bun's `.ts` transform rejects it (the trap
 * `armaturaSurface.test.tsx` and `consumablesSurface.test.tsx` record).
 *
 * Run with: `bun test src/utils/corpusEtOrigoSurface.test.tsx`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerProfile } from '../types/game';
import { StatsTab } from '../components/hub/StatsTab';
import { HelpModal } from '../components/hub/HelpModal';
import { createNewProfile } from '../services/storage';

const legacyProfile = (): PlayerProfile => createNewProfile('Surface Tester');

const identityProfile = (): PlayerProfile => ({
  ...createNewProfile('Surface Tester'),
  identity: { build: 'sturdy', origo: 'hispania', vitium: 'old_knee' },
});

const stats = (profile: PlayerProfile) =>
  renderToStaticMarkup(<StatsTab profile={profile} onAllocatePoint={() => {}} />);

describe('PITCH A4 §A — the character sheet shows the recorded identity', () => {
  test('build, province, favoured god, passive, flavour line and vitium all render', () => {
    const html = stats(identityProfile());

    expect(html).toContain('data-corpus-identity');
    expect(html).toContain('data-corpus-build="sturdy"');
    expect(html).toContain('data-corpus-origo="hispania"');
    expect(html).toContain('data-corpus-vitium="old_knee"');
    expect(html).toContain('Corpus et Origo');

    // Build
    expect(html).toContain('Sturdy');
    expect(html).toContain('Heavy through the shoulders and slow off the mark.');
    // Origo: name, god, the passive's own line, and the province's flavour.
    expect(html).toContain('Hispania');
    expect(html).toContain('Diana');
    expect(html).toContain('Agility in the hit roll +1');
    expect(html).toContain('Hispania breeds hunters who never miss the first throw.');
    // Vitium
    expect(html).toContain('Old Knee');
    expect(html).toContain('The left knee remembers every winter campaign.');
  });

  test('every province renders its own god and flavour line', () => {
    const cases: [PlayerProfile['identity'], string, string][] = [
      [{ origo: 'italia' }, 'Mars', 'The road from Italia is paved, and every toll is collected twice.'],
      [{ origo: 'gallia' }, 'Mercury', 'Gallic merchants talk fast, walk faster, and never pay full price.'],
      [{ origo: 'graecia' }, 'Apollo', 'Greek tutors teach the body the way they teach the lyre: daily, and without mercy.'],
      [{ origo: 'aegyptus' }, 'Isis', 'The Nile teaches patience: a wound closes if you give it a season.'],
      [{ origo: 'thracia' }, 'Bellona', 'Thracians are born with a blade in hand and a song half-sung.'],
    ];
    for (const [identity, god, flavour] of cases) {
      const html = stats({ ...createNewProfile('Surface Tester'), identity });
      expect(html, god).toContain(god);
      expect(html, flavour).toContain(flavour);
    }
  });
});

describe('PITCH A4 §B — a legacy save renders the stated defaults', () => {
  test('Even, no province, None — and no value invented for the absent ones', () => {
    const html = stats(legacyProfile());

    expect(html).toContain('data-corpus-build="even"');
    expect(html).toContain('data-corpus-origo="none"');
    expect(html).toContain('data-corpus-vitium="none"');

    expect(html).toContain('Even');
    expect(html).toContain('No province recorded');
    expect(html).toContain('This record names no birthplace, and no god.');
    expect(html).toContain('None');
    expect(html).toContain('You carry no chosen flaw.');

    // No province may be invented for a save that names none.
    for (const name of ['Italia', 'Hispania', 'Gallia', 'Graecia', 'Aegyptus', 'Thracia']) {
      expect(html, name).not.toContain(name);
    }
    for (const god of ['Mars', 'Diana', 'Mercury', 'Apollo', 'Isis', 'Bellona']) {
      expect(html, god).not.toContain(god);
    }
    for (const flaw of ['Old Knee', 'Quick Temper', 'Superstitious', 'Night Terrors']) {
      expect(html, flaw.replace('Old Knee', 'The left knee')).not.toContain(flaw);
    }
  });
});

describe('PITCH A4 §C — the help modal glossary', () => {
  test('both entries render with their exact glosses', () => {
    const html = renderToStaticMarkup(<HelpModal onClose={() => {}} />);
    expect(html).toContain('Corpus et Origo');
    expect(html).toContain(
      'Your life before the sand: build, birthplace, and flaw, chosen at creation.',
    );
    expect(html).toContain('Vitium');
    expect(html).toContain(
      'A chosen flaw, taken at creation, worth two creation points. Yours alone, and permanent.',
    );
    expect(html).toContain('data-help-corpus-et-origo');
    expect(html).toContain('data-help-vitium');
  });

  test('the glosses promise nothing this slice does not ship', () => {
    const html = renderToStaticMarkup(<HelpModal onClose={() => {}} />);
    // No Doctore naming (deferred), and no divine favours (Favores Deorum is not built).
    expect(html).not.toContain('Doctore Test');
    expect(html).not.toContain('names your');
    expect(html).not.toContain('Favores');
    // The three terms that shipped before A4 are untouched.
    expect(html).toContain('Armatura');
    expect(html).toContain('Doctrina');
    expect(html).toContain('Palmae');
  });
});
