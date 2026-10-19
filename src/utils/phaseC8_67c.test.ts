/**
 * Phase C-8.67C — the Racing Configuration UI, its wiring and the transactions
 * behind it.
 *
 * Run with: `bun test src/utils/phaseC8_67c.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  reachability and scope — the section is mounted by the Armory's own
 *       subview (the one the Imperial Stable opens), it is composed by `GearTab`
 *       rather than bolted into the workshop, no new top-level screen, tab or
 *       subview exists, App routes buys and selections through the pure C-8.67B
 *       helpers, the section owns no mutation path, and no racing gameplay (loop,
 *       laps, countdown, physics, horse asset) was added anywhere;
 *   §B  the rendered cards — the real component is rendered with
 *       `react-dom/server` for a legacy save, a poor purse, an affordable purse,
 *       an unlocked Triga and a fully unlocked profile, and each card's name,
 *       horse count, price, status and control state is read back off the markup;
 *   §C  App's two handlers — scoped source checks that they call the pure helpers,
 *       bail on a refusal and write only through the existing `saveProfile()`;
 *   §D  the transactions, driven end to end — Triga deducts exactly 750 once and
 *       survives a reload, Quadra needs Triga and then deducts exactly 1,500 once,
 *       insufficient funds and locked selections are refused with the caller's
 *       profile byte-identical, a selection persists the horse count, Biga stays
 *       the fallback for an invalid stored selection, repeated clicks cannot
 *       double-charge, and chariot wheel/finish ownership stays independent;
 *   §E  the dev-only transaction harness — its production gate, its isolated
 *       storage (exercised against recording fake stores), its bounded `?gold=`
 *       purse, and the fact that it drives the shipping UI.
 *
 * The save used throughout is `createNewProfile()` — the game's own factory — plus
 * an explicit purse, written through the real `saveProfile()` / `loadSavedProfile()`
 * pair into an in-memory store.  **A browser's real `localStorage` is never read or
 * written by this file**, and no cloud save is touched.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── In-memory localStorage polyfill (bun's runtime has no DOM) ─────────────
const _store = new Map<string, string>();
const localStorageShim = {
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
};
// @ts-ignore — assign to global before storage.ts is used
globalThis.localStorage = localStorageShim;

import { PlayerProfile } from '../types/game';
import { createNewProfile, saveProfile, loadSavedProfile } from '../services/storage';
import { purchaseChariotPart } from './chariotLoadout';
import {
  RACING_CONFIGS,
  describeRacingRejection,
  purchaseRacingConfig,
  resolveRacingState,
  selectRacingConfig,
} from './racingProgression';
import { RacingConfigSection } from '../components/hub/RacingConfigSection';
import { HUB_LOCATIONS, getNearbyHubLocation } from './cityCollisions';
import * as harnessModule from '../components/dev/RacingConfigHarness';
import {
  DEFAULT_HARNESS_RACING_GOLD,
  HARNESS_RACING_PROFILE_KEY,
  MAX_HARNESS_RACING_GOLD,
  loadHarnessRacingProfile,
  readRacingSeedGold,
  saveHarnessRacingProfile,
} from '../components/dev/RacingConfigHarness';

// ── Sources ────────────────────────────────────────────────────────────────
const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const APP = code('../App.tsx');
const MAIN = code('../main.tsx');
const GEAR_TAB = code('../components/hub/GearTab.tsx');
const HUB = code('../components/hub/GladiatorSchoolHub.tsx');
const WORKSHOP = code('../components/hub/ChariotWorkshopTab.tsx');
const SECTION = code('../components/hub/RacingConfigSection.tsx');
const HARNESS = code('../components/dev/RacingConfigHarness.tsx');

/** The player's own save key — the one the harness must never touch. */
const REAL_PROFILE_KEY = 'sand_and_steel_gladiator_save_v2';

// ── Fixtures ───────────────────────────────────────────────────────────────
/** A fresh gladiator with the purse a test needs — the game's own factory. */
const profileWithGold = (gold: number): PlayerProfile => ({
  ...createNewProfile('Tester'),
  gold,
});

beforeEach(() => {
  _store.clear();
});

// ── §B machinery: read the real component's rendered markup ────────────────
const markupFor = (profile: PlayerProfile): string =>
  renderToStaticMarkup(
    React.createElement(RacingConfigSection, {
      profile,
      onBuyConfig: () => {},
      onSelectConfig: () => {},
    })
  );

/** One card, from its own anchor to the next one. */
const cardOf = (markup: string, id: string): string => {
  const start = markup.indexOf(`data-racing-config="${id}"`);
  if (start < 0) throw new Error(`no ${id} card in the markup`);
  const next = markup.indexOf('data-racing-config="', start + 5);
  return markup.slice(start, next === -1 ? markup.length : next);
};

/** The card's control's opening tag — where `disabled` and the action live. */
const controlTag = (card: string): string => {
  const start = card.indexOf('<button');
  if (start < 0) throw new Error('no control in this card');
  return card.slice(start, card.indexOf('>', start) + 1);
};

/** The card's visible text, icons and markup stripped. */
const textOf = (fragment: string): string =>
  fragment
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ── §E machinery: recording fake stores (the C-8.66D technique) ────────────
interface FakeStore {
  data: Map<string, string>;
  reads: string[];
  writes: string[];
}

const makeStore = (seed?: Record<string, string>): FakeStore => ({
  data: new Map(Object.entries(seed ?? {})),
  reads: [],
  writes: [],
});

const asStorage = (store: FakeStore): Storage =>
  ({
    get length() {
      return store.data.size;
    },
    clear: () => store.data.clear(),
    getItem: (key: string) => {
      store.reads.push(key);
      return store.data.has(key) ? (store.data.get(key) as string) : null;
    },
    key: (index: number) => [...store.data.keys()][index] ?? null,
    removeItem: (key: string) => store.data.delete(key),
    setItem: (key: string, value: string) => {
      store.writes.push(key);
      store.data.set(key, String(value));
    },
  }) as Storage;

const REAL_WINDOW = (globalThis as unknown as { window?: unknown }).window;

const installWindow = (options: { session?: FakeStore; local?: FakeStore; search?: string }) => {
  const fake: Record<string, unknown> = { location: { search: options.search ?? '' } };
  if (options.session) fake.sessionStorage = asStorage(options.session);
  if (options.local) fake.localStorage = asStorage(options.local);
  (globalThis as unknown as { window: unknown }).window = fake;
};

afterAll(() => {
  if (REAL_WINDOW === undefined) delete (globalThis as unknown as { window?: unknown }).window;
  else (globalThis as unknown as { window: unknown }).window = REAL_WINDOW;
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.67C §A — reachable from the Imperial Stable route, and nothing else moved', () => {
  test('the Imperial Stable still opens the Armory subview the section lives in', () => {
    const stable = HUB_LOCATIONS.find((location) => location.id === 'stable');
    expect(stable?.tabKey).toBe('gear');
    expect(stable?.subTab).toBe('chariot');
    expect(getNearbyHubLocation([26, 0, 10])?.id).toBe('stable');
    // The subview itself is unchanged, and the section is what GearTab adds to it.
    expect(GEAR_TAB).toContain("gearView === 'chariot'");
    expect(GEAR_TAB).toContain('RacingConfigSection');
    // The section itself names the feature the player is looking for.
    expect(SECTION).toContain('Racing Configuration');
  });

  test('the section is mounted inside the workshop subview, with its two callbacks', () => {
    const subview = GEAR_TAB.slice(
      GEAR_TAB.indexOf("gearView === 'chariot'"),
      GEAR_TAB.indexOf('<RacingConfigSection')
    );
    // The workshop renders first and the racing section right after it, both in
    // the same branch: the stable's own route reaches it with no extra click.
    expect(subview).toContain('<ChariotWorkshopTab');
    expect(GEAR_TAB).toContain('onBuyConfig={onBuyRacingConfig}');
    expect(GEAR_TAB).toContain('onSelectConfig={onSelectRacingConfig}');
    // …and the props are declared and passed on by the hub.
    expect(GEAR_TAB).toContain('onBuyRacingConfig?:');
    expect(GEAR_TAB).toContain('onSelectRacingConfig?:');
    expect(HUB).toContain('onBuyRacingConfig={onBuyRacingConfig}');
    expect(HUB).toContain('onSelectRacingConfig={onSelectRacingConfig}');
    expect(APP).toContain('onBuyRacingConfig={handleBuyRacingConfig}');
    expect(APP).toContain('onSelectRacingConfig={handleSelectRacingConfig}');
  });

  test('the workshop component is untouched: it neither knows nor mounts the section', () => {
    // Horse-count progression is composed beside the cosmetic catalogue, never
    // inside it — the section is GearTab's, so the workshop keeps its own props
    // and its own file (its only mentions of racing are the pre-existing prose
    // about fit and finish).
    expect(WORKSHOP).not.toContain('RacingConfigSection');
    expect(WORKSHOP).not.toContain('Racing Configuration');
    expect(WORKSHOP).not.toContain('onBuyRacingConfig');
    expect(WORKSHOP).not.toContain('racingProgression');
  });

  test('no new top-level screen, tab or subview was created', () => {
    // App's screen union and the hub's tab union are exactly the shipped ones.
    expect(APP).toContain(
      "type GameScreen = 'title' | 'create_character' | 'city_3d' | 'hub_2d' | 'duel';"
    );
    expect(APP).not.toContain("'racing'");
    const tabs = HUB.match(/key: '(tournament|training|shop|gear|stats)'/g) ?? [];
    expect(tabs).toHaveLength(5);
    // The Armory keeps its two subviews; the racing section rides inside one.
    const views = GEAR_TAB.match(/key: '(armory|chariot)'/g) ?? [];
    expect(views.sort()).toEqual(["key: 'armory'", "key: 'chariot'"]);
    expect(GEAR_TAB).not.toContain("key: 'racing'");
  });

  test('App buys and selects only through the pure C-8.67B helpers', () => {
    expect(APP).toContain("from './utils/racingProgression'");
    expect(APP).toContain('purchaseRacingConfig');
    expect(APP).toContain('selectRacingConfig');
    // The two handlers, scoped: pure helper → refusal bail → state → save.
    const handlers = APP.slice(
      APP.indexOf('const handleBuyRacingConfig'),
      APP.indexOf('const handleTrainStat')
    );
    expect(handlers).toContain('purchaseRacingConfig(profile, horses)');
    expect(handlers).toContain('selectRacingConfig(profile, horses)');
    expect(handlers).toContain('if (!result.ok) return;');
    expect(handlers).toContain('saveProfile(result.profile)');
    expect(handlers.split('saveProfile(result.profile)')).toHaveLength(3);
    // Neither handler touches the balance itself — the helper moves the purse.
    expect(handlers).not.toContain('gold');
  });

  test('the section owns no mutation path and reads no storage', () => {
    expect(SECTION).toContain('getRacingPurchaseEligibility');
    expect(SECTION).toContain('getRacingSelectionEligibility');
    expect(SECTION).toContain('resolveRacingState');
    expect(SECTION).toContain('onBuyConfig?.(config.horses)');
    expect(SECTION).toContain('onSelectConfig?.(config.horses)');
    expect(SECTION).not.toContain('purchaseRacingConfig');
    expect(SECTION).not.toContain('selectRacingConfig');
    expect(SECTION).not.toContain('saveProfile');
    expect(SECTION).not.toContain('localStorage');
    expect(SECTION).not.toContain('sessionStorage');
    // It reads the profile and the catalogue — nothing else.
    expect(SECTION.match(/from '[^']+'/g)?.sort()).toEqual([
      "from '../../audio/soundEffects'",
      "from '../../types/game'",
      "from '../../utils/racingProgression'",
      "from 'lucide-react'",
      "from 'react'",
    ]);
  });

  test('nothing about racing gameplay was added — no loop, no laps, no horse asset', () => {
    for (const source of [SECTION, HARNESS]) {
      expect(source).not.toMatch(/\blap\b|countdown|physics|useFrame|horse\.glb/i);
    }
    // The section and the harness touch no combat stat.
    for (const source of [SECTION, HARNESS]) {
      expect(source).not.toContain('baseStats');
      expect(source).not.toContain('calculateTotalStats');
      expect(source).not.toContain('damageLight');
    }
    // The catalogue is still the three teams the C-8.67B record audited.
    expect(RACING_CONFIGS.map((config) => [config.id, config.horses, config.price])).toEqual([
      ['biga', 2, 0],
      ['triga', 3, 750],
      ['quadra', 4, 1500],
    ]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.67C §B — the three cards, rendered from the real component', () => {
  test('a legacy save shows Biga selected, with Triga and Quadra locked', () => {
    const markup = markupFor(profileWithGold(100));
    const biga = cardOf(markup, 'biga');
    const triga = cardOf(markup, 'triga');
    const quadra = cardOf(markup, 'quadra');

    expect(textOf(biga)).toContain('Biga');
    expect(textOf(biga)).toContain('2 Horses');
    expect(textOf(biga)).toContain('Free');
    expect(textOf(biga)).toContain('Selected');
    expect(textOf(biga)).toContain('Your selected team');
    // Biga is always available: its control is the selection, already active.
    expect(controlTag(biga)).toContain('data-racing-action="select"');
    expect(controlTag(biga)).toContain('disabled');

    expect(textOf(triga)).toContain('Triga');
    expect(textOf(triga)).toContain('3 Horses');
    expect(textOf(triga)).toContain('750 Gold');
    expect(textOf(triga)).toContain('Locked');
    expect(controlTag(triga)).toContain('data-racing-action="buy"');
    // 100 gold cannot buy a 750-gold team: the control is disabled and says so.
    expect(controlTag(triga)).toContain('disabled');
    expect(textOf(triga)).toContain('Not enough gold — 750 needed');

    expect(textOf(quadra)).toContain('Quadra');
    expect(textOf(quadra)).toContain('4 Horses');
    expect(textOf(quadra)).toContain('1500 Gold');
    expect(textOf(quadra)).toContain('Locked');
    expect(controlTag(quadra)).toContain('data-racing-action="buy"');
    expect(controlTag(quadra)).toContain('disabled');
    // The prerequisite is named, not just refused.
    expect(textOf(quadra)).toContain('A Quadra team needs the Triga team first');
    // A locked team offers no selection control at all.
    expect(quadra).not.toContain('data-racing-action="select"');
    expect(triga).not.toContain('data-racing-action="select"');
  });

  test('an affordable, still-locked Triga is buyable', () => {
    const markup = markupFor(profileWithGold(2000));
    const triga = cardOf(markup, 'triga');
    expect(textOf(triga)).toContain('Available for 750 gold');
    expect(controlTag(triga)).toContain('data-racing-action="buy"');
    expect(controlTag(triga)).not.toContain('disabled');
    expect(textOf(triga)).toContain('Buy (750)');
    // Quadra is still prerequisite-locked, and still unaffordable-proof.
    expect(controlTag(cardOf(markup, 'quadra'))).toContain('disabled');
  });

  test('an unlocked Triga becomes selectable, and unlocks Quadra for purchase', () => {
    const profile = {
      ...profileWithGold(1600),
      racing: { unlocked: [3], selected: 2 },
    } as PlayerProfile;
    const markup = markupFor(profile);
    const triga = cardOf(markup, 'triga');
    const quadra = cardOf(markup, 'quadra');

    expect(textOf(triga)).toContain('Unlocked');
    expect(textOf(triga)).toContain('Unlocked — select it at no cost');
    expect(controlTag(triga)).toContain('data-racing-action="select"');
    expect(controlTag(triga)).not.toContain('disabled');
    expect(textOf(triga)).toContain('Select team');

    expect(textOf(quadra)).toContain('Locked');
    expect(textOf(quadra)).toContain('Available for 1500 gold');
    expect(controlTag(quadra)).toContain('data-racing-action="buy"');
    expect(controlTag(quadra)).not.toContain('disabled');
    expect(textOf(quadra)).toContain('Buy (1500)');

    // Biga is still selected — buying never selects.
    expect(textOf(cardOf(markup, 'biga'))).toContain('Your selected team');
  });

  test('the selected team reads as selected, and the others stay switchable', () => {
    const profile = {
      ...profileWithGold(2500),
      racing: { unlocked: [3, 4], selected: 4 },
    } as PlayerProfile;
    const markup = markupFor(profile);
    const quadra = cardOf(markup, 'quadra');
    expect(textOf(quadra)).toContain('Selected');
    expect(textOf(quadra)).toContain('Your selected team');
    expect(controlTag(quadra)).toContain('data-racing-action="select"');
    expect(controlTag(quadra)).toContain('disabled');

    const biga = cardOf(markup, 'biga');
    expect(textOf(biga)).toContain('Unlocked');
    expect(controlTag(biga)).not.toContain('disabled');
  });

  test('the section says a selection is a saved preference, not a race', () => {
    const markup = markupFor(profileWithGold(100));
    expect(markup).toContain('Racing Configuration');
    expect(markup).toContain('does not start a race');
    expect(markup).toContain('racing gameplay is not available yet');
    expect(markup).toContain('never changes your combat stats');
  });

  test('an invalid stored selection falls back to Biga in the UI too', () => {
    const orphan = { ...profileWithGold(2500), racing: { selected: 4 } } as PlayerProfile;
    const markup = markupFor(orphan);
    expect(resolveRacingState(orphan)).toEqual({ unlocked: [2], selected: 2, horses: 2 });
    expect(textOf(cardOf(markup, 'biga'))).toContain('Your selected team');
    expect(textOf(cardOf(markup, 'quadra'))).toContain('Locked');
    expect(controlTag(cardOf(markup, 'quadra'))).toContain('disabled');
  });

  test('every refusal the helpers can name is explained in words, not a status code', () => {
    // The card only ever shows the short, player-facing reason.
    for (const reason of ['prerequisite-locked', 'insufficient-gold', 'not-unlocked'] as const) {
      const text = describeRacingRejection(reason);
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/_|-locked/);
    }
    const markup = markupFor(profileWithGold(100));
    expect(markup).not.toContain('insufficient-gold');
    expect(markup).not.toContain('prerequisite-locked');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.67C §D — the transactions the two handlers drive', () => {
  test('Triga deducts exactly 750 once and stays unlocked after a reload', () => {
    const base = profileWithGold(2000);
    const before = JSON.stringify(base);

    const bought = purchaseRacingConfig(base, 3);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.profile.gold).toBe(1250);
    expect(bought.profile.racing).toEqual({ unlocked: [3], selected: 2 });
    // Buying records the unlock; it does not select the team.
    expect(resolveRacingState(bought.profile)).toEqual({ unlocked: [2, 3], selected: 2, horses: 2 });
    // The caller's own profile is untouched.
    expect(JSON.stringify(base)).toBe(before);

    saveProfile(bought.profile);
    const reloaded = loadSavedProfile();
    expect(reloaded?.gold).toBe(1250);
    expect(reloaded?.racing).toEqual({ unlocked: [3], selected: 2 });

    // A second buy of the same team is refused and charges nothing.
    const again = purchaseRacingConfig(reloaded, 3);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe('already-unlocked');
    expect(_store.get(REAL_PROFILE_KEY)).toBe(JSON.stringify(reloaded));
    expect((loadSavedProfile() as PlayerProfile).gold).toBe(1250);
  });

  test('Quadra cannot be bought before Triga, and after it deducts exactly 1,500 once', () => {
    const base = profileWithGold(3000);
    const before = JSON.stringify(base);

    const early = purchaseRacingConfig(base, 4);
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.reason).toBe('prerequisite-locked');
    expect(JSON.stringify(base)).toBe(before);
    expect(_store.size).toBe(0);

    const triga = purchaseRacingConfig(base, 3);
    expect(triga.ok).toBe(true);
    if (!triga.ok) return;
    saveProfile(triga.profile);

    const withTriga = loadSavedProfile() as PlayerProfile;
    expect(withTriga.gold).toBe(2250);

    const quadra = purchaseRacingConfig(withTriga, 4);
    expect(quadra.ok).toBe(true);
    if (!quadra.ok) return;
    expect(quadra.profile.gold).toBe(750);
    expect(quadra.profile.racing).toEqual({ unlocked: [3, 4], selected: 2 });

    saveProfile(quadra.profile);
    const reloaded = loadSavedProfile() as PlayerProfile;
    expect(reloaded.gold).toBe(750);
    expect(resolveRacingState(reloaded)).toEqual({ unlocked: [2, 3, 4], selected: 2, horses: 2 });

    // Repeat: refused, no second charge.
    const again = purchaseRacingConfig(reloaded, 4);
    expect(again.ok).toBe(false);
    expect(reloaded.gold).toBe(750);
  });

  test('insufficient funds change nothing at all', () => {
    const poor = profileWithGold(300);
    const before = JSON.stringify(poor);

    for (const horses of [3, 4] as const) {
      const attempt = purchaseRacingConfig(poor, horses);
      expect(attempt.ok).toBe(false);
      if (attempt.ok) return;
      expect(attempt.reason).toBe(horses === 4 ? 'prerequisite-locked' : 'insufficient-gold');
    }
    expect(JSON.stringify(poor)).toBe(before);

    // Exactly enough pays to zero; one gold short is refused.
    const exact = purchaseRacingConfig(profileWithGold(750), 3);
    expect(exact.ok).toBe(true);
    if (!exact.ok) return;
    expect(exact.profile.gold).toBe(0);
    const short = purchaseRacingConfig(profileWithGold(749), 3);
    expect(short.ok).toBe(false);
  });

  test('selecting a locked team is rejected; selecting an unlocked one persists the horse count', () => {
    const base = profileWithGold(2000);
    const before = JSON.stringify(base);

    const locked = selectRacingConfig(base, 4);
    expect(locked.ok).toBe(false);
    if (locked.ok) return;
    expect(locked.reason).toBe('not-unlocked');
    expect(JSON.stringify(base)).toBe(before);
    expect(_store.size).toBe(0);

    const bought = purchaseRacingConfig(base, 3);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    saveProfile(bought.profile);

    const withTriga = loadSavedProfile() as PlayerProfile;
    const selected = selectRacingConfig(withTriga, 3);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    // A selection never moves gold.
    expect(selected.profile.gold).toBe(1250);
    expect(selected.profile.racing).toEqual({ unlocked: [3], selected: 3 });

    saveProfile(selected.profile);
    const reloaded = loadSavedProfile() as PlayerProfile;
    expect(reloaded.gold).toBe(1250);
    expect(reloaded.racing).toEqual({ unlocked: [3], selected: 3 });
    expect(resolveRacingState(reloaded).horses).toBe(3);
    // …and the rendered card agrees with the stored save.
    expect(textOf(cardOf(markupFor(reloaded), 'triga'))).toContain('Your selected team');
  });

  test('repeated clicks cannot double-charge, and a stale control is inert', () => {
    const base = profileWithGold(2000);

    // Two clicks inside one render: both read the same profile and produce the
    // same result — one deduction, and the same profile object value.
    const first = purchaseRacingConfig(base, 3);
    const second = purchaseRacingConfig(base, 3);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(JSON.stringify(first.profile)).toBe(JSON.stringify(second.profile));
    expect(first.profile.gold).toBe(1250);

    // The click against the updated state (what a real second click does) is
    // refused, and the balance does not move again.
    const settled = first.profile;
    const stale = purchaseRacingConfig(settled, 3);
    expect(stale.ok).toBe(false);
    expect(settled.gold).toBe(1250);

    saveProfile(settled);
    expect((loadSavedProfile() as PlayerProfile).gold).toBe(1250);
    // The rendered card has no buy control left to click.
    const card = cardOf(markupFor(settled), 'triga');
    expect(card).not.toContain('data-racing-action="buy"');
    expect(controlTag(card)).toContain('data-racing-action="select"');
  });

  test('Biga is always available and the selection survives an invalid stored value', () => {
    const orphan = { ...profileWithGold(2500), racing: { selected: 4 } } as PlayerProfile;
    saveProfile(orphan);
    const reloaded = loadSavedProfile() as PlayerProfile;
    expect(resolveRacingState(reloaded)).toEqual({ unlocked: [2], selected: 2, horses: 2 });

    // Selecting the fallback is accepted and writes horses 2.
    const picked = selectRacingConfig(reloaded, 2);
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    expect(picked.profile.racing).toEqual({ unlocked: [], selected: 2 });
    saveProfile(picked.profile);
    expect(resolveRacingState(loadSavedProfile()).horses).toBe(2);
  });

  test('chariot wheel and finish ownership stays independent of the racing unlocks', () => {
    const base = profileWithGold(3000);
    const wheel = purchaseChariotPart(base, 'wheels_reinforced');
    expect(wheel.ok).toBe(true);
    if (!wheel.ok) return;
    const finish = purchaseChariotPart(wheel.profile, 'finish_gilded');
    expect(finish.ok).toBe(true);
    if (!finish.ok) return;
    const withParts = finish.profile;

    // Owning chariot parts leaves both upgrades locked.
    expect(resolveRacingState(withParts)).toEqual({ unlocked: [2], selected: 2, horses: 2 });
    expect(purchaseRacingConfig(withParts, 4).ok).toBe(false);

    // And a racing purchase leaves the chariot loadout byte-identical.
    const chariotBefore = JSON.stringify(withParts.chariot);
    const bought = purchaseRacingConfig(withParts, 3);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(JSON.stringify(bought.profile.chariot)).toBe(chariotBefore);
    expect(bought.profile.gold).toBe(withParts.gold - 750);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.67C §E — the dev-only harness is isolated from the real save', () => {
  test('it declares its own key and never names the player save', () => {
    expect(HARNESS).toContain('HARNESS_RACING_PROFILE_KEY');
    expect(HARNESS).toContain("'sand_and_steel_racing_config_harness_v1'");
    expect(HARNESS).not.toContain('PROFILE_STORAGE_KEY');
    expect(HARNESS).not.toContain(REAL_PROFILE_KEY);
    expect(HARNESS).not.toContain('loadSavedProfile');
    expect(HARNESS).not.toContain('clearSavedProfile');
    expect(HARNESS).not.toContain('localStorage.setItem');
    expect(HARNESS).toContain('sessionStorage');
    expect(HARNESS).toContain('scratchStorage');
    expect(HARNESS_RACING_PROFILE_KEY).not.toBe(REAL_PROFILE_KEY);
    // The key this suite fakes is the one the storage layer really uses.
    expect(code('../services/storage.ts')).toContain(REAL_PROFILE_KEY);
  });

  test('a save writes only its own key into scratch storage', () => {
    const session = makeStore();
    const local = makeStore({ [REAL_PROFILE_KEY]: JSON.stringify({ name: 'The Player', gold: 1234 }) });
    installWindow({ session, local });

    saveHarnessRacingProfile(profileWithGold(2500));

    expect(session.writes).toEqual([HARNESS_RACING_PROFILE_KEY]);
    expect(local.writes).toEqual([]);
    expect(local.data.get(REAL_PROFILE_KEY)).toBe(JSON.stringify({ name: 'The Player', gold: 1234 }));
    expect(session.data.has(REAL_PROFILE_KEY)).toBe(false);
  });

  test('a load reads only its own key, even with the real save present', () => {
    const session = makeStore();
    const local = makeStore({ [REAL_PROFILE_KEY]: JSON.stringify({ name: 'The Player' }) });
    installWindow({ session, local });

    expect(loadHarnessRacingProfile()).toBeNull();
    expect(session.reads).toEqual([HARNESS_RACING_PROFILE_KEY]);
    expect(local.reads).toEqual([]);
  });

  test('a whole harness session — seed, buy, reload — leaves the real save byte-identical', () => {
    const session = makeStore();
    const local = makeStore({ [REAL_PROFILE_KEY]: JSON.stringify({ name: 'The Player', gold: 1234 }) });
    installWindow({ session, local, search: '?gold=2500' });

    const seeded = { ...createNewProfile('Racing Harness'), gold: readRacingSeedGold() };
    saveHarnessRacingProfile(seeded);
    const bought = purchaseRacingConfig(seeded, 3);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    saveHarnessRacingProfile(bought.profile);

    expect(session.writes).toEqual([HARNESS_RACING_PROFILE_KEY, HARNESS_RACING_PROFILE_KEY]);
    expect(local.writes).toEqual([]);
    expect(local.data.get(REAL_PROFILE_KEY)).toBe(JSON.stringify({ name: 'The Player', gold: 1234 }));

    const reloaded = loadHarnessRacingProfile();
    expect(reloaded?.gold).toBe(1750);
    expect(reloaded?.racing).toEqual({ unlocked: [3], selected: 2 });
    expect(local.reads).toEqual([]);
  });

  test('the URL purse is bounded, and defaults to a Triga-and-Quadra purse', () => {
    const cases: [string, number][] = [
      ['', DEFAULT_HARNESS_RACING_GOLD],
      ['?gold=2500', 2500],
      ['?gold=0', 0],
      ['?gold=1e308', DEFAULT_HARNESS_RACING_GOLD],
      ['?gold=999999999999', MAX_HARNESS_RACING_GOLD],
      ['?gold=12.5', DEFAULT_HARNESS_RACING_GOLD],
      ['?gold=-5', DEFAULT_HARNESS_RACING_GOLD],
      ['?gold=0x10', DEFAULT_HARNESS_RACING_GOLD],
      ['?gold=', DEFAULT_HARNESS_RACING_GOLD],
      ['?other=2500', DEFAULT_HARNESS_RACING_GOLD],
    ];
    for (const [search, expected] of cases) {
      installWindow({ session: makeStore(), local: makeStore(), search });
      const gold = readRacingSeedGold();
      expect(gold).toBe(expected);
      expect(Number.isInteger(gold) && gold >= 0 && gold <= MAX_HARNESS_RACING_GOLD).toBe(true);
    }
    // The default really does cover the full progression.
    expect(DEFAULT_HARNESS_RACING_GOLD).toBeGreaterThanOrEqual(750 + 1500);
  });

  test('the harness drives the shipping UI, and nothing but its own profile is writable', () => {
    expect(HARNESS).toContain("from '../hub/GearTab'");
    expect(HARNESS).toContain('<GearTab');
    expect(HARNESS).toContain('gearView="chariot"');
    expect(HARNESS).toContain('onBuyRacingConfig={handleBuyRacingConfig}');
    expect(HARNESS).toContain('onSelectRacingConfig={handleSelectRacingConfig}');
    expect(HARNESS).toContain('purchaseRacingConfig(profile, horses)');
    expect(HARNESS).toContain('selectRacingConfig(profile, horses)');
    // No writer of the player's save is reachable from this module.
    expect(Object.keys(harnessModule).sort()).toEqual(
      [
        'DEFAULT_HARNESS_RACING_GOLD',
        'HARNESS_RACING_PROFILE_KEY',
        'MAX_HARNESS_RACING_GOLD',
        'RacingConfigHarness',
        'loadHarnessRacingProfile',
        'readRacingSeedGold',
        'saveHarnessRacingProfile',
      ].sort()
    );
  });

  test('main.tsx mounts it only in a dev build, behind its own exact token', () => {
    expect(MAIN).toContain('import.meta.env.DEV &&');
    expect(MAIN).toContain(
      "new URLSearchParams(window.location.search).get('devHarness') === 'racing'"
    );
    expect(MAIN).toContain("import('./components/dev/RacingConfigHarness')");
    expect(MAIN).toContain("readDevHarnessFlag() === 'racing'");
    // It is a fourth branch, not a replacement: the other two survive.
    expect(MAIN).toContain("get('devHarness') === 'character'");
    expect(MAIN).toContain("get('devHarness') === 'chariot'");
    // One dynamic import, and no static import of dev code anywhere.
    expect(MAIN.split("import('./components/dev/RacingConfigHarness')")).toHaveLength(2);
    expect(/^import\s[^\n]*components\/dev/m.test(MAIN)).toBe(false);
    const characterImport = MAIN.indexOf("import('./components/dev/CharacterTestHarness')");
    const chariotIf = MAIN.indexOf('} else if (useChariotHarness) {');
    const racingIf = MAIN.indexOf('} else if (useRacingHarness) {');
    const appElse = MAIN.indexOf('} else {');
    expect(characterImport).toBeLessThan(chariotIf);
    expect(chariotIf).toBeLessThan(racingIf);
    expect(racingIf).toBeLessThan(appElse);
    expect(MAIN.slice(appElse)).toContain('<App />');
    // The app's own routing never names a harness.
    for (const source of [APP, GEAR_TAB, HUB, SECTION]) {
      expect(source).not.toContain('RacingConfigHarness');
      expect(source).not.toContain('HARNESS_RACING_PROFILE_KEY');
    }
  });
});
