/**
 * L21B — the herald's call for the city's visitors.
 *
 * The visitor schedule already has its own suite (`visitorSchedule.test.ts`), so
 * this one pins only what L21B adds: that the herald SPEAKS from that one
 * resolver, once per visitor per city day, in the resolver's own order, without
 * touching the save — plus the narrow wiring contract at the single App call site.
 *
 *   §A determinism — fresh ledgers on the same profile answer the same cries, and
 *      the resolver itself stays stable under repeated calls;
 *   §B empty days — a day with no arrivals says nothing and does not poison the
 *      ledger for a later day;
 *   §C the lifecycle — completion excludes (through the resolver), being seen does
 *      not, and a visitor outside its own arrival window is never announced;
 *   §D multi-arrival days — every eligible visitor is called, once, in catalogue
 *      order (the audit's open question: no arrival may be silently dropped);
 *   §E deduplication — repeated calls, unrelated profile updates, a city
 *      exit/re-entry and StrictMode's double effect invocation stay silent, and a
 *      later day speaks again;
 *   §F purity — the profile is not mutated, frozen profiles included;
 *   §G the copy — name and title, never the offer, its price or a rare item id;
 *   §H the App wiring — one `useRef` ledger, one gated effect, the existing
 *      `heraldCries` channel.  The repo's bun harness has no DOM renderer (there is
 *      no `@testing-library/react` dependency), so this is the narrowest source
 *      assertion that still checks the real integration points rather than a
 *      re-implementation of them.
 *
 * The signage half of this phase lives where the signs are pinned: the corrected
 * `rectsClear` assertions in `l17bLandmarkSigns.test.ts` / this repo's
 * `l17dLandmarkSignReliability.test.ts`, whose control test shifts the Barracks
 * sign 0.5 north onto its plinth and shows the corrected predicate refusing it.
 *
 * Pinned days below are the catalogue's own, measured from the shipped hash:
 * day 1, 4, 9 and 16 have no arrivals (day 4 and day 9 are days where a visitor's
 * hash matches but its window excludes it), day 5 is the bladesmith, day 8 the
 * armorer, day 15 BOTH in catalogue order, and day 21 the bladesmith again.
 *
 * Run with: `bun test src/utils/visitorHerald.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { createNewProfile } from '../services/storage';
import type { CityState, PlayerProfile } from '../types/game';
import { getVisitor, type Visitor } from '../data/visitors';
import { resolveVisitorSchedule } from './visitorSchedule';
import {
  createVisitorHeraldLedger,
  visitorHeraldCry,
  visitorHeraldKey,
} from './visitorHerald';

const APP_SOURCE = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

const BLADESMITH = getVisitor('numidian_bladesmith') as Visitor;
const ARMORER = getVisitor('campanian_armorer') as Visitor;

const fresh = (): PlayerProfile => createNewProfile('Tester');
const onDay = (day: number, extra: Partial<CityState> = {}): PlayerProfile =>
  ({ ...fresh(), city: { day, ...extra } }) as PlayerProfile;

/** The cry the herald's own template produces, so the copy is pinned once. */
const cryFor = (visitor: Visitor): string => visitorHeraldCry(visitor);

describe('§A determinism', () => {
  test('two fresh ledgers answer the same cries for the same profile', () => {
    const first = createVisitorHeraldLedger().announce(onDay(15));
    const second = createVisitorHeraldLedger().announce(onDay(15));
    expect(first).toEqual(second);
    expect(first).toEqual([cryFor(BLADESMITH), cryFor(ARMORER)]);
  });

  test('the resolver answers the same schedule on repeated calls', () => {
    const a = resolveVisitorSchedule(onDay(15));
    const b = resolveVisitorSchedule(onDay(15));
    expect(b).toEqual(a);
    expect(b.arrivals.map((arrival) => arrival.visitor.id)).toEqual([
      'numidian_bladesmith',
      'campanian_armorer',
    ]);
  });

  test('the key is the schedule rule`s own pair', () => {
    expect(visitorHeraldKey(15, 'numidian_bladesmith')).toBe('15:numidian_bladesmith');
    expect(visitorHeraldKey(1, 'emesan_weapon_trader')).toBe('1:emesan_weapon_trader');
  });
});

describe('§B empty days', () => {
  test('a day with no arrivals says nothing', () => {
    expect(resolveVisitorSchedule(onDay(1)).arrivals).toEqual([]);
    expect(createVisitorHeraldLedger().announce(onDay(1))).toEqual([]);
  });

  test('an empty day does not poison the ledger for a later eligible day', () => {
    const ledger = createVisitorHeraldLedger();
    expect(ledger.announce(onDay(1))).toEqual([]);
    expect(ledger.announce(onDay(16))).toEqual([]);
    expect(ledger.announce(onDay(5))).toEqual([cryFor(BLADESMITH)]);
  });
});

describe('§C the lifecycle', () => {
  test('a completed visitor is excluded by the resolver, so it is not announced', () => {
    const completed = onDay(15, { completedVisitors: ['numidian_bladesmith'] });
    expect(createVisitorHeraldLedger().announce(completed)).toEqual([cryFor(ARMORER)]);
    const both = onDay(15, {
      completedVisitors: ['numidian_bladesmith', 'campanian_armorer'],
    });
    expect(createVisitorHeraldLedger().announce(both)).toEqual([]);
  });

  test('being seen is not completion: a seen visitor is still announced', () => {
    const seen = onDay(15, { seenVisitors: ['numidian_bladesmith'] });
    expect(createVisitorHeraldLedger().announce(seen)).toEqual([
      cryFor(BLADESMITH),
      cryFor(ARMORER),
    ]);
  });

  test('a visitor outside its own arrival window is never announced', () => {
    // `fnv1a('4:campanian_armorer') % 4 === 0` and `fnv1a('9:emesan_weapon_trader')
    // % 5 === 0`, but the armorer's window opens on day 6 and the trader's on 24,
    // so the hash alone must not put them in the city.
    expect(resolveVisitorSchedule(onDay(4)).arrivals).toEqual([]);
    expect(createVisitorHeraldLedger().announce(onDay(4))).toEqual([]);
    expect(resolveVisitorSchedule(onDay(9)).arrivals).toEqual([]);
    expect(createVisitorHeraldLedger().announce(onDay(9))).toEqual([]);
  });
});

describe('§D multi-arrival days', () => {
  test('every eligible visitor is called once, in the resolver`s own order', () => {
    const schedule = resolveVisitorSchedule(onDay(15));
    const cries = createVisitorHeraldLedger().announce(onDay(15));
    expect(schedule.arrivals).toHaveLength(2);
    expect(cries).toHaveLength(schedule.arrivals.length);
    expect(cries).toEqual(schedule.arrivals.map((arrival) => visitorHeraldCry(arrival.visitor)));
    // The resolver's order is the catalogue's; the herald adds no order of its own.
    expect(cries[0]).toContain(BLADESMITH.name);
    expect(cries[1]).toContain(ARMORER.name);
  });
});

describe('§E deduplication', () => {
  test('a repeated call is silent, whether or not the first answer was used', () => {
    const ledger = createVisitorHeraldLedger();
    expect(ledger.announce(onDay(15))).toHaveLength(2);
    expect(ledger.announce(onDay(15))).toEqual([]);
    expect(ledger.announce(onDay(15))).toEqual([]);
  });

  test('an unrelated profile update on the same day does not re-announce', () => {
    const ledger = createVisitorHeraldLedger();
    ledger.announce(onDay(15));
    const richer = { ...onDay(15), gold: 999, fame: 42, xp: 7 } as PlayerProfile;
    expect(ledger.announce(richer)).toEqual([]);
    // A different literal object with the same day is the same city day.
    expect(ledger.announce(onDay(15))).toEqual([]);
  });

  test('leaving and re-entering the city on the same day does not re-announce', () => {
    const ledger = createVisitorHeraldLedger();
    const profile = onDay(15);
    expect(ledger.announce(profile)).toHaveLength(2);
    // The city unmounts and mounts again; the App's ledger survives (a `useRef`),
    // so the effect's second run asks the same ledger and hears nothing.
    expect(ledger.announce(profile)).toEqual([]);
  });

  test('StrictMode`s double effect invocation announces once', () => {
    const ledger = createVisitorHeraldLedger();
    const profile = onDay(15);
    // One render's effect body, run twice in a row on the same ref: the keys are
    // recorded before the cries are returned, so the second run is silent.
    const first = ledger.announce(profile);
    const second = ledger.announce(profile);
    expect(first).toHaveLength(2);
    expect(second).toEqual([]);
    expect([...first, ...second]).toHaveLength(2);
  });

  test('a later city day is eligible again', () => {
    const ledger = createVisitorHeraldLedger();
    expect(ledger.announce(onDay(15))).toHaveLength(2);
    // Day 16 has no arrivals; day 21 brings the bladesmith back.
    expect(ledger.announce(onDay(16))).toEqual([]);
    expect(ledger.announce(onDay(21))).toEqual([cryFor(BLADESMITH)]);
    // …and that same day stays silent afterwards.
    expect(ledger.announce(onDay(21))).toEqual([]);
  });
});

describe('§F purity', () => {
  test('the profile is not mutated', () => {
    const profile = onDay(15, { seenVisitors: ['emesan_weapon_trader'] });
    const before = JSON.stringify(profile);
    createVisitorHeraldLedger().announce(profile);
    expect(JSON.stringify(profile)).toEqual(before);
    expect(profile.city?.day).toBe(15);
    expect(profile.city?.seenVisitors).toEqual(['emesan_weapon_trader']);
    expect(profile.city?.completedVisitors).toBeUndefined();
  });

  test('a frozen profile is answerable', () => {
    const base = onDay(15);
    const frozenCity = Object.freeze({ ...base.city });
    const frozen = Object.freeze({ ...base, city: frozenCity }) as PlayerProfile;
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.city)).toBe(true);
    expect(createVisitorHeraldLedger().announce(frozen)).toEqual([
      cryFor(BLADESMITH),
      cryFor(ARMORER),
    ]);
  });

  test('the returned cries are a fresh array the caller may keep', () => {
    const ledger = createVisitorHeraldLedger();
    const cries = ledger.announce(onDay(15));
    cries.push('tampered');
    expect(ledger.announce(onDay(15))).toEqual([]);
  });

  test('totality: a legacy save and a null profile are silent, not throws', () => {
    expect(createVisitorHeraldLedger().announce({} as PlayerProfile)).toEqual([]);
    expect(createVisitorHeraldLedger().announce(null)).toEqual([]);
    expect(createVisitorHeraldLedger().announce(undefined)).toEqual([]);
  });
});

describe('§G the copy', () => {
  test('the cry names the visitor by catalogue identity, in the herald`s voice', () => {
    expect(cryFor(BLADESMITH)).toBe(
      'The herald cries: Hanno of Cirta, the Wandering Bladesmith, walks the city today!'
    );
    expect(cryFor(BLADESMITH)).toContain(BLADESMITH.name);
    expect(cryFor(BLADESMITH)).toContain(BLADESMITH.title);
    expect(cryFor(ARMORER)).toContain(ARMORER.name);
    expect(cryFor(ARMORER)).toContain(ARMORER.title);
  });

  test('the cry never reveals the day`s offer, its price or a rare item', () => {
    const cries = createVisitorHeraldLedger().announce(onDay(15));
    const schedule = resolveVisitorSchedule(onDay(15));
    const offered = schedule.arrivals.flatMap((arrival) => [
      arrival.offerItemId,
      arrival.offerPartId,
    ]).filter((id): id is string => typeof id === 'string' && id.length > 0);
    expect(offered.length).toBeGreaterThan(0);
    for (const cry of cries) {
      for (const id of offered) expect(cry).not.toContain(id);
      for (const visitor of [BLADESMITH, ARMORER]) {
        for (const poolId of visitor.offer.pool) expect(cry).not.toContain(poolId);
        expect(cry).not.toContain(visitor.offer.summary);
        expect(cry).not.toContain(visitor.id);
      }
      expect(cry).not.toContain('gold');
      expect(cry).not.toContain('finish_ventive');
    }
  });
});

describe('§H the App wiring', () => {
  test('one in-memory ledger, held in a ref', () => {
    expect(APP_SOURCE).toContain(
      'const visitorHeraldRef = useRef(createVisitorHeraldLedger());'
    );
    const announcements = APP_SOURCE.match(/visitorHeraldRef\.current\.announce\(/g) ?? [];
    expect(announcements).toHaveLength(1);
  });

  test('the one effect is gated to the city screen, a real profile and no oath beat', () => {
    expect(APP_SOURCE).toContain(
      "if (currentScreen !== 'city_3d' || !profile || oathBeatMode) return;"
    );
    // It depends on all three, so a day turned by lodging (a `profile` update while
    // the city stays mounted) and the oath beat's release both re-run it.
    expect(APP_SOURCE).toContain(
      '  }, [currentScreen, profile, oathBeatMode]);'
    );
    const effectBodies = APP_SOURCE.match(/const cries = visitorHeraldRef\.current\.announce\(profile\);/g) ?? [];
    expect(effectBodies).toHaveLength(1);
  });

  test('the cries go through the existing herald channel, appended not replaced', () => {
    expect(APP_SOURCE).toContain('setHeraldCries((previous) => [...previous, ...cries]);');
    // One toast surface, still fed by `heraldCries` — no second component was added.
    expect(APP_SOURCE).toContain('<HeraldToast cries={heraldCries}');
    // No timer, and no persistence, is introduced by the visitor call.
    const module = readFileSync(new URL('./visitorHerald.ts', import.meta.url), 'utf8');
    expect(module).not.toContain('setTimeout');
    expect(module).not.toContain('setInterval');
    expect(module).not.toContain('localStorage');
    expect(module).not.toContain('sessionStorage');
    expect(module).not.toContain('requestAnimationFrame');
    expect(module).not.toContain("from 'react'");
  });
});
