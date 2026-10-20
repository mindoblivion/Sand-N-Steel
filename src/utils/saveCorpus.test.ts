/**
 * GC20 — the golden save corpus: load compatibility.
 *
 * Run with: `bun test src/utils/saveCorpus.test.ts`
 *
 * ── WHY THIS SUITE EXISTS ─────────────────────────────────────────────────
 * The player profile is whole-profile JSON in `localStorage`
 * (`services/storage.ts`, key `sand_and_steel_gladiator_save_v2`) with **no
 * version field and no migration**.  New fields resolve lazily — a missing,
 * partial or malformed field is read back to a sane default rather than repaired
 * — and that is safe only for as long as every historical shape keeps resolving.
 * Nothing proved that before this suite.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the corpus itself — every fixture file is registered, every registered
 *       fixture exists, ids and file names are unique, every fixture carries a
 *       one-line provenance and the shapes it covers, the registry's object is
 *       the file's own parse, and the corpus still covers every required shape;
 *   §B  the load path — each fixture's **own bytes** are put under the real save
 *       key and read back through `loadSavedProfile()`, exactly as `App` reads it
 *       at boot, with no field added or dropped and no rewrite of the stored JSON;
 *   §C  every lazy resolver in the tree — `resolveRacingState`,
 *       `resolveChariotLoadout`, `resolveStoryState`, `resolveRoadProgress` /
 *       `resolveRoadState`, `resolveSeenState`, `resolveTimeState` and the temper
 *       read through the effective-stats path, plus the boot-path
 *       `calculateTotalStats` — resolves every fixture without throwing and
 *       returns shaped, coherent state;
 *   §D  purity — the fixture's serialized bytes are byte-compared before and
 *       after the resolvers run, and the stored bytes are re-read;
 *   §E  sane defaults for every absent field — an absent `racing` is Biga with
 *       Triga and Quadra locked, an absent `chariot` is the stock loadout, an
 *       absent `injury` is no penalty;
 *   §F  the per-shape claims — the shipped-creation shape versus the factory's,
 *       the played profile's coherence, the racing-era resolutions, and each
 *       malformed-adjacent shape's documented fallback;
 *   §G  forward compatibility — unknown fields are ignored by every resolver and
 *       survive a load and save round trip untouched;
 *   §H  scope guards — the corpus is data consumed by this suite alone, every
 *       fixture is synthetic, and the only storage this suite writes is the real
 *       save key in an in-memory store;
 *   §I  controls — the invariant helpers are shown to reject values they must.
 *
 * A fixture that fails is a **finding**, reported precisely and left in the
 * production code's hands: this suite diagnoses compatibility, it does not repair
 * the save format.  This slice's corpus is green; the findings it records (which
 * fields of the profile no code advances, and that the shipped creation and the
 * factory write different shapes) are written up in `saveFixtures/MANIFEST.md`.
 *
 * **No real player's save is read or written.**  Every fixture is committed data
 * constructed in this repository; the storage this suite uses is an in-memory
 * polyfill, installed before `services/storage.ts` can be reached.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── In-memory localStorage polyfill (bun's runtime has no DOM) ─────────────
const _store = new Map<string, string>();
/** Every key this suite writes, so §H can prove which keys were touched. */
const _writtenKeys: string[] = [];
const localStorageShim = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    _writtenKeys.push(key);
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
import {
  PROFILE_STORAGE_KEY,
  calculateTotalStats,
  createNewProfile,
  loadSavedProfile,
  saveProfile,
} from '../services/storage';
import {
  DEFAULT_CHARIOT_FINISH,
  DEFAULT_CHARIOT_WHEELS,
  getChariotPart,
} from '../data/chariotParts';
import {
  defaultChariotLoadout,
  equippedChariotPartId,
  getChariotEquipEligibility,
  getChariotPurchaseEligibility,
  isChariotPartEquipped,
  ownsChariotPart,
  resolveChariotLoadout,
} from './chariotLoadout';
import {
  RACING_CONFIGS,
  defaultRacingState,
  getRacingPurchaseEligibility,
  getRacingSelectionEligibility,
  getSelectedRacingConfig,
  isRacingConfigUnlocked,
  resolveRacingState,
} from './racingProgression';
import { ITEMS_DB } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';
import { SAVE_FIXTURES, SaveFixture } from './saveFixtures';
import { STORY_FINAL_CHAPTER, resolveStoryState } from './storyState';
import {
  getEffectiveArmorStats,
  getEffectiveWeaponStats,
  resolveTemperLevel,
} from './tempering';
import { resolveRoadProgress, resolveRoadState } from './roadOfGlory';
import { resolveSeenState } from './coachMarks';
import { TIME_PHASES, resolveTimeState } from './timeState';

// ── The corpus on disk ─────────────────────────────────────────────────────
const FIXTURE_DIR = fileURLToPath(new URL('./saveFixtures/', import.meta.url));
const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));

/** The shapes every corpus must keep, whatever else it grows. */
const REQUIRED_FIXTURE_IDS = [
  'minimal-legacy',
  'current-fresh',
  'mid-career',
  'racing-era',
  'malformed-null-objects',
  'malformed-partial-racing',
  'malformed-partial-chariot',
  'malformed-unknown-fields',
  'story-road-era',
  'partial-story-fields',
  'malformed-empty-fields',
];

/** The fixture's shape, inspected as stored — no reliance on the profile type. */
const rawOf = (fixture: SaveFixture): Record<string, unknown> =>
  fixture.profile as unknown as Record<string, unknown>;

const bytesOf = (fixture: SaveFixture): string => JSON.stringify(fixture.profile);
const fileBytes = (fixture: SaveFixture): string =>
  readFileSync(join(FIXTURE_DIR, fixture.file), 'utf8');

/** The catalogue ids, so a fixture's item references can be shown to be real. */
const ITEM_IDS = new Set(ITEMS_DB.map((item) => item.id));
const OPPONENT_IDS = new Set(ALL_OPPONENTS.map((opponent) => opponent.id));

// ── The invariants every resolution must satisfy ───────────────────────────
/** Biga is always unlocked first, the list ascends, and the selection is one of them. */
const racingIsSane = (state: { unlocked: number[]; selected: number; horses: number }): boolean => {
  const { unlocked, selected, horses } = state;
  if (!Array.isArray(unlocked) || unlocked.length < 1 || unlocked.length > 3) return false;
  if (unlocked[0] !== 2) return false;
  for (let i = 1; i < unlocked.length; i += 1) {
    if (!(unlocked[i] > unlocked[i - 1])) return false;
    if (unlocked[i] !== 3 && unlocked[i] !== 4) return false;
  }
  // Quadra cannot stand without Triga — the rule the resolver enforces on read.
  if (unlocked.includes(4) && !unlocked.includes(3)) return false;
  if (selected !== horses) return false;
  return unlocked.includes(selected);
};

/** Both slot defaults owned, no duplicates, real ids, and fitted parts are owned. */
const chariotIsSane = (loadout: { owned: string[]; equipped: { wheels: string; finish: string } }): boolean => {
  const { owned, equipped } = loadout;
  if (!Array.isArray(owned) || new Set(owned).size !== owned.length) return false;
  if (!owned.includes(DEFAULT_CHARIOT_WHEELS) || !owned.includes(DEFAULT_CHARIOT_FINISH)) return false;
  if (!owned.every((id) => Boolean(getChariotPart(id)))) return false;
  const wheels = getChariotPart(equipped.wheels);
  const finish = getChariotPart(equipped.finish);
  if (wheels?.slot !== 'wheels' || finish?.slot !== 'finish') return false;
  return owned.includes(equipped.wheels) && owned.includes(equipped.finish);
};

/** Every derived number is a finite value, and the maxima are positive. */
const statsAreSane = (stats: Record<string, unknown>): boolean =>
  ['strength', 'agility', 'stamina', 'staminaMax', 'staminaRegen', 'defense', 'healthMax'].every(
    (key) => typeof stats[key] === 'number' && Number.isFinite(stats[key] as number),
  ) &&
  (stats.healthMax as number) > 0 &&
  (stats.staminaMax as number) > 0;

/** Drive EVERY profile-facing resolver in the tree once, on one profile. */
const driveEveryResolver = (profile: PlayerProfile) => {
  const racing = resolveRacingState(profile);
  const loadout = resolveChariotLoadout(profile);
  // GC20-X — the five lazy fields added after GC20.  Temper is read through the
  // effective-stats path `calculateTotalStats` uses, so a fixture's levels are
  // exercised the way a duel and the hub read them.
  const story = resolveStoryState(profile);
  const road = resolveRoadProgress(profile);
  const roadState = resolveRoadState(profile);
  const seen = resolveSeenState(profile);
  const time = resolveTimeState(profile);
  const equipped = profile.equipped;
  const temperedWeapon = getEffectiveWeaponStats(
    equipped.weapon,
    resolveTemperLevel(profile, equipped.weapon.id),
  );
  const temperedArmor = [equipped.helm, equipped.chest, equipped.arms, equipped.legs].flatMap(
    (armor) =>
      armor ? [getEffectiveArmorStats(armor, resolveTemperLevel(profile, armor.id))] : [],
  );
  return {
    racing,
    loadout,
    story,
    road,
    roadState,
    seen,
    time,
    temperedWeapon,
    temperedArmor,
    selectedConfig: getSelectedRacingConfig(profile),
    bigaUnlocked: isRacingConfigUnlocked(profile, 'biga'),
    trigaUnlocked: isRacingConfigUnlocked(profile, 3),
    quadraUnlocked: isRacingConfigUnlocked(profile, 4),
    raceBuyTriga: getRacingPurchaseEligibility(profile, 3),
    raceBuyQuadra: getRacingPurchaseEligibility(profile, 'quadra'),
    raceSelectBiga: getRacingSelectionEligibility(profile, 2),
    raceSelectQuadra: getRacingSelectionEligibility(profile, 'quadra'),
    ownsReinforcedWheels: ownsChariotPart(profile, 'wheels_reinforced'),
    equippedWheels: equippedChariotPartId(profile, 'wheels'),
    reinforcedFitted: isChariotPartEquipped(profile, 'wheels_reinforced'),
    charredFitted: isChariotPartEquipped(profile, 'finish_charred'),
    chariotBuyReinforced: getChariotPurchaseEligibility(profile, 'wheels_reinforced'),
    chariotEquipCharred: getChariotEquipEligibility(profile, 'finish_charred'),
    stats: calculateTotalStats(profile) as unknown as Record<string, unknown>,
  };
};

beforeEach(() => {
  _store.clear();
  _writtenKeys.length = 0;
});

// ── §A the corpus itself ───────────────────────────────────────────────────
describe('GC20 §A — the corpus', () => {
  test('every .json in the fixtures directory is registered, and every registration exists', () => {
    const onDisk = readdirSync(FIXTURE_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort();
    const registered = SAVE_FIXTURES.map((fixture) => fixture.file).sort();
    expect(registered).toEqual(onDisk);
    for (const fixture of SAVE_FIXTURES) {
      expect(existsSync(join(FIXTURE_DIR, fixture.file)), `${fixture.file} is missing`).toBe(true);
    }
  });

  test('ids and file names are unique', () => {
    const ids = SAVE_FIXTURES.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    const files = SAVE_FIXTURES.map((fixture) => fixture.file);
    expect(new Set(files).size).toBe(files.length);
  });

  test('every fixture carries a one-line provenance and the shapes it covers', () => {
    for (const fixture of SAVE_FIXTURES) {
      expect(fixture.provenance.trim().length, `${fixture.id} has no provenance`).toBeGreaterThan(20);
      expect(fixture.provenance.includes('\n'), `${fixture.id}'s provenance is not one line`).toBe(false);
      expect(fixture.covers.length, `${fixture.id} covers nothing`).toBeGreaterThan(0);
      expect(fixture.covers.every((shape) => shape.trim().length > 0)).toBe(true);
    }
  });

  test('the registry holds the file’s own parse — the two cannot drift', () => {
    for (const fixture of SAVE_FIXTURES) {
      expect(rawOf(fixture)).toEqual(JSON.parse(fileBytes(fixture)));
    }
  });

  test('the corpus still covers every required shape', () => {
    const ids = SAVE_FIXTURES.map((fixture) => fixture.id);
    for (const required of REQUIRED_FIXTURE_IDS) {
      expect(ids, `the corpus has no '${required}' fixture`).toContain(required);
    }
  });

  test('the fixture count is pinned, so the corpus cannot silently shrink', () => {
    expect(SAVE_FIXTURES.length).toBe(REQUIRED_FIXTURE_IDS.length);
  });

  test('the fixtures directory holds fixtures, the registry and the manifest, and nothing else', () => {
    const entries = readdirSync(FIXTURE_DIR).sort();
    const allowed = [...SAVE_FIXTURES.map((fixture) => fixture.file), 'index.ts', 'MANIFEST.md'].sort();
    expect(entries).toEqual(allowed);
  });
});

// ── §B–§E per fixture: load, resolve, purity, defaults ─────────────────────
for (const fixture of SAVE_FIXTURES) {
  describe(`GC20 fixture '${fixture.id}'`, () => {
    test("loads through the game's own load path with the same field set", () => {
      localStorage.setItem(PROFILE_STORAGE_KEY, fileBytes(fixture));
      const loaded = loadSavedProfile();
      expect(loaded).not.toBeNull();
      // Exactly what production gets: the stored bytes, whole.
      expect(JSON.stringify(loaded)).toBe(JSON.stringify(JSON.parse(fileBytes(fixture))));
    });

    test('the load path never rewrites the stored save', () => {
      const raw = fileBytes(fixture);
      localStorage.setItem(PROFILE_STORAGE_KEY, raw);
      driveEveryResolver(loadSavedProfile()!);
      expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBe(raw);
    });

    test('every lazy resolver resolves it without throwing, and returns shaped state', () => {
      localStorage.setItem(PROFILE_STORAGE_KEY, fileBytes(fixture));
      const loaded = loadSavedProfile()!;
      const resolved = driveEveryResolver(loaded);

      expect(racingIsSane(resolved.racing)).toBe(true);
      expect(chariotIsSane(resolved.loadout)).toBe(true);
      expect(statsAreSane(resolved.stats as unknown as Record<string, unknown>)).toBe(true);
      expect(resolved.selectedConfig).toBeDefined();
      expect(resolved.bigaUnlocked).toBe(true);
      expect(RACING_CONFIGS.map((config) => config.horses)).toContain(resolved.racing.horses);

      // The five fields added after GC20 resolve to shaped state too.
      expect(resolved.story.chapter).toBeGreaterThanOrEqual(0);
      expect(resolved.story.chapter).toBeLessThanOrEqual(STORY_FINAL_CHAPTER);
      expect(resolved.story.gates.length).toBeGreaterThan(0);
      expect(resolved.road.milestonesSeen.every((id) => typeof id === 'string')).toBe(true);
      expect(resolved.road.bannerDevice === null || typeof resolved.road.bannerDevice === 'string').toBe(true);
      expect(resolved.roadState.length).toBe(7);
      expect(resolved.roadState.filter((stage) => stage.state === 'current').length).toBe(1);
      expect(Object.values(resolved.seen).every((value) => value === true)).toBe(true);
      expect(Number.isInteger(resolved.time.total)).toBe(true);
      expect(resolved.time.total).toBeGreaterThanOrEqual(0);
      expect(resolved.time.phase).toBe(TIME_PHASES[resolved.time.phaseIndex]);
      expect(Number.isFinite(resolved.temperedWeapon.damageLight)).toBe(true);
      expect(resolved.temperedWeapon.damageLight).toBeGreaterThanOrEqual(loaded.equipped.weapon.damageLight);
      expect(resolved.temperedArmor.every((armor) => Number.isFinite(armor.defense))).toBe(true);
    });

    test('resolution does not mutate the fixture’s stored JSON (byte compare)', () => {
      const before = bytesOf(fixture);
      const loaded = JSON.parse(fileBytes(fixture)) as PlayerProfile;
      const loadedBefore = JSON.stringify(loaded);

      driveEveryResolver(fixture.profile);
      driveEveryResolver(loaded);

      expect(bytesOf(fixture)).toBe(before);
      expect(JSON.stringify(loaded)).toBe(loadedBefore);
      // And the file on disk is what the registry claims it is.
      expect(fileBytes(fixture)).toBe(JSON.stringify(JSON.parse(fileBytes(fixture)), null, 2) + '\n');
    });

    test('every absent field resolves to its documented default', () => {
      const raw = rawOf(fixture);
      const profile = fixture.profile;
      let absentFields = 0;

      if (!('racing' in raw) || raw.racing === null) {
        absentFields += 1;
        expect(resolveRacingState(profile)).toEqual(defaultRacingState());
      }
      if (!('chariot' in raw) || raw.chariot === null) {
        absentFields += 1;
        expect(resolveChariotLoadout(profile)).toEqual(defaultChariotLoadout());
      }
      if (!('injury' in raw) || raw.injury === null) {
        absentFields += 1;
        expect(calculateTotalStats(profile)).toEqual(calculateTotalStats({ ...profile, injury: null }));
      }
      if (!('story' in raw) || raw.story === null) {
        absentFields += 1;
        const flags = resolveStoryState(profile).flags;
        expect(flags.librarySeen).toBe(false);
        expect(flags.fragmentsFound).toEqual([]);
        expect(flags.trialDone).toBe(false);
        expect(flags.diceEnding).toBeUndefined();
        expect(flags.deserterChoice).toBeUndefined();
        expect(flags.summitSeen).toBe(false);
      }
      if (!('temper' in raw) || raw.temper === null) {
        absentFields += 1;
        for (const item of [
          profile.equipped.weapon,
          profile.equipped.helm,
          profile.equipped.chest,
          profile.equipped.arms,
          profile.equipped.legs,
        ]) {
          if (item) expect(resolveTemperLevel(profile, item.id)).toBe(0);
        }
      }
      if (!('road' in raw) || raw.road === null) {
        absentFields += 1;
        expect(resolveRoadProgress(profile)).toEqual({
          oathSworn: false,
          bannerDevice: null,
          milestonesSeen: [],
        });
      }
      if (!('seen' in raw) || raw.seen === null) {
        absentFields += 1;
        expect(resolveSeenState(profile)).toEqual({});
      }
      if (!('time' in raw) || raw.time === null) {
        absentFields += 1;
        expect(resolveTimeState(profile)).toMatchObject({
          total: 0,
          day: 1,
          phaseIndex: 0,
          phase: 'dawn',
        });
      }

      expect(resolveRacingState(profile).selected).toBe(resolveRacingState(profile).horses);
      // The count above is exactly the resolver-backed optional fields this
      // fixture is missing (or holds as null), so nothing is silently skipped:
      // a fully-populated shape accounts for none, a legacy shape for all eight.
      const resolverBacked = ['racing', 'chariot', 'injury', 'story', 'temper', 'road', 'seen', 'time'];
      expect(absentFields).toBe(
        resolverBacked.filter((field) => !(field in raw) || raw[field] === null).length,
      );
    });

    test('the resolved profile is internally coherent', () => {
      const raw = rawOf(fixture);
      const profile = fixture.profile;
      const stats = calculateTotalStats(profile);

      expect(statsAreSane(stats as unknown as Record<string, unknown>)).toBe(true);
      expect(Object.keys(stats).sort()).toEqual(
        ['agility', 'defense', 'healthMax', 'stamina', 'staminaMax', 'staminaRegen', 'strength'].sort(),
      );

      for (const id of (raw.defeatedOpponentIds as string[]) ?? []) {
        expect(OPPONENT_IDS, `unknown opponent '${id}' in ${fixture.id}`).toContain(id);
      }
      const equipped = raw.equipped as Record<string, { id: string }> | undefined;
      for (const item of Object.values(equipped ?? {})) {
        expect(ITEM_IDS, `unknown item '${item.id}' in ${fixture.id}`).toContain(item.id);
      }
      for (const item of (raw.inventory as { id: string }[]) ?? []) {
        expect(ITEM_IDS, `unknown item '${item.id}' in ${fixture.id}`).toContain(item.id);
      }
    });
  });
}

// ── §F the per-shape claims ────────────────────────────────────────────────
describe('GC20 §F — what each shape resolves to', () => {
  const fixtureById = (id: string): SaveFixture => {
    const fixture = SAVE_FIXTURES.find((candidate) => candidate.id === id);
    if (!fixture) throw new Error(`no fixture '${id}'`);
    return fixture;
  };

  test('the shipped creation and the factory write different field sets', () => {
    const legacy = rawOf(fixtureById('minimal-legacy'));
    const fresh = rawOf(fixtureById('current-fresh'));

    // The creation path writes `isLeftyMode`; `createNewProfile()` does not.
    expect('isLeftyMode' in legacy).toBe(true);
    expect('isLeftyMode' in fresh).toBe(false);

    const withoutLeft = { ...legacy } as Record<string, unknown>;
    delete withoutLeft.isLeftyMode;
    expect(Object.keys(withoutLeft).sort()).toEqual(Object.keys(fresh).sort());
  });

  test('the factory fixture is exactly what createNewProfile writes today', () => {
    const fresh = fixtureById('current-fresh').profile;
    const live = createNewProfile(fresh.name);
    expect(Object.keys(rawOf(fixtureById('current-fresh'))).sort()).toEqual(Object.keys(live as object).sort());
    expect(resolveRacingState(fresh)).toEqual(resolveRacingState(live));
    expect(resolveChariotLoadout(fresh)).toEqual(resolveChariotLoadout(live));
  });

  test('the legacy and fresh shapes resolve identically — no field was needed', () => {
    const legacy = fixtureById('minimal-legacy').profile;
    const fresh = fixtureById('current-fresh').profile;
    expect(resolveRacingState(legacy)).toEqual(defaultRacingState());
    expect(resolveChariotLoadout(legacy)).toEqual(defaultChariotLoadout());
    expect(resolveRacingState(legacy)).toEqual(resolveRacingState(fresh));
    expect(resolveChariotLoadout(legacy)).toEqual(resolveChariotLoadout(fresh));
  });

  test('the played profile is mid-ladder and carries a real loadout', () => {
    const raw = rawOf(fixtureById('mid-career'));
    expect(raw.currentTier).toBe(3);
    expect((raw.defeatedOpponentIds as string[]).length).toBeGreaterThan(0);
    expect(raw.fightsWon as number).toBeGreaterThan((raw.fightsLost as number) ?? 0);
    expect(raw.fame as number).toBeGreaterThan(0);
    expect(raw.gold as number).toBeGreaterThan(0);
    const equipped = raw.equipped as Record<string, unknown>;
    expect(Object.keys(equipped).sort()).toEqual(['arms', 'chest', 'helm', 'legs', 'weapon']);
  });

  test('the played profile keeps the fields no code advances at their creation values', () => {
    // A finding of this slice, pinned so it cannot drift silently: nothing in the
    // tree increments `bossKills` or writes `tierProgress`/`newGamePlus`/
    // `trainingSessionsLeft` after creation, so no played save can differ.
    const raw = rawOf(fixtureById('mid-career'));
    expect(raw.bossKills).toBe(0);
    expect(raw.newGamePlus).toBe(0);
    expect(raw.trainingSessionsLeft).toBe(2);
    expect(raw.tierProgress).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });

  test('the racing-era profile resolves to Quadra with its fitted chariot', () => {
    const profile = fixtureById('racing-era').profile;
    expect(resolveRacingState(profile)).toEqual({ unlocked: [2, 3, 4], selected: 4, horses: 4 });
    expect(getSelectedRacingConfig(profile).horses).toBe(4);
    expect(isRacingConfigUnlocked(profile, 'quadra')).toBe(true);
    expect(getRacingPurchaseEligibility(profile, 4)).toEqual({ ok: false, reason: 'already-unlocked' });
    expect(getRacingSelectionEligibility(profile, 'triga')).toEqual({ ok: true });

    expect(resolveChariotLoadout(profile)).toEqual({
      owned: ['wheels_standard', 'finish_stock', 'wheels_reinforced', 'finish_charred'],
      equipped: { wheels: 'wheels_reinforced', finish: 'finish_charred' },
    });
    expect(equippedChariotPartId(profile, 'finish')).toBe('finish_charred');
    expect(isChariotPartEquipped(profile, 'wheels_reinforced')).toBe(true);
  });

  test('the racing-era profile is a played profile plus the two later-added objects', () => {
    const racingRaw = rawOf(fixtureById('racing-era'));
    const midRaw = rawOf(fixtureById('mid-career'));
    for (const key of Object.keys(midRaw)) {
      if (key === 'gold') continue;
      expect(racingRaw[key]).toEqual(midRaw[key]);
    }
    expect(racingRaw.chariot).toBeDefined();
    expect(racingRaw.racing).toBeDefined();
  });

  test('null where an object is expected resolves to both defaults', () => {
    const profile = fixtureById('malformed-null-objects').profile;
    expect(resolveRacingState(profile)).toEqual(defaultRacingState());
    expect(resolveChariotLoadout(profile)).toEqual(defaultChariotLoadout());
  });

  test('a partial racing record drops the orphan Quadra and the unlocked-out selection', () => {
    const profile = fixtureById('malformed-partial-racing').profile;
    // `unlocked: [4]` cannot stand without Triga, and `selected: 3` names a locked team.
    expect(resolveRacingState(profile)).toEqual({ unlocked: [2], selected: 2, horses: 2 });
    expect(getSelectedRacingConfig(profile).id).toBe('biga');
    // Neither stored entry survives: Quadra is not unlocked, so racing it is refused…
    expect(getRacingSelectionEligibility(profile, 'quadra')).toEqual({ ok: false, reason: 'not-unlocked' });
    // …and Triga is still purchasable in principle, gated only by this fixture's 100 gold.
    expect(getRacingPurchaseEligibility(profile, 3)).toEqual({ ok: false, reason: 'insufficient-gold' });
  });

  test('a partial chariot record keeps what it knows and falls back per slot', () => {
    const profile = fixtureById('malformed-partial-chariot').profile;
    const resolved = resolveChariotLoadout(profile);
    expect(resolved.equipped).toEqual({ wheels: DEFAULT_CHARIOT_WHEELS, finish: DEFAULT_CHARIOT_FINISH });
    expect(resolved.owned).toEqual([DEFAULT_CHARIOT_WHEELS, DEFAULT_CHARIOT_FINISH, 'wheels_reinforced']);
    // The id the catalogue no longer knows is gone, so it cannot be equipped or bought again.
    expect(ownsChariotPart(profile, 'wheels_bladed_retired')).toBe(false);
    expect(getChariotEquipEligibility(profile, 'wheels_bladed_retired')).toEqual({
      ok: false,
      reason: 'unknown-part',
    });
  });
});

// ── §G forward compatibility ───────────────────────────────────────────────
describe('GC20 §G — unknown fields', () => {
  const forward = SAVE_FIXTURES.find((fixture) => fixture.id === 'malformed-unknown-fields')!;

  test('unknown fields are ignored by every resolver', () => {
    const profile = forward.profile;
    const stripped = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>;
    delete stripped.saveSchemaVersion;
    delete stripped.futureSeason;
    delete stripped._legacyNote;

    expect(resolveRacingState(profile)).toEqual(resolveRacingState(stripped as unknown as PlayerProfile));
    expect(resolveChariotLoadout(profile)).toEqual(resolveChariotLoadout(stripped as unknown as PlayerProfile));
    expect(calculateTotalStats(profile)).toEqual(calculateTotalStats(stripped as unknown as PlayerProfile));
  });

  test('unknown fields survive a load and save round trip untouched', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, fileBytes(forward));
    const loaded = loadSavedProfile()!;
    saveProfile(loaded);
    const stored = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)!) as Record<string, unknown>;

    expect(stored.saveSchemaVersion).toBe(7);
    expect(stored.futureSeason).toEqual({ rank: 4, laurels: [] });
    expect(stored._legacyNote).toBe('written by a build this one does not know');
    expect(JSON.stringify(stored)).toBe(JSON.stringify(JSON.parse(fileBytes(forward))));
  });

  test('an absent save is still null, not an empty profile', () => {
    expect(loadSavedProfile()).toBeNull();
  });

  test('unparseable bytes are refused, and the failure is the one the game logs', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, 'not json at all');
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      expect(loadSavedProfile()).toBeNull();
    } finally {
      console.error = original;
    }
    expect(logged.length).toBe(1);
    expect(String(logged[0][0])).toBe('Failed to load profile:');
  });
});

// ── §H scope guards ────────────────────────────────────────────────────────
describe('GC20 §H — scope guards', () => {
  test('no production source imports the corpus', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'saveFixtures') continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const code = readFileSync(full, 'utf8');
        if (/from '.*saveFixtures/.test(code) || /from ".*saveFixtures/.test(code)) {
          offenders.push(full.replace(SOURCE_DIR, ''));
        }
      }
    };
    walk(SOURCE_DIR);
    expect(offenders).toEqual(['utils/saveCorpus.test.ts']);
  });

  test('every fixture is synthetic — no fixture claims a real gladiator’s name', () => {
    for (const fixture of SAVE_FIXTURES) {
      const name = String(rawOf(fixture).name ?? '');
      expect([
        'Corpus Legacy',
        'Corpus Veteran',
        'Corpus Nulled',
        'Corpus Partial Racing',
        'Corpus Partial Chariot',
        'Corpus Forward Compat',
        'Corpus Chronicler',
        'Corpus Partial Story',
        'Corpus Hollow Fields',
        'Tester',
      ]).toContain(name);
    }
  });

  test('the only key this suite ever writes is the real save key', () => {
    for (const fixture of SAVE_FIXTURES) {
      localStorage.clear();
      localStorage.setItem(PROFILE_STORAGE_KEY, fileBytes(fixture));
      saveProfile(loadSavedProfile()!);
    }
    expect([...new Set(_writtenKeys)]).toEqual([PROFILE_STORAGE_KEY]);
    // The settings record and the legacy lefty key are named nowhere here.
    expect(_writtenKeys).not.toContain('sand_and_steel_settings_v1');
    expect(_writtenKeys).not.toContain('sand_and_steel_lefty_mode');
  });

  test('the corpus is data: the registry exports no writer and no storage access', () => {
    const registry = readFileSync(join(FIXTURE_DIR, 'index.ts'), 'utf8');
    const code = registry.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('localStorage');
    expect(code).not.toContain('saveProfile');
    expect(code).not.toContain('sessionStorage');
    expect(code).toContain('export const SAVE_FIXTURES');
  });

  test('the fixture files hold no byte-order mark and no trailing whitespace surprises', () => {
    for (const fixture of SAVE_FIXTURES) {
      const raw = fileBytes(fixture);
      expect(raw.startsWith('{')).toBe(true);
      expect(raw.endsWith('}\n')).toBe(true);
      expect(raw.includes('\r')).toBe(false);
    }
  });
});

// ── §I controls: the checks are sensitive to the values they pin ───────────
describe('GC20 §I — controls', () => {
  test('the racing invariant rejects an orphan Quadra, a locked selection and a bad order', () => {
    expect(racingIsSane({ unlocked: [2, 3, 4], selected: 4, horses: 4 })).toBe(true);
    expect(racingIsSane({ unlocked: [2, 4], selected: 4, horses: 4 })).toBe(false);
    expect(racingIsSane({ unlocked: [2, 4, 3], selected: 3, horses: 3 })).toBe(false);
    expect(racingIsSane({ unlocked: [2], selected: 3, horses: 3 })).toBe(false);
    expect(racingIsSane({ unlocked: [], selected: 2, horses: 2 })).toBe(false);
    expect(racingIsSane({ unlocked: [3, 2], selected: 2, horses: 2 })).toBe(false);
  });

  test('the chariot invariant rejects a missing default, a duplicate and an unowned fit', () => {
    const stock = defaultChariotLoadout();
    expect(chariotIsSane(stock)).toBe(true);
    expect(chariotIsSane({ owned: ['wheels_standard'], equipped: stock.equipped })).toBe(false);
    expect(chariotIsSane({ owned: [...stock.owned, 'wheels_standard'], equipped: stock.equipped })).toBe(false);
    expect(chariotIsSane({ owned: [...stock.owned, 'wheels_reinforced'], equipped: { ...stock.equipped, wheels: 'wheels_reinforced' } })).toBe(true);
    expect(chariotIsSane({ owned: ['no_such_part', 'finish_stock'], equipped: stock.equipped })).toBe(false);
  });

  test('the stats invariant rejects a missing or non-finite number', () => {
    const good = calculateTotalStats(createNewProfile('Control')) as unknown as Record<string, unknown>;
    expect(statsAreSane(good)).toBe(true);
    expect(statsAreSane({ ...good, strength: Number.NaN })).toBe(false);
    expect(statsAreSane({ ...good, healthMax: 0 })).toBe(false);
    const missing = { ...good } as Record<string, unknown>;
    delete missing.staminaRegen;
    expect(statsAreSane(missing)).toBe(false);
  });

  test('the byte comparison would catch a mutation — the check is not vacuous', () => {
    const fixture = SAVE_FIXTURES[0];
    const before = bytesOf(fixture);
    const mutated = JSON.parse(fileBytes(fixture)) as Record<string, unknown>;
    mutated.gold = (mutated.gold as number) + 1;
    expect(JSON.stringify(mutated)).not.toBe(before);
    // The real fixture is untouched by that experiment.
    expect(bytesOf(fixture)).toBe(before);
  });

  test('the load-path comparison would catch a dropped field', () => {
    const fixture = SAVE_FIXTURES[1];
    const raw = fileBytes(fixture);
    localStorage.setItem(PROFILE_STORAGE_KEY, raw);
    const loaded = JSON.parse(JSON.stringify(loadSavedProfile())) as Record<string, unknown>;
    delete loaded.title;
    expect(JSON.stringify(loaded)).not.toBe(JSON.stringify(JSON.parse(raw)));
  });
});

// ── §J the corpus rule, enforced from the type itself ──────────────────────
describe('GC20 §J — the corpus rule', () => {
  test('every optional top-level profile field is accounted for by this corpus', () => {
    const types = readFileSync(join(SOURCE_DIR, 'types/game.ts'), 'utf8');
    const start = types.indexOf('export interface PlayerProfile {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = types.indexOf('{', start); i < types.length; i += 1) {
      if (types[i] === '{') depth += 1;
      if (types[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = types.slice(start, end);
    const optional = [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map((match) => match[1]);

    // The optional fields of PlayerProfile, in the order src/types/game.ts
    // declares them (above, the scan reads declarations in file order).  A slice
    // that adds one lands here first — which is the corpus rule: add the fixture
    // with the field.
    expect(optional).toEqual([
      'injury',
      'isLeftyMode',
      'chariot',
      'racing',
      'story',
      'temper',
      'road',
      'seen',
      'time',
    ]);

    // Every optional field with a resolver has a fixture for both its absent and
    // its present case; `injury` is read by calculateTotalStats; `isLeftyMode` is
    // still written by the creation path and read by nothing.
    for (const field of ['racing', 'chariot', 'story', 'temper', 'road', 'seen', 'time']) {
      const withField = SAVE_FIXTURES.filter((fixture) => rawOf(fixture)[field] !== undefined && rawOf(fixture)[field] !== null);
      const withoutField = SAVE_FIXTURES.filter((fixture) => !(field in rawOf(fixture)) || rawOf(fixture)[field] === null);
      expect(withField.length, `no fixture carries '${field}'`).toBeGreaterThan(0);
      expect(withoutField.length, `no fixture omits '${field}'`).toBeGreaterThan(0);
    }
    expect(SAVE_FIXTURES.some((fixture) => rawOf(fixture).isLeftyMode === false)).toBe(true);
  });
});
