/**
 * ===========================================================================
 * CH-5 — THE PALMAE'S WRITERS: slot math, earn checks, equip, Doctore sales
 * ===========================================================================
 * Every expectation here is computed with the SHIPPED functions — the slot
 * ladder, the earn checks, the two equip transactions, the Doctore's purchase,
 * `deriveRank` and CH-3a's own merged block — so a change to a threshold, a
 * price or a formula moves the assertions with it.
 *
 *   §A  the slot ladder by `currentTier`, the ceiling and the opening tier
 *   §B  earn idempotence, and a full sweep of every deed source
 *   §C  each deed's threshold boundary (fights, hype, and every rank gate)
 *   §D  equip validation (locked, boss-only, the tier cap, unequip, junk saves)
 *   §E  the Doctore's sale (unlock ≠ equip, exact deduction, both refusals)
 *   §F  the acceptance flow: Goliath falls → Executioner → slot 1 → live effect
 *   §G  the wiring, read out of the shipped sources
 *
 * Run with: bun test src/utils/palmaeState.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { PALMAE_PLAYER_POOL, getPalma } from '../data/palmae';
import { createNewProfile } from '../services/storage';
import { MAX_EQUIPPED_PALMAE, mergeModifiers, resolvePalmae } from './traitModifiers';
import { buildPlayerModifiers, damageDealtMultiplier, type DamageContext } from './combatModifiers';
import { deriveRank, rankAtLeast } from './rank';
import { resolveVictoryTier } from './tierAdvancement';
import {
  DOCTORE_PALMAE,
  EARNED_PALMAE,
  FIRST_PALM_HYPE,
  PALMA_SLOT_CEILING,
  PHOENIX_NERVES_HYPE,
  SAND_SPRINTER_FIGHTS_WON,
  applyPalmaEarns,
  equipPalma,
  evaluatePalmaEarns,
  palmaDeedIds,
  palmaPrice,
  palmaSlotsForTier,
  purchaseDoctorePalma,
  slotOpeningTier,
  unequipPalma,
  type PalmaDeedRecord,
} from './palmaeState';

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** A real profile (the shipped factory), optionally carrying a palmae record. */
const profile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Trial'),
  ...overrides,
});

const withPalmae = (
  unlocked: string[],
  equipped: string[] = [],
  overrides: Partial<PlayerProfile> = {},
): PlayerProfile => profile({ ...overrides, palmae: { unlocked, equipped } });

/** The ids a record's deeds grant. */
const earnedIds = (record: PalmaDeedRecord): string[] =>
  evaluatePalmaEarns(record).map((palma) => palma.id);

/** A neutral damage context; override only what a case is about. */
const ctx = (overrides: Partial<DamageContext> = {}): DamageContext => ({
  isQuick: false,
  distance: 1,
  effectiveRange: 2.5,
  attackerHealth: 100,
  attackerHealthMax: 100,
  defenderHealth: 100,
  defenderHealthMax: 100,
  defenderIsBoss: false,
  ...overrides,
});

const bossId = (palmaSourceDetail: string): string => {
  const opponent = ALL_OPPONENTS.find((row) => row.isBoss && row.name.split(' ')[0] === palmaSourceDetail);
  if (!opponent) throw new Error(`no boss named ${palmaSourceDetail}`);
  return opponent.id;
};

// ── §A the slot ladder ────────────────────────────────────────────────────
describe('CH-5 §A — the slot ladder', () => {
  test('tiers 1–4 give 0 / 1 / 2 / 3 slots, exactly as the Director ruled', () => {
    expect(palmaSlotsForTier(1)).toBe(0);
    expect(palmaSlotsForTier(2)).toBe(1);
    expect(palmaSlotsForTier(3)).toBe(2);
    expect(palmaSlotsForTier(4)).toBe(3);
  });

  test('the ceiling is 3 at every tier above it, and CH-1 owns that number', () => {
    for (const tier of [5, 6, 9, 99, 1000]) {
      expect(palmaSlotsForTier(tier)).toBe(3);
    }
    expect(PALMA_SLOT_CEILING).toBe(MAX_EQUIPPED_PALMAE);
    expect(PALMA_SLOT_CEILING).toBe(3);
  });

  test('a missing, malformed or sub-1 tier wears none rather than a negative count', () => {
    for (const tier of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, -4, 0, '3', {}, []]) {
      expect(palmaSlotsForTier(tier)).toBe(0);
    }
  });

  test('a fractional tier reads as its whole part', () => {
    expect(palmaSlotsForTier(2.9)).toBe(1);
    expect(palmaSlotsForTier(3.5)).toBe(2);
    expect(palmaSlotsForTier(1.99)).toBe(0);
  });

  test('a locked slot names the tier that opens it: slot 1 → Tier 2, slot 3 → Tier 4', () => {
    expect(slotOpeningTier(0)).toBe(2);
    expect(slotOpeningTier(1)).toBe(3);
    expect(slotOpeningTier(2)).toBe(4);
    expect(slotOpeningTier(3)).toBeNull();
    expect(slotOpeningTier(-1)).toBeNull();
    expect(slotOpeningTier(1.5)).toBeNull();
    // Every slot the ladder can open is opened by exactly one of tiers 2–4.
    const opened = [0, 1, 2].map((index) => slotOpeningTier(index));
    expect(opened).toEqual([2, 3, 4]);
  });
});

// ── §B earn idempotence and the full sweep ────────────────────────────────
describe('CH-5 §B — the earn checks are idempotent', () => {
  const afterGoliath = () =>
    profile({
      currentTier: 2,
      defeatedOpponentIds: [bossId('Goliath')],
      fightsWon: 1,
    });

  test('winning the same fight twice unlocks Executioner once', () => {
    const first = applyPalmaEarns(afterGoliath());
    expect(first.earned.map((palma) => palma.id)).toEqual(['executioner']);
    expect(first.profile.palmae?.unlocked).toEqual(['executioner']);

    const second = applyPalmaEarns(first.profile);
    expect(second.earned).toEqual([]);
    // A second pass is the identity: the caller's own object, no new record.
    expect(second.profile).toBe(first.profile);
    expect(second.profile.palmae?.unlocked).toEqual(['executioner']);
  });

  test('a full sweep of every deed source fires exactly the ten earned palms', () => {
    const record: PalmaDeedRecord = {
      fame: 1500,
      currentTier: 4,
      bossKills: 1,
      defeatedOpponentIds: [
        bossId('Goliath'),
        bossId('Ignis'),
        bossId('Valéria'),
        bossId('Aurelius'),
      ],
      fightsWon: SAND_SPRINTER_FIGHTS_WON,
      peakCrowdHypeOverall: PHOENIX_NERVES_HYPE,
    };

    const earned = earnedIds(record);
    expect(earned).toEqual(EARNED_PALMAE.map((palma) => palma.id));
    expect(earned).toHaveLength(10);

    // Every earned row is a player-pool row; no boss-only row and no sold row.
    for (const id of earned) {
      const row = getPalma(id)!;
      expect(PALMAE_PLAYER_POOL.some((palma) => palma.id === id)).toBe(true);
      expect(row.bossOnly).toBeUndefined();
      expect(row.source).not.toBe('doctore-training');
    }
    // The Doctore's two are bought, never earned.
    for (const sold of DOCTORE_PALMAE) {
      expect(earned).not.toContain(sold.id);
    }
  });

  test('the sweep is complete: 12 pool rows = 10 earned + 2 sold', () => {
    expect(EARNED_PALMAE).toHaveLength(10);
    expect(DOCTORE_PALMAE).toHaveLength(2);
    expect(EARNED_PALMAE.length + DOCTORE_PALMAE.length).toBe(PALMAE_PLAYER_POOL.length);
    expect(PALMAE_PLAYER_POOL).toHaveLength(12);
  });

  test('a record already owning the palms earns nothing, however it is replayed', () => {
    const all = EARNED_PALMAE.map((palma) => palma.id);
    const owning = withPalmae(all, [], {
      fame: 1500,
      currentTier: 4,
      bossKills: 1,
      defeatedOpponentIds: ALL_OPPONENTS.filter((row) => row.isBoss).map((row) => row.id),
      fightsWon: SAND_SPRINTER_FIGHTS_WON,
      peakCrowdHypeOverall: PHOENIX_NERVES_HYPE,
    });
    expect(earnedIds(owning)).toEqual([]);
    expect(applyPalmaEarns(owning).profile).toBe(owning);
  });

  test('a fresh save earns nothing at all', () => {
    expect(earnedIds(createNewProfile('Fresh'))).toEqual([]);
    expect(palmaDeedIds(createNewProfile('Fresh'))).toEqual([]);
  });
});

// ── §C every deed's threshold boundary ───────────────────────────────────
describe('CH-5 §C — deed thresholds', () => {
  test('Sand Sprinter: 9 victories is not ten', () => {
    expect(earnedIds({ fightsWon: SAND_SPRINTER_FIGHTS_WON - 1 })).not.toContain('sand_sprinter');
    expect(earnedIds({ fightsWon: SAND_SPRINTER_FIGHTS_WON })).toContain('sand_sprinter');
    expect(earnedIds({ fightsWon: SAND_SPRINTER_FIGHTS_WON + 1 })).toContain('sand_sprinter');
  });

  test('First Palm of the Crowd: peak hype 49 vs 50', () => {
    expect(earnedIds({ peakCrowdHypeOverall: FIRST_PALM_HYPE - 1 })).not.toContain(
      'first_palm_of_the_crowd',
    );
    expect(earnedIds({ peakCrowdHypeOverall: FIRST_PALM_HYPE })).toContain('first_palm_of_the_crowd');
  });

  test('Phoenix Nerves: peak hype 84 vs 85, and 50 does not reach it', () => {
    expect(earnedIds({ peakCrowdHypeOverall: PHOENIX_NERVES_HYPE - 1 })).not.toContain('phoenix_nerves');
    expect(earnedIds({ peakCrowdHypeOverall: PHOENIX_NERVES_HYPE })).toContain('phoenix_nerves');
    expect(earnedIds({ peakCrowdHypeOverall: FIRST_PALM_HYPE })).not.toContain('phoenix_nerves');
  });

  test('Blood Price: Veteran needs BOTH fame 150 and the tier-2 circuit', () => {
    expect(earnedIds({ fame: 149, currentTier: 2 })).not.toContain('blood_price');
    expect(earnedIds({ fame: 150, currentTier: 1 })).not.toContain('blood_price');
    expect(earnedIds({ fame: 150, currentTier: 2 })).toContain('blood_price');
    expect(deriveRank({ fame: 150, currentTier: 2 })).toBe('Veteran');
    expect(deriveRank({ fame: 149, currentTier: 2 })).toBe('Rookie');
  });

  test('Heavy Hand: Champion needs BOTH fame 600 and tier 3', () => {
    expect(earnedIds({ fame: 599, currentTier: 3 })).not.toContain('heavy_hand');
    expect(earnedIds({ fame: 600, currentTier: 2 })).not.toContain('heavy_hand');
    expect(earnedIds({ fame: 600, currentTier: 3 })).toContain('heavy_hand');
    expect(deriveRank({ fame: 600, currentTier: 3 })).toBe('Champion');
  });

  test('Golden Laurel: Legend needs fame 1500, tier 4 AND a boss felled', () => {
    expect(earnedIds({ fame: 1500, currentTier: 4, bossKills: 0 })).not.toContain('golden_laurel');
    expect(earnedIds({ fame: 1500, currentTier: 3, bossKills: 1 })).not.toContain('golden_laurel');
    expect(earnedIds({ fame: 1499, currentTier: 4, bossKills: 1 })).not.toContain('golden_laurel');
    expect(earnedIds({ fame: 1500, currentTier: 4, bossKills: 1 })).toContain('golden_laurel');
    expect(deriveRank({ fame: 1500, currentTier: 4, bossKills: 1 })).toBe('Legend');
  });

  test('Shieldwall Discipline: Tier 2 cleared — i.e. currentTier 3, or Ignis felled', () => {
    expect(earnedIds({ currentTier: 2 })).not.toContain('shieldwall_discipline');
    expect(earnedIds({ currentTier: 3 })).toContain('shieldwall_discipline');
    expect(earnedIds({ currentTier: 2, defeatedOpponentIds: [bossId('Ignis')] })).toContain(
      'shieldwall_discipline',
    );
  });

  test('the three boss drops follow the opponent ids the data names', () => {
    const drops: [string, string][] = [
      ['executioner', bossId('Goliath')],
      ['colossus_bane', bossId('Ignis')],
      ['untouchable', bossId('Valéria')],
    ];
    for (const [palmaId, opponentId] of drops) {
      expect(earnedIds({ defeatedOpponentIds: [opponentId] })).toContain(palmaId);
      expect(earnedIds({ defeatedOpponentIds: [] })).not.toContain(palmaId);
    }
    // A non-boss id never drops a palm.
    expect(earnedIds({ defeatedOpponentIds: ['opp_marcus'] })).toEqual([]);
  });

  test('the stored rank field is never read — only deriveRank', () => {
    const stored = withPalmae([], [], { rank: 'Legend', fame: 0, currentTier: 1, fightsWon: 0 });
    expect(deriveRank(stored)).toBe('Rookie');
    const earned = earnedIds(stored);
    expect(earned).not.toContain('golden_laurel');
    expect(earned).not.toContain('heavy_hand');
    expect(earned).not.toContain('blood_price');
    // And rankAtLeast agrees with deriveRank at every boundary.
    for (const rank of ['Rookie', 'Veteran', 'Champion', 'Legend'] as const) {
      expect(rankAtLeast(deriveRank(stored), rank)).toBe(rank === 'Rookie');
    }
  });
});

// ── §D equip validation ──────────────────────────────────────────────────
describe('CH-5 §D — equip and unequip validation', () => {
  test('cannot equip a palm that is not unlocked', () => {
    const result = equipPalma(withPalmae([], [], { currentTier: 4 }), 'iron_lungs');
    expect(result).toEqual({ ok: false, reason: 'locked' });
    expect('profile' in result).toBe(false);
  });

  test('cannot equip a boss-only palm — an explicit assertion', () => {
    const bossOnly = withPalmae(['colossus_hide'], [], { currentTier: 4 });
    expect(getPalma('colossus_hide')?.bossOnly).toBe(true);
    const result = equipPalma(bossOnly, 'colossus_hide');
    expect(result).toEqual({ ok: false, reason: 'boss-only' });
    expect('profile' in result).toBe(false);
  });

  test('cannot exceed the tier slot cap, and unequipping frees the slot', () => {
    const tierTwo = withPalmae(['iron_lungs', 'second_wind'], [], { currentTier: 2 });
    const first = equipPalma(tierTwo, 'iron_lungs');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.profile.palmae?.equipped).toEqual(['iron_lungs']);

    // The second palm has nowhere to go at Tier 2.
    expect(equipPalma(first.profile, 'second_wind')).toEqual({ ok: false, reason: 'no-slot' });

    const off = unequipPalma(first.profile, 'iron_lungs');
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    expect(off.profile.palmae?.equipped).toEqual([]);

    // The freed slot takes the other palm straight away.
    const second = equipPalma(off.profile, 'second_wind');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.profile.palmae?.equipped).toEqual(['second_wind']);
  });

  test('Tier 1 wears none, however many palms are owned', () => {
    const tierOne = withPalmae(['iron_lungs'], [], { currentTier: 1 });
    expect(equipPalma(tierOne, 'iron_lungs')).toEqual({ ok: false, reason: 'no-slot' });
  });

  test('Tier 3 wears two and refuses a third; Tier 4 wears all three', () => {
    const owned = ['iron_lungs', 'second_wind', 'sand_sprinter'];
    let three = withPalmae(owned, [], { currentTier: 3 });
    for (const id of owned.slice(0, 2)) {
      const step = equipPalma(three, id);
      expect(step.ok).toBe(true);
      if (!step.ok) return;
      three = step.profile;
    }
    expect(three.palmae?.equipped).toHaveLength(2);
    expect(equipPalma(three, owned[2])).toEqual({ ok: false, reason: 'no-slot' });

    const tierFour = equipPalma(withPalmae(owned, owned.slice(0, 2), { currentTier: 4 }), owned[2]);
    expect(tierFour.ok).toBe(true);
    if (!tierFour.ok) return;
    expect(tierFour.profile.palmae?.equipped).toHaveLength(3);
  });

  test('refuses unknown ids, a missing profile, and a palm already worn', () => {
    expect(equipPalma(withPalmae([], [], { currentTier: 4 }), 'no_such_palm')).toEqual({
      ok: false,
      reason: 'unknown-palma',
    });
    expect(equipPalma(null, 'iron_lungs')).toEqual({ ok: false, reason: 'no-profile' });
    expect(equipPalma(withPalmae([], [], { currentTier: 4 }), 42)).toEqual({
      ok: false,
      reason: 'unknown-palma',
    });
    const worn = withPalmae(['iron_lungs'], ['iron_lungs'], { currentTier: 2 });
    expect(equipPalma(worn, 'iron_lungs')).toEqual({ ok: false, reason: 'already-equipped' });
    expect(unequipPalma(worn, 'second_wind')).toEqual({ ok: false, reason: 'not-equipped' });
  });

  test('a hand-edited save is cleaned by resolvePalmae before anything is written', () => {
    const junk = withPalmae(['iron_lungs', 'not_a_palm', 'colossus_hide'], ['not_a_palm'], {
      currentTier: 2,
    });
    expect(resolvePalmae(junk)).toEqual({ unlocked: ['iron_lungs'], equipped: [] });

    const result = equipPalma(junk, 'iron_lungs');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.palmae).toEqual({ unlocked: ['iron_lungs'], equipped: ['iron_lungs'] });
  });

  test('both transactions are pure — the input profile is never mutated', () => {
    const input = withPalmae(['iron_lungs', 'second_wind'], ['iron_lungs'], { currentTier: 3 });
    const frozen = Object.freeze({
      ...input,
      palmae: Object.freeze({ unlocked: [...input.palmae!.unlocked!], equipped: [...input.palmae!.equipped!] }),
    }) as PlayerProfile;
    const before = JSON.stringify(input);

    expect(unequipPalma(frozen, 'iron_lungs').ok).toBe(true);
    expect(equipPalma(frozen, 'second_wind').ok).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });
});

// ── §E the Doctore's sale ────────────────────────────────────────────────
describe('CH-5 §E — the Doctore sells two palms', () => {
  test('the prices come from the palmae data, and its own text agrees', () => {
    expect(DOCTORE_PALMAE.map((palma) => palma.id)).toEqual(['iron_lungs', 'second_wind']);
    expect(palmaPrice(getPalma('iron_lungs'))).toBe(250);
    expect(palmaPrice(getPalma('second_wind'))).toBe(300);
    for (const palma of DOCTORE_PALMAE) {
      const price = palmaPrice(palma);
      expect(price).not.toBeNull();
      expect(palma.sourceDetail).toContain(String(price));
    }
    // Every other row is not for sale at all.
    for (const palma of EARNED_PALMAE) {
      expect(palmaPrice(palma)).toBeNull();
    }
  });

  test('a purchase unlocks and does NOT equip, deducting exactly the price', () => {
    const buyer = profile({ gold: 300 });
    const result = purchaseDoctorePalma(buyer, 'iron_lungs');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(50);
    expect(result.profile.palmae).toEqual({ unlocked: ['iron_lungs'], equipped: [] });
    expect(buyer.gold).toBe(300);
  });

  test('exactly enough gold pays to zero and never goes negative', () => {
    const exact = purchaseDoctorePalma(profile({ gold: 250 }), 'iron_lungs');
    expect(exact.ok).toBe(true);
    if (!exact.ok) return;
    expect(exact.profile.gold).toBe(0);

    const next = purchaseDoctorePalma(exact.profile, 'second_wind');
    expect(next).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect('profile' in next).toBe(false);
  });

  test('one gold short refuses, charging nothing', () => {
    const poor = profile({ gold: 249 });
    const result = purchaseDoctorePalma(poor, 'iron_lungs');
    expect(result).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect('profile' in result).toBe(false);
    expect(poor.gold).toBe(249);
    expect(poor.palmae).toBeUndefined();
  });

  test('an already-owned palm is refused, so a stale click cannot charge twice', () => {
    const owned = withPalmae(['iron_lungs'], [], { gold: 1000 });
    const result = purchaseDoctorePalma(owned, 'iron_lungs');
    expect(result).toEqual({ ok: false, reason: 'already-owned' });
    expect('profile' in result).toBe(false);
    expect(owned.gold).toBe(1000);
  });

  test('an earned palm is not for sale; a boss palm is refused outright', () => {
    expect(purchaseDoctorePalma(profile({ gold: 9999 }), 'executioner')).toEqual({
      ok: false,
      reason: 'not-for-sale',
    });
    expect(purchaseDoctorePalma(profile({ gold: 9999 }), 'colossus_hide')).toEqual({
      ok: false,
      reason: 'boss-only',
    });
    expect(purchaseDoctorePalma(profile({ gold: 9999 }), 'nope')).toEqual({
      ok: false,
      reason: 'unknown-palma',
    });
    expect(purchaseDoctorePalma(null, 'iron_lungs')).toEqual({ ok: false, reason: 'no-profile' });
  });

  test('a malformed purse buys nothing (no NaN balance can be produced)', () => {
    const broken = profile({ gold: Number.NaN });
    expect(purchaseDoctorePalma(broken, 'iron_lungs')).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });
  });

  test('a bought palm is still subject to the tier ladder when worn', () => {
    const bought = purchaseDoctorePalma(profile({ gold: 250, currentTier: 1 }), 'iron_lungs');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(equipPalma(bought.profile, 'iron_lungs')).toEqual({ ok: false, reason: 'no-slot' });
    const promoted = { ...bought.profile, currentTier: 2 };
    expect(equipPalma(promoted, 'iron_lungs').ok).toBe(true);
  });
});

// ── §F the acceptance flow ──────────────────────────────────────────────
describe('CH-5 §F — Goliath falls: Executioner earned, slot 1 opens, effect live', () => {
  const goliath = ALL_OPPONENTS.find((opponent) => opponent.id === bossId('Goliath'))!;

  test('the whole chain, through the shipped seams', () => {
    const fresh = createNewProfile('Acceptance');
    expect(fresh.currentTier).toBe(1);
    expect(palmaSlotsForTier(fresh.currentTier)).toBe(0);

    // 1: the victory write's own composition (tier first, then the record).
    const tier = resolveVictoryTier({
      currentTier: fresh.currentTier,
      opponent: goliath,
      defeatedOpponentIds: fresh.defeatedOpponentIds,
    });
    expect(tier.currentTier).toBe(2);
    expect(tier.firstDefeat).toBe(true);

    const defeated = [...fresh.defeatedOpponentIds, goliath.id];
    const postWin: PlayerProfile = {
      ...fresh,
      currentTier: tier.currentTier,
      defeatedOpponentIds: defeated,
      fightsWon: 1,
      bossKills: 1,
    };

    // 2: the earn check unlocks Executioner, and ONLY Executioner.
    const earned = applyPalmaEarns(postWin);
    expect(earned.earned.map((palma) => palma.id)).toEqual(['executioner']);
    expect(earned.profile.palmae).toEqual({ unlocked: ['executioner'], equipped: [] });

    // 3: killing Goliath opened slot 1 (Tier 2), and the palm fits it.
    expect(palmaSlotsForTier(earned.profile.currentTier)).toBe(1);
    const equipped = equipPalma(earned.profile, 'executioner');
    expect(equipped.ok).toBe(true);
    if (!equipped.ok) return;

    // 4: the effect is live in the NEXT duel through CH-3a's own plumbing —
    //    `buildPlayerModifiers` resolves the merged block, and the damage stage
    //    reads it.  Nothing here re-implements the combat maths.
    const mods = buildPlayerModifiers(equipped.profile);
    expect(mods.palmae.map((palma) => palma.id)).toEqual(['executioner']);
    expect(damageDealtMultiplier(mods, ctx({ defenderHealth: 20 }))).toBeCloseTo(1.1, 10);
    // The palm's own condition is CH-3a's: above the 25% threshold it is the identity.
    expect(damageDealtMultiplier(mods, ctx({ defenderHealth: 80 }))).toBe(1);

    // 5: the data row is the single source of that magnitude.
    expect(getPalma('executioner')?.effect.damageDealtMult).toBe(1.1);
    // And an unequipped unlock changes nothing in the arena.
    const unEquipped = buildPlayerModifiers(earned.profile);
    expect(unEquipped.palmae).toEqual([]);
    expect(damageDealtMultiplier(unEquipped, ctx({ defenderHealth: 20 }))).toBe(1);
  });

  test('the same win never unlocks it twice, and the block stays single', () => {
    const once = applyPalmaEarns(
      profile({ currentTier: 2, defeatedOpponentIds: [goliath.id], fightsWon: 1 }),
    );
    const twice = applyPalmaEarns(once.profile);
    expect(twice.earned).toEqual([]);
    const worn = equipPalma(twice.profile, 'executioner');
    expect(worn.ok).toBe(true);
    if (!worn.ok) return;
    expect(buildPlayerModifiers(worn.profile).palmae).toHaveLength(1);
  });

  test('the merged block carries the palm, and the data row is its source', () => {
    const wearing = withPalmae(['executioner'], ['executioner'], { currentTier: 2 });
    const mods = buildPlayerModifiers(wearing);
    expect(mods.palmae.map((palma) => palma.id)).toEqual(['executioner']);
    // The merged block the duel reads carries the palm's own multiplier, and that
    // multiplier is read from the data row — never restated in this suite.
    expect(mods.block.damageDealtMult).toBe(getPalma('executioner')!.effect.damageDealtMult);
    expect(mergeModifiers([getPalma('executioner')!.effect]).damageDealtMult).toBe(
      mods.block.damageDealtMult,
    );
  });
});

// ── §G the wiring, read out of the shipped sources ──────────────────────
describe('CH-5 §G — the wiring', () => {
  const APP = code('src/App.tsx');
  const STATS = code('src/components/hub/StatsTab.tsx');
  const TRAINING = code('src/components/hub/TrainingTab.tsx');
  const PREFIGHT = code('src/components/hub/PreFightModal.tsx');
  const HELP = source('src/components/hub/HelpModal.tsx');
  const RESULT = code('src/components/hub/DuelResultModal.tsx');
  const PANEL = code('src/components/hub/PalmaePanel.tsx');

  test('App is the only writer, and it writes through the helpers', () => {
    expect(APP).toContain('applyPalmaEarns(');
    expect(APP).toContain('equipPalma(');
    expect(APP).toContain('unequipPalma(');
    expect(APP).toContain('purchaseDoctorePalma(');
    // The earn check sits inside the victory write, before the save.
    expect(APP.indexOf('applyPalmaEarns(updatedProfile)')).toBeGreaterThan(
      APP.indexOf('fightsWon: profile.fightsWon + 1'),
    );
    expect(APP.indexOf('applyPalmaEarns(updatedProfile)')).toBeLessThan(
      APP.indexOf('saveProfile(settledProfile)'),
    );
    // The result screen is told what unlocked.
    expect(APP).toContain('palmaEarned={duelResult.palmaEarned}');
  });

  test('no surface writes a save, and the panel is read/tap only', () => {
    for (const [name, text] of [
      ['StatsTab', STATS],
      ['TrainingTab', TRAINING],
      ['PalmaePanel', PANEL],
    ] as const) {
      expect(`${name}:${text.includes('saveProfile')}`).toBe(`${name}:false`);
      expect(`${name}:${text.includes('localStorage')}`).toBe(`${name}:false`);
      expect(`${name}:${text.includes('setProfile')}`).toBe(`${name}:false`);
    }
    expect(STATS).toContain('<PalmaePanel');
    expect(STATS).toContain('onEquipPalma={onEquipPalma}');
    expect(STATS).toContain('onUnequipPalma={onUnequipPalma}');
  });

  test('the Doctore stall reads its prices from the data, never a literal', () => {
    expect(TRAINING).toContain('DOCTORE_PALMAE');
    expect(TRAINING).toContain('palmaPrice(');
    expect(TRAINING).toContain('onBuyPalma');
    // No price is written into the component.
    for (const price of ['250', '300']) {
      expect(new RegExp(`(?<![\\w-])${price}(?![\\w-])`).test(TRAINING)).toBe(false);
    }
  });

  test('the pre-fight card scouts the config, read-only', () => {
    expect(PREFIGHT).toContain('getArmatura(');
    expect(PREFIGHT).toContain('getPalma(');
    expect(PREFIGHT).toContain('data-prefight-scouting');
    expect(PREFIGHT).toContain('opponent.armatura');
    expect(PREFIGHT).toContain('opponent.palmae');
  });

  test('the glossary names the three words', () => {
    expect(HELP).toContain('data-help-glossary');
    for (const word of ['Armatura', 'Doctrina', 'Palmae']) {
      expect(HELP).toContain(word);
    }
  });

  test('the result card announces a newly earned palm', () => {
    expect(RESULT).toContain('palmaEarned');
    expect(RESULT).toContain('data-duel-palma-earned');
    expect(RESULT).toContain('Palma earned');
  });
});
