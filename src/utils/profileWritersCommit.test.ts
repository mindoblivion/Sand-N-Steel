/**
 * L13A — the remaining audited profile writers commit through the newest profile.
 *
 * The L12C record listed six App handlers (plus `enterCity`'s arrival write) that
 * still built their update from the render's `profile` state instead of
 * `profileRef.current`. L13A moved them onto the same commit triad the sale, the
 * equip and the allocation handlers already used:
 *
 *     const base = profileRef.current;   // the newest committed profile
 *     …the same pure transaction, validation order, costs and refusals…
 *     profileRef.current = result.profile;
 *     setProfile(result.profile);
 *     saveProfile(result.profile);
 *
 * This suite executes **App's own handler source** (extracted brace-matched from
 * `src/App.tsx`, comments stripped, transpiled with Bun's transpiler) against the
 * real `purchaseChariotPart` / `equipChariotPart` / `chooseBannerDevice` /
 * `purchaseRacingConfig` / `selectRacingConfig` / `withOathSworn` /
 * `evaluateRoadMilestones` helpers — never a re-implementation of them.
 *
 *   §A  the extraction and commit-order guard (ref → state → disk, in each handler);
 *   §B  chariot purchase and equip: one consistent profile, refusals write nothing;
 *   §C  the banner device: the one-time write, and a second choice refused;
 *   §D  racing purchase and selection: cost, unlock, and free selection;
 *   §E  the gladiator's oath: the one guarded write, and a non-writing beat;
 *   §F  city entry: the arrival grandfathers the road it never recorded (silently, with the
 *       device offer intact), commits one object through ref → state → disk, and leaves a
 *       save whose road is already recorded quiet.
 *
 * Run with: `bun test src/utils/profileWritersCommit.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { CHARIOT_PARTS } from '../data/chariotParts';
import { purchaseChariotPart, equipChariotPart } from './chariotLoadout';
import { purchaseRacingConfig, selectRacingConfig } from './racingProgression';
import { chooseBannerDevice, evaluateRoadMilestones } from './roadMilestones';
import { CHAMPION_FAME, CHAMPION_TIER, VETERAN_FAME, VETERAN_TIER } from './rank';
import {
  oathWriteOnCompletion,
  resolveOathBeatMode,
  shouldPlayOathBeat,
  withOathSworn,
} from './gladiatorOath';
import {
  HERALD_COLOSSEUM,
  aimHerald,
  releaseHeraldForEntry,
  suppressHeraldForEntry,
} from './cityHerald';
import { createDuelSettlementLatch } from './duelSettlement';

// ── App's real handler source ──────────────────────────────────────────────
const APP_SRC = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const WRITERS = [
  'handleBuyChariotPart',
  'handleEquipChariotPart',
  'handleChooseBannerDevice',
  'handleBuyRacingConfig',
  'handleSelectRacingConfig',
  'handleOathComplete',
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

const WRITER_SOURCE = WRITERS.map(extractHandler).join('\n');
/** `enterCity` needs `evaluateRituals`, so both are extracted for §F. */
const CITY_SOURCE = `${extractHandler('evaluateRituals')}\n${extractHandler('enterCity')}`;

// ── Fixtures ───────────────────────────────────────────────────────────────
/** The cheapest chariot part the workshop sells. */
const FINISH = CHARIOT_PARTS.filter((part) => part.slot === 'finish' && !part.defaultOwned)[0];
/** A team size the profile has to buy (Triga, 750). */
const TRIGA = 3;

const fresh = (overrides: Partial<PlayerProfile> = {}): PlayerProfile =>
  ({
    ...createNewProfile('L13A'),
    gold: 5000,
    city: { day: 4 },
    ...overrides,
  }) as PlayerProfile;

const OATH_SWORN = {
  mode: 'full',
  phase: 'sworn',
  line: 4,
  heldMs: 1500,
  holding: false,
  awaitingRelease: true,
  holds: 5,
} as const;

type Recorder<T> = { calls: T[] };

/** A ref, a commit log and a save log — the three channels every writer uses. */
function createRefHarness() {
  const ref: { current: PlayerProfile | null } = { current: null };
  const renders: Array<PlayerProfile | null> = [];
  const saves: PlayerProfile[] = [];
  let pending: PlayerProfile | null = null;

  const setProfile = (next: PlayerProfile | null) => {
    pending = next;
    renders.push(next);
  };
  const saveProfile = (profile: PlayerProfile) => {
    saves.push(profile);
  };

  return {
    ref,
    renders,
    saves,
    setProfile,
    saveProfile,
    /** The last object written through every channel, asserted identical. */
    committed: () => ({
      ref: ref.current,
      render: renders.length ? renders[renders.length - 1] : null,
      save: saves.length ? saves[saves.length - 1] : null,
    }),
    /** A React re-render: the profile effect copies state into the ref. */
    render: () => {
      ref.current = pending;
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════
describe('§A every hardened writer commits ref → state → disk', () => {
  test('each declaration is App’s own source', () => {
    for (const name of WRITERS) {
      expect(APP_SRC).toContain(extractHandler(name));
    }
  });

  test('each writer reads the ref and writes it before setProfile and saveProfile', () => {
    for (const name of WRITERS) {
      const body = extractHandler(name);
      const read = body.indexOf('profileRef.current');
      const refWrite = body.indexOf('profileRef.current =');
      const setState = body.indexOf('setProfile(');
      const save = body.indexOf('saveProfile(');
      expect(read).toBeGreaterThanOrEqual(0);
      expect(refWrite).toBeGreaterThan(read);
      expect(refWrite).toBeLessThan(setState);
      expect(setState).toBeLessThan(save);
    }
  });

  test('none of them still hands the render snapshot to its transaction', () => {
    for (const name of WRITERS) {
      const body = extractHandler(name);
      // The only allowed mention of the bare `profile` state is the fallback.
      expect(body).not.toContain('ChariotPart(profile');
      expect(body).not.toContain('RacingConfig(profile');
      expect(body).not.toContain('chooseBannerDevice(profile');
      expect(body).not.toContain('withOathSworn(profile)');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§B the chariot workshop', () => {
  function chariotHarness(refProfile: PlayerProfile, renderProfile: PlayerProfile) {
    const harness = createRefHarness();
    harness.ref.current = refProfile;
    const factory = new Function(
      'profileRef',
      'profile',
      'setProfile',
      'saveProfile',
      'purchaseChariotPart',
      'equipChariotPart',
      // @ts-ignore — Bun is the test runtime
      new Bun.Transpiler({ loader: 'ts' }).transformSync(
        `${extractHandler('handleBuyChariotPart')}\n${extractHandler('handleEquipChariotPart')}\n` +
          'return { handleBuyChariotPart, handleEquipChariotPart };'
      )
    ) as (...args: unknown[]) => {
      handleBuyChariotPart: (id: string) => void;
      handleEquipChariotPart: (id: string) => void;
    };
    const handlers = factory(
      harness.ref,
      renderProfile,
      harness.setProfile,
      harness.saveProfile,
      purchaseChariotPart,
      equipChariotPart
    );
    return { ...harness, handlers };
  }

  test('a purchase charges once and rides the newest profile, not the render’s', () => {
    const render = fresh({ gold: 100 }); // cannot afford anything
    const live = fresh(); // the committed profile can
    const harness = chariotHarness(live, render);

    harness.handlers.handleBuyChariotPart(FINISH.id);

    expect(harness.saves.length).toBe(1);
    const committed = harness.committed();
    expect(committed.save).toBe(committed.ref as PlayerProfile);
    expect(committed.render).toBe(committed.save);
    const saved = committed.save as PlayerProfile;
    expect(saved.gold).toBe(5000 - FINISH.price);
    expect(saved.chariot?.owned).toContain(FINISH.id);
  });

  test('equipping a purchased part never touches gold, and the base is the ref', () => {
    const render = fresh();
    const live = { ...fresh(), chariot: { owned: [FINISH.id], equipped: {} } } as PlayerProfile;
    const harness = chariotHarness(live, render);

    harness.handlers.handleEquipChariotPart(FINISH.id);

    expect(harness.saves.length).toBe(1);
    const saved = harness.committed().save as PlayerProfile;
    expect(saved.gold).toBe(live.gold);
    expect(saved.chariot?.equipped).toMatchObject({ finish: FINISH.id });
    expect(harness.committed().ref).toBe(saved);
  });

  test('refusals write nothing: unaffordable, unowned and unknown parts', () => {
    const poor = chariotHarness(fresh({ gold: 0 }), fresh({ gold: 0 }));
    poor.handlers.handleBuyChariotPart(FINISH.id);
    expect(poor.saves.length).toBe(0);
    expect(poor.renders.length).toBe(0);

    const unowned = chariotHarness(fresh(), fresh());
    unowned.handlers.handleEquipChariotPart(FINISH.id);
    expect(unowned.saves.length).toBe(0);
    expect(unowned.renders.length).toBe(0);

    const before = unowned.ref.current;
    unowned.handlers.handleBuyChariotPart('not_a_part');
    expect(unowned.ref.current).toBe(before);
    expect(unowned.saves.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§C the banner device', () => {
  function bannerHarness(refProfile: PlayerProfile, renderProfile: PlayerProfile) {
    const harness = createRefHarness();
    harness.ref.current = refProfile;
    const closed: boolean[] = [];
    const factory = new Function(
      'profileRef',
      'profile',
      'setProfile',
      'saveProfile',
      'chooseBannerDevice',
      'setDeviceChoiceOpen',
      // @ts-ignore — Bun is the test runtime
      new Bun.Transpiler({ loader: 'ts' }).transformSync(
        `${extractHandler('handleChooseBannerDevice')}\nreturn { handleChooseBannerDevice };`
      )
    ) as (...args: unknown[]) => { handleChooseBannerDevice: (device: string) => void };
    const handlers = factory(
      harness.ref,
      renderProfile,
      harness.setProfile,
      harness.saveProfile,
      chooseBannerDevice,
      (open: boolean) => closed.push(open)
    );
    return { ...harness, handlers, closed };
  }

  test('the choice is written once, through the newest profile', () => {
    const harness = bannerHarness(fresh(), fresh());
    harness.handlers.handleChooseBannerDevice('sword');

    expect(harness.saves.length).toBe(1);
    const saved = harness.committed().save as PlayerProfile;
    expect(saved.road?.bannerDevice).toBe('sword');
    expect(harness.committed().ref).toBe(saved);
    expect(harness.closed).toEqual([false]);
  });

  test('a second choice is refused and writes nothing', () => {
    const already = fresh({ road: { bannerDevice: 'wolf' } } as Partial<PlayerProfile>);
    const harness = bannerHarness(already, fresh());
    harness.handlers.handleChooseBannerDevice('laurel');

    expect(harness.saves.length).toBe(0);
    expect(harness.renders.length).toBe(0);
    expect(harness.ref.current?.road?.bannerDevice).toBe('wolf');
    // The panel still closes — the refusal is the write's, not the panel's.
    expect(harness.closed).toEqual([false]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§D racing configurations', () => {
  function racingHarness(refProfile: PlayerProfile, renderProfile: PlayerProfile) {
    const harness = createRefHarness();
    harness.ref.current = refProfile;
    const factory = new Function(
      'profileRef',
      'profile',
      'setProfile',
      'saveProfile',
      'purchaseRacingConfig',
      'selectRacingConfig',
      // @ts-ignore — Bun is the test runtime
      new Bun.Transpiler({ loader: 'ts' }).transformSync(
        `${extractHandler('handleBuyRacingConfig')}\n${extractHandler('handleSelectRacingConfig')}\n` +
          'return { handleBuyRacingConfig, handleSelectRacingConfig };'
      )
    ) as (...args: unknown[]) => {
      handleBuyRacingConfig: (horses: number) => void;
      handleSelectRacingConfig: (horses: number) => void;
    };
    const handlers = factory(
      harness.ref,
      renderProfile,
      harness.setProfile,
      harness.saveProfile,
      purchaseRacingConfig,
      selectRacingConfig
    );
    return { ...harness, handlers };
  }

  test('a purchase charges the catalogue price once, from the newest profile', () => {
    const harness = racingHarness(fresh(), fresh({ gold: 100 }));

    harness.handlers.handleBuyRacingConfig(TRIGA);

    expect(harness.saves.length).toBe(1);
    const saved = harness.committed().save as PlayerProfile;
    expect(saved.gold).toBe(4250);
    expect(saved.racing?.unlocked).toEqual([TRIGA]);
    expect(harness.committed().ref).toBe(saved);
  });

  test('selection is free and records the preference', () => {
    const owned = { ...fresh(), racing: { unlocked: [TRIGA] } } as PlayerProfile;
    const harness = racingHarness(owned, fresh());

    harness.handlers.handleSelectRacingConfig(TRIGA);

    expect(harness.saves.length).toBe(1);
    const saved = harness.committed().save as PlayerProfile;
    expect(saved.gold).toBe(owned.gold);
    expect(saved.racing?.selected).toBe(TRIGA);
  });

  test('a second purchase and a locked selection are refused without writing', () => {
    const owned = { ...fresh(), racing: { unlocked: [TRIGA] } } as PlayerProfile;
    const harness = racingHarness(owned, fresh());

    harness.handlers.handleBuyRacingConfig(TRIGA);
    expect(harness.saves.length).toBe(0);

    harness.handlers.handleSelectRacingConfig(4);
    expect(harness.saves.length).toBe(0);
    expect(harness.renders.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§E the gladiator’s oath', () => {
  function oathHarness(refProfile: PlayerProfile | null, renderProfile: PlayerProfile | null) {
    const harness = createRefHarness();
    harness.ref.current = refProfile;
    const beatModes: Array<string | null> = [];
    const herald: unknown[] = [];
    let offered = 0;
    const factory = new Function(
      'profileRef',
      'profile',
      'setProfile',
      'saveProfile',
      'setOathBeatMode',
      'setHerald',
      'oathWriteOnCompletion',
      'withOathSworn',
      'aimHerald',
      'HERALD_COLOSSEUM',
      'postOathNudge',
      // @ts-ignore — Bun is the test runtime
      new Bun.Transpiler({ loader: 'ts' }).transformSync(
        `${extractHandler('handleOathComplete')}\nreturn { handleOathComplete };`
      )
    ) as (...args: unknown[]) => { handleOathComplete: (state: unknown) => void };
    const handlers = factory(
      harness.ref,
      renderProfile,
      harness.setProfile,
      harness.saveProfile,
      (mode: string | null) => beatModes.push(mode),
      (state: unknown) => herald.push(state),
      oathWriteOnCompletion,
      withOathSworn,
      aimHerald,
      HERALD_COLOSSEUM,
      { offer: () => { offered += 1; } }
    );
    return { ...harness, handlers, beatModes, herald, offered: () => offered };
  }

  test('a completed full oath writes once, from the newest profile', () => {
    const harness = oathHarness(fresh(), null);
    harness.handlers.handleOathComplete(OATH_SWORN);

    expect(harness.saves.length).toBe(1);
    const saved = harness.committed().save as PlayerProfile;
    expect(saved.road?.oathSworn).toBe(true);
    expect(harness.committed().ref).toBe(saved);
    expect(harness.beatModes).toEqual([null]);
    expect(harness.offered()).toBe(1);
  });

  test('an unfinished beat and an already-sworn profile write nothing', () => {
    const midLine = oathHarness(fresh(), fresh());
    midLine.handlers.handleOathComplete({ ...OATH_SWORN, phase: 'lines' });
    expect(midLine.saves.length).toBe(0);
    expect(midLine.renders.length).toBe(0);

    const sworn = fresh({ road: { oathSworn: true } } as Partial<PlayerProfile>);
    const again = oathHarness(sworn, sworn);
    again.handlers.handleOathComplete(OATH_SWORN);
    expect(again.saves.length).toBe(0);
    expect(again.renders.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§F city entry keeps the committed ref in step', () => {
  function cityHarness() {
    const harness = createRefHarness();
    const screens: string[] = [];
    // The two surfaces `evaluateRituals` drives, modelled faithfully: the herald is
    // App state appended through an updater, and the device panel is an open.
    const herald: string[] = [];
    const deviceOffers: number[] = [];
    const factory = new Function(
      'profileRef',
      'setProfile',
      'saveProfile',
      'evaluateRoadMilestones',
      'setHeraldCries',
      'setDeviceChoiceOpen',
      'shouldPlayOathBeat',
      'suppressHeraldForEntry',
      'releaseHeraldForEntry',
      'resolveOathBeatMode',
      'setHerald',
      'setOathBeatMode',
      'setCurrentScreen',
      // @ts-ignore — Bun is the test runtime
      new Bun.Transpiler({ loader: 'ts' }).transformSync(
        `${CITY_SOURCE}\nreturn { enterCity };`
      )
    ) as (...args: unknown[]) => { enterCity: (profile: PlayerProfile) => void };
    const handlers = factory(
      harness.ref,
      harness.setProfile,
      harness.saveProfile,
      evaluateRoadMilestones,
      (update: (previous: string[]) => string[]) => {
        const next = update([...herald]);
        herald.length = 0;
        herald.push(...next);
      },
      () => {
        deviceOffers.push(1);
      },
      shouldPlayOathBeat,
      suppressHeraldForEntry,
      releaseHeraldForEntry,
      resolveOathBeatMode,
      () => {},
      () => {},
      (screen: string) => screens.push(screen)
    );
    return { ...harness, handlers, screens, herald, deviceOffers };
  }

  // ── L13C — city entry grandfathers what the save already earned, silently ─────
  /** A gladiator the road has already outrun: Veteran, and no `road` field at all. */
  const veteranArrival = (overrides: Partial<PlayerProfile> = {}): PlayerProfile =>
    fresh({ fightsWon: 2, fame: VETERAN_FAME, currentTier: VETERAN_TIER, ...overrides });
  /** Past the Champion gate, so several stages are owed at once. */
  const championArrival = (overrides: Partial<PlayerProfile> = {}): PlayerProfile =>
    fresh({ fightsWon: 6, fame: CHAMPION_FAME, currentTier: CHAMPION_TIER, ...overrides });

  test('a legacy arrival records the stages it earned, and says nothing', () => {
    // A pre-road save entering the city: every earned stage is "fresh" against the null
    // baseline, so the arrival write finally fires — exactly once — and the herald stays
    // silent, because a cry belongs to the event that won the stage, not to an arrival.
    for (const [arriving, owed] of [
      [veteranArrival(), ['sworn', 'blooded', 'known']],
      [championArrival(), ['sworn', 'blooded', 'known', 'feared']],
    ] as const) {
      const harness = cityHarness();
      harness.ref.current = arriving;
      harness.handlers.enterCity(arriving);

      expect(harness.saves.length).toBe(1);
      expect(harness.renders.length).toBe(1);
      expect(harness.saves[0].road?.milestonesSeen).toEqual([...owed]);
      expect(harness.herald).toEqual([]);
      expect(harness.screens).toEqual(['city_3d']);
    }
  });

  test('a second arrival neither writes again nor records anything twice', () => {
    const arriving = veteranArrival();
    const harness = cityHarness();
    harness.ref.current = arriving;

    harness.handlers.enterCity(arriving);
    const recorded = harness.saves[0];
    harness.render();
    harness.handlers.enterCity(recorded);

    expect(harness.saves.length).toBe(1);
    expect(harness.renders.length).toBe(1);
    expect(recorded.road?.milestonesSeen).toEqual(['sworn', 'blooded', 'known']);
    expect(harness.herald).toEqual([]);
  });

  test('existing history is preserved, in order, and never duplicated', () => {
    // A save that recorded part of its road already: the ids it holds stay first and
    // untouched, and only the missing ones are appended — monotonic, never rewritten.
    const harness = cityHarness();
    const arriving = veteranArrival({ road: { milestonesSeen: ['blooded'] } });
    harness.ref.current = arriving;

    harness.handlers.enterCity(arriving);

    expect(harness.saves.length).toBe(1);
    const seen = harness.saves[0].road?.milestonesSeen ?? [];
    expect(seen).toEqual(['blooded', 'sworn', 'known']);
    // No id was added twice and none of the stored ones was dropped.
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((id) => id === 'blooded').length).toBe(1);
  });

  test('a grandfathered veteran with no device is still offered the panel', () => {
    const harness = cityHarness();
    const arriving = veteranArrival();
    harness.ref.current = arriving;

    harness.handlers.enterCity(arriving);

    expect(harness.deviceOffers.length).toBe(1);
    expect(harness.herald).toEqual([]);
  });

  test('a chosen device is never reopened, and the record still lands', () => {
    const harness = cityHarness();
    const arriving = veteranArrival({ road: { bannerDevice: 'sword' } });
    harness.ref.current = arriving;

    harness.handlers.enterCity(arriving);

    expect(harness.deviceOffers).toEqual([]);
    expect(harness.saves[0].road?.milestonesSeen).toEqual(['sworn', 'blooded', 'known']);
    expect(harness.saves[0].road?.bannerDevice).toBe('sword');
  });

  test('an ordinary session profile whose road is already recorded stays quiet', () => {
    // The steady state: the duel settlement recorded the road first, so the arrival has
    // nothing to say, nothing to write and no device to offer.
    const harness = cityHarness();
    const arriving = veteranArrival({
      road: { milestonesSeen: ['sworn', 'blooded', 'known'], bannerDevice: 'sword' },
    });
    harness.ref.current = arriving;

    harness.handlers.enterCity(arriving);

    expect(harness.saves.length).toBe(0);
    expect(harness.renders.length).toBe(0);
    expect(harness.herald).toEqual([]);
    expect(harness.deviceOffers).toEqual([]);
    expect(harness.ref.current).toBe(arriving);
    expect(harness.screens).toEqual(['city_3d']);
  });

  test('the arrival commits one object through the ref, then state, then disk', () => {
    // Ordering and identity, read from the source the tests above execute: ref → state
    // → disk, with the arrival literal shared by all three.
    const body = extractHandler('enterCity');
    const refWrite = body.indexOf('profileRef.current = arrivalProfile;');
    const setState = body.indexOf('setProfile(arrivalProfile)');
    const save = body.indexOf('saveProfile(arrivalProfile)');
    expect(refWrite).toBeGreaterThan(-1);
    expect(setState).toBeGreaterThan(refWrite);
    expect(save).toBeGreaterThan(setState);
    expect(body.match(/profileRef\.current =/g)?.length).toBe(1);

    const harness = cityHarness();
    const arriving = championArrival();
    harness.ref.current = arriving;
    harness.handlers.enterCity(arriving);

    const committed = harness.committed();
    expect(committed.ref).toBe(committed.render);
    expect(committed.ref).toBe(committed.save);
    expect(committed.ref).not.toBe(arriving);
  });

  test('city entry is the silent, grandfathered call site; the duel is not', () => {
    // The two call shapes, pinned so neither can drift into the other's register.
    const cityBody = extractHandler('enterCity');
    expect(cityBody).toContain('evaluateRituals(null, forProfile, { silent: true })');
    expect(cityBody).not.toContain('evaluateRituals(forProfile, forProfile)');

    // The duel settlement hands a real before/after pair and passes NO options, so a
    // milestone won in the sand still raises its cry.
    const loudCalls = APP_SRC.match(/evaluateRituals\(base, updatedProfile\)/g) ?? [];
    expect(loudCalls.length).toBe(2);
    expect(APP_SRC).not.toContain('evaluateRituals(base, updatedProfile, {');
  });

  test('an arrival that earns nothing writes nothing but still syncs the ref', () => {
    const harness = cityHarness();
    // The ref holds an OLDER profile: the stale base this phase removes.
    harness.ref.current = fresh({ gold: 1 });
    const arriving = fresh();
    expect(harness.ref.current).not.toBe(arriving);

    harness.handlers.enterCity(arriving);

    expect(harness.saves.length).toBe(0);
    expect(harness.renders.length).toBe(0);
    // …and the ref is the profile the city was entered with, not the old one.
    expect(harness.ref.current).toBe(arriving);
    expect(harness.screens).toEqual(['city_3d']);
  });

  test('a freshly created gladiator is authoritative even with a stale ref', () => {
    const harness = cityHarness();
    harness.ref.current = null;
    const created = fresh();

    harness.handlers.enterCity(created);

    expect(harness.ref.current).toBe(created);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§G the settlement latch is not involved in any of these paths', () => {
  test('only the duel settlement arms or claims a bout', () => {
    const latch = createDuelSettlementLatch();
    expect(latch.currentId()).toBe(0);
    // None of the writers above names the latch at all.
    for (const name of WRITERS) {
      expect(extractHandler(name)).not.toContain('duelSettlement');
    }
    expect(extractHandler('enterCity')).not.toContain('duelSettlement');
  });
});
