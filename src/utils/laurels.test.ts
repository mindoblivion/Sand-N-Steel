/**
 * P2 — TRIUMPHS: the catalogue, the pure transaction, and the save shape.
 *
 * Run with: `bun test src/utils/laurels.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the catalogue — four honours, their ids, names, kinds and fame prices
 *       exactly as the design states them, and no gold price anywhere;
 *   §B  the four happy paths — fame deducted exactly, ownership recorded, a title
 *       purchase pointing `profile.title` at the title's own name, gold untouched;
 *   §C  refusal purity — insufficient fame and already-owned both refuse with no
 *       profile in the result and the caller's profile byte-identical;
 *   §D  fame never goes negative — a sweep across every price, including exactly
 *       enough, a negative balance and a non-finite one;
 *   §E  a legacy profile with no `laurels` field buys and displays correctly, and
 *       the record survives the real `saveProfile()` / `loadSavedProfile()` pair;
 *   §F  zero power — no combat, reward, price or gate path reads `laurels`, and the
 *       module's only importers are the two surfaces, App and the corpus suite;
 *   §G  the naming law — no player-facing Triumph string says "Laurel".
 *
 * The saves here are `createNewProfile()` — the game's own factory — with an
 * explicit fame balance.  The storage used for the round trip is an in-memory
 * polyfill; **no browser's real `localStorage` is read or written**, and no cloud
 * save is touched.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── In-memory localStorage polyfill (bun's runtime has no DOM) ─────────────
const _store = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    _store.set(key, value);
  },
  removeItem: (key: string) => {
    _store.delete(key);
  },
  clear: () => {
    _store.clear();
  },
};
// @ts-ignore — assign to global before storage.ts is used
globalThis.localStorage = localStorageShim;

import { PlayerProfile } from '../types/game';
import { createNewProfile, loadSavedProfile, saveProfile } from '../services/storage';
import {
  STATUE_OWNED_LINE,
  TRIUMPHS,
  describeTriumphRejection,
  getTriumph,
  getTriumphPurchaseEligibility,
  ownedTriumphs,
  ownsTriumph,
  purchaseLaurel,
  resolveLaurels,
} from './laurels';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));

/** A fresh gladiator with a fame balance of `fame` and the factory's 100 gold. */
const withFame = (fame: number): PlayerProfile => ({ ...createNewProfile('Triumph Tester'), fame });

const priceOf = (id: string): number => getTriumph(id)!.price;

beforeEach(() => {
  _store.clear();
});

// ── §A the catalogue ───────────────────────────────────────────────────────
describe('P2 §A — the catalogue', () => {
  test('the four honours, in display order, with the design’s prices', () => {
    expect(TRIUMPHS.map((entry) => entry.id)).toEqual([
      'title_crowd_favourite',
      'title_champion_of_the_sands',
      'title_living_legend',
      'statue_ludus',
    ]);
    expect(TRIUMPHS.map((entry) => entry.name)).toEqual([
      'Crowd Favourite',
      'Champion of the Sands',
      'Living Legend',
      'Ludus Statue',
    ]);
    expect(TRIUMPHS.map((entry) => entry.price)).toEqual([300, 800, 2000, 1200]);
    expect(TRIUMPHS.map((entry) => entry.kind)).toEqual(['title', 'title', 'title', 'statue']);
  });

  test('nothing in the catalogue carries a gold price', () => {
    for (const triumph of TRIUMPHS) {
      expect(Object.keys(triumph).sort()).toEqual(['blurb', 'id', 'kind', 'name', 'price']);
    }
  });

  test('an unknown or non-string reference resolves to nothing, never a guess', () => {
    expect(getTriumph('no_such_triumph')).toBeUndefined();
    expect(getTriumph(300)).toBeUndefined();
    expect(getTriumph(null)).toBeUndefined();
    expect(getTriumph(undefined)).toBeUndefined();
    expect(getTriumph('title_crowd_favourite')?.name).toBe('Crowd Favourite');
  });

  test('the statue’s owned line is the design’s sentence', () => {
    expect(STATUE_OWNED_LINE).toBe('Your statue stands at the ludus.');
  });
});

// ── §B the four happy paths ────────────────────────────────────────────────
describe('P2 §B — every Triumph buys exactly once, for its own fame', () => {
  for (const triumph of TRIUMPHS) {
    test(`${triumph.name}: fame is deducted exactly and ownership recorded`, () => {
      const before = withFame(5000);
      const beforeBytes = JSON.stringify(before);
      const result = purchaseLaurel(before, triumph.id);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Fame is the only currency: exactly the price, gold untouched.
      expect(result.profile.fame).toBe(5000 - triumph.price);
      expect(result.profile.fame).toBe(5000 - priceOf(triumph.id));
      expect(result.profile.gold).toBe(before.gold);

      // Ownership is recorded the way the field says it is.
      const owned = resolveLaurels(result.profile);
      if (triumph.kind === 'title') {
        expect(owned.titles).toEqual([triumph.id]);
        // A title purchase also becomes the displayed title.
        expect(result.profile.title).toBe(triumph.name);
        expect(result.profile.laurels?.statue).toBe(false);
      } else {
        expect(owned.statue).toBe(true);
        expect(owned.titles).toEqual([]);
        // The statue is not a title: the displayed title is untouched.
        expect(result.profile.title).toBe(before.title);
      }

      // Pure: the caller's profile is untouched.
      expect(JSON.stringify(before)).toBe(beforeBytes);
      expect(ownsTriumph(result.profile, triumph.id)).toBe(true);
      expect(ownedTriumphs(result.profile).map((entry) => entry.id)).toEqual([triumph.id]);
    });
  }

  test('a second title is owned beside the first, and becomes the displayed one', () => {
    const first = purchaseLaurel(withFame(5000), 'title_crowd_favourite');
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = purchaseLaurel(first.profile, 'title_champion_of_the_sands');
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // Both stay owned, permanently; the newest is the one on the record.
    expect(resolveLaurels(second.profile).titles).toEqual([
      'title_crowd_favourite',
      'title_champion_of_the_sands',
    ]);
    expect(second.profile.title).toBe('Champion of the Sands');
    expect(second.profile.fame).toBe(5000 - 300 - 800);
  });

  test('buying the statue leaves an owned title displayed', () => {
    const titled = purchaseLaurel(withFame(5000), 'title_living_legend');
    expect(titled.ok).toBe(true);
    if (!titled.ok) return;

    const statue = purchaseLaurel(titled.profile, 'statue_ludus');
    expect(statue.ok).toBe(true);
    if (!statue.ok) return;

    expect(statue.profile.title).toBe('Living Legend');
    expect(resolveLaurels(statue.profile)).toEqual({
      titles: ['title_living_legend'],
      statue: true,
    });
  });

  test('the eligibility read-out agrees with what the purchase does', () => {
    for (const triumph of TRIUMPHS) {
      expect(getTriumphPurchaseEligibility(withFame(triumph.price), triumph.id)).toEqual({ ok: true });
      const bought = purchaseLaurel(withFame(triumph.price), triumph.id);
      expect(bought.ok).toBe(true);
    }
  });
});

// ── §C refusal purity ──────────────────────────────────────────────────────
describe('P2 §C — a refusal writes nothing at all', () => {
  test('one fame short refuses, and the caller’s profile is byte-identical', () => {
    for (const triumph of TRIUMPHS) {
      const before = withFame(triumph.price - 1);
      const beforeBytes = JSON.stringify(before);

      const result = purchaseLaurel(before, triumph.id);
      expect(result).toEqual({ ok: false, reason: 'insufficient-fame' });
      // No profile comes back at all, so no save writer can be reached.
      expect('profile' in result).toBe(false);
      expect(JSON.stringify(before)).toBe(beforeBytes);
      expect(getTriumphPurchaseEligibility(before, triumph.id)).toEqual({
        ok: false,
        reason: 'insufficient-fame',
      });
    }
  });

  test('an owned Triumph cannot be bought twice', () => {
    const bought = purchaseLaurel(withFame(5000), 'title_crowd_favourite');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const afterPurchase = JSON.stringify(bought.profile);
    const again = purchaseLaurel(bought.profile, 'title_crowd_favourite');
    expect(again).toEqual({ ok: false, reason: 'already-owned' });
    expect(JSON.stringify(bought.profile)).toBe(afterPurchase);
    expect(bought.profile.fame).toBe(5000 - 300);
  });

  test('the statue cannot be bought twice either', () => {
    const bought = purchaseLaurel(withFame(5000), 'statue_ludus');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(purchaseLaurel(bought.profile, 'statue_ludus')).toEqual({
      ok: false,
      reason: 'already-owned',
    });
  });

  test('an unknown Triumph and a missing profile both refuse cleanly', () => {
    expect(purchaseLaurel(withFame(5000), 'no_such_triumph')).toEqual({
      ok: false,
      reason: 'unknown-triumph',
    });
    expect(purchaseLaurel(null, 'title_crowd_favourite')).toEqual({
      ok: false,
      reason: 'no-profile',
    });
    expect(purchaseLaurel(undefined, 'title_crowd_favourite')).toEqual({
      ok: false,
      reason: 'no-profile',
    });
  });

  test('every refusal has a player-facing sentence, and none of them says “Laurel”', () => {
    for (const reason of ['no-profile', 'unknown-triumph', 'already-owned', 'insufficient-fame'] as const) {
      const line = describeTriumphRejection(reason);
      expect(line.length).toBeGreaterThan(0);
      expect(line.toLowerCase()).not.toContain('laurel');
    }
    expect(describeTriumphRejection('insufficient-fame')).toBe('Not enough fame.');
    expect(describeTriumphRejection('already-owned')).toBe('Already yours.');
  });

  test('a repeated purchase from the same base profile is deterministic', () => {
    const base = withFame(5000);
    const a = purchaseLaurel(base, 'title_living_legend');
    const b = purchaseLaurel(base, 'title_living_legend');
    expect(a).toEqual(b);
    expect(JSON.stringify(base)).toBe(JSON.stringify(withFame(5000)));
  });
});

// ── §D fame never goes negative ────────────────────────────────────────────
describe('P2 §D — fame can never go negative', () => {
  test('a sweep of balances across every price never produces a negative fame', () => {
    for (const triumph of TRIUMPHS) {
      for (let fame = 0; fame <= 2500; fame += 50) {
        const result = purchaseLaurel(withFame(fame), triumph.id);
        if (result.ok) {
          expect(result.profile.fame).toBe(fame - triumph.price);
          expect(result.profile.fame).toBeGreaterThanOrEqual(0);
        } else {
          expect(result.reason).toBe('insufficient-fame');
        }
        // The affordability boundary is exact, on both sides.
        expect(result.ok).toBe(fame >= triumph.price);
      }
    }
  });

  test('exactly enough pays to zero', () => {
    const result = purchaseLaurel(withFame(300), 'title_crowd_favourite');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.fame).toBe(0);
  });

  test('a negative or non-finite balance can afford nothing', () => {
    // A negative balance is never affordable, and a balance that is not a finite
    // number is read as unaffordable rather than producing a NaN by subtraction.
    for (const fame of [-1, -5000, Number.NaN, Number.POSITIVE_INFINITY]) {
      const profile = { ...createNewProfile('Malformed'), fame } as PlayerProfile;
      for (const triumph of TRIUMPHS) {
        expect(purchaseLaurel(profile, triumph.id)).toEqual({
          ok: false,
          reason: 'insufficient-fame',
        });
      }
    }
    expect(purchaseLaurel(withFame(-1), 'title_crowd_favourite')).toEqual({
      ok: false,
      reason: 'insufficient-fame',
    });
  });
});

// ── §E a legacy profile ────────────────────────────────────────────────────
describe('P2 §E — a save with no `laurels` field', () => {
  test('owns nothing, buys correctly, and displays what it bought', () => {
    const legacy = withFame(1500);
    // The field is genuinely absent, as on every pre-P2 save.
    expect('laurels' in legacy).toBe(false);
    expect(resolveLaurels(legacy)).toEqual({ titles: [], statue: false });
    expect(ownedTriumphs(legacy)).toEqual([]);
    expect(ownsTriumph(legacy, 'statue_ludus')).toBe(false);

    const bought = purchaseLaurel(legacy, 'title_champion_of_the_sands');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.profile.fame).toBe(700);
    expect(bought.profile.title).toBe('Champion of the Sands');
    expect(resolveLaurels(bought.profile).titles).toEqual(['title_champion_of_the_sands']);

    // And the title the profile displays is the one the hub prints.
    expect(bought.profile.title).toBe(getTriumph('title_champion_of_the_sands')!.name);
  });

  test('the purchase survives the real save/load pair', () => {
    const bought = purchaseLaurel(withFame(1500), 'title_crowd_favourite');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    saveProfile(bought.profile);
    const reloaded = loadSavedProfile();
    expect(reloaded).not.toBeNull();
    expect(resolveLaurels(reloaded!)).toEqual({ titles: ['title_crowd_favourite'], statue: false });
    expect(reloaded!.title).toBe('Crowd Favourite');
    expect(reloaded!.fame).toBe(1200);
    expect(reloaded!.laurels).toEqual({ titles: ['title_crowd_favourite'], statue: false });
  });

  test('resolving a malformed field owns nothing, and never rewrites the profile', () => {
    const shapes: unknown[] = [
      null,
      [],
      'laurels',
      7,
      {},
      { titles: 'title_crowd_favourite' },
      { titles: [42, null, 'title_crowd_favourite'] },
      { titles: ['title_crowd_favourite', 'title_crowd_favourite', 'no_such_triumph'] },
      { statue: 'yes' },
      { statue: 1 },
    ];

    for (const shape of shapes) {
      const profile = { ...withFame(100), laurels: shape as PlayerProfile['laurels'] };
      const before = JSON.stringify(profile);
      const owned = resolveLaurels(profile);
      expect(Array.isArray(owned.titles)).toBe(true);
      expect(typeof owned.statue).toBe('boolean');
      expect(JSON.stringify(profile)).toBe(before);
    }

    // Duplicates collapse, unknown ids drop, and the order is the catalogue's.
    expect(
      resolveLaurels({
        ...withFame(0),
        laurels: { titles: ['title_living_legend', 'title_crowd_favourite', 'title_living_legend'] },
      }).titles,
    ).toEqual(['title_crowd_favourite', 'title_living_legend']);
    expect(
      resolveLaurels({
        ...withFame(0),
        // A malformed save: `statue` is not a boolean. The cast states that
        // on purpose — the resolver, not the type, is what has to survive it.
        laurels: { statue: 'yes' } as unknown as PlayerProfile['laurels'],
      }).statue,
    ).toBe(false);
  });
});

// ── §F zero power ──────────────────────────────────────────────────────────
describe('P2 §F — zero power', () => {
  /** Which files may name the field or the transaction at all. */
  const ALLOWED = [
    'App.tsx',
    'components/hub/GladiatorSchoolHub.tsx',
    'components/hub/LibraryTab.tsx',
    'components/hub/StatsTab.tsx',
    'components/hub/TriumphsPage.tsx',
    'types/game.ts',
    // PITCH A1 — the omen suite reads `game.ts`'s optional-field list to pin the
    // merged twenty-field order, so it names this field without touching it.
    'utils/fortunasOmen.test.ts',
    'utils/laurels.test.ts',
    'utils/laurels.ts',
    // P-BANNER — the banner suite reads the field to show a chariot purchase
    // creates no second ownership record.
    'utils/phasePBannerTriumphSet.test.tsx',
    'utils/saveCorpus.test.ts',
    'utils/saveFixtures/index.ts',
    'utils/triumphsSurface.test.tsx',
    // A8 — the Triumphs EVALUATOR is the record's second writer: it appends the
    // earned ids and the earned titles through this module's own helpers
    // (`grantTitle`, `ownedTitleOptions`), so it names the record.  REBASED, not
    // weakened: the exact-list guard below still holds, and the forbidden list in
    // the next test is unchanged — no combat, reward, price or gate module reads
    // the record.
    // A5 — the Codex suite drives the full-Codex capstone THROUGH this record (the
    // title is granted via `laurels.titles` and put on the profile with
    // `selectDisplayedTitle`), so it names it.  The forbidden list is unchanged.
    'utils/codex.test.ts',
    'utils/triumphs.test.ts',
    'utils/triumphs.ts',
    // LUDI PHASE A — the calendar's suite proves the daily honour rides `records.laudes`
    // and that NO second laurel-shaped field exists, so it names the palma's field to
    // assert it is untouched. It reads no palma transaction and buys nothing.
    'utils/ludiPhaseA.test.tsx',
  ].sort();

  const code = (path: string): string =>
    readFileSync(join(SOURCE_DIR, path), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(join(SOURCE_DIR, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      // Descend everywhere: the fixture directory's JSON data is skipped by the
      // extension filter below, while its `index.ts` registry is real code and is
      // accounted for like any other source file.
      if (entry.isDirectory()) {
        walk(rel, out);
        continue;
      }
      if (/\.tsx?$/.test(entry.name)) out.push(rel);
    }
    return out;
  };

  test('only the two surfaces, App, the type and the corpus name `laurels`', () => {
    const offenders = walk('')
      .filter((rel) => /\blaurels\b|\bpurchaseLaurel\b/.test(code(rel)))
      .sort();
    expect(offenders).toEqual(ALLOWED);
  });

  test('no combat, reward, price or gate module names it', () => {
    const forbidden = [
      'utils/combatCalculations.ts',
      'utils/duelRewards.ts',
      'utils/tierAdvancement.ts',
      'utils/bossKills.ts',
      'utils/storyState.ts',
      'utils/rank.ts',
      'utils/roadOfGlory.ts',
      'utils/tempering.ts',
      'utils/selling.ts',
      'data/itemsDB.ts',
      'data/opponents.ts',
      'data/chariotParts.ts',
      'components/duel/DuelScene.tsx',
      'services/storage.ts',
    ];
    for (const path of forbidden) {
      expect(code(path), `${path} must not read the Triumph record`).not.toMatch(
        /\blaurels\b|\bpurchaseLaurel\b/,
      );
    }
  });

  test('the module is pure: it imports the profile type and nothing else', () => {
    const source = code('utils/laurels.ts');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    expect(imports).toEqual(['../types/game']);
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('saveProfile');
    expect(source).not.toContain('Date');
    expect(source).not.toContain('Math.random');
  });
});

// ── §G the naming law ──────────────────────────────────────────────────────
describe('P2 §G — the umbrella is called “Triumphs”', () => {
  test('no catalogue string uses the word reserved for the palma', () => {
    for (const triumph of TRIUMPHS) {
      expect(triumph.name.toLowerCase()).not.toContain('laurel');
      expect(triumph.blurb.toLowerCase()).not.toContain('laurel');
      expect(triumph.id.toLowerCase()).not.toContain('laurel');
    }
    expect(STATUE_OWNED_LINE.toLowerCase()).not.toContain('laurel');
  });
});
