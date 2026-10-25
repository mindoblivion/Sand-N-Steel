/**
 * ===========================================================================
 * CH-4 — OPPONENTS & LADDER (identities, boss palmae, new rivals)
 * ===========================================================================
 * The slice's pins, one section per claim the brief makes:
 *
 *   §A  the config shape and the STRUCTURAL SWEEP — `armatura`/`palmae` are
 *       optional, every id resolves, and no non-boss config carries a
 *       `BossMechanic`, a `phase2WeaponType` or a boss-only palma;
 *   §B  the eight originals — a FROZEN snapshot of ids, names, tiers, stats and
 *       the three rewards, with every pre-existing `fightIndex` pinned except
 *       Ignis and Valéria, whose 2 → 4 move is the Director ruling asserted
 *       explicitly (`tierAdvancement` keys on `isBoss`, not on the rung);
 *   §C  the ladder — tiers 2 and 3 list four fights each in the design's order,
 *       the roster stays tier-then-rung ordered, rungs are unique per tier and
 *       the four new rivals carry the identity the brief assigns;
 *   §D  old saves — the old ids still resolve to the same opponents and the
 *       tier door/advance rules still key on boss identity;
 *   §E  weapons — every new config resolves through `getWeaponByType` (no
 *       per-opponent `loadout`), and the family's first-of-type entry is pinned;
 *   §F  the merged block — the new classes reach the CH-3a stage helpers;
 *   §G  each boss palma fires at its own mechanic site and never on a non-boss.
 *
 * Run with: `bun test src/utils/opponentsLadder.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALL_OPPONENTS,
  DOCTORE_TEST_OPPONENT,
  FEATURE_BOUT_OPPONENTS,
  LADDER_OPPONENTS,
  PRIMUS_PALUS_LADDER,
  isLadderBoss,
} from '../data/opponents';
import { ARMATURA_IDS, getArmatura } from '../data/armaturae';
import { PALMAE, PALMAE_BOSS_ONLY, getPalma } from '../data/palmae';
import { getWeaponByType } from '../data/itemsDB';
import {
  EMPTY_MODIFIERS,
  buildOpponentModifiers,
  damageDealtMultiplier,
  damageTakenMultiplier,
  spearmansGroundMult,
  type DamageContext,
  type FighterModifiers,
} from './combatModifiers';
import {
  applyPitBellowerDrain,
  applyPyreBrandHeal,
  pitBellowerStaminaDrain,
  pyreBrandHealAmount,
} from './bossPalmae';
import { resolveDoorDuelTarget, resolveVictoryTier } from './tierAdvancement';
import type { OpponentConfig } from '../types/game';

const HERE = dirname(fileURLToPath(import.meta.url));
const repoPath = (relative: string) => normalize(join(HERE, '..', '..', relative));
const readSource = (relative: string) => readFileSync(repoPath(relative), 'utf8');

const byId = (id: string): OpponentConfig => {
  const found = ALL_OPPONENTS.find((opponent) => opponent.id === id);
  if (!found) throw new Error(`roster has no ${id}`);
  return found;
};

const BOSS_ONLY_IDS = PALMAE_BOSS_ONLY.map((palma) => palma.id);
const PLAYER_POOL_IDS = PALMAE.filter((palma) => palma.bossOnly !== true).map((palma) => palma.id);

/** A neutral damage context; override only what a case is about. */
const ctx = (overrides: Partial<DamageContext> = {}): DamageContext => ({
  isQuick: false,
  distance: 1.0,
  effectiveRange: 2.5,
  attackerHealth: 100,
  attackerHealthMax: 100,
  defenderHealth: 100,
  defenderHealthMax: 100,
  defenderIsBoss: false,
  ...overrides,
});

// ════════════════════════════════════════════════════════════════════════════
// §A — the config shape and the structural sweep
// ════════════════════════════════════════════════════════════════════════════

describe('CH-4 §A — the config shape and the structural sweep', () => {
  test('every ladder opponent still declares the fields the duel constructs from', () => {
    for (const opponent of ALL_OPPONENTS) {
      expect(typeof opponent.id, opponent.id).toBe('string');
      expect(typeof opponent.name, opponent.id).toBe('string');
      expect(typeof opponent.tier, opponent.id).toBe('number');
      expect(typeof opponent.fightIndex, opponent.id).toBe('number');
      expect(typeof opponent.weaponType, opponent.id).toBe('string');
      expect(typeof opponent.personality, opponent.id).toBe('string');
    }
  });

  test('armatura is optional and, when present, is one of the seven classes', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.armatura === undefined) continue;
      expect(ARMATURA_IDS as readonly string[], opponent.id).toContain(opponent.armatura);
      expect(getArmatura(opponent.armatura)?.id, opponent.id).toBe(opponent.armatura);
    }
    // The tutorial keeps its class and earns no palma — absence, not an empty list.
    expect(byId('opp_marcus').armatura).toBe('murmillo');
    expect('palmae' in byId('opp_marcus')).toBe(false);
  });

  test('every palma id an opponent carries is a real PALMAE row', () => {
    for (const opponent of ALL_OPPONENTS) {
      for (const id of opponent.palmae ?? []) {
        expect(PALMAE.map((palma) => palma.id), `${opponent.id}: ${id}`).toContain(id);
      }
      // Three is the cap `buildOpponentModifiers` applies; a config over it would
      // silently lose one, so no config may carry more.
      expect((opponent.palmae ?? []).length, opponent.id).toBeLessThanOrEqual(3);
      expect(new Set(opponent.palmae ?? []).size, opponent.id).toBe((opponent.palmae ?? []).length);
    }
  });

  test('NO non-boss config carries a BossMechanic, a phase-2 weapon or a boss-only palma', () => {
    const offenders: string[] = [];
    for (const opponent of ALL_OPPONENTS) {
      const isBoss = opponent.isBoss === true;
      const bossOnly = (opponent.palmae ?? []).filter((id) => BOSS_ONLY_IDS.includes(id));
      if (isBoss) continue;
      if (opponent.bossMechanic !== undefined) offenders.push(`${opponent.id}: bossMechanic`);
      if (opponent.phase2WeaponType !== undefined) offenders.push(`${opponent.id}: phase2WeaponType`);
      if (bossOnly.length > 0) offenders.push(`${opponent.id}: boss-only palmae ${bossOnly.join(',')}`);
    }
    expect(offenders).toEqual([]);
    // …and the off-ladder Doctore test is held to the same rule.
    expect(DOCTORE_TEST_OPPONENT.isBoss).toBeUndefined();
    expect(DOCTORE_TEST_OPPONENT.bossMechanic).toBeUndefined();
    expect(DOCTORE_TEST_OPPONENT.palmae ?? []).toEqual([]);
  });

  test('every boss-only palma belongs to exactly one boss, and every boss keeps its mechanic', () => {
    const carriers = BOSS_ONLY_IDS.map((id) => ({
      id,
      owners: ALL_OPPONENTS.filter((opponent) => (opponent.palmae ?? []).includes(id)),
    }));
    for (const carrier of carriers) {
      expect(carrier.owners.length, carrier.id).toBe(1);
      expect(carrier.owners[0].isBoss, `${carrier.id} on ${carrier.owners[0].id}`).toBe(true);
    }
    // The four boss mechanic sites survive CH-4 unchanged.
    expect(byId('opp_goliath_boss').bossMechanic).toBe('heavy_telegraph');
    expect(byId('opp_ignis_boss').bossMechanic).toBe('phase_weapon_switch');
    expect(byId('opp_ignis_boss').phase2WeaponType).toBe('mace');
    expect(byId('opp_valeria_boss').bossMechanic).toBe('counter_dodge');
    expect(byId('opp_aurelius_boss').bossMechanic).toBe('rage_mode_colossus');
  });

  test('no non-boss config carries a palma outside the player pool', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.isBoss === true) continue;
      for (const id of opponent.palmae ?? []) {
        expect(PLAYER_POOL_IDS, `${opponent.id}: ${id}`).toContain(id);
        expect(getPalma(id)?.bossOnly, `${opponent.id}: ${id}`).toBeUndefined();
      }
    }
  });

  test('no opponent config declares a handedness — Lefty mode stays the player\'s', () => {
    for (const opponent of ALL_OPPONENTS) {
      const keys = Object.keys(opponent as unknown as Record<string, unknown>);
      expect(keys, opponent.id).not.toContain('isLeftyMode');
      expect(keys, opponent.id).not.toContain('handedness');
    }
    // DuelScene keeps `isLeftyMode` on the player's construction only.
    const source = readSource('src/components/duel/DuelScene.tsx');
    expect(source.split('isLeftyMode: isLeftyMode,').length - 1).toBe(1);
    expect(source).toContain('<GladiatorMesh fighter={player} isLeftyMode={isLeftyMode}');
    expect(source).not.toContain('<GladiatorMesh fighter={opp} isLeftyMode');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — the eight originals, frozen
// ════════════════════════════════════════════════════════════════════════════

/**
 * The eight pre-CH-4 opponents exactly as the branch's base tree had them.
 * `fightIndex` is `null` for the two bosses the Director ruling re-seated; their
 * rungs are asserted in their own test below.
 */
const ORIGINALS = [
  {
    id: 'opp_marcus',
    name: 'Marcus the Rookie',
    tier: 1,
    fightIndex: 1,
    stats: { strength: 8, agility: 8, staminaMax: 80, staminaRegen: 14, defense: 2, healthMax: 90 },
    rewards: { gold: 35, fame: 10, xp: 40 },
  },
  {
    id: 'opp_flaccus',
    name: 'Flaccus the Nimble',
    tier: 1,
    fightIndex: 2,
    stats: { strength: 10, agility: 12, staminaMax: 90, staminaRegen: 18, defense: 3, healthMax: 105 },
    rewards: { gold: 50, fame: 15, xp: 60 },
  },
  {
    id: 'opp_goliath_boss',
    name: 'Goliath the Pit Behemoth',
    tier: 1,
    fightIndex: 3,
    stats: { strength: 16, agility: 7, staminaMax: 120, staminaRegen: 16, defense: 6, healthMax: 170 },
    rewards: { gold: 120, fame: 35, xp: 120 },
  },
  {
    id: 'opp_hoplite',
    name: 'Cassius the Phalanx',
    tier: 2,
    fightIndex: 1,
    stats: { strength: 13, agility: 11, staminaMax: 100, staminaRegen: 18, defense: 7, healthMax: 135 },
    rewards: { gold: 90, fame: 25, xp: 95 },
  },
  {
    id: 'opp_ignis_boss',
    name: 'Ignis the Pyre Champion',
    tier: 2,
    fightIndex: null, // Director ruling: 2 → 4, asserted below
    stats: { strength: 18, agility: 17, staminaMax: 140, staminaRegen: 22, defense: 8, healthMax: 230 },
    rewards: { gold: 220, fame: 70, xp: 220 },
  },
  {
    id: 'opp_centurion_drusus',
    name: 'Centurion Drusus',
    tier: 3,
    fightIndex: 1,
    stats: { strength: 22, agility: 14, staminaMax: 130, staminaRegen: 20, defense: 14, healthMax: 260 },
    rewards: { gold: 260, fame: 90, xp: 260 },
  },
  {
    id: 'opp_valeria_boss',
    name: 'Valéria the Viper Queen',
    tier: 3,
    fightIndex: null, // Director ruling: 2 → 4, asserted below
    stats: { strength: 25, agility: 22, staminaMax: 160, staminaRegen: 26, defense: 12, healthMax: 320 },
    rewards: { gold: 450, fame: 140, xp: 450 },
  },
  {
    id: 'opp_aurelius_boss',
    name: 'Aurelius the Invincible Titan',
    tier: 4,
    fightIndex: 1,
    stats: { strength: 34, agility: 20, staminaMax: 200, staminaRegen: 30, defense: 20, healthMax: 480 },
    rewards: { gold: 1000, fame: 500, xp: 1000 },
  },
];

describe('CH-4 §B — the eight originals are byte-for-byte their pre-CH-4 selves', () => {
  test('all eight ids are still on the roster, once each', () => {
    for (const original of ORIGINALS) {
      const matches = ALL_OPPONENTS.filter((opponent) => opponent.id === original.id);
      expect(matches.length, original.id).toBe(1);
    }
  });

  test('ids, names, tiers, stats and the three rewards are unchanged', () => {
    for (const original of ORIGINALS) {
      const opponent = byId(original.id);
      expect(opponent.name, original.id).toBe(original.name);
      expect(opponent.tier, original.id).toBe(original.tier);
      expect({ ...opponent.stats }, original.id).toEqual(original.stats);
      expect(opponent.rewardGold, original.id).toBe(original.rewards.gold);
      expect(opponent.rewardFame, original.id).toBe(original.rewards.fame);
      expect(opponent.rewardXp, original.id).toBe(original.rewards.xp);
    }
  });

  test('every pre-existing fightIndex is pinned — the six untouched rungs', () => {
    for (const original of ORIGINALS) {
      if (original.fightIndex === null) continue;
      expect(byId(original.id).fightIndex, original.id).toBe(original.fightIndex);
    }
  });

  test('DIRECTOR RULING: Ignis and Valéria move 2 → 4, and those are the only rung changes', () => {
    // The ladder is the design's intent; tier advancement keys on boss IDENTITY
    // (`isBoss` + `defeatedOpponentIds`, verified in §D), so `fightIndex` is
    // ordering/display only. Brutus takes Tier-2 rung 2 and Naija rung 3; Kallias
    // takes Tier-3 rung 2 and the Pale Twins rung 3.
    expect(byId('opp_ignis_boss').tier).toBe(2);
    expect(byId('opp_ignis_boss').fightIndex).toBe(4);
    expect(byId('opp_valeria_boss').tier).toBe(3);
    expect(byId('opp_valeria_boss').fightIndex).toBe(4);
    // Both keep their boss identity, so both still advance their tier.
    expect(byId('opp_ignis_boss').isBoss).toBe(true);
    expect(byId('opp_valeria_boss').isBoss).toBe(true);
    // The ruled change is recorded where a reader of the data will find it.
    const source = readSource('src/data/opponents.ts');
    expect(source).toContain('CH-4 Director ruling');
    expect(source.split('CH-4 Director ruling').length - 1).toBe(2);
  });

  test('the identity assignments leave weapon, personality and difficulty alone', () => {
    const identity = [
      ['opp_marcus', 'sword_shield', 'Aggressive', 'rookie'],
      ['opp_flaccus', 'dual_blades', 'Tricky', 'rookie'],
      ['opp_goliath_boss', 'mace', 'Berserker', 'veteran'],
      ['opp_hoplite', 'spear', 'Defensive', 'veteran'],
      ['opp_ignis_boss', 'dual_blades', 'Tricky', 'champion'],
      ['opp_centurion_drusus', 'sword_shield', 'Defensive', 'champion'],
      ['opp_valeria_boss', 'spear', 'Tricky', 'champion'],
      ['opp_aurelius_boss', 'mace', 'Berserker', 'champion'],
    ] as const;
    for (const [id, weaponType, personality, difficulty] of identity) {
      expect(byId(id).weaponType, id).toBe(weaponType);
      expect(byId(id).personality, id).toBe(personality);
      expect(byId(id).difficulty, id).toBe(difficulty);
    }
  });

  test('the brief\'s identity + palma assignment, boss by boss and fighter by fighter', () => {
    const expected: Record<string, { armatura: string; palmae: string[] }> = {
      opp_marcus: { armatura: 'murmillo', palmae: [] },
      opp_flaccus: { armatura: 'thraex', palmae: ['sand_sprinter'] },
      opp_goliath_boss: { armatura: 'provocator', palmae: ['pit_bellower'] },
      opp_hoplite: { armatura: 'hoplomachus', palmae: ['shieldwall_discipline'] },
      opp_ignis_boss: { armatura: 'dimachaerus', palmae: ['pyre_brand'] },
      opp_centurion_drusus: { armatura: 'murmillo', palmae: ['iron_lungs'] },
      opp_valeria_boss: { armatura: 'retiarius', palmae: ['vipers_patience'] },
      opp_aurelius_boss: { armatura: 'murmillo', palmae: ['colossus_hide'] },
    };
    for (const [id, row] of Object.entries(expected)) {
      expect(byId(id).armatura, id).toBe(row.armatura as OpponentConfig['armatura']);
      expect([...(byId(id).palmae ?? [])], id).toEqual(row.palmae);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — the ladder
// ════════════════════════════════════════════════════════════════════════════

// The LADDER's roster of a tier: D-1 appended five feature bouts, which are
// bosses of a VENUE tier but not rungs of it, so they are listed separately.
const tierRoster = (tier: number) =>
  ALL_OPPONENTS.filter((opponent) => opponent.tier === tier && opponent.featureBout !== true)
    .slice()
    .sort((a, b) => a.fightIndex - b.fightIndex)
    .map((opponent) => opponent.id);

describe('CH-4 §C — the ladder order the design intends', () => {
  test('tiers 2 and 3 now list FOUR fights each, in ladder order', () => {
    expect(tierRoster(2)).toEqual([
      'opp_hoplite',
      'opp_brutus_anvil',
      'opp_naija_fisher',
      'opp_ignis_boss',
    ]);
    expect(tierRoster(3)).toEqual([
      'opp_centurion_drusus',
      'opp_kallias_sparta',
      'opp_pale_twins',
      'opp_valeria_boss',
    ]);
    expect(tierRoster(1)).toEqual(['opp_marcus', 'opp_flaccus', 'opp_goliath_boss']);
    expect(tierRoster(4)).toEqual(['opp_aurelius_boss']);
  });

  test('the four new rivals carry the identity, class and rung the brief assigns', () => {
    const rivals = [
      {
        id: 'opp_brutus_anvil',
        name: 'Brutus "The Anvil"',
        tier: 2,
        fightIndex: 2,
        personality: 'Defensive',
        armatura: 'provocator',
        weaponType: 'sword_shield',
        recommendedLevel: 3,
      },
      {
        id: 'opp_naija_fisher',
        name: 'Naija the Fisher',
        tier: 2,
        fightIndex: 3,
        personality: 'Tricky',
        armatura: 'retiarius',
        weaponType: 'spear',
        recommendedLevel: 4,
      },
      {
        id: 'opp_kallias_sparta',
        name: 'Kallias of Sparta',
        tier: 3,
        fightIndex: 2,
        personality: 'Defensive',
        armatura: 'hoplomachus',
        weaponType: 'spear',
        recommendedLevel: 6,
      },
      {
        id: 'opp_pale_twins',
        name: 'The Pale Twins',
        tier: 3,
        fightIndex: 3,
        personality: 'Berserker',
        armatura: 'dimachaerus',
        weaponType: 'dual_blades',
        recommendedLevel: 7,
      },
    ] as const;
    for (const rival of rivals) {
      const opponent = byId(rival.id);
      expect(opponent.name, rival.id).toBe(rival.name);
      expect(opponent.tier, rival.id).toBe(rival.tier);
      expect(opponent.fightIndex, rival.id).toBe(rival.fightIndex);
      expect(opponent.personality, rival.id).toBe(rival.personality);
      expect(opponent.armatura, rival.id).toBe(rival.armatura as OpponentConfig['armatura']);
      expect(opponent.weaponType, rival.id).toBe(rival.weaponType as OpponentConfig['weaponType']);
      expect(opponent.recommendedLevel, rival.id).toBe(rival.recommendedLevel);
      expect(opponent.isBoss, rival.id).toBeUndefined();
      // A rival is a rung, not a boss: no boss mechanic and no boss-only palma.
      expect(opponent.bossMechanic, rival.id).toBeUndefined();
      expect((opponent.palmae ?? []).filter((id) => BOSS_ONLY_IDS.includes(id)), rival.id).toEqual([]);
    }
    // The duo is presented as ONE config with the dimachaerus model.
    expect(byId('opp_pale_twins').characterModel).toBe('dimachaerus');
    // Tier 2's rivals sit between Cassius and Ignis; tier 3's between Drusus and Valéria.
    // Interpolated between the tier's neighbours: strictly inside for every
    // stat except `defense`, which is a small integer band the neighbours can
    // share (Cassius 7 / Ignis 8), so it is held to the closed band instead.
    const band = ['strength', 'agility', 'staminaMax', 'staminaRegen', 'healthMax'] as const;
    const brutus = byId('opp_brutus_anvil').stats;
    const cassius = byId('opp_hoplite').stats;
    const ignis = byId('opp_ignis_boss').stats;
    for (const key of band) {
      expect(brutus[key], key).toBeGreaterThan(cassius[key]);
      expect(brutus[key], key).toBeLessThan(ignis[key]);
    }
    expect(brutus.defense).toBeGreaterThanOrEqual(Math.min(cassius.defense, ignis.defense));
    expect(brutus.defense).toBeLessThanOrEqual(Math.max(cassius.defense, ignis.defense));
    const kallias = byId('opp_kallias_sparta').stats;
    const drusus = byId('opp_centurion_drusus').stats;
    const valeria = byId('opp_valeria_boss').stats;
    for (const key of band) {
      expect(kallias[key], key).toBeGreaterThan(drusus[key]);
      expect(kallias[key], key).toBeLessThan(valeria[key]);
    }
    expect(kallias.defense).toBeGreaterThanOrEqual(Math.min(drusus.defense, valeria.defense));
    expect(kallias.defense).toBeLessThanOrEqual(Math.max(drusus.defense, valeria.defense));
    const twins = byId('opp_pale_twins').stats;
    for (const key of band) {
      expect(twins[key], key).toBeGreaterThan(kallias[key]);
      expect(twins[key], key).toBeLessThan(valeria[key]);
    }
  });

  test('the LADDER stays tier-then-rung ordered and rungs are unique within a tier', () => {
    // D-1 — the LADDER only: the feature bouts are appended at the end with
    // `fightIndex: 0` ("no rung"), so they are asserted separately below.
    const ranks = LADDER_OPPONENTS.map((opponent) => opponent.tier * 100 + opponent.fightIndex);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    for (const tier of [1, 2, 3, 4]) {
      const rungs = LADDER_OPPONENTS.filter((opponent) => opponent.tier === tier).map(
        (o) => o.fightIndex
      );
      expect(new Set(rungs).size, `tier ${tier}`).toBe(rungs.length);
    }
    // Every feature bout declares NO rung and is no ladder boss.
    expect(FEATURE_BOUT_OPPONENTS).toHaveLength(5);
    for (const bout of FEATURE_BOUT_OPPONENTS) {
      expect(bout.fightIndex).toBe(0);
      expect(isLadderBoss(bout)).toBe(false);
    }
    for (const ladderRow of LADDER_OPPONENTS) expect(ladderRow.featureBout).toBeUndefined();
  });

  test('PRIMUS_PALUS_LADDER is the LADDER, tier then rung', () => {
    // D-1 — the plaque is the ladder's list: the five feature bouts are NOT on it.
    expect(PRIMUS_PALUS_LADDER.length).toBe(LADDER_OPPONENTS.length);
    expect(PRIMUS_PALUS_LADDER.map((opponent) => opponent.id)).toEqual(
      [...LADDER_OPPONENTS]
        .sort((a, b) => a.tier - b.tier || a.fightIndex - b.fightIndex)
        .map((opponent) => opponent.id),
    );
    // The Doctore's Test stays OFF the ladder.
    expect(PRIMUS_PALUS_LADDER.map((o) => o.id)).not.toContain('opp_doctore_sextus');
  });

  test('the roster grew by the four rivals and D-1 five feature bouts — nothing was removed', () => {
    // 12 ladder rows (the CH-4 roster) + D-1's five feature bouts, appended.
    expect(ALL_OPPONENTS.length).toBe(17);
    expect(LADDER_OPPONENTS.length).toBe(12);
    const ids = ALL_OPPONENTS.map((opponent) => opponent.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rival of ['opp_brutus_anvil', 'opp_naija_fisher', 'opp_kallias_sparta', 'opp_pale_twins']) {
      expect(ids).toContain(rival);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — old saves keep their progress
// ════════════════════════════════════════════════════════════════════════════

describe('CH-4 §D — an old save reads the same progress', () => {
  test('every pre-existing defeated id still names the same opponent', () => {
    const legacy = [
      'opp_marcus',
      'opp_flaccus',
      'opp_goliath_boss',
      'opp_hoplite',
      'opp_ignis_boss',
      'opp_centurion_drusus',
      'opp_valeria_boss',
      'opp_aurelius_boss',
    ];
    for (const id of legacy) {
      const opponent = byId(id);
      expect(opponent.id, id).toBe(id);
      expect(typeof opponent.name, id).toBe('string');
      expect(opponent.tier, id).toBeGreaterThanOrEqual(1);
    }
  });

  test('tier advancement keys on boss identity, so the rung move changes nothing', () => {
    // A tier-2 save that has beaten the tier's earlier rungs still advances only
    // on Ignis's FIRST defeat — `fightIndex` is never read.
    const beforeIgnis = ['opp_marcus', 'opp_flaccus', 'opp_goliath_boss', 'opp_hoplite', 'opp_brutus_anvil', 'opp_naija_fisher'];
    const first = resolveVictoryTier({
      currentTier: 2,
      opponent: byId('opp_ignis_boss'),
      defeatedOpponentIds: beforeIgnis,
    });
    expect(first).toEqual({ currentTier: 3, firstDefeat: true, advanced: true });
    const rematch = resolveVictoryTier({
      currentTier: 3,
      opponent: byId('opp_ignis_boss'),
      defeatedOpponentIds: [...beforeIgnis, 'opp_ignis_boss'],
    });
    expect(rematch).toEqual({ currentTier: 3, firstDefeat: false, advanced: false });
    // A non-boss rival never advances a tier, however high its rung.
    const rival = resolveVictoryTier({
      currentTier: 2,
      opponent: byId('opp_pale_twins'),
      defeatedOpponentIds: ['opp_marcus'],
    });
    expect(rival).toEqual({ currentTier: 2, firstDefeat: false, advanced: false });
    // …and the tier-3 boss still advances to the final tier.
    expect(
      resolveVictoryTier({ currentTier: 3, opponent: byId('opp_valeria_boss'), defeatedOpponentIds: [] }),
    ).toEqual({ currentTier: 4, firstDefeat: true, advanced: true });
  });

  test('the city door still offers the tier\'s undefeated boss', () => {
    expect(resolveDoorDuelTarget(2, [])?.opponent.id).toBe('opp_ignis_boss');
    expect(resolveDoorDuelTarget(3, [])?.opponent.id).toBe('opp_valeria_boss');
    expect(resolveDoorDuelTarget(2, ['opp_ignis_boss'])).toMatchObject({
      opponent: { id: 'opp_ignis_boss' },
      rematch: true,
    });
    // The new rungs are not bosses, so they can never be a door's ticket.
    expect(resolveDoorDuelTarget(2, [])?.opponent.isBoss).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — weapons resolve through the registry
// ════════════════════════════════════════════════════════════════════════════

describe('CH-4 §E — the new configs resolve their weapon through getWeaponByType', () => {
  test('no new rival ships a per-opponent loadout, so weaponType is the one path', () => {
    for (const id of ['opp_brutus_anvil', 'opp_naija_fisher', 'opp_kallias_sparta', 'opp_pale_twins']) {
      expect(byId(id).loadout, id).toBeUndefined();
    }
  });

  test('each resolves to the registry\'s first weapon of its family', () => {
    // The D1 fix's resolution: `getWeaponByType(weaponType)`. The spear family's
    // first entry is the Dory (`hoplite_spear`) — the retiarius trident is the
    // player's class-kit weapon (CH-1), not the first-of-type entry; see the
    // CH-4 report's finding.
    expect(getWeaponByType(byId('opp_brutus_anvil').weaponType).type).toBe('sword_shield');
    expect(getWeaponByType(byId('opp_naija_fisher').weaponType).id).toBe('hoplite_spear');
    expect(getWeaponByType(byId('opp_naija_fisher').weaponType).type).toBe('spear');
    expect(getWeaponByType(byId('opp_kallias_sparta').weaponType).id).toBe('hoplite_spear');
    expect(getWeaponByType(byId('opp_pale_twins').weaponType).id).toBe('dual_sicae_daggers');
    expect(getWeaponByType(byId('opp_pale_twins').weaponType).type).toBe('dual_blades');
  });

  test('the resolved weapons are real weapons with a reach the duel can use', () => {
    for (const id of ['opp_brutus_anvil', 'opp_naija_fisher', 'opp_kallias_sparta', 'opp_pale_twins']) {
      const weapon = getWeaponByType(byId(id).weaponType);
      expect(weapon.damageLight, id).toBeGreaterThan(0);
      expect(weapon.damageHeavy, id).toBeGreaterThan(0);
      expect(weapon.range, id).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — the merged block: the new classes reach the CH-3a stage helpers
// ════════════════════════════════════════════════════════════════════════════

describe('CH-4 §F — armatura and palmae reach the merged block', () => {
  test('an opponent with neither field resolves to the identity block', () => {
    const bare = buildOpponentModifiers({ id: 'bare', name: 'Bare' } as unknown as OpponentConfig);
    expect(bare.block).toEqual({});
    expect(bare.palmae).toEqual([]);
    expect(bare.armaturaId).toBeUndefined();
    expect(bare).toEqual(expect.objectContaining({ doctrina: {} }));
    expect(EMPTY_MODIFIERS.block).toEqual({});
  });

  test('every roster config resolves its class and its palmae', () => {
    for (const opponent of ALL_OPPONENTS) {
      const mods = buildOpponentModifiers(opponent);
      expect(mods.armaturaId, opponent.id).toBe(opponent.armatura);
      expect(mods.palmae.map((palma) => palma.id), opponent.id).toEqual(opponent.palmae ?? []);
      // An unknown id is dropped rather than crashing the duel.
      const poisoned = buildOpponentModifiers({
        ...opponent,
        palmae: ['not_a_palma', ...(opponent.palmae ?? [])],
      } as OpponentConfig);
      expect(poisoned.palmae.map((palma) => palma.id), opponent.id).toEqual(opponent.palmae ?? []);
    }
  });

  test('Brutus carries Mirror Drill through the provocator doctrina', () => {
    const brutus = buildOpponentModifiers(byId('opp_brutus_anvil'));
    expect(brutus.armaturaId).toBe('provocator');
    expect(brutus.doctrina.damageTakenMult).toBeCloseTo(0.92, 10);
    // First hit of a type is full, every later hit of that type is 8 % softer.
    expect(damageTakenMultiplier(brutus, ctx({ isQuick: true }))).toBe(1);
    expect(damageTakenMultiplier(brutus, ctx({ isQuick: true, defenderTypesHit: { light: true } }))).toBeCloseTo(0.92, 10);
  });

  test('Kallias carries Spearman\'s Ground through the hoplomachus doctrina', () => {
    const kallias = buildOpponentModifiers(byId('opp_kallias_sparta'));
    expect(kallias.armaturaId).toBe('hoplomachus');
    expect(damageDealtMultiplier(kallias, ctx({ distance: 2.5, effectiveRange: 2.5 }))).toBeCloseTo(1.15, 10);
    // Inside half reach (ratio < 0.5) is the −10 % band; exactly 0.5 is neutral.
    expect(spearmansGroundMult(1.2, 2.5)).toBeCloseTo(0.9, 10);
    expect(damageDealtMultiplier(kallias, ctx({ distance: 1.2, effectiveRange: 2.5 }))).toBeCloseTo(0.9, 10);
    expect(damageDealtMultiplier(kallias, ctx({ distance: 1.25, effectiveRange: 2.5 }))).toBe(1);
  });

  test('Naija is a retiarius and the Pale Twins a dimachaerus', () => {
    expect(buildOpponentModifiers(byId('opp_naija_fisher')).armaturaId).toBe('retiarius');
    expect(buildOpponentModifiers(byId('opp_pale_twins')).armaturaId).toBe('dimachaerus');
    // Flaccus keeps his dual blades and gains the thraex's block penetration.
    const flaccus = buildOpponentModifiers(byId('opp_flaccus'));
    expect(byId('opp_flaccus').weaponType).toBe('dual_blades');
    expect(flaccus.armaturaId).toBe('thraex');
  });

  test('the palmae land in the merged block the duel reads', () => {
    // Shieldwall Discipline's +6 % block reduction on Cassius.
    expect(buildOpponentModifiers(byId('opp_hoplite')).block.blockReductionAdd).toBeCloseTo(0.06, 10);
    // Iron Lungs' stat-stage adds on Drusus.
    const drusus = buildOpponentModifiers(byId('opp_centurion_drusus')).block;
    expect(drusus.staminaMaxAdd).toBe(12);
    expect(drusus.staminaRegenAdd).toBe(2);
    // Sand Sprinter's effective-agility add on Flaccus.
    expect(buildOpponentModifiers(byId('opp_flaccus')).block.hitAgiAdd).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — each boss palma fires at its own mechanic site
// ════════════════════════════════════════════════════════════════════════════

const bossMods = (id: string): FighterModifiers => buildOpponentModifiers(byId(id));

describe('CH-4 §G — the boss palmae, at their sites', () => {
  test('Pit Bellower drains 8 stamina on the telegraph turn, floored at 0', () => {
    const goliath = bossMods('opp_goliath_boss');
    expect(pitBellowerStaminaDrain(goliath)).toBe(8);
    expect(applyPitBellowerDrain(30, pitBellowerStaminaDrain(goliath))).toBe(22);
    // The floor: a nearly spent player never goes negative.
    expect(applyPitBellowerDrain(3, 8)).toBe(0);
    expect(applyPitBellowerDrain(0, 8)).toBe(0);
    expect(applyPitBellowerDrain(-5, 8)).toBe(0);
    // Nothing without the palma.
    expect(pitBellowerStaminaDrain(EMPTY_MODIFIERS)).toBe(0);
    expect(pitBellowerStaminaDrain(bossMods('opp_marcus'))).toBe(0);
  });

  test('Pyre Brand heals 10 % of maximum health, once, at the phase switch', () => {
    const ignis = bossMods('opp_ignis_boss');
    const maxHealth = byId('opp_ignis_boss').stats.healthMax;
    expect(pyreBrandHealAmount(ignis, maxHealth)).toBe(23);
    expect(pyreBrandHealAmount(ignis, maxHealth)).toBe(Math.round(maxHealth * 0.1));
    // Applied at the threshold, and never above the maximum.
    expect(applyPyreBrandHeal(115, maxHealth, 23)).toBe(138);
    expect(applyPyreBrandHeal(225, maxHealth, 23)).toBe(maxHealth);
    // "Once per fight" is the phase switch's own ref: it is set BEFORE the amount
    // is applied and the effect returns early while it is set, so a second pass
    // cannot reach the heal at all.
    const source = readSource('src/components/duel/DuelScene.tsx');
    const effect = source.slice(
      source.indexOf('Boss phase-2 weapon switch'),
      source.indexOf('Aurelius rage_mode_colossus'),
    );
    const guard = effect.indexOf('phaseSwitchedRef.current || isMatchOver.current) return');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(effect.indexOf('phaseSwitchedRef.current = true'));
    expect(effect.indexOf('phaseSwitchedRef.current = true')).toBeLessThan(
      effect.indexOf('pyreBrandHealAmount('),
    );
    // No Pyre Brand, no heal.
    expect(pyreBrandHealAmount(EMPTY_MODIFIERS, maxHealth)).toBe(0);
    expect(pyreBrandHealAmount(bossMods('opp_marcus'), 90)).toBe(0);
  });

  test("Viper's Patience adds 20 % to the counterattack and to nothing else", () => {
    const valeria = bossMods('opp_valeria_boss');
    expect(damageDealtMultiplier(valeria, ctx({ isQuick: true, isCounterAttack: true }))).toBeCloseTo(1.2, 10);
    // Her ordinary strikes are unchanged.
    expect(damageDealtMultiplier(valeria, ctx({ isQuick: true }))).toBe(1);
    expect(damageDealtMultiplier(valeria, ctx({ isQuick: false }))).toBe(1);
    expect(damageDealtMultiplier(valeria, ctx({ isQuick: false, isCounterAttack: true }))).toBeCloseTo(1.2, 10);
    // A non-boss cannot carry it at all.
    expect(damageDealtMultiplier(bossMods('opp_marcus'), ctx({ isCounterAttack: true }))).toBe(1);
  });

  test('Colossus Hide takes 8 % less from quick attacks only', () => {
    const aurelius = bossMods('opp_aurelius_boss');
    expect(damageTakenMultiplier(aurelius, ctx({ isQuick: true }))).toBeCloseTo(0.92, 10);
    expect(damageTakenMultiplier(aurelius, ctx({ isQuick: false }))).toBe(1);
    expect(damageTakenMultiplier(bossMods('opp_marcus'), ctx({ isQuick: true }))).toBe(1);
  });

  test('no boss palma fires for a non-boss, across the whole roster', () => {
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.isBoss === true) continue;
      const mods = buildOpponentModifiers(opponent);
      expect(pitBellowerStaminaDrain(mods), opponent.id).toBe(0);
      expect(pyreBrandHealAmount(mods, opponent.stats.healthMax), opponent.id).toBe(0);
      // Viper's Patience is the ONLY thing the counter flag moves, so a
      // non-boss's multiplier is identical with it on and off (a class doctrina
      // such as Spearman's Ground may still apply to both).
      expect(
        damageDealtMultiplier(mods, ctx({ isCounterAttack: true })),
        opponent.id,
      ).toBe(damageDealtMultiplier(mods, ctx()));
      const hide = damageTakenMultiplier(mods, ctx({ isQuick: true }));
      // Only a class doctrina may move this for a non-boss (provocator: a later
      // hit of a type); the plain first hit stays at 1.
      expect(hide, opponent.id).toBe(1);
    }
  });

  test('DuelScene calls each helper at its own site, and the shipped mechanics still run', () => {
    const source = readSource('src/components/duel/DuelScene.tsx');
    // Pit Bellower inside the telegraph branch.
    const telegraph = source.slice(source.indexOf("else if (actionType === 'telegraph')"), source.indexOf('cast_net', source.indexOf("else if (actionType === 'telegraph')")));
    expect(telegraph).toContain('pitBellowerStaminaDrain(attackerMods)');
    expect(telegraph).toContain('applyPitBellowerDrain(');
    // The telegraph itself is unchanged: pending heavy, the announcement, the 30 % gate.
    expect(telegraph).toContain('pendingHeavyAttackRef.current = true');
    expect(telegraph).toContain('HEAVY ATTACK INCOMING');
    expect(source).toContain('Math.random() < 0.30');
    // Pyre Brand inside the phase-2 effect.
    const phase = source.slice(source.indexOf('Boss phase-2 weapon switch'), source.indexOf('Aurelius rage_mode_colossus'));
    expect(phase).toContain('pyreBrandHealAmount(opponentMods');
    expect(phase).toContain('applyPyreBrandHeal(');
    expect(phase).toContain('opp.stats.healthMax * 0.5');
    // Viper's Patience: the counter resolution is marked, and the flag is read in
    // the damage context the stage helpers take.
    expect(source).toContain('counterStrikeRef.current = true');
    expect(source).toContain('const isCounterAttack = !isActorPlayer && counterStrikeRef.current;');
    expect(source).toContain('isCounterAttack,');
    // The counter branch still resolves through the standard quick-attack pipeline.
    expect(source).toContain("executeCombatTurn('opponent', 'quick_attack')");
  });
});
