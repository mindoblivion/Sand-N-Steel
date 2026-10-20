/**
 * CL-1/CL-2 — the coach-mark foundation's focused suite.
 *
 * Run with: `bun test src/utils/coachMarks.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  `resolveSeenState` — a fresh profile, a legacy save with no `seen` field
 *       at all, and a partial / malformed field all resolve to an empty record;
 *       a valid entry survives; the input profile is never touched and the
 *       returned record is a fresh object.
 *   §B  `markSeen` — the single writer: it records the id on a NEW profile and
 *       changes nothing else, it is idempotent (a second call is a true no-op
 *       returning the same profile), and `createNewProfile()` never sets `seen`.
 *   §C  registry integrity — every entry carries a non-empty `codexEntry` stem
 *       equal to its own id, every entry's copy is ≤ 48 words, the id set is the
 *       appendix's (D1–D9, S1–S7, HUB-1 and the 20 briefings), the no-speaker
 *       cards carry no speaker, and the camp screen reads the registry rather
 *       than repeating its copy.
 *   §D  the glossary module — the appendix's rows are present verbatim and the
 *       lookup answers case- and whitespace-insensitively.
 *
 * Data and pure functions only: nothing here reads or writes storage.
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  COACH_CARDS,
  HUB_FIRST_OPEN_CARD_ID,
  getCoachCard,
  hasSeenCard,
  markSeen,
  resolveSeenState,
} from './coachMarks';
import { createNewProfile } from '../services/storage';
import { GLOSSARY, getGlossaryEntry, getGlossaryGloss } from '../data/glossary';
import type { PlayerProfile } from '../types/game';

/** A profile as every pre-CL save holds it: no `seen` field at all. */
function legacySave(): PlayerProfile {
  const profile = createNewProfile('Spartacus') as unknown as Record<string, unknown>;
  delete profile.seen;
  return profile as unknown as PlayerProfile;
}

/** A profile whose `seen` field is whatever the caller wants to hand in. */
function withSeen(seen: unknown): PlayerProfile {
  return { ...legacySave(), seen } as PlayerProfile;
}

const BRIEFING_IDS = [
  'BRIEF_training_yard',
  'BRIEF_gladiator_academy',
  'BRIEF_doctore_house',
  'BRIEF_smithing_forge',
  'BRIEF_armor_workshop',
  'BRIEF_general_store',
  'BRIEF_merchant_house',
  'BRIEF_tavern',
  'BRIEF_caravanserai',
  'BRIEF_arena_medical_house',
  'BRIEF_stable',
  'BRIEF_colosseum',
  'BRIEF_bounty_hall',
  'BRIEF_records_house',
  'BRIEF_shrine_temple',
  'BRIEF_veteran_gladiator_hall',
  'BRIEF_bathhouse',
  'BRIEF_gladiator_barracks',
  'BRIEF_town_gate',
  'BRIEF_northern_fortress',
];

describe('CL-1 §A — resolveSeenState', () => {
  test('a fresh profile resolves to an empty record', () => {
    expect(resolveSeenState(createNewProfile('Spartacus'))).toEqual({});
    expect(createNewProfile('Spartacus').seen).toBeUndefined();
  });

  test('a legacy save JSON without `seen` loads identically to today', () => {
    const legacy = legacySave();
    const roundTripped = JSON.parse(JSON.stringify(legacy)) as PlayerProfile;

    // The field is genuinely absent from the serialised save …
    expect('seen' in roundTripped).toBe(false);
    // … the load is byte-identical to what was written (nothing repaired) …
    expect(roundTripped).toEqual(legacy);
    // … and the resolver still answers a usable state.
    expect(resolveSeenState(roundTripped)).toEqual({});
    expect(hasSeenCard(roundTripped, HUB_FIRST_OPEN_CARD_ID)).toBe(false);
  });

  test('no profile, and a `seen` field that is not a plain object, resolve to {}', () => {
    expect(resolveSeenState(null)).toEqual({});
    expect(resolveSeenState(undefined)).toEqual({});
    expect(resolveSeenState(withSeen(undefined))).toEqual({});
    expect(resolveSeenState(withSeen(null))).toEqual({});
    expect(resolveSeenState(withSeen('D1'))).toEqual({});
    expect(resolveSeenState(withSeen(42))).toEqual({});
    expect(resolveSeenState(withSeen([]))).toEqual({});
    expect(resolveSeenState(withSeen(['D1']))).toEqual({});
  });

  test('a partial or malformed field keeps only the entries that are exactly true', () => {
    expect(resolveSeenState(withSeen({}))).toEqual({});
    expect(
      resolveSeenState(
        withSeen({ D1: true, D2: false, D3: 'yes', D4: 1, D5: null, D6: undefined })
      )
    ).toEqual({ D1: true });
  });

  test('a valid record survives, inherited properties are ignored', () => {
    expect(resolveSeenState(withSeen({ D1: true, 'HUB-1': true }))).toEqual({
      D1: true,
      'HUB-1': true,
    });
    expect(resolveSeenState(withSeen(Object.create({ D1: true })))).toEqual({});
  });

  test('never throws, never mutates the profile, and returns a fresh record', () => {
    const profile = withSeen({ D1: true });
    const before = JSON.stringify(profile);
    const seen = resolveSeenState(profile);

    seen.D2 = true;
    seen.D1 = true;

    expect(JSON.stringify(profile)).toBe(before);
    expect(profile.seen).toEqual({ D1: true });
    expect(resolveSeenState(profile)).not.toBe(profile.seen);
    expect(resolveSeenState(profile)).toEqual({ D1: true });
  });

  test('hasSeenCard reads the resolved state and refuses a non-string id', () => {
    const profile = withSeen({ D1: true });
    expect(hasSeenCard(profile, 'D1')).toBe(true);
    expect(hasSeenCard(profile, 'D2')).toBe(false);
    expect(hasSeenCard(profile, undefined)).toBe(false);
    expect(hasSeenCard(profile, '')).toBe(false);
    expect(hasSeenCard(profile, 7)).toBe(false);
    expect(hasSeenCard(null, 'D1')).toBe(false);
  });
});

describe('CL-1 §B — markSeen is the single writer', () => {
  test('records the id and changes nothing else', () => {
    const profile = legacySave();
    const marked = markSeen(profile, 'D1') as PlayerProfile;

    expect(marked).not.toBe(profile);
    expect(marked.seen).toEqual({ D1: true });
    expect(resolveSeenState(marked)).toEqual({ D1: true });

    // Every other field is carried through untouched.
    const { seen, ...rest } = marked;
    expect(rest).toEqual(profile as PlayerProfile);
    expect(profile.seen).toBeUndefined();
  });

  test('leaves the input profile byte-identical and its `seen` object unmutated', () => {
    const profile = withSeen({ S1: true });
    const before = JSON.stringify(profile);
    const inner = profile.seen;

    const marked = markSeen(profile, 'S2') as PlayerProfile;

    expect(JSON.stringify(profile)).toBe(before);
    expect(profile.seen).toBe(inner);
    expect(profile.seen).toEqual({ S1: true });
    expect(marked.seen).toEqual({ S1: true, S2: true });
  });

  test('is idempotent — a second call is a true no-op returning the same profile', () => {
    const once = markSeen(legacySave(), 'HUB-1') as PlayerProfile;
    const twice = markSeen(once, 'HUB-1') as PlayerProfile;

    expect(twice).toBe(once);
    expect(twice.seen).toEqual({ 'HUB-1': true });
    const nested = markSeen(markSeen(legacySave(), 'D1'), 'D1') as PlayerProfile;
    expect(nested.seen).toEqual({ D1: true });
    expect(nested).toEqual(markSeen(legacySave(), 'D1'));
  });

  test('carries an existing record forward instead of replacing it', () => {
    const marked = markSeen(withSeen({ D1: true, D2: true }), 'HUB-1') as PlayerProfile;
    expect(marked.seen).toEqual({ D1: true, D2: true, 'HUB-1': true });
  });

  test('a missing profile returns null; an unusable id records nothing', () => {
    expect(markSeen(null, 'D1')).toBeNull();
    expect(markSeen(undefined, 'D1')).toBeNull();

    const profile = withSeen({ D1: true });
    expect(markSeen(profile, '')).toBe(profile);
    expect(markSeen(profile, undefined)).toBe(profile);
    expect(markSeen(profile, 3)).toBe(profile);
    expect(profile.seen).toEqual({ D1: true });
  });

  test('createNewProfile never sets `seen`, and no other module writes it', () => {
    expect(createNewProfile('Spartacus').seen).toBeUndefined();

    // The only writer in the repo is `markSeen` (and the profile spread it does).
    const storage = readFileSync('src/services/storage.ts', 'utf8');
    expect(storage.includes('seen')).toBe(false);
  });
});

describe('CL-1 §C — the card registry', () => {
  test('the id set is the appendix\'s: D1–D9, S1–S7, HUB-1 and the briefings', () => {
    const expected = [
      ...Array.from({ length: 9 }, (_, i) => `D${i + 1}`),
      ...Array.from({ length: 7 }, (_, i) => `S${i + 1}`),
      HUB_FIRST_OPEN_CARD_ID,
      ...BRIEFING_IDS,
    ];

    expect(Object.keys(COACH_CARDS).sort()).toEqual([...expected].sort());
    expect(Object.keys(COACH_CARDS).length).toBe(37);
    for (const id of expected) {
      expect(getCoachCard(id)).toBeDefined();
    }
    expect(getCoachCard('NOPE')).toBeUndefined();
    expect(getCoachCard(undefined)).toBeUndefined();
  });

  test('every entry carries a codexEntry key whose stem is its own id', () => {
    for (const [id, card] of Object.entries(COACH_CARDS)) {
      expect(typeof card.codexEntry).toBe('string');
      expect(card.codexEntry.length).toBeGreaterThan(0);
      expect(card.codexEntry).toBe(id);
      expect(card.codexEntry.startsWith(id.split('_')[0])).toBe(true);
    }
  });

  test('every entry is ≤ 48 words, and its copy is a non-empty line of at most two lines', () => {
    for (const [id, card] of Object.entries(COACH_CARDS)) {
      const words = card.text.trim().split(/\s+/).filter(Boolean);
      expect(words.length).toBeGreaterThan(0);
      expect(words.length).toBeLessThanOrEqual(48);
      expect(card.text.includes('\n')).toBe(false);
      expect(card.text.trim()).toBe(card.text);
    }
  });

  test('the no-speaker cards carry no speaker; the keeper cards name one', () => {
    for (const id of ['S7', 'HUB-1', 'BRIEF_bathhouse', 'BRIEF_gladiator_barracks', 'BRIEF_town_gate', 'BRIEF_northern_fortress']) {
      expect(COACH_CARDS[id].speaker).toBeUndefined();
    }
    expect(COACH_CARDS.D1.speaker).toBe('The Doctore');
    expect(COACH_CARDS.D9.speaker).toBe('The Doctore');
    expect(COACH_CARDS.S1.speaker).toBe('The Stablemaster');
    expect(COACH_CARDS.BRIEF_smithing_forge.speaker).toBe('The Faber');
    expect(COACH_CARDS.BRIEF_veteran_gladiator_hall.speaker).toBe('The Scribe');
  });

  test('the copy is verbatim from the appendix', () => {
    expect(COACH_CARDS.D1.text).toBe(
      'Two ways to strike, boy. Quick is cheap and sure. Power costs breath and can break a man. Try Quick.'
    );
    expect(COACH_CARDS.D9.text).toBe(
      'A Palma — a victory palm. Your deeds, carried into the fight. Equip up to three.'
    );
    expect(COACH_CARDS.S7.text).toBe(
      'Stage 1 fields your yoked pair — your full team takes the track in a later stage.'
    );
    expect(COACH_CARDS[HUB_FIRST_OPEN_CARD_ID].text).toBe(
      "This camp is your career: train, buy, fight. The Scribe's Library explains everything — it's all in the Codex."
    );
    expect(COACH_CARDS.BRIEF_records_house.text).toBe(
      'Your career, written down: Triumphs, the Codex, and every word of the arena explained. Nothing here is lost.'
    );
    expect(COACH_CARDS.BRIEF_northern_fortress.text).toBe(
      'The fortress watches the northern road. It has no door for fighters — its story comes later, if it comes.'
    );
  });

  test('the camp screen reads the registry — its copy is not repeated in the UI', () => {
    // Comments are stripped first: these assertions are about the code, and the hub's
    // own comments name both `markSeen` and the card it shows.
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    const hub = stripComments(readFileSync('src/components/hub/GladiatorSchoolHub.tsx', 'utf8'));
    const card = stripComments(readFileSync('src/components/ui/CoachCard.tsx', 'utf8'));
    const app = stripComments(readFileSync('src/App.tsx', 'utf8'));

    // The copy lives in the registry only …
    expect(hub.includes('This camp is your career')).toBe(false);
    expect(card.includes('This camp is your career')).toBe(false);
    // … the camp screen asks the registry for it …
    expect(hub.includes('HUB_FIRST_OPEN_CARD_ID')).toBe(true);
    expect(hub.includes('getCoachCard')).toBe(true);
    // … the presentational card never writes the seen state …
    expect(card.includes('markSeen')).toBe(false);
    // … and the one write is App's.
    expect(app.includes('markSeen(')).toBe(true);
  });
});

describe('CL-1 §D — the glossary module', () => {
  test('the appendix\'s tables are present, verbatim, with their sections', () => {
    expect(GLOSSARY.length).toBe(57);
    expect(new Set(GLOSSARY.map((entry) => entry.section))).toEqual(
      new Set(['Fighting & the school', 'Gear words', 'The city, the week, the record', 'The Circus'])
    );

    const armatura = getGlossaryEntry('Armatura');
    expect(armatura?.gloss).toBe(
      'Your fighting class — it sets your stats, your gear, and how you fight.'
    );
    expect(getGlossaryGloss('Doctrina')).toBe(
      "Your class's signature technique. Always on, no cost."
    );
    expect(getGlossaryGloss('Rete')).toBe(
      "The net — thrown once, it tangles a fighter's next moves."
    );
    expect(getGlossaryGloss('Euripus')).toBe('The water channel that runs along the spina.');
    expect(getGlossaryGloss('Dies Quietus')).toBe('Quiet Day (Sunday) — the city breathes; no games.');
    for (const entry of GLOSSARY) {
      expect(entry.term.trim()).toBe(entry.term);
      expect(entry.gloss.trim()).toBe(entry.gloss);
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.gloss.length).toBeGreaterThan(0);
    }
  });

  test('the lookup is case- and whitespace-insensitive and refuses anything unknown', () => {
    expect(getGlossaryEntry('armatura')).toBe(getGlossaryEntry('Armatura'));
    expect(getGlossaryEntry('  ARMATURA ')).toBe(getGlossaryEntry('Armatura'));
    expect(getGlossaryEntry('Gladius')?.term).toBe('Gladius');
    expect(getGlossaryEntry('Palma (pl. Palmae)')?.gloss).toBe(
      'A victory palm — a trait you earn and equip; carry up to 3.'
    );
    expect(getGlossaryEntry('not a term')).toBeUndefined();
    expect(getGlossaryEntry(undefined)).toBeUndefined();
    expect(getGlossaryGloss('not a term')).toBeUndefined();
  });
});
