/**
 * A4 follow-up — keeper RECOGNITION lines, pinned.
 *
 * When the player's home province is known (`profile.identity.origo`, Pitch A4),
 * a keeper's repeat greeting is ONE authored template with `{province}` and
 * `{god}` filled from the ORIGIN table (`data/corpusEtOrigo.ts`, Director ruling
 * R-ORIGO).  Every other profile hears exactly what it heard before: the same
 * `selectRepeatLine(keeper, 2)` at every repeat visit.  No RNG, no clock, no save
 * field — the province is read, never stored.
 *
 * What this suite proves:
 *   §A  all twenty registry keepers carry one non-empty template with BOTH tokens,
 *       and none hardcodes a province name or a god
 *   §B  a profile with no identity (or no origo) answers the old line byte-for-byte
 *   §C  each of the six provinces is interpolated with its own name and god
 *   §D  an unknown origo and a keeper without a template fall back to the old line
 *   §E  STATE > NIGHT > own is unchanged, and a first visit still greets
 *   §F  only the three counters are wired, LegendStopPanel is untouched, and no
 *       RNG, clock or save field entered the module
 *
 * Run with: `bun test src/utils/keepersOrigo.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KEEPERS,
  nightClerkLine,
  selectOrigoLine,
  selectRepeatLine,
} from '../data/keepers';
import type { Keeper } from '../data/keepers';
import { PROVINCES } from '../data/corpusEtOrigo';
import type { PlayerProfile } from '../types/game';
import type { StorefrontId } from '../data/shops';
import { keeperStateLineFor } from './keeperStateLines';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const source = (path: string): string =>
  readFileSync(join(SOURCE_DIR, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const CITY = 'components/3d/city/CityHubScene.tsx';
const SHOP = 'components/hub/ShopTab.tsx';
const BOUNTY = 'components/hub/BountyBoardPanel.tsx';

/** A profile carrying only what these lines read. */
const profileWithOrigo = (origo: unknown): PlayerProfile =>
  ({ identity: { origo } } as unknown as PlayerProfile);

/** The repeat greeting a counter shows, restated from the three call sites. */
function ownLine(keeper: Keeper, profile: PlayerProfile | null | undefined, seen: boolean): string {
  if (!seen) return keeper.firstVisitLine;
  return selectOrigoLine(keeper, profile) ?? selectRepeatLine(keeper, 2);
}

/** The plate's whole precedence: STATE > NIGHT > own. */
function plateLine(
  keeper: Keeper,
  profile: PlayerProfile | null | undefined,
  seen: boolean,
  night: boolean,
  shopId?: StorefrontId
): string {
  const stateLine = keeperStateLineFor(keeper, profile, shopId);
  if (stateLine) return stateLine;
  const own = ownLine(keeper, profile, seen);
  return night ? nightClerkLine(keeper) || own : own;
}

describe('A4 §A every keeper carries one origo template', () => {
  test('the registry is still its twenty keepers', () => {
    expect(KEEPERS.length).toBe(20);
    expect(new Set(KEEPERS.map((keeper) => keeper.id)).size).toBe(20);
  });

  test('every keeper has a non-empty origoLine holding BOTH tokens', () => {
    for (const keeper of KEEPERS) {
      expect(typeof keeper.origoLine, keeper.id).toBe('string');
      const line = keeper.origoLine as string;
      expect(line.trim().length, keeper.id).toBeGreaterThan(0);
      expect(line, keeper.id).toContain('{province}');
      expect(line, keeper.id).toContain('{god}');
      // …and no other brace token crept in, so the two are the only substitutions.
      expect(line.match(/\{[a-z]+\}/g), keeper.id).toEqual(['{province}', '{god}']);
    }
  });

  test('no line hardcodes a province name or a god', () => {
    for (const keeper of KEEPERS) {
      for (const province of PROVINCES) {
        expect(keeper.origoLine, keeper.id).not.toContain(province.name);
        expect(keeper.origoLine, keeper.id).not.toContain(province.god);
      }
    }
  });

  test('the lines are one per keeper, and every one is distinct', () => {
    const lines = KEEPERS.map((keeper) => keeper.origoLine as string);
    expect(new Set(lines).size).toBe(KEEPERS.length);
  });
});

describe('A4 §B a profile without an origo hears exactly the old line', () => {
  const legacies: Array<[string, PlayerProfile | null | undefined]> = [
    ['no profile at all', null],
    ['an undefined profile', undefined],
    ['a profile with no identity', {} as unknown as PlayerProfile],
    ['an identity with no origo', { identity: {} } as unknown as PlayerProfile],
    ['an identity with a null origo', { identity: { origo: null } } as unknown as PlayerProfile],
    ['a malformed identity', { identity: 'italia' } as unknown as PlayerProfile],
  ];

  test('selectOrigoLine answers undefined for every legacy shape', () => {
    for (const keeper of KEEPERS) {
      for (const [label, profile] of legacies) {
        expect(selectOrigoLine(keeper, profile), `${keeper.id} — ${label}`).toBeUndefined();
      }
    }
  });

  test('the repeat greeting is byte-identical to selectRepeatLine(keeper, 2)', () => {
    for (const keeper of KEEPERS) {
      for (const [label, profile] of legacies) {
        expect(ownLine(keeper, profile, true), `${keeper.id} — ${label}`).toBe(
          selectRepeatLine(keeper, 2)
        );
      }
    }
  });

  test('the helper survives a null keeper as well', () => {
    expect(selectOrigoLine(null, profileWithOrigo('italia'))).toBeUndefined();
    expect(selectOrigoLine(undefined, null)).toBeUndefined();
  });
});

describe('A4 §C each province is named through the ORIGIN table', () => {
  test('all six provinces are covered, in the table’s own order', () => {
    expect(PROVINCES.map((province) => province.id)).toEqual([
      'italia',
      'hispania',
      'gallia',
      'graecia',
      'aegyptus',
      'thracia',
    ]);
  });

  test('the line is that keeper’s template with the correct name and god', () => {
    for (const keeper of KEEPERS) {
      for (const province of PROVINCES) {
        const expected = (keeper.origoLine as string)
          .split('{province}')
          .join(province.name)
          .split('{god}')
          .join(province.god);
        const line = ownLine(keeper, profileWithOrigo(province.id), true);
        expect(line, `${keeper.id}/${province.id}`).toBe(expected);
        expect(line, `${keeper.id}/${province.id}`).toContain(province.name);
        expect(line, `${keeper.id}/${province.id}`).toContain(province.god);
      }
    }
  });

  test('no raw token can reach the screen', () => {
    for (const keeper of KEEPERS) {
      for (const province of PROVINCES) {
        const line = ownLine(keeper, profileWithOrigo(province.id), true);
        expect(line, keeper.id).not.toContain('{province}');
        expect(line, keeper.id).not.toContain('{god}');
        expect(line, keeper.id).not.toContain('{');
      }
    }
  });

  test('the six provinces never hear the same words twice from one keeper', () => {
    for (const keeper of KEEPERS) {
      const heard = PROVINCES.map((province) =>
        ownLine(keeper, profileWithOrigo(province.id), true)
      );
      expect(new Set(heard).size, keeper.id).toBe(PROVINCES.length);
    }
  });
});

describe('A4 §D anything unknown falls back to the old repeat line', () => {
  test('an origo the ORIGIN table does not know', () => {
    for (const keeper of KEEPERS) {
      const profile = profileWithOrigo('atlantis');
      expect(selectOrigoLine(keeper, profile), keeper.id).toBeUndefined();
      expect(ownLine(keeper, profile, true), keeper.id).toBe(selectRepeatLine(keeper, 2));
    }
  });

  test('a keeper with no origoLine', () => {
    const silent: Keeper = { ...KEEPERS[0], origoLine: undefined };
    expect(silent.origoLine).toBeUndefined();
    expect(selectOrigoLine(silent, profileWithOrigo('italia'))).toBeUndefined();
    expect(ownLine(silent, profileWithOrigo('italia'), true)).toBe(selectRepeatLine(silent, 2));
  });

  test('an empty template is no template', () => {
    const blank: Keeper = { ...KEEPERS[0], origoLine: '' };
    expect(selectOrigoLine(blank, profileWithOrigo('italia'))).toBeUndefined();
    expect(ownLine(blank, profileWithOrigo('italia'), true)).toBe(selectRepeatLine(blank, 2));
  });
});

describe('A4 §E STATE > NIGHT > own still holds over the origo line', () => {
  const smith = KEEPERS.find((keeper) => keeper.id === 'sextus_ferratus') as Keeper;
  const host = KEEPERS.find((keeper) => keeper.id === 'hanno_of_carthage') as Keeper;

  test('by day, above the floor, a repeat visit hears the origo line', () => {
    const profile = { ...profileWithOrigo('thracia'), gold: 100000 } as PlayerProfile;
    const line = plateLine(smith, profile, true, false, 'forge');
    expect(line).toBe(ownLine(smith, profile, true));
    expect(line).not.toBe(selectRepeatLine(smith, 2));
    expect(line).toContain('Thracia');
    expect(line).toContain('Bellona');
  });

  test('a state line still wins over it', () => {
    const broke = { ...profileWithOrigo('thracia'), gold: 0 } as PlayerProfile;
    expect(plateLine(smith, broke, true, false, 'forge')).toBe(smith.stateLines?.broke);
    expect(plateLine(smith, broke, true, false, 'forge')).not.toBe(ownLine(smith, broke, true));
    // The same profile above the floor does show the origo line, so the state is
    // what overrode it — not a fallback.
    const rich = { ...profileWithOrigo('thracia'), gold: 100000 } as PlayerProfile;
    expect(plateLine(smith, rich, true, false, 'forge')).toBe(ownLine(smith, rich, true));
  });

  test('the night clerk still wins over it', () => {
    const profile = { ...profileWithOrigo('graecia'), gold: 100000 } as PlayerProfile;
    expect(nightClerkLine(smith)).not.toBe('');
    expect(plateLine(smith, profile, true, true, 'forge')).toBe(nightClerkLine(smith));
    expect(plateLine(smith, profile, true, true, 'forge')).not.toBe(ownLine(smith, profile, true));
  });

  test('a keeper with no night clerk keeps its origo line after dark', () => {
    const profile = profileWithOrigo('aegyptus');
    expect(nightClerkLine(host)).toBe('');
    expect(plateLine(host, profile, true, true)).toBe(ownLine(host, profile, true));
    expect(plateLine(host, profile, true, true)).toContain('Aegyptus');
  });

  test('a first visit is still the first-visit greeting, for every province', () => {
    for (const keeper of KEEPERS) {
      for (const province of PROVINCES) {
        const profile = profileWithOrigo(province.id);
        expect(ownLine(keeper, profile, false), keeper.id).toBe(keeper.firstVisitLine);
        expect(keeper.firstVisitLine, keeper.id).not.toContain('{');
      }
    }
  });
});

describe('A4 §F only the three counters are wired', () => {
  test('each counter asks the origo helper and keeps the old fallback', () => {
    for (const file of [SHOP, BOUNTY, CITY]) {
      const text = source(file);
      expect(text, file).toContain('selectOrigoLine');
      expect(text, file).toContain('selectOrigoLine(keeper,');
      expect(text, file).toContain('?? selectRepeatLine(keeper, 2)');
      expect(text, file).toContain('keeper.firstVisitLine');
    }
  });

  test('each counter passes the visit-start profile it already reads', () => {
    expect(source(SHOP)).toContain('selectOrigoLine(keeper, profile)');
    expect(source(BOUNTY)).toContain('selectOrigoLine(keeper, profile)');
    expect(source(CITY)).toContain('selectOrigoLine(keeper, playerProfile)');
  });

  test('the Legend-stop conversation is untouched', () => {
    const legend = source('components/hub/LegendStopPanel.tsx');
    expect(legend).toContain('repeatLines[0]');
    expect(legend).not.toContain('selectOrigoLine');
    expect(legend).not.toContain('origoLine');
  });

  test('no RNG, no clock, no save field', () => {
    const registry = source('data/keepers.ts');
    expect(registry).not.toContain('Math.random');
    expect(registry).not.toContain('Date.now');
    expect(registry).not.toContain('performance.now');
    expect(registry).not.toContain('localStorage');
    expect(source('types/game.ts')).not.toContain('origoLine');
  });
});
