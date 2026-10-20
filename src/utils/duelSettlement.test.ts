/**
 * L1 verification gate (Living City) — the duel settlement's exactly-once,
 * per-bout latch, and the settlement it guards.
 *
 * Why this suite exists. `DuelScene` calls `onMatchComplete` **1400 ms after the
 * deciding blow**, and that call deliberately outlives the scene (leaving through
 * the HUD's Armory badge must not drop an earned purse). App's first L1 latch was
 * a single boolean, which cannot tell a repeated callback for the SAME bout from
 * a callback for a bout that has already finished — so a late settlement could
 * consume a newer bout's latch and that newer bout was then never paid. The gate
 * gives every bout an id (`utils/duelSettlement.ts`) and claims that id.
 *
 * Registers, as the neighbouring suites use them: behaviour for the pure latch and
 * for a mirror of App's settlement arithmetic, ordered source assertions for the
 * React wiring this repo has no DOM renderer for. **The mirror is not App** — the
 * App-level orchestration is pinned by those source assertions, not executed here —
 * so nothing below claims a React runtime proof.
 *
 * Run with: `bun test src/utils/duelSettlement.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

// ── In-memory localStorage polyfill (the `cityClock` precedent) ─────────────
const _store = new Map<string, string>();
// @ts-ignore — assign to global before storage.ts is used
globalThis.localStorage = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => { _store.set(key, value); },
  removeItem: (key: string) => { _store.delete(key); },
  clear: () => { _store.clear(); },
};

import type { PlayerProfile } from '../types/game';
import {
  PROFILE_STORAGE_KEY,
  createNewProfile,
  loadSavedProfile,
  saveProfile,
} from '../services/storage';
import { advanceCityDay, resolveCityDay } from './cityClock';
import { createDuelSettlementLatch } from './duelSettlement';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const sceneSource = readFileSync(new URL('../components/duel/DuelScene.tsx', import.meta.url), 'utf8');
const latchSource = readFileSync(new URL('./duelSettlement.ts', import.meta.url), 'utf8');

/** The slice of `source` from `start` (inclusive) up to `end` (exclusive). */
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return '';
  return source.slice(from, to);
}

const creditHandler = between(appSource, 'const handleMatchComplete', 'const handleDuelResultDismiss');
const duelEntry = between(appSource, 'const handleEnterDuel', 'const handleStartRace');

/** A legacy save: exactly what a pre-L1 build left behind (no `city` field). */
function legacy(): PlayerProfile {
  const profile = createNewProfile('Gate Tester');
  delete (profile as { city?: unknown }).city;
  return profile;
}

/**
 * The settlement `App.handleMatchComplete` performs for one completed bout,
 * mirrored: the bout is claimed once, and the fight's purse and the day turn land
 * in the SAME profile object (no second clock-only write).
 */
function settleDuel(
  profile: PlayerProfile,
  latch: { claim(id: number): boolean },
  boutId: number,
  didWin: boolean,
  purse: number
): PlayerProfile {
  // A refused claim settles nothing: the caller's own profile comes back.
  if (!latch.claim(boutId)) return profile;
  return {
    ...profile,
    gold: didWin ? profile.gold + purse : profile.gold,
    fightsWon: didWin ? profile.fightsWon + 1 : profile.fightsWon,
    fightsLost: didWin ? profile.fightsLost : profile.fightsLost + 1,
    city: advanceCityDay(profile).city,
  };
}

// ── §A. The latch: one id, one claim ───────────────────────────────────────

describe('§A — the latch claims a bout id, never "the current one"', () => {
  test('arm() hands out increasing ids and currentId follows them', () => {
    const latch = createDuelSettlementLatch();
    expect(latch.currentId()).toBe(0);
    expect(latch.arm()).toBe(1);
    expect(latch.currentId()).toBe(1);
    expect(latch.arm()).toBe(2);
    expect(latch.currentId()).toBe(2);
  });

  test('a bout settles once: the first claim is true, every replay is false', () => {
    const latch = createDuelSettlementLatch();
    const id = latch.arm();

    expect(latch.claim(id)).toBe(true);
    expect(latch.claim(id)).toBe(false);
    expect(latch.claim(id)).toBe(false);
  });

  test('an id that was never armed cannot settle', () => {
    const latch = createDuelSettlementLatch();
    // Nothing armed at all.
    for (const bad of [0, -1, 1, 2, 1.5, NaN, Infinity, -Infinity]) {
      expect(latch.claim(bad)).toBe(false);
    }

    const id = latch.arm();
    expect(latch.claim(id + 1)).toBe(false); // the future
    expect(latch.claim(id + 2)).toBe(false);
  });

  test('an older bout cannot settle once a newer bout has settled', () => {
    const latch = createDuelSettlementLatch();
    const first = latch.arm();
    const second = latch.arm();

    expect(latch.claim(second)).toBe(true);
    // Out of order: this would replay a stale profile snapshot over newer data.
    expect(latch.claim(first)).toBe(false);
  });

  test('a late callback for the PREVIOUS bout is accepted while the new bout is unsettled', () => {
    const latch = createDuelSettlementLatch();
    const first = latch.arm();
    const second = latch.arm();

    // The old bout's purse is earned, so its own settlement is honoured…
    expect(latch.claim(first)).toBe(true);
    expect(latch.claim(first)).toBe(false);
    // …and it cannot have consumed the new bout, which still settles itself.
    expect(latch.currentId()).toBe(second);
    expect(latch.claim(second)).toBe(true);
    expect(latch.claim(second)).toBe(false);
  });

  test('arming a new bout never resurrects an id that already settled', () => {
    const latch = createDuelSettlementLatch();
    const first = latch.arm();
    expect(latch.claim(first)).toBe(true);

    latch.arm();
    latch.arm();
    expect(latch.claim(first)).toBe(false);
  });
});

// ── §B. The settlement the latch guards ────────────────────────────────────

describe('§B — one completed bout turns the day once, and pays once', () => {
  test('victory: day 1 -> 2 exactly once, and the purse lands with it', () => {
    const latch = createDuelSettlementLatch();
    const bout = latch.arm();
    const before = legacy();
    expect(resolveCityDay(before)).toBe(1);

    const settled = settleDuel(before, latch, bout, true, 120);

    expect(resolveCityDay(settled)).toBe(2);
    expect(settled.gold).toBe(before.gold + 120);
    expect(settled.fightsWon).toBe(before.fightsWon + 1);
    expect(settled.fightsLost).toBe(before.fightsLost);

    // A repeated callback for the SAME bout changes nothing at all.
    const replayed = settleDuel(before, latch, bout, true, 120);
    expect(replayed).toBe(before);
    expect(resolveCityDay(replayed)).toBe(1);
    expect(replayed.gold).toBe(before.gold);
  });

  test('defeat: day 2 -> 3 exactly once, and no purse', () => {
    const latch = createDuelSettlementLatch();
    const before: PlayerProfile = { ...legacy(), city: { day: 2 }, gold: 300 };
    const bout = latch.arm();

    const settled = settleDuel(before, latch, bout, false, 999);

    expect(resolveCityDay(settled)).toBe(3);
    expect(settled.gold).toBe(300);
    expect(settled.fightsLost).toBe(before.fightsLost + 1);
    expect(settled.fightsWon).toBe(before.fightsWon);

    expect(settleDuel(before, latch, bout, false, 999)).toBe(before);
  });

  test('a new bout after a completed bout settles normally', () => {
    const latch = createDuelSettlementLatch();
    let profile = legacy();

    const firstBout = latch.arm();
    profile = settleDuel(profile, latch, firstBout, true, 100);
    expect(resolveCityDay(profile)).toBe(2);

    const secondBout = latch.arm();
    profile = settleDuel(profile, latch, secondBout, true, 40);

    expect(resolveCityDay(profile)).toBe(3);
    expect(profile.gold).toBe(legacy().gold + 100 + 40);
    expect(profile.fightsWon).toBe(legacy().fightsWon + 2);
  });

  test('a stale callback from the previous bout cannot settle the current one', () => {
    const latch = createDuelSettlementLatch();
    const firstBout = latch.arm();
    const start = legacy();

    // Bout 1 is decided, but its 1400 ms callback has not fired when the player
    // has already entered bout 2.
    const secondBout = latch.arm();
    const staleCallback = settleDuel(start, latch, firstBout, true, 100);

    // It settled ITS OWN bout — its purse, its one day — and nothing of bout 2's:
    expect(resolveCityDay(staleCallback)).toBe(2);
    expect(staleCallback.gold).toBe(start.gold + 100);
    expect(latch.currentId()).toBe(secondBout);

    // Bout 2 then settles itself on the profile bout 1's payment produced.
    const secondSettlement = settleDuel(staleCallback, latch, secondBout, false, 0);
    expect(resolveCityDay(secondSettlement)).toBe(3);
    expect(secondSettlement.gold).toBe(start.gold + 100);
    expect(secondSettlement.fightsLost).toBe(start.fightsLost + 1);

    // And bout 1's callback, arriving again, is inert.
    expect(settleDuel(secondSettlement, latch, firstBout, true, 100)).toBe(secondSettlement);
  });

  test('a repeated callback after a NEW bout begins is refused (no second purse, no second day)', () => {
    const latch = createDuelSettlementLatch();
    const firstBout = latch.arm();
    const before = legacy();

    const settled = settleDuel(before, latch, firstBout, true, 100);
    expect(resolveCityDay(settled)).toBe(2);

    latch.arm(); // the player starts another bout
    const replay = settleDuel(settled, latch, firstBout, true, 100);

    expect(replay).toBe(settled);
    expect(resolveCityDay(replay)).toBe(2);
    expect(replay.gold).toBe(before.gold + 100);
  });

  test('abandoning a bout before settlement leaves the day and the purse untouched', () => {
    const latch = createDuelSettlementLatch();
    const before: PlayerProfile = { ...legacy(), city: { day: 4 }, gold: 250 };

    // Opening the duel arms the latch; leaving through the Armory (or cancelling)
    // never reaches the settlement, so nothing is ever claimed.
    const bout = latch.arm();
    expect(bout).toBe(1);
    expect(latch.claim(2)).toBe(false);

    const after = before;
    expect(resolveCityDay(after)).toBe(4);
    expect(after.gold).toBe(250);
    // The abandoned bout never becomes claimable: only settlement claims.
    expect(latch.currentId()).toBe(1);
  });

  test('the day and the rewards ride the SAME settled object and the SAME save', () => {
    const latch = createDuelSettlementLatch();
    const bout = latch.arm();
    const before = legacy();

    const settled = settleDuel(before, latch, bout, true, 75);

    // One object carries both, so no clock-only write can race the purse.
    expect(settled.city?.day).toBe(2);
    expect(settled.gold).toBe(before.gold + 75);

    saveProfile(settled);
    const loaded = loadSavedProfile()!;

    expect(loaded.city?.day).toBe(2);
    expect(loaded.gold).toBe(before.gold + 75);
    expect(loaded.fightsWon).toBe(before.fightsWon + 1);
    // Still the one existing key — no second save was introduced.
    expect([..._store.keys()]).toEqual([PROFILE_STORAGE_KEY]);
  });

  test('a legacy save stays compatible: day 1, and the first settlement writes day 2', () => {
    const before = legacy();
    expect('city' in before).toBe(false);
    expect(resolveCityDay(before)).toBe(1);

    // Loading never rewrites the save to add the field.
    saveProfile(before);
    const written = _store.get(PROFILE_STORAGE_KEY)!;
    expect(loadSavedProfile()).not.toBeNull();
    expect(_store.get(PROFILE_STORAGE_KEY)).toBe(written);
    expect(written).not.toContain('"city"');

    const latch = createDuelSettlementLatch();
    saveProfile(settleDuel(before, latch, latch.arm(), false, 0));
    const reloaded = loadSavedProfile()!;
    expect(reloaded.city?.day).toBe(2);
    expect(reloaded.fightsLost).toBe(before.fightsLost + 1);
  });

  test('the whole-profile cloud serialization keeps the day and the purse', () => {
    const latch = createDuelSettlementLatch();
    const before = legacy();
    const settled = settleDuel(before, latch, latch.arm(), true, 55);

    // `services/googleDrive.ts` serializes the entire profile — no field list.
    const cloud = JSON.parse(JSON.stringify(settled, null, 2)) as PlayerProfile;
    expect(cloud.city?.day).toBe(2);
    expect(cloud.gold).toBe(before.gold + 55);
  });
});

// ── §C. The wiring this suite cannot execute ───────────────────────────────

describe('§C — App arms and claims per bout; the scene only reports a result', () => {
  test('the settlement handler names the bout it settles', () => {
    expect(creditHandler.length).toBeGreaterThan(0);
    expect(creditHandler).toContain('settledDuelId: number');
    expect(
      creditHandler.indexOf('if (!duelSettlementRef.current.claim(settledDuelId)) return;')
    ).toBeGreaterThan(-1);
    // The claim is the FIRST thing after the null-profile guard, and precedes the
    // clock, so a refused claim cannot turn the day.
    expect(creditHandler.indexOf('.claim(')).toBeLessThan(
      creditHandler.indexOf('advanceCityDay(profile)')
    );
    expect(creditHandler.match(/\.claim\(/g)?.length).toBe(1);
  });

  test('the callback handed to the scene carries the bout id', () => {
    expect(
      appSource.match(
        /onMatchComplete=\{\(stats, didWin\) => handleMatchComplete\(stats, didWin, duelId\)\}/
      )?.length
    ).toBe(1);
    // …from state set only where a bout is entered.
    expect(appSource.match(/const \[duelId, setDuelId\] = useState\(0\);/g)?.length).toBe(1);
    expect(appSource.match(/setDuelId\(/g)?.length).toBe(1);
    expect(duelEntry).toContain('setDuelId(duelSettlementRef.current.arm());');
  });

  test('the latch is armed on entry only, and nothing else touches it', () => {
    expect(appSource.match(/createDuelSettlementLatch\(\)/g)?.length).toBe(1);
    expect(appSource.match(/duelSettlementRef\.current\.arm\(\)/g)?.length).toBe(1);
    // No reset-on-navigation, no reset on dismissal — arming is the only transition.
    expect(appSource).not.toContain('duelSettlementRef.current =');
    const dismiss = between(appSource, 'const handleDuelResultDismiss', 'const handleChooseBannerDevice');
    expect(dismiss.length).toBeGreaterThan(0);
    // Leaving the result screen settles nothing and arms nothing.
    expect(dismiss).not.toContain('arm()');
    expect(dismiss).not.toContain('advanceCityDay');
  });

  test('the scene reports an outcome with its own two arguments and knows no latch', () => {
    // `onMatchComplete` keeps the `(stats, didWin)` signature, so the id can only
    // be attached where the bout is owned — App — and a scene remount cannot
    // re-declare it.
    expect(sceneSource).toContain('onMatchComplete: (stats: DuelStatistics, didWin: boolean) => void;');
    expect(
      sceneSource.match(/onMatchComplete\(statsRef\.current, (true|false)\)/g)?.length
    ).toBe(2);
    expect(sceneSource.match(/onMatchComplete\([^)]*,[^)]*,[^)]*\)/g) ?? []).toEqual([]);
    for (const forbidden of ['duelSettlement', 'duelSettledRef', 'duelId']) {
      expect(sceneSource).not.toContain(forbidden);
    }
    // The scene's own guard still refuses a second outcome before it reports.
    expect(sceneSource.match(/if \(isMatchOver\.current\) return;/g)?.length).toBeGreaterThan(0);
  });

  test('the latch module stays pure: no React, no storage, no clock', () => {
    const code = latchSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const forbidden of [
      'useState',
      'useEffect',
      'useRef',
      'localStorage',
      'sessionStorage',
      'saveProfile',
      'Date.now',
      'new Date',
      'setTimeout',
      'setInterval',
      'Math.random',
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });
});
