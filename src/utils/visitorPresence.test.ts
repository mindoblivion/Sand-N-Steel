/**
 * Living City L17 — the visitors' physical presence: where they stand, who is
 * there today, and which target the interaction owns.
 *
 * What this suite pins, in the repo's two registers (behaviour for the pure
 * resolver, measured geometry for the city, and ordered source assertions for the
 * scene wiring this repo has no DOM renderer for):
 *
 *   §A  the stall table — one frozen, unique, finite anchor per catalogue visitor
 *       and no entry for anything else;
 *   §B  geometry — every interaction disc is FULLY STANDABLE on the real registry,
 *       every anchor is safely clear of every hub interaction disc and of every
 *       fast-travel arrival, the player can actually walk into each disc, and the
 *       audited (15, −6) armorer anchor is kept as a CONTROL showing the hijack the
 *       move removed;
 *   §C  availability — presence matches the L10 schedule on the pinned days (zero,
 *       one and THREE concurrent visitors), completion removes a body, being seen
 *       does not, a legacy save reads day one, and an unknown id or a missing stall
 *       is skipped rather than guessed;
 *   §D  target resolution — nearest wins, ties keep the hub, out-of-range answers
 *       nothing, a stale day-five list resolved against a day-eight profile cannot
 *       produce a target, and no visitor can hijack a hub action or an arrival;
 *   §E  purity and regression — the resolver is pure, the encounter and purchase
 *       contracts are untouched, and the scene renders the presence list, raises
 *       the named prompt, relabels the mobile action to VISIT, and still records an
 *       encounter ONLY through the panel's explicit selection.
 *
 * Run with: `bun test src/utils/visitorPresence.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CITY_COLLIDERS, PLAYER_RADIUS, collidesWith } from './collisionShapes';
import {
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  getNearbyHubLocation,
  resolveCityMovement,
} from './cityCollisions';
import { VISITORS } from '../data/visitors';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { resolveVisitorSchedule } from './visitorSchedule';
import {
  VISITOR_INTERACTION_RADIUS,
  VISITOR_STALLS,
  resolveVisitorPresence,
  resolveVisitorTarget,
  visitorPrompt,
  type VisitorPresence,
  type VisitorStall,
} from './visitorPresence';

/** Source with comments removed — prose can neither satisfy nor defeat a guard. */
const code = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const MODULE_CODE = code('./visitorPresence.ts');
const SCENE_CODE = code('../components/3d/city/CityHubScene.tsx');
const APP_CODE = code('../App.tsx');
const COLLISIONS_CODE = code('./cityCollisions.ts');
const ENCOUNTER_CODE = code('./visitorEncounter.ts');
const PURCHASE_CODE = code('./visitorPurchase.ts');

const fresh = (): PlayerProfile => createNewProfile('Tester');
const onDay = (
  day: number,
  extra: Partial<NonNullable<PlayerProfile['city']>> = {}
): PlayerProfile => ({ ...fresh(), city: { day, ...extra } }) as PlayerProfile;

const BLADESMITH = 'numidian_bladesmith';
const ARMORER = 'campanian_armorer';
const TRADER = 'emesan_weapon_trader';

const ids = (presence: VisitorPresence[]): string[] =>
  presence.map((entry) => entry.visitor.id);
const stallOf = (id: string): VisitorStall => VISITOR_STALLS[id];
const presenceFor = (id: string, stall: VisitorStall): VisitorPresence => ({
  visitor: VISITORS.find((visitor) => visitor.id === id)!,
  offerItemId: null,
  stall,
});

// ── §A. The stall table ────────────────────────────────────────────────────

describe('§A the stall table', () => {
  test('there is exactly one frozen stall per catalogue visitor, and no other id', () => {
    expect(Object.keys(VISITOR_STALLS).sort()).toEqual(VISITORS.map((v) => v.id).sort());
    expect(Object.getOwnPropertyNames(VISITOR_STALLS)).not.toContain('length');
    for (const visitor of VISITORS) expect(stallOf(visitor.id)).toBeDefined();
  });

  test('every stall is frozen, finite and unique', () => {
    const seen = new Set<string>();
    for (const visitor of VISITORS) {
      const stall = stallOf(visitor.id);
      expect(Object.isFrozen(stall)).toBe(true);
      expect(Number.isFinite(stall.x)).toBe(true);
      expect(Number.isFinite(stall.z)).toBe(true);
      expect(Number.isFinite(stall.facing)).toBe(true);
      // Two visitors must never share one pitch.
      const key = `${stall.x}:${stall.z}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(Object.isFrozen(VISITOR_STALLS)).toBe(true);
  });

  test('the anchors are the measured ones (the armorer moved, and why)', () => {
    expect(stallOf(BLADESMITH).x).toBe(-6);
    expect(stallOf(BLADESMITH).z).toBe(18);
    expect(stallOf(ARMORER).x).toBe(12.5);
    expect(stallOf(ARMORER).z).toBe(-6.5);
    expect(stallOf(TRADER).x).toBe(6.5);
    expect(stallOf(TRADER).z).toBe(-3.5);
    // The audited (15, −6) armorer anchor sat 2.236 from the bazaar's own
    // fast-travel arrival — inside its own 2.5 disc — so travelling there would
    // have raised the armorer instead of the store. The shipped anchor is clear.
    const [arrivalX, arrivalZ] = FAST_TRAVEL_ARRIVALS.general_store;
    expect(Math.hypot(arrivalX - 15, arrivalZ + 6)).toBeLessThan(VISITOR_INTERACTION_RADIUS);
    expect(
      Math.hypot(arrivalX - stallOf(ARMORER).x, arrivalZ - stallOf(ARMORER).z)
    ).toBeGreaterThan(VISITOR_INTERACTION_RADIUS);
  });

  test('the interaction disc is a person-sized radius, smaller than every doorway', () => {
    expect(VISITOR_INTERACTION_RADIUS).toBe(2.5);
    for (const hub of HUB_LOCATIONS) expect(hub.radius).toBeGreaterThan(VISITOR_INTERACTION_RADIUS);
  });
});

// ── §B. Geometry, measured on the real registry ────────────────────────────

describe('§B the anchors on the real city', () => {
  test('the baselines are preserved: 142 colliders, 21 hubs, 21 arrivals', () => {
    expect(CITY_COLLIDERS.length).toBe(142);
    expect(HUB_LOCATIONS.length).toBe(21);
    expect(Object.keys(FAST_TRAVEL_ARRIVALS).length).toBe(21);
  });

  test('every interaction disc is fully standable for the player radius', () => {
    for (const visitor of VISITORS) {
      const { x, z } = stallOf(visitor.id);
      let samples = 0;
      let blocked = 0;
      for (let dx = -VISITOR_INTERACTION_RADIUS; dx <= VISITOR_INTERACTION_RADIUS; dx += 0.1) {
        for (let dz = -VISITOR_INTERACTION_RADIUS; dz <= VISITOR_INTERACTION_RADIUS; dz += 0.1) {
          if (dx * dx + dz * dz > VISITOR_INTERACTION_RADIUS ** 2) continue;
          samples += 1;
          if (collidesWith(x + dx, z + dz, PLAYER_RADIUS, CITY_COLLIDERS)) blocked += 1;
        }
      }
      // 1,947 cells at 0.1 spacing, every one of them collision-free.
      expect(samples).toBe(1947);
      expect(blocked).toBe(0);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
  });

  test('no visitor disc reaches a hub interaction disc, or one of its approach rings', () => {
    for (const visitor of VISITORS) {
      const { x, z } = stallOf(visitor.id);
      for (const hub of HUB_LOCATIONS) {
        const distance = Math.hypot(x - hub.position[0], z - hub.position[2]);
        // The discs do not overlap AT ALL: the hub's rim is a full disc-radius
        // beyond the visitor's own. (Measured tightest: the bladesmith ↔ the town
        // gate's rim, 3.985.)
        expect(distance - hub.radius).toBeGreaterThanOrEqual(VISITOR_INTERACTION_RADIUS);
      }
    }
  });

  test('no fast-travel arrival lands inside a visitor disc', () => {
    for (const visitor of VISITORS) {
      const { x, z } = stallOf(visitor.id);
      for (const [id, [ax, az]] of Object.entries(FAST_TRAVEL_ARRIVALS)) {
        const distance = Math.hypot(x - ax, z - az);
        // A travel can never put the player inside a stall's prompt.
        expect(`${id}:${distance > VISITOR_INTERACTION_RADIUS}`).toBe(`${id}:true`);
      }
    }
  });

  test('the player can walk into every disc with the real resolver', () => {
    // 3.8 u/s at 1/60 s for one second, driven from a standable point six units
    // out. The approach that ends against the Colosseum's facade is not used: the
    // trader stands five units south of it, and that side is stone.
    const approaches: [string, number, number, number, number][] = [
      [BLADESMITH, -12, 18, 1, 0],
      [BLADESMITH, -6, 12, 0, 1],
      [ARMORER, 9, -6, 1, 0],
      [ARMORER, 8.5, -6.5, 1, 0],
      [ARMORER, 12.5, -0.5, 0, -1],
      [TRADER, 0.5, -3.5, 1, 0],
      [TRADER, 6.5, 2.5, 0, -1],
    ];
    for (const [id, startX, startZ, dx, dz] of approaches) {
      const { x, z } = stallOf(id);
      let pos: [number, number, number] = [startX, 0, startZ];
      for (let step = 0; step < 60; step += 1) {
        pos = resolveCityMovement(pos, dx, dz, 3.8, 1 / 60);
      }
      const distance = Math.hypot(pos[0] - x, pos[2] - z);
      expect(`${id}:${distance <= VISITOR_INTERACTION_RADIUS}`).toBe(`${id}:true`);
    }
  });

  test('CONTROL — the audited (15, −6) armorer anchor hijacked the bazaar', () => {
    // Replaying the pre-move anchor through the shipped rule at the store's own
    // arrival: the hub is in range (5.000 from its centre, radius 5.25) and the
    // armorer is nearer, so the armorer would have owned the prompt. This is the
    // measured reason the anchor moved, and it fails on the shipped table.
    const [ax, az] = FAST_TRAVEL_ARRIVALS.general_store;
    const at: [number, number, number] = [ax, 0, az];
    const hub = getNearbyHubLocation(at);
    expect(hub?.id).toBe('general_store');
    expect(Math.hypot(ax - 22, az + 5)).toBe(5);
    const old: VisitorPresence = presenceFor(ARMORER, { x: 15, z: -6, facing: 0 });
    expect(resolveVisitorTarget(at, [old], hub)?.presence.visitor.id).toBe(ARMORER);
    const shipped: VisitorPresence = presenceFor(ARMORER, stallOf(ARMORER));
    expect(resolveVisitorTarget(at, [shipped], hub)).toBeNull();
  });
});

// ── §C. Schedule and availability ──────────────────────────────────────────

describe('§C presence follows the L10 schedule', () => {
  test('the pinned days: none, one, and three concurrent visitors', () => {
    expect(ids(resolveVisitorPresence(onDay(1)))).toEqual([]);
    expect(ids(resolveVisitorPresence(onDay(5)))).toEqual([BLADESMITH]);
    expect(resolveVisitorPresence(onDay(5))[0].offerItemId).toBe('dirk_desert');
    // Day 6 is inside the armorer's window but fails its cadence.
    expect(ids(resolveVisitorPresence(onDay(6)))).toEqual([]);
    expect(ids(resolveVisitorPresence(onDay(8)))).toEqual([ARMORER]);
    expect(resolveVisitorPresence(onDay(8))[0].offerItemId).toBe('arms_manica');
    // Day 51 is the first day all three are in the city, in catalogue order.
    const all = resolveVisitorPresence(onDay(51));
    expect(ids(all)).toEqual([BLADESMITH, ARMORER, TRADER]);
    expect(all.map((entry) => entry.offerItemId)).toEqual([
      'dagger_pugio',
      'legs_greaves_bronze',
      'spatha_legion',
    ]);
  });

  test('presence is exactly the schedule, never a second opinion', () => {
    for (let day = 1; day <= 365; day += 1) {
      const schedule = resolveVisitorSchedule(onDay(day));
      expect(ids(resolveVisitorPresence(onDay(day)))).toEqual(
        schedule.arrivals.map((arrival) => arrival.visitor.id)
      );
    }
  });

  test('the ceiling is THREE concurrent visitors, on three days of the first year', () => {
    const counts: Record<number, number> = {};
    const threeDays: number[] = [];
    for (let day = 1; day <= 365; day += 1) {
      const count = resolveVisitorPresence(onDay(day)).length;
      counts[count] = (counts[count] ?? 0) + 1;
      if (count === 3) threeDays.push(day);
    }
    expect(counts).toEqual({ 0: 225, 1: 119, 2: 18, 3: 3 });
    expect(threeDays).toEqual([51, 99, 145]);
  });

  test('a legacy save reads day one: nobody in the city, and nothing rendered', () => {
    const legacy = { ...fresh() };
    expect(legacy.city).toBeUndefined();
    expect(resolveVisitorPresence(legacy)).toEqual([]);
    expect(resolveVisitorPresence(undefined)).toEqual([]);
  });

  test('a completed visitor is absent; a seen-but-not-completed one is still there', () => {
    expect(ids(resolveVisitorPresence(onDay(5, { completedVisitors: [BLADESMITH] })))).toEqual([]);
    expect(ids(resolveVisitorPresence(onDay(51, { completedVisitors: [ARMORER] })))).toEqual([
      BLADESMITH,
      TRADER,
    ]);
    // Being seen is not being done — L10's contract, unchanged by a body.
    expect(ids(resolveVisitorPresence(onDay(5, { seenVisitors: [BLADESMITH] })))).toEqual([
      BLADESMITH,
    ]);
  });

  test('an unknown id or a missing stall renders no body', () => {
    // A partial table drops the visitor it has no anchor for…
    const partial = { [BLADESMITH]: stallOf(BLADESMITH) };
    expect(ids(resolveVisitorPresence(onDay(51), partial))).toEqual([BLADESMITH]);
    // …and an empty table has nobody standing anywhere.
    expect(resolveVisitorPresence(onDay(51), {})).toEqual([]);
    // A malformed anchor is not a body either.
    const broken = { ...VISITOR_STALLS, [TRADER]: { x: NaN, z: 0, facing: 0 } };
    expect(ids(resolveVisitorPresence(onDay(51), broken))).toEqual([BLADESMITH, ARMORER]);
  });
});

// ── §D. Target resolution ──────────────────────────────────────────────────

describe('§D the one interaction-selection rule', () => {
  test('the nearest eligible visitor wins', () => {
    const near = presenceFor(BLADESMITH, { x: 1, z: 0, facing: 0 });
    const far = presenceFor(TRADER, { x: 2, z: 0, facing: 0 });
    const picked = resolveVisitorTarget([0, 0, 0], [far, near]);
    expect(picked?.presence.visitor.id).toBe(BLADESMITH);
    expect(picked?.distance).toBe(1);
  });

  test('an exact tie between two visitors keeps the earlier (catalogue) entry', () => {
    const first = presenceFor(BLADESMITH, { x: 1, z: 0, facing: 0 });
    const second = presenceFor(TRADER, { x: -1, z: 0, facing: 0 });
    expect(resolveVisitorTarget([0, 0, 0], [first, second])?.presence.visitor.id).toBe(BLADESMITH);
    expect(resolveVisitorTarget([0, 0, 0], [second, first])?.presence.visitor.id).toBe(TRADER);
  });

  test('out of range (or a non-finite position) answers no target at all', () => {
    const presence = [presenceFor(BLADESMITH, stallOf(BLADESMITH))];
    const { x, z } = stallOf(BLADESMITH);
    expect(resolveVisitorTarget([x + 2.5, 0, z], presence)?.distance).toBe(2.5);
    expect(resolveVisitorTarget([x + 2.51, 0, z], presence)).toBeNull();
    expect(resolveVisitorTarget([NaN, 0, z], presence)).toBeNull();
    expect(resolveVisitorTarget([x, 0, z], [])).toBeNull();
  });

  test('a tie with a hub, or a nearer hub, keeps the hub (documented rule)', () => {
    const presence = [presenceFor(BLADESMITH, { x: 1, z: 0, facing: 0 })];
    // Equal distance (both 1.0 away): the hub owns the action, exactly as it did
    // before L17.
    expect(resolveVisitorTarget([0, 0, 0], presence, { position: [1, 0, 0] })).toBeNull();
    // A nearer hub also wins.
    expect(resolveVisitorTarget([0, 0, 0], presence, { position: [0.5, 0, 0] })).toBeNull();
    // A strictly nearer visitor wins.
    expect(
      resolveVisitorTarget([0, 0, 0], presence, { position: [1.5, 0, 0] })?.presence.visitor.id
    ).toBe(BLADESMITH);
    // An unusable hub distance is no evidence that the visitor is nearer, so the
    // hub keeps the action: the rule fails safe towards the established behaviour.
    expect(resolveVisitorTarget([0, 0, 0], presence, { position: [NaN, 0, 0] })).toBeNull();
  });

  test('the real anchors raise their visitor when the player stands on them', () => {
    for (const visitor of VISITORS) {
      const presence = [presenceFor(visitor.id, stallOf(visitor.id))];
      const { x, z } = stallOf(visitor.id);
      const hub = getNearbyHubLocation([x, 0, z]);
      const target = resolveVisitorTarget([x, 0, z], presence, hub);
      expect(target?.presence.visitor.id).toBe(visitor.id);
      expect(target?.distance).toBe(0);
    }
  });

  test('a stale day-five body cannot answer a day-eight profile', () => {
    const { x, z } = stallOf(BLADESMITH);
    const at: [number, number, number] = [x, 0, z];
    const stale = resolveVisitorPresence(onDay(5));
    expect(resolveVisitorTarget(at, stale)?.presence.visitor.id).toBe(BLADESMITH);
    // The same position, re-resolved against the NEW profile's presence: the
    // bladesmith is out of town on day 8, so there is no target and no prompt.
    const current = resolveVisitorPresence(onDay(8));
    expect(resolveVisitorTarget(at, current, getNearbyHubLocation(at))).toBeNull();
  });

  test('a visitor can never hijack a hub action or a fast-travel arrival', () => {
    const presence = resolveVisitorPresence(onDay(51));
    expect(presence.length).toBe(3);
    for (const hub of HUB_LOCATIONS) {
      const centre: [number, number, number] = [hub.position[0], 0, hub.position[2]];
      expect(resolveVisitorTarget(centre, presence, hub)).toBeNull();
      const [ax, az] = FAST_TRAVEL_ARRIVALS[hub.id];
      const arrival: [number, number, number] = [ax, 0, az];
      expect(resolveVisitorTarget(arrival, presence, getNearbyHubLocation(arrival))).toBeNull();
    }
  });

  test('the prompt names the visitor it belongs to', () => {
    const presence = [presenceFor(BLADESMITH, stallOf(BLADESMITH))];
    const target = resolveVisitorTarget([-6, 0, 18], presence)!;
    expect(visitorPrompt(target)).toBe('Speak with Hanno of Cirta');
  });
});

// ── §E. Purity, contracts and wiring ───────────────────────────────────────

describe('§E purity and the existing contracts', () => {
  test('the resolver is pure: no storage, React, timer, wall clock or randomness', () => {
    expect(MODULE_CODE).not.toMatch(/\bDate\b|performance\.now/);
    expect(MODULE_CODE).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
    expect(MODULE_CODE).not.toMatch(/Math\.random/);
    expect(MODULE_CODE).not.toMatch(/localStorage|sessionStorage/);
    expect(MODULE_CODE).not.toMatch(/from 'react'|@react-three|three/);
    expect(MODULE_CODE).not.toMatch(/advanceCityDay|saveProfile/);
    expect(MODULE_CODE).not.toMatch(/seenVisitors\s*[:=]|completedVisitors\s*[:=]/);
  });

  test('it reads the schedule rather than reimplementing it', () => {
    const imports = Array.from(MODULE_CODE.matchAll(/from\s+'([^']+)'/g)).map((m) => m[1]);
    expect(imports).toEqual(['../types/game', '../data/visitors', './visitorSchedule']);
    expect(MODULE_CODE).toContain('resolveVisitorSchedule(profile)');
    // No second arrival rule: the cadence hash lives in visitorSchedule alone.
    expect(MODULE_CODE).not.toMatch(/fnv1a|cadence|window\.(from|to)/);
  });

  test('resolving presence mutates nothing, and a frozen profile is answerable', () => {
    const city = Object.freeze({ day: 51, completedVisitors: Object.freeze([]) as unknown as string[] });
    const profile = Object.freeze({ ...fresh(), city }) as PlayerProfile;
    const before = JSON.stringify(profile);
    const presence = resolveVisitorPresence(profile);
    expect(ids(presence)).toEqual([BLADESMITH, ARMORER, TRADER]);
    expect(JSON.stringify(profile)).toBe(before);
    // Fresh objects each call, so a caller cannot poison the next render.
    expect(resolveVisitorPresence(profile)[0]).not.toBe(presence[0]);
  });

  test('the encounter and purchase contracts are untouched and do not depend on presence', () => {
    expect(ENCOUNTER_CODE).not.toContain('visitorPresence');
    expect(PURCHASE_CODE).not.toContain('visitorPresence');
    // App still owns exactly one of each transaction, reading the newest profile.
    expect(APP_CODE.match(/recordVisitorEncounter\(/g)?.length).toBe(1);
    expect(APP_CODE.match(/purchaseVisitorOffer\(/g)?.length).toBe(1);
    expect(APP_CODE).toContain('recordVisitorEncounter(profileRef.current, visitorId)');
    expect(APP_CODE).toContain('purchaseVisitorOffer(profileRef.current, visitorId)');
    // And the scene validates nothing itself: one handler each, handed through.
    expect(SCENE_CODE.match(/onEncounter=\{onEncounterVisitor\}/g)?.length).toBe(1);
    expect(SCENE_CODE.match(/onPurchase=\{onPurchaseVisitor\}/g)?.length).toBe(1);
  });

  test('the city keeps visitors out of its hub, fast-travel and collision tables', () => {
    expect(COLLISIONS_CODE).not.toMatch(/visitor/i);
    for (const visitor of VISITORS) {
      expect(HUB_LOCATIONS.some((hub) => hub.id === visitor.id)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(FAST_TRAVEL_ARRIVALS, visitor.id)).toBe(false);
    }
    expect(SCENE_CODE).not.toContain('activeToday');
  });

  test('the scene renders the presence list and nobody else', () => {
    expect(SCENE_CODE).toContain('resolveVisitorPresence(playerProfile)');
    expect(SCENE_CODE).toContain('createAmbientFighter(');
    expect(SCENE_CODE.match(/\{visitorStalls\.map/g)?.length).toBe(2);
    // The rule is applied in ONE place, with the hub the scene already has.
    expect(SCENE_CODE.match(/resolveVisitorTarget\(/g)?.length).toBe(1);
    expect(SCENE_CODE).toContain('resolveVisitorTarget(playerPosRef.current, visitorPresenceRef.current, hub)');
    // The mount-once loop reads presence through a ref, never a closed-over list.
    expect(SCENE_CODE).toContain('visitorPresenceRef.current = visitorPresence');
  });

  test('the named prompt, the VISIT label and the one-panel rule', () => {
    expect(SCENE_CODE).toContain('visitorPrompt(nearbyVisitor)');
    expect(SCENE_CODE).toContain("[E / Space]");
    expect(SCENE_CODE).toContain('VISIT');
    // Only the selected target owns the prompt: the hub banner stands down.
    expect(SCENE_CODE).toContain('{nearbyLoc && !nearbyVisitor && (');
    // Proximity opens the panel; it never records the encounter itself.
    expect(SCENE_CODE).not.toMatch(/onEncounterVisitor\(/);
    expect(SCENE_CODE.match(/<VisitorPanel/g)?.length).toBe(1);
    // A visitor target is answered before an attack can ever fire.
    expect(SCENE_CODE).toContain('if (nearbyVisitor) {\n      handleVisit();');
  });
});
