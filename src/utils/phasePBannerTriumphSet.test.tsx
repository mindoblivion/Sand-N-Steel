/**
 * P-BANNER — the TRIUMPH BANNER SET: the first chariot cosmetic priced in FAME.
 *
 * The design lists the banner set among the §3.6 fame sinks but never prices it;
 * the Director's ruling in the phase brief sets it at **500 FAME**, and that
 * literal is pinned HERE (from the brief, never read back out of the catalogue).
 *
 * What this suite holds:
 *   §A  the catalogue row and the CURRENCY EXTENSION — one fame-priced finish
 *       entry, every other part gold-priced (a sweep, so a second fame-priced
 *       row would have to be a deliberate act), and the row following the
 *       shipped finish shape with an inert/absent raceEffect;
 *   §B  the fame purchase path — 500 exactly, gold byte-identical, owned and
 *       equippable through the normal equip path, persistence across a real
 *       save/load, exactly-enough fame to zero, the refusal idiom (no profile
 *       returned, gold untouched), duplicate refusal, a gold purchase on the
 *       same profile leaving fame untouched, and a malformed fame balance
 *       buying nothing;
 *   §C  the legacy save — no banners owned resolves the finish slot to whatever
 *       it resolved to before (stock, or the finish the save already carried);
 *   §D  the stored record round-trip with the banners equipped, through the
 *       P6-widened `ChariotLoadout.equipped`;
 *   §E  the surfaces — the Triumphs page reads chariot ownership (no second
 *       record), the workshop renders the row through the same data-driven
 *       section with the price in FAME, and App routes the buy through its one
 *       chariot handler.
 *
 * The gold purchase path's own behaviour is pinned by phaseC8_66b / phaseP6; this
 * suite only re-checks the one interaction that matters for the extension: a
 * gold buy on the same profile leaves fame byte-identical.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { renderToStaticMarkup } from 'react-dom/server';

import { PlayerProfile } from '../types/game';
import { createNewProfile, loadSavedProfile, saveProfile } from '../services/storage';
import {
  CHARIOT_PARTS,
  TRIUMPH_BANNER_PART_ID,
  chariotPartCurrency,
  chariotPartsBySlot,
  getChariotPart,
} from '../data/chariotParts';
import {
  describeChariotRejection,
  equippedChariotPartId,
  equipChariotPart,
  getChariotEquipEligibility,
  getChariotPurchaseEligibility,
  ownsChariotPart,
  purchaseChariotPart,
  resolveChariotLoadout,
} from './chariotLoadout';
import { TriumphsPage } from '../components/hub/TriumphsPage';

/** The Director's ruling for this phase, pinned from the brief. */
const BANNER_PRICE = 500;

// ── storage shim: the shipped save functions read the browser's own localStorage ──
const _store = new Map<string, string>();
// @ts-ignore — a minimal, real localStorage for the save/load round trips
globalThis.localStorage = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    _store.set(key, value);
  },
  removeItem: (key: string) => {
    _store.delete(key);
  },
  clear: () => {
    _store.clear();
  },
} as unknown as Storage;

const code = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const WORKSHOP = code('../components/hub/ChariotWorkshopTab.tsx');
const APP = code('../App.tsx');

const markupOf = (element: Parameters<typeof renderToStaticMarkup>[0]): string =>
  renderToStaticMarkup(element);
const textOf = (markup: string): string =>
  markup
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A gladiator with a purse and a fame balance, so either currency can be tested. */
const fanProfile = (patch: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Banner Tester'),
  gold: 700,
  fame: 1200,
  ...patch,
});

beforeEach(() => {
  _store.clear();
});

// ══════════════════════════════════════════════════════════════════════════
describe('P-BANNER §A — the catalogue row and the currency extension', () => {
  test('the set is one finish-slot cosmetic priced in fame, shaped like the shipped finishes', () => {
    const part = getChariotPart(TRIUMPH_BANNER_PART_ID);
    expect(part).toBeDefined();
    if (!part) return;

    expect(part.id).toBe('finish_triumph_banners');
    expect(part.slot).toBe('finish');
    expect(part.partClass).toBe('cosmetic');
    expect(part.defaultOwned).toBe(false);
    expect(part.currency).toBe('fame');
    expect(part.price).toBe(BANNER_PRICE); // pinned from the brief, not from code
    expect(part.name).toContain('Triumph');
    expect(part.description.length).toBeGreaterThan(20);

    // The shipped finish row shape: a finish key the preview can apply, and
    // overrides naming the chariot's own materials.
    expect(part.finish).toBe('triumph');
    const overrides = part.overrides ?? [];
    expect(overrides.length).toBeGreaterThan(0);
    for (const override of overrides) {
      expect(['Wood', 'DarkWood', 'Bronze', 'Leather']).toContain(override.material);
      expect(override.color).toMatch(/^#[0-9a-f]{6}$/i);
    }

    // Cosmetic only: nothing in the row declares a race effect.
    expect(part.raceEffect).toBeUndefined();
  });

  test('the sweep: exactly ONE fame-priced entry exists, and every other part is gold-priced', () => {
    const famePriced = CHARIOT_PARTS.filter((p) => chariotPartCurrency(p) === 'fame');
    expect(famePriced.map((p) => p.id)).toEqual(['finish_triumph_banners']);

    for (const part of CHARIOT_PARTS) {
      if (part.id === 'finish_triumph_banners') continue;
      // Gold is the absent-field default, so the shipped rows are untouched.
      expect(part.currency, part.id).toBeUndefined();
      expect(chariotPartCurrency(part), part.id).toBe('gold');
    }

    // The row is appended, so the shipped prefix is what it was.
    expect(CHARIOT_PARTS).toHaveLength(16);
    expect(CHARIOT_PARTS[CHARIOT_PARTS.length - 1].id).toBe('finish_triumph_banners');
    expect(chariotPartsBySlot('finish').at(-1)?.id).toBe('finish_triumph_banners');
  });

  test('the copy never abbreviates Triumphs to "Laurel" and promises no racing effect', () => {
    const copy = CHARIOT_PARTS.map((p) => `${p.name} ${p.description}`).join(' ');
    expect(/laurel/i.test(copy)).toBe(false);
    expect(/speed|handling|acceleration|lap time/i.test(copy)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P-BANNER §B — buying the set with fame', () => {
  test('fame −500 exactly, gold byte-identical, owned and equippable as the finish', () => {
    const before = fanProfile();
    const goldBefore = before.gold;
    const fameBefore = before.fame;

    const bought = purchaseChariotPart(before, TRIUMPH_BANNER_PART_ID);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    const after = bought.profile;

    expect(after.fame).toBe(fameBefore - BANNER_PRICE);
    expect(after.fame).toBe(700);
    expect(after.gold).toBe(goldBefore);
    expect(after.gold).toBe(700);
    expect(ownsChariotPart(after, TRIUMPH_BANNER_PART_ID)).toBe(true);

    // Buying never equips; the normal equip path fits it.
    expect(equippedChariotPartId(after, 'finish')).toBe('finish_stock');
    expect(getChariotEquipEligibility(after, TRIUMPH_BANNER_PART_ID)).toEqual({ ok: true });
    const equipped = equipChariotPart(after, TRIUMPH_BANNER_PART_ID, 'finish');
    expect(equipped.ok).toBe(true);
    if (!equipped.ok) return;
    expect(equippedChariotPartId(equipped.profile, 'finish')).toBe(TRIUMPH_BANNER_PART_ID);
    expect(equipped.profile.gold).toBe(goldBefore);
    expect(equipped.profile.fame).toBe(fameBefore - BANNER_PRICE);

    // Nothing was mutated in place.
    expect(before.fame).toBe(fameBefore);
    expect(before.gold).toBe(goldBefore);
    expect(before.chariot).toBeUndefined();
  });

  test('it persists across a real save/load, and the finish is the stored slot', () => {
    const bought = purchaseChariotPart(fanProfile(), TRIUMPH_BANNER_PART_ID);
    if (!bought.ok) throw new Error('purchase should succeed');
    const equipped = equipChariotPart(bought.profile, TRIUMPH_BANNER_PART_ID);
    if (!equipped.ok) throw new Error('equip should succeed');

    saveProfile(equipped.profile);
    const loaded = loadSavedProfile() as PlayerProfile;

    expect(loaded).not.toBeNull();
    expect(loaded.fame).toBe(1200 - BANNER_PRICE);
    expect(loaded.gold).toBe(700);
    expect(ownsChariotPart(loaded, TRIUMPH_BANNER_PART_ID)).toBe(true);
    expect(resolveChariotLoadout(loaded).equipped.finish).toBe(TRIUMPH_BANNER_PART_ID);
    // The P6-widened stored record carries the finish slot, and only the
    // non-stock slots (the wheels stay omitted).
    expect(loaded.chariot!.equipped).toEqual({ finish: TRIUMPH_BANNER_PART_ID });
    expect(loaded.chariot!.owned).toEqual(
      expect.arrayContaining([TRIUMPH_BANNER_PART_ID])
    );
    // One record, under the shipped key — no second storage.
    expect(_store.size).toBe(1);
  });

  test('exactly enough fame buys to zero and no further', () => {
    const exact = fanProfile({ fame: BANNER_PRICE });
    const bought = purchaseChariotPart(exact, TRIUMPH_BANNER_PART_ID);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.profile.fame).toBe(0);
    expect(bought.profile.gold).toBe(exact.gold);

    // A second copy is refused for ownership, not for the empty balance.
    const again = purchaseChariotPart(bought.profile, TRIUMPH_BANNER_PART_ID);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('already-owned');
  });

  test('one fame short refuses with NO profile returned and gold untouched', () => {
    const short = fanProfile({ fame: BANNER_PRICE - 1 });
    const snapshot = JSON.stringify(short);

    expect(getChariotPurchaseEligibility(short, TRIUMPH_BANNER_PART_ID)).toEqual({
      ok: false,
      reason: 'insufficient-fame',
    });

    const result = purchaseChariotPart(short, TRIUMPH_BANNER_PART_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('insufficient-fame');
    // The house refusal idiom: no profile at all, so nothing can reach a writer.
    expect(Object.keys(result).sort()).toEqual(['ok', 'reason']);
    expect(describeChariotRejection('insufficient-fame')).toBe('Not enough fame.');

    // The caller's own object is untouched, gold included.
    expect(JSON.stringify(short)).toBe(snapshot);
    expect(short.fame).toBe(BANNER_PRICE - 1);
    expect(short.gold).toBe(700);
    expect(short.chariot).toBeUndefined();
  });

  test('buying twice refuses and the second refusal charges nothing', () => {
    const first = purchaseChariotPart(fanProfile(), TRIUMPH_BANNER_PART_ID);
    if (!first.ok) throw new Error('first purchase should succeed');
    const fameAfterFirst = first.profile.fame;
    const goldAfterFirst = first.profile.gold;

    const second = purchaseChariotPart(first.profile, TRIUMPH_BANNER_PART_ID);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('already-owned');
    expect(first.profile.fame).toBe(fameAfterFirst);
    expect(first.profile.gold).toBe(goldAfterFirst);
    // …and only one owned entry exists.
    const owned = resolveChariotLoadout(first.profile).owned.filter(
      (id) => id === TRIUMPH_BANNER_PART_ID
    );
    expect(owned).toHaveLength(1);
  });

  test('a gold purchase on the same profile leaves fame byte-identical', () => {
    const before = fanProfile({ gold: 5000, fame: 1200 });
    const bought = purchaseChariotPart(before, 'finish_gilded');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.profile.gold).toBe(5000 - 320);
    expect(bought.profile.fame).toBe(1200);
  });

  test('a malformed fame balance can afford nothing', () => {
    for (const fame of [NaN, Infinity, undefined as unknown as number]) {
      const broken = fanProfile({ fame });
      expect(getChariotPurchaseEligibility(broken, TRIUMPH_BANNER_PART_ID)).toEqual({
        ok: false,
        reason: 'insufficient-fame',
      });
      expect(purchaseChariotPart(broken, TRIUMPH_BANNER_PART_ID).ok).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P-BANNER §C — a legacy save resolves the finish slot to its previous state', () => {
  test('no chariot field: stock finish, banners not owned', () => {
    const legacy = fanProfile({ fame: 0, gold: 100 });
    expect(legacy.chariot).toBeUndefined();

    expect(ownsChariotPart(legacy, TRIUMPH_BANNER_PART_ID)).toBe(false);
    expect(resolveChariotLoadout(legacy).equipped.finish).toBe('finish_stock');
    expect(getChariotPurchaseEligibility(legacy, TRIUMPH_BANNER_PART_ID)).toEqual({
      ok: false,
      reason: 'insufficient-fame',
    });
  });

  test('a save already wearing another finish keeps exactly that finish', () => {
    const withGilded = fanProfile({
      fame: 0,
      chariot: { owned: ['finish_gilded'], equipped: { finish: 'finish_gilded' } },
    });
    expect(ownsChariotPart(withGilded, TRIUMPH_BANNER_PART_ID)).toBe(false);
    expect(resolveChariotLoadout(withGilded).equipped.finish).toBe('finish_gilded');
  });

  test('a legacy resolve writes nothing back onto the save', () => {
    const legacy = fanProfile({ chariot: { owned: ['finish_oxblood'], equipped: {} } });
    const snapshot = JSON.stringify(legacy);
    resolveChariotLoadout(legacy);
    ownsChariotPart(legacy, TRIUMPH_BANNER_PART_ID);
    expect(JSON.stringify(legacy)).toBe(snapshot);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P-BANNER §D — the stored record round-trips with the banners equipped', () => {
  test('JSON round trip keeps the finish and the rest of the widened record', () => {
    let profile = fanProfile({ gold: 5000 });
    const banner = purchaseChariotPart(profile, TRIUMPH_BANNER_PART_ID);
    if (!banner.ok) throw new Error('banners purchase should succeed');
    const fittedBanner = equipChariotPart(banner.profile, TRIUMPH_BANNER_PART_ID);
    if (!fittedBanner.ok) throw new Error('banners equip should succeed');
    const wheels = purchaseChariotPart(fittedBanner.profile, 'wheels_reinforced');
    if (!wheels.ok) throw new Error('wheels purchase should succeed');
    const fitted = equipChariotPart(wheels.profile, 'wheels_reinforced');
    if (!fitted.ok) throw new Error('wheels equip should succeed');

    const resolved = resolveChariotLoadout(fitted.profile).equipped;
    expect(resolved.finish).toBe(TRIUMPH_BANNER_PART_ID);
    expect(resolved.wheels).toBe('wheels_reinforced');

    const stored = JSON.parse(JSON.stringify(fitted.profile)) as PlayerProfile;
    expect(stored.chariot!.equipped).toEqual({
      wheels: 'wheels_reinforced',
      finish: TRIUMPH_BANNER_PART_ID,
    });
    expect(resolveChariotLoadout(stored).equipped).toEqual(resolved);
    expect(stored.fame).toBe(1200 - BANNER_PRICE);
    expect(stored.gold).toBe(5000 - 450);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P-BANNER §E — the surfaces', () => {
  test('the Triumphs page shows the set once bought, read from chariot ownership alone', () => {
    const bought = purchaseChariotPart(fanProfile(), TRIUMPH_BANNER_PART_ID);
    if (!bought.ok) throw new Error('purchase should succeed');

    const markup = markupOf(<TriumphsPage profile={bought.profile} />);
    expect(markup).toContain('data-triumph-banners');
    expect(markup).toContain('data-banners-owned="true"');
    expect(textOf(markup)).toContain('Triumph Banners');
    // The naming law (C1d): the umbrella is never abbreviated to "Laurel".
    expect(textOf(markup).toLowerCase()).not.toContain('laurel');
    // No second ownership record was created by the read.
    expect(bought.profile.laurels).toBeUndefined();

    // Unowned: the row is not printed at all.
    const fresh = markupOf(<TriumphsPage profile={fanProfile()} />);
    expect(fresh).not.toContain('data-triumph-banners');
    expect(textOf(fresh)).not.toContain('Triumph Banners');
  });

  test('the workshop renders it through the data-driven finish section, priced in FAME', () => {
    // No special case for this part: the surface names no part id.
    for (const part of CHARIOT_PARTS) {
      expect(WORKSHOP.includes(`'${part.id}'`), part.id).toBe(false);
    }
    // …and it reads the currency, not a hard-coded row.
    expect(WORKSHOP).toContain('chariotPartCurrency(part)');
    expect(WORKSHOP).toContain("currency === 'fame' ? 'Fame' : 'Gold'");
    expect(WORKSHOP).toContain('Insufficient fame');
    expect(WORKSHOP).toContain('onBuyPart(part.id)');
    // The price prints its own currency, and a fame price carries no gold styling:
    // the fame badge is violet, the gold badge keeps the amber/yellow palette.
    expect(WORKSHOP).toContain("${part.price} ${currency === 'fame' ? 'Fame' : 'Gold'}");
    expect(WORKSHOP).toContain('text-yellow-400 bg-amber-950 border-amber-700');
    const violetAt = WORKSHOP.indexOf('text-violet-300');
    expect(violetAt).toBeGreaterThan(-1);
    const badge = WORKSHOP.slice(Math.max(0, violetAt - 220), violetAt);
    expect(badge).toContain("currency === 'fame'");
    expect(badge).not.toContain('text-yellow-400');
  });

  test('App routes the buy through its one chariot handler, which holds no currency logic', () => {
    const start = APP.indexOf('const handleBuyChariotPart');
    expect(start).toBeGreaterThan(-1);
    const body = APP.slice(start, APP.indexOf('};', start) + 2);
    expect(body).toContain('purchaseChariotPart(profile, partId)');
    expect(body).toContain('setProfile(result.profile);');
    expect(body).toContain('saveProfile(result.profile);');
    // The transaction owns the currency; the handler only persists.
    expect(body).not.toContain('fame');
    // And the workshop is still handed that one handler.
    expect(APP).toContain('onBuyChariotPart={handleBuyChariotPart}');
  });
});
