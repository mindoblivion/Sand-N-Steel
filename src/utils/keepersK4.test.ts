/**
 * K4-STATE — the keeper plates' STATE lines, pinned.
 *
 * building-keepers.md §4.1(c): where a state is cheap and legible, the plate
 * speaks to it instead of the keeper's own greeting — injured at the Medical
 * House or the Inn, broke at a storefront.  This is a PARTIAL K4, named honestly:
 * race-day lines (Mappa's plate is unbuilt) and live-bounty lines (no Hall panel
 * exists) are DEFERRED, and no panel was invented for either.
 *
 * The seven lines are AUTHORED for this slice ("K4 — authored, not
 * design-transcribed"): the design defines the rule, not the words.
 *
 * What this suite proves:
 *   §A  the seven lines live on six registry rows, in the right voice, and no
 *       other keeper gains one; Antiochis has no uninjured line (dead content)
 *   §B  precedence STATE > NIGHT > own on both surfaces, frozen where the
 *       surface already freezes the greeting
 *   §C  the triggers: injured, uninjured, broke (computed from the shop's own
 *       data), and the empty-shelf case that is never "broke"
 *   §D  first-visit recording is unchanged when a state line shows
 *   §E  zero transaction changes, no new profile field, no clock, no new control
 *
 * Run with: `bun test src/utils/keepersK4.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KEEPERS,
  getKeeper,
  getKeeperForStorefront,
  nightClerkLine,
  recordKeeperVisit,
  resolveSeenKeepers,
  selectRepeatLine,
} from '../data/keepers';
import type { Keeper } from '../data/keepers';
import type { PlayerProfile } from '../types/game';
import type { StorefrontId } from '../data/shops';
import { getStorefrontStock, getVisibleStorefrontStock } from '../data/shops';
import { getItemById } from '../data/itemsDB';
import { CONSUMABLES } from '../data/consumables';
import { TREAT_PRICE, REST_PRICE } from './injury';
import {
  keeperStateFor,
  keeperStateLineFor,
  lowestPurchasablePrice,
  lowestStockPrice,
  purseBelowFloor,
  storefrontStock,
} from './keeperStateLines';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const raw = (path: string): string => readFileSync(join(SOURCE_DIR, path), 'utf8');
const code = (path: string): string =>
  raw(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const CITY = 'components/3d/city/CityHubScene.tsx';
const SHOP = 'components/hub/ShopTab.tsx';
const STATE_MODULE = 'utils/keeperStateLines.ts';

/** A profile carrying only what these triggers read — no new field, no fixture. */
const profile = (over: Record<string, unknown> = {}): PlayerProfile =>
  ({ name: 'Testus', gold: 1000, ...over }) as unknown as PlayerProfile;

const INJURED = { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 };
const EXHAUSTED = { fightsRemaining: 0, penaltyStrength: 2, penaltyAgility: 2 };

const keeperOf = (id: string): Keeper => {
  const keeper = getKeeper(id);
  expect(keeper, id).toBeDefined();
  return keeper!;
};

const FERRATUS = () => keeperOf('sextus_ferratus');
const CORIARIA = () => keeperOf('salvia_coriaria');
const PASION = () => keeperOf('pasion_of_alexandria');
const SURA = () => keeperOf('gaius_norbanus_sura');
const ANTIOCHIS = () => keeperOf('antiochis_of_pergamon');
const BARATES = () => keeperOf('barates_of_palmyra');

describe('K4 §A the seven authored lines, on the six rows that have a plate', () => {
  test('exactly six rows carry state lines, and together they hold exactly seven', () => {
    const withLines = KEEPERS.filter((keeper) => keeper.stateLines !== undefined);
    expect(withLines.map((keeper) => keeper.id).sort()).toEqual(
      [
        'antiochis_of_pergamon',
        'barates_of_palmyra',
        'gaius_norbanus_sura',
        'pasion_of_alexandria',
        'salvia_coriaria',
        'sextus_ferratus',
      ].sort()
    );
    const total = withLines.reduce(
      (count, keeper) => count + Object.values(keeper.stateLines ?? {}).filter(Boolean).length,
      0
    );
    expect(total).toBe(7);
  });

  test('each state sits on the keeper whose counter can actually show it', () => {
    expect(FERRATUS().stateLines).toEqual({ broke: FERRATUS().stateLines!.broke });
    expect(CORIARIA().stateLines).toEqual({ broke: CORIARIA().stateLines!.broke });
    expect(PASION().stateLines).toEqual({ broke: PASION().stateLines!.broke });
    expect(SURA().stateLines).toEqual({ broke: SURA().stateLines!.broke });
    expect(ANTIOCHIS().stateLines).toEqual({ injured: ANTIOCHIS().stateLines!.injured });
    expect(BARATES().stateLines!.injured).toBeTruthy();
    expect(BARATES().stateLines!.uninjured).toBeTruthy();
    expect(Object.keys(BARATES().stateLines!).sort()).toEqual(['injured', 'uninjured']);
  });

  test('no other keeper gains a state line', () => {
    for (const keeper of KEEPERS) {
      if (keeper.id === 'sextus_ferratus') continue;
      if (keeper.id === 'salvia_coriaria') continue;
      if (keeper.id === 'pasion_of_alexandria') continue;
      if (keeper.id === 'gaius_norbanus_sura') continue;
      if (keeper.id === 'antiochis_of_pergamon') continue;
      if (keeper.id === 'barates_of_palmyra') continue;
      expect(keeper.stateLines, keeper.id).toBeUndefined();
    }
    // The two DEFERRED states stay absent: no keeper speaks to a race day or a
    // live bounty, because neither plate exists.
    for (const keeper of KEEPERS) {
      const lines = keeper.stateLines as Record<string, unknown> | undefined;
      if (!lines) continue;
      expect(Object.keys(lines).sort()).not.toContain('raceDay');
      expect(Object.keys(lines).sort()).not.toContain('bounty');
    }
  });

  test('every line is a plain, two-line-at-most plate line that names its state', () => {
    const lines: Array<[string, string, RegExp]> = [
      ['antiochis_of_pergamon', ANTIOCHIS().stateLines!.injured!, /injur/i],
      ['barates_of_palmyra', BARATES().stateLines!.injured!, /hurt/i],
      ['barates_of_palmyra', BARATES().stateLines!.uninjured!, /mend|rest/i],
      ['sextus_ferratus', FERRATUS().stateLines!.broke!, /purse|gold/i],
      ['salvia_coriaria', CORIARIA().stateLines!.broke!, /purse|buy/i],
      ['pasion_of_alexandria', PASION().stateLines!.broke!, /purse/i],
      ['gaius_norbanus_sura', SURA().stateLines!.broke!, /purse/i],
    ];
    expect(lines).toHaveLength(7);
    for (const [id, line, stateWord] of lines) {
      expect(line.trim(), id).toBe(line);
      expect(line, id).toMatch(stateWord);
      // At most two lines on the plate: comfortably inside a phone's header band.
      expect(line.length, `${id}: ${line}`).toBeLessThanOrEqual(220);
    }
  });

  test('the cure and rest lines name their counter’s real price — and no line discounts', () => {
    expect(ANTIOCHIS().stateLines!.injured!).toContain(`${TREAT_PRICE}`);
    expect(BARATES().stateLines!.injured!).toContain('Twenty-five');
    expect(BARATES().stateLines!.uninjured!).toContain('Twenty-five');
    for (const keeper of KEEPERS) {
      for (const line of Object.values(keeper.stateLines ?? {})) {
        expect(line).not.toMatch(/discount|half price|halve|for free|free of charge|on credit/i);
      }
    }
    // Sura is never hostile — a customer without gold is simply early.
    expect(SURA().stateLines!.broke!).toContain('early');
  });

  test('Antiochis has NO uninjured line, because her panel cannot open healthy', () => {
    expect(ANTIOCHIS().stateLines!.uninjured).toBeUndefined();
    // The gate that makes an uninjured line dead content, pinned in the scene:
    // the Medical House opens ONLY with a live injury; the Inn opens regardless.
    const city = code(CITY);
    expect(city).toContain('if (service === \'caravanserai\' || resolveActiveInjury(playerProfile.injury))');
    // And the consequence, at the trigger: a healthy visit asks her for nothing.
    expect(keeperStateLineFor(ANTIOCHIS(), profile(), undefined)).toBe('');
    expect(keeperStateLineFor(ANTIOCHIS(), profile({ injury: INJURED }))).toBe(
      ANTIOCHIS().stateLines!.injured
    );
  });

  test('the authored lines are flagged as authored, not transcribed', () => {
    const keepers = raw('data/keepers.ts');
    expect(keepers.match(/K4 — authored, not design-transcribed/g)?.length).toBe(6);
  });
});

describe('K4 §B precedence: STATE > NIGHT > own, on both surfaces', () => {
  const FOUR_STOREFRONTS: Array<[StorefrontId, () => Keeper]> = [
    ['forge', FERRATUS],
    ['armorer', CORIARIA],
    ['bazaar', PASION],
    ['merchant', SURA],
  ];

  test('a broke purse wins over the night clerk and over the keeper’s own lines', () => {
    for (const [shopId, keeperOfShop] of FOUR_STOREFRONTS) {
      const keeper = keeperOfShop();
      // These four are exactly the keepers that DO have a night clerk, so the
      // precedence is exercised where it can actually be crossed.
      expect(keeper.nightLine, shopId).toBeTruthy();
      const floor = lowestPurchasablePrice(shopId, profile())!;
      const broke = profile({ gold: floor - 1, seenKeepers: [keeper.id] });
      const state = keeperStateLineFor(keeper, broke, shopId);
      expect(state, shopId).toBe(keeper.stateLines!.broke);

      const seen = true; // a returning customer: the own line is the repeat line
      const own = seen ? selectRepeatLine(keeper, 2) : keeper.firstVisitLine;
      for (const phase of ['day', 'night'] as const) {
        const hourLine = phase === 'night' ? nightClerkLine(keeper) || own : own;
        const displayed = state || hourLine;
        expect(displayed, `${shopId}/${phase}`).toBe(keeper.stateLines!.broke);
      }
    }
  });

  test('ShopTab puts the state line in front of the hour and of the greeting', () => {
    const shop = code(SHOP);
    expect(shop).toContain(
      'const stateLine = keeper ? keeperStateLineFor(keeper, profile, shopId) : \'\';'
    );
    expect(shop).toContain(
      'const displayedKeeperLine = stateLine || (shopIsNight && nightLine ? nightLine : keeperLine);'
    );
    // Read where the plate reads it: the same expression K1 pinned.
    expect(shop).toContain('{keeper && <KeeperPlate keeper={keeper} line={displayedKeeperLine} />}');
  });

  test('CityHubScene puts the state line in front, frozen at the greeting’s own moment', () => {
    const city = code(CITY);
    // Frozen in the SAME callback that freezes `seen`…
    const prime = city.slice(
      city.indexOf('const primeKeeperGreeting = useCallback('),
      city.indexOf('// Handle interaction with nearby landmark')
    );
    expect(prime).toContain(
      'keeperStateLineRef.current = keeper ? keeperStateLineFor(keeper, playerProfile) : \'\';'
    );
    // …and read from that ref by the panel's own line, ahead of the hour and of
    // the keeper's own greeting/repeat line.
    const lineFor = city.slice(
      city.indexOf('const keeperLineFor = (keeper: Keeper): string => {'),
      city.indexOf('const openCounterKeeperId')
    );
    const stateAt = lineFor.indexOf('const stateLine =');
    const returnAt = lineFor.indexOf('if (stateLine) return stateLine;');
    const hourAt = lineFor.indexOf("return cityPhase === 'night' ? nightClerkLine(keeper) || own : own;");
    expect(stateAt).toBeGreaterThanOrEqual(0);
    expect(returnAt).toBeGreaterThan(stateAt);
    expect(hourAt).toBeGreaterThan(returnAt);
    expect(lineFor).toContain('keeperGreetingRef.current');
    expect(lineFor).toContain('keeperStateLineRef.current');
  });

  test('an uninjured host outranks his evening line, and a healthy profile has none elsewhere', () => {
    // Barates has no night line; the precedence the panels actually cross is
    // injured/uninjured over his own greeting and repeat lines.
    const healthy = profile({ seenKeepers: [BARATES().id] });
    expect(keeperStateLineFor(BARATES(), healthy)).toBe(BARATES().stateLines!.uninjured);
    expect(keeperStateLineFor(BARATES(), healthy)).not.toBe(selectRepeatLine(BARATES(), 2));
    expect(keeperStateLineFor(BARATES(), healthy)).not.toBe(BARATES().firstVisitLine);
  });
});

describe('K4 §C the triggers', () => {
  test('injured — a live injury only; an exhausted or malformed one is no injury', () => {
    expect(keeperStateFor(ANTIOCHIS(), profile({ injury: INJURED }))).toBe('injured');
    expect(keeperStateFor(ANTIOCHIS(), profile({ injury: EXHAUSTED }))).toBeNull();
    expect(keeperStateFor(ANTIOCHIS(), profile({ injury: null }))).toBeNull();
    expect(keeperStateFor(ANTIOCHIS(), profile())).toBeNull();
    // At the Inn, the two states are complementary.
    expect(keeperStateFor(BARATES(), profile({ injury: INJURED }))).toBe('injured');
    expect(keeperStateFor(BARATES(), profile())).toBe('uninjured');
    expect(keeperStateFor(BARATES(), profile({ injury: EXHAUSTED }))).toBe('uninjured');
  });

  test('broke — the floor is the counter’s own cheapest purchasable price, from data', () => {
    const fresh = profile();
    const gearFloor = (shopId: StorefrontId): number => {
      const ids = getVisibleStorefrontStock(shopId, fresh);
      expect(ids.length, shopId).toBeGreaterThan(0);
      return Math.min(...ids.map((id) => getItemById(id)!.price));
    };
    for (const shopId of ['forge', 'armorer', 'merchant'] as const) {
      expect(lowestPurchasablePrice(shopId, fresh), shopId).toBe(gearFloor(shopId));
    }
    // The Bazaar sells consumables, not gear: 20 (poultice) / 90 (salve).
    expect(getStorefrontStock('bazaar')).toEqual([]);
    expect(storefrontStock('bazaar', fresh)).toEqual(CONSUMABLES.map((item) => item.id));
    expect(lowestPurchasablePrice('bazaar', fresh)).toBe(
      Math.min(...CONSUMABLES.map((item) => item.price))
    );
    expect(lowestPurchasablePrice('bazaar', fresh)).toBe(20);
  });

  test('one gold short is broke; the floor itself is not — no magic threshold', () => {
    for (const [shopId, keeper] of [
      ['forge', FERRATUS()],
      ['armorer', CORIARIA()],
      ['bazaar', PASION()],
      ['merchant', SURA()],
    ] as const) {
      const floor = lowestPurchasablePrice(shopId, profile())!;
      expect(keeperStateFor(keeper, profile({ gold: floor - 1 }), shopId)).toBe('broke');
      expect(keeperStateFor(keeper, profile({ gold: floor }), shopId)).toBeNull();
      expect(keeperStateFor(keeper, profile({ gold: floor + 500 }), shopId)).toBeNull();
    }
  });

  test('a counter with nothing purchasable is NOT broke', () => {
    // The rule at its source: no ids, no floor.
    expect(lowestStockPrice([])).toBeNull();
    // …and no floor can never call a purse too small, at any balance.
    for (const gold of [0, -5, Number.NaN, undefined]) {
      expect(purseBelowFloor(gold, lowestStockPrice([]))).toBe(false);
    }
    // The real empty-shelf case: the Bazaar's GEAR list is empty by design, yet
    // its consumables are its stock — so the floor comes from them, not from a
    // guess, and a gear-only reading would have said "nobody is broke here".
    expect(lowestStockPrice(getStorefrontStock('bazaar'))).toBeNull();
    expect(lowestPurchasablePrice('bazaar', profile())).toBe(20);
  });

  test('a service counter has no price floor, so no storefront state can trigger there', () => {
    // With no `shopId` the broke rule cannot run at all: these two sell a
    // service, not a catalogue, so an empty purse is simply not their business.
    expect(keeperStateFor(FERRATUS(), profile({ gold: 0 }))).toBeNull();
    expect(keeperStateFor(BARATES(), profile({ gold: 0 }))).toBe('uninjured');
    expect(keeperStateFor(ANTIOCHIS(), profile({ gold: 0 }))).toBeNull();
  });

  test('a keeper with no state lines never borrows another keeper’s', () => {
    for (const id of ['hanno_of_carthage', 'postumia', 'aelia_prisca', 'scribonia']) {
      const keeper = keeperOf(id);
      expect(keeperStateLineFor(keeper, profile({ gold: 0, injury: INJURED }), 'forge')).toBe('');
    }
  });
});

describe('K4 §D the visit record is unchanged when a state line shows', () => {
  test('a broke first visit still writes `seenKeepers`, and nothing else', () => {
    const broken = profile({ gold: 0 });
    expect(resolveSeenKeepers(broken)).toEqual([]);
    expect(keeperStateLineFor(FERRATUS(), broken, 'forge')).toBe(FERRATUS().stateLines!.broke);

    const visited = recordKeeperVisit(broken, 'sextus_ferratus')!;
    expect(resolveSeenKeepers(visited)).toEqual(['sextus_ferratus']);
    expect(visited.gold).toBe(0);
    // The record is idempotent: a second open returns the same reference.
    expect(recordKeeperVisit(visited, 'sextus_ferratus')).toBe(visited);
  });

  test('the two record paths are exactly K1/K2’s — one call site each', () => {
    expect(code(SHOP).match(/onRecordKeeperVisit\?\.\(/g)?.length).toBe(1);
    expect(code(SHOP)).toContain('if (!keeperId || keeperMet) return;');
    expect(code(CITY).match(/onRecordKeeperVisit\?\.\(/g)?.length).toBe(1);
    // The state line never reaches the record: it is read for the plate only.
    expect(code(SHOP)).not.toContain('keeperStateLineFor(keeper, profile, shopId) &&');
  });

  test('the plate still adds no control, so the state line adds no tap target', () => {
    for (const surface of [SHOP, CITY]) {
      const source = code(surface);
      const at = source.indexOf('keeperStateLineFor');
      expect(at, surface).toBeGreaterThanOrEqual(0);
    }
    const plate = code('components/hub/KeeperPlate.tsx');
    expect(plate).not.toContain('<button');
    expect(plate).not.toContain('onClick');
    expect(plate).not.toContain('onTouchStart');
  });
});

describe('K4 §E zero transaction changes, no new field, no clock', () => {
  test('every price and effect this slice sits beside is untouched', () => {
    expect(TREAT_PRICE).toBe(75);
    expect(REST_PRICE).toBe(25);
    expect(CONSUMABLES.map((item) => [item.id, item.price])).toEqual([
      ['field_poultice', 20],
      ['medicus_salve', 90],
    ]);
  });

  test('the trigger module reaches no transaction, no clock and no save', () => {
    const module = code(STATE_MODULE);
    for (const forbidden of [
      'treatInjury',
      'restAtInn',
      'applyConsumableEffect',
      'saveProfile',
      'localStorage',
      'Date.now',
      'performance.now',
      'new Date',
    ]) {
      expect(module, forbidden).not.toContain(forbidden);
    }
    // It reads exactly two existing profile facts.
    expect(module).toContain('resolveActiveInjury');
    expect(module).toContain('profile?.gold');
  });

  test('the surfaces’ own transaction code is untouched by the slice', () => {
    const city = code(CITY);
    expect(city).toContain('onClick={() => handleTreatment(treatmentPanel)}');
    expect(city).toContain('getIntelPurchaseEligibility(playerProfile, opponent.id)');
    const shop = code(SHOP);
    expect(shop).toContain('onBuyConsumable?.(item);');
    expect(shop).toContain('onBuyItem(wpn);');
    // The handlers that charge still know nothing about keepers or states.
    const treat = city.slice(city.indexOf('const handleTreatment = useCallback('));
    expect(treat.slice(0, 600)).not.toContain('keeperState');
    expect(code('utils/injury.ts')).not.toContain('stateLines');
    expect(code('data/consumables.ts')).not.toContain('stateLines');
    expect(code('data/itemsDB.ts')).not.toContain('stateLines');
    expect(code('utils/combatCalculations.ts')).not.toContain('keeperState');
  });

  test('no new profile field: `stateLines` lives on the keeper, never on the save', () => {
    expect(code('types/game.ts')).not.toContain('stateLines');
    expect(code('services/storage.ts')).not.toContain('stateLines');
    expect(code('data/keepers.ts')).toContain('stateLines?: KeeperStateLines;');
    // The only reader of `seenKeepers`-style writer rules is unchanged: the
    // registry's own record and the profile's type declaration, as K2 pinned.
    expect(code('data/keepers.ts')).toContain('recordKeeperVisit');
  });

  test('both surfaces route only through the one lookup, never a second copy of the rule', () => {
    expect(code(SHOP).match(/keeperStateLineFor\(/g)?.length).toBe(1);
    expect(code(CITY).match(/keeperStateLineFor\(/g)?.length).toBe(2);
    // …and the registry mapping is unchanged — the four storefronts and the
    // three service counters K1/K2/K3 built, with nothing added.
    expect(getKeeperForStorefront('forge')?.id).toBe('sextus_ferratus');
    expect(getKeeperForStorefront('market')).toBeUndefined();
  });
});
