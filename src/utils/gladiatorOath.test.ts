/**
 * The gladiator's oath — the closing beat of a new gladiator's arrival.
 *
 * Run with: `bun test src/utils/gladiatorOath.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the words: the four lines in order, each in Latin WITH its gloss on the
 *       same line; the Doctore's framing line; the closing vow; the one hold
 *       length; and the scene's own label (the Ludus Martial Yard, at dawn);
 *   §B  the trigger and the grandfather rule: only a profile that resolves
 *       UNSWORN opens the beat, and every shape of evidence a save written
 *       before this slice can carry (`fightsWon > 0` named first, then the
 *       rest) resolves as sworn, is never asked for the words, and is never
 *       repaired — an absent, partial or malformed `road` reads as "nothing
 *       said" and is left exactly as it was found;
 *   §C  the hold: a line advances ONLY while the press is down, a release keeps
 *       the progress it earned, one continuous press cannot swear two lines,
 *       the fourth line hands over to the closing vow, the vow ends the beat
 *       and the beat ends nothing else, and the machine is DEVICE-BLIND —
 *       touch, mouse and the space bar write one flag, so all three drive the
 *       same states from the same inputs;
 *   §D  the one write: `withOathSworn` sets `road.oathSworn` once and refuses a
 *       repeat, carries the road's other subfields, mutates nothing it is
 *       handed, and leaves through the caller's own `setProfile` +
 *       `saveProfile` pair — `App` reaches it from exactly one guarded place,
 *       and no other file in `src/` writes the field at all;
 *   §E  the arrival: the pose is the yard's own fast-travel arrival and stands
 *       inside the Doctore's hub radius, the rig is `oathDawn` and only
 *       `oathDawn`, the city is handed the beat's lock and the herald's
 *       pointer, every entry into the city comes through the one arrival
 *       function, and the herald's suppression, release and turn-to-the-sand
 *       are session scratch that can reach no save.
 *
 * The save used throughout is `createNewProfile()` — the same factory the game
 * uses — plus the legacy shapes a pre-slice save can carry. Storage runs against
 * an in-memory polyfill; no real browser storage is read or written.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
// @ts-ignore — assign before storage.ts is used
globalThis.localStorage = localStorageShim;

import type { PlayerProfile } from '../types/game';
import {
  OATH_CLOSING_LINE,
  OATH_FRAMING_LINE,
  OATH_HOLD_MS,
  OATH_LINES,
  OATH_SCENE_LABEL,
  OATH_SKIP_LABEL,
  OATH_YARD_SPAWN,
  hasPlayedBeforeRoad,
  isOathComplete,
  isOathSwornByField,
  oathCurrentLine,
  oathHoldProgress,
  oathLineText,
  oathWriteOnCompletion,
  readRoad,
  resolveOathBeatMode,
  resolveOathSworn,
  shouldPlayOathBeat,
  startOathBeat,
  stepOathBeat,
  withOathSworn,
  type OathBeatState,
} from './gladiatorOath';
import {
  EMPTY_HERALD_STATE,
  HERALD_COLOSSEUM,
  HERALD_SESSION_KEY,
  aimHerald,
  heraldPointerVisible,
  readHeraldState,
  releaseHeraldForEntry,
  suppressHeraldForEntry,
  type HeraldStore,
} from './cityHerald';
import { DAY_LIGHT, OATH_DAWN_LIGHT, resolveCityLightProfile } from './cityLightProfile';
import { FAST_TRAVEL_ARRIVALS, HUB_LOCATIONS } from './cityCollisions';
import { getTerrainY } from './terrainHeight';
import { PROFILE_STORAGE_KEY, createNewProfile, loadSavedProfile, saveProfile } from '../services/storage';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** A source with its comments stripped, so prose can neither satisfy nor defeat a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const srcDir = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });

const appSrc = load('../App.tsx');
const appCode = code(appSrc);
const beatSrc = load('../components/hub/OathBeat.tsx');
const beatCode = code(beatSrc);
const citySrc = load('../components/3d/city/CityHubScene.tsx');
const oathSrc = load('./gladiatorOath.ts');
const heraldSrc = load('./cityHerald.ts');
const heraldCode = code(heraldSrc);

const fresh = (): PlayerProfile => createNewProfile('Recruit');

/** A save written before this slice: the same profile, with no `road` field at all. */
const legacy = (evidence: Partial<PlayerProfile> = {}): PlayerProfile => {
  const profile = { ...fresh(), ...evidence } as PlayerProfile;
  delete (profile as { road?: unknown }).road;
  return profile;
};

/** One whole press: down for `ms`, then a frame released. */
const oneHold = (state: OathBeatState, ms: number = OATH_HOLD_MS): OathBeatState =>
  stepOathBeat(stepOathBeat(state, { pressed: true, deltaMs: ms }), { pressed: false, deltaMs: 16 });

/** A recording session store, so the herald can be driven without a browser. */
function recordingStore(initial: Record<string, string> = {}) {
  const raw = new Map<string, string>(Object.entries(initial));
  const store: HeraldStore = {
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
  };
  return { store, raw };
}

// ══════════════════════════════════════════════════════════════════════════
// A. The words
// ══════════════════════════════════════════════════════════════════════════

describe('A. The words', () => {
  test('the four lines, in order, each in Latin with its gloss on the same line', () => {
    expect(OATH_LINES.length).toBe(4);
    expect(OATH_LINES.map((line) => line.latin)).toEqual([
      'Uri',
      'Vinciri',
      'Verberari',
      'Ferroque necari',
    ]);
    for (const line of OATH_LINES) {
      expect(line.gloss.trim().length).toBeGreaterThan(0);
      const text = oathLineText(line);
      expect(text).toContain(line.latin);
      expect(text).toContain(line.gloss);
      // On the SAME line: the gloss never becomes a second sentence of its own.
      expect(text.includes('\n')).toBe(false);
    }
    expect(oathLineText(OATH_LINES[0])).toBe('Uri — to endure burning');
    expect(oathLineText(OATH_LINES[3])).toBe('Ferroque necari — and to be killed by the sword');
  });

  test('the Doctore frames the beat, and the vow closes it', () => {
    expect(OATH_FRAMING_LINE.trim().length).toBeGreaterThan(20);
    expect(OATH_CLOSING_LINE.trim().length).toBeGreaterThan(10);
    expect(OATH_CLOSING_LINE).not.toBe(OATH_FRAMING_LINE);
    expect(OATH_SKIP_LABEL.trim().length).toBeGreaterThan(0);
    // The vow is not one of the four lines: the litany is four and the close is the fifth.
    expect(OATH_LINES.map((line) => oathLineText(line))).not.toContain(OATH_CLOSING_LINE);
  });

  test('one hold length, and the scene says where it is delivered', () => {
    expect(OATH_HOLD_MS).toBe(1500);
    expect(OATH_SCENE_LABEL).toContain('Ludus Martial Yard');
    expect(OATH_SCENE_LABEL.toLowerCase()).toContain('dawn');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The trigger and the grandfather rule
// ══════════════════════════════════════════════════════════════════════════

describe('B. The trigger', () => {
  test('a fresh gladiator owes the words, and his save carries no road at all', () => {
    const profile = fresh();
    expect(profile.road).toBeUndefined(); // the factory never writes a road
    expect(readRoad(profile)).toBeNull();
    expect(isOathSwornByField(profile)).toBe(false);
    expect(resolveOathSworn(profile)).toBe(false);
    expect(shouldPlayOathBeat(profile)).toBe(true);
    expect(resolveOathBeatMode(profile)).toBe('full');
  });

  test('nothing to ask: a missing profile never opens the beat', () => {
    expect(shouldPlayOathBeat(null)).toBe(false);
    expect(shouldPlayOathBeat(undefined)).toBe(false);
    expect(resolveOathSworn(null)).toBe(false);
    expect(readRoad(undefined)).toBeNull();
    expect(withOathSworn(null)).toBeNull();
    expect(oathWriteOnCompletion(startOathBeat('full'))).toBe(false);
  });

  test('the field is the first answer, and only `true` counts', () => {
    const sworn = { ...fresh(), road: { oathSworn: true } } as PlayerProfile;
    expect(isOathSwornByField(sworn)).toBe(true);
    expect(resolveOathSworn(sworn)).toBe(true);
    expect(shouldPlayOathBeat(sworn)).toBe(false);
    expect(resolveOathBeatMode(sworn)).toBe('skip');

    const explicitNo = { ...fresh(), road: { oathSworn: false } } as PlayerProfile;
    expect(isOathSwornByField(explicitNo)).toBe(false);
    expect(shouldPlayOathBeat(explicitNo)).toBe(true);

    const junk = { ...fresh(), road: { oathSworn: 'yes' } } as unknown as PlayerProfile;
    expect(isOathSwornByField(junk)).toBe(false);
    expect(shouldPlayOathBeat(junk)).toBe(true);
  });

  test('an absent, partial or malformed road reads as "nothing said" and never throws', () => {
    for (const road of [null, undefined, 'x', 7, [], {}, { oathSworn: 'maybe' }]) {
      const profile = { ...fresh(), road } as unknown as PlayerProfile;
      expect(() => shouldPlayOathBeat(profile)).not.toThrow();
      expect({ road: JSON.stringify(road), beat: shouldPlayOathBeat(profile) }).toEqual({
        road: JSON.stringify(road),
        beat: true,
      });
    }
    const partial = { ...fresh(), road: { bannerDevice: 'aquila' } } as PlayerProfile;
    expect(readRoad(partial)).toEqual({ bannerDevice: 'aquila' });
    expect(resolveOathSworn(partial)).toBe(false);
  });

  test('the grandfather rule: any evidence the save already carries resolves as sworn', () => {
    const shapes: Array<[string, Partial<PlayerProfile>]> = [
      ['fightsWon', { fightsWon: 1 }],
      ['fightsLost', { fightsLost: 1 }],
      ['level', { level: 2 }],
      ['xp', { xp: 1 }],
      ['fame', { fame: 1 }],
      ['bossKills', { bossKills: 1 }],
      ['newGamePlus', { newGamePlus: 1 }],
      ['defeatedOpponentIds', { defeatedOpponentIds: ['marcus_the_shield'] }],
    ];
    for (const [shape, evidence] of shapes) {
      const profile = legacy(evidence);
      expect({ shape, played: hasPlayedBeforeRoad(profile) }).toEqual({ shape, played: true });
      expect({ shape, sworn: resolveOathSworn(profile) }).toEqual({ shape, sworn: true });
      expect({ shape, beat: shouldPlayOathBeat(profile) }).toEqual({ shape, beat: false });
      // …and the beat's write refuses him: a legacy gladiator is never given a road.
      expect({ shape, write: withOathSworn(profile) }).toEqual({ shape, write: null });
    }
  });

  test('`fightsWon > 0` is the stated fallback, and a genuinely new gladiator is not caught by it', () => {
    expect(resolveOathSworn(legacy({ fightsWon: 3 }))).toBe(true);
    const brandNew = fresh();
    expect({
      fightsWon: brandNew.fightsWon,
      fightsLost: brandNew.fightsLost,
      level: brandNew.level,
      xp: brandNew.xp,
      fame: brandNew.fame,
      bossKills: brandNew.bossKills,
      newGamePlus: brandNew.newGamePlus,
      defeated: brandNew.defeatedOpponentIds.length,
    }).toEqual({
      fightsWon: 0,
      fightsLost: 0,
      level: 1,
      xp: 0,
      fame: 0,
      bossKills: 0,
      newGamePlus: 0,
      defeated: 0,
    });
    expect(resolveOathSworn(brandNew)).toBe(false);
    expect(shouldPlayOathBeat(brandNew)).toBe(true);
  });

  test('resolving a legacy save writes nothing, and the round trip keeps it loading', () => {
    const profile = legacy({ fightsWon: 4, level: 3, xp: 250 });
    const before = JSON.stringify(profile);
    expect(shouldPlayOathBeat(profile)).toBe(false);
    expect(hasPlayedBeforeRoad(profile)).toBe(true);
    expect(resolveOathBeatMode(profile)).toBe('skip');
    expect(JSON.stringify(profile)).toBe(before); // asking the question changes nothing

    _store.clear();
    saveProfile(profile);
    const loaded = loadSavedProfile();
    expect(loaded).not.toBeNull();
    expect('road' in (loaded as object)).toBe(false); // no migration invented one
    expect(resolveOathSworn(loaded)).toBe(true);
    expect(shouldPlayOathBeat(loaded)).toBe(false);
    expect(JSON.stringify(loaded)).toBe(before); // byte-identical through a real save
    _store.clear();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The hold
// ══════════════════════════════════════════════════════════════════════════

describe('C. The hold', () => {
  test('a fresh beat starts on the first line, with nothing held', () => {
    const state = startOathBeat('full');
    expect({ phase: state.phase, line: state.line, heldMs: state.heldMs, holds: state.holds }).toEqual({
      phase: 'lines',
      line: 0,
      heldMs: 0,
      holds: 0,
    });
    expect(state.holding).toBe(false);
    expect(state.awaitingRelease).toBe(false);
    expect(oathHoldProgress(state)).toBe(0);
    expect(oathCurrentLine(state)).toEqual(OATH_LINES[0]);
    expect(isOathComplete(state)).toBe(false);
  });

  test('a step with no press changes nothing at all', () => {
    const state = startOathBeat('full');
    expect(stepOathBeat(state, { pressed: false, deltaMs: 5000 })).toEqual(state);
    expect(stepOathBeat(state, { pressed: false, deltaMs: 0 })).toEqual(state);
  });

  test('a release keeps the progress it earned — nothing is lost and nothing times out', () => {
    const held = stepOathBeat(startOathBeat('full'), { pressed: true, deltaMs: 900 });
    expect(held.holding).toBe(true);
    expect(held.heldMs).toBe(900);
    expect(oathHoldProgress(held)).toBeCloseTo(0.6, 5);
    const released = stepOathBeat(held, { pressed: false, deltaMs: 60000 });
    expect({ line: released.line, heldMs: released.heldMs, phase: released.phase }).toEqual({
      line: 0,
      heldMs: 900,
      phase: 'lines',
    });
    expect(released.holding).toBe(false);
    // …and it resumes from there.
    const resumed = stepOathBeat(released, { pressed: true, deltaMs: 600 });
    expect(resumed.line).toBe(1);
    expect(resumed.holds).toBe(1);
  });

  test('a line lands only when the hold reaches the length, on any press path', () => {
    const justShort = stepOathBeat(startOathBeat('full'), { pressed: true, deltaMs: OATH_HOLD_MS - 1 });
    expect({ line: justShort.line, holds: justShort.holds, phase: justShort.phase }).toEqual({
      line: 0,
      holds: 0,
      phase: 'lines',
    });
    expect(oathHoldProgress(justShort)).toBeLessThan(1);
    const exact = stepOathBeat(startOathBeat('full'), { pressed: true, deltaMs: OATH_HOLD_MS });
    expect({ line: exact.line, holds: exact.holds }).toEqual({ line: 1, holds: 1 });
  });

  test('one continuous press cannot swear two lines: each line gets its own press', () => {
    const first = stepOathBeat(startOathBeat('full'), { pressed: true, deltaMs: OATH_HOLD_MS });
    expect(first.awaitingRelease).toBe(true);
    // The finger is still down — nothing else can land.
    const stillHeld = stepOathBeat(first, { pressed: true, deltaMs: OATH_HOLD_MS * 10 });
    expect({ line: stillHeld.line, holds: stillHeld.holds }).toEqual({ line: 1, holds: 1 });
    // The release arms the next line; the next press swears it.
    const released = stepOathBeat(stillHeld, { pressed: false, deltaMs: 16 });
    expect(released.awaitingRelease).toBe(false);
    const second = stepOathBeat(released, { pressed: true, deltaMs: OATH_HOLD_MS });
    expect({ line: second.line, holds: second.holds }).toEqual({ line: 2, holds: 2 });
  });

  test('the four lines hand over to the closing vow, and the vow ends the beat', () => {
    let state = startOathBeat('full');
    for (let i = 0; i < OATH_LINES.length; i += 1) {
      state = oneHold(state);
    }
    expect({ phase: state.phase, holds: state.holds, line: state.line }).toEqual({
      phase: 'closing',
      holds: 4,
      line: OATH_LINES.length - 1,
    });
    expect(isOathComplete(state)).toBe(false);
    state = oneHold(state);
    expect({ phase: state.phase, holds: state.holds }).toEqual({ phase: 'sworn', holds: 5 });
    expect(isOathComplete(state)).toBe(true);
    expect(oathHoldProgress(state)).toBe(1);
  });

  test('`sworn` is the beat\u2019s only ending: no phase can be failed into, and none resets', () => {
    let state = startOathBeat('full');
    for (let i = 0; i < OATH_LINES.length + 1; i += 1) {
      state = oneHold(state);
    }
    expect(stepOathBeat(state, { pressed: true, deltaMs: 999999 })).toEqual(state);
    expect(stepOathBeat(state, { pressed: false, deltaMs: 999999 })).toEqual(state);
    expect(oathCurrentLine(state)).toEqual(OATH_LINES[OATH_LINES.length - 1]); // clamps, never throws
  });

  test('the skip is ONE hold, and it never writes', () => {
    const state = startOathBeat('skip');
    expect(state.phase).toBe('skip');
    const sworn = oneHold(state);
    expect({ phase: sworn.phase, holds: sworn.holds }).toEqual({ phase: 'sworn', holds: 1 });
    expect(oathWriteOnCompletion(sworn)).toBe(false);
  });

  test('the machine is device-blind: touch, mouse and Space write one press flag', () => {
    // The input carries a press and a frame delta — there is no field a device could
    // set differently, so all three paths can only drive the same states.
    const inputBlock = oathSrc.slice(oathSrc.indexOf('interface OathBeatInput'));
    const declared = inputBlock.slice(0, inputBlock.indexOf('}')).match(/\w+\??:/g) ?? [];
    expect(declared.map((field) => field.replace('?', ''))).toEqual(['pressed:', 'deltaMs:']);

    // …and the scene has exactly one press ref, written by both device paths.
    expect(beatSrc.match(/const pressedRef = useRef\(false\)/g)?.length).toBe(1);
    expect(beatSrc.match(/pressedRef\.current = true/g)?.length).toBe(2); // pointerdown, Space
    expect(beatSrc).toContain('onPointerDown');
    expect(beatSrc).toContain("event.code !== 'Space'");
    expect(beatSrc).toContain('stepOathBeat(prev, { pressed, deltaMs })');
    // Releases are taken from the window, so a hold that leaves the panel still ends.
    expect(beatSrc).toContain("window.addEventListener('pointerup', release)");
    expect(beatSrc).toContain("window.addEventListener('pointercancel', release)");
    expect(beatSrc).toContain("window.addEventListener('blur', release)");

    // Driving the machine with one sequence twice is one sequence: nothing branches on
    // where the press came from.
    const drive = (): OathBeatState[] => {
      let state = startOathBeat('full');
      const seen: OathBeatState[] = [];
      for (const input of [
        { pressed: true, deltaMs: 400 },
        { pressed: true, deltaMs: 1200 },
        { pressed: false, deltaMs: 16 },
        { pressed: true, deltaMs: OATH_HOLD_MS },
        { pressed: false, deltaMs: 16 },
      ]) {
        state = stepOathBeat(state, input);
        seen.push(state);
      }
      return seen;
    };
    expect(drive()).toEqual(drive());
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The one write
// ══════════════════════════════════════════════════════════════════════════

describe('D. The one write', () => {
  test('a completed full oath sets the field — once — and hands back a NEW profile', () => {
    const profile = fresh();
    const before = JSON.stringify(profile);
    const sworn = withOathSworn(profile);
    expect(sworn).not.toBeNull();
    expect(resolveOathSworn(sworn)).toBe(true);
    expect(shouldPlayOathBeat(sworn)).toBe(false);
    // The profile it was handed is untouched: no write in place, no mutation.
    expect(JSON.stringify(profile)).toBe(before);
    expect(profile.road).toBeUndefined();
    // A repeat is refused, so the field can only ever be set once.
    expect(withOathSworn(sworn)).toBeNull();
  });

  test('the write touches the road and nothing else', () => {
    const profile = { ...fresh(), gold: 777, road: { bannerDevice: 'aquila', milestonesSeen: ['first_blood'] } } as PlayerProfile;
    const sworn = withOathSworn(profile) as PlayerProfile;
    expect(sworn.road).toEqual({
      bannerDevice: 'aquila',
      milestonesSeen: ['first_blood'],
      oathSworn: true,
    });
    const { road: _ignoredA, ...restBefore } = profile;
    const { road: _ignoredB, ...restAfter } = sworn;
    expect(restAfter).toEqual(restBefore);
    expect(sworn.gold).toBe(777);
  });

  test('only a completed FULL oath is the write', () => {
    const full = startOathBeat('full');
    expect(oathWriteOnCompletion(full)).toBe(false);
    let state = full;
    for (let i = 0; i < OATH_LINES.length; i += 1) state = oneHold(state);
    expect(oathWriteOnCompletion(state)).toBe(false); // the vow is still owed
    state = oneHold(state);
    expect(oathWriteOnCompletion(state)).toBe(true);
    expect(oathWriteOnCompletion(oneHold(startOathBeat('skip')))).toBe(false);
  });

  test('the written field survives the game\u2019s own save pair', () => {
    _store.clear();
    const sworn = withOathSworn(fresh()) as PlayerProfile;
    saveProfile(sworn);
    const loaded = loadSavedProfile() as PlayerProfile;
    expect(resolveOathSworn(loaded)).toBe(true);
    expect(isOathSwornByField(loaded)).toBe(true);
    expect(shouldPlayOathBeat(loaded)).toBe(false);
    _store.clear();
  });

  test('the app reaches the write from exactly one guarded place', () => {
    expect(appCode.match(/withOathSworn\(/g)?.length).toBe(1);
    expect(appCode.match(/oathWriteOnCompletion\(/g)?.length).toBe(1);
    expect(appCode).toContain('const sworn = withOathSworn(profile);');
    expect(appCode).toContain('setProfile(sworn);');
    expect(appCode).toContain('saveProfile(sworn);');
    // …and the guard is the completed full oath, asked before anything is written.
    const complete = appCode.indexOf('const handleOathComplete');
    expect(complete).toBeGreaterThan(-1);
    expect(appCode.indexOf('oathWriteOnCompletion(finalState)')).toBeGreaterThan(complete);
    expect(appCode.indexOf('withOathSworn(profile)')).toBeGreaterThan(complete);
  });

  test('no other file in src/ writes the field', () => {
    const writers = walk(srcDir)
      .filter((file) => !file.endsWith('gladiatorOath.ts'))
      // `roadOfGlory.ts` reads the field into its resolved value; it never writes it.
      .filter((file) => !file.endsWith('roadOfGlory.ts'))
      // `storyState.ts` reads it the same way, through a structural cast, so the
      // campaign's Oath gate is correct before the field is declared; it never writes it.
      .filter((file) => !file.endsWith('storyState.ts'))
      // Test fixtures name the field too (this suite's own did, and the road suites' do);
      // the claim is about production files, so every .test.ts is out of scope.
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) => /oathSworn\s*:/.test(code(readFileSync(file, 'utf8'))))
      .map((file) => file.replace(srcDir, ''))
      .filter((file) => file !== '/types/game.ts');
    expect(writers).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The arrival
// ══════════════════════════════════════════════════════════════════════════

describe('E. The arrival', () => {
  test('the pose is the yard\u2019s own fast-travel arrival, standing in the Doctore\u2019s reach', () => {
    const arrival = FAST_TRAVEL_ARRIVALS.training_yard;
    expect(arrival).toEqual([-18, 2]);
    expect(OATH_YARD_SPAWN.position[0]).toBe(arrival[0]);
    expect(OATH_YARD_SPAWN.position[2]).toBe(arrival[1]);
    expect(OATH_YARD_SPAWN.position[1]).toBe(0);
    // The city's own ground there, not a second height invented for the beat.
    expect(getTerrainY(OATH_YARD_SPAWN.position[0], OATH_YARD_SPAWN.position[2])).toBe(0);
    // Facing north — into the yard, at the hub the Doctore's interaction lives on.
    expect(OATH_YARD_SPAWN.rotationY).toBe(Math.PI);

    const yard = HUB_LOCATIONS.find((location) => location.id === 'training_yard');
    expect(yard).toBeDefined();
    expect(yard!.name).toBe('Ludus Martial Yard');
    const dx = OATH_YARD_SPAWN.position[0] - yard!.position[0];
    const dz = OATH_YARD_SPAWN.position[2] - yard!.position[2];
    const distance = Math.hypot(dx, dz);
    expect(distance).toBeLessThan(yard!.radius); // the interaction is in reach from the pose
  });

  test('the rig is a dawn, and it is the ONLY thing the name changes', () => {
    expect(resolveCityLightProfile('oathDawn')).toBe(OATH_DAWN_LIGHT);
    expect(resolveCityLightProfile()).toBe(DAY_LIGHT);
    expect(resolveCityLightProfile('day')).toBe(DAY_LIGHT);
    expect(resolveCityLightProfile('anything-else' as never)).toBe(DAY_LIGHT);

    // Same rig, same keys: a dawn is a lighting change, never a missing value.
    expect(Object.keys(OATH_DAWN_LIGHT)).toEqual(Object.keys(DAY_LIGHT));
    expect(OATH_DAWN_LIGHT).not.toEqual(DAY_LIGHT);
    // A low eastern sun, warm haze, and a scene that stays legible.
    expect(OATH_DAWN_LIGHT.sunPosition[1]).toBeLessThan(DAY_LIGHT.sunPosition[1]);
    expect(OATH_DAWN_LIGHT.sunPosition[0]).toBeGreaterThan(DAY_LIGHT.sunPosition[0]);
    expect(OATH_DAWN_LIGHT.keyIntensity).toBeGreaterThan(0);
    expect(OATH_DAWN_LIGHT.ambientIntensity).toBeGreaterThan(0);
    expect(OATH_DAWN_LIGHT.environmentIntensity).toBeGreaterThan(0);
    expect(Number.isFinite(OATH_DAWN_LIGHT.fogFar)).toBe(true);
  });

  test('the city takes the beat\u2019s lock, its rig and the herald\u2019s pointer', () => {
    expect(citySrc).toContain('lightProfile?: CityLightProfile;');
    expect(citySrc).toContain('movementLocked?: boolean;');
    expect(citySrc).toContain('heraldAim?: HeraldAim | null;');
    expect(citySrc).toContain('const lights = resolveCityLightProfile(lightProfile);');
    // The lock is read by the one movement loop.
    expect(citySrc).toContain('inputLockedRef.current = !!movementLocked;');
    expect(citySrc.match(/if \(inputLockedRef\.current\) return;/g)?.length).toBeGreaterThan(0);
    // The pointer names a landmark the city already has, and opens the existing map.
    expect(citySrc).toContain('HUB_LOCATIONS.find((location) => location.id === heraldAim.id)');
    expect(citySrc).toContain('data-herald-aim={heraldTarget.id}');

    // …and App hands the city exactly those three.
    expect(appCode).toContain("lightProfile={oathBeatMode ? 'oathDawn' : undefined}");
    expect(appCode).toContain('movementLocked={!!oathBeatMode}');
    expect(appCode).toContain('heraldAim={heraldPointerVisible(herald) ? herald.aim : null}');
    expect(appCode).toContain(
      'initialPosition={oathBeatMode ? OATH_YARD_SPAWN.position : cityReturnPose?.position}',
    );
    expect(appCode).toContain(
      'initialRotationY={oathBeatMode ? OATH_YARD_SPAWN.rotationY : cityReturnPose?.rotationY}',
    );
  });

  test('the beat owns the screen, and free roam begins when it ends', () => {
    expect(appSrc).toContain("import { OathBeat } from './components/hub/OathBeat';");
    expect(appCode).toContain(
      '{oathBeatMode && <OathBeat mode={oathBeatMode} onComplete={handleOathComplete} />}',
    );
    // It is mounted with the city, not with any other screen.
    const city = appCode.indexOf("currentScreen === 'city_3d'");
    const beat = appCode.indexOf('{oathBeatMode && <OathBeat');
    const hub = appCode.indexOf("currentScreen === 'hub_2d' && profile");
    expect(city).toBeGreaterThan(-1);
    expect(beat).toBeGreaterThan(city);
    expect(beat).toBeLessThan(hub);
    // Ending the beat releases the lock and the pose in one state change.
    expect(appCode).toContain('const handleOathComplete = (finalState: OathBeatState) => {');
    expect(appCode.lastIndexOf('setOathBeatMode(null);')).toBeGreaterThan(
      appCode.indexOf('const handleOathComplete'),
    );
    // One sound, from the engine the duel's blocks already use.
    expect(beatCode.match(/sounds\.playBlock\(\)/g)?.length).toBe(1);
    expect(beatCode).toContain('data-oath-hold="1"');
    expect(beatCode).toContain('data-oath-phase={beat.phase}');
  });

  test('the trigger is asked once, in the one arrival function every entry uses', () => {
    expect(appCode.match(/shouldPlayOathBeat\(/g)?.length).toBe(1);
    expect(appCode).toContain('const enterCity = (forProfile: PlayerProfile) => {');
    // Every path into the city goes through it…
    expect(appCode.match(/enterCity\(/g)!.length).toBeGreaterThanOrEqual(10);
    // …and the only bare screen assignments left are the two guarded fallbacks.
    expect(appCode.match(/setCurrentScreen\('city_3d'\)/g)?.length).toBe(3);
    // …two guarded fallbacks (the duel's dismissal and the race's exit) and the hub's
    // own way back in.
    expect(appCode.match(/if \(profile\) enterCity\(profile\);/g)?.length).toBe(3);
    // The nudge is offered when the oath is taken, not when the gladiator is made.
    expect(appCode.match(/postOathNudge\.offer\(\)/g)?.length).toBe(1);
    expect(appCode.indexOf('postOathNudge.offer()')).toBeGreaterThan(
      appCode.indexOf('const handleOathComplete'),
    );
  });

  test('the herald holds its pointer for the oath entry, and only for that entry', () => {
    const { store, raw } = recordingStore();
    expect(readHeraldState(store)).toEqual(EMPTY_HERALD_STATE);
    expect(heraldPointerVisible(readHeraldState(store))).toBe(false);

    // A previous arrival aimed it somewhere; the oath entry holds it down.
    aimHerald({ id: 'colosseum', note: 'x' }, store);
    expect(heraldPointerVisible(readHeraldState(store))).toBe(true);
    const suppressed = suppressHeraldForEntry(store);
    expect(suppressed.suppressedForEntry).toBe(true);
    expect(heraldPointerVisible(suppressed)).toBe(false);
    expect(heraldPointerVisible(readHeraldState(store))).toBe(false);
    expect(raw.has(HERALD_SESSION_KEY)).toBe(true);

    // The next ordinary arrival hands it back, with the same aim.
    const released = releaseHeraldForEntry(store);
    expect(released.aim).toEqual({ id: 'colosseum', note: 'x' });
    expect(heraldPointerVisible(released)).toBe(true);
  });

  test('the release turns the herald to the sand, at a place the city already has', () => {
    const { store } = recordingStore();
    suppressHeraldForEntry(store);
    const aimed = aimHerald(HERALD_COLOSSEUM, store);
    expect(aimed.aim).toEqual(HERALD_COLOSSEUM);
    expect(aimed.suppressedForEntry).toBe(false);
    expect(heraldPointerVisible(aimed)).toBe(true);
    expect(HUB_LOCATIONS.some((location) => location.id === HERALD_COLOSSEUM.id)).toBe(true);
    expect(HERALD_COLOSSEUM.note.trim().length).toBeGreaterThan(0);
  });

  test('a torn record reads as nothing, is left as it was found, and the herald can save nothing', () => {
    for (const rawValue of ['not json', '{}', '{"aim":"colosseum"}', '{"aim":{"id":""}}', 'null']) {
      const { store, raw } = recordingStore({ [HERALD_SESSION_KEY]: rawValue });
      expect({ raw: rawValue, state: readHeraldState(store) }).toEqual({
        raw: rawValue,
        state: EMPTY_HERALD_STATE,
      });
      expect(raw.get(HERALD_SESSION_KEY)).toBe(rawValue); // reading never repairs
    }
    // Session scratch, and provably not the profile's key.
    expect(HERALD_SESSION_KEY).not.toBe(PROFILE_STORAGE_KEY);
    expect(heraldCode).not.toContain('localStorage');
    expect(heraldCode).not.toContain('PROFILE_STORAGE_KEY');
    expect(heraldSrc).toContain('sessionStorage');
  });

  test('the app suppresses, releases and re-aims the pointer through that module alone', () => {
    expect(appCode).toContain('setHerald(suppressHeraldForEntry());');
    expect(appCode).toContain('setHerald(releaseHeraldForEntry());');
    expect(appCode).toContain('setHerald(aimHerald(HERALD_COLOSSEUM));');
    expect(appCode).toContain('useState<HeraldState>(() => readHeraldState())');
    // The suppression is the oath branch's, and the release is the other branch's.
    const suppress = appCode.indexOf('setHerald(suppressHeraldForEntry())');
    const release = appCode.indexOf('setHerald(releaseHeraldForEntry())');
    expect(suppress).toBeGreaterThan(appCode.indexOf('shouldPlayOathBeat(forProfile)'));
    expect(release).toBeGreaterThan(suppress);
  });
});
