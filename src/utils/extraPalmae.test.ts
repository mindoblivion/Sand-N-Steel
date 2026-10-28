/**
 * ===========================================================================
 * C-TRAIT — THE EXTRA PALMA: one resolver, both grant paths (design C3b/C3d)
 * ===========================================================================
 * The Oct 19 QA amendment retires the null fallback both grant paths shipped
 * with. This suite pins the amendment itself:
 *
 *   §A the safe-subset order and the four live effect rows it may name;
 *   §B the FULL mapping — every regular's carried palmae -> the extra he gets,
 *      exactly as the Director ruling lists it, plus the cyclic wrap;
 *   §C the fence — bosses and Feature Bouts never receive an extra, from either
 *      grant path;
 *   §D ONE resolver: grudge generation and mode application return the same id;
 *   §E the existing merge path — the granted id lands in `buildOpponentModifiers`;
 *   §F purity — the roster row is never mutated and the appender is idempotent.
 *
 * Run with: `bun test src/utils/extraPalmae.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from '../data/opponents';
import { PALMAE, getPalma } from '../data/palmae';
import { BOUT_MODES, resolveBoutOpponent } from '../data/boutModes';
import { buildGrudgeOpponent, isGrudgeBase } from './grudgeBouts';
import { buildOpponentModifiers } from './combatModifiers';
import {
  SAFE_SUBSET_PALMAE_ORDER,
  extraPalmaFor,
  extraPalmaLine,
  withExtraPalma,
} from './extraPalmae';

const byId = (id: string) => {
  const row = ALL_OPPONENTS.find((entry) => entry.id === id);
  if (!row) throw new Error(`roster has no ${id}`);
  return row;
};

/**
 * The Director ruling's mapping table, verbatim: the CURRENT roster rows, the
 * palmae each carries, and the extra each must receive.
 */
const MAPPING: Array<{ id: string; name: string; carries: string[]; extra: string }> = [
  { id: 'opp_marcus', name: 'Marcus', carries: [], extra: 'sand_sprinter' },
  { id: 'opp_flaccus', name: 'Flaccus', carries: ['sand_sprinter'], extra: 'shieldwall_discipline' },
  { id: 'opp_hoplite', name: 'Cassius', carries: ['shieldwall_discipline'], extra: 'iron_lungs' },
  { id: 'opp_brutus_anvil', name: 'Brutus', carries: [], extra: 'sand_sprinter' },
  { id: 'opp_naija_fisher', name: 'Naija', carries: [], extra: 'sand_sprinter' },
  { id: 'opp_centurion_drusus', name: 'Drusus', carries: ['iron_lungs'], extra: 'blood_price' },
  { id: 'opp_kallias_sparta', name: 'Kallias', carries: [], extra: 'sand_sprinter' },
  { id: 'opp_pale_twins', name: 'Pale Twins', carries: [], extra: 'sand_sprinter' },
];

describe('C-TRAIT §A — the safe subset, as published', () => {
  test('the order is exactly Sand Sprinter -> Shieldwall -> Iron Lungs -> Blood Price', () => {
    expect([...SAFE_SUBSET_PALMAE_ORDER]).toEqual([
      'sand_sprinter',
      'shieldwall_discipline',
      'iron_lungs',
      'blood_price',
    ]);
  });

  test('every safe-subset row is a live palma with a real effect (no invented system)', () => {
    for (const id of SAFE_SUBSET_PALMAE_ORDER) {
      const palma = getPalma(id);
      expect(palma, id).toBeDefined();
      expect(palma!.description.length).toBeGreaterThan(0);
      // A live effect row, not a stub: at least one modifier field is set.
      expect(Object.keys(palma!.effect).length, id).toBeGreaterThan(0);
    }
  });
});

describe('C-TRAIT §B — the published mapping, every row', () => {
  test('each roster row receives exactly the ruling’s extra', () => {
    for (const entry of MAPPING) {
      const row = byId(entry.id);
      expect(row.palmae ?? [], `${entry.name}: carried palmae`).toEqual(entry.carries);
      expect(extraPalmaFor(row), entry.name).toBe(entry.extra);
    }
  });

  test('the mapping is complete over the ladder’s regulars (nothing ungranted)', () => {
    const regulars = ALL_OPPONENTS.filter(isGrudgeBase);
    for (const row of regulars) {
      const extra = extraPalmaFor(row);
      expect(extra, row.id).not.toBeNull();
      expect(SAFE_SUBSET_PALMAE_ORDER).toContain(extra as never);
      // Never one he already carries.
      expect(row.palmae ?? [], row.id).not.toContain(extra);
    }
  });

  test('the cyclic wrap: a Blood Price carrier gets Sand Sprinter, and all four wrap too', () => {
    expect(extraPalmaFor({ palmae: ['blood_price'] })).toBe('sand_sprinter');
    expect(
      extraPalmaFor({
        palmae: ['sand_sprinter', 'shieldwall_discipline', 'iron_lungs', 'blood_price'],
      })
    ).toBe('sand_sprinter');
    // A palma OUTSIDE the subset never enters the cycle.
    expect(extraPalmaFor({ palmae: ['pit_bellower', 'vipers_patience'] })).toBe('sand_sprinter');
    expect(extraPalmaFor({ palmae: ['iron_lungs'] })).toBe('blood_price');
  });

  test('junk reads as “carries none”', () => {
    expect(extraPalmaFor(null)).toBeNull();
    expect(extraPalmaFor(undefined)).toBeNull();
    expect(extraPalmaFor({})).toBe('sand_sprinter');
    expect(extraPalmaFor({ palmae: [] })).toBe('sand_sprinter');
  });
});

describe('C-TRAIT §C — the fence: bosses and Feature Bouts never receive extras', () => {
  test('the resolver refuses both, and the appender leaves the row untouched', () => {
    const bosses = ALL_OPPONENTS.filter((row) => row.isBoss === true);
    const features = ALL_OPPONENTS.filter((row) => row.featureBout === true);
    expect(bosses.length).toBeGreaterThan(0);
    expect(features.length).toBeGreaterThan(0);
    for (const row of [...bosses, ...features]) {
      expect(extraPalmaFor(row), row.id).toBeNull();
      const appended = withExtraPalma(row);
      expect(appended, row.id).toBe(row);
      expect(appended.palmae, row.id).toEqual(row.palmae);
    }
    // The Doctore's Test champion is a regular in the roster but off-ladder: the
    // GRUDGE path is fenced by `isGrudgeBase`, the mode path grants normally.
    expect(isGrudgeBase(DOCTORE_TEST_OPPONENT)).toBe(true);
    expect(extraPalmaFor(DOCTORE_TEST_OPPONENT)).toBe('sand_sprinter');
  });

  test('the GRUDGE path refuses every boss (no grudge row is generated at all)', () => {
    for (const row of ALL_OPPONENTS.filter((entry) => entry.isBoss === true)) {
      expect(buildGrudgeOpponent(row, 'power'), row.id).toBeNull();
    }
  });

  test('the MODE path leaves every boss and Feature Bout’s palmae untouched', () => {
    for (const mode of ['sand', 'steel', 'invictus'] as const) {
      for (const row of [...ALL_OPPONENTS].filter((r) => r.isBoss === true || r.featureBout === true)) {
        const resolved = resolveBoutOpponent(mode, row);
        expect(resolved.palmae, `${row.id}/${mode}`).toEqual(row.palmae);
        expect(resolved.palmae ?? []).not.toContain('sand_sprinter');
      }
    }
  });
});

describe('C-TRAIT §D — ONE resolver feeds both grant paths', () => {
  test('a grudge’s evolved trait IS the resolver’s answer, and lands on its palmae', () => {
    for (const entry of MAPPING) {
      const row = byId(entry.id);
      const grudge = buildGrudgeOpponent(row, 'power')!;
      expect(grudge.grudge!.evolvedTrait, entry.name).toBe(extraPalmaFor(row));
      expect(grudge.palmae, entry.name).toEqual([...(row.palmae ?? []), entry.extra]);
      expect(grudge.grudge!.evolvedTrait).not.toBeNull();
    }
  });

  test('a Steel/Invictus bout grants the SAME id the grudge slot would', () => {
    for (const entry of MAPPING) {
      const row = byId(entry.id);
      for (const mode of ['steel', 'invictus'] as const) {
        const resolved = resolveBoutOpponent(mode, row);
        expect(resolved.palmae, `${entry.name}/${mode}`).toEqual([
          ...(row.palmae ?? []),
          entry.extra,
        ]);
      }
      expect(resolveBoutOpponent('sand', row).palmae, entry.name).toEqual(row.palmae);
    }
  });

  test('the card line names the palma and its effect, from the palma’s own row', () => {
    const line = extraPalmaLine('blood_price');
    expect(line).toBe(
      'Blood Price — Deal 8% more damage while you are below 40% health.'
    );
    expect(extraPalmaLine(null)).toBe('');
    expect(extraPalmaLine('not_a_palma')).toBe('');
  });
});

describe('C-TRAIT §E — the granted palma resolves through the EXISTING merge', () => {
  test('Sand Sprinter reaches the opponent’s merged block on Steel only', () => {
    const marcus = byId('opp_marcus');
    const steel = buildOpponentModifiers(resolveBoutOpponent('steel', marcus)).block;
    expect(steel.hitAgiAdd).toBe(1);

    const sand = buildOpponentModifiers(resolveBoutOpponent('sand', marcus)).block;
    expect(sand.hitAgiAdd ?? 0).toBe(0);
  });

  test('Blood Price reaches the block for an Iron Lungs carrier on Invictus', () => {
    const drusus = byId('opp_centurion_drusus');
    const invictus = buildOpponentModifiers(resolveBoutOpponent('invictus', drusus)).block;
    // Iron Lungs (carried) + Blood Price (granted) both land in one merged block:
    // no second effect system, just the shipped merge.
    expect(invictus.damageDealtMult).toBeCloseTo(1.08, 9);
    expect(invictus.staminaMaxAdd).toBe(12);
  });

  test('the grudge row carries its evolved trait into the same block', () => {
    const grudge = buildGrudgeOpponent(byId('opp_marcus'), 'even')!;
    const block = buildOpponentModifiers(grudge).block;
    expect(block.hitAgiAdd).toBe(1);
  });
});

describe('C-TRAIT §F — purity', () => {
  test('appending never mutates the row it is given, and repeats agree', () => {
    for (const row of ALL_OPPONENTS) {
      const before = JSON.stringify(row);
      const once = withExtraPalma(row);
      const again = withExtraPalma(row);
      expect(JSON.stringify(row), row.id).toBe(before);
      expect(again.palmae, row.id).toEqual(once.palmae);
      // A fresh array whenever something IS granted (the row is never aliased in).
      if (once !== row) expect(once.palmae).not.toBe(row.palmae);
    }
  });

  test('the resolver is a CYCLE, not an idempotent set-add: a second pass grants the next entry', () => {
    // This is the published rule (C3b), and it is what a grudge row already
    // carrying its evolved trait sees when the Steel grant is applied on top of it:
    // Marcus carries none -> Sand Sprinter; Sand Sprinter carried -> Shieldwall.
    const marcus = byId('opp_marcus');
    const first = resolveBoutOpponent('steel', marcus);
    expect(first.palmae).toEqual(['sand_sprinter']);
    const second = resolveBoutOpponent('steel', first);
    expect(second.palmae).toEqual(['sand_sprinter', 'shieldwall_discipline']);
    expect(new Set(first.palmae).size).toBe(first.palmae!.length);
    // A grudge row already carries its evolved trait, so Steel adds the next one —
    // never a duplicate of the trait it holds.
    const grudge = buildGrudgeOpponent(marcus, 'power')!;
    const grudgeSteel = resolveBoutOpponent('steel', grudge);
    expect(grudge.grudge!.evolvedTrait).toBe('sand_sprinter');
    expect(grudgeSteel.palmae).toEqual(['sand_sprinter', 'shieldwall_discipline']);
  });

  test('only the four safe-subset rows can ever be granted', () => {
    const subset = new Set<string>(SAFE_SUBSET_PALMAE_ORDER);
    for (const row of ALL_OPPONENTS) {
      for (const mode of ['steel', 'invictus'] as const) {
        for (const id of resolveBoutOpponent(mode, row).palmae ?? []) {
          if ((row.palmae ?? []).includes(id)) continue;
          expect(subset.has(id), `${row.id}: ${id}`).toBe(true);
        }
      }
    }
    // And the subset is a real subset of the data, not a parallel list of ids.
    const ids = new Set(PALMAE.map((palma) => palma.id));
    for (const id of SAFE_SUBSET_PALMAE_ORDER) expect(ids.has(id), id).toBe(true);
  });

  test('a boss carries a bossOnly palma and still receives no extra', () => {
    const bosses = ALL_OPPONENTS.filter((row) => row.isBoss === true);
    for (const boss of bosses) {
      for (const id of boss.palmae ?? []) {
        const palma = getPalma(id);
        if (!palma) continue;
        expect(palma.bossOnly, `${boss.id}: ${id}`).toBe(true);
      }
      expect(extraPalmaFor(boss)).toBeNull();
    }
    expect(BOUT_MODES.sand.grantsExtraPalma).toBe(false);
  });
});
