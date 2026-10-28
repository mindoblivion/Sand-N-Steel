/**
 * P6 — the progression UI wiring.
 *
 * P1 (tempering), P3 (chariot slots), P4 (stable) and P5 (facilities) each
 * shipped a pure module and pinned "nothing in production consumes it yet".
 * P6 gives each one a surface.  This suite pins the two things that make the
 * wiring safe rather than the pixels it draws:
 *
 *   • every surface is DERIVED — a slot, a price, a cap and a refusal sentence
 *     all come from the module that owns them, so no screen can disagree with
 *     the transaction that fires behind it; and
 *   • the transactions stay where they were — App is the only writer, a screen
 *     only asks, and a refused purchase still moves nothing.
 *
 * Behaviour is driven through the shipped modules (the same calls the components
 * make); the components themselves are pinned by their own source contracts, the
 * convention the P4/P5 wiring suites use.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import {
  CHARIOT_PARTS,
  CHARIOT_SLOTS,
  DEFAULT_CHARIOT_PART_IDS,
  chariotPartsBySlot,
  getDefaultChariotPart,
} from '../data/chariotParts';
import {
  equipChariotPart,
  getChariotPurchaseEligibility,
  ownsChariotPart,
  purchaseChariotPart,
  resolveChariotLoadout,
} from './chariotLoadout';
import {
  TEMPER_MAX_LEVEL,
  getTemperCost,
  getTemperPurchaseEligibility,
  purchaseTemper,
  resolveTemperLevel,
} from './tempering';
import {
  getStableQuality,
  purchaseStableQuality,
  purchaseStableConditioning,
} from './stableProgression';
import { FACILITIES, purchaseFacility, resolveFacilities } from './facilityProgression';

const path = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const code = (rel: string): string =>
  readFileSync(path(rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const WORKSHOP = code('../components/hub/ChariotWorkshopTab.tsx');
const TEMPER_ROW = code('../components/hub/TemperControl.tsx');
const STABLE_PANEL = code('../components/hub/StablePanel.tsx');
const FACILITIES_PANEL = code('../components/hub/FacilitiesPanel.tsx');
const GEAR_TAB = code('../components/hub/GearTab.tsx');
const RACING_SECTION = code('../components/hub/RacingConfigSection.tsx');
const HUB = code('../components/hub/GladiatorSchoolHub.tsx');
const APP = code('../App.tsx');

/** Every surface this phase added or touched. */
const SURFACES: Array<[string, string]> = [
  ['components/hub/ChariotWorkshopTab.tsx', WORKSHOP],
  ['components/hub/TemperControl.tsx', TEMPER_ROW],
  ['components/hub/StablePanel.tsx', STABLE_PANEL],
  ['components/hub/FacilitiesPanel.tsx', FACILITIES_PANEL],
  ['components/hub/GearTab.tsx', GEAR_TAB],
  ['components/hub/RacingConfigSection.tsx', RACING_SECTION],
  ['components/hub/GladiatorSchoolHub.tsx', HUB],
];

const purse = (gold: number): PlayerProfile => ({ ...createNewProfile('P6 Tester'), gold });

// ══════════════════════════════════════════════════════════════════════════
describe('P6 §A — the workshop sells every slot the catalogue carries', () => {
  test('every slot has one stock part, and every stock part is owned without being listed', () => {
    const fresh = purse(0);
    for (const slot of CHARIOT_SLOTS) {
      const stocks = chariotPartsBySlot(slot).filter((part) => part.defaultOwned);
      expect(stocks, slot).toHaveLength(1);
      expect(stocks[0].price, slot).toBe(0);
      // Owned through the catalogue, not through the save …
      expect(ownsChariotPart(fresh, stocks[0].id), slot).toBe(true);
      // … so a stock chariot still stores nothing (P3's rule, widened, not broken).
      expect(resolveChariotLoadout(fresh).owned, slot).toEqual(['wheels_standard', 'finish_stock']);
    }
  });

  test('a stock part can never be bought — the card shows Equip, not a free Buy', () => {
    for (const slot of CHARIOT_SLOTS) {
      const stock = getDefaultChariotPart(slot);
      expect(getChariotPurchaseEligibility(purse(5000), stock.id), slot).toEqual({
        ok: false,
        reason: 'already-owned',
      });
      // …and it is equippable, which is how a player returns a slot to stock.
      expect(equipChariotPart(purse(5000), stock.id).ok, slot).toBe(true);
    }
  });

  test('a paid part in EACH slot is bought, equipped, persisted under its own key, and reversed', () => {
    for (const slot of CHARIOT_SLOTS) {
      const paid = chariotPartsBySlot(slot).find((part) => part.price > 0);
      if (!paid) continue; // a slot with no paid rung (none today) proves nothing here
      const bought = purchaseChariotPart(purse(5000), paid.id);
      if (!bought.ok) throw new Error(`${slot}: buy refused (${bought.reason})`);
      expect(bought.profile.gold).toBe(5000 - paid.price);
      // A purchase never equips, so the stored record is still empty.
      expect(bought.profile.chariot!.equipped, slot).toEqual({});

      const equipped = equipChariotPart(bought.profile, paid.id);
      if (!equipped.ok) throw new Error(`${slot}: equip refused (${equipped.reason})`);
      expect(equipped.profile.chariot!.equipped, slot).toEqual({ [slot]: paid.id });
      expect(resolveChariotLoadout(equipped.profile).equipped, slot).toEqual({
        ...DEFAULT_CHARIOT_PART_IDS,
        [slot]: paid.id,
      });

      // Equipping the stock part removes the key again.
      const back = equipChariotPart(equipped.profile, DEFAULT_CHARIOT_PART_IDS[slot]);
      if (!back.ok) throw new Error(`${slot}: stock re-equip refused (${back.reason})`);
      expect(back.profile.chariot!.equipped, slot).toEqual({});
    }
  });

  test('a five-slot non-stock chariot round-trips through JSON to the same resolved loadout', () => {
    let profile = purse(20000);
    for (const slot of CHARIOT_SLOTS) {
      const paid = chariotPartsBySlot(slot).find((part) => part.price > 0);
      if (!paid) continue;
      const bought = purchaseChariotPart(profile, paid.id);
      if (!bought.ok) throw new Error(`${slot}: buy refused`);
      const equipped = equipChariotPart(bought.profile, paid.id);
      if (!equipped.ok) throw new Error(`${slot}: equip refused`);
      profile = equipped.profile;
    }
    // Every slot left its stock part, so every slot is stored.
    expect(Object.keys(profile.chariot!.equipped).sort()).toEqual([...CHARIOT_SLOTS].sort());
    const resolved = resolveChariotLoadout(profile).equipped;
    const reloaded = JSON.parse(JSON.stringify(profile)) as PlayerProfile;
    expect(resolveChariotLoadout(reloaded).equipped).toEqual(resolved);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P6 §B — the workshop is derived and owns no transaction', () => {
  test('one section per catalogue slot, rendered from CHARIOT_SLOTS', () => {
    expect(WORKSHOP).toContain(
      'const SLOT_SECTIONS = CHARIOT_SLOTS.map((slot) => ({ slot, parts: chariotPartsBySlot(slot) }));'
    );
    expect(WORKSHOP).toContain('SLOT_SECTIONS.map(({ slot, parts })');
    expect(WORKSHOP).toContain('data-chariot-slot-section={slot}');
    // …and the presentation map is keyed by the exported type, so a new slot is a
    // compile error rather than a silently missing section.
    expect(WORKSHOP).toContain('const SLOT_META: Record<ChariotSlot,');
  });

  test('only the parts the 3D preview can show carry a Preview control', () => {
    expect(WORKSHOP).toContain('part.wheelVariant !== undefined || part.finish !== undefined');
    expect(WORKSHOP).toContain('{canPreview(part) && (');
    // The preview itself can only drive the wheel kit and the finish recolours.
    expect(WORKSHOP).toContain("if (part.slot === 'wheels' && part.wheelVariant)");
    expect(WORKSHOP).toContain("if (part.slot === 'finish' && part.finish)");
  });

  test('the workshop writes nothing: no save path, no gold movement, and it re-checks before asking', () => {
    for (const banned of ['saveProfile', 'localStorage', 'setProfile', 'gold:']) {
      expect(WORKSHOP.includes(banned), banned).toBe(false);
    }
    expect(WORKSHOP).toContain('getChariotPurchaseEligibility(profile, part.id)');
    expect(WORKSHOP).toContain('getChariotEquipEligibility(profile, part.id)');
    expect(WORKSHOP).toContain('onBuyPart(part.id)');
    expect(WORKSHOP).toContain('onEquipPart(part.id)');
    // The card's owned state is the module's predicate, not a raw array lookup —
    // that is what makes a stock axle/harness/tub read as owned.
    expect(WORKSHOP).toContain('const isOwned = ownsChariotPart(profile, part.id);');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P6 §C — the temper row', () => {
  test('both Armory cards carry the row, wired to the one callback', () => {
    const rows = GEAR_TAB.split('<TemperControl').length - 1;
    expect(rows).toBe(2); // weapons and armour
    expect(GEAR_TAB).toContain('item={wpn}');
    expect(GEAR_TAB).toContain('item={arm}');
    expect(GEAR_TAB.split('onTemper={onTemperItem}').length - 1).toBe(2);
    expect(GEAR_TAB).toContain('onTemperItem?: (itemId: string) => void;');
  });

  test('the row reads the module for level, cost, cap and refusal — and computes none of them', () => {
    for (const read of [
      'resolveTemperLevel(profile, item.id)',
      'getTemperPurchaseEligibility(profile, item.id)',
      'getTemperCost(item, level)',
      'describeTemperRejection(eligibility.reason)',
      'TEMPER_MAX_LEVEL',
    ]) {
      expect(TEMPER_ROW, read).toContain(read);
    }
    // No cap literal and no price literal of its own.
    expect(TEMPER_ROW).not.toMatch(/\b(20|40|70|370|735)\b/);
    expect(TEMPER_ROW).toContain('data-temper-level={level}');
    expect(TEMPER_ROW).toContain('data-temper-rejection="1"');
  });

  test('the Smithing Workshop gate the row shows is the module\'s own, not a second rule', () => {
    // A fresh profile owns its starter weapon; the cheapest level is affordable.
    const fresh = purse(500);
    const gladius = fresh.equipped.weapon.id;
    expect(getTemperPurchaseEligibility(fresh, gladius)).toEqual({ ok: true });

    // Level 2 needs the workshop at L1 (P5) — the row prints that refusal.
    const one = purchaseTemper(fresh, gladius);
    expect(resolveTemperLevel(one, gladius)).toBe(1);
    expect(getTemperPurchaseEligibility(one, gladius)).toEqual({
      ok: false,
      reason: 'facility-required',
    });
    // With the workshop built it is offered again, at the catalogue's own price.
    const built: PlayerProfile = { ...one, facilities: { workshop: 1 } };
    expect(getTemperPurchaseEligibility(built, gladius)).toEqual({ ok: true });
    expect(getTemperCost(fresh.equipped.weapon, 1)).toBeGreaterThan(0);
    expect(TEMPER_MAX_LEVEL).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P6 §D — the Imperial Stable panel', () => {
  test('the racing section mounts it under the teams and passes the two callbacks', () => {
    expect(RACING_SECTION).toContain('<StablePanel');
    expect(RACING_SECTION).toContain('onBuyQuality={onBuyStableQuality}');
    expect(RACING_SECTION).toContain('onBuyConditioning={onBuyStableConditioning}');
    expect(RACING_SECTION.indexOf('{/* TEAMS */}')).toBeLessThan(
      RACING_SECTION.indexOf('<StablePanel')
    );
    // It charges nothing itself.
    for (const banned of ['purchaseStable', 'saveProfile', 'localStorage']) {
      expect(RACING_SECTION.includes(banned), banned).toBe(false);
    }
  });

  test('the panel states no rule: cap, prices and refusals all come from the module', () => {
    for (const read of [
      'resolveStableState(profile)',
      'getStableQuality(state.quality)',
      'getStableQualityEligibility(profile, nextQuality.grade)',
      'nextConditioningCost(profile)',
      'getStableConditioningEligibility(profile, nextLevel)',
      'MAX_CONDITIONING',
      'stableTeamSize(profile)',
      'describeStableRejection(',
    ]) {
      expect(STABLE_PANEL, read).toContain(read);
    }
    // The lock sentence names the facility requirement through the helper that owns it.
    expect(STABLE_PANEL).toContain('requiredStableForQuality(nextQuality.grade)');
    expect(STABLE_PANEL).toContain('requiredStableForConditioning(nextLevel)');
    for (const banned of ['saveProfile', 'localStorage', 'setProfile']) {
      expect(STABLE_PANEL.includes(banned), banned).toBe(false);
    }
    expect(STABLE_PANEL).not.toMatch(/\b\d{3,4}\s*[Gg]old/);
  });

  test('App is the writer, and a refused purchase never reaches the save', () => {
    expect(APP).toContain('purchaseStableQuality(profile, grade)');
    expect(APP).toContain('purchaseStableConditioning(profile, level)');
    expect(APP).toContain('if (!result.ok) return;');
    // Behaviour: one gold short of grade 1 buys nothing — the price is the
    // catalogue's own, read here rather than restated.
    const gradeOne = getStableQuality(1);
    if (!gradeOne) throw new Error('grade 1 missing from the stable catalogue');
    const refused = purchaseStableQuality(purse(gradeOne.price - 1), 1);
    expect(refused.ok).toBe(false);
    expect(purchaseStableQuality(purse(gradeOne.price), 1).ok).toBe(true);
    // …and the affordable path returns a new profile carrying only the purchase.
    const bought = purchaseStableConditioning(purse(400), 1);
    expect(bought.ok).toBe(true);
    if (bought.ok) expect(bought.profile.gold).toBe(400 - 120);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P6 §E — the facilities panel', () => {
  test('the hub mounts it above every tab, with the one callback', () => {
    expect(HUB).toContain('<FacilitiesPanel profile={playerProfile} onBuyFacility={onBuyFacility} />');
    const panel = HUB.indexOf('<FacilitiesPanel');
    for (const tab of ["activeTab === 'tournament'", "activeTab === 'gear'", "activeTab === 'stats'"]) {
      expect(HUB.indexOf(tab), tab).toBeGreaterThan(panel);
    }
  });

  test('the panel renders the catalogue\'s own next rung and owns no rule', () => {
    expect(FACILITIES_PANEL).toContain('FACILITIES.map((facility)');
    expect(FACILITIES_PANEL).toContain('nextFacilityLevel(profile, facility.id)');
    expect(FACILITIES_PANEL).toContain('getFacilityUpgradeEligibility(profile, facility.id)');
    expect(FACILITIES_PANEL).toContain('describeFacilityRejection(');
    expect(FACILITIES_PANEL).toContain('MAX_FACILITY_LEVEL');
    for (const banned of ['saveProfile', 'localStorage', 'setProfile', 'purchaseFacility']) {
      expect(FACILITIES_PANEL.includes(banned), banned).toBe(false);
    }
    // The rung it prints is the module's, for every building.
    const fresh = purse(5000);
    for (const facility of FACILITIES) {
      expect(resolveFacilities(fresh)[facility.id]).toBe(0);
    }
  });

  test('App writes only a successful purchase, and the in-order rule is the module\'s', () => {
    expect(APP).toContain('purchaseFacility(profile, id)');
    // Skipping a level is not purchasable at all; the panel can only ever offer
    // the next rung, which is why it renders `nextFacilityLevel`.
    const skipped = purchaseFacility(purse(5000), 'stable');
    expect(skipped.ok).toBe(true);
    if (skipped.ok) {
      // Buying the same building again buys its L2 — never a third.
      const second = purchaseFacility(skipped.profile, 'stable');
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(resolveFacilities(second.profile).stable).toBe(2);
        expect(purchaseFacility(second.profile, 'stable').ok).toBe(false);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P6 §F — no surface duplicates a rule or a save path', () => {
  test('every surface is free of a save path, a gold movement and a data-owning table', () => {
    for (const [file, source] of SURFACES) {
      for (const banned of ['saveProfile', 'loadSavedProfile', 'PROFILE_STORAGE_KEY', 'localStorage']) {
        expect(source.includes(banned), `${file} names ${banned}`).toBe(false);
      }
      expect(source.includes('setProfile'), `${file} calls setProfile`).toBe(false);
    }
  });

  test('no surface re-states a catalogue price', () => {
    const prices = [
      ...CHARIOT_PARTS.map((part) => part.price),
      ...FACILITIES.flatMap((facility) => facility.levels.map((level) => level.price)),
      500, 1200, 1400, 260, 520, 300, 580, 350, 700, 450, 180, 320, 240,
    ].filter((price) => price >= 100);
    for (const [file, source] of SURFACES) {
      for (const price of new Set(prices)) {
        // A price may appear inside a Tailwind token (`text-amber-300`,
        // `w-[300px]`) or a comment only; comments are already stripped, so
        // what is left is code. A standalone number is what a restated price
        // looks like, so the token boundary is what this checks.
        const standalone = new RegExp(`(?<![\\w-])${price}(?![\\w-])`);
        expect(standalone.test(source), `${file} contains the price ${price}`).toBe(false);
      }
    }
  });

  test('the hub carries every P6 callback from App down to the surface that asks', () => {
    for (const prop of [
      'onTemperItem',
      'onBuyStableQuality',
      'onBuyStableConditioning',
      'onBuyFacility',
    ]) {
      expect(HUB, prop).toContain(`${prop}?:`);
      expect(HUB, prop).toContain(`${prop}={${prop}}`);
      expect(APP, prop).toContain(`${prop}={`);
    }
    expect(HUB).toContain('onTemperItem={onTemperItem}');
    expect(HUB).toContain('onBuyStableQuality={onBuyStableQuality}');
    expect(HUB).toContain('onBuyStableConditioning={onBuyStableConditioning}');
  });
});
