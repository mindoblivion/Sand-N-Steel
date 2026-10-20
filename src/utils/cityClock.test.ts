/**
 * L1 (Living City) — the in-game clock and its one advance site.
 *
 * The Living City discovery audit (`AGENTS.md`) established that the game had no
 * persisted time at all, so this suite covers the smallest thing that fixes it:
 * one optional `profile.city.day`, one authoritative resolver, one pure
 * advancement, and exactly one place in the settlement path that spends it.
 *
 * Written in the two registers the neighbouring suites use
 * (`duelResultLifecycle`, `tierAdvancement`, `phaseC8_67b`) — behaviour where the
 * rule is a pure function, and ordered source assertions where the rule lives in
 * React wiring this repo has no DOM renderer for:
 *
 *   §A  the resolver: a new profile and a legacy save both read day 1; every
 *       malformed shape normalizes instead of throwing
 *   §B  `advanceCityDay`: exactly one day, never invalid, pure, and it carries
 *       every unrelated profile field over untouched
 *   §C  persistence: a legacy save round-trips byte-identically, an advanced save
 *       reloads at the next day, and the whole-profile cloud serialization keeps it
 *   §D  the settlement wiring: one advancement, in the same profile write the duel
 *       already credits, behind an exactly-once latch — and nowhere else
 *
 * Run with: `bun test src/utils/cityClock.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

// ── In-memory localStorage polyfill ────────────────────────────────────────
// bun's test runtime has no DOM (the `phase39c` precedent). `storage.ts` wraps
// every access in try/catch, so a Map-backed shim is enough to exercise the REAL
// save/load round trip.
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
import {
  CITY_DAY_MAX,
  CITY_DAY_START,
  advanceCityDay,
  nextCityDay,
  normalizeCityDay,
  resolveCityDay,
} from './cityClock';

const clockSource = readFileSync(new URL('./cityClock.ts', import.meta.url), 'utf8');
const typeSource = readFileSync(new URL('../types/game.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

/** The slice of `source` from `start` (inclusive) up to `end` (exclusive). */
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return '';
  return source.slice(from, to);
}

/** App's one credit path — the settlement that turns the day. */
const creditHandler = between(appSource, 'const handleMatchComplete', 'const handleDuelResultDismiss');
const winBlock = between(creditHandler, 'if (didWin) {', '} else {');
const lossBlock = creditHandler.slice(creditHandler.indexOf('} else {'));
/** The only place a duel begins. */
const duelEntry = between(appSource, 'const handleEnterDuel', 'const handleStartRace');

/** A fresh save exactly as `services/storage` writes it (no `city` field). */
function fresh(): PlayerProfile {
  return createNewProfile('Clock Tester');
}

/** A pre-L1 save: the same profile, with the field demonstrably absent. */
function legacy(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  const profile = { ...fresh(), ...overrides };
  delete (profile as { city?: unknown }).city;
  return profile;
}

/**
 * The write `App.handleMatchComplete` performs for one completed duel, mirrored:
 * one fight counted, and the clock advanced inside the SAME profile object.
 */
function settle(profile: PlayerProfile, didWin: boolean): PlayerProfile {
  return {
    ...profile,
    fightsWon: didWin ? profile.fightsWon + 1 : profile.fightsWon,
    fightsLost: didWin ? profile.fightsLost : profile.fightsLost + 1,
    city: advanceCityDay(profile).city,
  };
}

// ── §A. The one resolver ───────────────────────────────────────────────────

describe('§A — the day resolves totally, and starts at 1', () => {
  test('a new profile reads day 1', () => {
    expect(resolveCityDay(fresh())).toBe(CITY_DAY_START);
    expect(CITY_DAY_START).toBe(1);
  });

  test('a legacy save with no `city` field reads day 1 rather than throwing', () => {
    const old = legacy();
    expect('city' in old).toBe(false);
    expect(resolveCityDay(old)).toBe(1);
  });

  test('a missing, partial or unusable city state resolves to day 1', () => {
    const cases: unknown[] = [
      undefined,
      null,
      {},
      { day: undefined },
      { day: null },
      { day: '3' },
      { day: true },
      { day: [] },
      { day: {} },
      { day: NaN },
      { day: Infinity },
      { day: -Infinity },
      { day: 0 },
      { day: -7 },
      { day: -0.5 },
    ];

    for (const city of cases) {
      const profile = { ...fresh(), city } as unknown as PlayerProfile;
      expect(resolveCityDay(profile)).toBe(1);
    }
    // …and the same rule without a profile at all.
    expect(resolveCityDay(null)).toBe(1);
    expect(resolveCityDay(undefined)).toBe(1);
  });

  test('a malformed `city` container is ignored, not spread into the state', () => {
    for (const city of ['day 4', 4, [], [4], true] as unknown[]) {
      const profile = { ...fresh(), city } as unknown as PlayerProfile;
      expect(resolveCityDay(profile)).toBe(1);
      const advanced = advanceCityDay(profile);
      expect(advanced.city).toEqual({ day: 2 });
    }
  });

  test('valid days are returned as they were stored', () => {
    for (const day of [1, 2, 7, 99, 365, 12_345]) {
      expect(resolveCityDay({ ...fresh(), city: { day } })).toBe(day);
    }
  });

  test('non-integers and out-of-range numbers normalize to a valid day', () => {
    expect(normalizeCityDay(3.7)).toBe(3);
    expect(normalizeCityDay(3.2)).toBe(3);
    expect(normalizeCityDay(0.9)).toBe(1);
    expect(normalizeCityDay(-3.7)).toBe(1);
    expect(normalizeCityDay(Number.MAX_SAFE_INTEGER * 4)).toBe(CITY_DAY_MAX);
    expect(Number.isSafeInteger(normalizeCityDay(Number.MAX_VALUE))).toBe(true);
  });

  test('the resolver is pure: it reads the profile and mutates nothing', () => {
    const profile = { ...fresh(), city: { day: 4 } };
    const before = JSON.stringify(profile);
    expect(resolveCityDay(profile)).toBe(4);
    expect(JSON.stringify(profile)).toBe(before);
  });

  test('there is exactly ONE clock field on the profile type', () => {
    // A second day/counter/time field would be a parallel clock — the audit's
    // first risk. `city?:` is the only place the clock is declared.
    expect(typeSource.match(/city\?:/g)?.length).toBe(1);
    expect(typeSource).toContain('export interface CityState');
    expect(typeSource).toContain('day?: number;');
  });
});

// ── §B. Advancing ──────────────────────────────────────────────────────────

describe('§B — one day per completed event, never invalid', () => {
  test('day 1 advances to day 2', () => {
    const next = advanceCityDay(fresh());
    expect(next.city.day).toBe(2);
    expect(resolveCityDay(next)).toBe(2);
  });

  test('a legacy save advances to day 2 as well — no migration is needed first', () => {
    expect(advanceCityDay(legacy()).city.day).toBe(2);
  });

  test('repeated advancement is monotonic, one day at a time', () => {
    let profile: PlayerProfile = legacy();
    const seen: number[] = [];
    for (let duel = 0; duel < 25; duel += 1) {
      profile = advanceCityDay(profile);
      seen.push(resolveCityDay(profile));
    }
    expect(seen[0]).toBe(2);
    expect(seen[seen.length - 1]).toBe(26);
    expect(seen).toEqual(seen.map((_, index) => index + 2));
  });

  test('advancing never produces an invalid day, even from a corrupt one', () => {
    const corrupt: unknown[] = [{ day: NaN }, { day: -12 }, { day: 0 }, { day: 2.9 }, { day: 'x' }];
    for (const city of corrupt) {
      const next = advanceCityDay({ ...fresh(), city } as unknown as PlayerProfile);
      const day = resolveCityDay(next);
      expect(Number.isSafeInteger(day)).toBe(true);
      expect(day).toBeGreaterThanOrEqual(1);
    }
    // 2.9 floors to 2, so the next day is 3.
    expect(advanceCityDay({ ...fresh(), city: { day: 2.9 } } as PlayerProfile).city.day).toBe(3);
  });

  test('the ceiling holds: the last safe day advances no further and stays safe', () => {
    const atCap = { ...fresh(), city: { day: CITY_DAY_MAX } };
    const next = advanceCityDay(atCap);
    expect(next.city.day).toBe(CITY_DAY_MAX);
    expect(Number.isSafeInteger(next.city.day)).toBe(true);
    expect(nextCityDay(atCap)).toBe(CITY_DAY_MAX);
  });

  test('advancing is pure: the input profile and its city object are untouched', () => {
    const profile: PlayerProfile = { ...fresh(), city: { day: 5 } };
    const cityRef = profile.city;
    const before = JSON.stringify(profile);

    const next = advanceCityDay(profile);

    expect(next).not.toBe(profile);
    expect(next.city).not.toBe(cityRef);
    expect(profile.city).toBe(cityRef);
    expect(profile.city?.day).toBe(5);
    expect(JSON.stringify(profile)).toBe(before);
  });

  test('every unrelated profile field is carried over, by identity where it is an object', () => {
    const base = fresh();
    const profile: PlayerProfile = {
      ...base,
      gold: 4321,
      fame: 210,
      level: 6,
      fightsWon: 11,
      defeatedOpponentIds: ['opp_marcus'],
      inventory: [...base.inventory],
      chariot: { owned: ['wheels_standard', 'finish_stock'], equipped: { wheels: 'wheels_standard', finish: 'finish_stock' } },
      racing: { unlocked: [3], selected: 3 },
      temper: { [base.equipped.weapon.id]: 2 },
      road: { oathSworn: true, milestonesSeen: ['sworn'] },
      story: { librarySeen: true, fragmentsFound: ['frag_1'] },
      city: { day: 9 },
    };

    const next = advanceCityDay(profile);

    expect(next.city?.day).toBe(10);
    expect(next.gold).toBe(4321);
    expect(next.fame).toBe(210);
    expect(next.level).toBe(6);
    expect(next.fightsWon).toBe(11);
    expect(next.defeatedOpponentIds).toEqual(['opp_marcus']);
    expect(next.baseStats).toBe(profile.baseStats);
    expect(next.equipped).toBe(profile.equipped);
    expect(next.inventory).toBe(profile.inventory);
    expect(next.chariot).toBe(profile.chariot);
    expect(next.racing).toBe(profile.racing);
    expect(next.temper).toBe(profile.temper);
    expect(next.road).toBe(profile.road);
    expect(next.story).toBe(profile.story);
  });

  test('a future member already stored in `city` survives the advance', () => {
    // Later Living City phases extend this object; the advance must not drop it.
    const profile = { ...fresh(), city: { day: 3, seenVisitors: ['v1'] } } as unknown as PlayerProfile;
    const next = advanceCityDay(profile) as unknown as { city: Record<string, unknown> };
    expect(next.city.day).toBe(4);
    expect(next.city.seenVisitors).toEqual(['v1']);
  });

  test('one completed duel advances the day exactly once, victory or defeat alike', () => {
    for (const didWin of [true, false]) {
      const profile = legacy();
      const settled = settle(profile, didWin);

      expect(resolveCityDay(settled)).toBe(2);
      expect(settled.fightsWon + settled.fightsLost).toBe(1);
      // The rewards the branch owns are untouched by the clock.
      expect(settled.gold).toBe(profile.gold);
      expect(settled.fame).toBe(profile.fame);
      expect(settled.xp).toBe(profile.xp);
      expect(settled.currentTier).toBe(profile.currentTier);
    }
  });

  test('replaying one settlement does not advance twice, and a new duel does', () => {
    const profile = legacy();
    const first = settle(profile, true);
    // A settlement that is re-applied from the SAME pre-fight profile cannot
    // compound: the clock is a function of that profile, not of the result.
    const replayed = settle(profile, true);
    expect(replayed.city?.day).toBe(first.city?.day);

    // A genuinely new duel settles from the settled profile and turns it again.
    expect(settle(first, false).city?.day).toBe(3);
  });

  test('the module is pure: no storage, no clock, no timers, no React', () => {
    const code = clockSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    for (const forbidden of [
      'localStorage',
      'sessionStorage',
      'saveProfile',
      'loadSavedProfile',
      'PROFILE_STORAGE_KEY',
      'Date.now',
      'new Date',
      'performance.now',
      'setTimeout',
      'setInterval',
      'requestAnimationFrame',
      'useState',
      'useEffect',
      'Math.random',
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });
});

// ── §C. Save-save compatibility ────────────────────────────────────────────

describe('§C — existing saves load, and the field rides the existing save path', () => {
  test('a legacy save loads unchanged and is not rewritten to add the field', () => {
    const old = legacy();
    const written = JSON.stringify(old);

    saveProfile(old);
    const loaded = loadSavedProfile();

    expect(loaded).not.toBeNull();
    expect(JSON.stringify(loaded)).toBe(written);
    expect(loaded && 'city' in loaded).toBe(false);
    expect(resolveCityDay(loaded)).toBe(1);
  });

  test('a settled duel persists day 2 and reloads at day 2', () => {
    saveProfile(settle(legacy(), true));
    const loaded = loadSavedProfile()!;

    expect(loaded.city?.day).toBe(2);
    expect(resolveCityDay(loaded)).toBe(2);
    expect(loaded.fightsWon).toBe(1);
  });

  test('a save written BEFORE this phase (raw JSON, no field) reads as day 1', () => {
    // Exactly the bytes a pre-L1 build left behind, restored through the real key.
    const raw = JSON.stringify(legacy());
    localStorage.setItem(PROFILE_STORAGE_KEY, raw);

    const loaded = loadSavedProfile()!;
    expect(resolveCityDay(loaded)).toBe(1);
    expect(advanceCityDay(loaded).city?.day).toBe(2);
  });

  test('the whole-profile cloud serialization keeps the clock', () => {
    // `services/googleDrive.ts` serializes the entire profile — no field list —
    // so this round trip is the one the cloud path performs.
    const settled = settle(legacy(), false);
    expect(resolveCityDay(JSON.parse(JSON.stringify(settled, null, 2)))).toBe(2);
  });
});

// ── §D. The one advance site ───────────────────────────────────────────────

describe('§D — the settlement is the only place a day is spent', () => {
  test('the credit handler exists and advances the clock exactly once', () => {
    expect(creditHandler.length).toBeGreaterThan(0);
    expect(creditHandler.match(/advanceCityDay\(/g)?.length).toBe(1);
  });

  test('the advancement is computed ONCE, shared by both outcome branches', () => {
    expect(winBlock.length).toBeGreaterThan(0);
    expect(lossBlock.length).toBeGreaterThan(0);
    // Neither branch advances it itself — one computation feeds both.
    expect(winBlock).not.toContain('advanceCityDay');
    expect(lossBlock).not.toContain('advanceCityDay');
    // …and both persisted profile objects carry that one value.
    expect(winBlock).toContain('city,');
    expect(lossBlock).toContain('city,');
  });

  test('the clock rides the SAME profile write the duel already credits', () => {
    // No second write was introduced: still one save and one setState per branch.
    expect(creditHandler.match(/saveProfile\(settledProfile\)/g)?.length).toBe(2);
    expect(creditHandler.match(/setProfile\(settledProfile\)/g)?.length).toBe(2);
    expect(creditHandler).not.toContain('saveProfile(city');
  });

  test('an exactly-once latch guards the settlement, claimed before the branch', () => {
    // L1 verification gate: the latch is IDENTITY-AWARE (one claim per bout id),
    // because `DuelScene` reports a result 1400 ms after the deciding blow and that
    // callback can outlive the scene. See `duelSettlement.test.ts` for the
    // behaviour; here the ordering is pinned.
    const latchCheck = creditHandler.indexOf(
      'if (!duelSettlementRef.current.claim(settledDuelId)) return;'
    );
    const advance = creditHandler.indexOf('advanceCityDay(profile)');

    expect(latchCheck).toBeGreaterThan(-1);
    expect(advance).toBeGreaterThan(latchCheck);
    // One claim per settlement — nothing else may consume the latch.
    expect(creditHandler.match(/\.claim\(/g)?.length).toBe(1);
  });

  test('the latch is armed only when a new duel is entered', () => {
    expect(duelEntry.length).toBeGreaterThan(0);
    expect(duelEntry).toContain('setDuelId(duelSettlementRef.current.arm());');
    // Exactly one arm site in the whole application.
    expect(appSource.match(/\.arm\(\)/g)?.length).toBe(1);
  });

  test('opening, leaving or dismissing a duel never advances the day', () => {
    // Entering a duel, leaving via the Armory and closing the result screen all
    // run through these handlers; none of them touches the clock.
    const dismiss = between(appSource, 'const handleDuelResultDismiss', 'const handleChooseBannerDevice');
    expect(dismiss.length).toBeGreaterThan(0);

    for (const handler of [duelEntry, dismiss]) {
      expect(handler).not.toContain('advanceCityDay');
      expect(handler).not.toContain('city.day');
    }
    // The scene's own callback is the only route into the handler, and it carries
    // the bout id that names the settlement…
    expect(
      appSource.match(
        /onMatchComplete=\{\(stats, didWin\) => handleMatchComplete\(stats, didWin, duelId\)\}/g
      )?.length
    ).toBe(1);
    // …and the clock's module is named in exactly one import.
    expect(appSource.match(/from '\.\/utils\/cityClock'/g)?.length).toBe(1);
  });

  test('the clock stays passive: no timers, no reads on boot or city entry', () => {
    const enterCity = between(appSource, 'const enterCity = (forProfile: PlayerProfile) =>', 'const handleContinueAdventure');
    expect(enterCity.length).toBeGreaterThan(0);
    expect(enterCity).not.toContain('advanceCityDay');
    // The settlement is the ONLY call site in the whole application.
    expect(appSource.match(/advanceCityDay\(/g)?.length).toBe(1);
    expect(appSource.match(/resolveCityDay\(/g)?.length ?? 0).toBe(0);
    expect(appSource).not.toContain('setInterval');
  });
});
