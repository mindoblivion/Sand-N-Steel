/**
 * L13A — the duel settlement is built from the NEWEST committed profile.
 *
 * ── THE DEFECT THIS SUITE REPRODUCES ──────────────────────────────────────
 * `DuelScene` reports an outcome 1400 ms after the deciding blow, and that call
 * deliberately outlives the scene (an Armory exit must not drop an earned purse),
 * so App can receive it from a render that no longer exists. `handleMatchComplete`
 * used to read the render's `profile` state as its settlement base. That object can
 * be one or more commits behind — another bout settling, a sale, a purchase, a
 * rest — so a delayed callback rebuilt the profile from the OLD snapshot and wrote
 * it back, silently dropping every mutation committed since that render.
 *
 * ── WHAT IS EXECUTED, AND WHAT IS MODELLED ────────────────────────────────
 * There is no DOM renderer in this repo, so `<App/>` cannot be mounted. Instead of
 * re-implementing the handler beside the real one, this suite extracts App's own
 * `evaluateRituals`, `handleSellItem` and `handleMatchComplete` source text from
 * `src/App.tsx` (brace-matched, comments stripped), transpiles it with Bun's own
 * transpiler and runs it against the REAL `sellItem`, `advanceCityDay`,
 * `settleInjury`, `resolveVictoryTier`, `evaluateRoadMilestones` and
 * `createDuelSettlementLatch`. Only React is modelled: `profile` is the render's
 * captured snapshot (a `new Function` parameter, so it cannot change during the
 * test — exactly what a captured closure does), `setProfile` records the commit and
 * `render()` copies it into the ref, the way App's effect does.
 *
 * The sequence the suite drives is the reported one:
 *   1. a render captures P₀ and hands the scene its settlement callback;
 *   2. a real sale (`handleSellItem` → the real `sellItem`) commits P₁;
 *   3. the delayed callback from step 1 fires, long after that render;
 *   4. P₁'s mutation must survive, with the fight's rewards, the turned day and the
 *      spent injury applied exactly once on top of it.
 *
 *   §A  the extraction guard — the executed text really is App's source, and the
 *       commit order (ref, state, disk) is pinned in both outcome branches;
 *   §B  THE CRITICAL REGRESSION — the sale survives the delayed settlement;
 *   §C  the clock, the injury and the rewards are applied once, on the latest base;
 *   §D  a replayed settlement writes nothing at all (latch, no save, no day);
 *   §E  a stale bout id and a missing profile are refused without writing;
 *   §F  the CONTROL — with the ref fallback spliced out (the pre-hardening shape)
 *       the very same sequence loses the sale, so §B is sensitive to the fix;
 *   §G  the settlement's own herald: a stage the bout wins is cried once by the real
 *       settlement, a stage without a cry says nothing, and a later bout that
 *       re-treads the road is silent (L13D — the recorder §A–§F built was unasserted).
 *
 * Run with: `bun test src/utils/duelSettlementCommit.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { DuelStatistics, PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { ALL_OPPONENTS } from '../data/opponents';
import { STARTING_SPARE_WEAPON } from '../data/itemsDB';
import { getSellValue, sellItem } from './selling';
import { advanceCityDay } from './cityClock';
import { settleInjury } from './injurySettlement';
import { resolveVictoryTier } from './tierAdvancement';
import { createDuelSettlementLatch } from './duelSettlement';
import { evaluateRoadMilestones } from './roadMilestones';
import { VETERAN_FAME, VETERAN_TIER, deriveRank } from './rank';

// ── App's real handler source ──────────────────────────────────────────────
const APP_SRC = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** The declarations this suite executes — all three are App's own source. */
const HANDLERS = ['evaluateRituals', 'handleSellItem', 'handleMatchComplete'] as const;

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

type SettlementHandlers = {
  handleMatchComplete: (stats: DuelStatistics, didWin: boolean, settledDuelId: number) => void;
  handleSellItem: (item: { id: string }) => void;
};

// ── Fixtures ───────────────────────────────────────────────────────────────
/** A non-boss tier-1 opponent: a first win reaches `blooded`, never a new tier. */
const OPPONENT = ALL_OPPONENTS.find((opponent) => !opponent.isBoss)!;
const SPARE = STARTING_SPARE_WEAPON;

/** Start on day 3, carrying a live injury, so the clock and the wound both move. */
const CAPTURED_DAY = 3;
const fresh = (): PlayerProfile =>
  ({
    ...createNewProfile('L13A'),
    gold: 500,
    fame: 10,
    xp: 0,
    level: 1,
    xpToNextLevel: 1000,
    unspentStatPoints: 0,
    fightsWon: 0,
    fightsLost: 0,
    defeatedOpponentIds: [],
    currentTier: 1,
    peakCrowdHypeOverall: 0,
    injury: { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 },
    city: { day: CAPTURED_DAY },
  }) as PlayerProfile;

/** The purse the scene writes onto the ONE stats object App credits. */
const STATS: DuelStatistics = {
  damageDealt: 42,
  damageTaken: 7,
  hitsLanded: 6,
  perfectBlocks: 2,
  dodgesPerformed: 1,
  maxCombo: 3,
  crowdHypePeak: 61,
  durationSeconds: 24,
  goldEarned: 90,
  fameEarned: 12,
  xpEarned: 40,
};

const goldOf = (profile: PlayerProfile | null | undefined): number => profile?.gold ?? -1;
const carries = (profile: PlayerProfile | null | undefined, id: string): boolean =>
  (profile?.inventory ?? []).some((owned) => owned?.id === id);

/**
 * The App-local pieces the executed handler closes over, modelled the way React
 * wires them. `profile` is the render's captured snapshot and never changes;
 * `profileRef` is the live commit; `render()` is the effect that copies state into it.
 */
function createHarness(
  captured: PlayerProfile | null,
  live: PlayerProfile | null,
  source = HANDLER_SOURCE
) {
  const ref: { current: PlayerProfile | null } = { current: live };
  const renders: Array<PlayerProfile | null> = [];
  const saves: PlayerProfile[] = [];
  const duelResults: Array<{ didWin: boolean; injury: unknown }> = [];
  const cries: string[][] = [];
  const deviceOffers: boolean[] = [];
  let pending: PlayerProfile | null = live;

  const setProfile = (next: PlayerProfile | null) => {
    pending = next;
    renders.push(next);
  };
  const saveProfile = (profile: PlayerProfile) => {
    saves.push(profile);
  };
  const setDuelResult = (result: { didWin: boolean; injury: unknown }) => {
    duelResults.push(result);
  };
  const setHeraldCries = (updater: (previous: string[]) => string[]) => {
    cries.push(updater(cries.length ? cries[cries.length - 1] : []));
  };
  const setDeviceChoiceOpen = (open: boolean) => {
    deviceOffers.push(open);
  };

  const latch = createDuelSettlementLatch();

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
    toJavaScript(source)
  ) as (...args: unknown[]) => SettlementHandlers;

  const handlers = factory(
    sellItem,
    evaluateRoadMilestones,
    setHeraldCries,
    setDeviceChoiceOpen,
    advanceCityDay,
    settleInjury,
    resolveVictoryTier,
    ref,
    captured,
    setProfile,
    saveProfile,
    { current: latch },
    OPPONENT,
    setDuelResult
  );

  return {
    ref,
    latch,
    handlers,
    renders,
    saves,
    duelResults,
    cries,
    deviceOffers,
    /** A React re-render: the profile effect copies state into the ref. */
    render: () => {
      ref.current = pending;
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════
describe('§A the executed handler is App’s own source, and commits in one order', () => {
  test('all three declarations are found verbatim in src/App.tsx', () => {
    for (const name of HANDLERS) {
      const source = extractHandler(name);
      expect(source.startsWith(`const ${name} = `)).toBe(true);
      expect(APP_SRC).toContain(source);
    }
  });

  test('the settlement derives its base from the newest committed profile', () => {
    const body = extractHandler('handleMatchComplete');
    // The ref first, the render's snapshot only as the first-render fallback.
    expect(body).toContain('const base = profileRef.current ?? profile;');
    // Nothing inside the settlement reads the render snapshot directly any more.
    expect(body).not.toContain('profile.gold');
    expect(body).not.toContain('profile.fame');
    expect(body).not.toContain('profile.xp');
    expect(body).not.toContain('profile.level');
    expect(body).not.toContain('profile.defeatedOpponentIds');
    expect(body).not.toContain('profile.currentTier');
    expect(body).not.toContain('advanceCityDay(profile)');
    expect(body).not.toContain('settleInjury(profile');
  });

  test('the latch is claimed before the clock, and nothing else consumes it', () => {
    const body = extractHandler('handleMatchComplete');
    const claim = body.indexOf('if (!duelSettlementRef.current.claim(settledDuelId)) return;');
    const advance = body.indexOf('advanceCityDay(base)');
    expect(claim).toBeGreaterThan(-1);
    expect(advance).toBeGreaterThan(claim);
    expect(body.match(/\.claim\(/g)?.length).toBe(1);
    // The null-base guard sits before the claim, where the null-profile guard was.
    expect(body.indexOf('if (!base) return;')).toBeLessThan(claim);
  });

  test('ref, state and disk receive the same object, in that order, once per branch', () => {
    const body = extractHandler('handleMatchComplete');
    expect(body.match(/profileRef\.current = settledProfile;/g)?.length).toBe(2);
    expect(body.match(/setProfile\(settledProfile\)/g)?.length).toBe(2);
    expect(body.match(/saveProfile\(settledProfile\)/g)?.length).toBe(2);

    // Both branches: ref → state → disk, each strictly after the previous.
    const occurrences = [...body.matchAll(/profileRef\.current = settledProfile;/g)].map(
      (match) => match.index as number
    );
    expect(occurrences.length).toBe(2);
    for (const refWrite of occurrences) {
      const setState = body.indexOf('setProfile(settledProfile)', refWrite);
      const save = body.indexOf('saveProfile(settledProfile)', setState);
      expect(setState).toBeGreaterThan(refWrite);
      expect(save).toBeGreaterThan(setState);
    }
  });

  test('the handler holds no reference to the scene, so an unmount cannot strand it', () => {
    const body = extractHandler('handleMatchComplete');
    for (const forbidden of [
      'DuelScene',
      'onMatchComplete',
      'setTimeout',
      'clearTimeout',
      'unmount',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§B THE CRITICAL REGRESSION — a sale survives the delayed settlement', () => {
  test('the settlement keeps the sale committed after the render that armed it', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    const bout = harness.latch.arm();

    // 1. A real sale through App's own handler: the ref, state and disk commit P₁.
    const saleValue = getSellValue(captured, SPARE.id);
    expect(saleValue).toBeGreaterThan(0);
    harness.handlers.handleSellItem(SPARE);
    harness.render();
    const afterSale = harness.ref.current!;
    expect(afterSale).not.toBe(captured);
    expect(harness.saves.length).toBe(1);
    expect(goldOf(afterSale)).toBe(500 + saleValue);
    expect(carries(afterSale, SPARE.id)).toBe(false);

    // 2. The delayed callback fires from the render that captured P₀.
    harness.handlers.handleMatchComplete(STATS, true, bout);

    // 3. The one written profile carries BOTH: the sale AND the settlement.
    expect(harness.saves.length).toBe(2);
    const saved = harness.saves[1];
    expect(goldOf(saved)).toBe(500 + saleValue + STATS.goldEarned);
    expect(carries(saved, SPARE.id)).toBe(false); // the sale was not undone
    expect(saved.fame).toBe(captured.fame + STATS.fameEarned);
    expect(saved.xp).toBe(STATS.xpEarned);
    expect(saved.fightsWon).toBe(1);
    expect(saved.defeatedOpponentIds).toEqual([OPPONENT.id]);

    // 4. One identical object through all three channels.
    expect(harness.ref.current).toBe(saved);
    expect(harness.renders[harness.renders.length - 1]).toBe(saved);
  });

  test('a mutation of a DIFFERENT field is preserved too (the base is the whole profile)', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    const bout = harness.latch.arm();

    // A mutation committed outside the harness' own transaction shape.
    const mutated = { ...captured, gold: 40, city: { day: 9 }, name: 'Renamed' } as PlayerProfile;
    harness.ref.current = mutated;

    harness.handlers.handleMatchComplete(STATS, true, bout);
    const saved = harness.saves[0];
    expect(saved.name).toBe('Renamed');
    expect(goldOf(saved)).toBe(40 + STATS.goldEarned);
    expect(saved.city?.day).toBe(10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§C the clock, the wound and the rewards are applied once, on the latest base', () => {
  test('the day advances exactly once and rides the same saved object', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    harness.handlers.handleMatchComplete(STATS, true, harness.latch.arm());

    expect(harness.saves.length).toBe(1);
    const saved = harness.saves[0];
    expect(saved.city?.day).toBe(CAPTURED_DAY + 1);
    // The clock and the purse are the same object, not two writes.
    expect(saved.gold).toBe(500 + STATS.goldEarned);
    expect(advanceCityDay(captured).city.day).toBe(CAPTURED_DAY + 1);
  });

  test('an injury carried into the fight is spent by it, once', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    harness.handlers.handleMatchComplete(STATS, true, harness.latch.arm());

    expect(harness.saves[0].injury).toEqual(settleInjury(captured, true).injury ?? null);
    expect(harness.saves[0].injury?.fightsRemaining).toBe(1);
    // …and the result screen was handed that same settled injury.
    expect(harness.duelResults.length).toBe(1);
    expect(harness.duelResults[0].didWin).toBe(true);
    expect(harness.duelResults[0].injury).toEqual(harness.saves[0].injury);
  });

  test('a defeat counts the loss, inflicts the wound and pays nothing', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    harness.handlers.handleMatchComplete({ ...STATS, goldEarned: 0 }, false, harness.latch.arm());

    const saved = harness.saves[0];
    expect(saved.fightsLost).toBe(1);
    expect(goldOf(saved)).toBe(500);
    expect(saved.city?.day).toBe(CAPTURED_DAY + 1);
    // The fresh 2-fight injury replaces the one the bout spent (the L7 ordering rule).
    expect(saved.injury?.fightsRemaining).toBe(2);
    expect(
      resolveVictoryTier({
        currentTier: captured.currentTier,
        opponent: OPPONENT,
        defeatedOpponentIds: captured.defeatedOpponentIds,
      }).currentTier
    ).toBe(captured.currentTier);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§D a replayed settlement writes nothing at all', () => {
  test('the same bout id cannot settle twice: no save, no pay, no day, no render', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    const bout = harness.latch.arm();

    harness.handlers.handleMatchComplete(STATS, true, bout);
    expect(harness.saves.length).toBe(1);
    expect(harness.renders.length).toBe(1);
    const settled = harness.saves[0];
    const settledDay = settled.city?.day;
    const settledGold = settled.gold;

    harness.handlers.handleMatchComplete(STATS, true, bout);

    expect(harness.saves.length).toBe(1);
    expect(harness.renders.length).toBe(1);
    expect(harness.ref.current).toBe(settled);
    expect(goldOf(harness.ref.current)).toBe(settledGold);
    expect(harness.ref.current?.city?.day).toBe(settledDay);
    // The result screen is not opened a second time either.
    expect(harness.duelResults.length).toBe(1);
  });

  test('a later bout settles normally on top of the first one', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    harness.handlers.handleMatchComplete(STATS, true, harness.latch.arm());
    harness.render();
    harness.handlers.handleMatchComplete(STATS, true, harness.latch.arm());

    expect(harness.saves.length).toBe(2);
    expect(harness.saves[1].city?.day).toBe(CAPTURED_DAY + 2);
    expect(goldOf(harness.saves[1])).toBe(500 + STATS.goldEarned * 2);
    expect(harness.saves[1].fightsWon).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§E refusals write nothing', () => {
  test('a bout id that was never armed is refused before anything is computed', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    harness.latch.arm();

    harness.handlers.handleMatchComplete(STATS, true, 99);

    expect(harness.saves.length).toBe(0);
    expect(harness.renders.length).toBe(0);
    expect(harness.ref.current).toBe(captured);
    expect(harness.duelResults.length).toBe(0);
  });

  test('a settled bout arriving out of order is refused', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    const first = harness.latch.arm();
    const second = harness.latch.arm();

    harness.handlers.handleMatchComplete(STATS, true, second);
    const savedOnce = harness.saves.length;
    harness.handlers.handleMatchComplete(STATS, true, first);

    expect(savedOnce).toBe(1);
    expect(harness.saves.length).toBe(1);
  });

  test('no profile at all settles nothing', () => {
    const harness = createHarness(null, null);
    harness.handlers.handleMatchComplete(STATS, true, harness.latch.arm());
    expect(harness.saves.length).toBe(0);
    expect(harness.renders.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§F CONTROL — the pre-hardening shape loses the sale', () => {
  /** The shipped source with the ref fallback reverted to the render snapshot. */
  const LEGACY_SOURCE = HANDLER_SOURCE.replace('profileRef.current ?? profile', 'profile');

  test('the control really is the pre-fix shape', () => {
    expect(LEGACY_SOURCE).not.toBe(HANDLER_SOURCE);
    expect(LEGACY_SOURCE).toContain('const base = profile;');
    expect(LEGACY_SOURCE).not.toContain('profileRef.current ?? profile');
  });

  test('replaying the same sequence on the old shape silently drops the sale', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured, LEGACY_SOURCE);
    const bout = harness.latch.arm();

    const saleValue = getSellValue(captured, SPARE.id);
    harness.handlers.handleSellItem(SPARE);
    harness.render();
    harness.handlers.handleMatchComplete(STATS, true, bout);

    const saved = harness.saves[1];
    // The defect: the settlement rebuilt from P₀, so the purse never received the
    // sale's gold and the sold weapon is back in the inventory.
    expect(goldOf(saved)).toBe(500 + STATS.goldEarned);
    expect(goldOf(saved)).not.toBe(500 + saleValue + STATS.goldEarned);
    expect(carries(saved, SPARE.id)).toBe(true);
  });

  test('the shipped shape passes the identical assertions', () => {
    const captured = fresh();
    const harness = createHarness(captured, captured);
    const bout = harness.latch.arm();
    const saleValue = getSellValue(captured, SPARE.id);

    harness.handlers.handleSellItem(SPARE);
    harness.render();
    harness.handlers.handleMatchComplete(STATS, true, bout);

    const saved = harness.saves[1];
    expect(goldOf(saved)).toBe(500 + saleValue + STATS.goldEarned);
    expect(carries(saved, SPARE.id)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§G the settlement is what raises the herald’s cry', () => {
  /** Five fame short of Veteran, on the tier-2 circuit: this bout crosses the gate. */
  const veteranOnTheDay = (overrides: Partial<PlayerProfile> = {}): PlayerProfile =>
    ({
      ...fresh(),
      name: 'Audax',
      fame: VETERAN_FAME - 5,
      currentTier: VETERAN_TIER,
      ...overrides,
    }) as PlayerProfile;

  const VETERAN_CRY = 'The herald cries: Audax, Veteran of the Ludus!';

  test('a stage the bout wins is cried once, by the real settlement', () => {
    const captured = veteranOnTheDay();
    // The gate really is closed by this bout, not before it.
    expect(deriveRank(captured)).toBe('Rookie');
    const harness = createHarness(captured, captured);

    harness.handlers.handleMatchComplete(STATS, true, harness.latch.arm());

    // …and the settlement is what crossed it, recording the road on the way.
    const saved = harness.saves[0];
    expect(deriveRank(saved)).toBe('Veteran');
    expect(saved.road?.milestonesSeen).toEqual(['sworn', 'blooded', 'known']);

    // The herald was called exactly once, and said exactly the one thing this bout won.
    expect(harness.cries.length).toBe(1);
    expect(harness.cries[0]).toEqual([VETERAN_CRY]);
    // No other stage's cry, and no boss cry, rides along with it.
    expect(harness.cries[0].some((cry) => cry.includes('Champion of Rome'))).toBe(false);
    expect(harness.cries[0].some((cry) => cry.includes('has fallen'))).toBe(false);
  });

  test('a bout that reaches only a stage without a cry says nothing', () => {
    // A first win reaches `blooded`, which is recorded but has no cry of its own.
    const captured = fresh();
    const harness = createHarness(captured, captured);

    harness.handlers.handleMatchComplete(STATS, true, harness.latch.arm());

    expect(harness.saves[0].road?.milestonesSeen).toEqual(['sworn', 'blooded']);
    expect(harness.cries).toEqual([]);
  });

  test('a later bout re-treading the same stage does not cry again', () => {
    const captured = veteranOnTheDay();
    const harness = createHarness(captured, captured);

    harness.handlers.handleMatchComplete(STATS, true, harness.latch.arm());
    harness.render();
    expect(harness.cries.length).toBe(1);

    harness.handlers.handleMatchComplete(STATS, true, harness.latch.arm());

    // The second win advanced nothing on the road, so the herald is not called at all.
    expect(harness.saves.length).toBe(2);
    expect(harness.cries.length).toBe(1);
    expect(harness.cries[0]).toEqual([VETERAN_CRY]);
  });
});
