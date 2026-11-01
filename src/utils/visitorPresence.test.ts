// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { createNewProfile } from '../services/storage';
import { CITY_COLLIDERS, PLAYER_RADIUS, collidesWith, HUB_LOCATIONS, FAST_TRAVEL_ARRIVALS } from './cityCollisions';
import { resolveVisitorSchedule } from './visitorSchedule';
import {
  VISITOR_STALLS,
  VISITOR_INTERACTION_RADIUS,
  resolveVisitorPresence,
  resolveVisitorTarget,
  visitorPrompt,
} from './visitorPresence';
import { VISITORS } from '../data/visitors';
import type { PlayerProfile } from '../types/game';

const fresh = () => createNewProfile('Visitor test');
const onDay = (day: number, over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...fresh(),
  time: { total: (day - 1) * 7 },
  ...over,
});

describe('Living City L17 — visitor presence', () => {
  test('one frozen, finite, unique stall exists for every catalogue visitor', () => {
    expect(Object.keys(VISITOR_STALLS).sort()).toEqual(VISITORS.map(v => v.id).sort());
    expect(Object.isFrozen(VISITOR_STALLS)).toBe(true);
    const anchors = new Set<string>();
    for (const visitor of VISITORS) {
      const stall = VISITOR_STALLS[visitor.id];
      expect(Object.isFrozen(stall)).toBe(true);
      expect([stall.x, stall.z, stall.facing].every(Number.isFinite)).toBe(true);
      const key = `${stall.x}:${stall.z}`;
      expect(anchors.has(key)).toBe(false);
      anchors.add(key);
    }
  });

  test('visitor interaction discs are fully standable on the main collision registry', () => {
    expect(CITY_COLLIDERS.length).toBeGreaterThan(0);
    for (const visitor of VISITORS) {
      const { x, z } = VISITOR_STALLS[visitor.id];
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
      let blocked = 0;
      for (let dx = -VISITOR_INTERACTION_RADIUS; dx <= VISITOR_INTERACTION_RADIUS; dx += 0.1) {
        for (let dz = -VISITOR_INTERACTION_RADIUS; dz <= VISITOR_INTERACTION_RADIUS; dz += 0.1) {
          if (dx * dx + dz * dz > VISITOR_INTERACTION_RADIUS ** 2) continue;
          if (collidesWith(x + dx, z + dz, PLAYER_RADIUS, CITY_COLLIDERS)) blocked += 1;
        }
      }
      expect(blocked).toBe(0);
    }
  });

  test('no visitor prompt overlaps a building disc or fast-travel arrival', () => {
    for (const visitor of VISITORS) {
      const stall = VISITOR_STALLS[visitor.id];
      for (const hub of HUB_LOCATIONS) {
        const distance = Math.hypot(stall.x - hub.position[0], stall.z - hub.position[2]);
        expect(distance - hub.radius).toBeGreaterThanOrEqual(VISITOR_INTERACTION_RADIUS);
      }
      for (const [id, [x, z]] of Object.entries(FAST_TRAVEL_ARRIVALS)) {
        expect(`${visitor.id}:${id}`).toBeTruthy();
        expect(Math.hypot(stall.x - x, stall.z - z)).toBeGreaterThan(VISITOR_INTERACTION_RADIUS);
      }
    }
  });

  test('presence follows main timeState arrivals, and completed visitors have no body', () => {
    let sample: PlayerProfile | null = null;
    for (let day = 1; day <= 365 && !sample; day += 1) {
      const candidate = onDay(day);
      if (resolveVisitorSchedule(candidate).arrivals.length) sample = candidate;
    }
    expect(sample).not.toBeNull();
    const scheduled = resolveVisitorSchedule(sample!);
    expect(resolveVisitorPresence(sample!).map(p => p.visitor.id))
      .toEqual(scheduled.arrivals.map(a => a.visitor.id));
    const completedId = scheduled.arrivals[0].visitor.id;
    const completed = {
      ...sample!,
      records: { visitorsCompleted: [completedId] },
    };
    expect(resolveVisitorPresence(completed).some(p => p.visitor.id === completedId)).toBe(false);
  });

  test('seen visitors remain physically present; malformed stalls are skipped', () => {
    const sample = onDay(1);
    let candidate: PlayerProfile | null = null;
    for (let day = 1; day <= 365 && !candidate; day += 1) {
      const p = onDay(day);
      if (resolveVisitorSchedule(p).arrivals.length) candidate = p;
    }
    const p = candidate!;
    const id = resolveVisitorSchedule(p).arrivals[0].visitor.id;
    const seen = { ...p, records: { visitorsSeen: [id] } };
    expect(resolveVisitorPresence(seen).some(v => v.visitor.id === id)).toBe(true);
    expect(resolveVisitorPresence(p, { [id]: { x: Number.NaN, z: 0, facing: 0 } })).toEqual([]);
    expect(sample.time?.total).toBe(0);
  });

  test('nearest visitor wins only when strictly nearer than the competing hub', () => {
    const day = (() => {
      for (let d = 1; d <= 365; d += 1) {
        const p = onDay(d);
        const arrivals = resolveVisitorPresence(p);
        if (arrivals.length) return { p, arrivals };
      }
      throw new Error('No visitor arrivals found');
    })();
    const entry = day.arrivals[0];
    const pos: [number, number, number] = [entry.stall.x + 1, 0, entry.stall.z];
    const target = resolveVisitorTarget(pos, [entry]);
    expect(target?.presence.visitor.id).toBe(entry.visitor.id);
    expect(visitorPrompt(target!)).toContain(entry.visitor.name);
    expect(resolveVisitorTarget([entry.stall.x + 10, 0, entry.stall.z], [entry])).toBeNull();
    expect(resolveVisitorTarget([Number.NaN, 0, 0], [entry])).toBeNull();
    expect(resolveVisitorTarget(pos, [entry], {
      position: [entry.stall.x + 0.5, 0, entry.stall.z],
    } as any)).toBeNull();
  });
});
