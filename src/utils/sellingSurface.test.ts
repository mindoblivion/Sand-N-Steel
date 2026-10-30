/**
 * CORR-1 — the selling SURFACE and the purse wording (C-2 / C-6), rendered.
 *
 * Run with: `bun test src/utils/sellingSurface.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the Bazaar is a buying surface only: the real `ShopTab` markup carries
 *       no sell control at all, on an owned card or anywhere else (C-2);
 *   §B  the Armory is the one sell surface: the real `GearTab` markup puts a
 *       control on every carried spare, showing `sellPrice` plus the temper
 *       refund, and puts none on the card of the item being worn (C-2/C-4);
 *   §C  a spare of the worn id still sells — two gladii carried, one worn, gives
 *       exactly one spare card with its control (C-4);
 *   §D  the purse reads as a floor: the pre-fight panel and the Colosseum card
 *       say "from N Gold", never "+N Gold" (C-6).
 *
 * The components are rendered with `react-dom/server`; no browser is involved and
 * no storage is read or written.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PlayerProfile, WeaponItem, ArmorItem } from '../types/game';
import { createNewProfile } from '../services/storage';
import { ALL_WEAPONS, DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';
import { GearTab } from '../components/hub/GearTab';
import { ShopTab } from '../components/hub/ShopTab';
import { PreFightModal } from '../components/hub/PreFightModal';
import { TournamentTab } from '../components/hub/TournamentTab';

// ── Fixtures ───────────────────────────────────────────────────────────────

/** The equipped starter sword: sellPrice 20. */
const GLADIUS = DEFAULT_PLAYER_WEAPON;
/** The spare starter weapon: sellPrice 45. */
const SPEAR = ALL_WEAPONS[2];
/** Marcus, the tier-1 Colosseum opponent: `rewardGold` 35. */
const MARCUS = ALL_OPPONENTS[0];

const withInventory = (inventory: WeaponItem[], gold = 100): PlayerProfile => ({
  ...createNewProfile('Surface Tester'),
  gold,
  inventory,
  equipped: { weapon: inventory[0] },
});

const markupOf = (element: React.ReactElement): string => renderToStaticMarkup(element);

const textOf = (markup: string): string =>
  markup
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

const gearMarkup = (
  profile: PlayerProfile,
  onSellItem?: (item: WeaponItem | ArmorItem) => void
): string =>
  markupOf(
    React.createElement(GearTab, {
      profile,
      onEquipWeapon: () => {},
      onEquipArmor: () => {},
      ...(onSellItem ? { onSellItem } : {}),
    })
  );

// ══════════════════════════════════════════════════════════════════════════
describe('CORR-1 §A — the Bazaar sells nothing', () => {
  const shop = markupOf(
    React.createElement(ShopTab, {
      profile: withInventory([GLADIUS, SPEAR]),
      onBuyItem: () => {},
    })
  );

  test('no sell control appears anywhere in the catalogue', () => {
    expect(textOf(shop)).not.toMatch(/sell/i);
  });

  test('the catalogue still marks what the player already owns', () => {
    expect(textOf(shop)).toContain('Owned');
    expect(textOf(shop)).toContain('Imperial Smithing Forge');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('CORR-1 §B — the Armory is the one sell surface', () => {
  test('the worn weapon gets no control, the spare shows its effective value', () => {
    const markup = gearMarkup(withInventory([GLADIUS, SPEAR]), () => {});
    const text = textOf(markup);

    expect(text).toContain('Equipped');
    // One control, for the spear alone, at its own sellPrice (nothing tempered).
    expect(occurrences(text, 'Sell for')).toBe(1);
    expect(text).toContain(`Sell for ${SPEAR.sellPrice} Gold`);
    expect(text).not.toContain(`Sell for ${GLADIUS.sellPrice} Gold`);
  });

  test('the figure includes the temper refund, not the bare sellPrice', () => {
    const profile: PlayerProfile = {
      ...withInventory([GLADIUS, SPEAR]),
      temper: { [SPEAR.id]: 2 },
    };
    const text = textOf(gearMarkup(profile, () => {}));

    // 45 plus 25 % of two levels of temper gold is more than the bare sellPrice.
    const figure = Number((text.match(/Sell for (\d+) Gold/) || [])[1]);
    expect(figure).toBeGreaterThan(SPEAR.sellPrice);
  });

  test('an unwired Armory shows no sell control at all', () => {
    expect(textOf(gearMarkup(withInventory([GLADIUS, SPEAR])))).not.toMatch(/sell/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('CORR-1 §C — a spare of the worn id still sells (C-4)', () => {
  test('two gladii carried and one worn: exactly one spare card with its control', () => {
    const profile = withInventory([GLADIUS, { ...GLADIUS }, SPEAR]);
    const markup = gearMarkup(profile, () => {});
    const text = textOf(markup);

    expect(occurrences(text, 'Sell for')).toBe(2);
    expect(occurrences(text, `Sell for ${GLADIUS.sellPrice} Gold`)).toBe(1);
    // Exactly one worn control — the second gladius card is a spare.
    expect(occurrences(markup, '>Equipped<')).toBe(1);
    // The second copy is offered for equipping, not shown as already worn.
    expect(text).toContain('Equip');
  });

  test('only one gladius carried: no control for it while it is worn', () => {
    const text = textOf(gearMarkup(withInventory([GLADIUS]), () => {}));
    expect(text).not.toMatch(/sell/i);
    expect(text).toContain('Equipped');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('CORR-1 §D — the purse is a floor (C-6)', () => {
  test('the pre-fight panel says "from N Gold"', () => {
    const text = textOf(
      markupOf(
        React.createElement(PreFightModal, {
          opponent: MARCUS,
          onConfirm: () => {},
          onCancel: () => {},
        })
      )
    );

    expect(text).toContain(`from ${MARCUS.rewardGold} Gold`);
    expect(text).not.toContain(`+${MARCUS.rewardGold} Gold`);
  });

  test('the Colosseum card says "from N Gold"', () => {
    const text = textOf(
      markupOf(
        React.createElement(TournamentTab, {
          profile: withInventory([GLADIUS, SPEAR]),
          onSelectOpponent: () => {},
        })
      )
    );

    expect(text).toContain(`from ${MARCUS.rewardGold} Gold`);
    expect(text).not.toContain(`+${MARCUS.rewardGold} Gold`);
  });
});
