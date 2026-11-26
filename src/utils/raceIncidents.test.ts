// LADDER-1C — the race steward: wheel contact, trace tangles, fault,
// and the session-only race log.
//
// The tests below are constructed scenarios at the steward level (pure
// poses, no driver, no scene): warning precedes every incident, steering
// clear prevents it, fault follows the last gap-closer, the innocent
// rig's penalty is capped at the scrape level, tangles fire only inside
// meta zones, immunity windows suppress re-triggering, District runs
// walls only (A6), and the log's plain-language lines match its
// structured entries. The full-race soak (20 simulated races with the
// steward wired into the driver + separation loop) is the last describe
// block; it states the incident-rate bound from measurement (§7 Q7).
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_INCIDENT_RIG_EFFECTS,
  RACE_INCIDENT_CONFIG,
  createIncidentStewardState,
  formatRaceIncidentLogEntry,
  incidentZoneForRig,
  stepIncidentSteward,
  type IncidentRigEffects,
  type IncidentRigPose,
  type IncidentStewardState,
  type RaceIncidentLogEntry,
} from './raceIncidents';
import { advanceChariot, createChariotMotion, isChariotInsideArena } from './chariotMovement';
import {
  LEAGUE_POOL,
  RACE_COMPETITORS,
  resolveRivalDriverProfile,
  resolveRungField,
  type RaceCompetitor,
} from './raceCompetitors';
import {
  RIVAL_RIG_LENGTH,
  createRivalDriver,
  driveRival,
  resolveDriverPaceCap,
  rivalDriverRoutePosition,
  type RivalDriverState,
  type RivalRigSnapshot,
} from './rivalDriver';
import { resolveRigSeparation, rigOverlap } from './raceRigCollision';
import { FORMATION_ROW_GAP, resolveFormationSlots } from './raceGrid';
import type { RaceRungId } from './raceCompetitors';

const DT_MS = 1000 / 60;

/** One rig on the west lane, heading north, at pace — wall-clear by construction. */
function rigPose(id: string, overrides: Partial<IncidentRigPose> = {}): IncidentRigPose {
  return {
    id,
    name: id === 'player' ? 'You' : id,
    isPlayer: id === 'player',
    x: 44.54,
    z: 0,
    heading: 0,
    speed: 2.5,
    width: 1.5,
    s: 30,
    lap: 0,
    u: 0,
    zone: 'straight',
    meta: null,
    ...overrides,
  };
}

/** Step the steward `count` ticks from `elapsedMs`, 1/60 s apart. */
function stepTicks(
  state: IncidentStewardState,
  rigs: IncidentRigPose[],
  startMs: number,
  count: number,
  rung: RaceRungId = 'league',
): { elapsedMs: number; entries: RaceIncidentLogEntry[] } {
  const entries: RaceIncidentLogEntry[] = [];
  let elapsedMs = startMs;
  for (let i = 0; i < count; i++) {
    const out = stepIncidentSteward(state, { rigs, rung, elapsedMs, lap: 1 });
    entries.push(...out.newLogEntries);
    elapsedMs += DT_MS;
  }
  return { elapsedMs, entries };
}

/** The entries of one type, in log order. */
function ofType(entries: RaceIncidentLogEntry[], type: RaceIncidentLogEntry['type']): RaceIncidentLogEntry[] {
  return entries.filter((e) => e.type === type);
}

describe('raceIncidents — wheel contact: warning first, then hub catch', () => {
  test('a scrape warning precedes every hub catch, and the catch fires on the initiator only', () => {
    const state = createIncidentStewardState('league');
    // B closes on A (holding its lane): B's x and u move toward A's each tick.
    const a = rigPose('player', { name: 'You' });
    const b = rigPose('rival-b', { name: 'Rufus of the Russata', x: 46.74, u: 1.5 });
    const allEntries: RaceIncidentLogEntry[] = [];
    let elapsedMs = 4000;
    // Ticks 0–1: apart (body centres 2.2 apart — no circle overlap).
    let out = stepTicks(state, [a, b], elapsedMs, 2);
    elapsedMs = out.elapsedMs;
    allEntries.push(...out.entries);
    expect(allEntries).toHaveLength(0);
    // Ticks 2–5: B closes to a scrape (centres 1.9 apart — body overlap 0.2).
    for (let i = 0; i < 4; i++) {
      b.x -= 0.075;
      b.u -= 0.075;
      out = stepTicks(state, [a, b], elapsedMs, 1);
      elapsedMs = out.elapsedMs;
      allEntries.push(...out.entries);
    }
    const warnings = ofType(allEntries, 'scrape-warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].atFaultId).toBe('rival-b');
    expect(warnings[0].otherId).toBe('player');
    // The warning's effects: the initiator steers to clear, the innocent holds its line.
    const warnEffects = stepIncidentSteward(state, { rigs: [a, b], rung: 'league', elapsedMs, lap: 1 }).effects;
    expect(warnEffects.get('rival-b')?.warning).toBe('initiator');
    expect(warnEffects.get('player')?.warning).toBe('innocent');
    expect(warnEffects.get('rival-b')?.dragScale).toBe(RACE_INCIDENT_CONFIG.scrapeDragScale);
    expect(warnEffects.get('player')?.dragScale).toBe(RACE_INCIDENT_CONFIG.scrapeDragScale);
    // Ticks 6–15: B closes to a hub catch (centres 1.5 apart — body overlap 0.6).
    for (let i = 0; i < 10; i++) {
      b.x -= 0.04;
      b.u -= 0.04;
      out = stepTicks(state, [a, b], elapsedMs, 1);
      elapsedMs = out.elapsedMs;
      allEntries.push(...out.entries);
    }
    // The warning has not run 0.6 s yet: no catch, however deep the overlap.
    expect(ofType(allEntries, 'hub-catch')).toHaveLength(0);
    // Hold the deep overlap for the rest of the warning's 0.6 s (36 ticks).
    out = stepTicks(state, [a, b], elapsedMs, 40);
    elapsedMs = out.elapsedMs;
    allEntries.push(...out.entries);
    const catches = ofType(allEntries, 'hub-catch');
    expect(catches).toHaveLength(1);
    expect(catches[0].atFaultId).toBe('rival-b');
    expect(catches[0].otherId).toBe('player');
    // The warning precedes the catch in the log (same pair, earlier tick).
    expect(warnings[0].tick).toBeLessThan(catches[0].tick);
    // The catch's effects: the initiator takes the strong drag, the
    // innocent is capped at the scrape level, and neither is warned.
    const catchEffects = stepIncidentSteward(state, { rigs: [a, b], rung: 'league', elapsedMs, lap: 1 }).effects;
    expect(catchEffects.get('rival-b')?.dragScale).toBe(RACE_INCIDENT_CONFIG.hubCatchDragScale);
    expect(catchEffects.get('player')?.dragScale).toBe(RACE_INCIDENT_CONFIG.scrapeDragScale);
    expect(catchEffects.get('rival-b')?.warning).toBe('none');
    expect(catchEffects.get('player')?.warning).toBe('none');
  });

  test('steering clear during the warning clears it with no incident', () => {
    const state = createIncidentStewardState('league');
    const a = rigPose('player', { name: 'You' });
    const b = rigPose('rival-b', { name: 'Rufus of the Russata', x: 46.74, u: 1.5 });
    const allEntries: RaceIncidentLogEntry[] = [];
    let elapsedMs = 4000;
    let out = stepTicks(state, [a, b], elapsedMs, 2);
    elapsedMs = out.elapsedMs;
    allEntries.push(...out.entries);
    for (let i = 0; i < 4; i++) {
      b.x -= 0.075;
      b.u -= 0.075;
      out = stepTicks(state, [a, b], elapsedMs, 1);
      elapsedMs = out.elapsedMs;
      allEntries.push(...out.entries);
    }
    expect(ofType(allEntries, 'scrape-warning')).toHaveLength(1);
    // B steers clear: back to apart, before the warning's 0.6 s runs out.
    for (let i = 0; i < 6; i++) {
      b.x += 0.05;
      b.u += 0.05;
      out = stepTicks(state, [a, b], elapsedMs, 1);
      elapsedMs = out.elapsedMs;
      allEntries.push(...out.entries);
    }
    out = stepTicks(state, [a, b], elapsedMs, 60);
    allEntries.push(...out.entries);
    expect(ofType(allEntries, 'hub-catch')).toHaveLength(0);
    const effects = stepIncidentSteward(state, { rigs: [a, b], rung: 'league', elapsedMs: out.elapsedMs, lap: 1 }).effects;
    expect(effects.get('rival-b')?.warning).toBe('none');
    expect(effects.get('rival-b')?.dragScale).toBe(1);
    expect(effects.get('player')?.dragScale).toBe(1);
  });

  test('fault follows the LAST gap-closer, not the first', () => {
    const state = createIncidentStewardState('league');
    const a = rigPose('player', { name: 'You' });
    const b = rigPose('rival-b', { name: 'Rufus of the Russata', x: 46.74, u: 1.5 });
    const allEntries: RaceIncidentLogEntry[] = [];
    let elapsedMs = 4000;
    let out = stepTicks(state, [a, b], elapsedMs, 2);
    elapsedMs = out.elapsedMs;
    allEntries.push(...out.entries);
    // B closes first, to a scrape (closer: B).
    for (let i = 0; i < 4; i++) {
      b.x -= 0.075;
      b.u -= 0.075;
      out = stepTicks(state, [a, b], elapsedMs, 1);
      elapsedMs = out.elapsedMs;
      allEntries.push(...out.entries);
    }
    expect(ofType(allEntries, 'scrape-warning')[0].atFaultId).toBe('rival-b');
    // B holds; A closes the rest of the way to a hub catch (closer: A).
    for (let i = 0; i < 10; i++) {
      a.x += 0.04;
      a.u += 0.04;
      out = stepTicks(state, [a, b], elapsedMs, 1);
      elapsedMs = out.elapsedMs;
      allEntries.push(...out.entries);
    }
    out = stepTicks(state, [a, b], elapsedMs, 40);
    allEntries.push(...out.entries);
    const catches = ofType(allEntries, 'hub-catch');
    expect(catches).toHaveLength(1);
    expect(catches[0].atFaultId).toBe('player');
    expect(catches[0].otherId).toBe('rival-b');
  });

  test('a nose-to-tail brush is not wheel contact, however deep the circle overlap', () => {
    const state = createIncidentStewardState('league');
    // B directly behind A (same x): B's nose overlaps A's body by 1.27 —
    // deep circle overlap, but lengthways, not lateral.
    const a = rigPose('player', { name: 'You' });
    const b = rigPose('rival-b', { name: 'Rufus of the Russata', x: 44.54, z: 2.5, s: 27.5 });
    const out = stepTicks(state, [a, b], 4000, 60);
    expect(ofType(out.entries, 'scrape-warning')).toHaveLength(0);
    expect(ofType(out.entries, 'hub-catch')).toHaveLength(0);
  });

  test('no warning and no incident inside the first 3 s after the start', () => {
    const state = createIncidentStewardState('league');
    const a = rigPose('player', { name: 'You' });
    const b = rigPose('rival-b', { name: 'Rufus of the Russata', x: 46.04, u: 0.9 });
    // Deep overlap from the first tick — still nothing before 3000 ms.
    // (Three ticks, not two: the tick at exactly 3000.0 ms can land a
    // fraction under it in float arithmetic, and the immunity is strict.)
    const out = stepTicks(state, [a, b], 0, 179);
    expect(out.entries).toHaveLength(0);
    expect(out.elapsedMs).toBeLessThan(3000);
    const after = stepTicks(state, [a, b], out.elapsedMs, 3);
    expect(ofType(after.entries, 'scrape-warning')).toHaveLength(1);
    expect(after.entries[0].timeMs).toBeGreaterThanOrEqual(3000);
  });
});

describe('raceIncidents — trace tangles: meta only, last entrant at fault', () => {
  /** Two rigs at the south meta, abreast on the tight line. */
  function metaPair(): { a: IncidentRigPose; b: IncidentRigPose } {
    return {
      a: rigPose('player', { name: 'You', x: 48, z: 40, heading: 0, s: 150, u: 0.2, zone: 'meta', meta: 'south' }),
      b: rigPose('rival-b', { name: 'Rufus of the Russata', x: 49, z: 40, heading: 0, s: 151, u: 0.2, zone: 'meta', meta: 'south' }),
    };
  }

  test('a tangle fires at a meta on the rig that entered the tight band last', () => {
    const state = createIncidentStewardState('league');
    const { a, b } = metaPair();
    let elapsedMs = 4000;
    let out = stepTicks(state, [a, b], elapsedMs, 2);
    elapsedMs = out.elapsedMs;
    // A enters the tight band first (u 0.2 → 0.9).
    a.u = 0.9;
    out = stepTicks(state, [a, b], elapsedMs, 3);
    elapsedMs = out.elapsedMs;
    expect(out.entries).toHaveLength(0);
    // B enters later (u 0.2 → 0.9): both on the tight line, abreast.
    b.u = 0.9;
    out = stepTicks(state, [a, b], elapsedMs, 1);
    elapsedMs = out.elapsedMs;
    const strains = ofType(out.entries, 'trace-strain');
    expect(strains).toHaveLength(1);
    // Hold the contest for the warning's 0.6 s.
    out = stepTicks(state, [a, b], elapsedMs, 40);
    const tangles = ofType(out.entries, 'trace-tangle');
    expect(tangles).toHaveLength(1);
    expect(tangles[0].atFaultId).toBe('rival-b');
    expect(tangles[0].otherId).toBe('player');
    expect(tangles[0].place).toBe('south meta');
    // The tangle's effects: the rig at fault is dragged wide (steering
    // authority cut, outward bias) and slowed; the other takes at most
    // the scrape effect.
    const effects = stepIncidentSteward(state, { rigs: [a, b], rung: 'league', elapsedMs: out.elapsedMs, lap: 1 }).effects;
    expect(effects.get('rival-b')?.dragScale).toBe(RACE_INCIDENT_CONFIG.tangleDragScale);
    expect(effects.get('rival-b')?.steerScale).toBe(RACE_INCIDENT_CONFIG.tangleSteerScale);
    expect(effects.get('rival-b')?.steerBias).not.toBe(0);
    expect(effects.get('player')?.dragScale).toBe(RACE_INCIDENT_CONFIG.scrapeDragScale);
    expect(effects.get('player')?.steerScale).toBe(1);
    expect(effects.get('player')?.steerBias).toBe(0);
  });

  test('the same overlap on a straight produces at most a scrape, never a tangle', () => {
    const state = createIncidentStewardState('league');
    const { a, b } = metaPair();
    a.zone = 'straight';
    b.zone = 'straight';
    a.meta = null;
    b.meta = null;
    a.u = 0.9;
    b.u = 0.9;
    const out = stepTicks(state, [a, b], 4000, 60);
    expect(ofType(out.entries, 'trace-strain')).toHaveLength(0);
    expect(ofType(out.entries, 'trace-tangle')).toHaveLength(0);
    // The overlap is real (centres 1.0 apart) — the scrape still fires.
    expect(ofType(out.entries, 'scrape-warning')).toHaveLength(1);
  });

  test('the vulnerability factor widens the tangle window (the 1D hook)', () => {
    // |Δu| = 1.5: outside the shipped 1.0 window, inside a doubled one.
    const wide = (): { a: IncidentRigPose; b: IncidentRigPose } => ({
      a: rigPose('player', { name: 'You', x: 48, z: 40, heading: 0, s: 150, u: 0.9, zone: 'meta', meta: 'south' }),
      b: rigPose('rival-b', { name: 'Rufus of the Russata', x: 50, z: 40, heading: 0, s: 151, u: 2.4, zone: 'meta', meta: 'south' }),
    });
    const state1 = createIncidentStewardState('league');
    const pair1 = wide();
    const out1 = stepTicks(state1, [pair1.a, pair1.b], 4000, 10);
    expect(ofType(out1.entries, 'trace-strain')).toHaveLength(0);
    const state2 = createIncidentStewardState('league');
    const pair2 = wide();
    const entries: RaceIncidentLogEntry[] = [];
    let elapsedMs = 4000;
    for (let i = 0; i < 10; i++) {
      const out = stepIncidentSteward(state2, { rigs: [pair2.a, pair2.b], rung: 'league', elapsedMs, lap: 1, vulnerabilityFactor: 2.0 });
      entries.push(...out.newLogEntries);
      elapsedMs += DT_MS;
    }
    expect(ofType(entries, 'trace-strain')).toHaveLength(1);
  });
});

describe('raceIncidents — immunity windows', () => {
  test('no second incident within 1 s of the last one resolving', () => {
    const state = createIncidentStewardState('league');
    const a = rigPose('player', { name: 'You' });
    const b = rigPose('rival-b', { name: 'Rufus of the Russata', x: 46.74, u: 1.5 });
    // B closes on A: warning arms ~tick 4 (~4067 ms), the catch fires
    // ~600 ms later (~4667 ms), runs 1.5 s (to ~6167 ms), then 1 s of
    // immunity (to ~7167 ms). The rigs stay overlapping deeply throughout.
    let elapsedMs = 4000;
    let out = stepTicks(state, [a, b], elapsedMs, 2);
    elapsedMs = out.elapsedMs;
    for (let i = 0; i < 4; i++) {
      b.x -= 0.075;
      b.u -= 0.075;
      out = stepTicks(state, [a, b], elapsedMs, 1);
      elapsedMs = out.elapsedMs;
    }
    for (let i = 0; i < 10; i++) {
      b.x -= 0.04;
      b.u -= 0.04;
      out = stepTicks(state, [a, b], elapsedMs, 1);
      elapsedMs = out.elapsedMs;
    }
    out = stepTicks(state, [a, b], elapsedMs, 40);
    elapsedMs = out.elapsedMs;
    expect(ofType(out.entries, 'hub-catch')).toHaveLength(1);
    out = stepTicks(state, [a, b], elapsedMs, 90);
    elapsedMs = out.elapsedMs;
    // The catch has resolved; the rigs are still overlapping deeply.
    expect(ofType(out.entries, 'hub-catch')).toHaveLength(0);
    // 30 more ticks (~0.5 s, to ~6933 ms) — still inside the 1 s
    // immunity: no fresh warning.
    out = stepTicks(state, [a, b], elapsedMs, 30);
    elapsedMs = out.elapsedMs;
    expect(ofType(out.entries, 'scrape-warning')).toHaveLength(0);
    // Past the immunity (~7167 ms): a fresh warning arms.
    out = stepTicks(state, [a, b], elapsedMs, 30);
    expect(ofType(out.entries, 'scrape-warning')).toHaveLength(1);
  });
});

describe('raceIncidents — District (A6): walls only, never rig-vs-rig', () => {
  test('a deep side-by-side overlap in District warns nothing and catches nothing', () => {
    const state = createIncidentStewardState('district');
    const a = rigPose('player', { name: 'You' });
    const b = rigPose('rival-b', { name: 'Rufus of the Russata', x: 46.04, u: 0.9 });
    const out = stepTicks(state, [a, b], 4000, 120, 'district');
    expect(out.entries).toHaveLength(0);
    const effects = stepIncidentSteward(state, { rigs: [a, b], rung: 'district', elapsedMs: out.elapsedMs, lap: 1 }).effects;
    expect(effects.get('player')?.warning).toBe('none');
    expect(effects.get('player')?.dragScale).toBe(1);
    expect(effects.get('rival-b')?.warning).toBe('none');
  });

  test('a wall scrape in District warns, then logs the incident, runs its duration, then clears', () => {
    const state = createIncidentStewardState('district');
    // Body centre 1.05 from the west flank (x 38.38): exactly touching.
    const a = rigPose('player', { name: 'You', x: 39.43, z: 0 });
    let elapsedMs = 4000;
    let out = stepTicks(state, [a], elapsedMs, 2, 'district');
    elapsedMs = out.elapsedMs;
    expect(ofType(out.entries, 'wall-warning')).toHaveLength(1);
    expect(out.entries[0].surface).toBe('wall');
    out = stepTicks(state, [a], elapsedMs, 40, 'district');
    elapsedMs = out.elapsedMs;
    const scrapes = ofType(out.entries, 'wall-scrape');
    expect(scrapes).toHaveLength(1);
    expect(scrapes[0].atFaultId).toBe('player');
    // The incident's effect: fouled on the wall (strong drag).
    const effects = stepIncidentSteward(state, { rigs: [a], rung: 'district', elapsedMs, lap: 1 }).effects;
    expect(effects.get('player')?.dragScale).toBe(RACE_INCIDENT_CONFIG.wallDragScale);
    // Steering clear does NOT cut the incident short (the hub catch's
    // pattern): the drag runs to its 1.5 s duration, then releases into
    // the 1 s post-incident immunity.
    a.x = 44.54;
    out = stepTicks(state, [a], elapsedMs, 2, 'district');
    const still = stepIncidentSteward(state, { rigs: [a], rung: 'district', elapsedMs: out.elapsedMs, lap: 1 }).effects;
    expect(still.get('player')?.dragScale).toBe(RACE_INCIDENT_CONFIG.wallDragScale);
    // Past the duration: the effects clear, and no second incident logs.
    out = stepTicks(state, [a], out.elapsedMs, 100, 'district');
    const clear = stepIncidentSteward(state, { rigs: [a], rung: 'district', elapsedMs: out.elapsedMs, lap: 1 }).effects;
    expect(clear.get('player')?.dragScale).toBe(1);
    expect(clear.get('player')?.warningKind).toBeNull();
    expect(ofType(out.entries, 'wall-scrape')).toHaveLength(0);
  });

  test('the spina tip box is NOT a wall surface (the driven route passes through it)', () => {
    const state = createIncidentStewardState('district');
    // Body at (52.34, 36), heading north — the nose sits at z 33.98,
    // inside the spina tip box (x 51.5–53.18, z −13–38.72), exactly the
    // pose the old measure warned on. The body is clear of the ring, so
    // the corrected body-only, ring-only measure warns nothing: the box
    // is a roll-path planning exclusion, not a driven surface.
    const a = rigPose('player', { name: 'You', x: 52.34, z: 36, heading: 0 });
    const out = stepTicks(state, [a], 4000, 42, 'district');
    expect(out.entries).toHaveLength(0);
  });
});

describe('raceIncidents — the log, in plain language', () => {
  test('every entry formats with the right place, lap, names, and fault', () => {
    const base: RaceIncidentLogEntry = {
      tick: 100,
      timeMs: 12345,
      lap: 1,
      place: 'south meta',
      type: 'trace-tangle',
      atFaultId: 'player',
      atFaultName: 'You',
      otherId: 'rival-b',
      otherName: 'Rufus of the Russata',
      surface: null,
    };
    expect(formatRaceIncidentLogEntry(base)).toBe(
      'Lap 1, south meta: you tangled with Rufus of the Russata (your fault)',
    );
    expect(formatRaceIncidentLogEntry({ ...base, atFaultId: 'rival-b', atFaultName: 'Rufus of the Russata', otherId: 'player', otherName: 'You' })).toBe(
      'Lap 1, south meta: Rufus of the Russata tangled with you (their fault)',
    );
    expect(formatRaceIncidentLogEntry({ ...base, type: 'hub-catch' })).toBe(
      'Lap 1, south meta: you caught wheels with Rufus of the Russata (your fault)',
    );
    expect(formatRaceIncidentLogEntry({ ...base, type: 'scrape-warning' })).toBe(
      'Lap 1, south meta: you scraped wheels with Rufus of the Russata — warning, steer clear',
    );
    expect(formatRaceIncidentLogEntry({ ...base, type: 'trace-strain' })).toBe(
      'Lap 1, south meta: you strained traces with Rufus of the Russata — warning, give room',
    );
    expect(formatRaceIncidentLogEntry({ ...base, type: 'wall-scrape', otherId: null, otherName: null, surface: 'wall', place: 'the straight' })).toBe(
      'Lap 1, the straight: you hit the wall',
    );
    expect(formatRaceIncidentLogEntry({ ...base, type: 'wall-warning', otherId: null, otherName: null, surface: 'wall', place: 'north meta' })).toBe(
      'Lap 1, north meta: you scraped the wall — warning, steer clear',
    );
    // Rival vs rival: the short possessive.
    expect(formatRaceIncidentLogEntry({
      ...base,
      atFaultId: 'rival-c',
      atFaultName: 'Tiberius of the Russata',
      otherId: 'rival-d',
      otherName: 'Aulus of the Albata',
    })).toBe(
      "Lap 1, south meta: Tiberius of the Russata tangled with Aulus of the Albata (Tiberius's fault)",
    );
  });

  test('the effects map covers every rig, defaulting when nothing applies', () => {
    const state = createIncidentStewardState('league');
    const a = rigPose('player', { name: 'You' });
    const b = rigPose('rival-b', { name: 'Rufus of the Russata', x: 46.74, u: 1.5 });
    const out = stepIncidentSteward(state, { rigs: [a, b], rung: 'league', elapsedMs: 4000, lap: 1 });
    expect(out.effects.size).toBe(2);
    for (const effects of out.effects.values()) {
      expect(effects.warning).toBe('none');
      expect(effects.warningKind).toBeNull();
      expect(effects.dragScale).toBe(1);
      expect(effects.steerScale).toBe(1);
      expect(effects.steerBias).toBe(0);
    }
    expect(out.newLogEntries).toHaveLength(0);
  });
});

describe('raceIncidents — the meta zone, from the circuit data', () => {
  test('the route zone reads meta at the hairpins and straight between them', () => {
    // s = 10: the northbound straight. s = 75: the north hairpin.
    // s = 120: the southbound straight. s = 150: the south hook.
    expect(incidentZoneForRig(1, 10, 0).zone).toBe('straight');
    expect(incidentZoneForRig(1, 10, 0).meta).toBeNull();
    const north = incidentZoneForRig(1, 75, -26);
    expect(north.zone).not.toBe('straight');
    expect(north.meta).toBe('north');
    expect(incidentZoneForRig(1, 120, 0).zone).toBe('straight');
    const south = incidentZoneForRig(1, 150, 40);
    expect(south.zone).not.toBe('straight');
    expect(south.meta).toBe('south');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The soak — simulated full races with the steward wired in, exactly as the
// scene wires it: drive (warning fed from the previous tick's steward run)
// → advanceChariot (drag / steer from the same effects) → separation → the
// steward steps on the post-separation poses. The harness mirrors the 1B2
// soak (same formation, roll, fixed 1/60 step, seeds 11–30) so the incident
// numbers are comparable with the lap-time / pass numbers 1B2 pinned.
// Dev-only: this file is a test, never imported by production code.
// ─────────────────────────────────────────────────────────────────────────────

const SOAK_DT = 1 / 60;
const SOAK_ROLL_SPEED = 5;
const SOAK_LINE_Z = 42.5;

interface IncidentSoakRig {
  id: string;
  competitor: RaceCompetitor;
  side: 1 | -1;
  row: number;
  endX: number;
  rolling: boolean;
  rollZ: number;
  motion: ReturnType<typeof createChariotMotion> | null;
  driver: RivalDriverState | null;
  crossingTime: number | null;
  lapStartTime: number | null;
  lapTimes: number[];
  finished: boolean;
}

interface IncidentSoakResult {
  simTime: number;
  /** Every log entry the steward produced, in tick order. */
  log: RaceIncidentLogEntry[];
  /** Incidents (hub-catch + trace-tangle + wall-scrape) per race. */
  incidents: number;
  /** Warnings (scrape-warning + trace-strain + wall-warning) per race. */
  warnings: number;
  /** Incidents per pair (sorted ids) / per rig (walls). */
  perPair: Map<string, number>;
  /** Mean steward CPU, ms per stepIncidentSteward call. */
  stewardMeanMs: number;
  stewardCalls: number;
  /** Deepest circle overlap left AFTER the separation pass each tick — the
      ceiling on what the steward can ever see as lateral overlap. */
  maxRestOverlap: number;
  /** Deepest pre-separation overlap (the contact the resolver had to clear). */
  maxOverlap: number;
  passes: { follower: string; leader: string }[];
  outlineViolations: number;
  lapTimes: { id: string; profile: number; driven: number[] }[];
}

/** One simulated race, the steward wired in as the scene wires it. Exported
    so the harness can be driven from a script as well as from the tests. */
export function runIncidentSoakRace(
  field: readonly RaceCompetitor[],
  rung: RaceRungId,
  seedBase: number,
  maxSimSeconds: number,
  laps = 1,
): IncidentSoakResult {
  const slots = resolveFormationSlots(field.length);
  const rigs: IncidentSoakRig[] = field.map((competitor, i) => {
    const slot = slots[i];
    return {
      id: competitor.id,
      competitor,
      side: slot.side,
      row: slot.row,
      endX: slot.endX,
      rolling: true,
      rollZ: SOAK_LINE_Z - (18.5 + slot.row * FORMATION_ROW_GAP),
      motion: null,
      driver: null,
      crossingTime: null,
      lapStartTime: null,
      lapTimes: [],
      finished: false,
    };
  });
  const steward = createIncidentStewardState(rung);
  let effects = new Map<string, IncidentRigEffects>();
  const log: RaceIncidentLogEntry[] = [];
  let clockOriginS: number | null = null;
  // The scene stops the steward at the PLAYER's finish (raceState leaves
  // 'racing'); there is no player in this soak, so the first finisher
  // ends the steward's window — a parked finisher past the line must not
  // collect warnings from rigs still racing, which the scene never sees.
  let stewardActive = true;
  let simTime = 0;
  let stewardNs = 0;
  let stewardCalls = 0;
  let maxRestOverlap = 0;
  let maxOverlap = 0;
  let outlineViolations = 0;
  const passes: { follower: string; leader: string }[] = [];
  const order = new Map<string, number>();
  const totalDistance = (rig: IncidentSoakRig): number => {
    if (rig.rolling) return -(SOAK_LINE_Z - rig.rollZ);
    if (!rig.driver) return -Infinity;
    return rig.driver.totalS;
  };
  const maxTicks = Math.ceil(maxSimSeconds / SOAK_DT);
  for (let tick = 0; tick < maxTicks; tick++) {
    simTime = tick * SOAK_DT;
    if (rigs.every((r) => r.finished)) break;
    for (const rig of rigs) {
      if (rig.finished) continue;
      if (rig.rolling) {
        rig.rollZ += SOAK_ROLL_SPEED * SOAK_DT;
        if (rig.rollZ >= SOAK_LINE_Z) {
          rig.rolling = false;
          rig.motion = createChariotMotion(rig.endX, SOAK_LINE_Z, 0);
          rig.motion.speed = SOAK_ROLL_SPEED;
          rig.driver = createRivalDriver({
            competitor: rig.competitor,
            side: rig.side,
            x: rig.endX,
            z: SOAK_LINE_Z,
            heading: 0,
            speed: SOAK_ROLL_SPEED,
            seed: seedBase + rig.row * 7 + (rig.side === 1 ? 3 : 0),
          });
          rig.crossingTime = simTime;
          rig.lapStartTime = simTime;
          // The race clock starts at the LEADER's crossing (1B).
          if (clockOriginS === null) clockOriginS = simTime;
        }
        continue;
      }
      const others: RivalRigSnapshot[] = [];
      for (const other of rigs) {
        if (other === rig || other.rolling || !other.driver || !other.motion) continue;
        const pos = rivalDriverRoutePosition(other.driver);
        others.push({
          id: other.id,
          s: pos.s,
          lap: pos.lap,
          u: pos.u,
          speed: other.motion.speed,
          paceTarget: other.driver.paceTarget,
          width: other.driver.width,
          side: other.side,
          x: other.motion.x,
          z: other.motion.z,
          heading: other.motion.heading,
        });
      }
      // The steward's effects from the previous tick — one frame of lag,
      // exactly as the scene has (the steward mounts after the chariots).
      const rigEffects = effects.get(rig.id) ?? DEFAULT_INCIDENT_RIG_EFFECTS;
      const input = driveRival(rig.driver!, {
        x: rig.motion!.x,
        z: rig.motion!.z,
        heading: rig.motion!.heading,
        speed: rig.motion!.speed,
        racing: true,
        warning: rigEffects.warning,
        others,
        dt: SOAK_DT,
      });
      const steeredInput = {
        throttle: input.throttle,
        steer: Math.max(-1, Math.min(1, input.steer * rigEffects.steerScale + rigEffects.steerBias)),
      };
      advanceChariot(rig.motion!, steeredInput, SOAK_DT, 1, rigEffects.dragScale);
      if (!isChariotInsideArena(rig.motion!)) outlineViolations++;
      const driverPos = rivalDriverRoutePosition(rig.driver!);
      if (driverPos.lap > rig.lapTimes.length) {
        rig.lapTimes.push(simTime - (rig.lapStartTime ?? simTime));
        rig.lapStartTime = simTime;
        if (rig.lapTimes.length >= laps) {
          rig.finished = true;
          stewardActive = false;
          effects = new Map();
        }
      }
    }
    // Separation (all pairs, once), exactly as the scene's resolver does.
    for (let i = 0; i < rigs.length; i++) {
      for (let j = i + 1; j < rigs.length; j++) {
        const a = rigs[i];
        const b = rigs[j];
        if (a.rolling || b.rolling || !a.motion || !b.motion) continue;
        const overlap = rigOverlap(
          { x: a.motion.x, z: a.motion.z, heading: a.motion.heading },
          { x: b.motion.x, z: b.motion.z, heading: b.motion.heading },
        );
        if (overlap > maxOverlap) maxOverlap = overlap;
        const pushes = resolveRigSeparation(
          { x: a.motion.x, z: a.motion.z, heading: a.motion.heading },
          { x: b.motion.x, z: b.motion.z, heading: b.motion.heading },
        );
        if (pushes) {
          a.motion.x += pushes.pushA.x;
          a.motion.z += pushes.pushA.z;
          b.motion.x += pushes.pushB.x;
          b.motion.z += pushes.pushB.z;
        }
      }
    }
    // Post-separation ("at rest") overlap: the ceiling on what the steward
    // can see as lateral overlap on its step below.
    let restOverlap = 0;
    for (let i = 0; i < rigs.length; i++) {
      for (let j = i + 1; j < rigs.length; j++) {
        const a = rigs[i];
        const b = rigs[j];
        if (a.rolling || b.rolling || !a.motion || !b.motion) continue;
        const rest = rigOverlap(
          { x: a.motion.x, z: a.motion.z, heading: a.motion.heading },
          { x: b.motion.x, z: b.motion.z, heading: b.motion.heading },
        );
        if (rest > restOverlap) restOverlap = rest;
      }
    }
    if (restOverlap > maxRestOverlap) maxRestOverlap = restOverlap;
    // The steward, on the post-separation poses — the scene's order — and
    // only while the race is live (see stewardActive above).
    if (clockOriginS !== null && stewardActive) {
      const poses: IncidentRigPose[] = [];
      for (const rig of rigs) {
        if (rig.rolling || !rig.driver || !rig.motion) continue;
        const pos = rivalDriverRoutePosition(rig.driver);
        const zone = incidentZoneForRig(rig.side, pos.s, rig.motion.z);
        poses.push({
          id: rig.id,
          name: rig.competitor.name,
          isPlayer: false,
          x: rig.motion.x,
          z: rig.motion.z,
          heading: rig.motion.heading,
          speed: rig.motion.speed,
          width: rig.driver.width,
          s: pos.s,
          lap: pos.lap,
          u: pos.u,
          zone: zone.zone,
          meta: zone.meta,
        });
      }
      const elapsedMs = (simTime - clockOriginS) * 1000;
      const start = performance.now();
      const out = stepIncidentSteward(steward, { rigs: poses, rung, elapsedMs, lap: 1, vulnerabilityFactor: 1.0 });
      stewardNs += performance.now() - start;
      stewardCalls++;
      effects = out.effects;
      log.push(...out.newLogEntries);
    }
    // Pass detection (pairwise, with hysteresis — the 1B2 rule: a pass
    // counts only when the follower goes from more than a rig length
    // behind to more than a rig length ahead).
    for (let i = 0; i < rigs.length; i++) {
      for (let j = 0; j < rigs.length; j++) {
        if (i === j) continue;
        const a = rigs[i];
        const b = rigs[j];
        if (a.rolling || b.rolling) continue;
        const key = `${a.id}>${b.id}`;
        const gap = totalDistance(a) - totalDistance(b);
        const prev = order.get(key) ?? 0;
        if (prev < -RIVAL_RIG_LENGTH && gap > RIVAL_RIG_LENGTH) {
          passes.push({ follower: a.id, leader: b.id });
        }
        if (gap > RIVAL_RIG_LENGTH || gap < -RIVAL_RIG_LENGTH) order.set(key, gap);
      }
    }
  }
  const perPair = new Map<string, number>();
  let incidents = 0;
  let warnings = 0;
  for (const entry of log) {
    if (entry.type === 'hub-catch' || entry.type === 'trace-tangle' || entry.type === 'wall-scrape') {
      incidents++;
      const key = entry.otherId === null ? entry.atFaultId ?? '?' : [entry.atFaultId ?? '?', entry.otherId].sort().join('<');
      perPair.set(key, (perPair.get(key) ?? 0) + 1);
    } else {
      warnings++;
    }
  }
  return {
    simTime,
    log,
    incidents,
    warnings,
    perPair,
    stewardMeanMs: stewardCalls > 0 ? stewardNs / stewardCalls : 0,
    stewardCalls,
    maxRestOverlap,
    maxOverlap,
    passes,
    outlineViolations,
    lapTimes: rigs.map((r) => ({ id: r.id, profile: r.competitor.lapDurationMs / 1000, driven: r.lapTimes })),
  };
}

/** Every incident entry in a race's log has a preceding warning for the same pair / rig. */
function assertWarningFirst(log: RaceIncidentLogEntry[], context: string): void {
  const incidentTypes = new Set(['hub-catch', 'trace-tangle', 'wall-scrape']);
  const warningFor = (incident: RaceIncidentLogEntry): boolean => {
    const pairKey = (e: RaceIncidentLogEntry): string =>
      e.otherId === null ? (e.atFaultId ?? '?') : [e.atFaultId ?? '?', e.otherId].sort().join('<');
    return log.some((e) => e.tick < incident.tick && pairKey(e) === pairKey(incident) && e.type !== incident.type && !incidentTypes.has(e.type));
  };
  for (const entry of log) {
    if (incidentTypes.has(entry.type)) {
      expect(warningFor(entry), `${context}: ${entry.type} at tick ${entry.tick} has a preceding warning`).toBe(true);
    }
  }
}

describe('raceIncidents — the soak (20 simulated races, steward wired in)', () => {
  test('shipped fields: every rival finishes, warnings precede every incident, passes still happen, steward CPU is cheap', () => {
    // The incident-rate bound (§7 Q7), stated from measurement (seeds
    // 11–30, the queued south-meta field as it ships): bounded, not
    // zero, not a crash-fest. Measured this run: 30 incidents across 20
    // races, max 6 in one race, max 3 for one pair in one race — all of
    // them League (District is walls-only and the body-vs-ring measure is
    // clean on the route, so shipped District races are incident-free).
    // The bounds below give the measured numbers headroom (8 / 4 / 60)
    // without letting a threshold change turn a race into a crash-fest.
    const district = resolveRungField('district');
    const league = resolveRungField('league');
    const passCounts = new Map<string, number>();
    let totalStewardMs = 0;
    let totalStewardCalls = 0;
    let maxRestOverlap = 0;
    let maxOverlap = 0;
    let totalIncidents = 0;
    let totalWarnings = 0;
    const perPairTotals = new Map<string, number>();
    let maxPerPairPerRace = 0;
    const perRace: { race: number; rung: string; incidents: number; warnings: number }[] = [];
    for (let race = 0; race < 20; race++) {
      const rung: RaceRungId = race % 2 === 0 ? 'district' : 'league';
      const field = rung === 'district' ? district : league;
      const result = runIncidentSoakRace(field, rung, 11 + race, 300);
      for (const pass of result.passes) {
        const key = `${pass.follower}>${pass.leader}`;
        passCounts.set(key, (passCounts.get(key) ?? 0) + 1);
      }
      totalStewardMs += result.stewardMeanMs * result.stewardCalls;
      totalStewardCalls += result.stewardCalls;
      if (result.maxRestOverlap > maxRestOverlap) maxRestOverlap = result.maxRestOverlap;
      if (result.maxOverlap > maxOverlap) maxOverlap = result.maxOverlap;
      totalIncidents += result.incidents;
      totalWarnings += result.warnings;
      for (const [pair, count] of result.perPair) {
        perPairTotals.set(pair, (perPairTotals.get(pair) ?? 0) + count);
        if (count > maxPerPairPerRace) maxPerPairPerRace = count;
      }
      perRace.push({ race, rung, incidents: result.incidents, warnings: result.warnings });
      for (const lt of result.lapTimes) {
        expect(lt.driven.length, `${lt.id} completes its lap (race ${race})`).toBeGreaterThanOrEqual(1);
      }
      expect(result.outlineViolations, `race ${race}: no outline breach`).toBe(0);
      assertWarningFirst(result.log, `race ${race}`);
    }
    // Passes still happen with the steward live (§5 tripwire: incident
    // effects must not prevent passing).
    const paceGap = (follower: RaceCompetitor, leader: RaceCompetitor) =>
      resolveDriverPaceCap(resolveRivalDriverProfile(follower)) - resolveDriverPaceCap(resolveRivalDriverProfile(leader));
    for (const field of [district, league]) {
      for (const follower of field) {
        for (const leader of field) {
          if (follower === leader) continue;
          if (paceGap(follower, leader) >= 0.15) {
            const key = `${follower.id}>${leader.id}`;
            expect(passCounts.get(key) ?? 0, `pass ${key} (pace gap ${paceGap(follower, leader).toFixed(3)} u/s)`).toBeGreaterThan(0);
          }
        }
      }
    }
    // Steward CPU, reported per step (the device measurement via the
    // profiler is a separate gate and is NOT claimed here).
    const stewardMeanMs = totalStewardCalls > 0 ? totalStewardMs / totalStewardCalls : 0;
    expect(stewardMeanMs, 'steward mean ms per tick').toBeLessThan(0.05);
    // The incident-rate bound (§7 Q7), asserted — see the comment at the
    // top of this test for the measured numbers the bounds come from.
    const maxPerRaceIncidents = Math.max(...perRace.map((r) => r.incidents));
    const districtIncidents = perRace.filter((r) => r.rung === 'district').reduce((sum, r) => sum + r.incidents, 0);
    expect(totalIncidents, 'incidents across 20 races: non-degenerate').toBeGreaterThan(0);
    expect(totalIncidents, 'incidents across 20 races: bounded').toBeLessThanOrEqual(60);
    expect(maxPerRaceIncidents, 'incidents in one race: bounded').toBeLessThanOrEqual(8);
    expect(maxPerPairPerRace, 'incidents for one pair in one race: bounded').toBeLessThanOrEqual(4);
    expect(districtIncidents, 'shipped District races: no wall incidents (the measure is clean on the route)').toBe(0);
    console.log(
      `[1C soak] 20 shipped-field races: incidents=${totalIncidents} warnings=${totalWarnings} ` +
        `maxPerRace=${maxPerRaceIncidents} maxPerPairPerRace=${maxPerPairPerRace} ` +
        `perPair=${[...perPairTotals.entries()].map(([k, v]) => `${k}:${v}`).join(',') || 'none'} ` +
        `maxOverlap=${maxOverlap.toFixed(3)} maxRestOverlap=${maxRestOverlap.toFixed(3)} stewardMeanMs=${stewardMeanMs.toFixed(4)} ` +
        `perRace=${perRace.map((r) => `${r.rung[0]}${r.race}:${r.incidents}i/${r.warnings}w`).join(' ')}`,
    );
  }, 180_000);

  test('aggressive fields: a faster rival behind a slower one, and the League field reversed, still produce a bounded incident count', () => {
    // The 1B2 pace-cap gate field (Aulus 58 s behind Rufus 64 s, same side)
    // and the League pool reversed (fastest last) — the aggressive profiles
    // the design's 2C test 6 asks for: the shipped formation is
    // fastest-first, so no shipped pairing has a pace gap ≥ 0.15.
    const rufus = RACE_COMPETITORS[0];
    const diodorus = RACE_COMPETITORS[1];
    const aulus = LEAGUE_POOL[0];
    const gate = runIncidentSoakRace([rufus, diodorus, aulus], 'league', 11, 600, 2);
    const reversed = runIncidentSoakRace([...resolveRungField('league')].reverse(), 'league', 21, 300);
    for (const [label, result] of [['gate', gate], ['reversed-league', reversed]] as const) {
      expect(result.outlineViolations, `${label}: no outline breach`).toBe(0);
      assertWarningFirst(result.log, label);
      for (const lt of result.lapTimes) {
        expect(lt.driven.length, `${label}: ${lt.id} completes its lap`).toBeGreaterThanOrEqual(1);
      }
    }
    // The bound for the aggressive fields (§7 Q7), stated from
    // measurement: the gate field (Aulus chasing Rufus) stays
    // incident-free (0 measured), the reversed League field produces a
    // few (4 measured) — bounded, and non-zero where the field is
    // genuinely aggressive.
    expect(gate.incidents, 'gate field: bounded').toBeLessThanOrEqual(4);
    expect(reversed.incidents, 'reversed League: bounded').toBeLessThanOrEqual(8);
    expect(reversed.incidents, 'reversed League: non-degenerate').toBeGreaterThan(0);
    console.log(
      `[1C soak] aggressive: gate incidents=${gate.incidents} warnings=${gate.warnings} ` +
        `perPair=${[...gate.perPair.entries()].map(([k, v]) => `${k}:${v}`).join(',') || 'none'} ` +
        `maxRestOverlap=${gate.maxRestOverlap.toFixed(3)} stewardMeanMs=${gate.stewardMeanMs.toFixed(4)} | ` +
        `reversed-league incidents=${reversed.incidents} warnings=${reversed.warnings} ` +
        `perPair=${[...reversed.perPair.entries()].map(([k, v]) => `${k}:${v}`).join(',') || 'none'} ` +
        `maxRestOverlap=${reversed.maxRestOverlap.toFixed(3)} stewardMeanMs=${reversed.stewardMeanMs.toFixed(4)}`,
    );
  }, 180_000);
});

describe('raceIncidents — the save boundary (no save writes in this slice)', () => {
  test('the steward and its scene wiring write no saves: no storage or save call anywhere in the incident code', () => {
    const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
    const steward = load('./raceIncidents.ts');
    for (const forbidden of ['saveProfile', 'localStorage', 'sessionStorage', 'indexedDB', 'settleRaceCompletion']) {
      expect(steward, `raceIncidents.ts must not reference ${forbidden}`).not.toContain(forbidden);
    }
    // RaceScene imports no storage service and never writes a profile
    // directly (its own header says so); the incident wiring adds no save.
    const scene = load('../components/3d/RaceScene.tsx');
    expect(scene, 'RaceScene must never call saveProfile').not.toContain('saveProfile(');
    expect(scene, 'RaceScene must never touch localStorage').not.toContain('localStorage');
  });
});
