/**
 * L12C — the profile-commit wiring regression for App's own mutation handlers.
 *
 * ── WHY THIS SUITE EXISTS ─────────────────────────────────────────────────
 * `handleSellItem`, `handleEquipWeapon`, `handleEquipArmor` and
 * `handleAllocateStatPoint` used to build their update from the render's
 * `profile` state while the transactions (sell / purchase / train / rest /
 * visitor) read `profileRef.current`. `profile` is one render behind a second
 * click in the same tick, so a sale followed immediately by a visitor purchase
 * could rebuild the profile from the older snapshot and silently drop the
 * sale's gold and inventory.
 *
 * The hardening gave the four handlers the same shape as the transactions:
 * read the ref, apply the change, write the ref back, then `setProfile` +
 * `saveProfile`.
 *
 * ── WHAT THIS SUITE DOES NOT DO ───────────────────────────────────────────
 * There is no DOM renderer in this repo (no jsdom / testing-library), so `<App/>`
 * cannot be mounted. Instead of re-implementing the handlers next to the real
 * ones — which would test a copy — this suite **extracts each handler's own
 * source text out of `src/App.tsx`** and executes it, with the real
 * `sellItem` / `purchaseVisitorOffer` transactions and a `{ current }` ref that
 * behaves like a React ref: `setProfile` only records the commit and the ref is
 * updated by `render()`, exactly as the `useEffect` sync does in App. The
 * "same tick" scenario is therefore the one the handlers actually face.
 *
 *   §A  the extraction guard — the handlers really are App's source, each reads
 *       the ref before its transaction and writes it before the commit;
 *   §B  THE CRITICAL REGRESSION — a sale, then a visitor purchase in the same
 *       tick, with both changes present in the one saved profile;
 *   §C  refusals write nothing — no ref write, no `setProfile`, no `saveProfile`;
 *   §D  a duplicated visitor purchase charges once (the ref is what stops it);
 *   §E  equip-weapon / equip-armor / stat allocation commit the same way, and a
 *       sequence of them accumulates;
 *   §F  the control — with the ref writes spliced out (the pre-hardening
 *       handlers) the same sale + purchase loses the sale, so §B is sensitive.
 *
 * Run with: `bun test src/utils/profileMutationCommit.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { ALL_ARMORS, STARTING_SPARE_WEAPON, getItemById } from '../data/itemsDB';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { getVisitor } from '../data/visitors';
import { getSellValue, sellItem } from './selling';
import {
  purchaseVisitorOffer,
  resolveVisitorBargainPrice,
  type VisitorPurchaseResult,
} from './visitorPurchase';
import { readCompletedVisitors } from './visitorSchedule';

// ── App's real handler source ──────────────────────────────────────────────
const APP_SRC = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** The handler declarations this suite drives — all five L12C touches. */
const HANDLERS = [
  'handleSellItem',
  'handleEquipWeapon',
  'handleEquipArmor',
  'handleAllocateStatPoint',
  'handleVisitorPurchase',
] as const;

/** Pull one `const name = (...) => { … };` declaration out of App's source. */
function extractHandler(name: string): string {
  const needle = `const ${name} = `;
  const start = APP_SRC.indexOf(needle);
  if (start < 0) throw new Error(`${name} is not declared in App.tsx`);
  const bodyStart = APP_SRC.indexOf('{', APP_SRC.indexOf('=>', start));
  let depth = 0;
  for (let i = bodyStart; i < APP_SRC.length; i += 1) {
    if (APP_SRC[i] === '{') depth += 1;
    else if (APP_SRC[i] === '}') {
      depth -= 1;
      if (depth === 0) return APP_SRC.slice(start, i + 2);
    }
  }
  throw new Error(`${name}'s body is not balanced`);
}

const HANDLER_SOURCE = HANDLERS.map(extractHandler).join('\n');

/**
 * TypeScript in, plain JavaScript out. Bun's transpiler is used rather than a
 * hand-rolled type stripper, so the executed text is App's own code.
 */
function toJavaScript(source: string): string {
  // @ts-ignore — Bun is the test runtime
  return new Bun.Transpiler({ loader: 'ts' }).transformSync(
    `${source}\nreturn { ${HANDLERS.join(', ')} };`
  );
}

type Handlers = {
  handleSellItem: (item: { id: string }) => void;
  handleEquipWeapon: (weapon: unknown) => void;
  handleEquipArmor: (armor: unknown) => void;
  handleAllocateStatPoint: (stat: 'strength' | 'agility' | 'stamina' | 'defense') => void;
  handleVisitorPurchase: (visitorId: string) => VisitorPurchaseResult;
};

/**
 * The App-local pieces the handlers close over, modelled the way React wires
 * them: `setProfile` is a commit that is only visible through the ref on the
 * next render, so a handler that forgets its ref write is caught here.
 */
function createHarness(initial: PlayerProfile | null, source = HANDLER_SOURCE) {
  const ref: { current: PlayerProfile | null } = { current: initial };
  const renders: Array<PlayerProfile | null> = [];
  const saves: PlayerProfile[] = [];
  let pending: PlayerProfile | null = initial;

  const setProfile = (next: PlayerProfile | null) => {
    pending = next;
    renders.push(next);
  };
  const saveProfile = (profile: PlayerProfile) => {
    saves.push(profile);
  };
  const sounds = { playClick: () => {} };

  const factory = new Function(
    'sellItem',
    'purchaseVisitorOffer',
    'sounds',
    'profileRef',
    'setProfile',
    'saveProfile',
    toJavaScript(source)
  ) as (
    sellItemFn: typeof sellItem,
    purchaseFn: typeof purchaseVisitorOffer,
    soundsArg: typeof sounds,
    refArg: typeof ref,
    setProfileFn: typeof setProfile,
    saveProfileFn: typeof saveProfile
  ) => Handlers;

  const handlers = factory(sellItem, purchaseVisitorOffer, sounds, ref, setProfile, saveProfile);

  return {
    ref,
    handlers,
    renders,
    saves,
    /** A React re-render: the profile effect copies state into the ref. */
    render: () => {
      ref.current = pending;
    },
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────────
/**
 * Day 5: the Numidian bladesmith is in town, offering `dirk_desert` — canonical
 * 170, and since L15 charged at his own bargain rate (0.70 → **119**). These
 * assertions read the price from the shared resolver rather than restating it.
 */
const ARRIVAL_DAY = 5;
const BLADESMITH = 'numidian_bladesmith';
const BLADESMITH_ITEM = 'dirk_desert';
const BLADESMITH_BARGAIN = resolveVisitorBargainPrice(
  getItemById(BLADESMITH_ITEM),
  getVisitor(BLADESMITH)!.bargainRate
)!;
/** Day 1 has nobody in town. */
const EMPTY_DAY = 1;

/** The starter's spare weapon: carried, not equipped, so the market buys it. */
const SPARE = STARTING_SPARE_WEAPON;
const ARMOR = ALL_ARMORS[0];

const fresh = (gold = 5000, day = ARRIVAL_DAY): PlayerProfile =>
  ({ ...createNewProfile('L12C'), gold, city: { day } }) as PlayerProfile;

const goldOf = (profile: PlayerProfile | null): number => profile?.gold ?? -1;
const carries = (profile: PlayerProfile | null, id: string): boolean =>
  (profile?.inventory ?? []).some((owned) => owned?.id === id);

// ══════════════════════════════════════════════════════════════════════════
describe('§A the suite drives App own handlers, not a copy', () => {
  test('all five handlers are found verbatim in src/App.tsx', () => {
    for (const name of HANDLERS) {
      const source = extractHandler(name);
      expect(source.startsWith(`const ${name} = `)).toBe(true);
      expect(APP_SRC).toContain(source);
    }
  });

  test('each handler reads the committed ref before its transaction and writes it back', () => {
    for (const name of [
      'handleSellItem',
      'handleEquipWeapon',
      'handleEquipArmor',
      'handleAllocateStatPoint',
    ]) {
      const source = extractHandler(name);
      const read = source.indexOf('profileRef.current');
      const refWrite = source.indexOf('profileRef.current =');
      const setState = source.indexOf('setProfile(');
      const save = source.indexOf('saveProfile(');
      expect(read).toBeGreaterThanOrEqual(0);
      expect(refWrite).toBeGreaterThan(read);
      // The commit triad in its one order: ref, state, disk.
      expect(refWrite).toBeLessThan(setState);
      expect(setState).toBeLessThan(save);
    }
  });

  test('the visitor purchase handler reads the same ref', () => {
    const source = extractHandler('handleVisitorPurchase');
    expect(source).toContain('purchaseVisitorOffer(profileRef.current');
    expect(source.indexOf('profileRef.current =')).toBeLessThan(source.indexOf('saveProfile('));
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§B THE CRITICAL REGRESSION — a sale survives the next transaction', () => {
  test('sale then visitor purchase, in one tick, keeps both in the one saved profile', () => {
    const harness = createHarness(fresh());
    const saleValue = getSellValue(harness.ref.current, SPARE.id);
    expect(saleValue).toBeGreaterThan(0);

    // 1. A successful sale updates gold and inventory.
    harness.handlers.handleSellItem(SPARE);
    expect(harness.saves.length).toBe(1);
    const afterSale = harness.ref.current!;
    expect(goldOf(afterSale)).toBe(5000 + saleValue);
    expect(carries(afterSale, SPARE.id)).toBe(false);
    expect(harness.renders[0]).toBe(afterSale);

    // 2. An immediately subsequent visitor purchase reads that updated profile.
    const purchase = harness.handlers.handleVisitorPurchase(BLADESMITH);
    expect(purchase.ok).toBe(true);
    expect(harness.saves.length).toBe(2);

    // 3. The saved result carries BOTH transactions — neither is overwritten.
    const saved = harness.saves[1];
    const price = purchase.ok ? purchase.price : -1;
    // L15 — the canonical price is the base, and the bargain is what is charged.
    expect(getItemById(BLADESMITH_ITEM)!.price).toBe(170);
    expect(price).toBe(BLADESMITH_BARGAIN);
    expect(saved.gold).toBe(5000 + saleValue - price);
    expect(carries(saved, BLADESMITH_ITEM)).toBe(true);
    expect(carries(saved, SPARE.id)).toBe(false); // the sale was not undone
    expect(readCompletedVisitors(saved)).toEqual([BLADESMITH]);

    // The ref, the last render and the last save are the same profile.
    expect(harness.ref.current).toBe(saved);
    expect(harness.renders[harness.renders.length - 1]).toBe(saved);
  });

  test('the same sequence survives a render between the two clicks', () => {
    const harness = createHarness(fresh());
    const saleValue = getSellValue(harness.ref.current, SPARE.id);

    harness.handlers.handleSellItem(SPARE);
    harness.render();
    harness.handlers.handleVisitorPurchase(BLADESMITH);

    const saved = harness.saves[1];
    expect(saved.gold).toBe(5000 + saleValue - BLADESMITH_BARGAIN);
    expect(carries(saved, BLADESMITH_ITEM)).toBe(true);
    expect(carries(saved, SPARE.id)).toBe(false);
  });

  test('exactly one save per successful handler — no duplicate writes', () => {
    const harness = createHarness(fresh());
    harness.handlers.handleSellItem(SPARE);
    expect(harness.saves.length).toBe(1);
    expect(harness.renders.length).toBe(1);
    harness.handlers.handleVisitorPurchase(BLADESMITH);
    expect(harness.saves.length).toBe(2);
    expect(harness.renders.length).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§C failed transactions write nothing', () => {
  test('selling the equipped weapon is refused — no ref write, no render, no save', () => {
    const harness = createHarness(fresh());
    const before = harness.ref.current;

    harness.handlers.handleSellItem(before!.equipped.weapon);

    expect(harness.ref.current).toBe(before);
    expect(harness.renders.length).toBe(0);
    expect(harness.saves.length).toBe(0);
  });

  test('selling an item the profile does not carry is refused', () => {
    const harness = createHarness(fresh());
    const before = harness.ref.current;

    harness.handlers.handleSellItem({ id: 'not_an_item' });

    expect(harness.ref.current).toBe(before);
    expect(harness.saves.length).toBe(0);
  });

  test('a visitor purchase on a day with nobody in town is refused', () => {
    const harness = createHarness(fresh(5000, EMPTY_DAY));
    const before = harness.ref.current;

    const result = harness.handlers.handleVisitorPurchase(BLADESMITH);

    expect(result.ok).toBe(false);
    expect(harness.ref.current).toBe(before);
    expect(harness.saves.length).toBe(0);
    expect(goldOf(harness.ref.current)).toBe(5000);
  });

  test('an unaffordable offer is refused', () => {
    const harness = createHarness(fresh(50));
    const before = harness.ref.current;

    const result = harness.handlers.handleVisitorPurchase(BLADESMITH);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient-gold');
    expect(harness.ref.current).toBe(before);
    expect(harness.saves.length).toBe(0);
  });

  test('stat allocation with no points is refused', () => {
    const harness = createHarness({ ...fresh(), unspentStatPoints: 0 });
    const before = harness.ref.current;

    harness.handlers.handleAllocateStatPoint('strength');

    expect(harness.ref.current).toBe(before);
    expect(harness.saves.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§D a duplicated visitor purchase cannot charge twice', () => {
  test('the second call is refused and the purse is charged once', () => {
    const harness = createHarness(fresh());

    const first = harness.handlers.handleVisitorPurchase(BLADESMITH);
    const second = harness.handlers.handleVisitorPurchase(BLADESMITH);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('already-completed');

    // L15 — the single charge is the bladesmith's bargain, not the canonical price.
    const price = BLADESMITH_BARGAIN;
    expect(harness.saves.length).toBe(1);
    expect(goldOf(harness.ref.current)).toBe(5000 - price);
    expect(
      harness.ref.current!.inventory.filter((owned) => owned.id === BLADESMITH_ITEM).length
    ).toBe(1);
    expect(readCompletedVisitors(harness.ref.current!)).toEqual([BLADESMITH]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§E equipment and stat allocation commit the same way', () => {
  test('equipping a weapon updates the profile and saves once', () => {
    const harness = createHarness(fresh());

    harness.handlers.handleEquipWeapon(SPARE);

    expect(harness.saves.length).toBe(1);
    const saved = harness.saves[0];
    expect(saved.equipped.weapon.id).toBe(SPARE.id);
    expect(harness.ref.current).toBe(saved);
    expect(goldOf(saved)).toBe(5000);
  });

  test('equipping armor updates the profile and saves once', () => {
    const harness = createHarness(fresh());

    harness.handlers.handleEquipArmor(ARMOR);

    expect(harness.saves.length).toBe(1);
    const saved = harness.saves[0];
    expect(saved.equipped.helm?.id).toBe(ARMOR.id);
    expect(harness.ref.current).toBe(saved);
  });

  test('allocating a point moves the stat and spends the point', () => {
    const harness = createHarness(fresh());
    const before = harness.ref.current!;

    harness.handlers.handleAllocateStatPoint('strength');

    expect(harness.saves.length).toBe(1);
    const saved = harness.saves[0];
    expect(saved.unspentStatPoints).toBe(before.unspentStatPoints - 1);
    expect(saved.baseStats.strength).toBe(before.baseStats.strength + 1);
    expect(harness.ref.current).toBe(saved);
  });

  test('a sequence in one tick accumulates — armor, then a point, then a weapon', () => {
    const harness = createHarness(fresh());
    const before = harness.ref.current!;

    harness.handlers.handleEquipArmor(ARMOR);
    harness.handlers.handleAllocateStatPoint('agility');
    harness.handlers.handleEquipWeapon(SPARE);

    expect(harness.saves.length).toBe(3);
    const saved = harness.saves[2];
    expect(saved.equipped.helm?.id).toBe(ARMOR.id);
    expect(saved.equipped.weapon.id).toBe(SPARE.id);
    expect(saved.baseStats.agility).toBe(before.baseStats.agility + 1);
    expect(saved.unspentStatPoints).toBe(before.unspentStatPoints - 1);
    expect(harness.ref.current).toBe(saved);
  });

  test('equip then sell in one tick: the equipment change is not lost', () => {
    const harness = createHarness(fresh());
    const saleValue = getSellValue(harness.ref.current, SPARE.id);

    harness.handlers.handleEquipArmor(ARMOR);
    harness.handlers.handleSellItem(SPARE);

    const saved = harness.saves[1];
    expect(saved.equipped.helm?.id).toBe(ARMOR.id);
    expect(saved.inventory.some((owned) => owned.id === SPARE.id)).toBe(false);
    expect(saved.gold).toBe(5000 + saleValue);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§F control — without the ref write the sale is lost', () => {
  /** The pre-hardening handlers: the same source with the ref writes removed. */
  const LEGACY_SOURCE = HANDLER_SOURCE.replace(/^\s*profileRef\.current = [^;]+;\n/gm, '');

  test('the control really has no ref write left', () => {
    expect(LEGACY_SOURCE).not.toContain('profileRef.current =');
  });

  test('CONTROL: the same sale + purchase loses the sale gold and inventory', () => {
    const harness = createHarness(fresh(), LEGACY_SOURCE);
    // L15 — the charge is the bladesmith's bargain; the control is about the lost sale.
    const price = BLADESMITH_BARGAIN;

    harness.handlers.handleSellItem(SPARE);
    const purchase = harness.handlers.handleVisitorPurchase(BLADESMITH);

    expect(purchase.ok).toBe(true);
    const saved = harness.saves[harness.saves.length - 1];
    // The purchase rebuilt from the pre-sale profile: the sale's gold is gone …
    expect(goldOf(saved)).toBe(5000 - price);
    // … and the sold item is back, because the sale was never in the base.
    expect(carries(saved, SPARE.id)).toBe(true);
  });
});
