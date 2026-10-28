/**
 * S7 — TAVERN RUMOURS: the helper, the transaction and the wiring.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the price and the roster surface — 15 gold stated as a LITERAL (the brief's
 *       number, not the module's constant read back), and the tavern offers only
 *       tournament opponents the player has not bought;
 *   §B  buying — gold decreases by exactly 15, the opponent's id is recorded, and
 *       nothing else on the profile moves;
 *   §C  refusal purity — a purse that cannot cover the price, an opponent already
 *       owned and an unknown id each leave the profile, its `intel` array and its
 *       gold exactly as they were, and return no profile at all;
 *   §D  lazy resolution — a legacy save with no `intel` field, null, a non-array and
 *       junk entries all resolve to known ids only, and `createNewProfile` writes
 *       no field;
 *   §E  the wiring — `App` owns the one transaction and the one save write, the city
 *       screen opens the tavern panel and writes no save, the tavern carries no
 *       `tabKey` any more, and the panel's copy says it is information only;
 *   §F  THE SWEEP — no module in the combat path (the relative-import closure of
 *       `DuelScene` and `combatCalculations`) imports the intel helper or reads the
 *       field, so intel cannot move a stat, a formula or a reward.
 *
 * Run with: `bun test src/utils/intel.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS, FEATURE_BOUT_OPPONENTS, TOURNAMENT_TIERS } from '../data/opponents';
import {
  INTEL_PRICE,
  getIntelPurchaseEligibility,
  hasIntel,
  intelTargets,
  purchaseIntel,
  resolveIntel,
} from './intel';
import { HUB_LOCATIONS } from './cityCollisions';
import { createNewProfile } from '../services/storage';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string): string => readFileSync(join(SRC_ROOT, rel), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const APP_SOURCE = code('App.tsx');
const SCENE_SOURCE = code('components/3d/city/CityHubScene.tsx');
const TAB_SOURCE = code('components/hub/TournamentTab.tsx');
const INTEL_SOURCE = code('utils/intel.ts');

function bareProfile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
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
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [DEFAULT_PLAYER_WEAPON],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

// ── §A the price and the roster surface ────────────────────────────────────
describe('S7 §A the tavern’s price and its list', () => {
  test('a rumour costs 15 gold — the brief’s number, stated as a literal', () => {
    expect(INTEL_PRICE).toBe(15);
  });

  test('the tavern offers every tournament opponent: the ladder, then the feature bouts', () => {
    const targets = intelTargets(bareProfile());
    expect(targets.map((opponent) => opponent.id)).toEqual(
      ALL_OPPONENTS.map((opponent) => opponent.id),
    );
    // D-1 — the LADDER rows still read tier then fight index (the list reads down
    // the ladder); the five feature bouts are APPENDED with `fightIndex: 0` ("no
    // rung"), so they are their own block at the end rather than a rung of a tier.
    // STORY-4b — the roster also carries the Bounty Hall's six rows, appended
    // after the Feature Bouts with `fightIndex: 0`. They are not tournament
    // opponents, so the ladder-ordering property is asserted over the ladder
    // proper and the bounty block is pinned where it actually sits: at the tail.
    const ladder = targets.filter(
      (opponent) => opponent.featureBout !== true && opponent.bountyBout !== true,
    );
    const ranks = ladder.map((opponent) => opponent.tier * 10 + opponent.fightIndex);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    const feature = targets.filter((opponent) => opponent.featureBout === true);
    expect(feature.map((opponent) => opponent.id)).toEqual(
      FEATURE_BOUT_OPPONENTS.map((opponent) => opponent.id),
    );
    const bountyBlock = targets.slice(ladder.length + feature.length);
    expect(bountyBlock.every((opponent) => opponent.bountyBout === true)).toBe(true);
    expect(bountyBlock.map((opponent) => opponent.id)).toEqual(
      ALL_OPPONENTS.filter((opponent) => opponent.bountyBout === true).map((opponent) => opponent.id),
    );
  });

  test('only ladder opponents are on sale — never the off-ladder Doctore test', () => {
    const ids = intelTargets(bareProfile()).map((opponent) => opponent.id);
    expect(ids).not.toContain('opp_doctore_sextus');
    expect(ids.every((id) => ALL_OPPONENTS.some((opponent) => opponent.id === id))).toBe(true);
    // Every tier the tournament shows has at least one opponent to sell.
    for (const tier of TOURNAMENT_TIERS) {
      expect(ids.some((id) => ALL_OPPONENTS.find((o) => o.id === id)?.tier === tier.tier)).toBe(true);
    }
  });

  test('an opponent already bought is never offered again', () => {
    const targets = intelTargets(bareProfile({ intel: ['opp_marcus', 'opp_goliath_boss'] }));
    const ids = targets.map((opponent) => opponent.id);
    expect(ids).not.toContain('opp_marcus');
    expect(ids).not.toContain('opp_goliath_boss');
    expect(ids).toContain('opp_flaccus');
    expect(getIntelPurchaseEligibility(bareProfile({ intel: ['opp_marcus'] }), 'opp_marcus')).toEqual({
      ok: false,
      reason: 'already-owned',
    });
  });
});

// ── §B buying ──────────────────────────────────────────────────────────────
describe('S7 §B purchase accounting', () => {
  test('gold falls by exactly 15 and the opponent’s id is recorded', () => {
    const before = bareProfile({ gold: 100 });
    const result = purchaseIntel(before, 'opp_marcus');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(85);
    expect(result.profile.gold).toBe(before.gold - 15);
    expect(result.profile.intel).toEqual(['opp_marcus']);
    expect(result.opponent.id).toBe('opp_marcus');
  });

  test('a second rumour appends, and never replaces the first', () => {
    const first = purchaseIntel(bareProfile({ gold: 40 }), 'opp_marcus');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = purchaseIntel(first.profile, 'opp_flaccus');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.profile.gold).toBe(10);
    expect(second.profile.intel).toEqual(['opp_marcus', 'opp_flaccus']);
  });

  test('nothing else on the profile moves — no stat, no reward, no gear', () => {
    const before = bareProfile({ gold: 100 });
    const result = purchaseIntel(before, 'opp_goliath_boss');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.profile;
    expect(after.baseStats).toEqual(before.baseStats);
    expect(after.level).toBe(before.level);
    expect(after.fame).toBe(before.fame);
    expect(after.xp).toBe(before.xp);
    expect(after.inventory).toEqual(before.inventory);
    expect(after.equipped).toEqual(before.equipped);
    expect(after.defeatedOpponentIds).toEqual(before.defeatedOpponentIds);
    // The write is exactly two fields: gold and intel.
    const changed = Object.keys(after).filter(
      (key) =>
        JSON.stringify((after as unknown as Record<string, unknown>)[key]) !==
        JSON.stringify((before as unknown as Record<string, unknown>)[key]),
    );
    expect(changed.sort()).toEqual(['gold', 'intel']);
  });

  test('a purse of exactly the price pays to zero', () => {
    const result = purchaseIntel(bareProfile({ gold: 15 }), 'opp_marcus');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(0);
  });
});

// ── §C refusal purity ──────────────────────────────────────────────────────
describe('S7 §C a refusal leaves everything untouched', () => {
  test('one gold short is refused, and returns no profile', () => {
    const before = bareProfile({ gold: 14 });
    const frozen = Object.freeze({ ...before }) as PlayerProfile;
    const result = purchaseIntel(frozen, 'opp_marcus');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('insufficient-gold');
    expect(Object.keys(result)).toEqual(['ok', 'reason']);
    expect(frozen.gold).toBe(14);
    expect('intel' in frozen).toBe(false);
  });

  test('a missing or non-finite purse can afford nothing', () => {
    for (const gold of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY] as unknown[]) {
      const profile = { ...bareProfile(), gold } as unknown as PlayerProfile;
      const result = purchaseIntel(profile, 'opp_marcus');
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe('insufficient-gold');
    }
  });

  test('an opponent already known is refused, not silently re-charged', () => {
    const before = bareProfile({ gold: 100, intel: ['opp_marcus'] });
    const result = purchaseIntel(before, 'opp_marcus');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('already-owned');
    expect(before.gold).toBe(100);
    expect(before.intel).toEqual(['opp_marcus']);
  });

  test('an id the roster does not know is refused', () => {
    const result = purchaseIntel(bareProfile({ gold: 100 }), 'opp_nonexistent');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unknown-opponent');
  });

  test('a refusal cannot hand back anything saveable', () => {
    for (const result of [
      purchaseIntel(bareProfile({ gold: 0 }), 'opp_marcus'),
      purchaseIntel(bareProfile({ intel: ['opp_marcus'] }), 'opp_marcus'),
      purchaseIntel(bareProfile(), 'nope'),
    ]) {
      expect(result.ok).toBe(false);
      expect((result as { profile?: unknown }).profile).toBeUndefined();
    }
  });
});

// ── §D lazy resolution ─────────────────────────────────────────────────────
describe('S7 §D a legacy save keeps loading', () => {
  test('no field, null, a non-array and junk all resolve to known ids only', () => {
    expect(resolveIntel(bareProfile())).toEqual([]);
    expect(resolveIntel({ intel: null })).toEqual([]);
    expect(resolveIntel({ intel: 'opp_marcus' as unknown as string[] })).toEqual([]);
    expect(resolveIntel({ intel: {} as unknown as string[] })).toEqual([]);
    expect(resolveIntel(undefined)).toEqual([]);
    expect(resolveIntel({ intel: [42, 'opp_marcus', null, 'retired_opponent', 'opp_flaccus'] as unknown as string[] })).toEqual([
      'opp_marcus',
      'opp_flaccus',
    ]);
  });

  test('duplicates keep their first position and never double up', () => {
    expect(resolveIntel({ intel: ['opp_marcus', 'opp_marcus', 'opp_flaccus'] })).toEqual([
      'opp_marcus',
      'opp_flaccus',
    ]);
    const profile = bareProfile({ intel: ['opp_marcus', 'opp_marcus'] });
    expect(hasIntel(profile, 'opp_marcus')).toBe(true);
    expect(hasIntel(profile, 'opp_flaccus')).toBe(false);
  });

  test('resolution never mutates the stored array, and returns a fresh one', () => {
    const stored = ['opp_marcus'];
    const profile = bareProfile({ intel: stored });
    const resolved = resolveIntel(profile);
    expect(resolved).not.toBe(stored);
    resolved.push('opp_flaccus');
    expect(stored).toEqual(['opp_marcus']);
  });

  test('createNewProfile writes no intel field', () => {
    expect(Object.keys(createNewProfile('Fresh')).sort()).not.toContain('intel');
    expect(resolveIntel(createNewProfile('Fresh'))).toEqual([]);
  });
});

// ── §E the wiring ──────────────────────────────────────────────────────────
describe('S7 §E App transacts, the tavern reports the choice', () => {
  test('App is the only caller, and its handler saves exactly once', () => {
    expect(APP_SOURCE.match(/purchaseIntel\(profile, opponentId\)/g)?.length).toBe(1);
    const at = APP_SOURCE.indexOf('purchaseIntel(profile, opponentId)');
    const block = APP_SOURCE.slice(at, APP_SOURCE.indexOf('};', at));
    expect(block).toContain('setProfile(');
    expect(block).toContain('saveProfile(');
    expect(block).toContain('if (!result.ok) return false;');
  });

  test('the city screen declares the callback, calls it, and writes no save', () => {
    expect(APP_SOURCE).toContain('onBuyIntel={handleBuyIntel}');
    expect(SCENE_SOURCE).toContain('onBuyIntel: (opponentId: string) => boolean;');
    expect(SCENE_SOURCE).toContain('onBuyIntel(opponentId);');
    expect(SCENE_SOURCE).not.toContain('saveProfile');
    expect(SCENE_SOURCE).not.toContain('setProfile(');
    // The transaction is not re-implemented on the screen.
    expect(SCENE_SOURCE).not.toContain('purchaseIntel(');
    expect(SCENE_SOURCE).not.toContain('gold: playerProfile.gold -');
  });

  test('the tavern opens the panel and can no longer redirect to a tab', () => {
    const tavern = HUB_LOCATIONS.find((location) => location.id === 'tavern');
    expect(tavern).toBeDefined();
    expect(tavern!.tabKey).toBeUndefined();
    expect(tavern!.actionPrompt).toBe('Hear Rumors');
    expect(SCENE_SOURCE).toContain("nearbyLoc.id === 'tavern'");
    expect(SCENE_SOURCE).toContain('setIntelPanel(true)');
  });

  test('the panel is the intel module’s own reading, and says it is information only', () => {
    expect(SCENE_SOURCE).toContain('data-intel-panel');
    expect(SCENE_SOURCE).toContain('intelTargets(playerProfile)');
    expect(SCENE_SOURCE).toContain('getIntelPurchaseEligibility(playerProfile, opponent.id)');
    expect(SCENE_SOURCE).toContain('data-buy-intel={opponent.id}');
    expect(SCENE_SOURCE).toContain('data-intel-refusal="insufficient-gold"');
    expect(SCENE_SOURCE).toContain('min-h-[48px]');
    expect(SCENE_SOURCE).toContain(
      'Information only — a rumour changes no stat, no formula and no reward.',
    );
    // Esc closes it and no other key is read while it is up.
    expect(SCENE_SOURCE).toContain('if (code === \'Escape\' || key === \'escape\') setIntelPanel(false);');
  });

  test('the tournament card reads the rumour, and never writes one', () => {
    expect(TAB_SOURCE).toContain('hasIntel(profile, opp.id)');
    expect(TAB_SOURCE).toContain('data-intel={opp.id}');
    expect(TAB_SOURCE).not.toContain('purchaseIntel');
    expect(TAB_SOURCE).not.toContain('saveProfile');
  });
});

// ── §F the combat-path sweep ───────────────────────────────────────────────
describe('S7 §F no combat-path module imports the intel helper', () => {
  const INTEL_SYMBOLS = [
    'utils/intel',
    'resolveIntel',
    'hasIntel',
    'intelTargets',
    'purchaseIntel',
    'getIntelPurchaseEligibility',
    'INTEL_PRICE',
  ];

  /** Resolve a relative import specifier to a file on disk, or null. */
  const resolveSpec = (fromFile: string, spec: string): string | null => {
    if (!spec.startsWith('.')) return null;
    const base = normalize(join(dirname(fromFile), spec));
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      join(base, 'index.ts'),
      join(base, 'index.tsx'),
    ]) {
      if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
    }
    return null;
  };

  /** The relative-import closure of one entry file, itself included. */
  const closure = (entry: string): string[] => {
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from\s+'([^']+)'|import\s+'([^']+)'/g)) {
        const spec = match[1] ?? match[2];
        const resolved = resolveSpec(file, spec);
        if (resolved) walk(resolved);
      }
    };
    walk(entry);
    return [...seen];
  };

  const rel = (file: string): string => file.slice(SRC_ROOT.length);

  test('the duel scene’s own import graph never reaches the intel module', () => {
    const files = closure(join(SRC_ROOT, 'components/duel/DuelScene.tsx'));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((file) => code(rel(file)).includes('utils/intel'));
    expect(offenders.map(rel)).toEqual([]);
  });

  test('the combat formulas’ own import graph never reaches it either', () => {
    const files = closure(join(SRC_ROOT, 'utils/combatCalculations.ts'));
    expect(files.length).toBeGreaterThan(1);
    for (const file of files) {
      const source = code(rel(file));
      for (const symbol of INTEL_SYMBOLS) {
        expect(source.includes(symbol), `${rel(file)} mentions ${symbol}`).toBe(false);
      }
    }
  });

  test('the sweep is sensitive: the display surfaces ARE in the intel module’s consumers', () => {
    // A control, so the closure is shown to have found real importers.
    expect(TAB_SOURCE).toContain("from '../../utils/intel'");
    expect(SCENE_SOURCE).toContain("from '../../../utils/intel'");
    expect(APP_SOURCE).toContain("from './utils/intel'");
    // …and none of the three is inside the duel/combat closure.
    const combat = [...closure(join(SRC_ROOT, 'components/duel/DuelScene.tsx')),
      ...closure(join(SRC_ROOT, 'utils/combatCalculations.ts'))].map(rel);
    expect(combat).not.toContain('components/hub/TournamentTab.tsx');
    expect(combat).not.toContain('components/3d/city/CityHubScene.tsx');
    expect(combat).not.toContain('App.tsx');
  });

  test('the helper knows nothing of combat, storage or the clock', () => {
    expect(INTEL_SOURCE).not.toContain('combatCalculations');
    expect(INTEL_SOURCE).not.toContain('calculateTotalStats');
    expect(INTEL_SOURCE).not.toContain('DuelScene');
    expect(INTEL_SOURCE).not.toContain('saveProfile');
    expect(INTEL_SOURCE).not.toContain('localStorage');
    expect(INTEL_SOURCE).not.toContain('Math.random');
    // It reads the roster (ids and names) and the type file — nothing else.
    const imports = [...INTEL_SOURCE.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual(['../data/opponents', '../types/game']);
  });
});
