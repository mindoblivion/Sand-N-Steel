/**
 * Selling — the market buy-back regression tests (pure logic, no UI).
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  eligibility: only an item carried in `inventory` and not equipped is
 *       sellable; unknown ids, unowned ids and the equipped weapon are refused
 *       with a reason rather than throwing;
 *   §B  the value: an untempered item pays exactly its own `sellPrice`, a
 *       tempered one adds 25 % of the temper gold spent, and an unknown id is
 *       worth 0;
 *   §C  the transaction: a success credits the gold, drops the item from the
 *       inventory and clears that item's temper record, returns a new profile
 *       and never modifies the input or a shared catalogue item object;
 *   §D  the refusals: every refused sale returns the caller's own frozen
 *       profile, identical, so no click can move gold or lose an item.
 *
 * Run with: `bun test src/utils/selling.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { PlayerProfile } from '../types/game';
import { DEFAULT_PLAYER_WEAPON, ALL_WEAPONS, ALL_ARMORS } from '../data/itemsDB';
import { resolveTemperLevel, getTemperGoldSpent } from './tempering';
import { getSellValue, getSellEligibility, sellItem } from './selling';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** The equipped starter sword: price 50, sellPrice 20. */
const GLADIUS = DEFAULT_PLAYER_WEAPON;
/** price 920, sellPrice 450 — the tempered-refund worked example. */
const TITAN = ALL_WEAPONS.find((w) => w.id === 'titan_colossus_mace')!;
/** Owned by nobody in these fixtures. */
const MURMILLO = ALL_ARMORS.find((a) => a.id === 'helm_murmillo')!;

/** A profile carrying the gladius (equipped) and the Titan mace, with 100 gold. */
function profile(mutate: (p: PlayerProfile) => void = () => {}): PlayerProfile {
  const p: PlayerProfile = {
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
    equipped: { weapon: GLADIUS },
    inventory: [GLADIUS, TITAN],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
  };
  mutate(p);
  return p;
}

/** Freeze a value and everything under it — a purity tripwire in strict-mode ESM. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/** A profile whose item objects are frozen copies, never the shared DB entries. */
function frozenProfile(mutate: (p: PlayerProfile) => void = () => {}): PlayerProfile {
  return deepFreeze(
    profile((p) => {
      p.equipped = { weapon: { ...GLADIUS } };
      p.inventory = [{ ...GLADIUS }, { ...TITAN }];
      mutate(p);
    })
  );
}

// ══════════════════════════════════════════════════════════════════════════
describe('P1 sell §A — eligibility', () => {
  test('a carried, unequipped item is sellable', () => {
    expect(getSellEligibility(profile(), TITAN.id)).toEqual({ ok: true });
  });

  test('the equipped weapon is refused even though it sits in the inventory', () => {
    const p = profile();
    expect(p.inventory.some((i) => i.id === GLADIUS.id)).toBe(true);
    expect(getSellEligibility(p, GLADIUS.id)).toEqual({ ok: false, reason: 'equipped' });
  });

  test('an unowned item and an unknown id are refused with their own reasons', () => {
    const p = profile();
    expect(getSellEligibility(p, MURMILLO.id)).toEqual({ ok: false, reason: 'not-owned' });
    expect(getSellEligibility(p, 'no_such_item')).toEqual({ ok: false, reason: 'unknown-item' });
  });

  test('no profile at all is a refusal, not a crash', () => {
    expect(getSellEligibility(null, TITAN.id)).toEqual({ ok: false, reason: 'no-profile' });
    expect(getSellEligibility(undefined, TITAN.id)).toEqual({ ok: false, reason: 'no-profile' });
  });

  test('gold is not part of the rule: a player with 0 gold can still sell', () => {
    expect(getSellEligibility(profile((p) => (p.gold = 0)), TITAN.id)).toEqual({ ok: true });
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P1 sell §B — value', () => {
  test('an untempered item pays exactly its own sellPrice', () => {
    expect(getSellValue(profile(), TITAN.id)).toBe(TITAN.sellPrice);
    expect(getSellValue(profile(), TITAN.id)).toBe(450);
  });

  test('a tempered item pays its sellPrice plus 25 % of the temper gold spent', () => {
    const p = profile((prof) => (prof.temper = { [TITAN.id]: 2 }));
    const spent = getTemperGoldSpent(TITAN, 2); // 370 + 735
    expect(spent).toBe(1105);
    expect(getSellValue(p, TITAN.id)).toBe(450 + 276);
  });

  test('an unknown id is worth 0', () => {
    expect(getSellValue(profile(), 'no_such_item')).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P1 sell §C — the transaction', () => {
  test('a sale credits the gold and drops the item from the inventory', () => {
    const before = profile();
    const after = sellItem(before, TITAN.id);

    expect(after).not.toBe(before);
    expect(after.gold).toBe(100 + 450);
    expect(after.inventory.map((i) => i.id)).toEqual([GLADIUS.id]);
    // The input is untouched.
    expect(before.gold).toBe(100);
    expect(before.inventory.length).toBe(2);
  });

  test('selling an item clears its temper record and keeps the rest', () => {
    const before = profile((p) => (p.temper = { [TITAN.id]: 2, [GLADIUS.id]: 1 }));
    const after = sellItem(before, TITAN.id);

    expect(after.temper).toEqual({ [GLADIUS.id]: 1 });
    // A re-bought Titan mace starts at level 0: the catalogue object is shared,
    // so the level must live only in the profile record.
    expect(resolveTemperLevel(after, TITAN.id)).toBe(0);
    expect(resolveTemperLevel(after, GLADIUS.id)).toBe(1);
  });

  test('a save with no temper field never gains one by selling', () => {
    const after = sellItem(profile(), TITAN.id);
    expect(after.temper).toBeUndefined();
  });

  test('the shared catalogue item and the frozen input are never modified', () => {
    const before = frozenProfile();
    const after = sellItem(before, TITAN.id);

    expect(after.gold).toBe(550);
    expect(before.gold).toBe(100);
    expect((TITAN as unknown as { gold?: number }).gold).toBeUndefined();
    expect(TITAN.sellPrice).toBe(450);
  });

  test('selling the spare weapon leaves the equipped weapon equipped', () => {
    const before = profile();
    const after = sellItem(before, TITAN.id);
    expect(after.equipped.weapon.id).toBe(GLADIUS.id);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P1 sell §D — refusals are inert', () => {
  test('an equipped item is refused and the profile comes back identical', () => {
    const before = frozenProfile();
    const after = sellItem(before, GLADIUS.id);

    expect(after).toBe(before);
    expect(after.gold).toBe(100);
    expect(after.inventory.map((i) => i.id)).toEqual([GLADIUS.id, TITAN.id]);
  });

  test('an unowned and an unknown id are refused with the profile unchanged', () => {
    const before = frozenProfile();
    expect(sellItem(before, MURMILLO.id)).toBe(before);
    expect(sellItem(before, 'no_such_item')).toBe(before);
    expect(before.gold).toBe(100);
  });

  test('gold only ever moves up, by the sale value', () => {
    let current = profile();
    const start = current.gold;
    for (const id of [TITAN.id, GLADIUS.id, TITAN.id]) {
      const next = sellItem(current, id);
      expect(next.gold).toBeGreaterThanOrEqual(current.gold);
      current = next;
    }
    expect(current.gold).toBe(start + TITAN.sellPrice);
  });
});
