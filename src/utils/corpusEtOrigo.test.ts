/**
 * PITCH A4 — CORPUS ET ORIGO: the three creation axes, the Origo passive and the
 * creation write path.
 *
 * Run with: `bun test src/utils/corpusEtOrigo.test.ts`
 *
 * ── WHY THIS SUITE EXISTS ─────────────────────────────────────────────────
 * The pitch adds three cheap axes to the existing creation-points screen — Build,
 * Origo and Vitium — and every list and value in them is a DIRECTOR RULING, not a
 * design transcription (`src/data/corpusEtOrigo.ts`).  This suite pins the rulings
 * themselves and the two seams they touch:
 *
 *   §A  the data: three builds, six provinces (god + ONE passive channel + flavour
 *       line), four vitia, and no geometry anywhere (no silhouette in this slice);
 *   §B  the pool: ten points, or twelve with a flaw (Pitch A4 — R-VITIUM);
 *   §C  the build delta applied BEFORE allocation, so the floor is template + delta
 *       (Pitch A4 — R-BUILD), for every class and every build;
 *   §D  the vitium record: one id, no stat penalty of its own, "None" writes nothing;
 *   §E  legacy defaults: a save with no `identity` gets no build delta, no Origo
 *       passive and the ten-point pool, and nothing is assigned retroactively;
 *   §F  the Origo passive: exactly one channel per province, in the shared block;
 *   §G  the merge: the player's block gains the passive, an OPPONENT's block is
 *       byte-identical to the pre-A4 reconstruction for the whole roster;
 *   §H  the factory: `createNewProfile()`'s no-argument output is byte-identical;
 *   §I  every one of the six passives actually lands on its stage;
 *   §J  the surfaces: the creation screen renders the three pickers from the data,
 *       the character sheet and the help modal are rendered in the sibling `.tsx`.
 *
 * No storage is read or written: `buildCreatedProfile` and `createNewProfile` are
 * pure, and nothing here reaches `localStorage`.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { BuildId, PlayerAppearance, PlayerProfile, ProvinceId } from '../types/game';
import { ARMATURAE, getArmatura } from '../data/armaturae';
import {
  BUILDS,
  BUILD_IDS,
  DEFAULT_BUILD_ID,
  DEFAULT_PROVINCE_ID,
  PROVINCES,
  PROVINCE_IDS,
  VITIA,
  VITIUM_CREATION_POINTS,
  VITIUM_IDS,
  getBuild,
  getProvince,
  getVitium,
} from '../data/corpusEtOrigo';
import {
  CREATION_POINTS,
  DEFAULT_CORPUS,
  NO_ALLOCATION,
  armaturaBaseStats,
  buildCreatedProfile,
  buildStatDelta,
  corpusIdentity,
  creationPoints,
  unspentPoints,
} from './characterCreation';
import {
  originPassiveBlock,
  resolveBuildId,
  resolveCorpusIdentity,
  resolveProvinceId,
  resolveVitiumId,
} from './originPassive';
import {
  buildOpponentModifiers,
  buildPlayerModifiers,
  damageDealtMultiplier,
  damageTakenMultiplier,
  hitAgilityFor,
  resolveTraitMult,
  staminaCostWithModifiers,
  type DamageContext,
} from './combatModifiers';
import { mergeModifiers } from './traitModifiers';
import { calculateTotalStats, createNewProfile } from '../services/storage';
import { ALL_OPPONENTS } from '../data/opponents';
import { getPalma } from '../data/palmae';

const APPEARANCE: PlayerAppearance = {
  skinColor: '#c68b59',
  hairColor: '#3e2723',
  tunicColor: '#854d0e',
  crestColor: '#dc2626',
  clothingStyle: 'roman_tunic',
  characterModel: 'roman_warrior',
};

/** Strip block and line comments, so prose can neither satisfy nor defeat a pin. */
const codeOf = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const creationSource = () => readFileSync('src/components/hub/CharacterCreation.tsx', 'utf8');

/**
 * The pre-A4 factory's output, frozen as bytes (`createNewProfile('Tester')`).  This
 * is A4's own independent pin of the same string `characterCreation.test.ts` §C
 * freezes — a slice that adds a field to the no-argument path fails in both places.
 */
const PRE_A4_FACTORY_JSON =
  '{"name":"Tester","title":"The Sandborn Rebel","rank":"Rookie","appearance":{"skinColor":"#c68b59","hairColor":"#3e2723","tunicColor":"#854d0e","crestColor":"#dc2626","clothingStyle":"roman_tunic","characterModel":"roman_warrior"},"level":1,"xp":0,"xpToNextLevel":100,"unspentStatPoints":10,"baseStats":{"strength":10,"agility":10,"stamina":10,"defense":4},"gold":100,"fame":0,"currentTier":1,"tierProgress":{"1":0,"2":0,"3":0,"4":0},"defeatedOpponentIds":[],"bossKills":0,"newGamePlus":0,"trainingSessionsLeft":2,"injury":null,"equipped":{"weapon":{"id":"gladius_standard","name":"Standard Gladius & Scutum","type":"sword_shield","rarity":"common","description":"The iconic Roman short sword and rectangular legionary curved shield.","damageLight":14,"damageHeavy":26,"staminaLight":12,"staminaHeavy":24,"range":2.1,"speed":0.38,"blockReduction":0.82,"price":50,"sellPrice":20,"color":"#c59b27","metalColor":"#e2e8f0","icon":"ShieldAlert","modelPath":"/models/weapons/gladius.glb","bonusStrength":0,"bonusDefense":2}},"inventory":[{"id":"gladius_standard","name":"Standard Gladius & Scutum","type":"sword_shield","rarity":"common","description":"The iconic Roman short sword and rectangular legionary curved shield.","damageLight":14,"damageHeavy":26,"staminaLight":12,"staminaHeavy":24,"range":2.1,"speed":0.38,"blockReduction":0.82,"price":50,"sellPrice":20,"color":"#c59b27","metalColor":"#e2e8f0","icon":"ShieldAlert","modelPath":"/models/weapons/gladius.glb","bonusStrength":0,"bonusDefense":2},{"id":"hoplite_spear","name":"Dory Hoplite Spear","type":"spear","rarity":"common","description":"Ash-wood shaft tipped with a bronze leaf blade for deadly thrusts.","damageLight":16,"damageHeavy":30,"staminaLight":11,"staminaHeavy":22,"range":3.1,"speed":0.34,"blockReduction":0.45,"price":110,"sellPrice":45,"color":"#b45309","metalColor":"#d97706","icon":"Zap","bonusAgility":3}],"fightsWon":0,"fightsLost":0,"peakCrowdHypeOverall":0,"isLeftyMode":false}';

/** A damage context with nothing conditional in play. */
const CTX: DamageContext = {
  isQuick: false,
  distance: 2,
  effectiveRange: 2.5,
  attackerHealth: 100,
  attackerHealthMax: 100,
  defenderHealth: 50,
  defenderHealthMax: 100,
  defenderIsBoss: false,
};

/** A profile that is a real creation shape, optionally carrying one province. */
const withOrigo = (origo: ProvinceId): PlayerProfile => ({
  ...createNewProfile('Origo Tester'),
  identity: { origo },
});

// ── §A the data, exactly as the rulings state it ───────────────────────────
describe('PITCH A4 §A — the three axes as data', () => {
  test('three builds, and Even is the identity row', () => {
    expect(BUILD_IDS).toEqual(['even', 'sturdy', 'swift']);
    expect(BUILDS).toHaveLength(3);
    expect(buildStatDelta('even')).toEqual({});
    expect(buildStatDelta('sturdy')).toEqual({ agi: -1, sta: 1 });
    expect(buildStatDelta('swift')).toEqual({ agi: 1, sta: -1 });
    for (const row of BUILDS) {
      expect(row.name.trim().length).toBeGreaterThan(0);
      expect(row.text.trim().length).toBeGreaterThan(10);
    }
    expect(DEFAULT_BUILD_ID).toBe('even');
  });

  test('six provinces, each with a god, exactly ONE passive channel and a flavour line', () => {
    expect(PROVINCE_IDS).toEqual([
      'italia',
      'hispania',
      'gallia',
      'graecia',
      'aegyptus',
      'thracia',
    ]);
    const expected: Record<ProvinceId, { god: string; channel: string; value: number; flavour: string }> = {
      italia: {
        god: 'Mars',
        channel: 'damageDealtMult',
        value: 1.05,
        flavour: 'The road from Italia is paved, and every toll is collected twice.',
      },
      hispania: {
        god: 'Diana',
        channel: 'hitAgiAdd',
        value: 1,
        flavour: 'Hispania breeds hunters who never miss the first throw.',
      },
      gallia: {
        god: 'Mercury',
        channel: 'staminaCostMult',
        value: 0.95,
        flavour: 'Gallic merchants talk fast, walk faster, and never pay full price.',
      },
      graecia: {
        god: 'Apollo',
        channel: 'staminaRegenAdd',
        value: 1,
        flavour: 'Greek tutors teach the body the way they teach the lyre: daily, and without mercy.',
      },
      aegyptus: {
        god: 'Isis',
        channel: 'healthMaxAdd',
        value: 5,
        flavour: 'The Nile teaches patience: a wound closes if you give it a season.',
      },
      thracia: {
        god: 'Bellona',
        channel: 'damageTakenMult',
        value: 0.95,
        flavour: 'Thracians are born with a blade in hand and a song half-sung.',
      },
    };
    for (const [id, row] of Object.entries(expected) as [ProvinceId, typeof expected.italia][]) {
      const province = getProvince(id);
      expect(province, id).toBeDefined();
      expect(province!.god, id).toBe(row.god);
      expect(province!.passive.channel, id).toBe(row.channel);
      expect(province!.passive.value, id).toBe(row.value);
      expect(province!.flavour, id).toBe(row.flavour);
      // ONE channel per province — the block a province becomes has one key.
      expect(Object.keys(originPassiveBlock({ identity: { origo: id } }))).toEqual([row.channel]);
    }
    // The six channels are distinct, so no two provinces are the same passive.
    const channels = PROVINCES.map((row) => row.passive.channel);
    expect(new Set(channels).size).toBe(PROVINCES.length);
    expect(DEFAULT_PROVINCE_ID).toBe('italia');
  });

  test('four flaws, each a flavour line, none carrying a stat value', () => {
    expect(VITIUM_IDS).toEqual(['old_knee', 'quick_temper', 'superstitious', 'night_terrors']);
    expect(getVitium('old_knee')?.text).toBe('The left knee remembers every winter campaign.');
    expect(getVitium('quick_temper')?.text).toBe('Slow to forgive, quick to swing.');
    expect(getVitium('superstitious')?.text).toBe(
      'Never enters the sand without touching the gate.',
    );
    expect(getVitium('night_terrors')?.text).toBe(
      'Dreams of the arena before dawn, and wakes already tired.',
    );
    expect(VITIUM_CREATION_POINTS).toBe(2);
    for (const row of VITIA) {
      // The flaw record is the stat flag; there is no stat field to read.
      expect(Object.keys(row).sort()).toEqual(['id', 'name', 'text']);
    }
  });

  test('NO silhouette geometry in this slice — the data carries no scale or rig change', () => {
    const data = codeOf('src/data/corpusEtOrigo.ts');
    expect(data).not.toContain('scale');
    expect(data).not.toContain('geometry');
    expect(data).not.toContain('silhouette');
    // …and the creation screen does not pass anything model-shaping from the axes.
    const screen = codeOf('src/components/hub/CharacterCreation.tsx');
    expect(screen).not.toContain('corpus.build}');
    expect(screen).not.toContain('characterModel: corpus');
  });

  test('the lookups are total and refuse an unknown id', () => {
    expect(getBuild('gladiator' as never)).toBeUndefined();
    expect(getProvince('rome' as never)).toBeUndefined();
    expect(getVitium('lazy' as never)).toBeUndefined();
    expect(getBuild(undefined)).toBeUndefined();
    expect(getProvince(7 as never)).toBeUndefined();
    expect(buildStatDelta('gladiator' as BuildId)).toEqual({});
  });
});

// ── §B the pool ───────────────────────────────────────────────────────────
describe('PITCH A4 §B — the creation pool', () => {
  test('ten points without a flaw, twelve with any of the four', () => {
    expect(CREATION_POINTS).toBe(10);
    expect(creationPoints()).toBe(10);
    expect(creationPoints(null)).toBe(10);
    expect(creationPoints(undefined)).toBe(10);
    for (const id of VITIUM_IDS) expect(creationPoints(id), id).toBe(12);
    // An unknown id buys nothing.
    expect(creationPoints('lazy' as never)).toBe(10);
  });

  test('unspentPoints reads the same pool the screen does', () => {
    const spent = { strength: 4, agility: 3, stamina: 2, defense: 1 };
    expect(unspentPoints(NO_ALLOCATION)).toBe(10);
    expect(unspentPoints(spent)).toBe(0);
    expect(unspentPoints(NO_ALLOCATION, 'old_knee')).toBe(12);
    expect(unspentPoints(spent, 'night_terrors')).toBe(2);
    expect(unspentPoints({ strength: 10, agility: 0, stamina: 0, defense: 0 }, 'old_knee')).toBe(2);
  });

  test('the creation screen spends against the flaw-adjusted pool', () => {
    const screen = creationSource();
    expect(screen).toContain('unspentPoints(allocation, corpus.vitium)');
    expect(screen).toContain('creationPoints(corpus.vitium)');
    expect(screen).toContain('VITIUM_CREATION_POINTS');
  });
});

// ── §C the build delta, before allocation ─────────────────────────────────
describe('PITCH A4 §C — the build delta and the floor rule', () => {
  test('the delta lands on the template before a single point is spent', () => {
    for (const row of ARMATURAE) {
      const delta = buildStatDelta('sturdy');
      expect(armaturaBaseStats(row, NO_ALLOCATION, 'sturdy'), row.id).toEqual({
        strength: row.stats.strength + (delta.str ?? 0),
        agility: row.stats.agility + (delta.agi ?? 0),
        stamina: row.stats.stamina + (delta.sta ?? 0),
        defense: row.stats.defense + (delta.def ?? 0),
      });
    }
  });

  test('every class × every build: baseStats = template + delta + allocation', () => {
    const allocation = { strength: 2, agility: 3, stamina: 4, defense: 1 };
    for (const row of ARMATURAE) {
      for (const build of BUILDS) {
        const delta = buildStatDelta(build.id);
        const base = armaturaBaseStats(row, allocation, build.id);
        expect(base, `${row.id}/${build.id}`).toEqual({
          strength: row.stats.strength + (delta.str ?? 0) + 2,
          agility: row.stats.agility + (delta.agi ?? 0) + 3,
          stamina: row.stats.stamina + (delta.sta ?? 0) + 4,
          defense: row.stats.defense + (delta.def ?? 0) + 1,
        });
      }
    }
  });

  test('the floor is template + delta, so Sturdy lowers agility and raises stamina', () => {
    const murmillo = getArmatura('murmillo');
    if (!murmillo) throw new Error('no murmillo');
    const even = armaturaBaseStats(murmillo, NO_ALLOCATION, 'even');
    const sturdy = armaturaBaseStats(murmillo, NO_ALLOCATION, 'sturdy');
    const swift = armaturaBaseStats(murmillo, NO_ALLOCATION, 'swift');

    expect(even).toEqual(murmillo.stats);
    expect(sturdy).toEqual({
      ...murmillo.stats,
      agility: murmillo.stats.agility - 1,
      stamina: murmillo.stats.stamina + 1,
    });
    expect(swift).toEqual({
      ...murmillo.stats,
      agility: murmillo.stats.agility + 1,
      stamina: murmillo.stats.stamina - 1,
    });
    // No build at all is the identity, so a pre-A4 call is unchanged.
    expect(armaturaBaseStats(murmillo, NO_ALLOCATION)).toEqual(murmillo.stats);
    expect(armaturaBaseStats(murmillo, NO_ALLOCATION, null)).toEqual(murmillo.stats);
  });

  test('a created profile carries the delta: Sturdy Murmillo, before allocation', () => {
    const profile = buildCreatedProfile({
      name: 'Sturdy',
      appearance: APPEARANCE,
      armatura: 'murmillo',
      allocation: NO_ALLOCATION,
      build: 'sturdy',
      origo: 'italia',
    });
    const murmillo = getArmatura('murmillo');
    if (!murmillo) throw new Error('no murmillo');
    expect(profile.baseStats).toEqual({
      ...murmillo.stats,
      agility: murmillo.stats.agility - 1,
      stamina: murmillo.stats.stamina + 1,
    });
    expect(profile.identity).toEqual({ build: 'sturdy', origo: 'italia' });
  });
});

// ── §D the vitium record ──────────────────────────────────────────────────
describe('PITCH A4 §D — the chosen flaw', () => {
  const base = {
    name: 'Vitium',
    appearance: APPEARANCE,
    armatura: 'murmillo' as const,
    allocation: { strength: 1, agility: 1, stamina: 1, defense: 1 },
    build: 'even' as const,
    origo: 'gallia' as const,
  };

  test('a flaw is ONE id in the identity record, and it raises the pool by two', () => {
    const none = buildCreatedProfile({ ...base });
    const flawed = buildCreatedProfile({ ...base, vitium: 'old_knee' });

    expect(none.identity).toEqual({ build: 'even', origo: 'gallia' });
    expect('vitium' in (none.identity ?? {})).toBe(false);
    expect(flawed.identity).toEqual({ build: 'even', origo: 'gallia', vitium: 'old_knee' });
    expect(typeof flawed.identity?.vitium).toBe('string');
    expect(none.unspentStatPoints).toBe(10 - 4);
    expect(flawed.unspentStatPoints).toBe(12 - 4);
  });

  test('the flaw carries NO stat penalty of its own — the +2 economy is the mechanic', () => {
    for (const id of VITIUM_IDS) {
      const flawed = buildCreatedProfile({ ...base, vitium: id });
      const none = buildCreatedProfile({ ...base });
      expect(flawed.baseStats, id).toEqual(none.baseStats);
      expect(calculateTotalStats(flawed), id).toEqual(calculateTotalStats(none));
    }
  });

  test('"None" is a valid choice: no vitium key, and the ten-point pool', () => {
    const explicitNone = buildCreatedProfile({ ...base, vitium: null });
    expect('vitium' in (explicitNone.identity ?? {})).toBe(false);
    expect(explicitNone.unspentStatPoints).toBe(6);
    expect(creationPoints(null)).toBe(10);
  });

  test('the default choices are Even + Italia + no flaw, and all three are changeable', () => {
    expect(DEFAULT_CORPUS).toEqual({ build: 'even', origo: 'italia', vitium: null });
    const screen = creationSource();
    expect(screen).toContain('useState<CreationCorpus>(DEFAULT_CORPUS)');
    expect(screen).toContain('handleBuildSelect');
    expect(screen).toContain('handleOrigoSelect');
    expect(screen).toContain('handleVitiumSelect');
  });
});

// ── §E legacy defaults ────────────────────────────────────────────────────
describe('PITCH A4 §E — a save with no identity', () => {
  const legacy: PlayerProfile = { ...createNewProfile('Legacy') };

  test('resolves to nothing recorded, and invents no province', () => {
    expect('identity' in legacy).toBe(false);
    expect(resolveCorpusIdentity(legacy)).toEqual({});
    expect(resolveCorpusIdentity(undefined)).toEqual({});
    expect(resolveCorpusIdentity(null)).toEqual({});
    expect(resolveCorpusIdentity('nonsense')).toEqual({});
    // The BUILD is displayed as Even (whose delta is the identity); the province
    // and the flaw have NO default value invented for them.
    expect(resolveBuildId(legacy)).toBe('even');
    expect(resolveProvinceId(legacy)).toBeNull();
    expect(resolveVitiumId(legacy)).toBeNull();
  });

  test('no build delta, no Origo passive, and the pool stays ten', () => {
    expect(buildStatDelta(undefined)).toEqual({});
    expect(buildStatDelta(null)).toEqual({});
    expect(originPassiveBlock(legacy)).toEqual({});
    expect(unspentPoints(NO_ALLOCATION)).toBe(10);

    // The merged player block is exactly the pre-A4 one.
    const mods = buildPlayerModifiers(legacy);
    const doctrina = getArmatura('murmillo')?.doctrina.modifiers ?? {};
    expect(mods.block).toEqual(mergeModifiers([doctrina]));
    expect(mods.origin).toEqual({});
  });

  test('a malformed identity is tolerated field by field, never repaired', () => {
    const partial = { ...legacy, identity: { build: 'sturdy', origo: 'rome', vitium: 7 } };
    expect(resolveCorpusIdentity(partial)).toEqual({ build: 'sturdy' });
    const junk = { ...legacy, identity: 'sturdy' as never };
    expect(resolveCorpusIdentity(junk)).toEqual({});
    const nulled = { ...legacy, identity: null as never };
    expect(resolveCorpusIdentity(nulled)).toEqual({});
    expect(originPassiveBlock(nulled)).toEqual({});
  });

  test('a creation call with no choices writes no identity at all', () => {
    const profile = buildCreatedProfile({
      name: 'Plain',
      appearance: APPEARANCE,
      armatura: 'thraex',
      allocation: NO_ALLOCATION,
    });
    expect('identity' in profile).toBe(false);
    expect(Object.keys(profile)).not.toContain('identity');
    expect(profile.unspentStatPoints).toBe(10);
    expect(corpusIdentity({})).toBeNull();
    expect(corpusIdentity({ build: null, origo: null, vitium: null })).toBeNull();
    expect(corpusIdentity({ build: 'even', origo: 'italia' })).toEqual({
      build: 'even',
      origo: 'italia',
    });
  });
});

// ── §F the Origo passive mapping ──────────────────────────────────────────
describe('PITCH A4 §F — one passive per province, as a modifier block', () => {
  test('each province maps to exactly its own single channel and value', () => {
    const table: Record<ProvinceId, Record<string, number>> = {
      italia: { damageDealtMult: 1.05 },
      hispania: { hitAgiAdd: 1 },
      gallia: { staminaCostMult: 0.95 },
      graecia: { staminaRegenAdd: 1 },
      aegyptus: { healthMaxAdd: 5 },
      thracia: { damageTakenMult: 0.95 },
    };
    for (const [id, block] of Object.entries(table) as [ProvinceId, Record<string, number>][]) {
      expect(originPassiveBlock({ identity: { origo: id } }), id).toEqual(block);
      expect(Object.keys(originPassiveBlock({ identity: { origo: id } })), id).toHaveLength(1);
    }
    // Accepts the identity record on its own, like `resolvePalmae` does.
    expect(originPassiveBlock({ origo: 'hispania' })).toEqual({ hitAgiAdd: 1 });
    expect(originPassiveBlock({ origo: 'atlantis' })).toEqual({});
    expect(originPassiveBlock({})).toEqual({});
  });
});

// ── §G the merge: player-only, opponents unchanged ────────────────────────
describe('PITCH A4 §G — the merge seam', () => {
  /** The pre-A4 assembly, reconstructed: palmae effects + the class doctrina. */
  const preA4PlayerBlock = (profile: PlayerProfile) => {
    const armaturaId = resolveBuildId(profile) && getArmatura(profile.armatura ?? 'murmillo');
    const doctrina = armaturaId?.doctrina.modifiers ?? {};
    const palmae = (profile.palmae?.equipped ?? [])
      .map((id) => getPalma(id))
      .filter((palma): palma is NonNullable<typeof palma> => palma !== undefined)
      .map((palma) => palma.effect);
    return mergeModifiers([...palmae, doctrina]);
  };

  test("the player's block gains the passive; a save without one does not", () => {
    const plain = createNewProfile('Merge');
    const gallic: PlayerProfile = { ...plain, identity: { origo: 'gallia' } };
    expect(buildPlayerModifiers(plain).block).toEqual(preA4PlayerBlock(plain));
    expect(buildPlayerModifiers(gallic).block).toEqual({
      ...preA4PlayerBlock(gallic),
      staminaCostMult: 0.95,
    });
    expect(buildPlayerModifiers(gallic).origin).toEqual({ staminaCostMult: 0.95 });
  });

  test('every opponent block is byte-identical to its pre-A4 reconstruction', () => {
    let withClass = 0;
    for (const opponent of ALL_OPPONENTS) {
      const mods = buildOpponentModifiers(opponent);
      const doctrina = opponent.armatura ? getArmatura(opponent.armatura)?.doctrina.modifiers ?? {} : {};
      const palmae = (opponent.palmae ?? [])
        .map((id) => getPalma(id))
        .filter((palma): palma is NonNullable<typeof palma> => palma !== undefined)
        .map((palma) => palma.effect);
      expect(mods.block, opponent.id).toEqual(mergeModifiers([...palmae, doctrina]));
      // No Origo passive can ever reach an opponent: the block is exactly its
      // palmae + doctrina, and the `origin` slot stays empty on every row.
      expect(mods.origin, opponent.id).toEqual({});
      if (opponent.armatura) withClass += 1;
    }
    // The sweep is not vacuous: the roster really does carry classes.
    expect(withClass).toBeGreaterThan(0);
  });

  test("the opponent builder never reads the player's profile", () => {
    const plain = createNewProfile('No Origo');
    const egyptian: PlayerProfile = { ...plain, identity: { origo: 'aegyptus' } };
    // A profile is not an opponent config: what it resolves here depends only on
    // the two keys the builder reads, and the identity is not one of them.
    expect(buildOpponentModifiers(egyptian as never).block).toEqual(
      buildOpponentModifiers(plain as never).block,
    );
    expect(buildOpponentModifiers(egyptian as never).origin).toEqual({});
  });
});

// ── §H the factory ────────────────────────────────────────────────────────
describe('PITCH A4 §H — createNewProfile', () => {
  test('with no argument the output is byte-identical to the pre-A4 factory', () => {
    // A4's own independent pin of the same bytes `characterCreation.test.ts` §C
    // freezes: comparing the SERIALISED string pins the key set, its ORDER and
    // every value, so a field (or a reordering) cannot slip into the no-argument
    // path — which is exactly what "no identity unless choices are passed" means.
    const live = createNewProfile('Tester');
    expect(JSON.stringify(live)).toBe(PRE_A4_FACTORY_JSON);
    expect('identity' in live).toBe(false);
    expect(Object.keys(live)).not.toContain('identity');
    expect(live.baseStats).toEqual({ strength: 10, agility: 10, stamina: 10, defense: 4 });
    expect(live.unspentStatPoints).toBe(10);
  });

  test('the class argument still writes only the class — never an identity', () => {
    const withClass = createNewProfile('Tester', 'roman_warrior', 'retiarius');
    expect(Object.keys(withClass).sort()).toEqual([...Object.keys(createNewProfile('Tester')), 'armatura'].sort());
    expect('identity' in withClass).toBe(false);
  });
});

// ── §I every passive lands on its stage ───────────────────────────────────
describe('PITCH A4 §I — the six passives, read at their own stage', () => {
  test('Italia: damage dealt ×1.05', () => {
    expect(damageDealtMultiplier(buildPlayerModifiers(withOrigo('italia')), CTX)).toBeCloseTo(1.05, 10);
    expect(damageDealtMultiplier(buildPlayerModifiers(createNewProfile('x')), CTX)).toBe(1);
  });

  test('Thracia: damage taken ×0.95', () => {
    expect(damageTakenMultiplier(buildPlayerModifiers(withOrigo('thracia')), CTX)).toBeCloseTo(0.95, 10);
    expect(damageTakenMultiplier(buildPlayerModifiers(createNewProfile('x')), CTX)).toBe(1);
  });

  test('the two combine through resolveTraitMult', () => {
    const attacker = buildPlayerModifiers(withOrigo('italia'));
    const defender = buildPlayerModifiers(withOrigo('thracia'));
    expect(resolveTraitMult(attacker, defender, CTX)).toBeCloseTo(1.05 / 0.95, 10);
  });

  test('Hispania: +1 agility in the hit roll only', () => {
    const mods = buildPlayerModifiers(withOrigo('hispania'));
    expect(hitAgilityFor(10, mods)).toBe(11);
    // …and NOT on the stat sheet, which reads baseStats and equipment.
    const profile = withOrigo('hispania');
    expect(calculateTotalStats(profile).agility).toBe(calculateTotalStats(createNewProfile('x')).agility);
  });

  test('Gallia: stamina costs ×0.95 on a power attack', () => {
    const mods = buildPlayerModifiers(withOrigo('gallia'));
    expect(staminaCostWithModifiers(20, false, mods)).toBe(19);
    expect(staminaCostWithModifiers(20, true, mods)).toBe(20); // quick attacks are never discounted
  });

  test('Graecia: +1 stamina recovery; Aegyptus: +5 maximum health', () => {
    const plain = calculateTotalStats(createNewProfile('x'));
    const greek = calculateTotalStats(withOrigo('graecia'));
    const egyptian = calculateTotalStats(withOrigo('aegyptus'));
    expect(greek.staminaRegen).toBeCloseTo(plain.staminaRegen + 1, 10);
    expect(egyptian.healthMax).toBe(plain.healthMax + 5);
    // Neither moves a base attribute, so a legacy save's sheet is untouched.
    expect(greek.agility).toBe(plain.agility);
    expect(egyptian.staminaMax).toBe(plain.staminaMax);
  });
});

// ── §J the creation screen ────────────────────────────────────────────────
describe('PITCH A4 §J — the creation screen and the sheet', () => {
  test('the three pickers render from the data, never from copies', () => {
    const screen = creationSource();
    expect(screen).toContain("from '../../data/corpusEtOrigo'");
    expect(screen).toContain('{BUILDS.map((row) => {');
    expect(screen).toContain('{PROVINCES.map((row) => {');
    expect(screen).toContain('{VITIA.map((row) => {');
    expect(screen).toContain('data-corpus-build-picker');
    expect(screen).toContain('data-corpus-build-card={row.id}');
    expect(screen).toContain('data-corpus-origo-picker');
    expect(screen).toContain('data-corpus-origo-card={row.id}');
    expect(screen).toContain('data-corpus-vitium-picker');
    expect(screen).toContain('data-corpus-vitium-card="none"');
    expect(screen).toContain('data-corpus-vitium-card={row.id}');
    // Touch parity: every new card is at the 48px floor, like the class cards.
    expect(screen.split('min-h-[48px]').length).toBeGreaterThan(4);
    // The province card shows the god AND the flavour line.
    expect(screen).toContain('row.god');
    expect(screen).toContain('row.flavour');
    expect(screen).toContain('row.passive.text');
  });

  test('the screen finishes through the pure creation module with all three choices', () => {
    const screen = creationSource();
    expect(screen).toContain('build: corpus.build');
    expect(screen).toContain('origo: corpus.origo');
    expect(screen).toContain('vitium: corpus.vitium');
    expect(screen).toContain('const draftStats = calculateTotalStats(buildProfile());');
  });

  test('the character sheet reads the identity through the one resolver', () => {
    const sheet = readFileSync('src/components/hub/StatsTab.tsx', 'utf8');
    expect(sheet).toContain("from '../../utils/originPassive'");
    expect(sheet).toContain('resolveBuildId(profile)');
    expect(sheet).toContain('resolveProvinceId(profile)');
    expect(sheet).toContain('resolveVitiumId(profile)');
    expect(sheet).toContain('data-corpus-identity');
    expect(sheet).toContain('Corpus et Origo');
  });

  test('the help modal carries both new terms verbatim', () => {
    // The source wraps long glosses, so the check reads the copy with its
    // whitespace collapsed — the RENDERED wording is asserted verbatim by
    // `corpusEtOrigoSurface.test.tsx` §C.
    const help = readFileSync('src/components/hub/HelpModal.tsx', 'utf8').replace(/\s+/g, ' ');
    expect(help).toContain('Corpus et Origo');
    expect(help).toContain(
      'Your life before the sand: build, birthplace, and flaw, chosen at creation.',
    );
    expect(help).toContain('Vitium');
    expect(help).toContain(
      'A chosen flaw, taken at creation, worth two creation points. Yours alone, and permanent.',
    );
    // The Doctore's naming of a Vitium is DEFERRED — the gloss promises nothing.
    // Read comment-stripped, so this slice's own note about the deferral cannot
    // count as the promise it forbids.
    const helpCode = codeOf('src/components/hub/HelpModal.tsx');
    expect(helpCode).not.toContain("Doctore's Test");
    expect(helpCode).not.toContain('Doctore Test');
    expect(helpCode).not.toContain('Favores');
  });
});
