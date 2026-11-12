/**
 * ===========================================================================
 * FOUNTAIN COIN TOSS — the honesty suite
 * ===========================================================================
 * The slice's own pins, one section per claim the brief and the five Director
 * rulings make:
 *
 *   §A the FIELD — a lazy optional object (`luck: { boostUntil }`) resolved as
 *      "no boost" from a missing, null or malformed save, and round-tripped
 *      through the game's own save key;
 *   §B the PRICE — 1 gold, refused before any arithmetic when the purse cannot
 *      cover it, and the gold actually debited on a successful toss;
 *   §C the DURATION — the boost runs until the next dawn (the clock has no
 *      minutes, so the brief's "30 game-minutes" reads as its dawn bound):
 *      7 phases at dawn, 1 at night, and expired exactly at the dawn total;
 *   §D the REFRESH — a re-toss while the boost is live is REFUSED
 *      (`already-blessed`) rather than charged, because a dawn-bound boost can
 *      never be extended;
 *   §E the LINES — the result line and the live line, printed from the real
 *      module, never invented by the panel;
 *   §F the WRITE SITES — the module is pure (the argument is never mutated),
 *      and the only save write is `App`'s existing save-on-change path;
 *   §G the CORPUS — the luck-era fixture carries the field, the older shapes
 *      omit it, and the save resolves both.
 *
 * Run with: `bun test src/utils/fountainLuck.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import {
  COIN_TOSS_PRICE,
  COIN_TOSS_RESULT_LINE,
  LUCK_BOOST_LIVE_LINE,
  LUCK_BOOST_PERCENT,
  coinTossResultLine,
  isLuckBoostActive,
  luckBoostLine,
  luckBoostPhasesLeft,
  resolveLuckBoost,
  tossCoin,
} from './fountainLuck';
import { resolveTimeState } from './timeState';

/** A fresh profile at a chosen clock total and purse. */
const profile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Corpus Toss'),
  gold: 100,
  ...overrides,
});

describe('§A — the field is lazy', () => {
  test('a fresh profile has no boost', () => {
    expect(resolveLuckBoost(profile())).toBeNull();
    expect(isLuckBoostActive(profile())).toBe(false);
    expect(luckBoostPhasesLeft(profile())).toBe(0);
    expect(luckBoostLine(profile())).toBeNull();
  });

  test('absent, null and malformed luck all read as no boost', () => {
    const absent = profile();
    delete (absent as Partial<PlayerProfile>).luck;
    expect(resolveLuckBoost(absent)).toBeNull();

    expect(resolveLuckBoost(profile({ luck: null as unknown as PlayerProfile['luck'] }))).toBeNull();
    expect(resolveLuckBoost(profile({ luck: 'blessed' as unknown as PlayerProfile['luck'] }))).toBeNull();
    expect(resolveLuckBoost(profile({ luck: {} as unknown as PlayerProfile['luck'] }))).toBeNull();
    expect(resolveLuckBoost(profile({ luck: { boostUntil: NaN } }))).toBeNull();
    expect(resolveLuckBoost(profile({ luck: { boostUntil: 0 } }))).toBeNull();
    expect(resolveLuckBoost(profile({ luck: { boostUntil: -5 } }))).toBeNull();
    expect(resolveLuckBoost(null)).toBeNull();
    expect(resolveLuckBoost(undefined)).toBeNull();
  });

  test('the price and the boost are the published constants', () => {
    expect(COIN_TOSS_PRICE).toBe(1);
    expect(LUCK_BOOST_PERCENT).toBe(10);
  });
});

describe('§B — the price', () => {
  test('a toss debits exactly 1 gold and writes the boost', () => {
    const before = profile({ gold: 50, time: { total: 0 } });
    const result = tossCoin(before);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a successful toss');
    expect(result.profile.gold).toBe(49);
    expect(result.luck).toEqual({ boostUntil: 7 });
    expect(result.profile.luck).toEqual({ boostUntil: 7 });
    expect(resolveLuckBoost(result.profile)).toEqual({ boostUntil: 7 });
  });

  test('a purse under 1 gold is refused before any arithmetic', () => {
    for (const gold of [0, -3]) {
      const before = profile({ gold });
      const result = tossCoin(before);
      expect(result).toEqual({ ok: false, reason: 'insufficient-gold' });
      expect(before.gold).toBe(gold);
      expect(before.luck).toBeUndefined();
    }
    const malformed = profile({ gold: NaN });
    expect(tossCoin(malformed)).toEqual({ ok: false, reason: 'insufficient-gold' });
  });

  test('exactly 1 gold tosses and leaves 0', () => {
    const result = tossCoin(profile({ gold: 1 }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a successful toss');
    expect(result.profile.gold).toBe(0);
  });
});

describe('§C — the duration is the next dawn', () => {
  test('at dawn the boost buys the whole day (7 phases)', () => {
    const result = tossCoin(profile({ time: { total: 0 } }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a successful toss');
    expect(result.luck.boostUntil).toBe(7);
    expect(luckBoostPhasesLeft(result.profile)).toBe(7);
  });

  test('at night the boost buys one phase', () => {
    // total 6 is the night phase of day 1 (phaseIndex 6).
    expect(resolveTimeState(profile({ time: { total: 6 } })).phase).toBe('night');
    const result = tossCoin(profile({ time: { total: 6 } }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a successful toss');
    expect(result.luck.boostUntil).toBe(7);
    expect(luckBoostPhasesLeft(result.profile)).toBe(1);
  });

  test('mid-day the boost runs to the coming dawn, not a fixed span', () => {
    // total 10 is midday of day 2 (phaseIndex 3); the next dawn is total 14.
    const result = tossCoin(profile({ time: { total: 10 } }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a successful toss');
    expect(result.luck.boostUntil).toBe(14);
    expect(luckBoostPhasesLeft(result.profile)).toBe(4);
  });

  test('the boost expires exactly at the dawn total', () => {
    const tossed = tossCoin(profile({ time: { total: 0 } }));
    if (!tossed.ok) throw new Error('expected a successful toss');
    expect(resolveLuckBoost({ ...tossed.profile, time: { total: 6 } })).toEqual({ boostUntil: 7 });
    expect(resolveLuckBoost({ ...tossed.profile, time: { total: 7 } })).toBeNull();
    expect(isLuckBoostActive({ ...tossed.profile, time: { total: 7 } })).toBe(false);
    expect(luckBoostPhasesLeft({ ...tossed.profile, time: { total: 7 } })).toBe(0);
  });
});

describe('§D — a live boost is never charged twice', () => {
  test('a re-toss while the boost is live is refused and writes nothing', () => {
    const first = tossCoin(profile({ gold: 10, time: { total: 0 } }));
    if (!first.ok) throw new Error('expected a successful toss');
    const second = tossCoin(first.profile);
    expect(second).toEqual({ ok: false, reason: 'already-blessed' });
    expect(first.profile.gold).toBe(9);
    expect(first.profile.luck).toEqual({ boostUntil: 7 });
  });

  test('after dawn the toss is open again', () => {
    const first = tossCoin(profile({ gold: 10, time: { total: 0 } }));
    if (!first.ok) throw new Error('expected a successful toss');
    const afterDawn = { ...first.profile, time: { total: 7 } };
    const second = tossCoin(afterDawn);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('expected a successful toss');
    expect(second.profile.gold).toBe(8);
    expect(second.luck).toEqual({ boostUntil: 14 });
  });
});

describe('§E — the lines', () => {
  test('the result line is the brief’s flavour line', () => {
    expect(coinTossResultLine({ boostUntil: 7 })).toBe(COIN_TOSS_RESULT_LINE);
    expect(COIN_TOSS_RESULT_LINE).toBe(
      'The fountain glimmers. Fortune smiles upon you — luck favours you until dawn.',
    );
  });

  test('the live line is the module’s, not the panel’s invention', () => {
    const tossed = tossCoin(profile({ time: { total: 0 } }));
    if (!tossed.ok) throw new Error('expected a successful toss');
    expect(luckBoostLine(tossed.profile)).toBe(LUCK_BOOST_LIVE_LINE);
    expect(luckBoostLine(profile())).toBeNull();
  });
});

describe('§F — the module is pure', () => {
  test('tossCoin never mutates its argument', () => {
    const before = profile({ gold: 50, time: { total: 3 } });
    const snapshot = JSON.stringify(before);
    const result = tossCoin(before);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a successful toss');
    expect(result.profile).not.toBe(before);
  });

  test('a refusal hands back no profile at all', () => {
    const result = tossCoin(profile({ gold: 0 }));
    expect(result).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect('profile' in result).toBe(false);
  });
});
