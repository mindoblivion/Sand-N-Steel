/**
 * BET-1 — THE SHRINE'S ALMS: the Omen's replacement, pinned.
 *
 * The shrine's one action after the gambling cut: LEAVE ALMS. A fixed 25 gold
 * buys one Favour, once per exertion day — deterministic, no draw, no kind or
 * ill, no bout effect. The price is the Omen's old price on purpose: the
 * shrine's ritual keeps its shape (go to the shrine, leave the coin) with the
 * chance taken out of it.
 *
 * What this suite proves:
 *   §A  the transaction: 25 gold debited, +1 Favour, once per day, and a second
 *       alms on the same day refuses WITHOUT debiting;
 *   §B  the refusals: a purse under 25 gold refuses, and nothing is written;
 *   §C  determinism: no randomness anywhere on the alms path — the same
 *       profile, the same answer, every time; no omen, no luck, no bout effect;
 *   §D  the wiring: `App.handleLeaveAlms` is the one write path, and the shrine
 *       panel's one button calls it.
 *
 * Run with: `bun test src/utils/shrineAlms.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { PHASES_PER_DAY } from './timeState';
import {
  LUDI_ALMS_FAVOUR,
  SHRINE_ALMS_PRICE,
  almsResultLine,
  leaveShrineAlms,
  resolveLudiProgress,
} from './ludiCalendar';

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** A source file, comment-stripped, so prose can neither satisfy nor defeat a pin. */
const code = (relPath: string): string =>
  readFileSync(join(SRC_ROOT, relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const APP = 'App.tsx';
const CITY = 'components/3d/city/CityHubScene.tsx';

/** A profile on exertion day `day` (day 1 is `time.total` 0). */
const onDay = (day: number, overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Alms Giver'),
  time: { total: (day - 1) * PHASES_PER_DAY },
  ...overrides,
});

describe('BET-1 §A — leave alms: 25 gold, +1 Favour, once per day', () => {
  test('the price is 25 gold, the Omen’s old price', () => {
    expect(SHRINE_ALMS_PRICE).toBe(25);
  });

  test('the first alms of the day debits 25 gold and pays +1 Favour', () => {
    const start = onDay(5, { gold: 100 });
    const result = leaveShrineAlms(start);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.favourEarned).toBe(LUDI_ALMS_FAVOUR);
    expect(result.profile.gold).toBe(75);
    expect(result.profile.ludi?.favour).toBe(1);
    expect(result.profile.ludi?.lastAlmsDay).toBe(5);
    expect(result.profile.ludi?.day).toBe(5);
  });

  test('a second alms on the same day refuses and debits nothing', () => {
    const start = onDay(5, { gold: 100 });
    const first = leaveShrineAlms(start);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = leaveShrineAlms(first.profile);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('already-given-today');
    // A refusal carries no profile, so nothing can be saved from it.
    expect('profile' in second).toBe(false);
    // Tomorrow is a new alms-day.
    const tomorrow = leaveShrineAlms({
      ...first.profile,
      time: { total: 5 * PHASES_PER_DAY },
    });
    expect(tomorrow.ok).toBe(true);
    if (!tomorrow.ok) return;
    expect(tomorrow.profile.gold).toBe(50);
    expect(tomorrow.profile.ludi?.favour).toBe(2);
  });

  test('exactly 25 gold is enough; 24 is not', () => {
    expect(leaveShrineAlms(onDay(5, { gold: 25 })).ok).toBe(true);
    const refused = leaveShrineAlms(onDay(5, { gold: 24 }));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toBe('insufficient-gold');
  });
});

describe('BET-1 §B — the refusals write nothing', () => {
  test('a purse under the price refuses and the profile is untouched', () => {
    const start = onDay(5, { gold: 10 });
    const before = JSON.stringify(start);
    const result = leaveShrineAlms(start);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('insufficient-gold');
    expect(JSON.stringify(start)).toBe(before);
  });

  test('a null profile refuses without throwing', () => {
    const result = leaveShrineAlms(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-profile');
  });
});

describe('BET-1 §C — deterministic: no chance anywhere on the alms path', () => {
  test('the same profile always gets the same answer', () => {
    const start = onDay(5, { gold: 100 });
    const first = leaveShrineAlms(start);
    const second = leaveShrineAlms(start);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  test('the alms module draws nothing and touches no omen, no luck, no bout', () => {
    const calendar = code('utils/ludiCalendar.ts');
    expect(calendar).not.toContain('Math.random');
    expect(calendar).not.toContain('random');
    const result = leaveShrineAlms(onDay(5, { gold: 100 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The alms move gold and Favour only: no omen field, no luck field, no
    // bout counter moves.
    expect(result.profile.omen).toBeUndefined();
    expect(result.profile.luck).toBeUndefined();
    expect(result.profile.fightsWon).toBe(onDay(5).fightsWon);
    expect(result.profile.fame).toBe(onDay(5).fame);
  });

  test('the result line names the price and the Favour, and says nothing of chance', () => {
    const ok = leaveShrineAlms(onDay(5, { gold: 100 }));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const line = almsResultLine(ok);
    expect(line).toContain('25 gold');
    expect(line).toContain('+1 Favour');
    expect(line).not.toMatch(/omen|kind|ill|luck|chance|random/i);
    const refused = leaveShrineAlms(onDay(5, { gold: 0 }));
    expect(almsResultLine(refused)).toContain('Not enough gold');
  });
});

describe('BET-1 §D — the wiring: one handler, one button', () => {
  test('App owns the one write, through `leaveShrineAlms`, and saves only on success', () => {
    const app = code(APP);
    expect(app).toContain('const handleLeaveAlms = (): ShrineAlmsOutcome | null => {');
    expect(app).toContain('const result = leaveShrineAlms(profile);');
    expect(app).toContain('if (!result.ok) return result;');
    expect(app).toContain('onLeaveAlms={handleLeaveAlms}');
    // No omen handler, no toss handler, no betting state survives.
    for (const gone of [
      'handleOfferOmen',
      'handleDeclineOmen',
      'handleTossCoin',
      'tavernBettingOpen',
      'TavernBettingModal',
      'offerOmen',
      'declineOmen',
      'tossCoin',
    ]) {
      expect(app, gone).not.toContain(gone);
    }
  });

  test('the shrine panel’s one button calls the alms handler and nothing else', () => {
    const city = code(CITY);
    expect(city).toContain('data-leave-alms');
    expect(city).toContain('onClick={handleLeaveAlms}');
    expect(city).toContain('Leave alms ({SHRINE_ALMS_PRICE}g)');
    for (const gone of [
      'data-offer-omen',
      'data-decline-omen',
      'data-toss-coin',
      'data-fountain-panel',
      'handleOfferOmen',
      'handleDeclineOmen',
      'handleTossCoin',
      'liveOmen',
      'liveLuck',
    ]) {
      expect(city, gone).not.toContain(gone);
    }
    // One button in the alms controls, not three: Close + Leave alms.
    const start = city.indexOf('data-shrine-panel');
    const end = city.indexOf('<kbd', start);
    const panel = city.slice(start, end);
    expect(panel.match(/<button/g)?.length).toBe(2);
  });

  test('the alms-day still pays through `withLudiAlms`, unchanged', () => {
    // The transaction is the only new caller: the guard, the price and the
    // once-per-day rule all live in the calendar, not in the handler.
    const calendar = code('utils/ludiCalendar.ts');
    expect(calendar).toContain('export function leaveShrineAlms(');
    expect(calendar).toContain('withLudiAlms(debited)');
    expect(resolveLudiProgress(onDay(5)).lastAlmsDay).toBe(0);
  });
});
