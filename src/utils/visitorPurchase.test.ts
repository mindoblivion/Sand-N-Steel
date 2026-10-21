/**
 * Living City L12 — the visitor purchase transaction, and the panel that drives it.
 *
 * What this suite pins, in the repo's two registers (behaviour for the pure logic,
 * ordered source assertions for the wiring this repo has no DOM renderer for):
 *
 *   §A  the purchase — the canonical price once, exactly one item, the visitor
 *       completed once, every unrelated field and the city day preserved;
 *   §B  completion is permanent and the offer is re-resolved — no second purchase,
 *       even on a later day the visitor would otherwise arrive on;
 *   §C  refusals — missing profile, unknown visitor, out of town, unaffordable;
 *       each leaves gold, inventory and history untouched;
 *   §D  malformed input — non-finite gold, a non-array inventory, and prices that
 *       must never read as free;
 *   §E  purity and atomicity — the caller's profile is never mutated, and gold,
 *       item and completion arrive in one object;
 *   §F  replayed callbacks — a ref-backed gate charges once, with a control showing
 *       a stale base WOULD charge twice;
 *   §G  the neighbours — the merchant window and allowance, the clock, the training
 *       timetable and the visitor catalogue are unchanged;
 *   §H  the wiring — App is the one caller and reads the newest profile, the panel
 *       displays the canonical price and sends only the visitor id.
 *
 * The pinned days come from the L10 suite (the bladesmith arrives on day 5 with
 * `dirk_desert`, the armorer on day 8 with `arms_manica`), so a cadence change
 * fails there first and here second.
 *
 * Run with: `bun test src/utils/visitorPurchase.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { getItemById } from '../data/itemsDB';
import { getStorefrontStock } from '../data/shops';
import { VISITORS } from '../data/visitors';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { advanceCityDay, resolveCityDay } from './cityClock';
import { resolveStorefrontOffer } from './cityRotation';
import { purchaseStorefrontItem, resolveMerchantPurchaseDay } from './storefrontPurchase';
import { resolveTrainingSchedule } from './trainingSchedule';
import {
  purchaseVisitorOffer,
  resolveVisitorItemPrice,
} from './visitorPurchase';
import { resolveVisitorEncounter, recordVisitorEncounter } from './visitorEncounter';
import {
  readCompletedVisitors,
  readSeenVisitors,
  resolveVisitorSchedule,
} from './visitorSchedule';

const code = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const APP_CODE = code('../App.tsx');
const PANEL_CODE = code('../components/hub/VisitorPanel.tsx');
const SCENE_CODE = code('../components/3d/city/CityHubScene.tsx');
const PURCHASE_CODE = code('./visitorPurchase.ts');

const fresh = (): PlayerProfile => createNewProfile('Tester');
const onDay = (
  day: number,
  extra: Partial<NonNullable<PlayerProfile['city']>> = {}
): PlayerProfile => ({ ...fresh(), city: { day, ...extra } }) as PlayerProfile;
const richOn = (
  day: number,
  extra: Partial<NonNullable<PlayerProfile['city']>> = {}
): PlayerProfile => ({ ...onDay(day, extra), gold: 5000 }) as PlayerProfile;

/** Day 5: the Numidian bladesmith is in the city, offering `dirk_desert`. */
const ARRIVAL_DAY = 5;
const BLADESMITH = 'numidian_bladesmith';
const BLADESMITH_ITEM = 'dirk_desert';
/** Day 8: the Campanian armorer, offering `arms_manica`. */
const ARMORER_DAY = 8;
const ARMORER = 'campanian_armorer';
const ARMORER_ITEM = 'arms_manica';
/** Day 1 has nobody in town. */
const EMPTY_DAY = 1;

const item = (id: string) => getItemById(id)!;
const snapshot = (profile: PlayerProfile): string => JSON.stringify(profile);

function expectUnchanged(
  before: PlayerProfile,
  result: ReturnType<typeof purchaseVisitorOffer>
) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  // A refusal returns a reason and nothing else — no profile to write.
  expect(Object.keys(result)).toEqual(['ok', 'reason']);
}

describe('§A the purchase', () => {
  test('charges exactly the canonical ITEMS_DB price', () => {
    const before = richOn(ARRIVAL_DAY);
    const price = item(BLADESMITH_ITEM).price;
    const result = purchaseVisitorOffer(before, BLADESMITH);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.price).toBe(price);
    expect(result.profile.gold).toBe(before.gold - price);
    expect(result.profile.gold).toBe(5000 - 170);
  });

  test('grants exactly one copy, by the catalogue object', () => {
    const before = richOn(ARRIVAL_DAY);
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.profile.inventory.length).toBe(before.inventory.length + 1);
    expect(result.profile.inventory.filter((owned) => owned.id === BLADESMITH_ITEM).length).toBe(
      before.inventory.filter((owned) => owned.id === BLADESMITH_ITEM).length + 1
    );
    expect(result.profile.inventory[result.profile.inventory.length - 1]).toBe(item(BLADESMITH_ITEM));
  });

  test('adds the visitor to completedVisitors exactly once', () => {
    const result = purchaseVisitorOffer(richOn(ARRIVAL_DAY), BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readCompletedVisitors(result.profile)).toEqual([BLADESMITH]);
  });

  test('keeps seenVisitors and every unrelated profile field', () => {
    const before = {
      ...richOn(ARRIVAL_DAY, {
        seenVisitors: [BLADESMITH],
        merchantPurchaseDay: 4,
        restDay: 3,
      }),
      fame: 321,
      xp: 4567,
      fightsWon: 9,
    } as PlayerProfile;
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(readSeenVisitors(result.profile)).toEqual([BLADESMITH]);
    expect(result.profile.fame).toBe(321);
    expect(result.profile.xp).toBe(4567);
    expect(result.profile.fightsWon).toBe(9);
    expect(result.profile.currentTier).toBe(before.currentTier);
    expect(result.profile.city?.merchantPurchaseDay).toBe(4);
    expect(result.profile.city?.restDay).toBe(3);
  });

  test('does not advance the city day', () => {
    const result = purchaseVisitorOffer(richOn(ARRIVAL_DAY), BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveCityDay(result.profile)).toBe(ARRIVAL_DAY);
    expect(result.profile.city?.day).toBe(ARRIVAL_DAY);
  });

  test('pays no extra gold, fame or experience', () => {
    const before = richOn(ARRIVAL_DAY);
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBeLessThan(before.gold);
    expect(result.profile.fame).toBe(before.fame);
    expect(result.profile.xp).toBe(before.xp);
    expect(result.profile.level).toBe(before.level);
  });
});

describe('§B completion is permanent, and the offer is re-resolved', () => {
  test('a completed visitor cannot be bought from again the same day', () => {
    const first = purchaseVisitorOffer(richOn(ARRIVAL_DAY), BLADESMITH);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = purchaseVisitorOffer(first.profile, BLADESMITH);
    expectUnchanged(first.profile, second);
    if (second.ok) return;
    expect(second.reason).toBe('already-completed');
    expect(first.profile.gold).toBe(5000 - 170);
    expect(first.profile.inventory.filter((owned) => owned.id === BLADESMITH_ITEM).length).toBe(1);
  });

  test('…and on every later day the visitor would otherwise arrive on', () => {
    const first = purchaseVisitorOffer(richOn(ARRIVAL_DAY), BLADESMITH);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    for (const day of [10, 14, 15, 21, 22]) {
      const later = { ...first.profile, city: { ...first.profile.city, day } } as PlayerProfile;
      const result = purchaseVisitorOffer(later, BLADESMITH);
      expectUnchanged(later, result);
      if (result.ok) return;
      expect(result.reason).toBe('already-completed');
    }
  });

  test('the completed visitor is gone from the schedule, and only that visitor', () => {
    const result = purchaseVisitorOffer(richOn(ARRIVAL_DAY), BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sameDay = resolveVisitorSchedule(result.profile);
    expect(sameDay.arrivals.map((arrival) => arrival.visitor.id)).not.toContain(BLADESMITH);

    const bothInTown = { ...result.profile, city: { ...result.profile.city, day: 15 } } as PlayerProfile;
    const ids = resolveVisitorSchedule(bothInTown).arrivals.map((arrival) => arrival.visitor.id);
    expect(ids).not.toContain(BLADESMITH);
    expect(ids).toContain(ARMORER);
  });

  test('the item granted is the day’s resolved offer, never a caller’s pick', () => {
    // On day 15 the bladesmith offers `dagger_pugio`, not day 5's `dirk_desert`.
    const result = purchaseVisitorOffer(richOn(15), BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const view = resolveVisitorEncounter(richOn(15), BLADESMITH)!;
    expect(view.offerItemId).toBe('dagger_pugio');
    expect(result.item.id).toBe(view.offerItemId!);
    expect(result.price).toBe(item('dagger_pugio').price);
  });

  test('a visitor not in town today cannot be bought from', () => {
    const before = richOn(EMPTY_DAY);
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expectUnchanged(before, result);
    if (result.ok) return;
    expect(result.reason).toBe('not-in-town');
  });

  test('an unknown visitor id is refused before anything else', () => {
    const before = richOn(ARRIVAL_DAY);
    const result = purchaseVisitorOffer(before, 'some_other_trader');
    expectUnchanged(before, result);
    if (result.ok) return;
    expect(result.reason).toBe('unknown-visitor');
  });

  test('a missing profile is refused', () => {
    for (const missing of [null, undefined]) {
      const result = purchaseVisitorOffer(missing, BLADESMITH);
      expectUnchanged(null as unknown as PlayerProfile, result);
      if (result.ok) return;
      expect(result.reason).toBe('no-profile');
    }
  });
});

describe('§C the purse', () => {
  test('insufficient gold leaves the profile byte-identical', () => {
    const before = { ...onDay(ARRIVAL_DAY), gold: 169 } as PlayerProfile;
    const copy = snapshot(before);
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expectUnchanged(before, result);
    if (result.ok) return;
    expect(result.reason).toBe('insufficient-gold');
    expect(snapshot(before)).toBe(copy);
    expect(readCompletedVisitors(before)).toEqual([]);
  });

  test('exactly enough gold pays to zero, once', () => {
    const before = { ...onDay(ARRIVAL_DAY), gold: 170 } as PlayerProfile;
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(0);

    const again = purchaseVisitorOffer(result.profile, BLADESMITH);
    if (again.ok) return;
    expect(again.reason).toBe('already-completed');
    expect(result.profile.gold).toBe(0);
  });

  test('a second visitor costs that visitor’s own price', () => {
    const armorer = purchaseVisitorOffer(richOn(ARMORER_DAY), ARMORER);
    expect(armorer.ok).toBe(true);
    if (!armorer.ok) return;
    expect(armorer.price).toBe(item(ARMORER_ITEM).price);
    expect(armorer.price).toBe(70);
    expect(armorer.profile.gold).toBe(5000 - 70);
  });
});

describe('§D malformed input', () => {
  test('missing, malformed or non-finite gold is refused safely', () => {
    for (const gold of [NaN, Infinity, -Infinity, -1, undefined, null, '500', {}]) {
      const before = { ...onDay(ARRIVAL_DAY), gold } as unknown as PlayerProfile;
      const result = purchaseVisitorOffer(before, BLADESMITH);
      expectUnchanged(before, result);
      if (result.ok) return;
      expect(result.reason).toBe('invalid-gold');
    }
  });

  test('a malformed inventory is refused instead of rebuilt', () => {
    for (const inventory of [null, undefined, 'sword', {}, 7]) {
      const before = { ...richOn(ARRIVAL_DAY), inventory } as unknown as PlayerProfile;
      const result = purchaseVisitorOffer(before, BLADESMITH);
      expectUnchanged(before, result);
      if (result.ok) return;
      expect(result.reason).toBe('invalid-inventory');
    }
  });

  test('an inventory of unrelated or junk entries keeps them and appends one', () => {
    const junk = [{ id: 'odd' } as never];
    const before = { ...richOn(ARRIVAL_DAY), inventory: junk } as PlayerProfile;
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.inventory.length).toBe(2);
    expect(result.profile.inventory[0]).toBe(junk[0]);
    expect(result.profile.inventory[1].id).toBe(BLADESMITH_ITEM);
  });

  test('a malformed city container is ignored rather than spread into the profile', () => {
    const before = { ...richOn(ARRIVAL_DAY), city: 'day5' } as unknown as PlayerProfile;
    // Day 1 by the clock, so the visitor is not in town — and no junk keys appear.
    const result = purchaseVisitorOffer(before, BLADESMITH);
    if (result.ok) {
      // If a catalogue ever puts someone in town on day 1, the write must still be clean.
      expect(Object.keys(result.profile.city ?? {})).toEqual(['completedVisitors']);
      return;
    }
    expect(result.reason).toBe('not-in-town');
  });

  test('invalid, negative and non-finite prices are rejected, never read as free', () => {
    const priced = (price: unknown) => ({ price } as unknown as ReturnType<typeof item>);
    for (const bad of [NaN, Infinity, -Infinity, -1, -0.01, null, undefined, '170']) {
      expect(resolveVisitorItemPrice(priced(bad))).toBeNull();
    }
    expect(resolveVisitorItemPrice(priced(0))).toBe(0);
    expect(resolveVisitorItemPrice(priced(170))).toBe(170);
    expect(resolveVisitorItemPrice(null)).toBeNull();
    expect(PURCHASE_CODE).toContain('invalid-price');
  });

  test('every visitor offer in the shipping catalogue has a usable price', () => {
    for (const visitor of VISITORS) {
      for (const id of visitor.offer.pool) {
        const entry = getItemById(id);
        expect(entry).toBeDefined();
        const price = resolveVisitorItemPrice(entry);
        expect(price).not.toBeNull();
        expect(price).toBe(item(id).price);
      }
    }
  });
});

describe('§E purity and atomicity', () => {
  test('the caller’s profile is never mutated', () => {
    const before = richOn(ARRIVAL_DAY);
    const copy = snapshot(before);
    purchaseVisitorOffer(before, BLADESMITH);
    expect(snapshot(before)).toBe(copy);
    expect(readCompletedVisitors(before)).toEqual([]);
  });

  test('a frozen profile is answerable and a NEW object comes back', () => {
    const before = Object.freeze(richOn(ARRIVAL_DAY)) as PlayerProfile;
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile).not.toBe(before);
    expect(result.profile.city).not.toBe(before.city);
  });

  test('gold, the item and the completion arrive in one profile', () => {
    const result = purchaseVisitorOffer(richOn(ARRIVAL_DAY), BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The module builds exactly one returned profile; nothing is written elsewhere.
    expect(PURCHASE_CODE.match(/inventory: \[\.\.\.profile\.inventory, item\]/g)?.length).toBe(1);
    expect(PURCHASE_CODE.match(/completedVisitors: \[\.\.\.completed, visitorId\]/g)?.length).toBe(1);
    expect(PURCHASE_CODE).not.toMatch(/saveProfile|localStorage|sessionStorage|PROFILE_STORAGE_KEY/);
  });

  test('the module names no clock, timer or randomness', () => {
    expect(PURCHASE_CODE).not.toMatch(/Date\.|setTimeout|setInterval|Math\.random/);
    expect(PURCHASE_CODE.match(/advanceCityDay|nextCityDay/g)).toBeNull();
  });

  test('a repeated identical call from one base is deterministic', () => {
    const before = richOn(ARRIVAL_DAY);
    const first = purchaseVisitorOffer(before, BLADESMITH);
    const second = purchaseVisitorOffer(before, BLADESMITH);
    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(snapshot(first.profile)).toBe(snapshot(second.profile));
  });
});

describe('§F replayed callbacks', () => {
  /** App's own composition: one latest-profile base, replaced the instant a purchase commits. */
  function createPurchaseGate(initial: PlayerProfile, stale = false) {
    let latest = initial;
    const fixed = initial;
    return {
      click(visitorId: string) {
        const base = stale ? fixed : latest;
        const result = purchaseVisitorOffer(base, visitorId);
        if (result.ok && !stale) latest = result.profile;
        return result;
      },
      get profile(): PlayerProfile {
        return latest;
      },
    };
  }

  test('a double callback charges and grants once', () => {
    const gate = createPurchaseGate(richOn(ARRIVAL_DAY));
    const first = gate.click(BLADESMITH);
    const second = gate.click(BLADESMITH);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('already-completed');
    expect(gate.profile.gold).toBe(5000 - 170);
    expect(gate.profile.inventory.filter((owned) => owned.id === BLADESMITH_ITEM).length).toBe(1);
    expect(readCompletedVisitors(gate.profile)).toEqual([BLADESMITH]);
  });

  test('CONTROL: a stale base WOULD charge twice — the latest base is what prevents it', () => {
    const gate = createPurchaseGate(richOn(ARRIVAL_DAY), true);
    expect(gate.click(BLADESMITH).ok).toBe(true);
    expect(gate.click(BLADESMITH).ok).toBe(true);
  });
});

describe('§G the neighbours', () => {
  test('the merchant window and its allowance are unchanged', () => {
    const dayOne = resolveStorefrontOffer({ city: { day: 1 } }, 'merchant');
    expect(dayOne).toEqual([
      'helm_centurion',
      'chest_golden_muscled',
      'arms_manica_steel',
      'arms_galerus_gilded',
    ]);
    const buy = purchaseStorefrontItem(richOn(1), 'merchant', dayOne[0]);
    expect(buy.ok).toBe(true);
    if (!buy.ok) return;
    expect(buy.profile.inventory[buy.profile.inventory.length - 1].id).toBe(dayOne[0]);
    expect(resolveMerchantPurchaseDay(buy.profile)).toBe(1);
    const again = purchaseStorefrontItem(buy.profile, 'merchant', dayOne[0]);
    if (again.ok) return;
    expect(again.reason).toBe('merchant-daily-limit');
  });

  test('a visitor purchase does not spend the merchant’s allowance', () => {
    const result = purchaseVisitorOffer(richOn(ARRIVAL_DAY), BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveMerchantPurchaseDay(result.profile)).toBeNull();
    // The merchant still trades with the visitor's purchase complete, on today's own window.
    const dayFiveOffer = resolveStorefrontOffer(result.profile, 'merchant');
    const buy = purchaseStorefrontItem(result.profile, 'merchant', dayFiveOffer[0]);
    expect(buy.ok).toBe(true);
  });

  test('the clock still advances one day per settlement', () => {
    const advanced = advanceCityDay(onDay(ARRIVAL_DAY));
    expect(resolveCityDay(advanced)).toBe(ARRIVAL_DAY + 1);
  });

  test('the training timetable is unchanged', () => {
    const schedule = resolveTrainingSchedule(fresh());
    expect(schedule.actions.map((action) => action.id)).toEqual(['strength', 'agility', 'defense']);
    expect(schedule.resting.map((action) => action.id)).toEqual(['stamina']);
  });

  test('the visitor catalogue and its pools are unchanged', () => {
    expect(VISITORS.map((visitor) => visitor.id)).toEqual([
      BLADESMITH,
      ARMORER,
      'emesan_weapon_trader',
    ]);
    const spine = [...getStorefrontStock('forge'), ...getStorefrontStock('armorer')];
    for (const visitor of VISITORS) {
      for (const id of visitor.offer.pool) expect(spine).toContain(id);
    }
    expect(PURCHASE_CODE).not.toMatch(/visitor-exclusive|\bprice:\s*\d/);
  });

  test('meeting a visitor still writes only seenVisitors', () => {
    const met = recordVisitorEncounter(richOn(ARRIVAL_DAY), BLADESMITH);
    expect(met.ok).toBe(true);
    if (!met.ok) return;
    expect(readSeenVisitors(met.profile)).toEqual([BLADESMITH]);
    expect(readCompletedVisitors(met.profile)).toEqual([]);
  });
});

describe('§H the wiring', () => {
  test('App calls the transaction once, from the newest profile, and saves once', () => {
    expect(APP_CODE.match(/purchaseVisitorOffer\(/g)?.length).toBe(1);
    expect(APP_CODE).toContain('purchaseVisitorOffer(profileRef.current, visitorId)');
    expect(APP_CODE.match(/const handleVisitorPurchase = /g)?.length).toBe(1);
    expect(APP_CODE).toContain('onPurchaseVisitor={handleVisitorPurchase}');
    const handler = APP_CODE.slice(
      APP_CODE.indexOf('const handleVisitorPurchase'),
      APP_CODE.indexOf('if (!webglAvailable)')
    );
    expect(handler.match(/saveProfile\(/g)?.length).toBe(1);
    expect(handler.match(/setProfile\(/g)?.length).toBe(1);
    expect(handler).toContain('if (!result.ok) return result;');
  });

  test('App still writes no completion history itself', () => {
    expect(APP_CODE).not.toMatch(/completedVisitors\s*[:=]/);
  });

  test('the scene hands the purchase callback to the one panel', () => {
    expect(SCENE_CODE.match(/<VisitorPanel/g)?.length).toBe(1);
    expect(SCENE_CODE).toContain('onPurchase={onPurchaseVisitor}');
  });

  test('the panel displays the canonical price and sends only the visitor id', () => {
    expect(PANEL_CODE).toContain('onPurchase(selected.visitor.id)');
    expect(PANEL_CODE.match(/onPurchase\(/g)?.length).toBe(1);
    expect(PANEL_CODE).toContain('selected.item.price');
    expect(PANEL_CODE).not.toMatch(/saveProfile|completedVisitors|purchaseStorefrontItem/);
    expect(PANEL_CODE).not.toMatch(/\buseEffect\b/);
  });

  test('the panel refuses an unaffordable purchase at the control', () => {
    expect(PANEL_CODE).toContain('disabled={!selected.item || price === null || !affordable}');
    expect(PANEL_CODE).toContain('Not enough gold');
  });

  test('the panel reports the completed trade and drops the row', () => {
    expect(PANEL_CODE).toContain('has departed — the trade is complete.');
    expect(PANEL_CODE).toContain('setSelectedId(null)');
    expect(PANEL_CODE).not.toMatch(/completedVisitors/);
  });

  test('the schedule still has no writer of either history field', () => {
    const schedule = code('./visitorSchedule.ts');
    expect(schedule).not.toMatch(/seenVisitors\s*[:=]/);
    expect(schedule).not.toMatch(/completedVisitors\s*[:=]/);
  });
});
