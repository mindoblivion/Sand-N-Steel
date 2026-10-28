/**
 * K1 — the city's keepers, pinned.
 *
 * Data + presentation only: this suite proves the registry is the one the city
 * needs (twenty keepers, one per trading counter), that no keeper can ever be
 * confused with an opponent, and that the first-visit record is a lazy optional
 * save field written once and never on a repeat.
 *
 * Run with: `bun test src/utils/keepers.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KEEPERS,
  SLUG_BUILDINGS,
  getKeeper,
  getKeeperForStorefront,
  hasMetKeeper,
  recordKeeperVisit,
  resolveSeenKeepers,
  selectRepeatLine,
  type Keeper,
} from '../data/keepers';
import type { PlayerProfile } from '../types/game';
import { HUB_LOCATIONS } from './cityCollisions';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from '../data/opponents';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const code = (path: string): string =>
  readFileSync(join(SOURCE_DIR, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** The keeper ids, in the order the slice specifies them. */
const EXPECTED_IDS = [
  'sextus_ferratus',
  'salvia_coriaria',
  'pasion_of_alexandria',
  'gaius_norbanus_sura',
  'antiochis_of_pergamon',
  'barates_of_palmyra',
  'hanno_of_carthage',
  'decimus_rotarius',
  'aulus_galerius_rufus',
  'aelia_prisca',
  'dionysios_of_athens',
  'scribonia',
  'cornelius_felix',
  'postumia',
  'quintus_caecilius_niger',
  'gnaeus_octavius_mappa',
  'straton_of_corinth',
  'gaius_pontius',
  'belibni_of_babylon',
  'titus_aufidius',
];

/**
 * The hub locations that trade goods or paid services with the player. Each must
 * be answered by exactly one keeper; the non-trading hubs (a gate, a barracks, a
 * free bath) are not on this list, and a hall that hosts two boards is checked
 * separately below.
 */
const COMMERCIAL_HUB_IDS = [
  'smithing_forge',
  'general_store',
  'merchant_house',
  'armor_workshop',
  'stable',
  'arena_medical_house',
  'caravanserai',
  'tavern',
  'gladiator_academy',
  'records_house',
  'shrine_temple',
];

const HUB_BY_ID = new Map(HUB_LOCATIONS.map((loc) => [loc.id, loc]));

function profile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: { skinColor: '#000', hairColor: '#000', tunicColor: '#000', crestColor: '#000' },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 100,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [DEFAULT_PLAYER_WEAPON],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

/** A name compared the way a reader hears it: lower case, quotes and commas gone. */
const norm = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[",]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** An opponent's called name, as its own name carries it. */
function opponentCalledName(name: string): string | null {
  const quoted = name.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  const trailing = name.match(/\bthe\s+[A-Za-z'’-]+$/);
  return trailing ? trailing[0] : null;
}

describe('K1 §A the registry', () => {
  test('all twenty keepers are present, in the slice order', () => {
    expect(KEEPERS.length).toBe(20);
    expect(KEEPERS.map((keeper) => keeper.id)).toEqual(EXPECTED_IDS);
  });

  test('ids and display names are unique, and every field is real text', () => {
    const ids = new Set(KEEPERS.map((keeper) => keeper.id));
    const names = new Set(KEEPERS.map((keeper) => keeper.name));
    expect(ids.size).toBe(20);
    expect(names.size).toBe(20);

    for (const keeper of KEEPERS) {
      expect(keeper.id.length).toBeGreaterThan(0);
      expect(keeper.buildingId.length).toBeGreaterThan(0);
      expect(keeper.name.trim().length).toBeGreaterThan(0);
      expect(keeper.title.trim().length).toBeGreaterThan(0);
      expect(keeper.firstVisitLine.trim().length).toBeGreaterThan(0);
      expect(keeper.repeatLines.length).toBeGreaterThan(0);
      for (const line of keeper.repeatLines) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  test('the called-name keepers carry their full display name', () => {
    expect(getKeeper('scribonia')?.name).toBe('Scribonia, called "the Ledger"');
    expect(getKeeper('gnaeus_octavius_mappa')?.name).toBe('Gnaeus Octavius, called "Mappa"');
    expect(getKeeper('gaius_pontius')?.name).toBe('Gaius Pontius, called "the Old Wolf"');
  });

  test('lookups answer the registry, and an unknown id answers nothing', () => {
    for (const keeper of KEEPERS) expect(getKeeper(keeper.id)).toBe(keeper);
    expect(getKeeper('nobody_of_nowhere')).toBeUndefined();
  });
});

describe('K1 §B buildings and registry completeness', () => {
  test('every buildingId is a real hub location or a documented slug', () => {
    for (const keeper of KEEPERS) {
      const isHub = HUB_BY_ID.has(keeper.buildingId);
      const isSlug = SLUG_BUILDINGS.has(keeper.buildingId);
      expect(isHub || isSlug, `${keeper.id}'s building '${keeper.buildingId}'`).toBe(true);
      expect(isHub && isSlug).toBe(false);
    }
  });

  test('every trading hub is answered by exactly one keeper', () => {
    const byBuilding = new Map<string, Keeper[]>();
    for (const keeper of KEEPERS) {
      const owners = byBuilding.get(keeper.buildingId) ?? [];
      owners.push(keeper);
      byBuilding.set(keeper.buildingId, owners);
    }

    for (const hubId of COMMERCIAL_HUB_IDS) {
      // The list is only worth asserting if each id is a real location.
      expect(HUB_BY_ID.has(hubId), `'${hubId}' is not a hub location`).toBe(true);
      const owners = byBuilding.get(hubId) ?? [];
      expect(owners.length, `${hubId} has ${owners.length} keepers`).toBe(1);
    }
  });

  test('the four shop hubs map to the storefronts the city opens', () => {
    expect(HUB_BY_ID.get('smithing_forge')?.shopId).toBe('forge');
    expect(HUB_BY_ID.get('armor_workshop')?.shopId).toBe('armorer');
    expect(HUB_BY_ID.get('general_store')?.shopId).toBe('bazaar');
    expect(HUB_BY_ID.get('merchant_house')?.shopId).toBe('merchant');
    expect(HUB_BY_ID.get('stable')?.shopId).toBeUndefined();
  });

  test('the Chariot Workshop is the one slug, and the halls that share a building are named', () => {
    expect([...SLUG_BUILDINGS]).toEqual(['chariot_workshop']);
    expect(getKeeper('decimus_rotarius')?.buildingId).toBe('chariot_workshop');

    // The Bounty & Mercenary Hall hosts two boards (the bounty board and the
    // mercenary board), so its one location carries two keepers on purpose.
    const atBountyHall = KEEPERS.filter((keeper) => keeper.buildingId === 'bounty_hall');
    expect(atBountyHall.map((keeper) => keeper.id)).toEqual(['scribonia', 'cornelius_felix']);
  });

  test('all twenty keepers are accounted for by a hub location or the slug', () => {
    const placed = KEEPERS.filter(
      (keeper) => HUB_BY_ID.has(keeper.buildingId) || SLUG_BUILDINGS.has(keeper.buildingId),
    );
    expect(placed.length).toBe(20);
  });
});

describe('K1 §C the four storefront plates', () => {
  test('each storefront belongs to its own keeper', () => {
    expect(getKeeperForStorefront('forge')?.id).toBe('sextus_ferratus');
    expect(getKeeperForStorefront('armorer')?.id).toBe('salvia_coriaria');
    expect(getKeeperForStorefront('bazaar')?.id).toBe('pasion_of_alexandria');
    expect(getKeeperForStorefront('merchant')?.id).toBe('gaius_norbanus_sura');
  });

  test('the four plates carry the transcribed names', () => {
    expect(getKeeperForStorefront('forge')?.name).toBe('Sextus Ferratus');
    expect(getKeeperForStorefront('armorer')?.name).toBe('Salvia Coriaria');
    expect(getKeeperForStorefront('bazaar')?.name).toBe('Pasion of Alexandria');
    expect(getKeeperForStorefront('merchant')?.name).toBe('Gaius Norbanus Sura');
  });

  test('the market tab has no keeper, and no two plates share one', () => {
    expect(getKeeperForStorefront('market')).toBeUndefined();
    const ids = ['forge', 'armorer', 'bazaar', 'merchant'].map(
      (shopId) => getKeeperForStorefront(shopId as 'forge')?.id,
    );
    expect(new Set(ids).size).toBe(4);
  });
});

describe('K1 §D keepers are never opponents', () => {
  const roster = [...ALL_OPPONENTS, DOCTORE_TEST_OPPONENT];
  const DESIGN_CALLED_NAMES = ['Mappa', 'the Ledger', 'the Old Wolf', 'the Doctore'];

  test('no keeper full name is an opponent full name', () => {
    const opponentNames = new Set(roster.map((opponent) => norm(opponent.name)));
    for (const keeper of KEEPERS) {
      expect(opponentNames.has(norm(keeper.name)), `${keeper.id} collides`).toBe(false);
    }
  });

  test('no design-given called name is an opponent name or an opponent called name', () => {
    const opponentNames = new Set(roster.map((opponent) => norm(opponent.name)));
    const opponentCalled = new Set(
      roster
        .map((opponent) => opponentCalledName(opponent.name))
        .filter((name): name is string => name !== null)
        .map(norm),
    );

    for (const called of DESIGN_CALLED_NAMES) {
      expect(opponentNames.has(norm(called)), `${called} is an opponent's name`).toBe(false);
      expect(opponentCalled.has(norm(called)), `${called} is an opponent's called name`).toBe(false);
    }
  });

  test('the near-misses PASS: Sextus Ferratus vs Sextus the Yard Measure', () => {
    const keeper = getKeeper('sextus_ferratus');
    const opponent = DOCTORE_TEST_OPPONENT;
    expect(keeper).toBeDefined();
    expect(opponent.name).toBe('Sextus the Yard Measure');

    // A real near-miss: the same given name, and nothing else in common.
    expect(keeper!.name.split(' ')[0].toLowerCase()).toBe('sextus');
    expect(norm(keeper!.name)).not.toBe(norm(opponent.name));
    expect(norm(opponent.name)).not.toContain(norm(keeper!.name));
    expect(roster.some((row) => norm(row.name) === norm(keeper!.name))).toBe(false);
  });

  test('the near-misses PASS: Gnaeus Octavius "Mappa" vs Gnaeus "The Gilded"', () => {
    const keeper = getKeeper('gnaeus_octavius_mappa');
    const opponent = ALL_OPPONENTS.find((row) => row.id === 'opp_gnaeus_boss');
    expect(keeper).toBeDefined();
    expect(opponent).toBeDefined();
    expect(opponent!.name).toBe('Gnaeus "The Gilded"');

    expect(keeper!.name.split(' ')[0].toLowerCase()).toBe('gnaeus');
    expect(norm(keeper!.name)).not.toBe(norm(opponent!.name));
    // The called names differ too: "Mappa" against "The Gilded".
    expect(opponentCalledName(keeper!.name)).toBe('Mappa');
    expect(opponentCalledName(opponent!.name)).toBe('The Gilded');
    expect(norm(opponentCalledName(keeper!.name)!)).not.toBe(
      norm(opponentCalledName(opponent!.name)!),
    );
  });

  test('the roster really is the roster (the guard is not vacuous)', () => {
    expect(roster.length).toBeGreaterThanOrEqual(18);
    expect(roster.some((opponent) => norm(opponent.name) === 'sextus the yard measure')).toBe(true);
    expect(roster.some((opponent) => norm(opponent.name) === norm('Gnaeus "The Gilded"'))).toBe(true);
  });
});

describe('K1 §E the save, read lazily and written once', () => {
  test('a profile without the field has met nobody', () => {
    expect(resolveSeenKeepers(profile())).toEqual([]);
    expect(resolveSeenKeepers(null)).toEqual([]);
    expect(resolveSeenKeepers(undefined)).toEqual([]);
    expect(hasMetKeeper(profile(), 'sextus_ferratus')).toBe(false);
  });

  test('a malformed field reads as nothing met, and junk ids are dropped', () => {
    const asProfile = (value: unknown): PlayerProfile =>
      ({ seenKeepers: value } as unknown as PlayerProfile);
    expect(resolveSeenKeepers(asProfile('sextus_ferratus'))).toEqual([]);
    expect(resolveSeenKeepers(asProfile(42))).toEqual([]);
    expect(resolveSeenKeepers(asProfile(null))).toEqual([]);
    expect(resolveSeenKeepers(asProfile({}))).toEqual([]);
    expect(resolveSeenKeepers(asProfile([42, 'sextus_ferratus', 'sextus_ferratus', 'nobody']))).toEqual([
      'sextus_ferratus',
    ]);
    expect(resolveSeenKeepers(asProfile([]))).toEqual([]);
  });

  test('a first visit adds the id and changes nothing else', () => {
    const before = profile();
    const snapshot = JSON.stringify(before);
    const after = recordKeeperVisit(before, 'sextus_ferratus');

    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect(resolveSeenKeepers(after)).toEqual(['sextus_ferratus']);

    // Every other field is the same value it was: only the record changed.
    const { seenKeepers: _ignored, ...rest } = after as PlayerProfile & { seenKeepers?: string[] };
    const { seenKeepers: _alsoIgnored, ...beforeRest } = before as PlayerProfile & {
      seenKeepers?: string[];
    };
    expect(JSON.stringify(rest)).toBe(JSON.stringify(beforeRest));
    expect(JSON.stringify(before)).toBe(snapshot); // the caller's profile was not mutated
  });

  test('a second keeper appends, keeping the order they were met', () => {
    const first = recordKeeperVisit(profile(), 'sextus_ferratus')!;
    const second = recordKeeperVisit(first, 'salvia_coriaria')!;
    expect(resolveSeenKeepers(second)).toEqual(['sextus_ferratus', 'salvia_coriaria']);
  });

  test('a repeat visit is a true no-op: the SAME profile, no second write', () => {
    const met = recordKeeperVisit(profile(), 'sextus_ferratus')!;
    expect(recordKeeperVisit(met, 'sextus_ferratus')).toBe(met);
    expect(hasMetKeeper(met, 'sextus_ferratus')).toBe(true);
  });

  test('an unknown id and a missing profile write nothing', () => {
    const before = profile();
    expect(recordKeeperVisit(before, 'nobody_of_nowhere')).toBe(before);
    expect(recordKeeperVisit(before, '')).toBe(before);
    expect(recordKeeperVisit(before, 42)).toBe(before);
    expect(recordKeeperVisit(null, 'sextus_ferratus')).toBeNull();
  });

  test('createNewProfile never writes the field', () => {
    const factory = code('services/storage.ts').slice(
      code('services/storage.ts').indexOf('export function createNewProfile'),
    );
    expect(factory).not.toContain('seenKeepers');
  });
});

describe('K1 §F the repeat line rotates deterministically', () => {
  const threeLines: Keeper = {
    id: 'test_keeper',
    buildingId: 'smithing_forge',
    name: 'Test Keeper',
    title: 'the tester',
    firstVisitLine: 'first',
    repeatLines: ['a', 'b', 'c'],
  };

  test('the same visit count always answers the same line', () => {
    for (let visit = 0; visit < 12; visit += 1) {
      expect(selectRepeatLine(threeLines, visit)).toBe(selectRepeatLine(threeLines, visit));
    }
  });

  test('successive counts rotate through repeatLines in order, and wrap', () => {
    expect(selectRepeatLine(threeLines, 0)).toBe('a');
    expect(selectRepeatLine(threeLines, 1)).toBe('b');
    expect(selectRepeatLine(threeLines, 2)).toBe('c');
    expect(selectRepeatLine(threeLines, 3)).toBe('a');
    expect(selectRepeatLine(threeLines, 7)).toBe('b');
  });

  test('every shipped keeper answers one of its own lines, at any count', () => {
    for (const keeper of KEEPERS) {
      for (let visit = 0; visit < 10; visit += 1) {
        expect(keeper.repeatLines).toContain(selectRepeatLine(keeper, visit));
      }
      // One repeat line each in this slice, so any count is that line.
      expect(selectRepeatLine(keeper, 2)).toBe(keeper.repeatLines[0]);
      expect(selectRepeatLine(keeper, 0)).toBe(keeper.repeatLines[0]);
    }
  });

  test('no RNG is involved', () => {
    expect(code('data/keepers.ts')).not.toContain('Math.random');
    expect(selectRepeatLine(threeLines, 4)).toBe(selectRepeatLine(threeLines, 4));
  });
});

describe('K1 §G the storefront renders the plate', () => {
  test('the plate is a header: initials, name, title and one line — no control', () => {
    const plate = code('components/hub/KeeperPlate.tsx');
    expect(plate).toContain('{keeper.name}');
    expect(plate).toContain('{keeper.title}');
    expect(plate).toContain('{line}');
    expect(plate).toContain('initialsOf');
    expect(plate).not.toContain('<button');
    expect(plate).not.toContain('onClick');
    expect(plate).not.toContain('<img');
  });

  test('ShopTab heads a storefront with it, and the market tab gets none', () => {
    const shop = code('components/hub/ShopTab.tsx');
    expect(shop).toContain('getKeeperForStorefront(shopId)');
    expect(shop).toContain('{keeper && <KeeperPlate keeper={keeper} line={keeperLine} />}');
    expect(shop).toContain('keeper.firstVisitLine');
    expect(shop).toContain('selectRepeatLine(keeper, 2)');
    // The greeting is decided once per counter, so the save landing mid-visit
    // cannot swap it for the repeat line.
    expect(shop).toContain('keeperMetRef.current?.id !== keeper.id');
    expect(shop).toContain('const keeperMet = keeper ? keeperMetRef.current?.met === true : false;');
  });

  test('the first visit is recorded once, through the existing save path', () => {
    const shop = code('components/hub/ShopTab.tsx');
    // One call, guarded, and inside the effect that runs on the keeper's identity.
    expect(shop.match(/onRecordKeeperVisit\?\.\(/g)?.length).toBe(1);
    expect(shop).toContain('if (!keeperId || keeperMet) return;');

    const app = code('App.tsx');
    expect(app.match(/recordKeeperVisit\(profile, /g)?.length).toBe(1);
    expect(app).toContain('if (!visited || visited === profile) return;');
    expect(app).toContain('saveProfile(visited);');

    const hub = code('components/hub/GladiatorSchoolHub.tsx');
    expect(hub).toContain('onRecordKeeperVisit={onRecordKeeperVisit}');
  });
});
