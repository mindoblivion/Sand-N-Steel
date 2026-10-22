/**
 * L19 — arena progression reachability: earlier-division rematches.
 *
 * ── THE DEFECT THIS SUITE REPRODUCES ──────────────────────────────────────
 * A natural run (every division fought in `fightIndex` order, rematching the
 * best-paying fighter already beaten inside the current division whenever a boss's
 * level gate is still shut) reaches **tier 4 at level 9**, because Aurelius asks
 * for level 10. The tournament list used to show the current division ONLY, so at
 * that point the tab — and the Colosseum door, which resolves the same tier — had
 * **no legal bout at all**: the player was stranded with no XP source and the
 * final boss permanently out of reach. Nothing about the economy was wrong; the
 * fights that could pay the missing experience were simply not listed.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A the list helper (`listTournamentBouts`): the current division in its
 *      existing `fightIndex` order, unchanged;
 *   §B the rematches: only fighters of EARLIER divisions that the profile has
 *      actually beaten, in division-then-`fightIndex` order, each marked
 *      `rematch: true`; an unbeaten earlier-division fighter is never exposed and
 *      a defeated current-division one stays where it always was;
 *   §C malformed input (unknown ids, duplicates, junk entries, a broken tier)
 *      follows the repository's existing convention instead of throwing;
 *   §D the natural path, played through App's OWN settlement, reaches tier 4 at
 *      level 9 with Aurelius level-locked, and the pre-fix list is reproduced as
 *      a control that yields **zero** legal bouts — so the regression test fails
 *      against the old behaviour;
 *   §E the repair: two Valéria rematches, at their real reward value, carry the
 *      simulated player to level 10 and Aurelius passes the existing level gate;
 *   §F the shipped wiring — the tab lists through the helper and renders an
 *      Earlier Divisions section, the door's gate and settlement path are
 *      untouched, and the Colosseum notice now points at those rematches.
 *
 * ── HOW THE FIGHTS ARE EXERCISED ──────────────────────────────────────────
 * There is no DOM renderer in this repo, so `<App/>` cannot be mounted. Instead of
 * mirroring the settlement arithmetic in the test, this suite extracts App's own
 * `evaluateRituals` and `handleMatchComplete` source text (brace-matched, comments
 * stripped), transpiles it with Bun's own transpiler and runs it against the REAL
 * `advanceCityDay`, `settleInjury`, `resolveVictoryTier`, `evaluateRoadMilestones`
 * and `createDuelSettlementLatch` — the same technique `duelSettlementCommit.test.ts`
 * established. Only React is modelled: `profileRef`/`profile`/`setProfile`/
 * `saveProfile` are recorders. So XP, levels, the tier and `defeatedOpponentIds` in
 * §D/§E are produced by the shipping settlement, not by a copy of its formula.
 * What that leaves unexercised is the UI: the card click, the dialog and the duel
 * itself (recorded in the phase report as not automatically verified).
 *
 * Run with: `bun test src/utils/arenaReachability.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { DuelStatistics, OpponentConfig, PlayerProfile } from '../types/game';
import { ALL_OPPONENTS, TOURNAMENT_TIERS } from '../data/opponents';
import { createNewProfile } from '../services/storage';
import { advanceCityDay } from './cityClock';
import { createDuelSettlementLatch } from './duelSettlement';
import { settleInjury } from './injurySettlement';
import { evaluateRoadMilestones } from './roadMilestones';
import {
  FINAL_TIER,
  listTournamentBouts,
  resolveBoutLevelGate,
  resolveVictoryTier,
} from './tierAdvancement';

// ── App's real settlement source ──────────────────────────────────────────
const APP_SRC = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const tabSource = readFileSync(
  new URL('../components/hub/TournamentTab.tsx', import.meta.url),
  'utf8'
);
const citySource = readFileSync(
  new URL('../components/3d/city/CityHubScene.tsx', import.meta.url),
  'utf8'
);

const HANDLERS = ['evaluateRituals', 'handleMatchComplete'] as const;

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

/** TypeScript in, plain JavaScript out — Bun's transpiler, not a type stripper. */
function toJavaScript(source: string): string {
  // @ts-ignore — Bun is the test runtime
  return new Bun.Transpiler({ loader: 'ts' }).transformSync(
    `${source}\nreturn { ${HANDLERS.join(', ')} };`
  );
}

/** The arena's own roster, in the order a player meets it. */
function division(tier: number): OpponentConfig[] {
  return ALL_OPPONENTS.filter((o) => o.tier === tier).sort((a, b) => a.fightIndex - b.fightIndex);
}

function opponentById(id: string): OpponentConfig {
  const opponent = ALL_OPPONENTS.find((o) => o.id === id);
  if (!opponent) throw new Error(`roster has no ${id}`);
  return opponent;
}

const VALERIA = opponentById('opp_valeria_boss');
const AURELIUS = opponentById('opp_aurelius_boss');

/** The stats the scene writes for a win — the rewards are the roster's own. */
function statsFor(opponent: OpponentConfig): DuelStatistics {
  return {
    damageDealt: 100,
    damageTaken: 6,
    hitsLanded: 6,
    perfectBlocks: 0,
    dodgesPerformed: 0,
    maxCombo: 2,
    // Below the purse's hype floor and above zero damage, so no bonus is involved:
    // this suite is about XP and levels, not the purse.
    crowdHypePeak: 30,
    durationSeconds: 20,
    goldEarned: opponent.rewardGold,
    fameEarned: opponent.rewardFame,
    xpEarned: opponent.rewardXp,
  };
}

/**
 * Play one bout through App's REAL `handleMatchComplete`, with React modelled the
 * way the settlement expects it: the ref is the live commit, `setProfile` records
 * the commit and `saveProfile` writes it. Returns the committed profile.
 */
function settleFight(profile: PlayerProfile, opponent: OpponentConfig): PlayerProfile {
  const ref: { current: PlayerProfile | null } = { current: profile };
  let committed = profile;
  const latch = createDuelSettlementLatch();
  const duelId = latch.arm();
  const noop = () => {};

  const factory = new Function(
    'sellItem',
    'evaluateRoadMilestones',
    'setHeraldCries',
    'setDeviceChoiceOpen',
    'advanceCityDay',
    'settleInjury',
    'resolveVictoryTier',
    'profileRef',
    'profile',
    'setProfile',
    'saveProfile',
    'duelSettlementRef',
    'activeOpponent',
    'setDuelResult',
    toJavaScript(HANDLER_SOURCE)
  ) as (...args: unknown[]) => {
    handleMatchComplete: (stats: DuelStatistics, didWin: boolean, id: number) => void;
  };

  const handlers = factory(
    () => ({ ok: false }),
    evaluateRoadMilestones,
    noop,
    noop,
    advanceCityDay,
    settleInjury,
    resolveVictoryTier,
    ref,
    profile,
    (next: PlayerProfile) => {
      committed = next;
    },
    noop,
    { current: latch },
    opponent,
    noop
  );

  handlers.handleMatchComplete(statsFor(opponent), true, duelId);
  return committed;
}

/** Every bout the pre-L19 tab could offer: the current division and nothing else. */
function currentTierOnly(profile: PlayerProfile): OpponentConfig[] {
  return division(profile.currentTier);
}

/** Every bout with a legal level gate — the property the dead end violates. */
function legalBouts(profile: PlayerProfile, bouts: OpponentConfig[]): OpponentConfig[] {
  return bouts.filter(
    (opponent) =>
      !resolveBoutLevelGate(profile.level, opponent, profile.defeatedOpponentIds).locked
  );
}

interface NaturalPath {
  profile: PlayerProfile;
  fights: string[];
  stoppedAt: OpponentConfig | null;
}

/**
 * Natural play, as a player who follows the tab would make it: each division in
 * `fightIndex` order, and whenever a boss's level gate is still shut, a rematch of
 * the best-paying fighter already beaten IN THAT DIVISION (the only rematch the
 * pre-L19 tab offered). Stops the moment no such bout exists — which is the dead
 * end this suite exists for.
 */
function playNaturalPath(): NaturalPath {
  let profile = createNewProfile('Reachability');
  const fights: string[] = [];

  for (const tier of TOURNAMENT_TIERS.map((t) => t.tier)) {
    for (const opponent of division(tier)) {
      let guard = 0;
      while (resolveBoutLevelGate(profile.level, opponent, profile.defeatedOpponentIds).locked) {
        const beaten = division(tier).filter((o) =>
          profile.defeatedOpponentIds.includes(o.id)
        );
        if (beaten.length === 0) return { profile, fights, stoppedAt: opponent };
        const best = beaten.reduce((a, b) => (b.rewardXp > a.rewardXp ? b : a));
        profile = settleFight(profile, best);
        fights.push(`${best.id}:rematch`);
        if (++guard > 40) throw new Error('rematch guard tripped');
      }
      profile = settleFight(profile, opponent);
      fights.push(opponent.id);
    }
  }

  return { profile, fights, stoppedAt: null };
}

const path = playNaturalPath();

// ══════════════════════════════════════════════════════════════════════════
describe('§A — the current division keeps its existing order', () => {
  test('every division is listed in the roster order the tab always used', () => {
    for (const tier of TOURNAMENT_TIERS.map((t) => t.tier)) {
      const listed = listTournamentBouts(tier, []).currentTier.map((bout) => bout.opponent.id);
      expect(listed).toEqual(division(tier).map((o) => o.id));
      expect(listed.length).toBeGreaterThan(0);
    }
  });

  test('a current-division entry is never marked as a rematch', () => {
    const bouts = listTournamentBouts(3, ['opp_centurion_drusus']);
    expect(bouts.currentTier.map((bout) => bout.rematch)).toEqual([false, false]);
    expect(bouts.currentTier.map((bout) => bout.opponent.id)).toEqual([
      'opp_centurion_drusus',
      'opp_valeria_boss',
    ]);
  });

  test('the entries are the roster objects themselves, not copies', () => {
    const bouts = listTournamentBouts(4, []);
    expect(bouts.currentTier[0].opponent).toBe(opponentById('opp_aurelius_boss'));
  });

  test('the roster and the tier table are untouched by the helper', () => {
    const before = ALL_OPPONENTS.map((o) => o.id);
    listTournamentBouts(4, ALL_OPPONENTS.map((o) => o.id));
    listTournamentBouts(1, []);
    expect(ALL_OPPONENTS.map((o) => o.id)).toEqual(before);
    expect(TOURNAMENT_TIERS.map((t) => t.tier)).toEqual([1, 2, 3, 4]);
    expect(FINAL_TIER).toBe(4);
  });
});

describe('§B — earlier divisions appear only when the record says so', () => {
  test('at the top tier the earlier divisions are the fighters actually beaten', () => {
    const defeated = [
      'opp_marcus',
      'opp_flaccus',
      'opp_goliath_boss',
      'opp_hoplite',
      'opp_ignis_boss',
      'opp_centurion_drusus',
      'opp_valeria_boss',
    ];
    const bouts = listTournamentBouts(4, defeated);

    expect(bouts.rematches.map((bout) => bout.opponent.id)).toEqual(defeated);
    expect(bouts.rematches.map((bout) => bout.rematch)).toEqual(defeated.map(() => true));
    // Division, then `fightIndex` — the same ordering rule the current list uses.
    expect(bouts.rematches.map((bout) => bout.opponent.tier)).toEqual([1, 1, 1, 2, 2, 3, 3]);
    // And the current division is still just Aurelius.
    expect(bouts.currentTier.map((bout) => bout.opponent.id)).toEqual(['opp_aurelius_boss']);
  });

  test('an undefeated earlier-division opponent is never exposed as a rematch', () => {
    const bouts = listTournamentBouts(4, ['opp_marcus', 'opp_valeria_boss']);
    expect(bouts.rematches.map((bout) => bout.opponent.id)).toEqual([
      'opp_marcus',
      'opp_valeria_boss',
    ]);
    const exposed = bouts.rematches.map((bout) => bout.opponent.id);
    for (const undefeated of ['opp_flaccus', 'opp_goliath_boss', 'opp_hoplite', 'opp_ignis_boss', 'opp_centurion_drusus']) {
      expect(exposed).not.toContain(undefeated);
    }
  });

  test('a defeated current-division fighter stays in the current list, not the rematches', () => {
    const bouts = listTournamentBouts(3, ['opp_centurion_drusus']);
    expect(bouts.rematches).toEqual([]);
    expect(bouts.currentTier.map((bout) => bout.opponent.id)).toContain('opp_centurion_drusus');
  });

  test('the earlier divisions never include the division being fought', () => {
    for (const tier of TOURNAMENT_TIERS.map((t) => t.tier)) {
      const everyId = ALL_OPPONENTS.map((o) => o.id);
      const bouts = listTournamentBouts(tier, everyId);
      for (const bout of bouts.rematches) {
        expect(bout.opponent.tier).toBeLessThan(tier);
      }
      expect(bouts.rematches.map((bout) => bout.opponent.id)).not.toContain('opp_aurelius_boss');
    }
  });

  test('a fresh profile is offered no rematches at all', () => {
    const fresh = createNewProfile('Fresh');
    const bouts = listTournamentBouts(fresh.currentTier, fresh.defeatedOpponentIds);
    expect(bouts.rematches).toEqual([]);
    expect(bouts.currentTier.length).toBe(division(1).length);
  });
});

describe('§C — malformed records follow the repository convention', () => {
  test('unknown ids match nothing and never throw', () => {
    const bouts = listTournamentBouts(4, ['opp_nobody', '', 'x', 'OPP_MARCUS']);
    expect(bouts.rematches).toEqual([]);
    expect(bouts.currentTier.length).toBe(1);
  });

  test('a duplicate defeated id cannot list a fighter twice', () => {
    const bouts = listTournamentBouts(4, [
      'opp_marcus',
      'opp_marcus',
      'opp_marcus',
      'opp_valeria_boss',
      'opp_valeria_boss',
    ]);
    expect(bouts.rematches.map((bout) => bout.opponent.id)).toEqual([
      'opp_marcus',
      'opp_valeria_boss',
    ]);
  });

  test('junk entries are dropped exactly as the tier rule drops them', () => {
    const junk = [5, null, undefined, true, { id: 'opp_marcus' }, ['opp_marcus']] as unknown[];
    expect(listTournamentBouts(4, junk).rematches).toEqual([]);
    expect(listTournamentBouts(4, null).rematches).toEqual([]);
    expect(listTournamentBouts(4, undefined).rematches).toEqual([]);
    // ...and the very same record still works for the ids it does hold.
    expect(
      listTournamentBouts(4, [...junk, 'opp_marcus']).rematches.map((b) => b.opponent.id)
    ).toEqual(['opp_marcus']);
  });

  test('a broken or missing tier reads as the first division, as everywhere else', () => {
    for (const tier of [Number.NaN, 0, -3, undefined as unknown as number]) {
      const bouts = listTournamentBouts(tier, ['opp_marcus']);
      expect(bouts.currentTier.map((b) => b.opponent.id)).toEqual(division(1).map((o) => o.id));
      expect(bouts.rematches).toEqual([]);
    }
    // A fractional tier is floored, exactly like `resolveBoutLevelGate`'s level read.
    expect(listTournamentBouts(4.8, []).currentTier.map((b) => b.opponent.id)).toEqual([
      'opp_aurelius_boss',
    ]);
  });
});

describe('§D — the natural path and the dead end it used to produce', () => {
  test('the settlement is App’s own source, executed against the real helpers', () => {
    for (const name of HANDLERS) {
      const source = extractHandler(name);
      expect(source.startsWith(`const ${name} = `)).toBe(true);
      expect(APP_SRC).toContain(source);
    }
    expect(extractHandler('handleMatchComplete')).toContain('const base = profileRef.current ?? profile;');
    expect(extractHandler('handleMatchComplete')).toContain(
      'const tierAfterVictory = resolveVictoryTier({'
    );
  });

  test('every division was fought, and the run stops only at the final boss', () => {
    expect(path.stoppedAt?.id).toBe('opp_aurelius_boss');
    // Marcus twice, then Flaccus (his LVL 2 gate was shut at level 1); Drusus twice,
    // then Valéria (her LVL 8 gate was shut at level 7) — and then Aurelius, whose
    // LVL 10 gate no fighter in the division can open.
    expect(path.fights).toEqual([
      'opp_marcus',
      'opp_marcus:rematch',
      'opp_marcus:rematch',
      'opp_flaccus',
      'opp_goliath_boss',
      'opp_hoplite',
      'opp_ignis_boss',
      'opp_centurion_drusus',
      'opp_centurion_drusus:rematch',
      'opp_centurion_drusus:rematch',
      'opp_valeria_boss',
    ]);
  });

  test('the run reaches tier 4 at level 9 with a book of every earlier fighter', () => {
    expect(path.profile.currentTier).toBe(FINAL_TIER);
    expect(path.profile.level).toBe(9);
    expect(path.profile.defeatedOpponentIds).toEqual([
      'opp_marcus',
      'opp_flaccus',
      'opp_goliath_boss',
      'opp_hoplite',
      'opp_ignis_boss',
      'opp_centurion_drusus',
      'opp_valeria_boss',
    ]);
  });

  test('Aurelius is level-locked and the old current-tier-only list offers NOTHING', () => {
    const gate = resolveBoutLevelGate(
      path.profile.level,
      AURELIUS,
      path.profile.defeatedOpponentIds
    );
    expect(gate).toEqual({ locked: true, requiredLevel: 10 });

    // THE CONTROL: the pre-L19 list is the current division only, and it is empty
    // of legal bouts — the reported dead end, reproduced from the shipped roster.
    expect(legalBouts(path.profile, currentTierOnly(path.profile))).toEqual([]);
    expect(currentTierOnly(path.profile).map((o) => o.id)).toEqual(['opp_aurelius_boss']);
  });

  test('with the shipped list the same profile has a legal bout', () => {
    const bouts = listTournamentBouts(
      path.profile.currentTier,
      path.profile.defeatedOpponentIds
    );
    const legal = legalBouts(
      path.profile,
      bouts.rematches.map((bout) => bout.opponent)
    );
    // The current division is still locked...
    expect(legalBouts(path.profile, bouts.currentTier.map((bout) => bout.opponent))).toEqual([]);
    // ...and the earlier divisions answer with every fighter already beaten.
    expect(legal.map((o) => o.id)).toEqual(path.profile.defeatedOpponentIds);
    expect(legal.length).toBeGreaterThan(0);
  });
});

describe('§E — two earlier-division rematches reach the final boss’s level', () => {
  test('two Valéria rematches take the stranded player to level 10', () => {
    const before = path.profile;
    expect(before.level).toBe(9);

    const once = settleFight(before, VALERIA);
    expect(once.currentTier).toBe(FINAL_TIER);
    expect(once.xp).toBe(before.xp + VALERIA.rewardXp);
    expect(once.level).toBe(9);

    const twice = settleFight(once, VALERIA);
    expect(twice.xp).toBe(before.xp + 2 * VALERIA.rewardXp);
    expect(twice.level).toBe(10);
    // The level curve is the settlement's own: the threshold it crossed is the one
    // stored on the profile, and the next one is that × 1.5, rounded.
    expect(before.xp + 2 * VALERIA.rewardXp).toBeGreaterThanOrEqual(before.xpToNextLevel);
    expect(twice.xpToNextLevel).toBe(Math.round(before.xpToNextLevel * 1.5));
    // A rematch pays its rewards — and proves nothing new about the tier.
    expect(twice.defeatedOpponentIds).toEqual(before.defeatedOpponentIds);
    expect(twice.currentTier).toBe(FINAL_TIER);
  });

  test('Aurelius passes the existing level gate, with no rule relaxed', () => {
    let profile = path.profile;
    profile = settleFight(profile, VALERIA);
    profile = settleFight(profile, VALERIA);

    expect(
      resolveBoutLevelGate(profile.level, AURELIUS, profile.defeatedOpponentIds)
    ).toEqual({ locked: false, requiredLevel: 10 });
    expect(AURELIUS.recommendedLevel).toBe(10);
  });

  test('the rematch rewards are the roster’s own, unchanged by this fix', () => {
    expect(VALERIA.rewardXp).toBe(450);
    expect(VALERIA.rewardGold).toBe(450);
    expect(VALERIA.rewardFame).toBe(140);
    expect(VALERIA.recommendedLevel).toBe(8);
    // A rematch is settled by the same handler as a first fight: the purse is credited.
    const paid = settleFight(path.profile, VALERIA);
    expect(paid.gold).toBe(path.profile.gold + VALERIA.rewardGold);
    expect(paid.fame).toBe(path.profile.fame + VALERIA.rewardFame);
  });
});

describe('§F — the shipped wiring', () => {
  test('the tab lists through the helper and keeps the shared level gate', () => {
    expect(tabSource).toContain('listTournamentBouts(');
    expect(tabSource).toContain('resolveBoutLevelGate(');
    expect(tabSource).not.toContain('profile.level < opp.recommendedLevel');
    // No second source of truth for what is listed.
    expect(tabSource).not.toContain('ALL_OPPONENTS.filter');
  });

  test('the tab renders earlier divisions as labelled rematches through the same card', () => {
    expect(tabSource).toContain('Earlier Divisions');
    expect(tabSource).toContain('bouts.rematches.map(');
    // Both sections render the same card, so a rematch takes the normal duel path.
    expect(tabSource).toContain('<OpponentCard');
    expect(tabSource).toContain('rematchTier');
    expect(tabSource.match(/onSelectOpponent\(opp\)/g)?.length).toBe(1);
  });

  test('the Colosseum door’s gate and settlement path are untouched', () => {
    expect(citySource).toContain('const target = resolveDoorDuelTarget(');
    expect(citySource).toContain('const gate = resolveBoutLevelGate(');
    expect(citySource).toContain('if (gate.locked) {');
    expect(citySource).toContain('setPendingDuel(target.opponent);');
    expect(appSourceHasSettlement());
  });

  test('the locked-door guidance names both routes the list offers', () => {
    // Read through the code only: the phase's own comment quotes the old wording.
    const cityCode = citySource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(cityCode).not.toContain('Train, and return');
    // The list itself, named once...
    expect(cityCode).toContain("Colosseum's tournament list");
    // ...then both cases it has to cover: a rank match, for a player early in the
    // ladder who has no rematches yet, and the earlier division's rematch.
    expect(cityCode).toContain('an open rank match');
    expect(cityCode).toContain('rematch of an earlier division');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// L20a — the card's gate-to-button guard
//
// The L20 audit found the tab's source-string checks never proved that a
// LOCKED opponent's button is actually `disabled`. These helpers render the
// real `OpponentCard` — its own source, brace-matched out of the tab,
// transpiled with Bun's own TSX transpiler in classic `React.createElement`
// form and evaluated against the shipped `resolveBoutLevelGate` — so the
// assertion is about the element the card produces, not about a substring.
// There is no DOM: a small React stub records the element tree.

/** Where the card's declaration starts in the tab's source. */
const CARD_START = 'const OpponentCard: React.FC<OpponentCardProps> = (';

/** The card's own declaration, brace-matched out of the tab's source. */
function extractOpponentCard(source: string): string {
  const start = source.indexOf(CARD_START);
  if (start < 0) throw new Error('TournamentTab no longer declares OpponentCard');
  const bodyStart = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 2);
    }
  }
  throw new Error("OpponentCard's body is not balanced");
}

const CARD_SOURCE = extractOpponentCard(tabSource);

/** Source with every run of whitespace removed — comparisons ignore formatting. */
function squash(source: string): string {
  return source.replace(/\s+/g, '');
}

/** The card's JSX in classic form, so a React stub can execute it. */
function transpileCard(declaration: string): string {
  // @ts-ignore — Bun is the test runtime
  return new Bun.Transpiler({
    loader: 'tsx',
    tsconfig: JSON.stringify({ compilerOptions: { jsx: 'react' } }),
  }).transformSync(`${declaration}\nreturn OpponentCard;`);
}

interface StubElement {
  type: unknown;
  props: Record<string, any>;
  children: unknown[];
}

const STUB_REACT = {
  Fragment: 'Fragment',
  createElement: (
    type: unknown,
    props: Record<string, any> | null,
    ...children: unknown[]
  ): StubElement => ({ type, props: props ?? {}, children }),
};

/** A start tag, scanned with brace awareness (`onClick={() => …}` contains `>`). */
function openingTag(declaration: string, tag: string): string {
  const start = declaration.indexOf(`<${tag}`);
  if (start < 0) throw new Error(`OpponentCard renders no <${tag}>`);
  let depth = 0;
  for (let i = start; i < declaration.length; i += 1) {
    if (declaration[i] === '{') depth += 1;
    else if (declaration[i] === '}') depth -= 1;
    else if (declaration[i] === '>' && depth === 0) return declaration.slice(start, i + 1);
  }
  throw new Error(`OpponentCard's <${tag}> is not closed`);
}

/** The exact expression the button's `disabled` prop is bound to. */
function disabledBinding(declaration: string): string | null {
  const match = /\sdisabled=\{([^}]*)\}/.exec(openingTag(declaration, 'button'));
  return match ? match[1].trim() : null;
}

function findElement(node: unknown, type: string): StubElement | null {
  if (!node || typeof node !== 'object') return null;
  const element = node as StubElement;
  if (element.type === type) return element;
  for (const child of element.children ?? []) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  // JSX concatenates an element's children, so the text nodes join with nothing.
  return (node as StubElement).children.map(textOf).join('');
}

interface RenderedCard {
  /** The button's own `disabled` prop — the property a browser would act on. */
  disabled: unknown;
  /** The button's visible label, whitespace-collapsed. */
  label: string;
}

/**
 * Render ONE card from a given declaration. The shipped source is what the
 * tests assert against; a mutated declaration is how the controls below show
 * the guard is sensitive to the wiring it pins.
 */
function renderCard(
  declaration: string,
  profile: PlayerProfile,
  opponent: OpponentConfig,
  rematchTier?: number
): RenderedCard {
  const factory = new Function(
    'React',
    'resolveBoutLevelGate',
    'sounds',
    'Swords',
    'Lock',
    'CheckCircle',
    transpileCard(declaration)
  ) as (...args: unknown[]) => (props: {
    profile: PlayerProfile;
    opponent: OpponentConfig;
    onSelectOpponent: (opp: OpponentConfig) => void;
    rematchTier?: number;
  }) => StubElement;

  const Card = factory(
    STUB_REACT,
    resolveBoutLevelGate,
    { playClick: () => {} },
    'Swords',
    'Lock',
    'CheckCircle'
  );
  const tree = Card({ profile, opponent, onSelectOpponent: () => {}, rematchTier });
  const button = findElement(tree, 'button');
  if (!button) throw new Error('OpponentCard rendered no button');
  return {
    disabled: button.props.disabled,
    label: textOf(button).replace(/\s+/g, ' ').trim(),
  };
}

describe('§G — L20a: the card’s gate result reaches the button', () => {
  test('the card binds the shared gate to `isLocked` and `isLocked` to `disabled`', () => {
    // The gate, read as one compact expression: the same three arguments the
    // rest of the arena passes, and the `.locked` field as the answer.
    expect(squash(CARD_SOURCE)).toContain(
      squash(
        'const isLocked = resolveBoutLevelGate(profile.level, opp, profile.defeatedOpponentIds).locked;'
      )
    );
    // ...and that boolean is the button's own `disabled` prop, verbatim.
    expect(disabledBinding(CARD_SOURCE)).toBe('isLocked');
    // No second level rule may decide the card.
    expect(squash(CARD_SOURCE)).not.toContain(squash('profile.level < opp.recommendedLevel'));
  });

  test('a locked opponent’s button is disabled and says Locked (Requires LVL n)', () => {
    const gate = resolveBoutLevelGate(
      path.profile.level,
      AURELIUS,
      path.profile.defeatedOpponentIds
    );
    expect(gate).toEqual({ locked: true, requiredLevel: 10 });

    const card = renderCard(CARD_SOURCE, path.profile, AURELIUS);
    expect(card.disabled).toBe(true);
    expect(card.label).toBe('Locked (Requires LVL 10)');
  });

  test('the same fighter is enabled once the gate opens — the gate decides, not the copy', () => {
    const ready = { ...path.profile, level: 10 };
    expect(
      resolveBoutLevelGate(ready.level, AURELIUS, ready.defeatedOpponentIds)
    ).toEqual({ locked: false, requiredLevel: 10 });

    const card = renderCard(CARD_SOURCE, ready, AURELIUS);
    expect(card.disabled).toBe(false);
    expect(card.label).toBe('Enter Arena Duel');
  });

  test('an eligible rank match keeps its action label and a live button', () => {
    const fresh = createNewProfile('Card guard');
    const marcus = opponentById('opp_marcus');
    expect(resolveBoutLevelGate(fresh.level, marcus, fresh.defeatedOpponentIds)).toEqual({
      locked: false,
      requiredLevel: 1,
    });

    const card = renderCard(CARD_SOURCE, fresh, marcus);
    expect(card.disabled).toBe(false);
    expect(card.label).toBe('Enter Arena Duel');
    // ...and the very same card, short of Flaccus's level, is locked: the
    // disabled state is data-driven, not a property of the card.
    const flaccus = opponentById('opp_flaccus');
    const flaccusCard = renderCard(CARD_SOURCE, fresh, flaccus);
    expect(flaccusCard.disabled).toBe(true);
    expect(flaccusCard.label).toBe(`Locked (Requires LVL ${flaccus.recommendedLevel})`);
  });

  test('earlier-division rematches are only beaten fighters, and each is enabled', () => {
    const bouts = listTournamentBouts(
      path.profile.currentTier,
      path.profile.defeatedOpponentIds
    );
    expect(bouts.rematches.length).toBe(path.profile.defeatedOpponentIds.length);

    for (const bout of bouts.rematches) {
      // Offered only because the record says so...
      expect(path.profile.defeatedOpponentIds).toContain(bout.opponent.id);
      // ...and therefore always a live button, whatever its recommended level.
      expect(
        resolveBoutLevelGate(path.profile.level, bout.opponent, path.profile.defeatedOpponentIds)
          .locked
      ).toBe(false);
      const card = renderCard(CARD_SOURCE, path.profile, bout.opponent, bout.opponent.tier);
      expect(card.disabled).toBe(false);
      expect(card.label).toBe('Fight Again (Rematch)');
    }
  });

  test('the guard fails if the disabled binding or the locked label is disconnected', () => {
    // The shipped card, as the controls' baseline.
    expect(renderCard(CARD_SOURCE, path.profile, AURELIUS).disabled).toBe(true);

    // (1) The binding removed: the button has no `disabled` prop at all.
    const noBinding = CARD_SOURCE.replace('disabled={isLocked}', '');
    expect(noBinding).not.toBe(CARD_SOURCE);
    expect(disabledBinding(noBinding)).toBeNull();
    expect(renderCard(noBinding, path.profile, AURELIUS).disabled).toBeUndefined();

    // (2) The binding left in place but disconnected from the gate.
    const deadBinding = CARD_SOURCE.replace('disabled={isLocked}', 'disabled={false}');
    expect(deadBinding).not.toBe(CARD_SOURCE);
    expect(renderCard(deadBinding, path.profile, AURELIUS).disabled).toBe(false);

    // (3) The locked label branch removed: a disabled button that says "Enter".
    const noLockedLabel = CARD_SOURCE.replace(': isLocked ? (', ': false ? (');
    expect(noLockedLabel).not.toBe(CARD_SOURCE);
    const mislabelled = renderCard(noLockedLabel, path.profile, AURELIUS);
    expect(mislabelled.disabled).toBe(true);
    expect(mislabelled.label).toBe('Enter Arena Duel');
    expect(mislabelled.label).not.toBe('Locked (Requires LVL 10)');
  });
});

/** The settlement still runs through the one handler, unchanged by this phase. */
function appSourceHasSettlement(): boolean {
  const body = extractHandler('handleMatchComplete');
  return (
    body.includes('duelSettlementRef.current.claim(settledDuelId)') &&
    body.includes('currentTier: tierAfterVictory.currentTier,') &&
    body.includes('defeatedOpponentIds: defeated,')
  );
}
