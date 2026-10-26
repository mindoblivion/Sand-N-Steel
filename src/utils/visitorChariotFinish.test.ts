/**
 * SAND & STEEL — L16B: the ONE rare, visitor-acquired chariot finish.
 *
 * What this suite pins, in the repo's two registers (behaviour for the pure logic,
 * ordered source assertions for the wiring this repo has no DOM renderer for):
 *
 *   §A  the catalogue — `finish_ventive` at 900 gold, a `finish` slot, cosmetic,
 *       `visitorOnly`, built from the existing material-override system (no new
 *       geometry, no wheel variant), with every pre-L16B part id and price intact;
 *   §B  the offer — one finish id in ONE existing visitor's pool, selected by the
 *       shipped `selectDailyWindow` rotation: stable across repeated reads, moving
 *       with the city day, and never disturbing another visitor's item offer;
 *   §C  the bargain — 900 at the bladesmith's 0.70 rate is exactly 630, through the
 *       ONE resolver the panel and the transaction share;
 *   §D  the trade — one gold deduction, ONE owned-part entry, one visitor
 *       completion, no inventory write, every sibling field carried across, all in
 *       one returned profile;
 *   §E  refusals — insufficient gold, malformed gold/ownership, a stale (item) day,
 *       an already-completed visitor, an already-owned finish and a duplicate
 *       purchase, each leaving the caller's profile untouched;
 *   §F  persistence — a JSON round trip, a legacy save with no `chariot` field, and
 *       an older profile with no visitor fields at all;
 *   §G  the workshop — the finish cannot be bought there at any price, reads as
 *       the exact state "Brought by a visitor.", and equips normally once acquired;
 *   §H  the neighbours — ordinary visitor item purchases keep their price, grant
 *       and completion behaviour.
 *
 * Run with: `bun test src/utils/visitorChariotFinish.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CHARIOT_PARTS,
  chariotPartsBySlot,
  getChariotPart,
} from '../data/chariotParts';
import { getItemById } from '../data/itemsDB';
import { getVisitor, VISITOR_OFFER_SLOTS, VISITORS } from '../data/visitors';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import {
  equipChariotPart,
  getChariotPurchaseEligibility,
  purchaseChariotPart,
  resolveChariotLoadout,
} from './chariotLoadout';
import { selectDailyWindow } from './cityRotation';
import {
  purchaseVisitorOffer,
  resolveVisitorBargainPrice,
  resolveVisitorItemPrice,
} from './visitorPurchase';
import {
  readCompletedVisitors,
  resolveVisitorSchedule,
  scheduleVisitorDay,
} from './visitorSchedule';

const code = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PURCHASE_CODE = code('./visitorPurchase.ts');
const SCHEDULE_CODE = code('./visitorSchedule.ts');
const PRESENCE_CODE = code('./visitorPresence.ts');
const LOADOUT_CODE = code('./chariotLoadout.ts');
const WORKSHOP_CODE = code('../components/hub/ChariotWorkshopTab.tsx');
const PANEL_CODE = code('../components/hub/VisitorPanel.tsx');

const PART_ID = 'finish_ventive';
const BLADESMITH = 'numidian_bladesmith';
const ARMORER = 'campanian_armorer';
const TRADER = 'emesan_weapon_trader';
/** The bladesmith's own bargain rate, read from the catalogue (never restated). */
const RATE = getVisitor(BLADESMITH)!.bargainRate as number;
/** Day 5 is the bladesmith's finish day under the shipped rotation. */
const FINISH_DAY = 5;
/** Day 10 is his first `dirk_desert` day — an ordinary item day, for the neighbours. */
const ITEM_DAY = 10;
const STARTING_GOLD = 5000;

const onDay = (
  day: number,
  extra: Partial<NonNullable<PlayerProfile['city']>> = {}
): PlayerProfile => ({ ...createNewProfile('Tester'), city: { day, ...extra } }) as PlayerProfile;
const richOn = (
  day: number,
  extra: Partial<NonNullable<PlayerProfile['city']>> = {}
): PlayerProfile => ({ ...onDay(day, extra), gold: STARTING_GOLD }) as PlayerProfile;

const part = getChariotPart(PART_ID)!;
const expectedPrice = resolveVisitorBargainPrice(part, RATE)!;

function expectRefused(result: ReturnType<typeof purchaseVisitorOffer>, reason: string) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  // A refusal returns a reason and nothing else — no profile to write.
  expect(Object.keys(result)).toEqual(['ok', 'reason']);
  expect(result.reason).toBe(reason);
}

const snapshot = (profile: PlayerProfile): string => JSON.stringify(profile);

// ══════════════════════════════════════════════════════════════════════════
describe('L16B §A — the catalogue entry', () => {
  test('the finish exists once, in the finish slot, at 900 gold', () => {
    const matches = CHARIOT_PARTS.filter((entry) => entry.id === PART_ID);
    expect(matches).toHaveLength(1);
    expect(part.slot).toBe('finish');
    expect(part.price).toBe(900);
    expect(part.defaultOwned).toBe(false);
    expect(part.partClass).toBe('cosmetic');
    expect(part.visitorOnly).toBe(true);
    expect(part.finish).toBe('ventive');
    // Rarity is separate from `partClass` and lives in its own marker.
    expect(part.partClass).not.toBe('visitor');
  });

  test('it reuses the existing finish/material override system, with no new geometry', () => {
    // No wheel variant and no wheel part was added: the slot is finish, the
    // preview reads `finish` + `overrides` exactly as it does for the others.
    expect(part.wheelVariant).toBeUndefined();
    expect(chariotPartsBySlot('wheels').map((entry) => entry.id)).toEqual([
      'wheels_standard',
      'wheels_reinforced',
    ]);
    expect((part.overrides ?? []).length).toBeGreaterThan(0);
    for (const override of part.overrides ?? []) {
      // The chariot GLB's own material names, per the C-8.66B audit.
      expect(['Wood', 'DarkWood', 'Bronze', 'Leather']).toContain(override.material);
      expect(override.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // It is the ONLY visitor-only part shipped, and the only `visitorOnly` marker.
    expect(CHARIOT_PARTS.filter((entry) => entry.visitorOnly)).toHaveLength(1);
  });

  test('every pre-L16B part keeps its id, price, slot and default ownership', () => {
    expect(CHARIOT_PARTS.map((entry) => [entry.id, entry.slot, entry.price, entry.defaultOwned])).toEqual([
      ['wheels_standard', 'wheels', 0, true],
      ['wheels_reinforced', 'wheels', 450, false],
      ['finish_stock', 'finish', 0, true],
      ['finish_charred', 'finish', 180, false],
      ['finish_gilded', 'finish', 320, false],
      ['finish_oxblood', 'finish', 240, false],
      [PART_ID, 'finish', 900, false],
    ]);
    const loadout = resolveChariotLoadout(createNewProfile('Stock'));
    expect(loadout.owned).toEqual(['wheels_standard', 'finish_stock']);
    expect(loadout.equipped).toEqual({ wheels: 'wheels_standard', finish: 'finish_stock' });
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16B §B — the deterministic daily offer', () => {
  test('the finish is in exactly one visitor pool, the 0.70 bladesmith', () => {
    const owners = VISITORS.filter((visitor) => visitor.offer.pool.includes(PART_ID));
    expect(owners.map((visitor) => visitor.id)).toEqual([BLADESMITH]);
    expect(owners[0].bargainRate).toBe(0.7);
    // No second scheduler and no new visitor: the catalogue is still three people.
    expect(VISITORS.map((visitor) => visitor.id)).toEqual([BLADESMITH, ARMORER, TRADER]);
  });

  test('the day\'s pick is the shipped rotation, and exactly one field carries it', () => {
    for (let day = 1; day <= 200; day += 1) {
      for (const arrival of scheduleVisitorDay(VISITORS, day).arrivals) {
        const expected = selectDailyWindow(
          arrival.visitor.offer.pool,
          VISITOR_OFFER_SLOTS,
          arrival.visitor.id,
          day
        )[0];
        expect(arrival.offerItemId ?? arrival.offerPartId).toBe(expected);
        expect([arrival.offerItemId, arrival.offerPartId].filter(Boolean)).toHaveLength(1);
      }
    }
  });

  test('repeated reads agree, and the offer moves with the city day', () => {
    const first = resolveVisitorSchedule(richOn(FINISH_DAY));
    const second = resolveVisitorSchedule(richOn(FINISH_DAY));
    expect(second).toEqual(first);
    const arrival = first.arrivals.find((entry) => entry.visitor.id === BLADESMITH)!;
    expect(arrival.offerPartId).toBe(PART_ID);
    expect(arrival.offerItemId).toBeNull();

    // Day 10: the same visitor, the same resolver, an ordinary item instead.
    const itemDay = resolveVisitorSchedule(richOn(ITEM_DAY)).arrivals.find(
      (entry) => entry.visitor.id === BLADESMITH
    )!;
    expect(itemDay.offerPartId).toBeNull();
    expect(itemDay.offerItemId).toBe('dirk_desert');

    // A completed visitor is gone, so neither offer is reachable again.
    const completed = resolveVisitorSchedule(
      richOn(FINISH_DAY, { completedVisitors: [BLADESMITH] })
    ).arrivals.map((entry) => entry.visitor.id);
    expect(completed).not.toContain(BLADESMITH);
  });

  test('it is rare: fourteen of the bladesmith\'s forty-four arrival days', () => {
    const partDays: number[] = [];
    let arrivalDays = 0;
    for (let day = 1; day <= 150; day += 1) {
      const arrival = scheduleVisitorDay([getVisitor(BLADESMITH)!], day).arrivals[0];
      if (!arrival) continue;
      arrivalDays += 1;
      if (arrival.offerPartId === PART_ID) partDays.push(day);
    }
    expect(arrivalDays).toBe(44);
    expect(partDays).toHaveLength(14);
    expect(partDays.slice(0, 3)).toEqual([5, 14, 34]);
  });

  test('another visitor\'s item offer is untouched', () => {
    const armorer = scheduleVisitorDay(VISITORS, 8).arrivals.find(
      (entry) => entry.visitor.id === ARMORER
    )!;
    expect(armorer.offerItemId).toBe('arms_manica');
    expect(armorer.offerPartId).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16B §C — the bargain price', () => {
  test('900 gold at the 0.70 rate is exactly 630', () => {
    expect(part.price).toBe(900);
    expect(RATE).toBe(0.7);
    expect(expectedPrice).toBe(630);
    expect(resolveVisitorItemPrice(part)).toBe(900);
    expect(resolveVisitorBargainPrice(part, RATE)).toBe(Math.ceil(900 * 0.7));
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16B §D — a successful acquisition', () => {
  test('one deduction, one owned entry, one completion, in one profile', () => {
    const before = richOn(FINISH_DAY);
    const beforeCopy = snapshot(before);
    const result = purchaseVisitorOffer(before, BLADESMITH);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('part');
    if (result.kind !== 'part') return;
    expect(result.part.id).toBe(PART_ID);
    expect(result.price).toBe(630);

    // Exactly one deduction of the bargain price.
    expect(result.profile.gold).toBe(STARTING_GOLD - 630);
    expect(before.gold).toBe(STARTING_GOLD);

    // Exactly one owned entry, on the chariot — never in the item inventory.
    expect(resolveChariotLoadout(result.profile).owned.filter((id) => id === PART_ID)).toHaveLength(1);
    expect(result.profile.chariot?.owned).toContain(PART_ID);
    expect(result.profile.inventory).toEqual(before.inventory);
    expect(result.profile.inventory.some((owned) => owned?.id === PART_ID)).toBe(false);

    // Exactly one visitor completion, and the caller's profile was not mutated.
    expect(readCompletedVisitors(result.profile)).toEqual([BLADESMITH]);
    expect(snapshot(before)).toBe(beforeCopy);
  });

  test('sibling profile fields and an existing loadout are preserved', () => {
    const other = getChariotPart('finish_gilded')!;
    const before = {
      ...richOn(FINISH_DAY, { seenVisitors: [BLADESMITH], day: FINISH_DAY }),
      chariot: {
        owned: ['wheels_standard', 'finish_stock', other.id],
        equipped: { wheels: 'wheels_standard', finish: other.id },
      },
      temper: { [other.id]: 2 },
      fame: 1234,
    } as PlayerProfile;

    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const loadout = resolveChariotLoadout(result.profile);
    expect(loadout.owned).toEqual(['wheels_standard', 'finish_stock', other.id, PART_ID]);
    // Buying never changes what is fitted.
    expect(loadout.equipped.finish).toBe(other.id);
    expect(result.profile.city?.day).toBe(FINISH_DAY);
    expect(result.profile.city?.seenVisitors).toEqual([BLADESMITH]);
    expect(result.profile.temper).toEqual({ [other.id]: 2 });
    expect(result.profile.fame).toBe(1234);
    expect(result.profile.name).toBe(before.name);
    expect(result.profile.equipped).toEqual(before.equipped);
  });

  test('the acquired finish is selectable through the existing finish flow', () => {
    const bought = purchaseVisitorOffer(richOn(FINISH_DAY), BLADESMITH);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    const equipped = equipChariotPart(bought.profile, PART_ID, 'finish');
    expect(equipped.ok).toBe(true);
    if (!equipped.ok) return;
    expect(resolveChariotLoadout(equipped.profile).equipped.finish).toBe(PART_ID);
    expect(equipped.profile.gold).toBe(bought.profile.gold);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16B §E — refusals, each before any write', () => {
  test('one gold short is refused and charges nothing', () => {
    const before = { ...onDay(FINISH_DAY), gold: 629 } as PlayerProfile;
    const copy = snapshot(before);
    expectRefused(purchaseVisitorOffer(before, BLADESMITH), 'insufficient-gold');
    expect(snapshot(before)).toBe(copy);
  });

  test('malformed gold and malformed ownership fail closed', () => {
    for (const gold of [NaN, Infinity, -1, undefined, null, '900', {}]) {
      const before = { ...onDay(FINISH_DAY), gold } as unknown as PlayerProfile;
      expectRefused(purchaseVisitorOffer(before, BLADESMITH), 'invalid-gold');
    }
    // `null`/absent is a LEGACY save (the stock chariot), not a malformed one —
    // that path is covered by §F; here only junk shapes are refused.
    for (const chariot of ['nope', 7, [], true]) {
      const before = { ...richOn(FINISH_DAY), chariot } as unknown as PlayerProfile;
      expectRefused(purchaseVisitorOffer(before, BLADESMITH), 'invalid-ownership');
    }
    const badOwned = {
      ...richOn(FINISH_DAY),
      chariot: { owned: 'nope', equipped: { wheels: 'wheels_standard', finish: 'finish_stock' } },
    } as unknown as PlayerProfile;
    expectRefused(purchaseVisitorOffer(badOwned, BLADESMITH), 'invalid-ownership');
  });

  test('a day the visitor does not bring the finish is not a finish purchase', () => {
    const before = richOn(ITEM_DAY);
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The stale offer cannot be reached: the transaction re-resolved the day.
    expect(result.kind).toBe('item');
    expect(resolveChariotLoadout(result.profile).owned).not.toContain(PART_ID);
    // And a visitor who is not in town at all is refused before anything moves.
    expectRefused(purchaseVisitorOffer(richOn(1), BLADESMITH), 'not-in-town');
  });

  test('an already-completed visitor cannot buy again', () => {
    const before = richOn(FINISH_DAY, { completedVisitors: [BLADESMITH] });
    const copy = snapshot(before);
    expectRefused(purchaseVisitorOffer(before, BLADESMITH), 'already-completed');
    expect(snapshot(before)).toBe(copy);
  });

  test('a duplicate purchase is refused, so gold is charged once', () => {
    const first = purchaseVisitorOffer(richOn(FINISH_DAY), BLADESMITH);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const copy = snapshot(first.profile);
    expectRefused(purchaseVisitorOffer(first.profile, BLADESMITH), 'already-completed');
    expect(first.profile.gold).toBe(STARTING_GOLD - 630);
    expect(snapshot(first.profile)).toBe(copy);
  });

  test('an already-owned finish is refused before the charge', () => {
    const before = {
      ...richOn(FINISH_DAY),
      chariot: {
        owned: ['wheels_standard', 'finish_stock', PART_ID],
        equipped: { wheels: 'wheels_standard', finish: PART_ID },
      },
    } as PlayerProfile;
    const copy = snapshot(before);
    expectRefused(purchaseVisitorOffer(before, BLADESMITH), 'already-owned');
    expect(snapshot(before)).toBe(copy);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16B §F — persistence and older saves', () => {
  test('the result survives a storage round trip', () => {
    const result = purchaseVisitorOffer(richOn(FINISH_DAY), BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = JSON.parse(JSON.stringify(result.profile)) as PlayerProfile;
    expect(resolveChariotLoadout(restored).owned.filter((id) => id === PART_ID)).toHaveLength(1);
    expect(readCompletedVisitors(restored)).toEqual([BLADESMITH]);
    expect(restored.gold).toBe(STARTING_GOLD - 630);
    // No new save key and no migration marker were introduced.
    expect(Object.keys(restored).sort()).toEqual(Object.keys(result.profile).sort());
  });

  test('a legacy profile with no chariot field buys and creates the loadout', () => {
    const before = richOn(FINISH_DAY);
    expect(before.chariot).toBeUndefined();
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The stock parts are present exactly once and the finish joins them.
    expect(result.profile.chariot?.owned).toEqual(['wheels_standard', 'finish_stock', PART_ID]);
    expect(result.profile.chariot?.equipped).toEqual({
      wheels: 'wheels_standard',
      finish: 'finish_stock',
    });
  });

  test('a profile with no visitor fields at all reads as an empty history', () => {
    const before = {
      ...createNewProfile('Legacy'),
      gold: STARTING_GOLD,
      city: { day: FINISH_DAY },
    } as PlayerProfile;
    expect(before.city?.seenVisitors).toBeUndefined();
    expect(before.city?.completedVisitors).toBeUndefined();
    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city?.completedVisitors).toEqual([BLADESMITH]);
    expect(result.profile.city?.seenVisitors).toBeUndefined();
  });

  test('a save with no city field is a day-1 save, where nobody is in town', () => {
    const before = { ...createNewProfile('Legacy'), gold: STARTING_GOLD } as PlayerProfile;
    expectRefused(purchaseVisitorOffer(before, BLADESMITH), 'not-in-town');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16B §G — the workshop refuses it and shows the goal', () => {
  test('the workshop cannot sell the finish, and the refusal writes nothing', () => {
    const before = richOn(FINISH_DAY);
    expect(getChariotPurchaseEligibility(before, PART_ID)).toEqual({
      ok: false,
      reason: 'visitor-only',
    });
    const copy = snapshot(before);
    const bought = purchaseChariotPart(before, PART_ID);
    expect(bought.ok).toBe(false);
    if (bought.ok) return;
    expect(bought.reason).toBe('visitor-only');
    expect(snapshot(before)).toBe(copy);
  });

  test('all ordinary workshop parts remain purchasable', () => {
    const before = richOn(FINISH_DAY);
    for (const id of ['wheels_reinforced', 'finish_charred', 'finish_gilded', 'finish_oxblood']) {
      expect(getChariotPurchaseEligibility(before, id)).toEqual({ ok: true });
    }
  });

  test('an owned finish is "already-owned" and equips like any other part', () => {
    const result = purchaseVisitorOffer(richOn(FINISH_DAY), BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getChariotPurchaseEligibility(result.profile, PART_ID)).toEqual({
      ok: false,
      reason: 'already-owned',
    });
  });

  test('the workshop card reads the exact state "Brought by a visitor."', () => {
    expect(LOADOUT_CODE).toContain("case 'visitor-only':");
    expect(LOADOUT_CODE).toContain('return \'Brought by a visitor.\'');
    expect(WORKSHOP_CODE).toContain('part.visitorOnly');
    expect(WORKSHOP_CODE).toContain("'Brought by a visitor.'");
    // The workshop still buys only through the shared helper — no direct write.
    expect(WORKSHOP_CODE).not.toMatch(/saveProfile|completedVisitors|localStorage/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16B §H — ordinary visitor item purchases are unchanged', () => {
  test('an item day still charges the bargain price, grants one item, completes once', () => {
    const before = richOn(ITEM_DAY);
    const item = getItemById('dirk_desert')!;
    const price = resolveVisitorBargainPrice(item, RATE)!;
    expect(item.price).toBe(170);
    expect(price).toBe(119);

    const result = purchaseVisitorOffer(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('item');
    if (result.kind !== 'item') return;
    expect(result.item.id).toBe('dirk_desert');
    expect(result.price).toBe(price);
    expect(result.profile.gold).toBe(STARTING_GOLD - price);
    expect(result.profile.inventory).toHaveLength(before.inventory.length + 1);
    expect(result.profile.inventory.at(-1)?.id).toBe('dirk_desert');
    expect(readCompletedVisitors(result.profile)).toEqual([BLADESMITH]);
    // An item purchase never touches the chariot.
    expect(result.profile.chariot).toBeUndefined();
  });

  test('the armorer\'s day 8 item is untouched by the new finish', () => {
    const result = purchaseVisitorOffer(richOn(8), ARMORER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('item');
    if (result.kind !== 'item') return;
    expect(result.item.id).toBe('arms_manica');
    expect(result.price).toBe(53);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('L16B §I — scope guard', () => {
  test('the panel names the part and its price through the shared entry', () => {
    expect(PANEL_CODE).toContain('selected.item ?? selected.part');
    expect(PANEL_CODE).toContain('{offered ? offered.name : selected.visitor.offer.summary}');
    expect(PANEL_CODE).toContain('{offered.description}');
    expect(PANEL_CODE).toContain('Chariot finish — brought by a visitor');
    expect(PANEL_CODE).toContain('`Buy for ${price} gold`');
    expect(PANEL_CODE).toContain("'Not enough gold'");
    // Still one purchase callback, and no chariot transaction imported here.
    expect(PANEL_CODE.match(/onPurchase\(/g)?.length).toBe(1);
    expect(PANEL_CODE).not.toMatch(/chariotLoadout|purchaseChariotPart|equipChariotPart/);
  });

  test('the presence layer carries the part id without learning the chariot', () => {
    expect(PRESENCE_CODE).toContain('offerPartId: arrival.offerPartId');
    expect(PRESENCE_CODE).not.toMatch(/chariotParts|chariotLoadout|purchaseVisitorOffer/);
  });

  test('the schedule classifies with the catalogue\'s reader, and owns no clock', () => {
    expect(SCHEDULE_CODE).toContain('isChariotPartId');
    for (const source of [SCHEDULE_CODE, PURCHASE_CODE]) {
      expect(source).not.toMatch(/Math\.random|Date\.|setTimeout|setInterval|localStorage/);
    }
    // One price formula, one completion list; the part path adds no second rule.
    expect(PURCHASE_CODE.match(/Math\.ceil\(/g)?.length).toBe(1);
    expect(PURCHASE_CODE).not.toContain('completedVisitors: []');
    expect(PURCHASE_CODE.match(/completedVisitors: \[\.\.\.completed,/g)?.length).toBe(2);
  });

  test('the part is cosmetic data only: no combat, racing or item-catalogue shape', () => {
    // Nothing consumes a chariot part as a stat, and no shop can narrow it.
    expect(part.partClass).toBe('cosmetic');
    expect(part).not.toHaveProperty('damageLight');
    expect(part).not.toHaveProperty('defense');
    expect(part).not.toHaveProperty('weaponType');
    expect(getItemById(PART_ID)).toBeUndefined();
    expect(CHARIOT_PARTS.filter((entry) => entry.id === PART_ID)).toHaveLength(1);
  });
});
